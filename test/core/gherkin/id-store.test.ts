import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  assignMissingIds,
  collectFeatureFiles,
  idCounterPath,
  insertIdTag,
  nextIdNumber,
  readIdCounter,
  reserveIds,
  scanUsedIds,
} from '../../../src/core/gherkin/id-store.js';
import { parseFeature } from '../../../src/core/gherkin/document.js';

let root: string;
let openspecDir: string;

async function write(relative: string, content: string): Promise<string> {
  const file = path.join(openspecDir, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return file;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-id-store-'));
  openspecDir = path.join(root, 'openspec');
  await fs.mkdir(openspecDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('the ID counter', () => {
  it('is undefined until the file exists', async () => {
    await expect(readIdCounter(openspecDir)).resolves.toBeUndefined();
    await fs.writeFile(idCounterPath(openspecDir), '# comment\nnext: 12\n');
    await expect(readIdCounter(openspecDir)).resolves.toBe(12);
  });

  it('refuses a file without a next line, and says how to recover', async () => {
    await fs.writeFile(idCounterPath(openspecDir), 'next: twelve\n');
    await expect(readIdCounter(openspecDir)).rejects.toThrow(/no "next: <number>" line.*delete it/s);
  });

  it('never hands out an ID in use, even when the counter is behind', async () => {
    await fs.writeFile(idCounterPath(openspecDir), 'next: 2\n');
    await write('specs/a/spec.feature', 'Feature: a\n\n  @REQ-0004\n  Rule: R\n');
    await write('changes/archive/2026-01-01-old/specs/b/spec.feature', 'Feature: b\n\n  @removed @REQ-0009\n  Rule: R\n');
    await expect(nextIdNumber(openspecDir)).resolves.toBe(10);
  });

  it('starts at 1 in an empty project', async () => {
    await expect(nextIdNumber(openspecDir)).resolves.toBe(1);
  });

  it('reserves IDs and moves the counter past them', async () => {
    await expect(reserveIds(openspecDir, 3)).resolves.toEqual(['REQ-0001', 'REQ-0002', 'REQ-0003']);
    await expect(readIdCounter(openspecDir)).resolves.toBe(4);
    await expect(reserveIds(openspecDir, 1)).resolves.toEqual(['REQ-0004']);
    await expect(reserveIds(openspecDir, 0)).rejects.toThrow(/positive integer/);
  });

  it('gives concurrent reservations distinct IDs', async () => {
    const batches = await Promise.all(Array.from({ length: 5 }, () => reserveIds(openspecDir, 2)));
    const ids = batches.flat();
    expect(new Set(ids).size).toBe(10);
    await expect(readIdCounter(openspecDir)).resolves.toBe(11);
  });

  it('takes over a stale lock', async () => {
    const lock = path.join(openspecDir, '.requirement-ids.lock');
    await fs.writeFile(lock, '');
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(lock, old, old);
    await expect(reserveIds(openspecDir, 1)).resolves.toEqual(['REQ-0001']);
    await expect(fs.access(lock)).rejects.toThrow();
  });
});

describe('scanUsedIds and collectFeatureFiles', () => {
  it('finds ID tags in every feature file under specs and changes', async () => {
    const spec = await write('specs/a/spec.feature', 'Feature: a\n\n  @REQ-0001\n  Rule: R\n');
    const delta = await write('changes/c1/specs/a/spec.feature', 'Feature: a\n\n  @modified @REQ-0001\n  Rule: R\n');
    await write('specs/a/notes.md', '@REQ-0099 is not read from markdown\n');
    await write('specs/.hidden/spec.feature', 'Feature: h\n\n  @REQ-0042\n  Rule: R\n');

    const used = await scanUsedIds(openspecDir);
    expect([...used.keys()]).toEqual(['REQ-0001']);
    expect(used.get('REQ-0001')).toEqual([spec, delta]);
    await expect(collectFeatureFiles(spec)).resolves.toEqual([spec]);
    await expect(collectFeatureFiles(path.join(openspecDir, 'missing'))).resolves.toEqual([]);
  });
});

describe('assignMissingIds', () => {
  it('tags rules without an ID, in file order, and moves the counter', async () => {
    const first = await write(
      'specs/a/spec.feature',
      'Feature: a\n  P.\n\n  @REQ-0001\n  Rule: Has one\n\n  Rule: Needs one\n\n  @notrace\n  Rule: Also needs one\n'
    );
    const second = await write('changes/c1/specs/b/spec.feature', 'Feature: b\n\n  @added\n  Rule: New\n');

    const { assigned, problems } = await assignMissingIds(openspecDir, [first, second]);

    expect(problems).toEqual([]);
    expect(assigned.map((entry) => `${entry.id} ${entry.rule}`)).toEqual([
      'REQ-0002 Needs one',
      'REQ-0003 Also needs one',
      'REQ-0004 New',
    ]);
    await expect(fs.readFile(first, 'utf-8')).resolves.toBe(
      'Feature: a\n  P.\n\n  @REQ-0001\n  Rule: Has one\n\n  @REQ-0002\n  Rule: Needs one\n\n  @notrace @REQ-0003\n  Rule: Also needs one\n'
    );
    await expect(fs.readFile(second, 'utf-8')).resolves.toBe('Feature: b\n\n  @added @REQ-0004\n  Rule: New\n');
    await expect(readIdCounter(openspecDir)).resolves.toBe(5);
  });

  it('changes nothing on a dry run', async () => {
    const file = await write('specs/a/spec.feature', 'Feature: a\n\n  Rule: Needs one\n');
    const { assigned } = await assignMissingIds(openspecDir, [file], { dryRun: true });
    expect(assigned.map((entry) => entry.id)).toEqual(['REQ-0001']);
    await expect(fs.readFile(file, 'utf-8')).resolves.toBe('Feature: a\n\n  Rule: Needs one\n');
    await expect(readIdCounter(openspecDir)).resolves.toBeUndefined();
  });

  it('keeps CRLF line endings', async () => {
    const file = await write('specs/a/spec.feature', 'Feature: a\r\n\r\n  Rule: Needs one\r\n');
    await assignMissingIds(openspecDir, [file]);
    await expect(fs.readFile(file, 'utf-8')).resolves.toBe('Feature: a\r\n\r\n  @REQ-0001\r\n  Rule: Needs one\r\n');
  });

  it('reports rules it must not give a fresh ID, and files that do not parse', async () => {
    const delta = await write(
      'changes/c1/specs/a/spec.feature',
      'Feature: a\n\n  @modified\n  Rule: Changed\n\n  @removed\n  Rule: Gone\n\n  @REQ-0001 @REQ-0002\n  Rule: Twice\n'
    );
    const broken = await write('specs/b/spec.feature', 'Feature: b\n  Scenario: s\n    When x\nFeature: again\n');

    const { assigned, problems } = await assignMissingIds(openspecDir, [delta, broken]);

    expect(assigned).toEqual([]);
    expect(problems.map((problem) => `${path.basename(path.dirname(problem.file))}:${problem.line} ${problem.message}`)).toEqual([
      'a:4 Rule "Changed" is @modified but has no ID. Copy the ID of the requirement it changes from the main spec.',
      'a:7 Rule "Gone" is @removed but has no ID. Copy the ID of the requirement it changes from the main spec.',
      'a:10 Rule "Twice" has more than one ID (REQ-0001, REQ-0002). Keep one.',
      expect.stringMatching(/^b:4 Syntax error: /),
    ]);
    await expect(readIdCounter(openspecDir)).resolves.toBeUndefined();
  });
});

describe('insertIdTag', () => {
  it('adds the ID before a comment at the end of the tag line', () => {
    const document = parseFeature('Feature: a\n\n  @added # new\n  Rule: R\n');
    expect(insertIdTag(document.lines, document.rules[0], 'REQ-0007')[2]).toBe('  @added @REQ-0007 # new');
  });

  it('adds a tag line at the rule indentation when the rule has no tags', () => {
    const document = parseFeature('Feature: a\n\nRule: R\n');
    expect(insertIdTag(document.lines, document.rules[0], 'REQ-0007').slice(2, 4)).toEqual(['@REQ-0007', 'Rule: R']);
  });
});
