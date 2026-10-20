/**
 * Trace analysis: join the requirements with the traces found in code, in
 * both directions.
 *
 * - A main-spec requirement with no trace is untraced, unless it has the
 *   `@notrace` tag or an active change removes it.
 * - A trace to an ID that is in no main spec and in no active change is an
 *   orphan.
 * - A requirement that an active change adds is pending: a trace to it is
 *   not an orphan, and a missing trace is not an error yet.
 * - A trace to a requirement that an active change removes is a warning, not
 *   an error.
 */

import { compareRequirementIds } from '../gherkin/ids.js';
import type { TraceHit } from './scanner.js';
import type {
  ChangeRequirement,
  IndexedRequirement,
  RequirementIndex,
  SpecProblemCode,
} from './requirements.js';

export type RequirementTraceStatus = 'traced' | 'untraced' | 'notrace' | 'removing';

export interface AnalyzedRequirement extends IndexedRequirement {
  status: RequirementTraceStatus;
  traces: TraceHit[];
  /** Active changes that remove this requirement. */
  removedBy: string[];
}

export interface PendingRequirement extends ChangeRequirement {
  traced: boolean;
}

export type TraceWarningCode = 'trace_to_removed_requirement' | SpecProblemCode;

export interface TraceWarning {
  code: TraceWarningCode;
  message: string;
  /** Absolute spec path for spec problems; scan-relative code path for traces. */
  file: string;
  line: number;
  id?: string;
  change?: string;
}

export interface CapabilityCoverage {
  capability: string;
  requirements: number;
  traced: number;
  untraced: number;
  notrace: number;
  removing: number;
  pending: number;
  coverage: number | null;
}

export interface TraceSummary {
  requirements: number;
  traced: number;
  untraced: number;
  notrace: number;
  removing: number;
  pending: number;
  traces: number;
  orphans: number;
  warnings: number;
  coverage: number | null;
}

export interface TraceAnalysis {
  requirements: AnalyzedRequirement[];
  pending: PendingRequirement[];
  orphans: TraceHit[];
  warnings: TraceWarning[];
  capabilities: CapabilityCoverage[];
  summary: TraceSummary;
  /** Every trace, grouped by ID. */
  tracesById: Map<string, TraceHit[]>;
}

/**
 * Share of traceable requirements that are traced, rounded to four places.
 * Null when nothing is traceable, so "no requirements" never reads as 0 %.
 */
export function coverageRatio(traced: number, traceable: number): number | null {
  return traceable > 0 ? Math.round((traced / traceable) * 10000) / 10000 : null;
}

function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// @trace REQ-0364, REQ-0365
export function analyzeTraces(index: RequirementIndex, traces: TraceHit[]): TraceAnalysis {
  const tracesById = new Map<string, TraceHit[]>();
  for (const hit of traces) {
    const list = tracesById.get(hit.id) ?? [];
    list.push(hit);
    tracesById.set(hit.id, list);
  }

  const removedBy = new Map<string, string[]>();
  const knownIds = new Set(index.requirements.map((requirement) => requirement.id));
  for (const entry of index.changes) {
    if (entry.operation === 'removed') {
      const list = removedBy.get(entry.id) ?? [];
      if (!list.includes(entry.change)) list.push(entry.change);
      removedBy.set(entry.id, list);
    }
  }

  const requirements: AnalyzedRequirement[] = index.requirements.map((requirement) => {
    const hits = tracesById.get(requirement.id) ?? [];
    const removing = removedBy.get(requirement.id) ?? [];
    let status: RequirementTraceStatus;
    if (requirement.notrace) status = 'notrace';
    else if (removing.length > 0) status = 'removing';
    else status = hits.length > 0 ? 'traced' : 'untraced';
    return { ...requirement, status, traces: hits, removedBy: removing };
  });

  // An ID a change adds is pending only while no main spec has it yet.
  const pending: PendingRequirement[] = index.changes
    .filter((entry) => entry.operation === 'added' && !knownIds.has(entry.id))
    .map((entry) => ({ ...entry, traced: tracesById.has(entry.id) }))
    .sort((a, b) => compareRequirementIds(a.id, b.id) || byCodePoint(a.change, b.change));

  const changeIds = new Set(
    index.changes.filter((entry) => entry.operation !== 'removed').map((entry) => entry.id)
  );
  const orphans = traces.filter((hit) => !knownIds.has(hit.id) && !changeIds.has(hit.id));

  const warnings: TraceWarning[] = [];
  for (const problem of index.problems) {
    warnings.push({
      code: problem.code,
      message: problem.message,
      file: problem.file,
      line: problem.line,
      ...(problem.id ? { id: problem.id } : {}),
      ...(problem.change ? { change: problem.change } : {}),
    });
  }
  for (const hit of traces) {
    const changes = removedBy.get(hit.id);
    if (!changes || !knownIds.has(hit.id)) continue;
    for (const change of changes) {
      warnings.push({
        code: 'trace_to_removed_requirement',
        message: `Traces ${hit.id}, which change "${change}" removes. Remove the trace when the code goes.`,
        file: hit.file,
        line: hit.line,
        id: hit.id,
        change,
      });
    }
  }

  const capabilityNames = [
    ...new Set([...requirements.map((r) => r.capability), ...pending.map((p) => p.capability)]),
  ].sort(byCodePoint);
  const capabilities = capabilityNames.map((capability): CapabilityCoverage => {
    const own = requirements.filter((requirement) => requirement.capability === capability);
    const counts = countStatuses(own);
    return {
      capability,
      requirements: own.length,
      ...counts,
      pending: pending.filter((entry) => entry.capability === capability).length,
      coverage: coverageRatio(counts.traced, counts.traced + counts.untraced),
    };
  });

  const counts = countStatuses(requirements);
  return {
    requirements,
    pending,
    orphans,
    warnings,
    capabilities,
    tracesById,
    summary: {
      requirements: requirements.length,
      ...counts,
      pending: pending.length,
      traces: traces.length,
      orphans: orphans.length,
      warnings: warnings.length,
      coverage: coverageRatio(counts.traced, counts.traced + counts.untraced),
    },
  };
}

function countStatuses(requirements: AnalyzedRequirement[]): Record<RequirementTraceStatus, number> {
  const counts: Record<RequirementTraceStatus, number> = { traced: 0, untraced: 0, notrace: 0, removing: 0 };
  for (const requirement of requirements) counts[requirement.status]++;
  return counts;
}
