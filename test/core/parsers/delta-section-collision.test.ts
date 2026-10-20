import { describe, it, expect } from 'vitest';
import { parseDeltaSpec } from '../../../src/core/parsers/requirement-blocks.js';

/**
 * A delta file may write the same delta header more than once, and may spell it
 * with different casing. Sections used to be collected into a title-keyed
 * record, so a repeat overwrote the earlier body (last wins) and a case variant
 * was skipped by the first-match lookup (first wins). Either way the discarded
 * requirements were gone before validation or the merge could see them, so
 * `validate` passed and `archive` reported success having applied less than the
 * author wrote.
 */
describe('parseDeltaSpec (repeated delta section headers)', () => {
  it('applies both ADDED sections when the header is repeated', () => {
    const plan = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '### Requirement: First',
        'The system SHALL do the first thing.',
        '',
        '#### Scenario: One',
        '- **WHEN** a',
        '- **THEN** b',
        '',
        '## ADDED Requirements',
        '### Requirement: Second',
        'The system SHALL do the second thing.',
        '',
        '#### Scenario: Two',
        '- **WHEN** c',
        '- **THEN** d',
      ].join('\n')
    );

    expect(plan.added.map((block) => block.name)).toEqual(['First', 'Second']);
  });

  it('applies both ADDED sections when the two headers differ only in case', () => {
    const plan = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '### Requirement: First',
        'The system SHALL do the first thing.',
        '',
        '## Added Requirements',
        '### Requirement: Second',
        'The system SHALL do the second thing.',
      ].join('\n')
    );

    expect(plan.added.map((block) => block.name)).toEqual(['First', 'Second']);
  });

  it('applies every copy when the header appears three times', () => {
    const plan = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '### Requirement: First',
        'a',
        '## ADDED REQUIREMENTS',
        '### Requirement: Second',
        'b',
        '## added requirements',
        '### Requirement: Third',
        'c',
      ].join('\n')
    );

    expect(plan.added.map((block) => block.name)).toEqual(['First', 'Second', 'Third']);
  });

  it('applies copies that are separated by an unrelated section', () => {
    const plan = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '### Requirement: First',
        'a',
        '## MODIFIED Requirements',
        '### Requirement: Existing',
        'b',
        '## ADDED Requirements',
        '### Requirement: Second',
        'c',
      ].join('\n')
    );

    expect(plan.added.map((block) => block.name)).toEqual(['First', 'Second']);
    expect(plan.modified.map((block) => block.name)).toEqual(['Existing']);
  });

  it('collects REMOVED names from every copy of the header', () => {
    const plan = parseDeltaSpec(
      [
        '## REMOVED Requirements',
        '### Requirement: First',
        '**Reason**: gone',
        '',
        '## REMOVED Requirements',
        '### Requirement: Second',
        '**Reason**: also gone',
      ].join('\n')
    );

    expect(plan.removed).toEqual(['First', 'Second']);
    expect(plan.removedBlocks.map((block) => block.name)).toEqual(['First', 'Second']);
  });

  it('collects RENAMED pairs from every copy of the header', () => {
    const plan = parseDeltaSpec(
      [
        '## RENAMED Requirements',
        '',
        '- FROM: `### Requirement: A`',
        '- TO: `### Requirement: B`',
        '',
        '## RENAMED Requirements',
        '',
        '- FROM: `### Requirement: C`',
        '- TO: `### Requirement: D`',
      ].join('\n')
    );

    expect(plan.renamed).toEqual([
      { from: 'A', to: 'B' },
      { from: 'C', to: 'D' },
    ]);
  });

  it('never pairs a FROM in one section with a TO in another', () => {
    const plan = parseDeltaSpec(
      [
        '## RENAMED Requirements',
        '',
        '- FROM: `### Requirement: A`',
        '',
        '## RENAMED Requirements',
        '',
        '- TO: `### Requirement: B`',
      ].join('\n')
    );

    // Each section is read on its own, so a dangling FROM cannot silently
    // capture an unrelated TO written under a different header.
    expect(plan.renamed).toEqual([]);
  });

  it('reports skipped headers with the line number of the copy they came from', () => {
    const plan = parseDeltaSpec(
      [
        '## ADDED Requirements', // 1
        '### Requirement: First', // 2
        'a', // 3
        '', // 4
        '## ADDED Requirements', // 5
        '### Notes go here', // 6
        '### Requirement: Second', // 7
        'b', // 8
      ].join('\n')
    );

    expect(plan.added.map((block) => block.name)).toEqual(['First', 'Second']);
    expect(plan.skippedHeaders).toHaveLength(1);
    expect(plan.skippedHeaders[0].header).toBe('Notes go here');
    expect(plan.skippedHeaders[0].line).toBe(6);
  });

  it('still ignores a delta header that only appears inside a code fence', () => {
    const plan = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '### Requirement: Only One',
        'The system SHALL document the delta format.',
        '',
        '#### Scenario: Example',
        '- **THEN** it reads:',
        '',
        '```markdown',
        '## ADDED Requirements',
        '### Requirement: Not Real',
        '```',
      ].join('\n')
    );

    expect(plan.added.map((block) => block.name)).toEqual(['Only One']);
  });

  it('leaves a single section of each kind behaving exactly as before', () => {
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

    expect(plan.added.map((b) => b.name)).toEqual(['A']);
    expect(plan.modified.map((b) => b.name)).toEqual(['B']);
    expect(plan.removed).toEqual(['C']);
    expect(plan.renamed).toEqual([{ from: 'D', to: 'E' }]);
    expect(plan.sectionPresence).toEqual({
      added: true,
      modified: true,
      removed: true,
      renamed: true,
    });
  });

  it('reports section presence for a delta header that follows another section', () => {
    const plan = parseDeltaSpec(
      [
        '## Purpose',
        'A capability that does not exist yet.',
        '',
        '## ADDED Requirements',
        '### Requirement: A',
        'a',
      ].join('\n')
    );

    // The lookup now scans a list rather than reading one keyed entry, so a
    // delta header preceded by a non-matching section is still found.
    expect(plan.sectionPresence.added).toBe(true);
    expect(plan.added.map((block) => block.name)).toEqual(['A']);
    expect(plan.sectionPresence.removed).toBe(false);
  });
});
