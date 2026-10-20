import { describe, expect, it } from 'vitest';
import {
  countDeltaEntries,
  hasDeltaOperations,
  parseDeltaFeature,
  stripOperationTags,
} from '../../../src/core/gherkin/delta.js';

const DELTA = [
  'Feature: Billing',
  '  Issue invoices and credit notes.',
  '',
  '  @added @REQ-0003',
  '  Rule: Refunds',
  '    The system SHALL refund a voided payment.',
  '',
  '  @Modified @REQ-0001',
  '  Rule: Invoices',
  '    The system SHALL issue an invoice for each paid order.',
  '',
  '  @REMOVED @REQ-0002',
  '  Rule: Credit notes',
  '',
  '  @REQ-0004',
  '  Rule: Untagged',
  '',
  '  @added @removed @REQ-0005',
  '  Rule: Both',
  '',
].join('\n');

describe('parseDeltaFeature', () => {
  const plan = parseDeltaFeature(DELTA);

  it('sorts rules by their operation tag, whatever its case', () => {
    expect(plan.added.map((entry) => entry.rule.id)).toEqual(['REQ-0003']);
    expect(plan.modified.map((entry) => entry.rule.id)).toEqual(['REQ-0001']);
    expect(plan.removed.map((entry) => entry.rule.id)).toEqual(['REQ-0002']);
    expect(countDeltaEntries(plan)).toBe(3);
  });

  it('keeps rules it cannot act on apart', () => {
    expect(plan.untagged.map((rule) => rule.name)).toEqual(['Untagged']);
    expect(plan.conflicting.map((rule) => rule.name)).toEqual(['Both']);
  });

  it('carries the raw rule block and the feature description', () => {
    expect(plan.added[0].raw).toBe(
      '  @added @REQ-0003\n  Rule: Refunds\n    The system SHALL refund a voided payment.'
    );
    expect(plan.purpose).toBe('Issue invoices and credit notes.');
  });

  it('has no purpose when the feature has no description', () => {
    expect(parseDeltaFeature('Feature: F\n\n  @added @REQ-0001\n  Rule: R\n').purpose).toBeUndefined();
  });
});

describe('hasDeltaOperations', () => {
  it('is true when any rule carries an operation tag', () => {
    expect(hasDeltaOperations(parseDeltaFeature(DELTA))).toBe(true);
  });

  it('is false for a main spec', () => {
    expect(hasDeltaOperations(parseDeltaFeature('Feature: F\n  P.\n\n  @REQ-0001\n  Rule: R\n'))).toBe(false);
  });
});

describe('stripOperationTags', () => {
  const strip = (raw: string) => {
    const [entry] = [...parseDeltaFeature(`Feature: F\n\n${raw}\n`).added, ...parseDeltaFeature(`Feature: F\n\n${raw}\n`).modified];
    return stripOperationTags(entry.raw, entry.rule);
  };

  it('removes the operation tag and keeps the others', () => {
    expect(strip('  @added @REQ-0001 @notrace\n  Rule: R')).toBe('  @REQ-0001 @notrace\n  Rule: R');
  });

  it('drops a tag line left empty', () => {
    expect(strip('  @modified\n  @REQ-0001\n  Rule: R')).toBe('  @REQ-0001\n  Rule: R');
  });

  it('keeps a comment at the end of a tag line', () => {
    expect(strip('  @added @REQ-0001 # new in 2.0\n  Rule: R')).toBe('  @REQ-0001 # new in 2.0\n  Rule: R');
    expect(strip('  @added # new in 2.0\n  @REQ-0001\n  Rule: R')).toBe('  # new in 2.0\n  @REQ-0001\n  Rule: R');
  });

  it('does not touch text that only looks like a tag', () => {
    expect(strip('  @added @REQ-0001\n  Rule: R\n    The @added flag SHALL stay in the text.')).toBe(
      '  @REQ-0001\n  Rule: R\n    The @added flag SHALL stay in the text.'
    );
  });
});
