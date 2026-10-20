/**
 * Apply a change's Gherkin delta to a main spec.
 *
 * Rules are matched by requirement ID. The main spec is edited by splicing rule
 * blocks at the line ranges the parser reports, so everything archive does not
 * touch - comments, formatting, the order of the other rules - stays as written.
 *
 * Re-applying a delta is safe: `sync` can apply a change before archive does,
 * so an `@added` rule already present with the same content, a `@modified`
 * rule already in place and a `@removed` rule already gone are all no-ops.
 */

import {
  parseFeature,
  ruleSource,
  type FeatureDocument,
  type SpecRule,
  type SpecScenario,
} from './document.js';
import { stripOperationTags, type DeltaRuleEntry, type GherkinDeltaPlan } from './delta.js';
import { PURPOSE_PLACEHOLDER_PREFIX, PURPOSE_PLACEHOLDER_SUFFIX } from '../validation/constants.js';

/** Column of `Rule:` when the main spec has no rule to copy the indentation from. */
const DEFAULT_RULE_COLUMN = 3;

export interface MergeCounts {
  added: number;
  modified: number;
  removed: number;
}

export interface MergeResult {
  rebuilt: string;
  counts: MergeCounts;
  warnings: string[];
  /** No rule is left in the rebuilt spec. */
  noRequirementBlocks: boolean;
  /**
   * Non-blank lines of the rebuilt spec that are neither the feature header,
   * its description, nor a rule. Retiring a capability deletes the file, so
   * archive refuses to retire one while any such line exists.
   */
  unaccountedContent: string[];
}

/**
 * Problems in a delta that make it impossible to apply, whatever the main spec
 * holds. Shared with validation, so validate reports what archive refuses.
 */
export function findDeltaPlanErrors(plan: GherkinDeltaPlan): Array<{ line: number; message: string }> {
  const errors: Array<{ line: number; message: string }> = [];
  for (const error of plan.document.errors) {
    errors.push({ line: error.line, message: `Gherkin syntax error: ${error.message}` });
  }
  if (plan.document.errors.length > 0) return errors;
  if (!plan.document.feature) {
    errors.push({ line: 1, message: 'Delta spec has no "Feature:" line.' });
    return errors;
  }
  for (const rule of plan.untagged) {
    errors.push({
      line: rule.keywordLine,
      message: `Rule "${rule.name}" has no operation tag. Tag it @added, @modified or @removed.`,
    });
  }
  for (const rule of plan.conflicting) {
    errors.push({
      line: rule.keywordLine,
      message: `Rule "${rule.name}" has more than one operation tag (${[...new Set(rule.operations)]
        .map((op) => `@${op}`)
        .join(', ')}). Keep one.`,
    });
  }
  const seen = new Map<string, SpecRule>();
  for (const entry of [...plan.added, ...plan.modified, ...plan.removed]) {
    const { rule } = entry;
    if (rule.ids.length === 0) {
      errors.push({
        line: rule.keywordLine,
        message:
          `Rule "${rule.name}" has no requirement ID. ` +
          'Run "openspec ids assign <change>" to give it one.',
      });
      continue;
    }
    if (rule.ids.length > 1) {
      errors.push({
        line: rule.keywordLine,
        message: `Rule "${rule.name}" has more than one requirement ID (${rule.ids.join(', ')}). Keep one.`,
      });
      continue;
    }
    const previous = seen.get(rule.ids[0]);
    if (previous) {
      errors.push({
        line: rule.keywordLine,
        message: `Requirement ${rule.ids[0]} appears more than once in this delta (also line ${previous.keywordLine}).`,
      });
    } else {
      seen.set(rule.ids[0], rule);
    }
  }
  return errors;
}

/**
 * Scenarios of the current rule that the modified rule leaves out without
 * saying so. A `@modified` rule replaces the whole rule, so a scenario missing
 * from it would be deleted; one the author means to delete is kept in the delta
 * with a `@removed` tag.
 */
export function findDroppedScenarios(current: SpecRule, modified: SpecRule): string[] {
  const remaining = new Map<string, number>();
  for (const scenario of modified.scenarios) {
    remaining.set(scenario.name, (remaining.get(scenario.name) ?? 0) + 1);
  }
  const dropped: string[] = [];
  for (const scenario of current.scenarios) {
    const count = remaining.get(scenario.name) ?? 0;
    if (count > 0) remaining.set(scenario.name, count - 1);
    else dropped.push(scenario.name);
  }
  return dropped;
}

/** True when a scenario in a delta is marked for deletion. */
function isRemovedScenario(scenario: SpecScenario): boolean {
  return scenario.tags.some((tag) => tag.toLowerCase() === 'removed');
}

/**
 * Build the rebuilt main spec. Throws when the delta cannot be applied; the
 * message starts with the capability id so a multi-spec archive names it.
 */
export function mergeDelta(options: {
  specName: string;
  changeName: string;
  plan: GherkinDeltaPlan;
  /** Current main spec, or undefined when the capability does not exist yet. */
  mainContent?: string;
}): MergeResult {
  const { specName, changeName, plan } = options;
  const warnings: string[] = [];

  const planErrors = findDeltaPlanErrors(plan);
  if (planErrors.length > 0) {
    const first = planErrors[0];
    throw new Error(`${specName} validation failed - line ${first.line}: ${first.message}`);
  }
  if (plan.added.length + plan.modified.length + plan.removed.length === 0) {
    throw new Error(
      `Delta parsing found no operations for ${specName}. ` +
        'Tag each rule in the change spec @added, @modified or @removed.'
    );
  }

  let mainContent = options.mainContent;
  if (mainContent === undefined) {
    if (plan.modified.length > 0) {
      throw new Error(
        `${specName}: target spec does not exist; only @added rules are allowed for a new spec. ` +
          '@modified rules require an existing spec.'
      );
    }
    if (plan.removed.length > 0) {
      warnings.push(
        `${specName} - ${plan.removed.length} @removed rule(s) ignored for new spec (nothing to remove).`
      );
    }
    mainContent = buildSpecSkeleton(specName, changeName, plan.document.feature?.name, plan.purpose);
  }

  const main = parseFeature(mainContent);
  if (main.errors.length > 0 || !main.feature) {
    const detail = main.errors[0]
      ? `line ${main.errors[0].line}: ${main.errors[0].message}`
      : 'no "Feature:" line';
    throw new Error(`${specName}: target spec is invalid and cannot be updated until fixed (${detail}).`);
  }

  // Rule blocks, with the comments that sit between rules (after a blank line)
  // kept as blocks of their own so that replacing or removing a rule never
  // takes them along.
  const blocks: Array<{ id?: string; rule?: SpecRule; text: string }> = [];
  main.rules.forEach((rule, index) => {
    blocks.push({ id: rule.id, rule, text: ruleSource(main, rule) });
    const gapEnd = index + 1 < main.rules.length ? main.rules[index + 1].startLine - 1 : main.lines.length;
    const gap = trimBlankLines(main.lines.slice(rule.endLine, gapEnd));
    if (gap.length > 0) blocks.push({ text: gap.join('\n') });
  });
  const indexOf = (id: string): number => blocks.findIndex((block) => block.id === id);
  for (const rule of main.rules) {
    if (rule.ids.length > 1) {
      throw new Error(
        `${specName}: target spec rule "${rule.name}" (line ${rule.keywordLine}) has more than one requirement ID. Keep one.`
      );
    }
    if (rule.id && main.rules.filter((other) => other.id === rule.id).length > 1) {
      throw new Error(`${specName}: target spec has requirement ${rule.id} more than once.`);
    }
  }
  const ruleColumn = main.rules[0]?.keywordColumn ?? DEFAULT_RULE_COLUMN;
  const counts: MergeCounts = { added: 0, modified: 0, removed: 0 };

  for (const entry of plan.removed) {
    const id = entry.rule.ids[0];
    const index = indexOf(id);
    if (index === -1) {
      // A rule with the same name under another ID means the ID in the delta
      // is wrong, not that the removal was already applied. A rule this delta
      // adds or modifies may share the name: it replaces the removed one.
      const touched = new Set([...plan.added, ...plan.modified].map((other) => other.rule.ids[0]));
      const namesake = main.rules.find(
        (rule) => sameName(rule.name, entry.rule.name) && !(rule.id && touched.has(rule.id))
      );
      if (options.mainContent !== undefined && namesake) {
        throw new Error(
          `${specName} @removed failed for ${id} ("${entry.rule.name}") - not in the current spec, but ` +
            `${namesake.id ?? 'a rule without an ID'} has the same name. Check the requirement ID.`
        );
      }
      if (options.mainContent !== undefined) {
        warnings.push(
          `${specName} - @removed requirement ${id} ("${entry.rule.name}") is not in the current spec; treating it as already removed.`
        );
      }
      continue;
    }
    blocks.splice(index, 1);
    counts.removed++;
  }

  for (const entry of plan.modified) {
    const id = entry.rule.ids[0];
    const index = indexOf(id);
    if (index === -1) {
      throw new Error(`${specName} @modified failed for ${id} ("${entry.rule.name}") - not found in the current spec`);
    }
    const current = blocks[index].rule!;
    const removedScenarios = new Set(entry.rule.scenarios.filter(isRemovedScenario).map((s) => s.name));
    const dropped = findDroppedScenarios(current, entry.rule).filter((name) => !removedScenarios.has(name));
    if (dropped.length > 0) {
      throw new Error(
        `${specName} @modified failed for ${id} ("${entry.rule.name}") - the current spec has scenario(s) ` +
          `the modified rule leaves out: ${dropped.map((name) => `"${name}"`).join(', ')}. ` +
          'Copy them into the @modified rule, or keep them there tagged @removed to delete them on purpose.'
      );
    }
    let text = renderDeltaRule(entry, ruleColumn);
    // A comment directly above the rule in the main spec stays with it, unless
    // the delta rule brings comments of its own.
    const kept = leadingComments(blocks[index].text);
    if (kept.length > 0 && leadingComments(text).length === 0) text = [...kept, text].join('\n');
    if (normalizeBlock(text) !== normalizeBlock(blocks[index].text)) counts.modified++;
    blocks[index] = { id, text };
  }

  for (const entry of plan.added) {
    const id = entry.rule.ids[0];
    const text = renderDeltaRule(entry, ruleColumn);
    const index = indexOf(id);
    if (index !== -1) {
      if (normalizeBlock(blocks[index].text) === normalizeBlock(text)) continue;
      throw new Error(
        `${specName} @added failed for ${id} ("${entry.rule.name}") - the spec already has a requirement with this ID. ` +
          'Use @modified to change it, or run "openspec ids assign" on a rule without an ID to get a new one.'
      );
    }
    // After the last rule, ahead of any trailing comments.
    let at = blocks.length;
    while (at > 0 && !blocks[at - 1].rule && blocks[at - 1].id === undefined) at--;
    blocks.splice(at === 0 ? blocks.length : at, 0, { id, text });
    counts.added++;
  }

  const head = headerSection(main);
  const rebuilt = [head, ...blocks.map((block) => block.text)].join('\n\n').trimEnd() + '\n';
  const rebuiltDocument = parseFeature(rebuilt);

  return {
    rebuilt,
    counts,
    warnings,
    noRequirementBlocks: rebuiltDocument.rules.length === 0,
    unaccountedContent: rebuiltDocument.rules.length === 0 ? findUnaccountedLines(rebuiltDocument) : [],
  };
}

/**
 * Everything above the first rule: feature tags, `Feature:` line, description,
 * a background and any scenarios outside rules. Trailing blank lines dropped.
 */
function headerSection(document: FeatureDocument): string {
  const end = document.rules.length > 0 ? document.rules[0].startLine - 1 : document.lines.length;
  return document.lines.slice(0, end).join('\n').trimEnd();
}

/**
 * A delta rule as it goes into the main spec: operation tags removed, scenarios
 * marked `@removed` taken out, and indentation moved to the main spec's rule
 * column.
 */
function renderDeltaRule(entry: DeltaRuleEntry, ruleColumn: number): string {
  let lines = stripOperationTags(entry.raw, entry.rule).split('\n');
  lines = dropRemovedScenarios(lines, entry);
  const shift = ruleColumn - entry.rule.keywordColumn;
  return reindent(lines, shift).join('\n').trimEnd();
}

/**
 * Remove the scenarios a `@modified` rule marks `@removed`, with their tags and
 * steps. Works on the lines after operation tags are stripped, so it locates
 * each scenario by its keyword line rather than by the original line number.
 */
function dropRemovedScenarios(lines: string[], entry: DeltaRuleEntry): string[] {
  const removed = entry.rule.scenarios.filter(isRemovedScenario);
  if (removed.length === 0) return lines;
  const scenarioLine = /^\s*(Scenario|Scenario Outline|Scenario Template|Example):/;
  const tagLine = /^\s*@/;
  const ranges: Array<[number, number]> = [];
  const keywordIndexes = lines
    .map((line, index) => (scenarioLine.test(line) ? index : -1))
    .filter((index) => index !== -1);
  for (const scenario of removed) {
    // Scenarios appear in source order, so the n-th scenario keyword line is
    // the n-th scenario of the rule.
    const position = entry.rule.scenarios.indexOf(scenario);
    const keywordIndex = keywordIndexes[position];
    if (keywordIndex === undefined) continue;
    let start = keywordIndex;
    while (start > 0 && (tagLine.test(lines[start - 1]) || /^\s*#/.test(lines[start - 1]))) start--;
    const nextKeyword = keywordIndexes[position + 1];
    let end = nextKeyword === undefined ? lines.length : nextKeyword;
    while (end > keywordIndex + 1 && (tagLine.test(lines[end - 1]) || /^\s*#/.test(lines[end - 1]))) end--;
    ranges.push([start, end]);
  }
  const drop = new Set<number>();
  for (const [start, end] of ranges) for (let i = start; i < end; i++) drop.add(i);
  const kept = lines.filter((_, index) => !drop.has(index));
  // Collapse the blank lines a removal leaves behind.
  return kept.filter((line, index) => !(line.trim() === '' && kept[index - 1]?.trim() === ''));
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end);
}

function reindent(lines: string[], shift: number): string[] {
  if (shift === 0) return lines;
  return lines.map((line) => {
    if (line.trim() === '') return '';
    if (shift > 0) return ' '.repeat(shift) + line;
    const leading = line.match(/^ */)![0].length;
    return line.slice(Math.min(leading, -shift));
  });
}

/** The comment lines a rule block starts with. */
function leadingComments(text: string): string[] {
  const lines = text.split('\n');
  const comments: string[] = [];
  for (const line of lines) {
    if (!/^\s*#/.test(line)) break;
    comments.push(line);
  }
  return comments;
}

function sameName(a: string, b: string): boolean {
  const fold = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
  return fold(a) === fold(b);
}

function normalizeBlock(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Non-blank lines a retirement would delete that are not the feature header or
 * its description: a background, scenarios outside rules, comments.
 */
function findUnaccountedLines(document: FeatureDocument): string[] {
  const feature = document.feature;
  if (!feature) return document.lines.filter((line) => line.trim() !== '');
  const descriptionLines = new Set(
    feature.description
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const unaccounted: string[] = [];
  document.lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') return;
    const lineNumber = index + 1;
    if (lineNumber < feature.line) {
      if (/^@/.test(trimmed) || /^#\s*language\s*:/.test(trimmed)) return;
      unaccounted.push(trimmed);
      return;
    }
    if (lineNumber === feature.line) return;
    if (!/^#/.test(trimmed) && descriptionLines.has(trimmed) && !isKeywordLine(trimmed)) return;
    unaccounted.push(trimmed);
  });
  return unaccounted;
}

function isKeywordLine(trimmed: string): boolean {
  return /^(Background|Scenario|Scenario Outline|Scenario Template|Example|Examples|Rule|Given|When|Then|And|But|\*)\b/.test(
    trimmed
  );
}

/**
 * The feature a new capability starts from. The delta's feature name and
 * description are carried over; without a description, a placeholder Purpose
 * marks the spec as needing one.
 */
export function buildSpecSkeleton(
  specId: string,
  changeName: string,
  featureName?: string,
  purpose?: string
): string {
  const name = featureName?.trim() || specId;
  const body =
    purpose?.trim() || `${PURPOSE_PLACEHOLDER_PREFIX}${changeName}${PURPOSE_PLACEHOLDER_SUFFIX}`;
  const description = body
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `  ${line}`))
    .join('\n');
  return `Feature: ${name}\n${description}\n`;
}
