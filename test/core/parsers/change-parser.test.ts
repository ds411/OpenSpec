import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { ChangeParser } from '../../../src/core/parsers/change-parser.js';

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-change-parser-'));
  try {
    await run(dir);
  } finally {
    // Best-effort cleanup
    try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
  }
}

describe('ChangeParser', () => {
  it('parses simple What Changes bullet list', async () => {
    const content = `# Test Change\n\n## Why\nWe need it because reasons that are sufficiently long.\n\n## What Changes\n- **spec-a:** Add a new requirement to A\n- **spec-b:** Rename requirement X to Y\n- **spec-c:** Remove obsolete requirement`;

    const parser = new ChangeParser(content, process.cwd());
    const change = await parser.parseChangeWithDeltas('test-change');

    expect(change.name).toBe('test-change');
    expect(change.deltas.length).toBe(3);
    expect(change.deltas[0].spec).toBe('spec-a');
    expect(['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED']).toContain(change.deltas[1].operation);
  });

  it('prefers delta-format specs over simple bullets when both exist', async () => {
    await withTempDir(async (dir) => {
      const changeDir = dir;
      const specsDir = path.join(changeDir, 'specs', 'foo');
      await fs.mkdir(specsDir, { recursive: true });

      const content = `# Test Change\n\n## Why\nWe need it because reasons that are sufficiently long.\n\n## What Changes\n- **foo:** Add something via bullets (should be overridden)`;
      const deltaSpec = `Feature: Foo\n\n  @added @REQ-0001\n  Rule: New thing\n    The system SHALL do a new thing.\n\n    Scenario: basic\n      Given X\n      When Y\n      Then Z\n`;

      await fs.writeFile(path.join(specsDir, 'spec.feature'), deltaSpec, 'utf8');

      const parser = new ChangeParser(content, changeDir);
      const change = await parser.parseChangeWithDeltas('test-change');

      expect(change.deltas.length).toBe(1);
      // Since delta spec exists, the description should reflect delta-derived entries
      expect(change.deltas[0].spec).toBe('foo');
      expect(change.deltas[0].description).toBe('Add requirement REQ-0001: The system SHALL do a new thing.');
      expect(change.deltas[0].operation).toBe('ADDED');
      expect(change.deltas[0].requirement?.id).toBe('REQ-0001');
    });
  });

  it('parses nested delta specs with path-based capability ids (#1353)', async () => {
    await withTempDir(async (dir) => {
      const changeDir = dir;
      const nestedSpecDir = path.join(changeDir, 'specs', 'platform', 'session-layout');
      await fs.mkdir(nestedSpecDir, { recursive: true });

      const content = `# Test Change\n\n## Why\nWe need it because reasons that are sufficiently long.\n\n## What Changes\n- Add nested capability`;
      const deltaSpec = `Feature: Session layout\n\n  @added\n  Rule: Nested capability works\n    The system SHALL work when nested.\n\n    Scenario: basic\n      Given X\n      When Y\n      Then Z\n`;

      await fs.writeFile(path.join(nestedSpecDir, 'spec.feature'), deltaSpec, 'utf8');

      const parser = new ChangeParser(content, changeDir);
      const change = await parser.parseChangeWithDeltas('test-change');

      expect(change.deltas.length).toBe(1);
      expect(change.deltas[0].spec).toBe('platform/session-layout');
      expect(change.deltas[0].operation).toBe('ADDED');
    });
  });

  it('reads each operation tag and the rule it sits on', async () => {
    await withTempDir(async (dir) => {
      const specsDir = path.join(dir, 'specs', 'auth');
      await fs.mkdir(specsDir, { recursive: true });

      const content = `# Test Change\n\n## Why\nWe need it because reasons that are sufficiently long.\n\n## What Changes\n- **auth:** Update login`;
      const deltaSpec = [
        'Feature: Auth',
        '',
        '  @added @REQ-0003',
        '  Rule: Session Timeout',
        '    The system SHALL end idle sessions.',
        '',
        '    Scenario: Idle for an hour',
        '      When a session is idle for an hour',
        '      Then it ends',
        '',
        '  @modified @REQ-0001',
        '  Rule: User Login',
        '    The system SHALL log users in with a password.',
        '',
        '    Scenario: Valid credentials',
        '      When a user signs in',
        '      Then a session starts',
        '',
        '  @removed @REQ-0002',
        '  Rule: Remember me',
        '    Replaced by session timeout.',
        '',
      ].join('\n');
      await fs.writeFile(path.join(specsDir, 'spec.feature'), deltaSpec, 'utf8');

      const change = await new ChangeParser(content, dir).parseChangeWithDeltas('test-change');
      const byOperation = Object.fromEntries(change.deltas.map((d) => [d.operation, d.requirement]));

      expect(change.deltas.map((d) => d.operation)).toEqual(['ADDED', 'MODIFIED', 'REMOVED']);
      expect(byOperation.ADDED?.name).toBe('Session Timeout');
      expect(byOperation.ADDED?.scenarios[0].name).toBe('Idle for an hour');
      expect(byOperation.MODIFIED?.id).toBe('REQ-0001');
      expect(byOperation.MODIFIED?.scenarios[0].name).toBe('Valid credentials');
      expect(byOperation.REMOVED?.id).toBe('REQ-0002');
    });
  });

  // A spec file whose rules carry no operation tag holds no delta, so the
  // proposal prose is not replaced by an empty list.
  it('falls back to the proposal prose when no rule has an operation tag', async () => {
    await withTempDir(async (dir) => {
      const specsDir = path.join(dir, 'specs', 'auth');
      await fs.mkdir(specsDir, { recursive: true });

      const content = `# Test Change\n\n## Why\nWe need it because reasons that are sufficiently long.\n\n## What Changes\n- **auth:** Add login`;
      await fs.writeFile(
        path.join(specsDir, 'spec.feature'),
        'Feature: Auth\n\n  Rule: Untagged\n    The system SHALL log in.\n',
        'utf8'
      );

      const change = await new ChangeParser(content, dir).parseChangeWithDeltas('test-change');

      expect(change.deltas).toHaveLength(1);
      expect(change.deltas[0].spec).toBe('auth');
      expect(change.deltas[0].description).toContain('Add login');
    });
  });
});
