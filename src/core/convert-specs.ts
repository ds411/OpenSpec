/**
 * `openspec convert-specs`: rewrite markdown specs (`spec.md`) as Gherkin
 * feature files (`spec.feature`) and give every requirement an ID.
 *
 * Main specs are converted first. A change's MODIFIED, RENAMED and REMOVED
 * entries name the requirement they act on, and a Gherkin delta finds it by
 * ID, so each name is looked up in the converted main spec to get that ID.
 * Archived changes are history: they stay as they are.
 *
 * Every converted file is parsed again before it is written. A file that does
 * not parse, or that does not hold the expected number of rules, is reported
 * and left alone.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { buildCodeFenceMask } from './parsers/code-fence.js';
import {
  foldRequirementName,
  normalizeRequirementName,
  parseDeltaSpec,
  scenarioNameFromHeaderText,
} from './parsers/requirement-blocks.js';
import { parseFeature, ruleSource, type FeatureDocument, type SpecRule } from './gherkin/document.js';
import { formatRequirementId, isRequirementId } from './gherkin/ids.js';
import { withNextIdNumber } from './gherkin/id-store.js';
import { LEGACY_SPEC_FILE_NAME, SPEC_FILE_NAME } from '../utils/spec-discovery.js';
import { matchLineEnding } from '../utils/line-endings.js';


export interface ConvertSpecsOptions {
  dryRun?: boolean;
  /** Keep the markdown files after conversion. */
  keep?: boolean;
}

export interface ConvertedSpecFile {
  kind: 'spec' | 'delta';
  /** The change a delta belongs to. */
  change?: string;
  capability: string;
  source: string;
  target: string;
  requirements: number;
}

export interface ConvertedId {
  file: string;
  rule: string;
  id: string;
}

export interface ConvertNote {
  file: string;
  message: string;
}

export interface ConvertSpecsResult {
  converted: ConvertedSpecFile[];
  /** IDs given to requirements, in file order. */
  ids: ConvertedId[];
  /** Files that were not converted. */
  problems: ConvertNote[];
  /** Files that were converted but need a fix by hand. */
  warnings: ConvertNote[];
}

interface LegacyScenario {
  name: string;
  lines: string[];
}

interface LegacyRequirement {
  name: string;
  descriptionLines: string[];
  scenarios: LegacyScenario[];
}

interface DraftStep {
  keyword: string;
  text: string;
  argument: string[];
}

const RULE_INDENT = '  ';
const BODY_INDENT = '    ';
const STEP_INDENT = '      ';
const DOC_STRING_INDENT = '        ';

const REQUIREMENT_HEADER = /^###\s*Requirement:\s*(.+?)\s*$/i;
const SCENARIO_HEADER = /^####\s+(.*)$/;
const SECTION_HEADER = /^##(?!#)\s+(.+?)\s*$/;
const TITLE_HEADER = /^#(?!#)\s+(.+?)\s*$/;
const HEADING = /^#{1,6}\s+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/**
 * A line that would end a Gherkin description: a tag, a comment, or a keyword
 * line. Converted text that starts this way gets a backslash in front.
 */
const DESCRIPTION_BREAKER =
  /^(?:@|#|(?:Feature|Business Need|Ability|Background|Scenario Outline|Scenario Template|Scenario|Scenarios|Example|Examples|Rule):)/;

const BOLD_STEP = /^\*\*(GIVEN|WHEN|THEN|AND|BUT):?\*\*:?\s*(.*)$/i;
const PLAIN_STEP = /^(GIVEN|WHEN|THEN|AND|BUT|Given|When|Then|And|But)\s+(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;

export async function convertSpecs(
  projectRoot: string,
  options: ConvertSpecsOptions = {}
): Promise<ConvertSpecsResult> {
  const openspecDir = path.join(projectRoot, 'openspec');
  const specsDir = path.join(openspecDir, 'specs');
  const changesDir = path.join(openspecDir, 'changes');
  const result: ConvertSpecsResult = { converted: [], ids: [], problems: [], warnings: [] };
  const writes: Array<{ source: string; target: string; content: string }> = [];

  const mainSources = await findFiles(specsDir, LEGACY_SPEC_FILE_NAME);
  const changeSources: Array<{ change: string; capability: string; file: string; specsRoot: string }> = [];
  for (const change of await listActiveChanges(changesDir)) {
    const specsRoot = path.join(changesDir, change, 'specs');
    for (const { capability, file } of await findFiles(specsRoot, LEGACY_SPEC_FILE_NAME)) {
      changeSources.push({ change, capability, file, specsRoot });
    }
  }

  await withNextIdNumber(
    openspecDir,
    async (first) => {
      let next = first;
      const mainDocuments = new Map<string, FeatureDocument>();

      for (const { capability, file } of mainSources) {
        const target = path.join(path.dirname(file), SPEC_FILE_NAME);
        if (await exists(target)) {
          result.problems.push({
            file,
            message: `${path.basename(target)} already exists next to it. Merge the two by hand, then delete ${LEGACY_SPEC_FILE_NAME}.`,
          });
          continue;
        }
        const original = await fs.readFile(file, 'utf-8');
        const { title, descriptionLines, requirements } = readLegacySpec(original);
        const ids = requirements.map((_, i) => formatRequirementId(next + i));
        const content = renderFeature({
          name: cleanTitle(title) || leafName(capability),
          descriptionLines,
          rules: requirements.map((requirement, i) => renderRequirement(requirement, [ids[i]])),
        });
        const document = verify(content, requirements.length, file, result.problems);
        if (!document) continue;
        next += requirements.length;
        mainDocuments.set(capability, document);
        requirements.forEach((requirement, i) => result.ids.push({ file: target, rule: requirement.name, id: ids[i] }));
        result.converted.push({ kind: 'spec', capability, source: file, target, requirements: requirements.length });
        writes.push({ source: file, target, content: matchLineEnding(content, original) });
      }

      for (const { change, capability, file } of changeSources) {
        const target = path.join(path.dirname(file), SPEC_FILE_NAME);
        if (await exists(target)) {
          result.problems.push({
            file,
            message: `${path.basename(target)} already exists next to it. Merge the two by hand, then delete ${LEGACY_SPEC_FILE_NAME}.`,
          });
          continue;
        }
        const main = mainDocuments.get(capability) ?? (await readMainFeature(specsDir, capability));
        const original = await fs.readFile(file, 'utf-8');
        const warnings: ConvertNote[] = [];
        const delta = convertDelta(original, capability, main, next, (message) => warnings.push({ file: target, message }));
        const document = verify(delta.content, delta.rules, file, result.problems);
        if (!document) continue;
        next += delta.added.length;
        result.warnings.push(...warnings);
        delta.added.forEach(({ name, id }) => result.ids.push({ file: target, rule: name, id }));
        result.converted.push({ kind: 'delta', change, capability, source: file, target, requirements: delta.rules });
        writes.push({ source: file, target, content: matchLineEnding(delta.content, original) });
      }

      if (!options.dryRun) {
        for (const { source, target, content } of writes) {
          await fs.writeFile(target, content, 'utf-8');
          if (!options.keep) await fs.rm(source, { force: true });
        }
      }
      return { used: next - first, result: undefined };
    },
    { dryRun: options.dryRun }
  );

  return result;
}

/**
 * Parse the rendered text and check that it holds `expectedRules` rules. A
 * failure is recorded against the source file and the file is not written.
 */
function verify(
  content: string,
  expectedRules: number,
  source: string,
  problems: ConvertNote[]
): FeatureDocument | undefined {
  const document = parseFeature(content);
  if (document.errors.length > 0) {
    const first = document.errors[0];
    problems.push({
      file: source,
      message: `Converted text does not parse (line ${first.line}: ${first.message}). Convert this file by hand.`,
    });
    return undefined;
  }
  if (!document.feature || document.rules.length !== expectedRules) {
    problems.push({
      file: source,
      message: `Converted text has ${document.rules.length} rules, expected ${expectedRules}. Convert this file by hand.`,
    });
    return undefined;
  }
  return document;
}

// ---------------------------------------------------------------------------
// Reading markdown

interface MarkdownSection {
  /** The `## ` title, or null for the text above the first one. */
  title: string | null;
  lines: string[];
}

function splitSections(content: string): { title?: string; sections: MarkdownSection[] } {
  const lines = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const mask = buildCodeFenceMask(lines);
  const sections: MarkdownSection[] = [{ title: null, lines: [] }];
  let title: string | undefined;
  lines.forEach((line, i) => {
    const section = mask[i] ? null : line.match(SECTION_HEADER);
    if (section) {
      sections.push({ title: section[1].replace(/[ \t]+#+$/, '').trim(), lines: [] });
      return;
    }
    const heading = mask[i] ? null : line.match(TITLE_HEADER);
    if (heading && title === undefined && sections.length === 1) {
      title = heading[1].replace(/[ \t]+#+$/, '').trim();
      return;
    }
    sections[sections.length - 1].lines.push(line);
  });
  return { title, sections };
}

function readLegacySpec(content: string): {
  title?: string;
  descriptionLines: string[];
  requirements: LegacyRequirement[];
} {
  const { title, sections } = splitSections(content);
  const purpose = sections.filter((section) => section.title?.toLowerCase() === 'purpose');
  const description: string[] = purpose.flatMap((section) => [...trimBlankEdges(section.lines), '']);
  const requirements: LegacyRequirement[] = [];
  for (const section of sections) {
    if (section.title?.toLowerCase() === 'purpose') continue;
    if (section.title?.toLowerCase() === 'requirements') {
      const { preamble, blocks } = splitRequirements(section.lines);
      appendExtra(description, null, preamble);
      requirements.push(...blocks.map(({ name, lines }) => readRequirement(name, lines)));
      continue;
    }
    appendExtra(description, section.title, section.lines);
  }
  return { title, descriptionLines: description, requirements };
}

/** Text outside the Purpose and the requirements goes after the Purpose, under its heading. */
function appendExtra(description: string[], heading: string | null, lines: string[]): void {
  const body = trimBlankEdges(lines);
  if (body.length === 0) return;
  if (heading) description.push(`## ${heading}`, '');
  description.push(...body, '');
}

function splitRequirements(lines: string[]): {
  preamble: string[];
  blocks: Array<{ name: string; lines: string[] }>;
} {
  const mask = buildCodeFenceMask(lines);
  const preamble: string[] = [];
  const blocks: Array<{ name: string; lines: string[] }> = [];
  lines.forEach((line, i) => {
    const header = mask[i] ? null : line.match(REQUIREMENT_HEADER);
    if (header) {
      blocks.push({ name: normalizeRequirementName(header[1]), lines: [] });
      return;
    }
    if (blocks.length === 0) preamble.push(line);
    else blocks[blocks.length - 1].lines.push(line);
  });
  return { preamble, blocks };
}

function readRequirement(name: string, lines: string[]): LegacyRequirement {
  const mask = buildCodeFenceMask(lines);
  const descriptionLines: string[] = [];
  const scenarios: LegacyScenario[] = [];
  lines.forEach((line, i) => {
    const header = mask[i] ? null : line.match(SCENARIO_HEADER);
    if (header) {
      scenarios.push({ name: scenarioNameFromHeaderText(header[1]), lines: [] });
      return;
    }
    if (scenarios.length === 0) descriptionLines.push(line);
    else scenarios[scenarios.length - 1].lines.push(line);
  });
  return { name, descriptionLines, scenarios };
}

/**
 * A scenario's markdown as steps. A top-level bullet starts a step; a bold
 * `**WHEN**` (or GIVEN, THEN, AND, BUT) gives its keyword. Everything under a
 * step that is not a new step - nested bullets, fenced code, tables, wrapped
 * text - becomes the step's doc string, so nothing is lost.
 */
function readSteps(lines: string[]): DraftStep[] {
  const mask = buildCodeFenceMask(lines);
  const steps: DraftStep[] = [];
  const start = (content: string) => {
    const keyword = content.match(BOLD_STEP) ?? content.match(PLAIN_STEP);
    if (keyword) {
      steps.push({ keyword: titleCase(keyword[1]), text: keyword[2].trim(), argument: [] });
    } else {
      steps.push({ keyword: steps.length > 0 ? 'And' : '*', text: content.trim(), argument: [] });
    }
  };
  lines.forEach((line, i) => {
    const indent = line.match(/^[ \t]*/)![0].length;
    const content = line.trim();
    if (!mask[i] && content !== '' && indent <= 1) {
      const bullet = content.match(BULLET);
      if (bullet) return start(bullet[1]);
      if (BOLD_STEP.test(content) || steps.length === 0) return start(content);
    }
    if (steps.length === 0) {
      if (content === '') return;
      steps.push({ keyword: '*', text: 'the following', argument: [] });
    }
    steps[steps.length - 1].argument.push(line);
  });
  return steps;
}

// ---------------------------------------------------------------------------
// Writing Gherkin

function renderFeature(feature: {
  comments?: string[];
  name: string;
  descriptionLines: string[];
  rules: string[][];
}): string {
  const out: string[] = [];
  for (const comment of feature.comments ?? []) {
    out.push(comment.trim() === '' ? '#' : `# ${comment.replace(/^(\s*language\s*:)/i, '\\$1')}`.trimEnd());
  }
  out.push(`Feature: ${feature.name}`);
  out.push(...renderDescription(feature.descriptionLines, RULE_INDENT));
  for (const rule of feature.rules) {
    out.push('', ...rule);
  }
  return `${out.join('\n')}\n`;
}

/**
 * Markdown as a Gherkin description. Headings outside code fences become bold
 * lines, and any line Gherkin would read as a tag, comment or keyword gets a
 * backslash in front.
 */
function renderDescription(lines: string[], indent: string): string[] {
  const body = trimBlankEdges(dedentLines(lines));
  const mask = buildCodeFenceMask(body);
  const out: string[] = [];
  let blank = false;
  body.forEach((line, i) => {
    if (line.trim() === '') {
      // One blank line is enough between paragraphs; code keeps its own.
      if (!blank || mask[i]) out.push('');
      blank = true;
      return;
    }
    blank = false;
    let text = line;
    const heading = mask[i] ? null : line.trim().match(HEADING);
    if (heading) text = `**${heading[1]}**`;
    const lead = text.match(/^[ \t]*/)![0];
    const rest = text.slice(lead.length);
    if (DESCRIPTION_BREAKER.test(rest)) text = `${lead}\\${rest}`;
    out.push(`${indent}${text}`.trimEnd());
  });
  return out;
}

function renderRequirement(requirement: LegacyRequirement, tags: string[]): string[] {
  const out = [`${RULE_INDENT}${tags.map((tag) => `@${tag}`).join(' ')}`, `${RULE_INDENT}Rule: ${requirement.name}`];
  const description = trimBlankEdges(requirement.descriptionLines);
  // A requirement written as a bare header has its statement in the name.
  out.push(...renderDescription(description.length > 0 ? description : [requirement.name], BODY_INDENT));
  for (const scenario of requirement.scenarios) {
    out.push('', `${BODY_INDENT}Scenario: ${scenario.name}`.trimEnd());
    for (const step of readSteps(scenario.lines)) {
      out.push(`${STEP_INDENT}${step.keyword} ${step.text || '(no text)'}`);
      out.push(...renderDocString(step.argument));
    }
  }
  return out;
}

/**
 * A step's extra lines as a doc string. A single fenced code block keeps its
 * language as the doc string's media type; anything else is kept as markdown.
 */
function renderDocString(lines: string[]): string[] {
  let body = trimBlankEdges(dedentLines(lines));
  if (body.length === 0) return [];
  let mediaType = '';
  const fence = singleFence(body);
  if (fence) {
    mediaType = /^[\w.+-]+$/.test(fence.info) ? fence.info : '';
    body = fence.inner;
  }
  const escaped = body.map((line) => line.replace(/"""/g, '\\"\\"\\"'));
  return [
    `${DOC_STRING_INDENT}"""${mediaType}`,
    ...escaped.map((line) => (line.trim() === '' ? '' : `${DOC_STRING_INDENT}${line}`.trimEnd())),
    `${DOC_STRING_INDENT}"""`,
  ];
}

/** The content of `lines` when they are exactly one fenced code block. */
function singleFence(lines: string[]): { info: string; inner: string[] } | undefined {
  const open = lines[0].match(/^([ \t]*)(`{3,}|~{3,})\s*(.*)$/);
  if (!open || lines.length < 2) return undefined;
  const [, indent, marker] = open;
  const close = new RegExp(`^[ \\t]*${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`);
  for (let i = 1; i < lines.length; i++) {
    if (close.test(lines[i])) {
      if (i !== lines.length - 1) return undefined;
      const inner = lines.slice(1, i).map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line.trimStart()));
      return { info: open[3].trim().split(/\s+/)[0] ?? '', inner };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Deltas

interface ConvertedDelta {
  content: string;
  rules: number;
  added: Array<{ name: string; id: string }>;
}

function convertDelta(
  content: string,
  capability: string,
  main: FeatureDocument | undefined,
  firstId: number,
  warn: (message: string) => void
): ConvertedDelta {
  const { title, sections } = splitSections(content);
  const plan = parseDeltaSpec(content);
  const comments: string[] = [];
  const descriptionLines: string[] = [];
  for (const section of sections) {
    const key = section.title?.toLowerCase();
    if (key === 'purpose') {
      descriptionLines.push(...trimBlankEdges(section.lines), '');
      continue;
    }
    if (key && /^(added|modified|removed|renamed) requirements$/.test(key)) {
      const prose =
        key === 'renamed requirements'
          ? []
          : key === 'removed requirements'
            ? splitRequirements(section.lines).preamble.filter((line) => !/^\s*[-*+]\s*`?###\s*Requirement:/i.test(line))
            : splitRequirements(section.lines).preamble;
      if (trimBlankEdges(prose).length > 0) comments.push(`## ${section.title}`, ...trimBlankEdges(prose), '');
      continue;
    }
    const body = trimBlankEdges(section.lines);
    if (body.length === 0) continue;
    if (section.title) comments.push(`## ${section.title}`);
    comments.push(...body, '');
  }

  const lookup = (name: string): SpecRule | undefined => findRuleByName(main, name);
  const rules: string[][] = [];
  const added: Array<{ name: string; id: string }> = [];
  const renamed = [...plan.renamed];

  const takeRename = (name: string) => {
    const index = renamed.findIndex((pair) => sameName(pair.to, name));
    return index === -1 ? undefined : renamed.splice(index, 1)[0];
  };

  for (const block of plan.added) {
    const id = formatRequirementId(firstId + added.length);
    added.push({ name: block.name, id });
    rules.push(renderRequirement(readRequirement(block.name, bodyOf(block.raw)), ['added', id]));
  }

  for (const block of plan.modified) {
    const rename = takeRename(block.name);
    const target = lookup(rename ? rename.from : block.name);
    if (!target?.id) {
      warn(missingTarget('MODIFIED', rename ? rename.from : block.name, capability, main));
    }
    const tags = ['modified', ...(target?.id ? [target.id] : []), ...extraTags(target)];
    rules.push(renderRequirement(readRequirement(block.name, bodyOf(block.raw)), tags));
  }

  // A rename with no MODIFIED entry keeps the requirement as it is under its
  // new name: a @modified rule that copies the main rule.
  for (const pair of renamed) {
    const target = lookup(pair.from);
    if (!target?.id || !main) {
      warn(missingTarget('RENAMED', pair.from, capability, main));
      rules.push([`${RULE_INDENT}@modified`, `${RULE_INDENT}Rule: ${pair.to}`, `${BODY_INDENT}${pair.to}`]);
      continue;
    }
    rules.push(renameRule(main, target, pair.to));
  }

  const removedBodies = new Map(plan.removedBlocks.map((block) => [block.name, bodyOf(block.raw)]));
  for (const name of plan.removed) {
    const target = lookup(name);
    if (!target?.id) warn(missingTarget('REMOVED', name, capability, main));
    const tags = ['removed', ...(target?.id ? [target.id] : [])];
    const out = [`${RULE_INDENT}${tags.map((tag) => `@${tag}`).join(' ')}`, `${RULE_INDENT}Rule: ${name}`];
    out.push(...renderDescription(removedBodies.get(name) ?? [], BODY_INDENT));
    rules.push(out);
  }

  return {
    content: renderFeature({
      comments: trimBlankEdges(comments),
      name: main?.feature?.name || cleanTitle(title) || leafName(capability),
      descriptionLines,
      rules,
    }),
    rules: rules.length,
    added,
  };
}

function renameRule(main: FeatureDocument, rule: SpecRule, newName: string): string[] {
  const lines = ruleSource(main, rule).split('\n');
  const keywordOffset = rule.keywordLine - rule.startLine;
  const keywordLine = lines[keywordOffset];
  const indent = keywordLine.match(/^[ \t]*/)![0];
  const tags = ['modified', rule.id!, ...extraTags(rule)];
  return [
    `${indent}${tags.map((tag) => `@${tag}`).join(' ')}`,
    `${indent}Rule: ${newName}`,
    ...lines.slice(keywordOffset + 1),
  ];
}

/** Tags of a main rule other than its ID and operation tags, such as `@notrace`. */
function extraTags(rule: SpecRule | undefined): string[] {
  if (!rule) return [];
  return rule.tags.filter((tag) => !isRequirementId(tag) && !['added', 'modified', 'removed'].includes(tag.toLowerCase()));
}

function missingTarget(section: string, name: string, capability: string, main: FeatureDocument | undefined): string {
  const where = main ? `specs/${capability}/${SPEC_FILE_NAME}` : `specs/${capability} (no main spec)`;
  return `${section} requirement "${name}" is not in ${where}, so it has no ID. Add the ID of the requirement it changes.`;
}

function findRuleByName(main: FeatureDocument | undefined, name: string): SpecRule | undefined {
  if (!main) return undefined;
  const exact = main.rules.filter((rule) => rule.name === normalizeRequirementName(name));
  if (exact.length === 1) return exact[0];
  const folded = main.rules.filter((rule) => sameName(rule.name, name));
  return folded.length === 1 ? folded[0] : undefined;
}

function sameName(a: string, b: string): boolean {
  return foldRequirementName(a) === foldRequirementName(b);
}

/** The lines of a `### Requirement:` block after its header line. */
function bodyOf(raw: string): string[] {
  return raw.split('\n').slice(1);
}

async function readMainFeature(specsDir: string, capability: string): Promise<FeatureDocument | undefined> {
  try {
    const document = parseFeature(await fs.readFile(path.join(specsDir, capability, SPEC_FILE_NAME), 'utf-8'));
    return document.errors.length === 0 ? document : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Files

/** Every file named `name` in a capability folder under `root`, sorted by capability. */
async function findFiles(root: string, name: string): Promise<Array<{ capability: string; file: string }>> {
  const found: Array<{ capability: string; file: string }> = [];
  const walk = async (dir: string, segments: string[]): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, [...segments, entry.name]);
      else if (entry.isFile() && entry.name === name && segments.length > 0) {
        found.push({ capability: segments.join('/'), file: full });
      }
    }
  };
  await walk(root, []);
  return found.sort((a, b) => (a.capability < b.capability ? -1 : a.capability > b.capability ? 1 : 0));
}

async function listActiveChanges(changesDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'archive' && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw error;
  }
}

async function exists(file: string): Promise<boolean> {
  return fs
    .stat(file)
    .then(() => true)
    .catch(() => false);
}

// ---------------------------------------------------------------------------
// Text helpers

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end);
}

function dedentLines(lines: string[]): string[] {
  const indents = lines.filter((line) => line.trim() !== '').map((line) => line.match(/^[ \t]*/)![0].length);
  const common = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(common));
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** `List Command Specification` → `List Command`. */
function cleanTitle(title: string | undefined): string {
  return (title ?? '')
    .replace(/\s+(?:delta\s+)?spec(?:ification)?$/i, '')
    .replace(/\s+delta$/i, '')
    .trim();
}

function leafName(capability: string): string {
  return capability.split('/').pop() ?? capability;
}
