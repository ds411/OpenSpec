import { describe, it, expect } from 'vitest';
import { parseDeltaSpec } from '../../../src/core/parsers/requirement-blocks.js';

/**
 * CommonMark bullet lists may open with `-`, `*` or `+`. The REMOVED bullet form
 * and the RENAMED FROM:/TO: form used to match only `-`, so a removal or rename
 * written with either of the other two markers matched nothing: the operation
 * silently never happened while `validate` passed and `archive` exited 0
 * reporting success. The project already accepts more than one marker elsewhere
 * (`TASK_LINE_PATTERN` in utils/task-progress.ts allows `-` and `*`).
 */
const MARKERS = ['-', '*', '+'] as const;

describe('parseDeltaSpec (REMOVED list markers)', () => {
  for (const marker of MARKERS) {
    it(`accepts the "${marker}" marker`, () => {
      const plan = parseDeltaSpec(
        ['## REMOVED Requirements', '', `${marker} \`### Requirement: Late Fees\``].join('\n')
      );
      expect(plan.removed).toEqual(['Late Fees']);
    });

    it(`accepts the "${marker}" marker without backticks`, () => {
      const plan = parseDeltaSpec(
        ['## REMOVED Requirements', '', `${marker} ### Requirement: Late Fees`].join('\n')
      );
      expect(plan.removed).toEqual(['Late Fees']);
    });

    it(`accepts the "${marker}" marker when the entry is indented`, () => {
      const plan = parseDeltaSpec(
        ['## REMOVED Requirements', '', `   ${marker} \`### Requirement: Late Fees\``].join('\n')
      );
      expect(plan.removed).toEqual(['Late Fees']);
    });
  }

  it('still reads the plain header form', () => {
    const plan = parseDeltaSpec(
      ['## REMOVED Requirements', '', '### Requirement: Late Fees', '**Reason**: gone'].join('\n')
    );
    expect(plan.removed).toEqual(['Late Fees']);
  });

  it('still ignores bullets inside a code fence', () => {
    const plan = parseDeltaSpec(
      [
        '## REMOVED Requirements',
        '',
        '```markdown',
        '* `### Requirement: Example`',
        '```',
        '',
        '- `### Requirement: Real One`',
      ].join('\n')
    );
    expect(plan.removed).toEqual(['Real One']);
  });

  it('does not treat an emphasised line as a bullet', () => {
    const plan = parseDeltaSpec(
      ['## REMOVED Requirements', '', '**Reason**: `### Requirement: Not A Bullet`'].join('\n')
    );
    expect(plan.removed).toEqual([]);
  });
});

describe('parseDeltaSpec (RENAMED list markers)', () => {
  for (const marker of MARKERS) {
    it(`accepts the "${marker}" marker`, () => {
      const plan = parseDeltaSpec(
        [
          '## RENAMED Requirements',
          '',
          `${marker} FROM: \`### Requirement: Late Fees\``,
          `${marker} TO: \`### Requirement: Overdue Penalties\``,
        ].join('\n')
      );
      expect(plan.renamed).toEqual([{ from: 'Late Fees', to: 'Overdue Penalties' }]);
    });
  }

  it('accepts a mix of markers across the two lines', () => {
    const plan = parseDeltaSpec(
      [
        '## RENAMED Requirements',
        '',
        '* FROM: `### Requirement: Late Fees`',
        '+ TO: `### Requirement: Overdue Penalties`',
      ].join('\n')
    );
    expect(plan.renamed).toEqual([{ from: 'Late Fees', to: 'Overdue Penalties' }]);
  });

  it('still accepts FROM/TO with no bullet at all', () => {
    const plan = parseDeltaSpec(
      [
        '## RENAMED Requirements',
        '',
        'FROM: `### Requirement: Late Fees`',
        'TO: `### Requirement: Overdue Penalties`',
      ].join('\n')
    );
    expect(plan.renamed).toEqual([{ from: 'Late Fees', to: 'Overdue Penalties' }]);
  });

  it('still ignores FROM/TO inside a code fence', () => {
    const plan = parseDeltaSpec(
      [
        '## RENAMED Requirements',
        '',
        '```markdown',
        '* FROM: `### Requirement: Example`',
        '* TO: `### Requirement: Other`',
        '```',
      ].join('\n')
    );
    expect(plan.renamed).toEqual([]);
  });
});
