import { describe, it, expect } from 'vitest';
import {
  extractRequirementsSection,
  normalizeRequirementName,
  parseDeltaSpec,
} from '../../../src/core/parsers/requirement-blocks.js';
import { findMainSpecStructureIssues } from '../../../src/core/parsers/spec-structure.js';

const NBSP = String.fromCharCode(0xa0);

/**
 * CommonMark lets an ATX heading end in a closing run of `#`s, so
 * `### Requirement: Late Fees ###` renders as the same heading as
 * `### Requirement: Late Fees`. Requirement names kept the run, so a REMOVED
 * written that way looked for "Late Fees ###", missed the requirement, and
 * archive skipped the removal with a false "treating it as already removed"
 * warning. Scenario names already dropped the run; requirement names now do too.
 */
describe('requirement names with a CommonMark closing sequence', () => {
  describe('normalizeRequirementName', () => {
    it.each([
      ['Late Fees ###', 'Late Fees'],
      ['Late Fees #', 'Late Fees'],
      ['Late Fees \t##  ', 'Late Fees'],
      ['  Late Fees  ', 'Late Fees'],
    ])('strips the closing run from %j', (input, expected) => {
      expect(normalizeRequirementName(input)).toBe(expected);
    });

    it.each([
      // Not a closing sequence: the run must be preceded by a space or tab.
      ['C#', 'C#'],
      ['Foo##', 'Foo##'],
      // Not a closing sequence: the run must end the line.
      ['Priority #1', 'Priority #1'],
      // CommonMark does not treat NBSP as the separator, so the run stays.
      [`Late Fees${NBSP}###`, `Late Fees${NBSP}###`],
    ])('keeps %j unchanged', (input, expected) => {
      expect(normalizeRequirementName(input)).toBe(expected);
    });
  });

  describe('readers', () => {
    it('names a closed main-spec heading by its rendered text', () => {
      const parts = extractRequirementsSection(
        ['## Requirements', '### Requirement: Late Fees ###', 'The system SHALL charge late fees.', ''].join('\n')
      );
      expect(parts.bodyBlocks.map((b) => b.name)).toEqual(['Late Fees']);
    });

    it('reads every delta section header form without the closing run', () => {
      const plan = parseDeltaSpec(
        [
          '## ADDED Requirements',
          '### Requirement: Credit Notes ##',
          'The system SHALL issue credit notes.',
          '',
          '## MODIFIED Requirements',
          '### Requirement: Invoice Generation ###',
          'The system SHALL generate invoices.',
          '',
          '## REMOVED Requirements',
          '### Requirement: Late Fees ###',
          '- `### Requirement: Grace Period ###`',
          '',
          '## RENAMED Requirements',
          '- FROM: `### Requirement: Refunds ###`',
          '- TO: `### Requirement: Credit Refunds ###`',
          '',
        ].join('\n')
      );
      expect(plan.added.map((b) => b.name)).toEqual(['Credit Notes']);
      expect(plan.modified.map((b) => b.name)).toEqual(['Invoice Generation']);
      expect(plan.removed).toEqual(['Late Fees', 'Grace Period']);
      expect(plan.renamed).toEqual([{ from: 'Refunds', to: 'Credit Refunds' }]);
    });

    it('reports a closed and an open heading of one requirement as duplicates', () => {
      const issues = findMainSpecStructureIssues(
        [
          '## Requirements',
          '### Requirement: Late Fees',
          'The system SHALL charge late fees.',
          '',
          '### Requirement: Late Fees ###',
          'The system SHALL charge late fees again.',
          '',
        ].join('\n')
      );
      expect(issues.map((issue) => issue.kind)).toEqual(['duplicate-requirement']);
    });

    it('does not report distinct names as duplicates (control)', () => {
      const issues = findMainSpecStructureIssues(
        ['## Requirements', '### Requirement: C', 'x', '', '### Requirement: C#', 'y', ''].join('\n')
      );
      expect(issues).toEqual([]);
    });
  });

});
