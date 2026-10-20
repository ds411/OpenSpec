/**
 * `openspec ids`: give requirements their IDs.
 *
 * `ids assign` tags every `Rule:` that has no ID with the next free one.
 * `ids next` takes IDs from the counter without writing them anywhere, for a
 * tool or a person that writes the tags itself.
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveRootForCommand, type ResolvedOpenSpecRoot } from '../core/root-selection.js';
import { assignMissingIds, collectFeatureFiles, reserveIds } from '../core/gherkin/id-store.js';
import { emitFailure, printJson } from './shared-output.js';

export interface IdsAssignOptions {
  dryRun?: boolean;
  json?: boolean;
  store?: string;
  storePath?: string;
}

export interface IdsNextOptions {
  count?: string;
  json?: boolean;
  store?: string;
  storePath?: string;
}

const ASSIGN_FAILURE_PAYLOAD = { assigned: [], problems: [] };
const NEXT_FAILURE_PAYLOAD = { ids: [] };

/** Path as shown to the reader: relative to the root, with forward slashes. */
function display(root: ResolvedOpenSpecRoot, file: string): string {
  return path.relative(root.path, file).split(path.sep).join('/');
}

/**
 * The feature files a target names: an active change's specs, or a file or
 * folder. No target means the main specs and every active change.
 */
async function targetFiles(root: ResolvedOpenSpecRoot, target?: string): Promise<string[]> {
  if (!target) {
    return [
      ...(await collectFeatureFiles(root.specsDir)),
      ...(await collectFeatureFiles(root.changesDir)).filter(
        (file) => !file.startsWith(root.archiveDir + path.sep)
      ),
    ];
  }
  const changeDir = path.join(root.changesDir, target);
  if (!target.includes('/') && !target.includes(path.sep) && target !== 'archive' && isDirectory(changeDir)) {
    return collectFeatureFiles(path.join(changeDir, 'specs'));
  }
  const resolved = path.resolve(target);
  if (!existsSync(resolved)) {
    throw new Error(`"${target}" is neither an active change nor a file or folder.`);
  }
  return collectFeatureFiles(resolved);
}

function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

export async function idsAssignCommand(target: string | undefined, options: IdsAssignOptions): Promise<void> {
  try {
    const root = await resolveRootForCommand(
      { store: options.store, storePath: options.storePath },
      { json: options.json, failurePayload: ASSIGN_FAILURE_PAYLOAD, allowImplicitRoot: false }
    );
    if (!root) return;

    const openspecDir = path.join(root.path, 'openspec');
    const files = await targetFiles(root, target);
    const { assigned, problems } = await assignMissingIds(openspecDir, files, { dryRun: options.dryRun });
    if (problems.length > 0) process.exitCode = 1;

    if (options.json) {
      printJson({
        assigned: assigned.map((entry) => ({ ...entry, file: display(root, entry.file) })),
        problems: problems.map((entry) => ({ ...entry, file: display(root, entry.file) })),
      });
      return;
    }

    const verb = options.dryRun ? 'Would assign' : 'Assigned';
    for (const entry of assigned) {
      console.log(`${entry.id}  ${display(root, entry.file)}:${entry.line}  ${entry.rule}`);
    }
    for (const entry of problems) {
      console.error(`${display(root, entry.file)}:${entry.line}: ${entry.message}`);
    }
    if (assigned.length === 0 && problems.length === 0) {
      console.log('Every requirement has an ID.');
    } else if (assigned.length > 0) {
      console.log(`${verb} ${assigned.length} ID${assigned.length === 1 ? '' : 's'}.`);
    }
  } catch (error) {
    emitFailure(options.json, ASSIGN_FAILURE_PAYLOAD, error, 'ids_assign_failed');
  }
}

export async function idsNextCommand(options: IdsNextOptions): Promise<void> {
  try {
    const count = options.count === undefined ? 1 : Number(options.count);
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error(`--count must be a positive whole number, got "${options.count}".`);
    }
    const root = await resolveRootForCommand(
      { store: options.store, storePath: options.storePath },
      { json: options.json, failurePayload: NEXT_FAILURE_PAYLOAD, allowImplicitRoot: false }
    );
    if (!root) return;

    const ids = await reserveIds(path.join(root.path, 'openspec'), count);
    if (options.json) {
      printJson({ ids });
      return;
    }
    for (const id of ids) console.log(id);
  } catch (error) {
    emitFailure(options.json, NEXT_FAILURE_PAYLOAD, error, 'ids_next_failed');
  }
}
