/**
 * `openspec convert-specs`: move a project from markdown specs to Gherkin
 * feature files with requirement IDs. See core/convert-specs.ts.
 */
import path from 'node:path';
import { resolveRootForCommand, type ResolvedOpenSpecRoot } from '../core/root-selection.js';
import { convertSpecs } from '../core/convert-specs.js';
import { emitFailure, printJson } from './shared-output.js';

export interface ConvertSpecsCommandOptions {
  dryRun?: boolean;
  keep?: boolean;
  json?: boolean;
  store?: string;
  storePath?: string;
}

const FAILURE_PAYLOAD = { converted: [], ids: [], problems: [], warnings: [] };

function display(root: ResolvedOpenSpecRoot, file: string): string {
  return path.relative(root.path, file).split(path.sep).join('/');
}

export async function convertSpecsCommand(options: ConvertSpecsCommandOptions): Promise<void> {
  try {
    const root = await resolveRootForCommand(
      { store: options.store, storePath: options.storePath },
      { json: options.json, failurePayload: FAILURE_PAYLOAD, allowImplicitRoot: false }
    );
    if (!root) return;

    const result = await convertSpecs(root.path, { dryRun: options.dryRun, keep: options.keep });
    if (result.problems.length > 0) process.exitCode = 1;

    if (options.json) {
      printJson({
        converted: result.converted.map((entry) => ({
          ...entry,
          source: display(root, entry.source),
          target: display(root, entry.target),
        })),
        ids: result.ids.map((entry) => ({ ...entry, file: display(root, entry.file) })),
        problems: result.problems.map((entry) => ({ ...entry, file: display(root, entry.file) })),
        warnings: result.warnings.map((entry) => ({ ...entry, file: display(root, entry.file) })),
      });
      return;
    }

    if (result.converted.length === 0 && result.problems.length === 0) {
      console.log('No markdown specs to convert.');
      return;
    }
    const verb = options.dryRun ? 'Would convert' : 'Converted';
    for (const entry of result.converted) {
      const count = `${entry.requirements} requirement${entry.requirements === 1 ? '' : 's'}`;
      console.log(`${verb} ${display(root, entry.source)} → ${path.basename(entry.target)} (${count})`);
    }
    for (const entry of result.warnings) {
      console.log(`Warning: ${display(root, entry.file)}: ${entry.message}`);
    }
    for (const entry of result.problems) {
      console.error(`Not converted: ${display(root, entry.file)}: ${entry.message}`);
    }
    console.log(
      `${verb} ${result.converted.length} file${result.converted.length === 1 ? '' : 's'} ` +
        `and ${options.dryRun ? 'would give' : 'gave'} ${result.ids.length} ID${result.ids.length === 1 ? '' : 's'}.`
    );
    if (!options.dryRun && result.converted.length > 0) {
      console.log('Next: run "openspec validate --all" and review the converted files.');
    }
  } catch (error) {
    emitFailure(options.json, FAILURE_PAYLOAD, error, 'convert_specs_failed');
  }
}
