import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';

describe('openspec show --diff', () => {
  const openspecBin = path.join(process.cwd(), 'bin', 'openspec.js');
  // A fresh temp directory per test keeps concurrent test files from sharing a
  // project, and lets every run pass `cwd` instead of chdir-ing the process.
  let testDir: string;
  let changesDir: string;
  let specsDir: string;

  /** A rule block at the indentation a spec holds it. */
  const rule = (tags: string, name: string, statement: string, scenario: string, steps: string[]) =>
    [
      `  ${tags}`,
      `  Rule: ${name}`,
      `    ${statement}`,
      '',
      `    Scenario: ${scenario}`,
      ...steps.map((step) => `      ${step}`),
    ].join('\n');

  const feature = (name: string, ...rules: string[]) => `Feature: ${name}\n\n${rules.join('\n\n')}\n`;

  async function writeChange(name: string, why: string, capability: string, delta: string): Promise<string> {
    const changeDir = path.join(changesDir, name);
    await fs.mkdir(path.join(changeDir, 'specs', ...capability.split('/')), { recursive: true });
    await fs.writeFile(
      path.join(changeDir, 'proposal.md'),
      `## Why\n${why}\n\n## What Changes\n- **${capability}:** ${why}\n`,
      'utf-8'
    );
    await fs.writeFile(path.join(changeDir, 'specs', ...capability.split('/'), 'spec.feature'), delta, 'utf-8');
    return changeDir;
  }

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-show-diff-'));
    changesDir = path.join(testDir, 'openspec', 'changes');
    specsDir = path.join(testDir, 'openspec', 'specs');
    await fs.mkdir(changesDir, { recursive: true });
    await fs.mkdir(specsDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'openspec', 'project.md'), '# Test project\n', 'utf-8');

    // Base spec: auth capability with two requirements
    const baseSpec = [
      'Feature: Auth',
      '  Authentication spec.',
      '',
      rule(
        '@REQ-0001',
        'User login',
        'The system SHALL allow users to log in with email and password.',
        'Valid credentials',
        ['When user provides valid email and password', 'Then system authenticates the user']
      ),
      '',
      rule(
        '@REQ-0002',
        'Session management',
        'The system SHALL manage user sessions.',
        'Session timeout',
        ['When session is idle for 30 minutes', 'Then system expires the session']
      ),
      '',
    ].join('\n');

    await fs.mkdir(path.join(specsDir, 'auth'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'auth', 'spec.feature'), baseSpec, 'utf-8');

    // Change proposal
    const proposal = [
      '## Why',
      'Improve auth.',
      '',
      '## What Changes',
      '- **auth:** Modify login, add MFA',
      '',
      '## Capabilities',
      '### Modified Capabilities',
      '- `auth`: Change login requirement, add MFA',
      '',
    ].join('\n');

    const changeDir = path.join(changesDir, 'auth-update');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, 'proposal.md'), proposal, 'utf-8');

    // Delta spec: one @modified, one @added
    const deltaSpec = feature(
      'Auth',
      [
        rule(
          '@modified @REQ-0001',
          'User login',
          'The system SHALL allow users to log in with email, password, or SSO.',
          'Valid credentials',
          ['When user provides valid email and password', 'Then system authenticates the user']
        ),
        '',
        '    Scenario: SSO login',
        '      When user clicks SSO provider',
        '      Then system redirects to SSO flow',
      ].join('\n'),
      rule(
        '@added @REQ-0003',
        'Multi-factor authentication',
        'The system SHALL support MFA via TOTP.',
        'MFA setup',
        ['When user enables MFA', 'Then system generates TOTP secret']
      )
    );

    await fs.mkdir(path.join(changeDir, 'specs', 'auth'), { recursive: true });
    await fs.writeFile(path.join(changeDir, 'specs', 'auth', 'spec.feature'), deltaSpec, 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // Arguments go through as an argv array: no shell, so a path or requirement
  // name with a space in it cannot be re-split or interpreted.
  function run(args: string[]): string {
    return execFileSync(process.execPath, [openspecBin, ...args], {
      encoding: 'utf-8',
      cwd: testDir,
      env: { ...process.env, NO_COLOR: '1' },
    });
  }

  function runWithStderr(args: string[]): { stdout: string; stderr: string; status: number | null } {
    const result = spawnSync(process.execPath, [openspecBin, ...args], {
      encoding: 'utf-8',
      cwd: testDir,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
  }

  it('text mode: shows proposal then @modified diff and @added full text', () => {
    const output = run(['show', 'auth-update', '--type', 'change', '--diff']);

    // Proposal should appear first
    expect(output).toContain('Improve auth.');
    expect(output.indexOf('Improve auth.')).toBeLessThan(output.indexOf('Specifications Changed (diffs)'));

    // @modified shows a unified diff of the rule, without the operation tag
    expect(output).toContain('MODIFIED: REQ-0001 User login');
    expect(output).toContain('-    The system SHALL allow users to log in with email and password.');
    expect(output).toContain('+    The system SHALL allow users to log in with email, password, or SSO.');
    expect(output).toContain('+    Scenario: SSO login');
    expect(output).not.toContain('+  @modified');

    // @added shows its full text
    expect(output).toContain('ADDED: REQ-0003 Multi-factor authentication');
    expect(output).toContain('The system SHALL support MFA via TOTP.');
  });

  it('text mode: without --diff the output is the proposal, unchanged', async () => {
    const output = run(['show', 'auth-update', '--type', 'change']);
    const proposal = await fs.readFile(path.join(changesDir, 'auth-update', 'proposal.md'), 'utf-8');

    // `show <change>` stays a raw proposal passthrough: --diff is additive, so
    // anything already parsing this output keeps seeing exactly what it saw.
    expect(output.trimEnd()).toBe(proposal.trimEnd());
    expect(output).not.toContain('Specifications Changed');
  });

  it('text mode: shows a warning when the @modified ID is not in the main spec', async () => {
    await writeChange(
      'no-match',
      'Test.',
      'auth',
      feature(
        'Auth',
        rule('@modified @REQ-0042', 'Nonexistent base', 'The system SHALL do something new.', 'Works', [
          'When called',
          'Then works',
        ])
      )
    );

    const output = run(['show', 'no-match', '--type', 'change', '--diff']);
    expect(output).toContain('MODIFIED: REQ-0042 Nonexistent base');
    expect(output).toContain('No requirement REQ-0042 in the main spec of auth');
  });

  it('text mode: reports when the change has no delta specs to diff', async () => {
    const changeDir = path.join(changesDir, 'empty-change');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, 'proposal.md'), '## Why\nTest reason.\n\n## What Changes\n- nothing\n', 'utf-8');

    const output = run(['show', 'empty-change', '--type', 'change', '--diff']);
    expect(output).toContain('Test reason.');
    expect(output).toContain('No delta specs to diff for change "empty-change".');
    expect(output).not.toContain('Specifications Changed');
  });

  it('text mode: keeps the reason written under a @removed rule', async () => {
    await writeChange(
      'drop-sessions',
      'Sessions move.',
      'auth',
      feature(
        'Auth',
        [
          '  @removed @REQ-0002',
          '  Rule: Session management',
          '    Reason: Sessions moved to the token service.',
          '    Migration: Callers switch to `POST /tokens`.',
        ].join('\n')
      )
    );

    const output = run(['show', 'drop-sessions', '--type', 'change', '--diff']);
    expect(output).toContain('REMOVED: REQ-0002 Session management');
    expect(output).toContain('Sessions moved to the token service.');
    expect(output).toContain('Callers switch to `POST /tokens`.');
  });

  it('diffs a rename against the requirement with the same ID', async () => {
    await writeChange(
      'rename-change',
      'Rename.',
      'auth',
      feature(
        'Auth',
        rule(
          '@modified @REQ-0002',
          'Session lifecycle',
          'The system SHALL manage user sessions with configurable timeout.',
          'Session timeout',
          ['When session is idle for configurable duration', 'Then system expires the session']
        )
      )
    );

    const output = run(['show', 'rename-change', '--type', 'change', '--diff']);
    expect(output).toContain('MODIFIED: REQ-0002 Session lifecycle');
    expect(output).toContain('-  Rule: Session management');
    expect(output).toContain('+  Rule: Session lifecycle');
    expect(output).toContain('-    The system SHALL manage user sessions.');
    expect(output).toContain('+    The system SHALL manage user sessions with configurable timeout.');

    const json = JSON.parse(run(['show', 'rename-change', '--type', 'change', '--diff', '--json']));
    const modified = json.deltas.find((d: any) => d.operation === 'MODIFIED');
    expect(modified.diff).toContain('+  Rule: Session lifecycle');
    expect(modified.warning).toBeUndefined();
  });

  it('warns about a @modified rule with no ID instead of guessing its base', async () => {
    await writeChange(
      'no-id',
      'Untagged.',
      'auth',
      feature(
        'Auth',
        rule('@modified', 'User login', 'The system SHALL allow passkeys.', 'Passkey', ['When a passkey is used', 'Then it works'])
      )
    );

    const json = JSON.parse(run(['show', 'no-id', '--type', 'change', '--diff', '--json']));
    const modified = json.deltas.find((d: any) => d.operation === 'MODIFIED');
    expect(modified.diff).toBeUndefined();
    expect(modified.warning).toContain('has no requirement ID');
  });

  it('propagates delta discovery failures instead of reporting no delta specs', async () => {
    const changeDir = path.join(changesDir, 'broken-discovery');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, 'proposal.md'),
      '## Why\nTest.\n\n## What Changes\n- inspect discovery failures\n',
      'utf-8'
    );
    await fs.writeFile(path.join(changeDir, 'specs'), 'not a directory', 'utf-8');

    const result = runWithStderr(['show', 'broken-discovery', '--type', 'change', '--diff']);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toBe('');
    expect(result.stdout).not.toContain('No delta specs to diff');
  });

  it('propagates main-spec read failures instead of reporting the spec missing', async () => {
    const mainSpecPath = path.join(specsDir, 'auth', 'spec.feature');
    await fs.rm(mainSpecPath);
    await fs.mkdir(mainSpecPath);

    const result = runWithStderr(['show', 'auth-update', '--type', 'change', '--diff']);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toBe('');
    expect(result.stdout).not.toContain('No main spec at');
  });

  it('warns instead of inventing a diff when a @modified spec has no main spec', async () => {
    await writeChange(
      'no-main-spec',
      'Billing.',
      'billing',
      feature(
        'Billing',
        rule('@modified @REQ-0009', 'Billing', 'The system SHALL bill monthly.', 'Monthly', [
          'When a month ends',
          'Then a bill is sent',
        ])
      )
    );

    const output = run(['show', 'no-main-spec', '--type', 'change', '--diff']);
    expect(output).toContain('MODIFIED: REQ-0009 Billing');
    expect(output).toContain('No main spec at openspec/specs/billing/spec.feature');
    // The requirement text is still shown, but not dressed up as a diff.
    expect(output).toContain('The system SHALL bill monthly.');
    expect(output).not.toContain('+    The system SHALL bill monthly.');

    const json = JSON.parse(run(['show', 'no-main-spec', '--type', 'change', '--diff', '--json']));
    const modified = json.deltas.find((d: any) => d.operation === 'MODIFIED');
    expect(modified.diff).toBeUndefined();
    expect(modified.warning).toContain('No main spec at openspec/specs/billing/spec.feature');
  });

  it('diffs a nested capability (specs/<area>/<id>/spec.feature)', async () => {
    await fs.mkdir(path.join(specsDir, 'platform', 'session-layout'), { recursive: true });
    await fs.writeFile(
      path.join(specsDir, 'platform', 'session-layout', 'spec.feature'),
      [
        'Feature: Session layout',
        '  Session layout.',
        '',
        rule('@REQ-0005', 'Layout', 'The system SHALL render two panes.', 'Two panes', [
          'When the session opens',
          'Then two panes render',
        ]),
        '',
      ].join('\n'),
      'utf-8'
    );
    await writeChange(
      'nested-change',
      'More panes.',
      'platform/session-layout',
      feature(
        'Session layout',
        rule('@modified @REQ-0005', 'Layout', 'The system SHALL render three panes.', 'Two panes', [
          'When the session opens',
          'Then three panes render',
        ])
      )
    );

    const output = run(['show', 'nested-change', '--type', 'change', '--diff']);
    expect(output).toContain('platform/session-layout');
    expect(output).toContain('MODIFIED: REQ-0005 Layout');
    expect(output).toContain('-    The system SHALL render two panes.');
    expect(output).toContain('+    The system SHALL render three panes.');

    const json = JSON.parse(run(['show', 'nested-change', '--type', 'change', '--diff', '--json']));
    const modified = json.deltas.find((d: any) => d.operation === 'MODIFIED');
    expect(modified.spec).toBe('platform/session-layout');
    expect(modified.diff).toContain('+    The system SHALL render three panes.');
  });

  it('warns and ignores --diff when the item is a spec', async () => {
    const { stdout, stderr } = runWithStderr(['show', 'auth', '--type', 'spec', '--diff']);
    expect(stderr).toContain('Ignoring flags not applicable to spec');
    expect(stderr).toContain('diff');
    expect(stdout).toContain('Rule: User login');
    expect(stdout).not.toContain('Specifications Changed');
  });

  it('JSON mode: includes diff field on MODIFIED, not on ADDED', () => {
    const json = JSON.parse(run(['show', 'auth-update', '--type', 'change', '--diff', '--json']));

    // --json --diff uses the same top-level structure as --json alone
    expect(json.id).toBe('auth-update');
    expect(json.title).toBeDefined();
    expect(json.deltaCount).toBeDefined();
    expect(Array.isArray(json.deltas)).toBe(true);

    const modified = json.deltas.find((d: any) => d.operation === 'MODIFIED');
    expect(modified).toBeDefined();
    expect(modified.diff).toContain('-    The system SHALL allow users to log in with email and password.');
    expect(modified.diff).toContain('+    The system SHALL allow users to log in with email, password, or SSO.');

    const added = json.deltas.find((d: any) => d.operation === 'ADDED');
    expect(added).toBeDefined();
    expect(added.diff).toBeUndefined();
  });

  it('JSON mode: attaches each diff to its own requirement when one spec has several', async () => {
    // Two @modified rules in one delta file: the JSON deltas and the parsed
    // rules are paired by source order, so a mismatch here would show a
    // reviewer one requirement's changes under another's name.
    await writeChange(
      'two-mods',
      'Two edits.',
      'auth',
      feature(
        'Auth',
        rule(
          '@modified @REQ-0002',
          'Session management',
          'The system SHALL manage user sessions for 60 minutes.',
          'Session timeout',
          ['When session is idle for 60 minutes', 'Then system expires the session']
        ),
        rule(
          '@modified @REQ-0001',
          'User login',
          'The system SHALL allow users to log in with a passkey.',
          'Valid credentials',
          ['When user presents a passkey', 'Then system authenticates the user']
        )
      )
    );

    const json = JSON.parse(run(['show', 'two-mods', '--type', 'change', '--diff', '--json']));
    const modified = json.deltas.filter((d: any) => d.operation === 'MODIFIED');
    expect(modified).toHaveLength(2);

    for (const delta of modified) {
      expect(delta.diff).toBeDefined();
      if (delta.description.includes('passkey')) {
        expect(delta.diff).toContain('+    The system SHALL allow users to log in with a passkey.');
        expect(delta.diff).not.toContain('60 minutes');
      } else {
        expect(delta.diff).toContain('+    The system SHALL manage user sessions for 60 minutes.');
        expect(delta.diff).not.toContain('passkey');
      }
    }
  });

  it('text mode: distinguishes an empty diff from a missing base', async () => {
    await writeChange(
      'unchanged-modification',
      'Review an unchanged block.',
      'auth',
      feature(
        'Auth',
        rule('@modified @REQ-0002', 'Session management', 'The system SHALL manage user sessions.', 'Session timeout', [
          'When session is idle for 30 minutes',
          'Then system expires the session',
        ])
      )
    );

    const output = run(['show', 'unchanged-modification', '--type', 'change', '--diff']);
    expect(output).toContain('MODIFIED: REQ-0002 Session management');
    expect(output).toContain('(no textual changes)');

    const json = JSON.parse(run(['show', 'unchanged-modification', '--type', 'change', '--diff', '--json']));
    const modified = json.deltas.find((delta: any) => delta.operation === 'MODIFIED');
    expect(modified.diff).toBe('');
    expect(modified.warning).toBeUndefined();
  });

  it('JSON mode: --json --diff is backwards-compatible with --json', () => {
    const jsonOnly = JSON.parse(run(['show', 'auth-update', '--type', 'change', '--json']));
    const jsonDiff = JSON.parse(run(['show', 'auth-update', '--type', 'change', '--json', '--diff']));

    // Same top-level keys
    expect(Object.keys(jsonDiff).sort()).toEqual(Object.keys(jsonOnly).sort());
    expect(jsonDiff.id).toBe(jsonOnly.id);
    expect(jsonDiff.title).toBe(jsonOnly.title);
    expect(jsonDiff.deltaCount).toBe(jsonOnly.deltaCount);
    expect(jsonDiff.deltas.length).toBe(jsonOnly.deltas.length);

    // Each delta has the same base fields
    for (let i = 0; i < jsonOnly.deltas.length; i++) {
      expect(jsonDiff.deltas[i].spec).toBe(jsonOnly.deltas[i].spec);
      expect(jsonDiff.deltas[i].operation).toBe(jsonOnly.deltas[i].operation);
    }
  });
});
