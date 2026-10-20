import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Validator } from '../../src/core/validation/validator.js';
import { buildUpdatedSpec, findSpecUpdates } from '../../src/core/specs-apply.js';
import { featureRule, type FixtureScenario } from '../helpers/openspec-fixtures.js';

/**
 * validate reports the scenario loss archive refuses to apply (#1477).
 *
 * The point of these tests is parity: every case validate rejects must be one
 * archive already rejects, and every case archive accepts must stay valid.
 */
describe('validate: @modified rules that would drop a main-spec scenario (#1477)', () => {
  let testDir: string;
  let changesDir: string;
  let mainSpecsDir: string;

  const EXISTING: FixtureScenario = { name: 'Existing scenario', steps: ['When queried', 'Then the state is reported'] };
  const SECOND: FixtureScenario = { name: 'Second scenario', steps: ['When idle', 'Then idle is reported'] };

  const widgetRule = (scenarios: FixtureScenario[], tags: string[] = [], id = 'REQ-0001', name = 'Widget state') =>
    featureRule({ id, tags, name, statement: 'The system SHALL report the widget state.', scenarios });

  /** Two scenarios in the main spec; the delta below keeps only the first. */
  const TWO_SCENARIO_REQUIREMENT = widgetRule([EXISTING, SECOND]);

  const mainSpec = (body: string) => `Feature: Widgets\n  Define widget behavior for these tests.\n\n${body}\n`;
  const delta = (...rules: string[]) => `Feature: Widgets\n\n${rules.join('\n\n')}\n`;
  const DELTA_KEEPING_ONE = delta(widgetRule([EXISTING], ['modified']));

  const writeMainSpec = async (id: string, content: string) => {
    const file = path.join(mainSpecsDir, ...id.split('/'), 'spec.feature');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };

  const writeChange = async (changeName: string, specId: string, content: string) => {
    const changeDir = path.join(changesDir, changeName);
    const specDir = path.join(changeDir, 'specs', ...specId.split('/'));
    await fs.mkdir(specDir, { recursive: true });
    await fs.writeFile(path.join(specDir, 'spec.feature'), content);
    return changeDir;
  };

  /** The scenario-loss issue, so assertions cannot pass on an unrelated error. */
  const lossIssue = (report: { issues: Array<{ level: string; path: string; message: string }> }) =>
    report.issues.find((i) => i.message.includes('leaves out scenario(s)'));

  const validate = (changeDir: string) => new Validator(true).validateChangeDeltaSpecs(changeDir, { mainSpecsDir });

  /**
   * What archive would do with the same change: null when it applies cleanly.
   * It shares the comparison itself with the validator, so what it cross-checks
   * is the layer above: spec discovery, and which rule the @modified lands on.
   */
  const archiveError = async (changeDir: string): Promise<string | null> => {
    const updates = await findSpecUpdates(changeDir, mainSpecsDir);
    for (const update of updates) {
      try {
        await buildUpdatedSpec(update, path.basename(changeDir), { silent: true });
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
    return null;
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-scenario-loss-'));
    changesDir = path.join(testDir, 'openspec', 'changes');
    mainSpecsDir = path.join(testDir, 'openspec', 'specs');
    await fs.mkdir(changesDir, { recursive: true });
    await fs.mkdir(mainSpecsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('errors when the @modified rule leaves out a scenario the main spec still has', async () => {
    await writeMainSpec('widgets', mainSpec(TWO_SCENARIO_REQUIREMENT));
    const changeDir = await writeChange('rename-scenario', 'widgets', DELTA_KEEPING_ONE);

    const report = await validate(changeDir);

    expect(report.valid).toBe(false);
    const issue = lossIssue(report);
    expect(issue?.level).toBe('ERROR');
    expect(issue?.path).toBe('widgets/spec.feature');
    expect(issue?.message).toContain('@modified REQ-0001 ("Widget state")');
    expect(issue?.message).toContain('"Second scenario"');
    // Parity: archive refuses this change, naming the same scenario.
    expect(await archiveError(changeDir)).toContain('Second scenario');
  });

  it('counts repeated scenario names, so keeping one of two duplicates still errors', async () => {
    const repeated = (when: string): FixtureScenario => ({ name: 'Repeated', steps: [when, 'Then the state is reported'] });
    await writeMainSpec('widgets', mainSpec(widgetRule([repeated('When queried once'), repeated('When queried twice')])));
    const changeDir = await writeChange(
      'drop-duplicate',
      'widgets',
      delta(widgetRule([repeated('When queried once')], ['modified']))
    );

    const report = await validate(changeDir);

    expect(report.valid).toBe(false);
    expect(lossIssue(report)?.message).toContain('"Repeated"');
    expect(await archiveError(changeDir)).toContain('Repeated');
  });

  it('accepts a @modified rule that carries every current scenario over', async () => {
    await writeMainSpec('widgets', mainSpec(widgetRule([EXISTING])));
    const changeDir = await writeChange(
      'keeps-all',
      'widgets',
      delta(widgetRule([EXISTING, { name: 'New scenario', steps: ['When it errors', 'Then the error is reported'] }], ['modified']))
    );

    const report = await validate(changeDir);

    expect(report.valid).toBe(true);
    expect(await archiveError(changeDir)).toBeNull();
  });

  it('accepts a scenario kept under a @removed tag, and archive deletes it', async () => {
    await writeMainSpec('widgets', mainSpec(TWO_SCENARIO_REQUIREMENT));
    const removedSecond = widgetRule([EXISTING, SECOND], ['modified']).replace(
      '    Scenario: Second scenario',
      '    @removed\n    Scenario: Second scenario'
    );
    const changeDir = await writeChange('drop-on-purpose', 'widgets', delta(removedSecond));

    const report = await validate(changeDir);

    expect(report.issues).toEqual([]);
    const [update] = await findSpecUpdates(changeDir, mainSpecsDir);
    const { rebuilt } = await buildUpdatedSpec(update, 'drop-on-purpose', { silent: true });
    expect(rebuilt).toContain('Scenario: Existing scenario');
    expect(rebuilt).not.toContain('Second scenario');
    expect(rebuilt).not.toContain('@removed');
  });

  it('stays silent when the requirement ID is not in the main spec (sister change in flight)', async () => {
    await writeMainSpec('widgets', mainSpec(widgetRule([EXISTING])));
    const changeDir = await writeChange(
      'cross-change',
      'widgets',
      delta(widgetRule([{ name: 'Colour queried' }], ['modified'], 'REQ-0002', 'Widget colour'))
    );

    const report = await validate(changeDir);

    expect(lossIssue(report)).toBeUndefined();
    expect(report.valid).toBe(true);
  });

  it('stays silent when the main spec file does not exist yet', async () => {
    const changeDir = await writeChange('greenfield', 'gadgets', DELTA_KEEPING_ONE);

    const report = await validate(changeDir);

    expect(lossIssue(report)).toBeUndefined();
    expect(report.valid).toBe(true);
  });

  it('ignores a Scenario: line inside a doc string in the main spec', async () => {
    const withDocString = widgetRule([
      { name: 'Existing scenario', steps: ['When queried with:', '  """', '  Scenario: Quoted sample', '  """', 'Then the state is reported'] },
    ]);
    await writeMainSpec('widgets', mainSpec(withDocString));
    const changeDir = await writeChange('doc-string', 'widgets', delta(withDocString.replace('  @REQ', '  @modified @REQ')));

    const report = await validate(changeDir);

    expect(lossIssue(report)).toBeUndefined();
    expect(await archiveError(changeDir)).toBeNull();
  });

  it('resolves nested capability layouts against the matching main spec', async () => {
    await writeMainSpec('platform/widgets', mainSpec(TWO_SCENARIO_REQUIREMENT));
    const changeDir = await writeChange('nested', 'platform/widgets', DELTA_KEEPING_ONE);

    const report = await validate(changeDir);

    expect(lossIssue(report)?.path).toBe('platform/widgets/spec.feature');
    expect(await archiveError(changeDir)).toContain('Second scenario');
  });

  it('checks a @modified rule that renames the requirement, matched by ID', async () => {
    await writeMainSpec('widgets', mainSpec(TWO_SCENARIO_REQUIREMENT));
    const changeDir = await writeChange(
      'rename',
      'widgets',
      delta(widgetRule([EXISTING], ['modified'], 'REQ-0001', 'Widget status'))
    );

    const report = await validate(changeDir);

    expect(lossIssue(report)?.message).toContain('"Second scenario"');
    expect(await archiveError(changeDir)).toContain('Second scenario');
  });

  it('reads a CRLF main spec the same way archive does', async () => {
    await writeMainSpec('widgets', mainSpec(TWO_SCENARIO_REQUIREMENT).replace(/\n/g, '\r\n'));
    const changeDir = await writeChange('crlf-drop', 'widgets', DELTA_KEEPING_ONE.replace(/\n/g, '\r\n'));

    const report = await validate(changeDir);

    expect(report.valid).toBe(false);
    expect(lossIssue(report)?.message).toContain('"Second scenario"');
    expect(await archiveError(changeDir)).toContain('Second scenario');
  });

  it('runs no main-spec check when the caller passes no main specs directory', async () => {
    await writeMainSpec('widgets', mainSpec(TWO_SCENARIO_REQUIREMENT));
    const changeDir = await writeChange('no-root', 'widgets', DELTA_KEEPING_ONE);

    const report = await new Validator(true).validateChangeDeltaSpecs(changeDir);

    expect(report.valid).toBe(true);
  });

  it('fails the change in the default (non-strict) mode too', async () => {
    // --strict is opt-in, so the shipped default is the mode that matters most.
    await writeMainSpec('widgets', mainSpec(TWO_SCENARIO_REQUIREMENT));
    const changeDir = await writeChange('non-strict', 'widgets', DELTA_KEEPING_ONE);

    const report = await new Validator(false).validateChangeDeltaSpecs(changeDir, { mainSpecsDir });

    expect(report.valid).toBe(false);
    expect(lossIssue(report)?.level).toBe('ERROR');
  });

  it('says so when the main spec exists but cannot be read', async () => {
    // A directory where spec.feature belongs reads as EISDIR: not absent, and
    // archive aborts on it, so reporting beats calling the change valid.
    await fs.mkdir(path.join(mainSpecsDir, 'widgets', 'spec.feature'), { recursive: true });
    const changeDir = await writeChange('unreadable-main-spec', 'widgets', DELTA_KEEPING_ONE);

    const report = await validate(changeDir);

    expect(report.valid).toBe(false);
    const issue = report.issues.find((i) => i.message.includes('Could not read'));
    expect(issue?.level).toBe('ERROR');
    expect(issue?.message).toContain('widgets/spec.feature');
    expect(issue?.message).toContain('EISDIR');
    expect(await archiveError(changeDir)).not.toBeNull();
  });

  it('stays silent on a read error that says nothing about the file', async () => {
    // A resource error (EMFILE and friends) means the process is busy, not that
    // the change is wrong - `validate --all` reads six changes at once, so it
    // must not turn one into a verdict.
    await writeMainSpec('widgets', mainSpec(TWO_SCENARIO_REQUIREMENT));
    const changeDir = await writeChange('transient-read-error', 'widgets', DELTA_KEEPING_ONE);
    // Only the main spec read fails: the delta must still be read, or the check
    // never runs and the test proves nothing.
    const mainSpecFile = path.join(mainSpecsDir, 'widgets', 'spec.feature');
    const readFile = fs.readFile;
    const spy = vi.spyOn(fs, 'readFile').mockImplementation(async (file, ...rest) => {
      if (String(file) === mainSpecFile) {
        throw Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' });
      }
      return (readFile as unknown as typeof fs.readFile)(file, ...(rest as []));
    });

    try {
      const report = await validate(changeDir);
      expect(spy.mock.calls.some(([file]) => String(file) === mainSpecFile)).toBe(true);
      expect(report.issues.some((i) => i.message.includes('Could not read'))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
