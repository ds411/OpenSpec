import { describe, it, expect } from 'vitest';
import { parseDeltaSpec } from '../../../src/core/parsers/requirement-blocks.js';

/**
 * A canonical `### Requirement:` block written outside every delta section is
 * ignored by the reader. It used to be ignored in complete silence, which is
 * inconsistent with the adjacent mistake: a non-canonical `###` header INSIDE a
 * delta section has been reported as INFO since #498. The well-formed block in
 * the wrong place - the costlier error, because it reads exactly like one that
 * would apply - said nothing at all.
 */
describe('parseDeltaSpec (requirements outside delta sections)', () => {
  it('reports a requirement under an unrecognised section', () => {
    const plan = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '### Requirement: Applied',
        'a',
        '',
        '## Notes',
        '### Requirement: Ignored',
        'b',
      ].join('\n')
    );

    expect(plan.added.map((b) => b.name)).toEqual(['Applied']);
    expect(plan.orphanedRequirements).toEqual([
      { name: 'Ignored', section: 'Notes', line: 6 },
    ]);
  });

  it('reports a requirement written above the first section', () => {
    const plan = parseDeltaSpec(
      ['### Requirement: Stray', 'a', '', '## ADDED Requirements', '### Requirement: Applied', 'b'].join(
        '\n'
      )
    );

    expect(plan.added.map((b) => b.name)).toEqual(['Applied']);
    expect(plan.orphanedRequirements).toEqual([
      { name: 'Stray', section: null, line: 1 },
    ]);
  });

  it('reports a requirement under a misspelled delta header', () => {
    const plan = parseDeltaSpec(
      ['## Add Requirements', '### Requirement: Typo Section', 'a'].join('\n')
    );

    expect(plan.added).toEqual([]);
    expect(plan.orphanedRequirements).toEqual([
      { name: 'Typo Section', section: 'Add Requirements', line: 2 },
    ]);
  });

  it('reports several orphans in document order', () => {
    const plan = parseDeltaSpec(
      [
        '## Notes',
        '### Requirement: One',
        '## ADDED Requirements',
        '### Requirement: Applied',
        '## Context',
        '### Requirement: Two',
      ].join('\n')
    );

    expect(plan.orphanedRequirements.map((o) => [o.name, o.line])).toEqual([
      ['One', 2],
      ['Two', 6],
    ]);
  });

  it('reports nothing when every requirement sits in a delta section', () => {
    const plan = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '### Requirement: A',
        'a',
        '## MODIFIED Requirements',
        '### Requirement: B',
        'b',
        '## REMOVED Requirements',
        '### Requirement: C',
        '## RENAMED Requirements',
        '- FROM: `### Requirement: D`',
        '- TO: `### Requirement: E`',
      ].join('\n')
    );

    expect(plan.orphanedRequirements).toEqual([]);
  });

  it('accepts every casing of the delta headers without reporting', () => {
    const plan = parseDeltaSpec(
      ['## added requirements', '### Requirement: A', '## Modified Requirements', '### Requirement: B'].join(
        '\n'
      )
    );
    expect(plan.orphanedRequirements).toEqual([]);
  });

  it('does not report a requirement shown inside a code fence', () => {
    const plan = parseDeltaSpec(
      [
        '## Notes',
        'An example of the format:',
        '',
        '```markdown',
        '### Requirement: Just An Example',
        '```',
      ].join('\n')
    );

    expect(plan.orphanedRequirements).toEqual([]);
  });

  it('does not report a delta section that legitimately has a Purpose above it', () => {
    const plan = parseDeltaSpec(
      [
        '## Purpose',
        'Describes a brand new capability.',
        '',
        '## ADDED Requirements',
        '### Requirement: A',
        'a',
      ].join('\n')
    );

    expect(plan.orphanedRequirements).toEqual([]);
  });

  it('reports a requirement under a header the reader does not match exactly', () => {
    // The reader folds only case, so a doubled space is not a delta section to
    // it. Treating the header as one here would drop the block silently again.
    const plan = parseDeltaSpec(
      ['## ADDED  Requirements', '### Requirement: Spaced', 'a'].join('\n')
    );

    expect(plan.added).toEqual([]);
    expect(plan.orphanedRequirements).toEqual([
      { name: 'Spaced', section: 'ADDED  Requirements', line: 2 },
    ]);
  });

  it('does not report requirements under a repeated delta header', () => {
    const plan = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '### Requirement: First',
        'a',
        '',
        '## Notes',
        'prose only',
        '',
        '## ADDED Requirements',
        '### Requirement: Second',
        'b',
      ].join('\n')
    );

    expect(plan.added.map((b) => b.name)).toEqual(['First', 'Second']);
    expect(plan.orphanedRequirements).toEqual([]);
  });
});
