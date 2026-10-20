import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildUpdatedSpec, findSpecUpdates } from '../../src/core/specs-apply.js';

const ORIGINAL_REQUIREMENT = [
  '  @REQ-0001',
  '  Rule: Existing behavior',
  '    The project SHALL expose the original behavior.',
  '',
  '    Scenario: Existing path',
  '      When the behavior is exercised',
  '      Then it SHALL remain available',
].join('\n');

const UPDATED_REQUIREMENT = [
  '  @modified @REQ-0001',
  '  Rule: Existing behavior',
  '    The project SHALL expose the updated behavior.',
  '',
  '    It SHALL preserve this meaningful internal paragraph break.',
  '',
  '    Scenario: Existing path',
  '      When the behavior is exercised',
  '      Then it SHALL remain available',
].join('\n');

const BASE_SPEC = ['Feature: Demo', '  Demonstrates deterministic serializer output.', '', ORIGINAL_REQUIREMENT].join(
  '\n'
);

const DELTA_SPEC = ['Feature: Demo', '', UPDATED_REQUIREMENT, ''].join('\n');

function expectOneFinalLf(content: string): void {
  expect(content.endsWith('\n')).toBe(true);
  expect(content.endsWith('\n\n')).toBe(false);
  expect(content.match(/\n+$/)?.[0]).toBe('\n');
}

describe('spec serialization', () => {
  let tempDir: string;
  let changeDir: string;
  let mainSpecsDir: string;
  let source: string;
  let target: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-spec-eof-'));
    changeDir = path.join(tempDir, 'openspec', 'changes', 'serializer-test');
    mainSpecsDir = path.join(tempDir, 'openspec', 'specs');
    source = path.join(changeDir, 'specs', 'demo', 'spec.feature');
    target = path.join(mainSpecsDir, 'demo', 'spec.feature');
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(source, DELTA_SPEC);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function build(targetContent: string, delta = DELTA_SPEC) {
    await fs.writeFile(target, targetContent);
    await fs.writeFile(source, delta);
    const [update] = await findSpecUpdates(changeDir, mainSpecsDir);
    return buildUpdatedSpec(update, 'serializer-test', { silent: true });
  }

  it.each([
    ['no terminal newline', BASE_SPEC],
    ['one terminal LF', `${BASE_SPEC}\n`],
    ['multiple terminal LF', `${BASE_SPEC}\n\n\n`],
    ['multiple terminal CRLF', `${BASE_SPEC.replaceAll('\n', '\r\n')}\r\n\r\n`],
  ])('emits one final LF from %s', async (_name, targetContent) => {
    const result = await build(targetContent);

    expectOneFinalLf(result.rebuilt);
    expect(result.rebuilt).toContain(
      'updated behavior.\n\n    It SHALL preserve this meaningful internal paragraph break.'
    );
  });

  it('drops the operation tag and keeps the ID', async () => {
    const result = await build(BASE_SPEC);

    expect(result.rebuilt).toContain('  @REQ-0001\n  Rule: Existing behavior\n');
    expect(result.rebuilt).not.toContain('@modified');
  });

  it('keeps the feature header, its comments and the untouched rules byte for byte', async () => {
    const header = [
      '# language: en',
      '@capability',
      'Feature: Demo',
      '  Demonstrates deterministic serializer output.',
      '',
      '  It has a second paragraph.',
      '',
      '  # A comment the merge must keep.',
    ].join('\n');
    const untouched = [
      '  # Why this rule exists.',
      '  @REQ-0002 @notrace',
      '  Rule: Untouched',
      '    The project SHALL keep this rule as written.',
      '',
      '    Scenario: Kept',
      '      When   spacing is odd',
      '      Then it stays odd',
    ].join('\n');

    const result = await build(`${header}\n\n${ORIGINAL_REQUIREMENT}\n\n${untouched}\n`);

    expect(result.rebuilt.startsWith(`${header}\n\n`)).toBe(true);
    expect(result.rebuilt).toContain(untouched);
    expect(result.rebuilt.indexOf('Rule: Existing behavior')).toBeLessThan(result.rebuilt.indexOf('Rule: Untouched'));
  });

  it('moves a delta rule to the indentation the main spec uses', async () => {
    const flat = BASE_SPEC.split('\n')
      .map((line) => line.replace(/^ {2}/, ''))
      .join('\n');

    const result = await build(flat);

    expect(result.rebuilt).toContain('@REQ-0001\nRule: Existing behavior\n  The project SHALL expose the updated behavior.');
  });

  it('appends an @added rule after the existing rules, separated by one blank line', async () => {
    const added = [
      'Feature: Demo',
      '',
      '  @added @REQ-0002',
      '  Rule: New behavior',
      '    The project SHALL expose the new behavior.',
      '',
      '    Scenario: New path',
      '      When the new behavior is exercised',
      '      Then it works',
      '',
    ].join('\n');

    const result = await build(`${BASE_SPEC}\n`, added);

    expect(result.rebuilt).toContain('      Then it SHALL remain available\n\n  @REQ-0002\n  Rule: New behavior');
    expectOneFinalLf(result.rebuilt);
  });
});
