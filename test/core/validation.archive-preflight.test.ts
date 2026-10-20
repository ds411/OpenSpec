import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs, realpathSync } from 'fs';
import os from 'os';
import path from 'path';
import { Validator } from '../../src/core/validation/validator.js';
import { buildUpdatedSpec, findSpecUpdates } from '../../src/core/specs-apply.js';
import { featureRule } from '../helpers/openspec-fixtures.js';

/**
 * validate reports the deltas archive would refuse to apply (#1112).
 *
 * Compare findings against archive's merge builder, not its later validation
 * and retirement checks. A delta the builder accepts must produce no finding.
 * Reporting a change that merges cleanly
 * would send an author to rewrite working work, which is worse than the gap
 * this closes.
 */
describe('validate: deltas archive would refuse (#1112)', () => {
  let testDir: string;
  let changesDir: string;
  let mainSpecsDir: string;

  const REQUIREMENT = featureRule({
    id: 'REQ-0001',
    name: 'Widget state',
    statement: 'The system SHALL report the widget state.',
    scenarios: [{ name: 'Existing scenario', steps: ['When queried', 'Then the state is reported'] }],
  });

  /** A rule for `name`, under `id`, with `tags`. */
  const rule = (id: string, name: string, tags: string[] = []) =>
    featureRule({
      id,
      tags,
      name,
      statement: `The system SHALL report the ${name.toLowerCase()}.`,
      scenarios: [{ name: 'Queried', steps: ['When queried', 'Then reported'] }],
    });

  const mainSpec = (body: string) => `Feature: Widgets\n  Define widget behavior for these tests.\n\n${body}\n`;
  const delta = (...rules: string[]) => `Feature: Widgets\n\n${rules.join('\n\n')}\n`;
  const tagged = (tag: string, block: string) => block.replace(/^  @/, `  @${tag} @`);

  const writeMainSpec = async (id: string, body: string) => {
    const file = path.join(mainSpecsDir, ...id.split('/'), 'spec.feature');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, mainSpec(body));
  };

  const writeChange = async (changeName: string, specId: string, content: string) => {
    const changeDir = path.join(changesDir, changeName);
    const specDir = path.join(changeDir, 'specs', ...specId.split('/'));
    await fs.mkdir(specDir, { recursive: true });
    await fs.writeFile(path.join(specDir, 'spec.feature'), content);
    return changeDir;
  };

  const validate = (changeDir: string, strict = false) =>
    new Validator(strict).validateChangeDeltaSpecs(changeDir, { mainSpecsDir });

  /** The preflight finding, so assertions cannot pass on an unrelated issue. */
  const blocker = (report: { issues: Array<{ level: string; message: string }> }) =>
    report.issues.find((i) => i.message.startsWith('Archive would refuse this delta:'));

  /** What archive's merge builder does: null when the delta applies cleanly. */
  const archiveError = async (changeDir: string): Promise<string | null> => {
    for (const update of await findSpecUpdates(changeDir, mainSpecsDir)) {
      try {
        await buildUpdatedSpec(update, path.basename(changeDir), { silent: true });
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
    return null;
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-preflight-'));
    // The project sits one level down, so a link written to testDir leaves it:
    // a spec link that stays inside the project is allowed, one that leaves is not.
    changesDir = path.join(testDir, 'repo', 'openspec', 'changes');
    mainSpecsDir = path.join(testDir, 'repo', 'openspec', 'specs');
    await fs.mkdir(changesDir, { recursive: true });
    await fs.mkdir(mainSpecsDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('keeps strict validation valid when advisory discovery encounters a filesystem error', async () => {
    const changeDir = await writeChange('c1', 'widgets', delta(tagged('added', REQUIREMENT)));
    const specsDir = realpathSync.native(path.join(changeDir, 'specs'));
    const readdir = fs.readdir;
    let discoveries = 0;
    vi.spyOn(fs, 'readdir').mockImplementation(async (dir, ...rest) => {
      if (realpathSync.native(String(dir)) === specsDir && ++discoveries === 2) {
        throw Object.assign(new Error('EIO: cannot discover archive inputs'), { code: 'EIO' });
      }
      return readdir(dir, ...(rest as []));
    });

    const report = await validate(changeDir, true);
    expect(report.valid).toBe(true);
    expect(report.issues).toContainEqual({
      level: 'INFO',
      path: 'specs',
      message: 'Could not check archive merge conflicts: EIO: cannot discover archive inputs',
    });
    expect(blocker(report)).toBeUndefined();
  });

  it.skipIf(process.platform === 'win32').each([
    ['outside', true],
    ['outside', false],
    ['dangling', true],
    ['dangling', false],
  ] as const)('preserves the validation report for a %s target link (valid delta: %s)', async (link, validDelta) => {
    const body = validDelta ? REQUIREMENT : '  @REQ-0001\n  Rule: Widget state\n    The system SHALL report the widget state.';
    const changeDir = await writeChange('c1', 'widgets', delta(tagged('added', body)));
    const target = path.join(mainSpecsDir, 'widgets', 'spec.feature');
    const outside = path.join(testDir, 'outside.feature');
    if (link === 'outside') await fs.writeFile(outside, mainSpec(REQUIREMENT));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.symlink(outside, target);

    // Advisory discovery must not weaken the merge path's security checks.
    await expect(findSpecUpdates(changeDir, mainSpecsDir)).rejects.toThrow();
    for (const strict of [false, true]) {
      const report = await validate(changeDir, strict);
      expect(report.valid).toBe(validDelta);
      expect(report.issues).toContainEqual(expect.objectContaining({
        level: 'INFO',
        path: 'specs',
        message: expect.stringContaining('Could not check archive merge conflicts:'),
      }));
      if (!validDelta) {
        expect(report.issues).toContainEqual(expect.objectContaining({
          level: 'ERROR', path: 'widgets/spec.feature', message: expect.stringContaining('must include at least one scenario'),
        }));
      }
    }
    if (link === 'outside') expect(await fs.readFile(outside, 'utf8')).toBe(mainSpec(REQUIREMENT));
    else await expect(fs.stat(outside)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.skipIf(process.platform === 'win32')('still refuses an unsafe delta source before the advisory check', async () => {
    const changeDir = await writeChange('c1', 'widgets', delta(tagged('added', REQUIREMENT)));
    const deltaFile = path.join(changeDir, 'specs', 'widgets', 'spec.feature');
    const outside = path.join(testDir, 'outside-delta.feature');
    await fs.rename(deltaFile, outside);
    await fs.symlink(outside, deltaFile);
    await expect(validate(changeDir)).rejects.toThrow('Path is outside the allowed directory');
  });

  it.each(['EMFILE', 'EIO', 'EACCES'])(
    'does not misreport a target read failure (%s) as a missing requirement',
    async (code) => {
      await writeMainSpec('widgets', REQUIREMENT);
      const changeDir = await writeChange('c1', 'widgets', delta(tagged('modified', REQUIREMENT)));
      const [update] = await findSpecUpdates(changeDir, mainSpecsDir);
      const target = realpathSync.native(update.target);
      const readFile = fs.readFile;
      const failure = Object.assign(new Error(`${code}: cannot read target`), { code });
      const spy = vi.spyOn(fs, 'readFile').mockImplementation(async (file, ...rest) => {
        if (realpathSync.native(String(file)) === target) throw failure;
        return readFile(file, ...(rest as []));
      });

      const report = await validate(changeDir);
      expect(spy.mock.calls.some(([file]) => realpathSync.native(String(file)) === target)).toBe(true);
      expect(blocker(report)).toBeUndefined();
      await expect(buildUpdatedSpec(update, 'c1', { silent: true })).rejects.toBe(failure);
    }
  );

  it.each([
    ['already-synced addition', delta(tagged('added', REQUIREMENT))],
    ['already-synced modification', delta(tagged('modified', REQUIREMENT))],
    ['already-synced removal', delta('  @removed @REQ-0009\n  Rule: Gone')],
  ])('stays silent on an %s', async (_name, content) => {
    await writeMainSpec('widgets', REQUIREMENT);
    const changeDir = await writeChange('c1', 'widgets', content);
    expect(blocker(await validate(changeDir))).toBeUndefined();
    expect(await archiveError(changeDir)).toBeNull();
  });

  it('reports @modified against a capability that does not exist', async () => {
    const changeDir = await writeChange('c1', 'new-capability', delta(tagged('modified', REQUIREMENT)));
    const error = await archiveError(changeDir);
    expect(error).toContain('target spec does not exist');
    expect(blocker(await validate(changeDir))?.message).toBe(`Archive would refuse this delta: ${error}`);
  });

  it('keeps library validation unchanged when mainSpecsDir is omitted', async () => {
    const changeDir = await writeChange('c1', 'widgets', delta(tagged('modified', REQUIREMENT)));
    const report = await new Validator(true).validateChangeDeltaSpecs(changeDir);
    expect(report.valid).toBe(true);
    expect(blocker(report)).toBeUndefined();
  });

  it('does not synthesize a new baseline for ADDED when the existing spec cannot be read through an alias or canonical path', async () => {
    await writeMainSpec('widgets', REQUIREMENT);
    await fs.symlink(
      path.join(mainSpecsDir, 'widgets'),
      path.join(mainSpecsDir, 'widgets-alias'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    const changeDir = await writeChange('c1', 'widgets-alias', delta(rule('REQ-0002', 'Gadget state', ['added'])));
    const [update] = await findSpecUpdates(changeDir, mainSpecsDir);
    const target = realpathSync.native(update.target);
    // Keep distinct path spellings so this exercises both reads of the same file.
    expect(update.target).not.toBe(target);
    const readFile = fs.readFile;
    const failure = Object.assign(new Error('EIO: cannot read target'), { code: 'EIO' });
    vi.spyOn(fs, 'readFile').mockImplementation(async (file, ...rest) => {
      if (realpathSync.native(String(file)) === target) throw failure;
      return readFile(file, ...(rest as []));
    });
    await expect(buildUpdatedSpec(update, 'c1', { silent: true })).rejects.toBe(failure);
    await expect(buildUpdatedSpec({ ...update, target }, 'c1', { silent: true })).rejects.toBe(failure);
  });

  it('reports a nested capability without suppressing findings for other files', async () => {
    await writeMainSpec('area/widgets', REQUIREMENT);
    const changeDir = await writeChange('c1', 'area/widgets', delta(rule('REQ-0002', 'Missing', ['modified'])));
    await writeChange('c1', 'invalid', 'Feature: Invalid\n  No entries.\n');
    const report = await validate(changeDir);
    expect(report.issues.filter((issue) => issue.level === 'INFO')).toEqual([
      expect.objectContaining({ path: 'area/widgets/spec.feature', message: `Archive would refuse this delta: ${await archiveError(changeDir)}` }),
    ]);
  });

  it('does not create or rewrite spec files or print merge warnings', async () => {
    await writeMainSpec('widgets', REQUIREMENT);
    const changeDir = await writeChange('c1', 'widgets', delta(tagged('added', REQUIREMENT)));
    await writeChange('c1', 'new-capability', delta(tagged('added', REQUIREMENT)));
    const mainFile = path.join(mainSpecsDir, 'widgets', 'spec.feature');
    const deltaFile = path.join(changeDir, 'specs', 'widgets', 'spec.feature');
    const before = await Promise.all([fs.readFile(mainFile, 'utf8'), fs.readFile(deltaFile, 'utf8')]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await validate(changeDir);
    expect(await Promise.all([fs.readFile(mainFile, 'utf8'), fs.readFile(deltaFile, 'utf8')])).toEqual(before);
    await expect(fs.stat(path.join(mainSpecsDir, 'new-capability'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(log).not.toHaveBeenCalled();
  });

  it('reports a MODIFIED naming a requirement the main spec does not have', async () => {
    await writeMainSpec('widgets', REQUIREMENT);
    const changeDir = await writeChange(
      'c1',
      'widgets',
      delta(rule('REQ-0002', 'Gadget state', ['modified']))
    );

    const issue = blocker(await validate(changeDir));
    expect(issue?.message).toContain('@modified failed for REQ-0002 ("Gadget state") - not found in the current spec');
    expect(await archiveError(changeDir)).not.toBeNull();
  });

  it('reports an ADDED whose requirement already exists in the main spec', async () => {
    await writeMainSpec('widgets', REQUIREMENT);
    const changeDir = await writeChange(
      'c1',
      'widgets',
      delta(rule('REQ-0001', 'Widget state twice', ['added']))
    );

    expect(blocker(await validate(changeDir))?.message).toContain('the spec already has a requirement with this ID');
    expect(await archiveError(changeDir)).not.toBeNull();
  });

  it('stays silent on a delta that applies cleanly', async () => {
    await writeMainSpec('widgets', REQUIREMENT);
    const changeDir = await writeChange(
      'c1',
      'widgets',
      delta(rule('REQ-0002', 'Gadget state', ['added']))
    );

    expect(blocker(await validate(changeDir))).toBeUndefined();
    expect(await archiveError(changeDir)).toBeNull();
  });

  it('stays silent on a rename the baseline already absorbed', async () => {
    // A rename is a @modified rule with a new name, matched by ID. When sync
    // already applied it, archive treats it as a no-op.
    await writeMainSpec('widgets', rule('REQ-0001', 'Doodad state'));
    const changeDir = await writeChange('c1', 'widgets', delta(rule('REQ-0001', 'Doodad state', ['modified'])));

    expect(blocker(await validate(changeDir))).toBeUndefined();
    expect(await archiveError(changeDir)).toBeNull();
  });

  it('stays silent when the capability is new, so there is nothing to apply against', async () => {
    const changeDir = await writeChange(
      'c1',
      'gizmos',
      delta(rule('REQ-0005', 'Gizmo state', ['added']))
    );

    expect(blocker(await validate(changeDir))).toBeUndefined();
    expect(await archiveError(changeDir)).toBeNull();
  });

  it('reports without changing the verdict, in strict mode too', async () => {
    await writeMainSpec('widgets', REQUIREMENT);
    const changeDir = await writeChange(
      'c1',
      'widgets',
      delta(rule('REQ-0002', 'Gadget state', ['modified']))
    );

    // The same shape is a typo'd ID and a change modifying a sibling's
    // unarchived requirement, and validate stays valid for the second one
    // today. Telling the two apart needs the opt-in marker #1112 asks for, so
    // this reports the collision and leaves the verdict where it was.
    for (const strict of [false, true]) {
      const report = await validate(changeDir, strict);
      expect(report.valid).toBe(true);
      expect(blocker(report)?.level).toBe('INFO');
    }
  });

  it('does not restate a delta with no rules, reported after the loop', async () => {
    // emptySpecs are collected inside the loop but their errors are pushed
    // after it, so a preflight keyed on issues raised
    // so far would not see them and would add a second finding for a file the
    // validator is about to name properly.
    await writeMainSpec('widgets', REQUIREMENT);
    const changeDir = await writeChange('c1', 'widgets', 'Feature: Widgets\n  Notes only, no rules here.\n');

    const report = await validate(changeDir);
    expect(report.issues.some((i) => i.message.startsWith('No delta rules found'))).toBe(true);
    expect(blocker(report)).toBeUndefined();
  });

  it.skipIf(process.platform === 'win32')('uses the same display path when suppressing malformed deltas with a literal backslash', async () => {
    const changeDir = await writeChange('c1', 'area\\widgets', 'Feature: Widgets\n  Notes only.\n');
    const report = await validate(changeDir);
    expect(report.issues).toContainEqual(expect.objectContaining({
      level: 'ERROR', path: 'area/widgets/spec.feature', message: expect.stringContaining('No delta rules found'),
    }));
    expect(blocker(report)).toBeUndefined();
  });

  it('does not restate a failure the delta checks already named', async () => {
    // The scenario-loss check reports this one in wording that names the
    // dropped scenario; buildUpdatedSpec throws on it too, a few steps later.
    await writeMainSpec(
      'widgets',
      `${REQUIREMENT}\n\n    Scenario: Second scenario\n      When idle\n      Then idle is reported`
    );
    const changeDir = await writeChange('c1', 'widgets', delta(tagged('modified', REQUIREMENT)));

    const report = await validate(changeDir);
    expect(report.issues.some((i) => i.level === 'ERROR')).toBe(true);
    expect(blocker(report)).toBeUndefined();
    expect(await archiveError(changeDir)).not.toBeNull();
  });
});
