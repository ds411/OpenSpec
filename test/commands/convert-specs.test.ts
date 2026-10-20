import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { runCLI } from '../helpers/run-cli.js';

const SPEC = `# Alpha Specification

## Purpose
Alpha behavior for the conversion check, long enough for strict validation.

## Requirements

### Requirement: Alpha output
The system SHALL produce alpha output.

#### Scenario: Alpha runs
- **WHEN** alpha runs
- **THEN** it prints output
`;

describe('openspec convert-specs', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-convert-cli-'));
    await fs.mkdir(path.join(root, 'openspec', 'specs', 'alpha'), { recursive: true });
    await fs.writeFile(path.join(root, 'openspec', 'specs', 'alpha', 'spec.md'), SPEC);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('converts the specs and leaves a project that validates', async () => {
    const result = await runCLI(['convert-specs'], { cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Converted openspec/specs/alpha/spec.md → spec.feature (1 requirement)');
    expect(result.stdout).toContain('Converted 1 file and gave 1 ID.');
    expect(result.stdout).toContain('Next: run "openspec validate --all"');

    const validate = await runCLI(['validate', '--all', '--strict'], { cwd: root });
    expect(validate.exitCode).toBe(0);
  });

  it('reports the plan as JSON on a dry run, and writes nothing', async () => {
    const result = await runCLI(['convert-specs', '--dry-run', '--json'], { cwd: root });

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.converted).toEqual([
      {
        kind: 'spec',
        capability: 'alpha',
        source: 'openspec/specs/alpha/spec.md',
        target: 'openspec/specs/alpha/spec.feature',
        requirements: 1,
      },
    ]);
    expect(payload.ids).toEqual([{ file: 'openspec/specs/alpha/spec.feature', rule: 'Alpha output', id: 'REQ-0001' }]);
    await expect(fs.access(path.join(root, 'openspec', 'specs', 'alpha', 'spec.feature'))).rejects.toThrow();
  });

  it('says so when there is nothing to convert', async () => {
    await runCLI(['convert-specs'], { cwd: root });
    const again = await runCLI(['convert-specs'], { cwd: root });
    expect(again.exitCode).toBe(0);
    expect(again.stdout).toContain('No markdown specs to convert.');
  });
});
