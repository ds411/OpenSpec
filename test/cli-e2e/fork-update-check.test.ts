import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cliProjectRoot, ensureCliBuilt } from '../helpers/run-cli.js';

// This fork keeps upstream's npm name, so the CLI turns the update check off
// (runCli in src/cli/index.ts). Each run here removes every other opt-out and
// refuses all outbound requests, so a "disabled" answer can only come from
// that default, and nothing reaches the network while telemetry is on.

const binPath = path.join(cliProjectRoot, 'bin', 'openspec.js');
const versionCheckUrl = pathToFileURL(
  path.join(cliProjectRoot, 'dist', 'core', 'version-check.js')
).href;
const blockNetworkUrl = pathToFileURL(
  path.join(cliProjectRoot, 'test', 'helpers', 'block-network.mjs')
).href;

// A reserved name (RFC 6761) that never resolves. Set explicitly, because
// pnpm exports its own registry to scripts, and an override that is not https
// would disable the check for an unrelated reason.
const REGISTRY_HOST = 'registry.openspec.test';

// Each of these turns the check off on its own.
const OPT_OUTS = ['NODE_ENV', 'CI', 'OPENSPEC_NO_UPDATE_CHECK', 'DO_NOT_TRACK', 'OPENSPEC_TELEMETRY'];

const workDirs: string[] = [];

afterAll(() => {
  for (const dir of workDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runWithoutOptOuts(nodeArgs: string[]) {
  const workDir = mkdtempSync(path.join(os.tmpdir(), 'openspec-fork-update-check-'));
  workDirs.push(workDir);
  const logFile = path.join(workDir, 'network.log');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPEN_SPEC_INTERACTIVE: '0',
    XDG_CONFIG_HOME: path.join(workDir, 'config'),
    XDG_DATA_HOME: path.join(workDir, 'data'),
    npm_config_registry: `https://${REGISTRY_HOST}/`,
    OPENSPEC_TEST_NETWORK_LOG: logFile,
  };
  // Unset rather than blank: Windows drops empty env vars.
  for (const key of OPT_OUTS) delete env[key];

  const result = spawnSync(process.execPath, ['--import', blockNetworkUrl, ...nodeArgs], {
    cwd: workDir,
    env,
    encoding: 'utf-8',
    timeout: 30_000,
    windowsHide: true,
  });
  expect(result.error).toBeUndefined();

  const registryRequests = readFileSync(logFile, 'utf-8')
    .split('\n')
    .filter((target) => target.includes(REGISTRY_HOST));
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, registryRequests };
}

describe('fork update check', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  });

  it('is disabled in the CLI with no opt-out set, and asks no registry', () => {
    const result = runWithoutOptOuts([binPath, 'version', '--check', '--json']);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).update).toEqual({
      status: 'disabled',
      latest: null,
      command: null,
      canSelfUpgrade: false,
    });
    expect(result.registryRequests).toEqual([]);
  });

  it('still runs in the same environment outside the CLI', () => {
    // The control for the case above: the module on its own does ask the
    // registry, so no opt-out was left behind in the environment.
    const script = [
      `const { checkForCliUpdate } = await import(${JSON.stringify(versionCheckUrl)});`,
      'console.log(JSON.stringify(await checkForCliUpdate()));',
    ].join('\n');
    const result = runWithoutOptOuts(['--input-type=module', '-e', script]);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ status: 'offline', latest: null });
    expect(result.registryRequests).toHaveLength(1);
  });
});
