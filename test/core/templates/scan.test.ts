import { describe, it, expect } from 'vitest';
import type { Command } from 'commander';
import {
  SCAN_MAX_PARALLEL_HELPERS,
  getOpsxScanCommandTemplate,
} from '../../../src/core/templates/workflows/scan.js';
import { findTracesInText } from '../../../src/core/trace/scanner.js';
import { program } from '../../../src/cli/index.js';

/**
 * Resolves `openspec <command> [<subcommand>] [args] [--flags]` against the
 * real CLI, and returns what does not exist: the command, or its flags.
 */
function unknownCliParts(invocation: string): string[] {
  const words = invocation.split(/\s+/).slice(1);
  let command: Command = program;
  let index = 0;
  while (index < words.length) {
    const child = command.commands.find((candidate) => candidate.name() === words[index]);
    if (!child) break;
    command = child;
    index++;
  }
  if (command === program) return [`command ${words[0]}`];

  const flags = new Set(command.options.map((option) => option.long));
  return words
    .slice(index)
    .filter((word) => word.startsWith('--') && !flags.has(word))
    .map((word) => `${invocation}: ${word}`);
}

describe('scan agent command template', () => {
  const template = getOpsxScanCommandTemplate();
  const body = template.content;

  function section(start: string, end: string): string {
    const from = body.indexOf(start);
    const to = body.indexOf(end, from + start.length);
    expect(from, start).toBeGreaterThanOrEqual(0);
    expect(to, end).toBeGreaterThan(from);
    return body.slice(from, to);
  }

  it('is a command that only the user starts', () => {
    expect(template.name).toBe('OPSX: Scan');
    expect(template.disableModelInvocation).toBe(true);
  });

  it('runs the five phases in order', () => {
    const phases = [
      '**Phase 1: Survey (lead)**',
      '**Phase 2: Spec wave (one helper for each area, in parallel)**',
      '**Phase 3: ID step (lead only)**',
      '**Phase 4: Trace wave (one helper for each area, in parallel)**',
      '**Phase 5: Verify (lead)**',
    ];
    const positions = phases.map((phase) => body.indexOf(phase));
    for (const [index, position] of positions.entries()) {
      expect(position, phases[index]).toBeGreaterThan(0);
    }
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('reads the coverage with the list and trace commands in the survey', () => {
    const survey = section('**Phase 1: Survey (lead)**', '**Phase 2:');
    expect(survey).toContain('openspec list --specs --json');
    expect(survey).toContain('openspec trace report --json');
    expect(survey).toContain('openspec trace check --json');
    for (const coverage of ['**full**', '**partial**', '**none**']) {
      expect(survey).toContain(coverage);
    }
  });

  it('lets only the lead assign requirement IDs, once, after the spec wave', () => {
    const idStep = section('**Phase 3: ID step (lead only)**', '**Phase 4:');
    expect(idStep).toContain('openspec ids assign openspec/specs --json');
    expect(idStep).toContain('openspec ids assign "<name>" --json');

    const outsideIdStep = body.replace(idStep, '');
    expect(outsideIdStep).not.toMatch(/openspec ids assign ["\w]|openspec ids next/);
    expect(body).toContain('Only the lead runs `openspec ids`.');
    expect(body).toContain('Write new rules without an ID tag.');
  });

  it('verifies with validate and trace check', () => {
    const verify = section('**Phase 5: Verify (lead)**', '**Guardrails**');
    expect(verify).toContain('openspec validate --specs --strict');
    expect(verify).toContain('openspec validate "<name>" --strict');
    expect(verify).toContain('openspec trace check --json');
  });

  it('starts helpers in parallel and falls back to sequential work', () => {
    expect(body).toContain('Start all helpers of a wave at the same time, in one message');
    expect(body).toContain(`Start at most ${SCAN_MAX_PARALLEL_HELPERS} helpers at a time`);
    expect(body).toContain('If your agent cannot start subagents, do the work of each helper yourself');
  });

  it('defines the helper roles in the command instead of agent definition files', () => {
    expect(body).toContain('Do not create agent definition files such as `.claude/agents/*.md`.');
    expect(body).toContain('You are a spec helper in an OpenSpec scan.');
    expect(body).toContain('You are a trace helper in an OpenSpec scan.');
  });

  it('writes main specs by default and a change with --as-change', () => {
    expect(body).toContain('`openspec/specs/<capability>/spec.feature`');
    expect(body).toContain('`openspec/changes/<name>/specs/<capability>/spec.feature`');
    expect(body).toContain('put the tag `@added` on the line above each new `Rule:`');
  });

  // Generated command files are committed in user repositories, and the trace
  // scanner reads every tracked file outside openspec/. A real-looking ID after
  // @trace in this text would be an orphan trace (or a false trace) in each of
  // them, so the examples use a placeholder.
  it('never writes a trace that the trace scanner would read', () => {
    for (const line of body.split('\n')) {
      if (!line.includes('@trace')) continue;
      expect(line, line).not.toMatch(/REQ-\d/);
    }
    expect(body).not.toMatch(/@trace(?::|[ \t]+)REQ-\d/);
  });

  it('names only CLI commands and flags that exist', () => {
    const invocations = [...body.matchAll(/`(openspec [^`]+)`/g)].map((match) => match[1]);
    expect(invocations.length).toBeGreaterThan(5);
    expect(invocations.flatMap(unknownCliParts)).toEqual([]);
  });

  it('holds no trace for the trace scanner', () => {
    expect(findTracesInText(body, 'scan')).toEqual([]);
  });

  it('refuses a store, which trace check cannot read', () => {
    expect(body).toContain('read `root.source` from `openspec list --specs --json`');
    expect(body).toContain('the scan does not support stores');
  });
});
