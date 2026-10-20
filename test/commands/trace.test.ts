import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCLI, type RunCLIResult } from '../helpers/run-cli.js';
import { cleanupTempPath } from '../helpers/temp-cleanup.js';

const MAIN_SPEC = `Feature: List command
  Gives developers a quick overview.

  @REQ-0001
  Rule: Command execution
    The command SHALL scan active changes.

    Scenario: Scan
      When \`openspec list\` runs
      Then it scans

  @REQ-0002
  Rule: Table output
    The command SHALL print a table.

    Scenario: Table
      When it runs
      Then a table prints

  @REQ-0003 @notrace
  Rule: Process rule
    The team MUST review output.

    Scenario: Review
      When output changes
      Then a person reviews it

  @REQ-0005
  Rule: Legacy borders
    The command SHALL draw borders.

    Scenario: Borders
      When it runs
      Then borders show
`;

const ADD_JSON_DELTA = `Feature: List command

  @added @REQ-0042
  Rule: JSON output
    The command SHALL print JSON.

    Scenario: JSON
      When \`openspec list --json\` runs
      Then JSON prints
`;

const DROP_BORDERS_DELTA = `Feature: List command

  @removed @REQ-0005
  Rule: Legacy borders
    Reason: The new table style replaces the borders.
    Migration: None.
`;

describe('openspec trace', () => {
  let tempDir: string;
  let projectRoot: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-trace-cli-')));
    projectRoot = path.join(tempDir, 'project');
    env = {
      XDG_DATA_HOME: path.join(tempDir, 'data'),
      XDG_CONFIG_HOME: path.join(tempDir, 'config'),
      // No git repository above the project: the scanner walks the folder.
      GIT_CEILING_DIRECTORIES: tempDir,
    };
    write('openspec/config.yaml', 'schema: spec-driven\n');
    write('openspec/specs/cli-list/spec.feature', MAIN_SPEC);
    write('openspec/changes/add-json/specs/cli-list/spec.feature', ADD_JSON_DELTA);
    write('openspec/changes/drop-borders/specs/cli-list/spec.feature', DROP_BORDERS_DELTA);
  });

  afterEach(() => {
    cleanupTempPath(tempDir);
  });

  function write(relativePath: string, content: string): void {
    const file = path.join(projectRoot, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  function run(args: string[], cwd = projectRoot): Promise<RunCLIResult> {
    return runCLI(['trace', ...args], { cwd, env });
  }

  function json(result: RunCLIResult): any {
    return JSON.parse(result.stdout);
  }

  function traceEverything(): void {
    write('src/list.ts', '// @trace REQ-0001\nexport function list() {}\n');
    write('src/table.py', '# @trace REQ-0002, REQ-0042\n');
  }

  describe('check', () => {
    it('passes and exits 0 when every requirement is traced and every trace is known', async () => {
      traceEverything();
      const result = await run(['check']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Trace check passed');
    });

    it('fails with exit 1 and lists untraced requirements and orphan traces', async () => {
      write('src/list.ts', '// @trace REQ-0001\n/* @trace REQ-0042, REQ-0099 */\n');
      const result = await run(['check']);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('REQ-0002');
      expect(result.stdout).toContain('Table output');
      expect(result.stdout).toContain('REQ-0099');
      expect(result.stdout).toContain('src/list.ts:2');
      expect(result.stdout).toContain('1 pending requirement in active changes (1 traced)');
      expect(result.stdout).toContain('Trace check failed');
    });

    it('prints the agreed JSON shape', async () => {
      write('src/list.ts', '// @trace REQ-0001\n/* @trace REQ-0042, REQ-0099 */\n// @trace REQ-0005\n');
      const result = await run(['check', '--json']);
      expect(result.exitCode).toBe(1);
      const output = json(result);
      expect(output).toMatchObject({
        valid: false,
        checks: ['untraced', 'orphans'],
        summary: {
          requirements: 4,
          traced: 1,
          untraced: 1,
          notrace: 1,
          removing: 1,
          pending: 1,
          traces: 4,
          orphans: 1,
          warnings: 1,
          filesScanned: 1,
        },
        untraced: [
          {
            id: 'REQ-0002',
            name: 'Table output',
            capability: 'cli-list',
            file: 'openspec/specs/cli-list/spec.feature',
            line: 13,
          },
        ],
        orphans: [{ id: 'REQ-0099', file: 'src/list.ts', line: 2 }],
        warnings: [
          {
            code: 'trace_to_removed_requirement',
            id: 'REQ-0005',
            file: 'src/list.ts',
            line: 3,
            change: 'drop-borders',
          },
        ],
        pending: [
          {
            id: 'REQ-0042',
            name: 'JSON output',
            capability: 'cli-list',
            file: 'openspec/changes/add-json/specs/cli-list/spec.feature',
            line: 4,
            change: 'add-json',
            traced: true,
          },
        ],
        root: { source: 'nearest' },
      });
    });

    it('--untraced runs only the untraced check', async () => {
      write('src/list.ts', '// @trace REQ-0001, REQ-0002, REQ-0099\n');
      const result = await run(['check', '--untraced', '--json']);
      expect(result.exitCode).toBe(0);
      const output = json(result);
      expect(output.checks).toEqual(['untraced']);
      expect(output.valid).toBe(true);
      expect(output.untraced).toEqual([]);
      expect(output).not.toHaveProperty('orphans');
    });

    it('--orphans runs only the orphan check', async () => {
      write('src/list.ts', '// @trace REQ-0099\n');
      const result = await run(['check', '--orphans', '--json']);
      expect(result.exitCode).toBe(1);
      const output = json(result);
      expect(output.checks).toEqual(['orphans']);
      expect(output.orphans).toEqual([{ id: 'REQ-0099', file: 'src/list.ts', line: 1 }]);
      expect(output).not.toHaveProperty('untraced');
    });

    it('both flags together run both checks', async () => {
      traceEverything();
      const output = json(await run(['check', '--untraced', '--orphans', '--json']));
      expect(output.checks).toEqual(['untraced', 'orphans']);
    });

    it('finds the root from a subfolder and still scans the whole project', async () => {
      traceEverything();
      const result = await run(['check', '--json'], path.join(projectRoot, 'src'));
      expect(result.exitCode).toBe(0);
      expect(json(result).summary.filesScanned).toBe(2);
    });

    it('applies trace.include and trace.exclude from openspec/config.yaml', async () => {
      traceEverything();
      write('vendor/lib.js', '// @trace REQ-0099\n');
      write('src/list.test.ts', '// @trace REQ-0098\n');
      write(
        'openspec/config.yaml',
        'schema: spec-driven\ntrace:\n  include:\n    - "src/**"\n  exclude:\n    - "**/*.test.ts"\n'
      );
      const result = await run(['check', '--json']);
      expect(result.exitCode).toBe(0);
      expect(json(result).summary.filesScanned).toBe(2);
    });

    it('reports a rule with no ID as a warning, not a failure', async () => {
      traceEverything();
      write(
        'openspec/specs/other/spec.feature',
        'Feature: Other\n\n  Rule: Needs an ID\n    It SHALL work.\n\n    Scenario: Works\n      Then it works\n'
      );
      const result = await run(['check', '--json']);
      expect(result.exitCode).toBe(0);
      expect(json(result).warnings).toEqual([
        expect.objectContaining({
          code: 'requirement_without_id',
          file: 'openspec/specs/other/spec.feature',
          line: 3,
        }),
      ]);
    });

    it('fails with a JSON status when there is no OpenSpec root', async () => {
      const empty = path.join(tempDir, 'empty');
      fs.mkdirSync(empty);
      const result = await run(['check', '--json'], empty);
      expect(result.exitCode).toBe(1);
      const output = json(result);
      expect(output.valid).toBe(false);
      expect(output.status[0].code).toBe('no_openspec_root');
    });
  });

  describe('show', () => {
    it('lists the traces of a requirement', async () => {
      write('src/a.ts', '// @trace REQ-0001\n');
      write('src/b.ts', '\n\n# @trace REQ-0001\n');
      const result = await run(['show', 'REQ-0001', '--json']);
      expect(result.exitCode).toBe(0);
      expect(json(result)).toMatchObject({
        id: 'REQ-0001',
        requirement: {
          id: 'REQ-0001',
          name: 'Command execution',
          capability: 'cli-list',
          file: 'openspec/specs/cli-list/spec.feature',
          line: 5,
          status: 'active',
          notrace: false,
          changes: [],
        },
        traces: [
          { id: 'REQ-0001', file: 'src/a.ts', line: 1, text: '// @trace REQ-0001' },
          { id: 'REQ-0001', file: 'src/b.ts', line: 3, text: '# @trace REQ-0001' },
        ],
      });
    });

    it('accepts @REQ-0001 and lower case, and prints a human list', async () => {
      write('src/a.ts', '// @trace REQ-0001\n');
      const result = await run(['show', '@req-0001']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('REQ-0001');
      expect(result.stdout).toContain('Command execution');
      expect(result.stdout).toContain('src/a.ts:1');
    });

    it('shows a pending requirement and the change that adds it', async () => {
      const output = json(await run(['show', 'REQ-0042', '--json']));
      expect(output.requirement).toMatchObject({ status: 'pending', changes: ['add-json'] });
      expect(output.traces).toEqual([]);
    });

    it('shows a requirement that a change removes', async () => {
      const output = json(await run(['show', 'REQ-0005', '--json']));
      expect(output.requirement).toMatchObject({ status: 'removing', changes: ['drop-borders'] });
    });

    it('exits 0 for an ID that is no requirement and lists its traces', async () => {
      write('src/a.ts', '// @trace REQ-0099\n');
      const result = await run(['show', 'REQ-0099', '--json']);
      expect(result.exitCode).toBe(0);
      expect(json(result)).toMatchObject({ id: 'REQ-0099', requirement: null, traces: [{ file: 'src/a.ts' }] });
    });

    it('exits 1 for text that is not an ID', async () => {
      const result = await run(['show', 'not-an-id', '--json']);
      expect(result.exitCode).toBe(1);
      expect(json(result).status[0].message).toContain('not a requirement ID');
    });
  });

  describe('report', () => {
    it('gives traced and total requirements per capability', async () => {
      write('src/a.ts', '// @trace REQ-0001\n');
      write(
        'openspec/specs/web/spec.feature',
        'Feature: Web\n\n  @REQ-0010\n  Rule: Page\n    It SHALL render.\n\n    Scenario: Render\n      Then it renders\n'
      );
      const result = await run(['report', '--json']);
      expect(result.exitCode).toBe(0);
      const output = json(result);
      expect(output.summary).toEqual({
        requirements: 5,
        traced: 1,
        untraced: 2,
        notrace: 1,
        removing: 1,
        pending: 1,
        coverage: 0.3333,
      });
      expect(output.capabilities).toEqual([
        { capability: 'cli-list', requirements: 4, traced: 1, untraced: 1, notrace: 1, removing: 1, pending: 1, coverage: 0.5 },
        { capability: 'web', requirements: 1, traced: 0, untraced: 1, notrace: 0, removing: 0, pending: 0, coverage: 0 },
      ]);
      expect(output.pending).toEqual([expect.objectContaining({ id: 'REQ-0042', traced: false })]);
    });

    it('exits 0 even when requirements have no trace, and prints a table', async () => {
      const result = await run(['report']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/cli-list\s+0\/2\s+0%/);
      expect(result.stdout).toMatch(/Total\s+0\/2\s+0%/);
    });
  });
});
