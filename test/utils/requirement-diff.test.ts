import { describe, it, expect } from 'vitest';
import { diffRequirementBlock } from '../../src/utils/requirement-diff.js';

describe('diffRequirementBlock', () => {
  it('produces a diff when base and delta differ', () => {
    const base = 'Rule: Foo\n  The system SHALL do A.\n\n  Scenario: A\n    When called\n    Then A';
    const delta = 'Rule: Foo\n  The system SHALL do B.\n\n  Scenario: A\n    When called\n    Then B';

    const diff = diffRequirementBlock(base, delta, 'test');
    expect(diff).toContain('-  The system SHALL do A.');
    expect(diff).toContain('+  The system SHALL do B.');
    // Keep range headers that locate each hunk, but omit synthetic file headers.
    expect(diff).not.toContain('Index:');
    expect(diff).not.toContain('---');
    expect(diff).not.toContain('+++');
    expect(diff).toContain('@@');
  });

  it('keeps separate range headers for distant changes', () => {
    const baseLines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
    const deltaLines = [...baseLines];
    deltaLines[0] = 'Changed first line';
    deltaLines[19] = 'Changed last line';

    const diff = diffRequirementBlock(baseLines.join('\n'), deltaLines.join('\n'), 'test');

    expect(diff.match(/^@@/gm)).toHaveLength(2);
    expect(diff).toContain('-Line 1');
    expect(diff).toContain('+Changed first line');
    expect(diff).toContain('-Line 20');
    expect(diff).toContain('+Changed last line');
  });

  it('shows all additions when base is null', () => {
    const delta = 'Rule: New\n  The system SHALL exist.\n\n  Scenario: Exists\n    When checked\n    Then exists';

    const diff = diffRequirementBlock(null, delta, 'test');
    expect(diff).toContain('+Rule: New');
    expect(diff).toContain('+  The system SHALL exist.');
    expect(diff).not.toContain('No newline');
  });

  it('preserves leading space on context lines before first change', () => {
    const base = 'Rule: Foo\n\nLine one.\n\nLine two.\n\nLine three.';
    const delta = 'Rule: Foo\n\nLine one.\n\nLine two changed.\n\nLine three.';

    const diff = diffRequirementBlock(base, delta, 'test');
    const lines = diff.split('\n');
    const contextLine = lines.find(l => l.endsWith('Line one.'))!;
    expect(contextLine.startsWith(' ')).toBe(true);
  });

  it('produces empty output for identical blocks', () => {
    const content = 'Rule: Same\n  The system SHALL stay.\n\n  Scenario: Same\n    When called\n    Then same';

    const diff = diffRequirementBlock(content, content, 'test');
    expect(diff).toBe('');
  });
});
