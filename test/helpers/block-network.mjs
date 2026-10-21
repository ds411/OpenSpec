// Preloaded with `node --import` by test/cli-e2e/fork-update-check.test.ts.
// Refuses every outbound request the process starts through node:http,
// node:https or fetch, and writes the target of each one, one per line, to the
// file named by OPENSPEC_TEST_NETWORK_LOG when the process exits. Nothing
// leaves the machine, so a test can remove the opt-outs that otherwise keep
// telemetry and the update check off the network.
import http from 'node:http';
import https from 'node:https';
import { writeFileSync } from 'node:fs';

const logFile = process.env.OPENSPEC_TEST_NETWORK_LOG;
const attempts = [];

function describeTarget(target) {
  if (typeof target === 'string') return target;
  if (target instanceof URL) return target.href;
  // A fetch Request.
  if (typeof target?.url === 'string') return target.url;
  // http.request options.
  if (target && typeof target === 'object') {
    const port = target.port ? `:${target.port}` : '';
    return `${target.protocol ?? ''}//${target.hostname ?? target.host ?? ''}${port}${target.path ?? ''}`;
  }
  return String(target);
}

function refuse(target) {
  attempts.push(describeTarget(target));
  throw new Error('Network access is blocked by test/helpers/block-network.mjs');
}

for (const transport of [http, https]) {
  transport.get = (target) => refuse(target);
  transport.request = (target) => refuse(target);
}
globalThis.fetch = async (input) => refuse(input);

if (logFile) {
  process.on('exit', () => writeFileSync(logFile, attempts.join('\n')));
}
