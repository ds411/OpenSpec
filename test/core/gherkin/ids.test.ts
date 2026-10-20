import { describe, expect, it } from 'vitest';
import {
  compareRequirementIds,
  findRequirementIdTags,
  formatRequirementId,
  isRequirementId,
  REQUIREMENT_ID_PATTERN_SOURCE,
  requirementIdNumber,
} from '../../../src/core/gherkin/ids.js';

describe('requirement IDs', () => {
  it('accepts REQ- with at least four digits', () => {
    expect(isRequirementId('REQ-0001')).toBe(true);
    expect(isRequirementId('REQ-12345')).toBe(true);
    expect(isRequirementId('REQ-001')).toBe(false);
    expect(isRequirementId('@REQ-0001')).toBe(false);
    expect(isRequirementId('req-0001')).toBe(false);
    expect(isRequirementId('REQ-0001a')).toBe(false);
  });

  it('formats a number with four digits at least', () => {
    expect(formatRequirementId(1)).toBe('REQ-0001');
    expect(formatRequirementId(9999)).toBe('REQ-9999');
    expect(formatRequirementId(10000)).toBe('REQ-10000');
    expect(() => formatRequirementId(0)).toThrow(/positive integer/);
    expect(() => formatRequirementId(1.5)).toThrow(/positive integer/);
  });

  it('reads the number back out of an ID', () => {
    expect(requirementIdNumber('REQ-0042')).toBe(42);
    expect(requirementIdNumber('REQ-10000')).toBe(10000);
    expect(requirementIdNumber('TASK-0042')).toBeUndefined();
  });

  it('sorts IDs by number, not as text', () => {
    expect(['REQ-10000', 'REQ-0002', 'REQ-9999'].sort(compareRequirementIds)).toEqual([
      'REQ-0002',
      'REQ-9999',
      'REQ-10000',
    ]);
  });

  it('exposes a pattern source that matches one ID', () => {
    const pattern = new RegExp(`^${REQUIREMENT_ID_PATTERN_SOURCE}$`);
    expect(pattern.test('REQ-0001')).toBe(true);
    expect(pattern.test('REQ-01')).toBe(false);
  });
});

describe('findRequirementIdTags', () => {
  it('finds every ID tag in order, with repeats', () => {
    expect(findRequirementIdTags('@added @REQ-0002\n  @REQ-0001 @notrace\n@REQ-0002')).toEqual([
      'REQ-0002',
      'REQ-0001',
      'REQ-0002',
    ]);
  });

  it('ignores IDs that are not tags', () => {
    expect(findRequirementIdTags('see REQ-0001, mail a@REQ-0002, @@REQ-0003, @REQ-0004x, @REQ-0005-b')).toEqual([]);
  });
});
