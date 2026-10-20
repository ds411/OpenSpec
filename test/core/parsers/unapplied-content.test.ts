import { describe, it, expect } from 'vitest';
import { parseDeltaSpec } from '../../../src/core/parsers/requirement-blocks.js';

// Archive carries requirement blocks only. Text written anywhere else in a delta
// used to vanish with no warning while `validate --strict` passed.
const DELTA = [
  '# billing delta', // 1 - a title is not reported
  'Context above the first section.', // 2
  '## ADDED Requirements', // 3
  'Intro prose.', // 4
  '### Requirement: Invoices', // 5
  'The system SHALL generate invoices.', // 6
  '', // 7
  '#### Scenario: Period closes', // 8
  '- **WHEN** a', // 9
  '- **THEN** b', // 10
  'Trailing note, carried with the block.', // 11
  '## Acceptance Criteria', // 12
  '- Invoices reconcile.', // 13
].join('\n');

describe('parseDeltaSpec unappliedContent', () => {
  it('reports text above the first section, leading prose, and non-delta sections', () => {
    expect(parseDeltaSpec(DELTA).unappliedContent).toEqual([
      { section: null, line: 2 },
      { section: 'ADDED Requirements', line: 4 },
      { section: 'Acceptance Criteria', line: 12 },
    ]);
  });

  it('does not exempt a commented-out Purpose, and honours the --!> terminator', () => {
    const plan = parseDeltaSpec(
      ['<!--', '## Purpose', '--!>', 'Real prose.', '## ADDED Requirements', '### Requirement: A', 'a', '## Notes', 'n'].join(
        '\n'
      )
    );
    expect(plan.unappliedContent).toEqual([
      { section: 'Purpose', line: 2 },
      { section: 'Notes', line: 8 },
    ]);
  });

  // The merge splits sections on every `## ` line outside a fence, comment or not.
  // Reading boundaries from comment-masked lines disagreed with it both ways.
  it('reads section boundaries exactly as the merge does', () => {
    // `<!--` in inline code and a later `-->` are not a comment to the merge;
    // masking across them hid `## ADDED Requirements` and blamed a carried requirement.
    const inlineOpener = parseDeltaSpec(
      ['# Delta: strip `<!--` openers', '## ADDED Requirements', '### Requirement: A', 'Flow: ingest --> render', 'The system SHALL a.'].join('\n')
    );
    expect(inlineOpener.added.map((b) => b.name)).toEqual(['A']);
    expect(inlineOpener.unappliedContent).toEqual([]);

    // A header inside a comment is still a section to the merge, so the
    // requirement after the comment is carried, not text above the first section.
    const commentedHeader = parseDeltaSpec(
      ['<!-- add requirements below', '## ADDED Requirements', '-->', '### Requirement: A', 'The system SHALL a.'].join('\n')
    );
    expect(commentedHeader.added.map((b) => b.name)).toEqual(['A']);
    expect(commentedHeader.unappliedContent).toEqual([]);

    // ...and text after a commented-out `## Notes` is dropped by the merge.
    const commentedNotes = parseDeltaSpec(
      ['## ADDED Requirements', '### Requirement: A', 'a', '<!--', '## Notes', '-->', 'Dropped.'].join('\n')
    );
    expect(commentedNotes.added[0].raw).not.toContain('Dropped.');
    expect(commentedNotes.unappliedContent).toEqual([{ section: 'Notes', line: 5 }]);
  });

  it('does not let a `<!--` inside a code fence hide later sections', () => {
    const plan = parseDeltaSpec(
      ['## ADDED Requirements', '### Requirement: A', 'a', '```html', '<!-- unterminated sample', '```', '## Notes', 'Dropped.'].join('\n')
    );
    expect(plan.unappliedContent).toEqual([{ section: 'Notes', line: 7 }]);
  });

  it('ignores Purpose, REMOVED/RENAMED bodies, HTML comments, fences, and stray ### headers', () => {
    const plan = parseDeltaSpec(
      [
        '<!--',
        'Multi-line instructions.',
        '-->',
        '## Purpose',
        'A new capability.',
        '## ADDED Requirements',
        '<!-- add requirements below -->',
        '### Documentation Requirements',
        '### Requirement: A',
        'a',
        '```markdown',
        '## Notes',
        '```',
        '## REMOVED Requirements',
        '### Requirement: B',
        '**Reason**: obsolete',
        '## RENAMED Requirements',
        '- FROM: `### Requirement: C`',
        '- TO: `### Requirement: D`',
      ].join('\n')
    );
    expect(plan.unappliedContent).toEqual([]);
  });
});
