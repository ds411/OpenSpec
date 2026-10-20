import { describe, it, expect } from 'vitest';
import { parseDeltaSpec } from '../../../src/core/parsers/requirement-blocks.js';

/**
 * The RENAMED reader used to carry one mutable `{ from, to }` and drop whatever
 * did not fit, with nothing recording the loss: a requested rename could
 * silently not happen, and interleaved FROM/TO lines could rename a requirement
 * the delta never named, under a name written for a different one. Every
 * unpaired line is now reported, and the merge refuses rather than guessing.
 */
describe('parseDeltaSpec (RENAMED pairing)', () => {
  /** Parse a delta whose only section is `## RENAMED Requirements`. */
  const renamed = (...lines: string[]) =>
    parseDeltaSpec(['## RENAMED Requirements', '', ...lines].join('\n'));

  it('pairs FROM/TO written in the documented order', () => {
    const plan = renamed(
      '- FROM: `### Requirement: Late Fees`',
      '- TO: `### Requirement: Overdue Penalties`'
    );
    expect(plan.renamed).toEqual([{ from: 'Late Fees', to: 'Overdue Penalties' }]);
    expect(plan.unpairedRenames).toEqual([]);
  });

  it('pairs several consecutive renames', () => {
    const plan = renamed(
      '- FROM: `### Requirement: A`',
      '- TO: `### Requirement: B`',
      '- FROM: `### Requirement: C`',
      '- TO: `### Requirement: D`'
    );
    expect(plan.renamed).toEqual([
      { from: 'A', to: 'B' },
      { from: 'C', to: 'D' },
    ]);
    expect(plan.unpairedRenames).toEqual([]);
  });

  it('reports a TO written before its FROM instead of dropping the rename', () => {
    const plan = renamed(
      '- TO: `### Requirement: Overdue Penalties`',
      '- FROM: `### Requirement: Late Fees`'
    );
    expect(plan.renamed).toEqual([]);
    expect(plan.unpairedRenames).toEqual([
      { side: 'TO', name: 'Overdue Penalties', line: 3 },
      { side: 'FROM', name: 'Late Fees', line: 4 },
    ]);
  });

  it('reports the FROM that a second FROM displaced', () => {
    const plan = renamed(
      '- FROM: `### Requirement: Invoice Generation`',
      '- FROM: `### Requirement: Late Fees`',
      '- TO: `### Requirement: Overdue Penalties`'
    );
    expect(plan.renamed).toEqual([{ from: 'Late Fees', to: 'Overdue Penalties' }]);
    expect(plan.unpairedRenames).toEqual([
      { side: 'FROM', name: 'Invoice Generation', line: 3 },
    ]);
  });

  it('reports a trailing FROM that never receives a TO', () => {
    const plan = renamed(
      '- FROM: `### Requirement: Late Fees`',
      '- TO: `### Requirement: Overdue Penalties`',
      '- FROM: `### Requirement: Invoice Generation`'
    );
    expect(plan.renamed).toEqual([{ from: 'Late Fees', to: 'Overdue Penalties' }]);
    expect(plan.unpairedRenames).toEqual([
      { side: 'FROM', name: 'Invoice Generation', line: 5 },
    ]);
  });

  it('reports both stragglers when FROM/TO lines interleave', () => {
    const plan = renamed(
      '- FROM: `### Requirement: Late Fees`',
      '- FROM: `### Requirement: Invoice Generation`',
      '- TO: `### Requirement: Overdue Penalties`',
      '- TO: `### Requirement: Invoice Creation`'
    );
    expect(plan.unpairedRenames).toEqual([
      { side: 'FROM', name: 'Late Fees', line: 3 },
      { side: 'TO', name: 'Invoice Creation', line: 6 },
    ]);
  });

  it('ignores FROM/TO lines inside a code fence', () => {
    const plan = renamed(
      '```markdown',
      '- FROM: `### Requirement: Example`',
      '- TO: `### Requirement: Other`',
      '```'
    );
    expect(plan.renamed).toEqual([]);
    expect(plan.unpairedRenames).toEqual([]);
  });

  it('reports nothing for a RENAMED section with no FROM/TO lines', () => {
    const plan = renamed('Nothing to rename yet.');
    expect(plan.renamed).toEqual([]);
    expect(plan.unpairedRenames).toEqual([]);
  });

  it('reports nothing when there is no RENAMED section at all', () => {
    const plan = parseDeltaSpec(
      ['## ADDED Requirements', '### Requirement: A', 'a'].join('\n')
    );
    expect(plan.unpairedRenames).toEqual([]);
  });

  it('never pairs a FROM in one RENAMED header copy with a TO in another', () => {
    const plan = parseDeltaSpec(
      [
        '## RENAMED Requirements',
        '',
        '- FROM: `### Requirement: Late Fees`',
        '',
        '## RENAMED Requirements',
        '',
        '- TO: `### Requirement: Overdue Penalties`',
      ].join('\n')
    );
    expect(plan.renamed).toEqual([]);
    expect(plan.unpairedRenames).toEqual([
      { side: 'FROM', name: 'Late Fees', line: 3 },
      { side: 'TO', name: 'Overdue Penalties', line: 7 },
    ]);
  });

  it('reports unpaired lines written with `*` or `+` bullets', () => {
    const plan = renamed(
      '* FROM: `### Requirement: Late Fees`',
      '+ FROM: `### Requirement: Invoice Generation`',
      '* TO: `### Requirement: Overdue Penalties`'
    );
    expect(plan.renamed).toEqual([{ from: 'Invoice Generation', to: 'Overdue Penalties' }]);
    expect(plan.unpairedRenames).toEqual([{ side: 'FROM', name: 'Late Fees', line: 3 }]);
  });
});
