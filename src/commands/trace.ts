/**
 * `openspec trace`: check that requirements and code point at each other.
 *
 * - `trace check` fails when a requirement has no `@trace` comment in the
 *   code, or when a `@trace` comment names an ID that is no requirement.
 * - `trace show <id>` lists the code that traces to one requirement.
 * - `trace report` gives traced and total requirements per capability.
 */
import path from 'node:path';
import chalk from 'chalk';
import {
  findDeclaringProjectRoot,
  isStoreSelectedRoot,
  resolveRootForCommand,
  toRootOutput,
  type ResolvedOpenSpecRoot,
} from '../core/root-selection.js';
import { readProjectConfig } from '../core/project-config.js';
import { scanTraces, type TraceHit } from '../core/trace/scanner.js';
import { loadRequirementIndex } from '../core/trace/requirements.js';
import {
  analyzeTraces,
  type AnalyzedRequirement,
  type PendingRequirement,
  type TraceAnalysis,
  type TraceWarning,
} from '../core/trace/analysis.js';
import { emitFailure, printJson } from './shared-output.js';

export interface TraceCommonOptions {
  json?: boolean;
}

export interface TraceCheckOptions extends TraceCommonOptions {
  untraced?: boolean;
  orphans?: boolean;
}

export type TraceCheckName = 'untraced' | 'orphans';

interface TraceContext {
  root: ResolvedOpenSpecRoot;
  /** The folder whose code is scanned. */
  codeRoot: string;
  analysis: TraceAnalysis;
  filesScanned: number;
}

/**
 * The code that a root's specs describe. A local root's code is the project
 * that holds `openspec/`. A store holds only specs, so its code is the
 * project that points at the store, or else the current folder.
 */
function codeRootFor(root: ResolvedOpenSpecRoot): string {
  if (!isStoreSelectedRoot(root)) {
    return root.path;
  }
  return findDeclaringProjectRoot(root.storeId) ?? process.cwd();
}

/** Forward-slash path relative to the code root, or absolute when outside it. */
function displayPath(codeRoot: string, file: string): string {
  if (!path.isAbsolute(file)) {
    return file;
  }
  const relative = path.relative(codeRoot, file);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return file.split(path.sep).join('/');
  }
  return relative.split(path.sep).join('/');
}

async function buildTraceContext(
  options: TraceCommonOptions,
  failurePayload: Record<string, unknown>
): Promise<TraceContext | null> {
  const root = await resolveRootForCommand(
    {},
    { json: options.json, failurePayload, allowImplicitRoot: false }
  );
  if (!root) {
    return null;
  }
  const codeRoot = codeRootFor(root);
  const config = readProjectConfig(codeRoot);
  const [index, scan] = await Promise.all([
    loadRequirementIndex({ projectRoot: root.path, specsDir: root.specsDir, changesDir: root.changesDir }),
    scanTraces(codeRoot, { include: config?.trace?.include, exclude: config?.trace?.exclude }),
  ]);
  return { root, codeRoot, analysis: analyzeTraces(index, scan.traces), filesScanned: scan.filesScanned };
}

// ---------------------------------------------------------------------------
// JSON shapes
// ---------------------------------------------------------------------------

function requirementJson(codeRoot: string, requirement: AnalyzedRequirement | PendingRequirement) {
  return {
    id: requirement.id,
    name: requirement.name,
    capability: requirement.capability,
    file: displayPath(codeRoot, requirement.file),
    line: requirement.line,
  };
}

function pendingJson(codeRoot: string, pending: PendingRequirement) {
  return { ...requirementJson(codeRoot, pending), change: pending.change, traced: pending.traced };
}

function traceJson(hit: TraceHit) {
  return { id: hit.id, file: hit.file, line: hit.line };
}

function warningJson(codeRoot: string, warning: TraceWarning) {
  return {
    code: warning.code,
    ...(warning.id ? { id: warning.id } : {}),
    file: displayPath(codeRoot, warning.file),
    line: warning.line,
    ...(warning.change ? { change: warning.change } : {}),
    message: warning.message,
  };
}

// ---------------------------------------------------------------------------
// Human output helpers
// ---------------------------------------------------------------------------

function percent(ratio: number | null): string {
  return ratio === null ? 'n/a' : `${Math.round(ratio * 1000) / 10}%`;
}

function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

function printSection(title: string, lines: string[]): void {
  if (lines.length === 0) return;
  console.log(chalk.bold(title));
  for (const line of lines) console.log(`  ${line}`);
  console.log();
}

function warningLines(codeRoot: string, warnings: TraceWarning[]): string[] {
  return warnings.map(
    (warning) => `${chalk.yellow(`${displayPath(codeRoot, warning.file)}:${warning.line}`)}  ${warning.message}`
  );
}

function pendingLines(codeRoot: string, pending: PendingRequirement[]): string[] {
  return pending.map((entry) => {
    const state = entry.traced ? chalk.green('traced') : chalk.dim('not traced yet');
    return `${entry.id}  ${entry.capability} › ${entry.name}  (change ${entry.change}, ${state})  ${chalk.dim(
      `${displayPath(codeRoot, entry.file)}:${entry.line}`
    )}`;
  });
}

// ---------------------------------------------------------------------------
// trace check
// ---------------------------------------------------------------------------

const CHECK_FAILURE_PAYLOAD = {
  valid: false,
  checks: [],
  summary: null,
  warnings: [],
  pending: [],
  root: null,
};

export function selectedChecks(options: TraceCheckOptions): TraceCheckName[] {
  if (options.untraced && !options.orphans) return ['untraced'];
  if (options.orphans && !options.untraced) return ['orphans'];
  return ['untraced', 'orphans'];
}

export async function traceCheckCommand(options: TraceCheckOptions = {}): Promise<void> {
  try {
    const context = await buildTraceContext(options, CHECK_FAILURE_PAYLOAD);
    if (!context) return;
    const { root, codeRoot, analysis, filesScanned } = context;
    const checks = selectedChecks(options);
    const untraced = checks.includes('untraced')
      ? analysis.requirements.filter((requirement) => requirement.status === 'untraced')
      : undefined;
    const orphans = checks.includes('orphans') ? analysis.orphans : undefined;
    const valid = (untraced?.length ?? 0) === 0 && (orphans?.length ?? 0) === 0;

    if (options.json) {
      printJson({
        valid,
        checks,
        summary: {
          requirements: analysis.summary.requirements,
          traced: analysis.summary.traced,
          untraced: analysis.summary.untraced,
          notrace: analysis.summary.notrace,
          removing: analysis.summary.removing,
          pending: analysis.summary.pending,
          traces: analysis.summary.traces,
          orphans: analysis.summary.orphans,
          warnings: analysis.summary.warnings,
          filesScanned,
        },
        ...(untraced ? { untraced: untraced.map((r) => requirementJson(codeRoot, r)) } : {}),
        ...(orphans ? { orphans: orphans.map(traceJson) } : {}),
        warnings: analysis.warnings.map((warning) => warningJson(codeRoot, warning)),
        pending: analysis.pending.map((entry) => pendingJson(codeRoot, entry)),
        root: toRootOutput(root),
      });
    } else {
      printCheck(codeRoot, analysis, filesScanned, untraced, orphans, valid);
    }
    if (!valid) {
      process.exitCode = 1;
    }
  } catch (error) {
    emitFailure(options.json, CHECK_FAILURE_PAYLOAD, error, 'trace_check_failed');
  }
}

function printCheck(
  codeRoot: string,
  analysis: TraceAnalysis,
  filesScanned: number,
  untraced: AnalyzedRequirement[] | undefined,
  orphans: TraceHit[] | undefined,
  valid: boolean
): void {
  if (untraced) {
    printSection(
      `Requirements with no trace (${untraced.length})`,
      untraced.map(
        (requirement) =>
          `${chalk.red(requirement.id)}  ${requirement.capability} › ${requirement.name}  ${chalk.dim(
            `${displayPath(codeRoot, requirement.file)}:${requirement.line}`
          )}`
      )
    );
  }
  if (orphans) {
    printSection(
      `Traces to requirements that do not exist (${orphans.length})`,
      orphans.map((hit) => `${chalk.red(hit.id)}  ${hit.file}:${hit.line}`)
    );
  }
  printSection(`Warnings (${analysis.warnings.length})`, warningLines(codeRoot, analysis.warnings));
  printSection(
    `Pending requirements in active changes (${analysis.pending.length})`,
    pendingLines(codeRoot, analysis.pending)
  );

  const { summary } = analysis;
  const traceable = summary.traced + summary.untraced;
  const details = [
    `${summary.traced} of ${plural(traceable, 'requirement')} traced (${percent(summary.coverage)})`,
    ...(summary.notrace > 0 ? [`${summary.notrace} @notrace`] : []),
    ...(summary.removing > 0 ? [`${summary.removing} removed by active changes`] : []),
    `${plural(summary.traces, 'trace')} in ${plural(filesScanned, 'file')}`,
  ];
  console.log(details.join(', '));

  if (valid) {
    console.log(chalk.green('✓ Trace check passed.'));
    return;
  }
  const problems = [
    ...(untraced && untraced.length > 0 ? [`${plural(untraced.length, 'requirement')} with no trace`] : []),
    ...(orphans && orphans.length > 0
      ? [`${plural(orphans.length, 'trace')} to requirements that do not exist`]
      : []),
  ];
  console.log(chalk.red(`✗ Trace check failed: ${problems.join(', ')}.`));
  console.log(
    chalk.dim(
      'Add a "@trace REQ-…" comment at the code for each requirement, fix or remove traces to unknown IDs, or tag a requirement @notrace when no code can implement it.'
    )
  );
}

// ---------------------------------------------------------------------------
// trace show
// ---------------------------------------------------------------------------

const SHOW_FAILURE_PAYLOAD = { id: null, requirement: null, traces: [], root: null };

/** `REQ-0001`, `@REQ-0001` and `req-0001` all name REQ-0001. Undefined for anything else. */
export function normalizeTraceId(input: string): string | undefined {
  const trimmed = input.trim().replace(/^@/, '').toUpperCase();
  return /^REQ-\d+$/.test(trimmed) ? trimmed : undefined;
}

export async function traceShowCommand(idInput: string, options: TraceCommonOptions = {}): Promise<void> {
  try {
    const id = normalizeTraceId(idInput);
    if (!id) {
      throw new Error(`"${idInput}" is not a requirement ID. IDs look like REQ-0001.`);
    }
    const context = await buildTraceContext(options, { ...SHOW_FAILURE_PAYLOAD, id });
    if (!context) return;
    const { root, codeRoot, analysis } = context;

    const main = analysis.requirements.find((requirement) => requirement.id === id);
    const pending = analysis.pending.filter((entry) => entry.id === id);
    const traces = analysis.tracesById.get(id) ?? [];

    let requirement:
      | (ReturnType<typeof requirementJson> & { status: 'active' | 'pending' | 'removing'; notrace: boolean; changes: string[] })
      | null = null;
    if (main) {
      requirement = {
        ...requirementJson(codeRoot, main),
        status: main.removedBy.length > 0 ? 'removing' : 'active',
        notrace: main.notrace,
        changes: main.removedBy,
      };
    } else if (pending.length > 0) {
      requirement = {
        ...requirementJson(codeRoot, pending[0]),
        status: 'pending',
        notrace: pending[0].notrace,
        changes: pending.map((entry) => entry.change),
      };
    }

    if (options.json) {
      printJson({
        id,
        requirement,
        traces: traces.map((hit) => ({ ...traceJson(hit), text: hit.text })),
        root: toRootOutput(root),
      });
      return;
    }

    if (requirement) {
      const state =
        requirement.status === 'pending'
          ? `pending in change ${requirement.changes.join(', ')}`
          : requirement.status === 'removing'
            ? `removed by change ${requirement.changes.join(', ')}`
            : 'active';
      console.log(`${chalk.bold(id)}  ${requirement.capability} › ${requirement.name}`);
      console.log(chalk.dim(`  ${requirement.file}:${requirement.line}  (${state}${requirement.notrace ? ', @notrace' : ''})`));
    } else {
      console.log(`${chalk.bold(id)}  ${chalk.yellow('is not a requirement in the specs or in an active change.')}`);
    }
    console.log();
    if (traces.length === 0) {
      console.log('No code traces to this requirement.');
      return;
    }
    printSection(
      `Traces (${traces.length})`,
      traces.map((hit) => `${hit.file}:${hit.line}  ${chalk.dim(hit.text)}`)
    );
  } catch (error) {
    emitFailure(options.json, SHOW_FAILURE_PAYLOAD, error, 'trace_show_failed');
  }
}

// ---------------------------------------------------------------------------
// trace report
// ---------------------------------------------------------------------------

const REPORT_FAILURE_PAYLOAD = { summary: null, capabilities: [], pending: [], root: null };

export async function traceReportCommand(options: TraceCommonOptions = {}): Promise<void> {
  try {
    const context = await buildTraceContext(options, REPORT_FAILURE_PAYLOAD);
    if (!context) return;
    const { root, codeRoot, analysis } = context;
    const { summary } = analysis;

    if (options.json) {
      printJson({
        summary: {
          requirements: summary.requirements,
          traced: summary.traced,
          untraced: summary.untraced,
          notrace: summary.notrace,
          removing: summary.removing,
          pending: summary.pending,
          coverage: summary.coverage,
        },
        capabilities: analysis.capabilities,
        pending: analysis.pending.map((entry) => pendingJson(codeRoot, entry)),
        root: toRootOutput(root),
      });
      return;
    }

    if (analysis.capabilities.length === 0) {
      console.log('No requirements with IDs found in openspec/specs or in active changes.');
      return;
    }
    const nameWidth = Math.max('Capability'.length, ...analysis.capabilities.map((c) => c.capability.length));
    const row = (name: string, traced: string, coverage: string, extra: string) =>
      `${name.padEnd(nameWidth)}  ${traced.padStart(9)}  ${coverage.padStart(8)}  ${extra}`;
    console.log(chalk.bold(row('Capability', 'Traced', 'Coverage', 'Other')));
    for (const capability of analysis.capabilities) {
      const traceable = capability.traced + capability.untraced;
      const extra = [
        ...(capability.notrace > 0 ? [`${capability.notrace} @notrace`] : []),
        ...(capability.removing > 0 ? [`${capability.removing} removing`] : []),
        ...(capability.pending > 0 ? [`${capability.pending} pending`] : []),
      ].join(', ');
      const line = row(capability.capability, `${capability.traced}/${traceable}`, percent(capability.coverage), extra);
      console.log(capability.untraced > 0 ? line : chalk.green(line));
    }
    const traceable = summary.traced + summary.untraced;
    const totalExtra = [
      ...(summary.notrace > 0 ? [`${summary.notrace} @notrace`] : []),
      ...(summary.removing > 0 ? [`${summary.removing} removing`] : []),
      ...(summary.pending > 0 ? [`${summary.pending} pending`] : []),
    ].join(', ');
    console.log(chalk.bold(row('Total', `${summary.traced}/${traceable}`, percent(summary.coverage), totalExtra)));
    if (analysis.pending.length > 0) {
      console.log();
      printSection(`Pending requirements in active changes (${analysis.pending.length})`, pendingLines(codeRoot, analysis.pending));
    }
  } catch (error) {
    emitFailure(options.json, REPORT_FAILURE_PAYLOAD, error, 'trace_report_failed');
  }
}
