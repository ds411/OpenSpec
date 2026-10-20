/**
 * Gherkin spec documents.
 *
 * A capability spec is a Gherkin feature file: the `Feature:` is the
 * capability, its free text is the Purpose, each `Rule:` is a requirement
 * (identified by a `@REQ-0001` tag), the free text under a rule is the
 * requirement statement, and the scenarios inside a rule are its scenarios.
 *
 * Parsing is done by the official Cucumber parser, so every file OpenSpec
 * accepts is a file Cucumber tooling accepts too. This module adds what the
 * parser does not give: requirement IDs and operation tags read off the tags,
 * dedented descriptions, and the line range each rule occupies in the source,
 * which archive uses to splice rules in and out without reformatting the rest
 * of the file.
 */

import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import type * as messages from '@cucumber/messages';
import { isRequirementId } from './ids.js';

/** The delta operations a rule in a change's spec can carry, as tags. */
export const DELTA_OPERATION_TAGS = ['added', 'modified', 'removed'] as const;
export type DeltaOperationTag = (typeof DELTA_OPERATION_TAGS)[number];

/** Tag that keeps a requirement out of the untraced check. */
export const NO_TRACE_TAG = 'notrace';

export interface SpecStep {
  /** The step keyword without its trailing space, e.g. `When`. */
  keyword: string;
  /** Context, Action, Outcome, Conjunction or Unknown, as the parser classifies it. */
  keywordType: string;
  text: string;
  /** A doc string's content, or a data table as `| a | b |` rows. */
  argument?: string;
  line: number;
}

export interface SpecScenario {
  /** `Scenario`, `Scenario Outline`, `Example` or `Scenario Template`. */
  keyword: string;
  name: string;
  tags: string[];
  steps: SpecStep[];
  /** Number of `Examples:` tables (outlines only). */
  examples: number;
  line: number;
}

export interface SpecRule {
  name: string;
  /** The requirement ID when the rule carries exactly one ID tag. */
  id?: string;
  /** Every requirement-ID tag on the rule, without the `@`, in source order. */
  ids: string[];
  /** Every tag on the rule, without the `@`, in source order. */
  tags: string[];
  /** Delta operation tags on the rule, lower-cased, in source order. */
  operations: DeltaOperationTag[];
  /** 1-based lines that hold the rule's tags, ascending. Empty when untagged. */
  tagLines: number[];
  /** The free text under `Rule:`, dedented and trimmed. */
  description: string;
  scenarios: SpecScenario[];
  /** True when the rule has its own `Background:`. */
  hasBackground: boolean;
  /** 1-based line of the `Rule:` keyword. */
  keywordLine: number;
  /** 1-based column of the `Rule:` keyword. */
  keywordColumn: number;
  /** 1-based first line of the rule block: leading comments, tags, keyword. */
  startLine: number;
  /** 1-based last non-blank line of the rule block. */
  endLine: number;
}

export interface SpecFeature {
  name: string;
  /** The free text under `Feature:`, dedented and trimmed. */
  description: string;
  tags: string[];
  language: string;
  line: number;
  /** 1-based line of the `Background:` keyword, when the feature has one. */
  backgroundLine?: number;
  /** Scenarios written directly under the feature, outside every rule. */
  looseScenarios: SpecScenario[];
}

export interface GherkinSyntaxError {
  line: number;
  column?: number;
  message: string;
}

export interface FeatureDocument {
  /** Undefined for an empty file, a file with no `Feature:`, or a syntax error. */
  feature?: SpecFeature;
  rules: SpecRule[];
  errors: GherkinSyntaxError[];
  /** The source, BOM stripped and line endings normalized to LF, split into lines. */
  lines: string[];
}

export function normalizeFeatureSource(content: string): string {
  return content.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/**
 * Parse a feature file. Never throws on bad input: syntax errors are returned
 * in `errors`, with `feature` left undefined so callers cannot act on a
 * half-read document.
 */
export function parseFeature(content: string): FeatureDocument {
  const source = normalizeFeatureSource(content);
  const lines = source.split('\n');
  let gherkinDocument: messages.GherkinDocument;
  try {
    const parser = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher());
    gherkinDocument = parser.parse(source);
  } catch (error) {
    return { rules: [], errors: toSyntaxErrors(error), lines };
  }

  const feature = gherkinDocument.feature;
  if (!feature) {
    return { rules: [], errors: [], lines };
  }

  const ruleNodes: messages.Rule[] = [];
  const looseScenarios: SpecScenario[] = [];
  let backgroundLine: number | undefined;
  for (const child of feature.children) {
    if (child.rule) ruleNodes.push(child.rule);
    else if (child.scenario) looseScenarios.push(toScenario(child.scenario));
    else if (child.background) backgroundLine = child.background.location.line;
  }

  const ruleStarts = ruleNodes.map((rule) => ruleStartLine(rule, lines));
  const rules = ruleNodes.map((rule, index) => {
    const nextStart = index + 1 < ruleStarts.length ? ruleStarts[index + 1] : lines.length + 1;
    return toRule(rule, ruleStarts[index], lastContentLine(lines, nextStart - 1));
  });

  return {
    feature: {
      name: feature.name.trim(),
      description: dedent(feature.description),
      tags: feature.tags.map((tag) => stripAt(tag.name)),
      language: feature.language,
      line: feature.location.line,
      backgroundLine,
      looseScenarios,
    },
    rules,
    errors: [],
    lines,
  };
}

/**
 * The source text of a rule block, exactly as written (LF line endings).
 */
export function ruleSource(document: FeatureDocument, rule: SpecRule): string {
  return document.lines.slice(rule.startLine - 1, rule.endLine).join('\n');
}

/**
 * Remove the common leading indentation of a description and trim blank
 * lines around it. The parser keeps the source indentation in descriptions.
 */
export function dedent(text: string | undefined): string {
  if (!text) return '';
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^[ \t]*/)![0].length);
  const common = indents.length > 0 ? Math.min(...indents) : 0;
  return lines
    .map((line) => line.slice(common).trimEnd())
    .join('\n')
    .trim();
}

function stripAt(tag: string): string {
  return tag.startsWith('@') ? tag.slice(1) : tag;
}

function toScenario(scenario: messages.Scenario): SpecScenario {
  return {
    keyword: scenario.keyword.trim(),
    name: scenario.name.trim(),
    tags: scenario.tags.map((tag) => stripAt(tag.name)),
    steps: scenario.steps.map((step) => ({
      keyword: step.keyword.trim(),
      keywordType: step.keywordType ?? 'Unknown',
      text: step.text,
      ...(stepArgument(step) !== undefined ? { argument: stepArgument(step) } : {}),
      line: step.location.line,
    })),
    examples: scenario.examples.length,
    line: scenario.location.line,
  };
}

function stepArgument(step: messages.Step): string | undefined {
  if (step.docString) return step.docString.content;
  if (step.dataTable) {
    return step.dataTable.rows
      .map((row) => `| ${row.cells.map((cell) => cell.value).join(' | ')} |`)
      .join('\n');
  }
  return undefined;
}

function toRule(rule: messages.Rule, startLine: number, endLine: number): SpecRule {
  const tags = rule.tags.map((tag) => stripAt(tag.name));
  const ids = tags.filter(isRequirementId);
  const operations = tags
    .map((tag) => tag.toLowerCase())
    .filter((tag): tag is DeltaOperationTag =>
      (DELTA_OPERATION_TAGS as readonly string[]).includes(tag)
    );
  const scenarios: SpecScenario[] = [];
  let hasBackground = false;
  for (const child of rule.children) {
    if (child.scenario) scenarios.push(toScenario(child.scenario));
    else if (child.background) hasBackground = true;
  }
  return {
    name: rule.name.trim(),
    id: ids.length === 1 ? ids[0] : undefined,
    ids,
    tags,
    operations,
    tagLines: [...new Set(rule.tags.map((tag) => tag.location.line))].sort((a, b) => a - b),
    description: dedent(rule.description),
    scenarios,
    hasBackground,
    keywordLine: rule.location.line,
    keywordColumn: rule.location.column ?? 1,
    startLine,
    endLine: Math.max(endLine, rule.location.line),
  };
}

/**
 * First line of a rule block: its first tag line, extended upward over
 * comment lines that sit directly above it with no blank line between. Such a
 * comment is about the rule, so it moves with the rule when archive replaces
 * or removes it.
 */
function ruleStartLine(rule: messages.Rule, lines: string[]): number {
  let start = rule.location.line;
  for (const tag of rule.tags) start = Math.min(start, tag.location.line);
  while (start > 1 && /^\s*#/.test(lines[start - 2]) && !/^\s*#\s*language\s*:/.test(lines[start - 2])) {
    start--;
  }
  return start;
}

/** The last line at or above `line` (1-based) that is not blank. */
function lastContentLine(lines: string[], line: number): number {
  let end = line;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  return end;
}

function toSyntaxErrors(error: unknown): GherkinSyntaxError[] {
  const nested = (error as { errors?: unknown[] })?.errors;
  const list = Array.isArray(nested) && nested.length > 0 ? nested : [error];
  return list.map((item) => {
    const location = (item as { location?: { line?: number; column?: number } })?.location;
    const raw = item instanceof Error ? item.message : String(item);
    // The parser prefixes each message with "(line:column): ".
    const message = raw.replace(/^\(\d+:\d+\):\s*/, '');
    return { line: location?.line ?? 1, column: location?.column, message };
  });
}
