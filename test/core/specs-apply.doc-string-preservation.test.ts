import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { buildUpdatedSpec, findSpecUpdates } from '../../src/core/specs-apply.js';

/**
 * Archive splices rules into the main spec as written, so a doc string keeps
 * every line, blank line and indent. That matters for whitespace-significant
 * content (YAML block scalars, Python, expected output) that a requirement
 * documents as a sample.
 */
describe('buildUpdatedSpec (doc string preservation)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-doc-string-'));
  });
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const INVOICE_RULE = [
    '  @REQ-0001',
    '  Rule: Invoice Generation',
    '    The system SHALL generate an invoice for every completed billing period.',
    '',
    '    Scenario: Period closes',
    '      When a billing period closes',
    '      Then an invoice is generated',
  ].join('\n');

  const MAIN_SPEC = ['Feature: Billing', '  Defines how billing behaves for customers and operators.', '', INVOICE_RULE, ''].join(
    '\n'
  );

  /**
   * Write a main spec and a delta into a temp project, then run the merge and
   * return its result without touching any real project.
   */
  async function build(deltaBody: string, mainSpec = MAIN_SPEC) {
    const specsRoot = path.join(tempDir, 'openspec', 'specs');
    const specsDir = path.join(specsRoot, 'billing');
    const changeDir = path.join(tempDir, 'openspec', 'changes', 'c');
    await fs.mkdir(specsDir, { recursive: true });
    await fs.mkdir(path.join(changeDir, 'specs', 'billing'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'spec.feature'), mainSpec);
    await fs.writeFile(path.join(changeDir, 'specs', 'billing', 'spec.feature'), deltaBody);
    const [update] = await findSpecUpdates(changeDir, specsRoot);
    return buildUpdatedSpec(update, 'c', { silent: true });
  }

  /** An @added delta whose scenario ends in the given doc string lines. */
  const withDocString = (...lines: string[]) =>
    [
      'Feature: Billing',
      '',
      '  @added @REQ-0002',
      '  Rule: Config Example',
      '    The system SHALL document the config file.',
      '',
      '    Scenario: Sample config',
      '      When an operator reads the spec',
      '      Then they see:',
      ...lines.map((line) => (line === '' ? '' : `        ${line}`)),
      '',
    ].join('\n');

  it('preserves two blank lines inside a doc string', async () => {
    const built = await build(withDocString('"""yaml', 'a: 1', '', '', 'b: 2', '"""'));
    expect(built.rebuilt).toContain('a: 1\n\n\n        b: 2');
  });

  it('preserves a longer blank run inside a doc string', async () => {
    const built = await build(withDocString('"""yaml', 'a: 1', '', '', '', '', 'b: 2', '"""'));
    expect(built.rebuilt).toContain('a: 1\n\n\n\n\n        b: 2');
  });

  it('preserves blank lines inside a backtick doc string', async () => {
    const built = await build(withDocString('```yaml', 'a: 1', '', '', 'b: 2', '```'));
    expect(built.rebuilt).toContain('a: 1\n\n\n        b: 2');
  });

  it('preserves indentation-sensitive content inside a doc string', async () => {
    const built = await build(withDocString('"""python', 'def a():', '    pass', '', '', 'def b():', '    pass', '"""'));
    expect(built.rebuilt).toContain('def a():\n            pass\n\n\n        def b():');
  });

  it('appends a plain @added rule and leaves the rest of the spec byte-identical', async () => {
    const built = await build(
      [
        'Feature: Billing',
        '',
        '  @added @REQ-0002',
        '  Rule: Plain',
        '    The system SHALL be plain.',
        '',
        '    Scenario: Plain',
        '      When a',
        '      Then b',
        '',
      ].join('\n')
    );
    expect(built.rebuilt).toBe(
      [
        'Feature: Billing',
        '  Defines how billing behaves for customers and operators.',
        '',
        INVOICE_RULE,
        '',
        '  @REQ-0002',
        '  Rule: Plain',
        '    The system SHALL be plain.',
        '',
        '    Scenario: Plain',
        '      When a',
        '      Then b',
        '',
      ].join('\n')
    );
  });

  it('preserves doc string blank lines carried in from the existing main spec', async () => {
    const mainWithDocString = [
      'Feature: Billing',
      '  Defines how billing behaves for customers and operators.',
      '',
      '  @REQ-0001',
      '  Rule: Existing Sample',
      '    The system SHALL document the sample.',
      '',
      '    Scenario: Sample',
      '      Then they see:',
      '        """yaml',
      '        x: 1',
      '',
      '',
      '        y: 2',
      '        """',
      '',
    ].join('\n');

    const built = await build(
      [
        'Feature: Billing',
        '',
        '  @added @REQ-0002',
        '  Rule: Unrelated',
        '    The system SHALL add something unrelated.',
        '',
        '    Scenario: Unrelated',
        '      When a',
        '      Then b',
        '',
      ].join('\n'),
      mainWithDocString
    );
    expect(built.rebuilt).toContain('x: 1\n\n\n        y: 2');
  });
});
