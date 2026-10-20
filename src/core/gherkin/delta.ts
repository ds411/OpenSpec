/**
 * Change deltas in Gherkin.
 *
 * A change's spec file is a feature file whose rules each carry one operation
 * tag: `@added`, `@modified` or `@removed`. Archive finds the rule a
 * `@modified` or `@removed` entry acts on by its requirement ID, never by its
 * name, so renaming a requirement is a `@modified` rule with a new name.
 */

import {
  parseFeature,
  ruleSource,
  type DeltaOperationTag,
  type FeatureDocument,
  type SpecRule,
} from './document.js';

export interface DeltaRuleEntry {
  rule: SpecRule;
  /** The rule block as written in the delta file, operation tag included. */
  raw: string;
}

export interface GherkinDeltaPlan {
  document: FeatureDocument;
  added: DeltaRuleEntry[];
  modified: DeltaRuleEntry[];
  removed: DeltaRuleEntry[];
  /** Rules with no operation tag: archive does not know what to do with them. */
  untagged: SpecRule[];
  /** Rules with more than one operation tag. */
  conflicting: SpecRule[];
  /** The feature description: the Purpose of a capability the delta creates. */
  purpose?: string;
}

export function parseDeltaFeature(content: string): GherkinDeltaPlan {
  const document = parseFeature(content);
  const plan: GherkinDeltaPlan = {
    document,
    added: [],
    modified: [],
    removed: [],
    untagged: [],
    conflicting: [],
    purpose: document.feature?.description || undefined,
  };
  for (const rule of document.rules) {
    const operations = [...new Set(rule.operations)];
    if (operations.length === 0) {
      plan.untagged.push(rule);
      continue;
    }
    if (operations.length > 1) {
      plan.conflicting.push(rule);
      continue;
    }
    const entry: DeltaRuleEntry = { rule, raw: ruleSource(document, rule) };
    bucket(plan, operations[0]).push(entry);
  }
  return plan;
}

function bucket(plan: GherkinDeltaPlan, operation: DeltaOperationTag): DeltaRuleEntry[] {
  switch (operation) {
    case 'added':
      return plan.added;
    case 'modified':
      return plan.modified;
    case 'removed':
      return plan.removed;
  }
}

/** Total entries archive would act on. */
export function countDeltaEntries(plan: GherkinDeltaPlan): number {
  return plan.added.length + plan.modified.length + plan.removed.length;
}

/** True when the file has at least one rule with an operation tag. */
export function hasDeltaOperations(plan: GherkinDeltaPlan): boolean {
  return plan.document.rules.some((rule) => rule.operations.length > 0);
}

const OPERATION_TAG_TOKEN = /(^|[ \t])@(?:added|modified|removed)(?=[ \t]|$)/gi;

/**
 * Remove the operation tags from a rule block. A tag line left empty is
 * dropped, so `@added @REQ-0001` becomes `@REQ-0001` and a line holding only
 * `@modified` disappears.
 */
export function stripOperationTags(raw: string, rule: SpecRule): string {
  const lines = raw.split('\n');
  const tagLineOffsets = new Set(rule.tagLines.map((line) => line - rule.startLine));
  const kept: string[] = [];
  lines.forEach((line, index) => {
    if (!tagLineOffsets.has(index)) {
      kept.push(line);
      return;
    }
    const comment = line.match(/[ \t]+#.*$/);
    const head = comment ? line.slice(0, comment.index) : line;
    const indent = line.match(/^[ \t]*/)![0];
    const tags = head.replace(OPERATION_TAG_TOKEN, '').trim();
    if (tags === '') {
      if (comment) kept.push(`${indent}${comment[0].trim()}`);
      return;
    }
    kept.push(`${indent}${tags}${comment ? comment[0] : ''}`);
  });
  return kept.join('\n');
}
