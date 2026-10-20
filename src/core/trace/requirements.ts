/**
 * The requirements that traces can point at: every rule with an ID in the
 * main specs, and the rules that active changes add, modify or remove.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NO_TRACE_TAG, parseFeature, type SpecRule } from '../gherkin/document.js';
import { parseDeltaFeature, type DeltaRuleEntry } from '../gherkin/delta.js';
import { discoverSpecFiles } from '../../utils/spec-discovery.js';
import { getActiveChangeIds } from '../../utils/item-discovery.js';

export interface IndexedRequirement {
  id: string;
  name: string;
  /** Capability path relative to the specs folder, e.g. `cli-list` or `platform/auth`. */
  capability: string;
  /** Absolute path of the spec file. */
  file: string;
  /** 1-based line of the `Rule:` keyword. */
  line: number;
  /** True when the rule has the `@notrace` tag. */
  notrace: boolean;
}

export type ChangeOperation = 'added' | 'modified' | 'removed';

export interface ChangeRequirement extends IndexedRequirement {
  change: string;
  operation: ChangeOperation;
}

export type SpecProblemCode = 'spec_parse_error' | 'requirement_without_id' | 'duplicate_requirement_id';

/** A spec problem that keeps a requirement out of the trace check. */
export interface SpecProblem {
  code: SpecProblemCode;
  /** Absolute path of the spec file. */
  file: string;
  line: number;
  message: string;
  id?: string;
  change?: string;
}

export interface RequirementIndex {
  /** Requirements in the main specs, one per ID, in spec and then source order. */
  requirements: IndexedRequirement[];
  /** Rules with an ID in the specs of active changes. */
  changes: ChangeRequirement[];
  problems: SpecProblem[];
}

export interface RequirementIndexPaths {
  /** The folder that holds `openspec/`. */
  projectRoot: string;
  /** `openspec/specs`. */
  specsDir: string;
  /** `openspec/changes`. */
  changesDir: string;
}

async function readSpec(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
    throw error;
  }
}

function toRequirement(rule: SpecRule, id: string, capability: string, file: string): IndexedRequirement {
  return {
    id,
    name: rule.name,
    capability,
    file,
    line: rule.keywordLine,
    notrace: rule.tags.some((tag) => tag.toLowerCase() === NO_TRACE_TAG),
  };
}

// @trace REQ-0365
function missingIdProblem(rule: SpecRule, file: string, change?: string): SpecProblem {
  const message =
    rule.ids.length === 0
      ? `Rule "${rule.name}" has no requirement ID, so code cannot trace to it. Run "openspec ids assign".`
      : `Rule "${rule.name}" has more than one requirement ID (${rule.ids.join(', ')}). Keep one.`;
  return {
    code: 'requirement_without_id',
    file,
    line: rule.keywordLine,
    message,
    ...(change ? { change } : {}),
  };
}

function parseErrorProblem(file: string, line: number, message: string, change?: string): SpecProblem {
  return {
    code: 'spec_parse_error',
    file,
    line,
    message: `Gherkin syntax error: ${message}`,
    ...(change ? { change } : {}),
  };
}

async function indexMainSpecs(specsDir: string, index: RequirementIndex): Promise<void> {
  const seen = new Map<string, IndexedRequirement>();
  for (const spec of await discoverSpecFiles(specsDir)) {
    const content = await readSpec(spec.specFile);
    if (content === undefined) continue;
    const document = parseFeature(content);
    for (const error of document.errors) {
      index.problems.push(parseErrorProblem(spec.specFile, error.line, error.message));
    }
    for (const rule of document.rules) {
      if (!rule.id) {
        index.problems.push(missingIdProblem(rule, spec.specFile));
        continue;
      }
      const first = seen.get(rule.id);
      if (first) {
        index.problems.push({
          code: 'duplicate_requirement_id',
          file: spec.specFile,
          line: rule.keywordLine,
          id: rule.id,
          message: `${rule.id} is also the ID of "${first.name}" in ${first.capability}. Each requirement needs its own ID.`,
        });
        continue;
      }
      const requirement = toRequirement(rule, rule.id, spec.id, spec.specFile);
      seen.set(rule.id, requirement);
      index.requirements.push(requirement);
    }
  }
}

async function indexChange(changesDir: string, change: string, index: RequirementIndex): Promise<void> {
  for (const spec of await discoverSpecFiles(path.join(changesDir, change, 'specs'))) {
    const content = await readSpec(spec.specFile);
    if (content === undefined) continue;
    const plan = parseDeltaFeature(content);
    for (const error of plan.document.errors) {
      index.problems.push(parseErrorProblem(spec.specFile, error.line, error.message, change));
    }
    const buckets: Array<[ChangeOperation, DeltaRuleEntry[]]> = [
      ['added', plan.added],
      ['modified', plan.modified],
      ['removed', plan.removed],
    ];
    for (const [operation, entries] of buckets) {
      for (const { rule } of entries) {
        if (!rule.id) {
          index.problems.push(missingIdProblem(rule, spec.specFile, change));
          continue;
        }
        index.changes.push({
          ...toRequirement(rule, rule.id, spec.id, spec.specFile),
          change,
          operation,
        });
      }
    }
  }
}

/**
 * Read every requirement that a trace can point at. Spec files that do not
 * parse, and rules with no ID, are reported in `problems` and left out.
 */
export async function loadRequirementIndex(paths: RequirementIndexPaths): Promise<RequirementIndex> {
  const index: RequirementIndex = { requirements: [], changes: [], problems: [] };
  await indexMainSpecs(paths.specsDir, index);
  for (const change of await getActiveChangeIds(paths.projectRoot)) {
    await indexChange(paths.changesDir, change, index);
  }
  return index;
}
