import { describe, it, expect, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Validator } from '../../src/core/validation/validator.js';
import { runCLI } from '../helpers/run-cli.js';
import { featureRule, featureSpec, type FixtureScenario } from '../helpers/openspec-fixtures.js';

/**
 * A scenario with nothing under it used to pass `validate` and then fail
 * `archive`, because the delta path and the spec path counted scenarios
 * differently. Archive validates the rebuilt spec on the spec path, so it
 * refused a change `validate` had just called valid.
 *
 * The point of these tests is parity: for every scenario shape, a delta rule
 * and the same rule in a main spec get the same verdict, and `validate`
 * accepts exactly what `archive` applies.
 */

const STATEMENT = 'The system SHALL issue a credit note when an invoice is voided.';

const WITH_STEPS: FixtureScenario = {
  name: 'Invoice voided',
  steps: ['When an invoice is voided', 'Then a credit note is issued'],
};
const NO_STEPS: FixtureScenario = { name: 'Invoice voided', steps: [] };

const CASES: Array<{ name: string; scenarios: FixtureScenario[]; valid: boolean }> = [
  { name: 'a scenario with steps', scenarios: [WITH_STEPS], valid: true },
  { name: 'a scenario with no steps', scenarios: [NO_STEPS], valid: false },
  {
    name: 'two scenarios, one of them with no steps',
    scenarios: [{ name: 'Not written yet', steps: [] }, WITH_STEPS],
    valid: false,
  },
  {
    name: 'a scenario whose only step carries a doc string',
    scenarios: [{ name: 'Invoice voided', steps: ['Then a credit note reads:', '  """', '  Credit for invoice 42', '  """'] }],
    valid: true,
  },
];

const rule = (scenarios: FixtureScenario[], tags: string[] = []) =>
  featureRule({ id: 'REQ-0001', tags, name: 'Credit Notes', statement: STATEMENT, scenarios });

const deltaSpec = (operation: 'added' | 'modified', scenarios: FixtureScenario[]) =>
  `Feature: Billing\n\n${rule(scenarios, [operation])}\n`;

const temps: string[] = [];
afterAll(async () => {
  await Promise.all(temps.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

async function validateDelta(delta: string) {
  const changeDir = await tempDir('openspec-scenario-body-');
  await fs.mkdir(path.join(changeDir, 'specs', 'billing'), { recursive: true });
  await fs.writeFile(path.join(changeDir, 'specs', 'billing', 'spec.feature'), delta);
  return new Validator().validateChangeDeltaSpecs(changeDir);
}

describe('scenario checks: delta path and spec path agree', () => {
  for (const { name, scenarios, valid } of CASES) {
    it(`gives ${name} the same verdict on both paths`, async () => {
      const spec = featureSpec('Billing', 'Define how billing documents are issued for these tests.', [
        { id: 'REQ-0001', name: 'Credit Notes', statement: STATEMENT, scenarios },
      ]);
      const specReport = await new Validator().validateSpecContent('billing', spec);
      const deltaReport = await validateDelta(deltaSpec('added', scenarios));

      expect(specReport.valid).toBe(valid);
      expect(deltaReport.valid).toBe(valid);
    });
  }
});

describe('validate rejects a scenario with no steps', () => {
  const scenarioErrors = (report: { issues: Array<{ level: string; message: string }> }) =>
    report.issues.filter((issue) => issue.level === 'ERROR' && issue.message.includes('scenario'));

  for (const operation of ['added', 'modified'] as const) {
    it(`rejects a @${operation} rule whose only scenario has no steps, naming it`, async () => {
      const report = await validateDelta(deltaSpec(operation, [NO_STEPS]));
      expect(report.valid).toBe(false);
      const errors = scenarioErrors(report);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain(`@${operation} "Credit Notes"`);
      // Say why a scenario the author can see does not count.
      expect(errors[0].message).toContain('scenario "Invoice voided" has no steps');
    });
  }
});

/**
 * A real project, created with `openspec init` and `openspec new change`, whose
 * change `edit` adds a Credit Notes requirement with the given scenarios.
 */
async function projectWithScenarios(scenarios: FixtureScenario[]) {
  const base = await tempDir('openspec-scenario-body-e2e-');
  const home = path.join(base, 'home');
  const project = path.join(base, 'project');
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(project, { recursive: true });
  const env = {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    OPENSPEC_NO_ANIMATION: '1',
  };
  const cli = (args: string[]) => runCLI(args, { cwd: project, env, timeoutMs: 60_000 });

  expect((await cli(['init', '--tools', 'claude'])).exitCode).toBe(0);
  expect((await cli(['new', 'change', 'edit'])).exitCode).toBe(0);
  const dir = path.join(project, 'openspec', 'changes', 'edit');
  await fs.mkdir(path.join(dir, 'specs', 'billing'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'proposal.md'),
    '# Credit notes\n\n## Why\nVoided invoices need a matching credit note so the ledger always balances.\n\n## What Changes\n- **billing**: adds credit notes\n'
  );
  await fs.writeFile(path.join(dir, 'tasks.md'), '## 1. Work\n- [x] 1.1 Done\n');
  await fs.writeFile(path.join(dir, 'specs', 'billing', 'spec.feature'), deltaSpec('added', scenarios));

  return {
    verdicts: async () => {
      const validated = JSON.parse((await cli(['validate', 'edit', '--json'])).stdout);
      const archived = await cli(['archive', 'edit', '--yes']);
      return { valid: validated.items[0].valid as boolean, archived: archived.exitCode === 0 };
    },
  };
}

describe('validate and archive give the same verdict (e2e)', () => {
  it('control: a scenario with steps is valid and archives', async () => {
    const project = await projectWithScenarios([WITH_STEPS]);
    expect(await project.verdicts()).toEqual({ valid: true, archived: true });
  }, 120_000);

  it('a scenario with no steps is rejected by both', async () => {
    const project = await projectWithScenarios([NO_STEPS]);
    expect(await project.verdicts()).toEqual({ valid: false, archived: false });
  }, 120_000);

  it('two scenarios where one has no steps are rejected by both', async () => {
    const project = await projectWithScenarios(CASES[2].scenarios);
    expect(await project.verdicts()).toEqual({ valid: false, archived: false });
  }, 120_000);
});
