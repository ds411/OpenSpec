import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadRequirementIndex } from '../../../src/core/trace/requirements.js';
import { cleanupTempPath } from '../../helpers/temp-cleanup.js';

describe('loadRequirementIndex', () => {
  let root: string;

  beforeEach(() => {
    root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-trace-index-')));
  });

  afterEach(() => {
    cleanupTempPath(root);
  });

  function write(relativePath: string, content: string): string {
    const file = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  }

  function load() {
    return loadRequirementIndex({
      projectRoot: root,
      specsDir: path.join(root, 'openspec', 'specs'),
      changesDir: path.join(root, 'openspec', 'changes'),
    });
  }

  const mainSpec = [
    'Feature: List command',
    '',
    '  @REQ-0001',
    '  Rule: Command execution',
    '    The command SHALL scan.',
    '',
    '    Scenario: Scan',
    '      Then it scans',
    '',
    '  @REQ-0002 @notrace',
    '  Rule: Review',
    '    The team MUST review.',
    '',
    '    Scenario: Review',
    '      Then a person reviews',
    '',
    '  Rule: No ID yet',
    '    The command SHALL wait.',
    '',
    '    Scenario: Wait',
    '      Then it waits',
    '',
  ].join('\n');

  it('reads main-spec requirements with their capability, line and @notrace tag', async () => {
    const file = write('openspec/specs/platform/list/spec.feature', mainSpec);
    const index = await load();
    expect(index.requirements).toEqual([
      { id: 'REQ-0001', name: 'Command execution', capability: 'platform/list', file, line: 4, notrace: false },
      { id: 'REQ-0002', name: 'Review', capability: 'platform/list', file, line: 11, notrace: true },
    ]);
    expect(index.problems).toEqual([
      expect.objectContaining({ code: 'requirement_without_id', file, line: 17 }),
    ]);
  });

  it('reads added, modified and removed rules of active changes, not archived ones', async () => {
    write('openspec/specs/list/spec.feature', mainSpec);
    const delta = write(
      'openspec/changes/add-json/specs/list/spec.feature',
      [
        'Feature: List command',
        '',
        '  @added @REQ-0042',
        '  Rule: JSON output',
        '    The command SHALL print JSON.',
        '',
        '    Scenario: JSON',
        '      Then JSON prints',
        '',
        '  @modified @REQ-0001',
        '  Rule: Command execution',
        '    The command SHALL scan fast.',
        '',
        '    Scenario: Scan',
        '      Then it scans',
        '',
        '  @removed @REQ-0002',
        '  Rule: Review',
        '    Reason: Gone.',
        '',
      ].join('\n')
    );
    write(
      'openspec/changes/archive/2026-01-01-old/specs/list/spec.feature',
      'Feature: List command\n\n  @added @REQ-0007\n  Rule: Old\n    The command SHALL be old.\n'
    );

    const index = await load();
    expect(index.changes.map((entry) => [entry.id, entry.operation, entry.change, entry.capability])).toEqual([
      ['REQ-0042', 'added', 'add-json', 'list'],
      ['REQ-0001', 'modified', 'add-json', 'list'],
      ['REQ-0002', 'removed', 'add-json', 'list'],
    ]);
    expect(index.changes[0]).toMatchObject({ file: delta, line: 4, notrace: false });
  });

  it('reports an added rule with no ID, but not a modified or removed one', async () => {
    const delta = write(
      'openspec/changes/c/specs/list/spec.feature',
      [
        'Feature: List command',
        '',
        '  @added',
        '  Rule: New rule',
        '    The command SHALL do more.',
        '',
        '    Scenario: More',
        '      Then it does more',
        '',
        '  @modified',
        '  Rule: Changed rule',
        '    The command SHALL do it again.',
        '',
        '    Scenario: Again',
        '      Then it does it again',
        '',
        '  @removed',
        '  Rule: Old rule',
        '    Reason: Gone.',
        '',
      ].join('\n')
    );

    const index = await load();
    expect(index.changes).toEqual([]);
    expect(index.problems).toEqual([
      expect.objectContaining({ code: 'requirement_without_id', file: delta, line: 4, change: 'c' }),
    ]);
  });

  it('reports a duplicate ID once and keeps the first requirement', async () => {
    const rule = (name: string) =>
      `Feature: ${name}\n\n  @REQ-0001\n  Rule: ${name}\n    It SHALL work.\n\n    Scenario: Works\n      Then it works\n`;
    write('openspec/specs/a/spec.feature', rule('First'));
    const second = write('openspec/specs/b/spec.feature', rule('Second'));

    const index = await load();
    expect(index.requirements.map((r) => r.name)).toEqual(['First']);
    expect(index.problems).toEqual([
      expect.objectContaining({ code: 'duplicate_requirement_id', id: 'REQ-0001', file: second, line: 4 }),
    ]);
  });

  it('reports a spec that does not parse', async () => {
    const file = write('openspec/specs/broken/spec.feature', 'Feature: Broken\n\n  @REQ-0001\n');
    const index = await load();
    expect(index.requirements).toEqual([]);
    expect(index.problems).toEqual([expect.objectContaining({ code: 'spec_parse_error', file })]);
  });

  it('returns an empty index when there is no openspec folder content', async () => {
    expect(await load()).toEqual({ requirements: [], changes: [], problems: [] });
  });
});
