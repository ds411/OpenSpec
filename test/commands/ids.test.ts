import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { runCLI } from '../helpers/run-cli.js';

describe('openspec ids', () => {
  let root: string;

  async function write(relative: string, content: string): Promise<string> {
    const file = path.join(root, 'openspec', relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
    return file;
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-ids-cli-'));
    await write('specs/a/spec.feature', 'Feature: a\n  Purpose.\n\n  @REQ-0001\n  Rule: Has one\n\n  Rule: Needs one\n');
    await write('changes/c1/specs/b/spec.feature', 'Feature: b\n\n  @added\n  Rule: New\n');
    await write('changes/archive/2026-01-01-old/specs/c/spec.feature', 'Feature: c\n\n  @added\n  Rule: Archived\n');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('assigns IDs in the main specs and active changes, not in the archive', async () => {
    const result = await runCLI(['ids', 'assign'], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('REQ-0002  openspec/specs/a/spec.feature:7  Needs one');
    expect(result.stdout).toContain('REQ-0003  openspec/changes/c1/specs/b/spec.feature:4  New');
    expect(result.stdout).toContain('Assigned 2 IDs.');
    await expect(fs.readFile(path.join(root, 'openspec', 'requirement-ids.yaml'), 'utf-8')).resolves.toContain('next: 4');
    await expect(
      fs.readFile(path.join(root, 'openspec', 'changes', 'archive', '2026-01-01-old', 'specs', 'c', 'spec.feature'), 'utf-8')
    ).resolves.not.toContain('@REQ-');

    const again = await runCLI(['ids', 'assign'], { cwd: root });
    expect(again.stdout).toContain('Every requirement has an ID.');
  });

  it('limits the run to one change, and reports JSON on a dry run', async () => {
    const result = await runCLI(['ids', 'assign', 'c1', '--dry-run', '--json'], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      assigned: [{ file: 'openspec/changes/c1/specs/b/spec.feature', line: 4, rule: 'New', id: 'REQ-0002' }],
      problems: [],
    });
    await expect(fs.readFile(path.join(root, 'openspec', 'changes', 'c1', 'specs', 'b', 'spec.feature'), 'utf-8')).resolves.not.toContain(
      '@REQ-'
    );
  });

  it('exits 1 and names the rule when a @modified rule has no ID', async () => {
    await write('changes/c2/specs/a/spec.feature', 'Feature: a\n\n  @modified\n  Rule: Has one\n');

    const result = await runCLI(['ids', 'assign', 'c2'], { cwd: root });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'openspec/changes/c2/specs/a/spec.feature:4: Rule "Has one" is @modified but has no ID.'
    );
  });

  it('refuses a target that is neither a change nor a path', async () => {
    const result = await runCLI(['ids', 'assign', 'no-such-thing'], { cwd: root });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('"no-such-thing" is neither an active change nor a file or folder.');
  });

  it('takes IDs from the counter with ids next', async () => {
    const result = await runCLI(['ids', 'next', '--count', '2'], { cwd: root });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual(['REQ-0002', 'REQ-0003']);

    const json = await runCLI(['ids', 'next', '--json'], { cwd: root });
    expect(JSON.parse(json.stdout)).toEqual({ ids: ['REQ-0004'] });

    const bad = await runCLI(['ids', 'next', '--count', 'zero'], { cwd: root });
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr).toContain('--count must be a positive whole number');
  });
});
