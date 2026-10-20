/**
 * Spec Application Logic
 *
 * Extracted from ArchiveCommand to enable standalone spec application.
 * Applies delta specs from a change to main specs without archiving.
 */

import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import chalk from 'chalk';
import { parseFeature } from './gherkin/document.js';
import { parseDeltaFeature } from './gherkin/delta.js';
import { buildSpecSkeleton as buildFeatureSkeleton, mergeDelta } from './gherkin/merge.js';
import { MIN_PURPOSE_LENGTH } from './validation/constants.js';
import {
  discoverSpecFiles,
  LEGACY_SPEC_FILE_NAME,
  LEGACY_SPEC_ISSUE_MARKER,
  SPEC_FILE_NAME,
} from '../utils/spec-discovery.js';
import { FileSystemUtils } from '../utils/file-system.js';
import { assertSpecFileWithin } from '../utils/spec-path-containment.js';
import { matchLineEnding } from '../utils/line-endings.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SpecUpdate {
  /** Capability id relative to the specs root, forward-slash separated (e.g. "web" or "platform/session-layout"). */
  id: string;
  /** Allowed root for the delta source. */
  sourceRoot: string;
  source: string;
  /** Allowed root for the main-spec target. */
  targetRoot: string;
  target: string;
  exists: boolean;
}

function isLexicallyWithin(allowedDirectory: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(allowedDirectory), path.resolve(targetPath));
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function resolveTrustedSpecPath(
  specsRoot: string,
  specPath: string,
  projectRoot?: string
): {
  root: string;
  file: string;
} {
  if (!isLexicallyWithin(specsRoot, specPath)) {
    throw new Error(`Path is outside the allowed directory: ${specPath}`);
  }

  try {
    // Preserve spec.feature links that remain inside the overall specs tree.
    assertSpecFileWithin(specsRoot, specPath);
    const root = FileSystemUtils.canonicalizeExistingPath(specsRoot);
    return {
      root,
      // Rebase onto the canonical root so missing targets also work when the
      // project is reached through an OS path alias (for example /var on macOS).
      file: path.join(root, path.relative(path.resolve(specsRoot), path.resolve(specPath))),
    };
  } catch {
    // Direct capability directories may intentionally be monorepo symlinks.
    // Freeze their canonical location as the trust root so later swaps are
    // rejected while a nested spec.feature link still cannot escape.
    const root = FileSystemUtils.canonicalizeExistingPath(path.dirname(specPath));
    // An external capability link is deliberate and supported (see
    // assertDiscoveredSpecPath), so it is not refused here. What was wrong is
    // that the write was silent: the CLI reported the in-project path while
    // writing somewhere else entirely, so a link swapped underneath a repo
    // left nothing on screen to notice. Name the real destination instead.
    if (projectRoot && !isLexicallyWithin(FileSystemUtils.canonicalizeExistingPath(projectRoot), root)) {
      process.emitWarning(
        `Capability '${path.basename(path.dirname(specPath))}' links outside the project; writing to ${root}`,
        'OpenSpecExternalSpecWrite'
      );
    }
    const file = path.join(root, path.basename(specPath));
    assertSpecFileWithin(root, file);
    return { root, file };
  }
}

function assertTrustedSpecPath(root: string, specPath: string): void {
  if (FileSystemUtils.canonicalizeExistingPath(root) !== path.resolve(root)) {
    throw new Error(`Path is outside the allowed directory: ${specPath}`);
  }
  assertSpecFileWithin(root, specPath);
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Find all delta spec files that need to be applied from a change.
 */
export async function findSpecUpdates(changeDir: string, mainSpecsDir: string): Promise<SpecUpdate[]> {
  const updates: SpecUpdate[] = [];
  const changeSpecsDir = path.join(changeDir, 'specs');

  // Discover delta specs recursively so nested layouts like
  // specs/<area>/<capability>/spec.feature merge into the same relative path
  // under the main specs directory (#1353)
  const discovered = await discoverSpecFiles(changeSpecsDir);

  for (const { id, specFile } of discovered) {
    const targetFile = path.join(mainSpecsDir, ...id.split('/'), SPEC_FILE_NAME);
    const source = resolveTrustedSpecPath(changeSpecsDir, specFile);
    // Main specs always live at `<project root>/openspec/specs`, so the
    // project root is the grandparent - a linked capability directory may not
    // leave it.
    const target = resolveTrustedSpecPath(
      mainSpecsDir,
      targetFile,
      path.dirname(path.dirname(mainSpecsDir))
    );

    // Check if target exists
    let exists = false;
    try {
      await fs.access(target.file);
      exists = true;
    } catch {
      exists = false;
    }

    updates.push({
      id,
      sourceRoot: source.root,
      source: source.file,
      targetRoot: target.root,
      target: target.file,
      exists,
    });
  }

  return updates;
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * Build an updated spec by applying a change's Gherkin delta to the main spec.
 * Returns the rebuilt content and counts of operations. Throws when the delta
 * cannot be applied.
 */
export async function buildUpdatedSpec(
  update: SpecUpdate,
  changeName: string,
  options: { silent?: boolean } = {}
): Promise<{
  rebuilt: string;
  counts: { added: number; modified: number; removed: number; renamed: number };
  warnings: string[];
  /**
   * No rule is left in the rebuilt spec. Only a candidate signal for
   * retirement (#1302): archive asks the validator whether the rebuilt spec is
   * unwritable for that reason alone. See `isRetirableSpec` in archive.ts.
   */
  noRequirementBlocks: boolean;
  /**
   * Non-blank lines of the rebuilt spec that are not the feature header, its
   * description or a rule. Retirement deletes the whole file, so any such line
   * refuses it.
   */
  unaccountedContent: string[];
}> {
  assertTrustedSpecPath(update.sourceRoot, update.source);
  const changeContent = await fs.readFile(update.source, 'utf-8');
  const plan = parseDeltaFeature(changeContent);

  assertTrustedSpecPath(update.targetRoot, update.target);
  let mainContent: string | undefined;
  try {
    mainContent = await fs.readFile(update.target, 'utf-8');
  } catch (error) {
    // An unreadable target is not a new spec. Preserve the filesystem error
    // for callers, rather than synthesizing a baseline.
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
    mainContent = undefined;
  }
  // A markdown main spec is not read any more. Treating the capability as new
  // would write a second spec next to it, so the change waits for conversion.
  if (mainContent === undefined && (await isFile(path.join(path.dirname(update.target), LEGACY_SPEC_FILE_NAME)))) {
    throw new Error(
      `${update.id}: the main spec is specs/${update.id}/${LEGACY_SPEC_FILE_NAME}, ${LEGACY_SPEC_ISSUE_MARKER}. ` +
        'Run "openspec convert-specs" to convert it, then archive again.'
    );
  }

  const result = mergeDelta({ specName: update.id, changeName, plan, mainContent });

  if (mainContent !== undefined && plan.purpose) {
    const existing = parseFeature(mainContent).feature?.description;
    if (existing && existing !== plan.purpose) {
      result.warnings.push(
        `${update.id} - delta feature description ignored; ${update.id} already has a Purpose. ` +
          `Edit ${update.target} directly to change it.`
      );
    }
  }
  if (mainContent === undefined && plan.purpose && plan.purpose.length < MIN_PURPOSE_LENGTH) {
    result.warnings.push(
      `${update.id} - carried Purpose is under ${MIN_PURPOSE_LENGTH} characters; ` +
        'openspec validate --strict reports it as too brief.'
    );
  }
  if (!options.silent) {
    for (const message of result.warnings) {
      console.log(chalk.yellow(`⚠️  Warning: ${message}`));
    }
  }

  return {
    rebuilt: result.rebuilt,
    counts: { ...result.counts, renamed: 0 },
    warnings: result.warnings,
    noRequirementBlocks: result.noRequirementBlocks,
    unaccountedContent: result.unaccountedContent,
  };
}

/**
 * Retire a capability whose last requirement a delta removed: delete its main
 * spec and prune any directories the deletion leaves empty. Returns false when
 * there was nothing to delete.
 *
 * Gated by the caller on the change's `retire_capabilities` marker, so the one
 * archive action that removes a file from `openspec/specs/` is always something
 * the author asked for rather than something inferred from a delta's shape. The
 * file is recoverable from git, which the report names; applying REMOVED already
 * deletes requirement content from a main spec, so deleting the spec once
 * nothing is left is the same operation carried to its end rather than a new
 * kind of act.
 *
 * Only the generated `spec.feature` is removed - a directory holding anything else (a
 * nested capability, a hand-kept note) is left in place.
 *
 * The target must resolve inside the selected specs root. A capability-directory
 * symlink must not turn a retirement marker into authorization to delete an
 * unrelated external file. A symlinked `spec.feature` itself is safe: unlink removes
 * the link and leaves its target alone.
 *
 * Directory pruning IS bounded, by REAL paths rather than string prefixes:
 * `path.resolve` collapses `..` but does not resolve symlinks, and `readdir` and
 * `rmdir` both follow them, so a symlinked capability directory would otherwise
 * let the walk delete directories outside the specs root entirely.
 */
export async function retireSpec(
  update: SpecUpdate,
  mainSpecsDir: string,
  options: {
    silent?: boolean;
    displayPath?: string;
    beforeMutate?: () => Promise<void>;
    verifyDisplaced?: (displacedPath: string) => Promise<void>;
    deferDelete?: boolean;
  } = {}
): Promise<{ retired: boolean; resolvedPath?: string; displacedPath?: string }> {
  if (options.deferDelete && options.verifyDisplaced === undefined) {
    throw new Error('Deferred retirement requires displaced-file verification.');
  }
  // Resolved before the unlink, while the link still exists, so the report can
  // name the file that actually goes when a symlink points out of the tree.
  // A symlinked `spec.feature` is excluded: `realpath` would follow it, but `unlink`
  // removes the link and leaves the target alone, so naming the target would
  // claim a file was deleted that is still there.
  let realSource: string | undefined;
  try {
    const link = await fs.lstat(update.target);
    realSource = link.isSymbolicLink() ? undefined : await fs.realpath(update.target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { retired: false };
    throw new Error(
      `Could not retire capability '${update.id}': could not verify ${update.target} ` +
        `before deletion (${error instanceof Error ? error.message : String(error)}).`
    );
  }

  if (realSource !== undefined) {
    let inside: boolean;
    try {
      inside = await isInsideRealDir(realSource, mainSpecsDir);
    } catch (error) {
      throw new Error(
        `Could not retire capability '${update.id}': could not verify that ${update.target} ` +
          `is inside ${mainSpecsDir} (${error instanceof Error ? error.message : String(error)}).`
      );
    }
    if (!inside) {
      throw new Error(
        `Could not retire capability '${update.id}': ${update.target} resolves outside ` +
          `${mainSpecsDir}. Remove the external file by hand, or replace the symlink and rerun.`
      );
    }
  }

  let displacedPath: string | undefined;
  try {
    await options.beforeMutate?.();
    if (options.verifyDisplaced) {
      const displaced = `${update.target}.openspec-retire-${randomUUID()}`;
      displacedPath = displaced;
      await fs.rename(update.target, displaced);
      try {
        await options.verifyDisplaced(displaced);
        try {
          await fs.lstat(update.target);
          throw new Error(
            `A concurrent file appeared at ${update.target} while archive was retiring it.`
          );
        } catch (targetError) {
          if ((targetError as NodeJS.ErrnoException).code !== 'ENOENT') throw targetError;
        }
        if (!options.deferDelete) await fs.unlink(displaced);
      } catch (error) {
        try {
          await fs.lstat(update.target);
          throw new Error(
            `${error instanceof Error ? error.message : String(error)} ` +
              `A concurrent file now occupies ${update.target}; the displaced spec was retained at ${displaced}.`
          );
        } catch (targetError) {
          if ((targetError as NodeJS.ErrnoException).code !== 'ENOENT') throw targetError;
        }
        await fs.rename(displaced, update.target);
        throw error;
      }
    } else {
      await fs.unlink(update.target);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { retired: false };
    // A bare errno here reads as an internal failure; say what was being
    // attempted so the message is actionable on its own.
    throw new Error(
      `Could not retire capability '${update.id}': failed to delete ${update.target} ` +
        `(${(error as Error).message}). Remove it by hand, then rerun the archive.`
    );
  }

  if (!options.deferDelete) {
    await pruneEmptyDirs(path.dirname(update.target), mainSpecsDir);
  }

  const nominal = options.displayPath ?? `openspec/specs/${update.id}/spec.feature`;
  if (!options.silent) {
    console.log(`Retiring ${nominal}: all requirements removed.`);
  }
  // `resolvedPath` is always the file that was actually unlinked - callers need
  // it to report a path git will accept, since the nominal one is built from
  // the capability id and can differ in case, or point through a symlink.
  return {
    retired: true,
    ...(realSource ? { resolvedPath: realSource } : {}),
    ...(options.deferDelete && displacedPath ? { displacedPath } : {}),
  };
}

export async function finalizeRetiredSpec(
  target: string,
  displacedPath: string,
  mainSpecsDir: string
): Promise<void> {
  await fs.unlink(displacedPath);
  await pruneEmptyDirs(path.dirname(target), mainSpecsDir);
}

/** Whether `realPath` (already canonical) sits under the real `dir`. */
async function isInsideRealDir(realPath: string, dir: string): Promise<boolean> {
  const realDir = await fs.realpath(dir);
  return realPath.startsWith(realDir + path.sep);
}

/**
 * Remove now-empty directories from `startDir` upward, never leaving the real
 * `boundaryDir` and never removing that directory itself.
 *
 * The boundary is a parameter rather than the specs root directly so the walk's
 * containment is stated at the call site, where the root it must not escape is
 * the thing being reasoned about.
 *
 * The guard re-runs every iteration, so stepping to the LEXICAL parent is safe:
 * a parent that is not the real one is simply re-resolved and rejected. Errors
 * are swallowed and end the walk - ENOTEMPTY and ENOENT are correct outcomes (a
 * file arriving mid-walk must win), and a permissions failure leaves an empty
 * directory behind, which the next successful archive clears.
 *
 * Not race-free: an attacker who can swap an ancestor between the check and the
 * `rmdir` could get an empty directory outside the root removed. Closing that
 * needs fd-relative syscalls Node does not expose, and it requires local write
 * access to `openspec/specs` during an archive.
 */
export async function pruneEmptyDirs(startDir: string, boundaryDir: string): Promise<void> {
  let boundary: string;
  try {
    boundary = await fs.realpath(boundaryDir);
  } catch {
    return;
  }

  let dir = startDir;
  for (;;) {
    let realDir: string;
    try {
      // lstat first: rmdir on a symlink fails anyway, but resolving one would
      // walk us out of the tree, and the parent we then step to would be wrong.
      const link = await fs.lstat(dir);
      if (link.isSymbolicLink()) return;
      realDir = await fs.realpath(dir);
    } catch {
      return;
    }

    // Strictly inside the real boundary - the boundary itself is never pruned.
    if (realDir === boundary || !realDir.startsWith(boundary + path.sep)) return;

    try {
      const entries = await fs.readdir(dir);
      if (entries.length > 0) return;
      await fs.rmdir(dir);
    } catch {
      return;
    }

    dir = path.dirname(dir);
  }
}

/**
 * Write an updated spec to disk.
 */
export async function writeUpdatedSpec(
  update: SpecUpdate,
  rebuilt: string,
  counts: { added: number; modified: number; removed: number; renamed: number },
  options: {
    silent?: boolean;
    displayPath?: string;
    beforeMutate?: () => Promise<void>;
  } = {}
): Promise<void> {
  assertTrustedSpecPath(update.targetRoot, update.target);
  // Pin what the assertion just checked. A capability's spec.feature may be a link
  // to the file the project keeps elsewhere, so the write follows a link by
  // design - and resolving it once, here, is what keeps that from becoming a
  // redirect: a link repointed after this line, including from inside
  // `beforeMutate`, cannot send the write to a file nothing verified. The
  // bytes still land in the same place a path-based write would have put them,
  // which keeps the in-place semantics below intact.
  const verifiedTarget = FileSystemUtils.canonicalizeExistingPath(update.target);

  // Create target directory if needed
  const targetDir = path.dirname(update.target);
  await fs.mkdir(targetDir, { recursive: true });

  // The parsers normalize CRLF to LF on read, so `rebuilt` is always LF. Write
  // it back with the convention the file already used, or a Windows checkout
  // (core.autocrlf=true) sees every line of the spec change when one
  // requirement moved. A spec that does not exist yet stays LF.
  // Only a missing file means "no convention to match". Swallowing every error
  // would read an existing but unreadable spec as absent and rewrite it as LF.
  const previous = await fs.readFile(verifiedTarget, 'utf-8').catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  const toWrite = previous === undefined ? rebuilt : matchLineEnding(rebuilt, previous);

  await options.beforeMutate?.();
  // `beforeMutate` awaits arbitrary work, so it is the widest gap between the
  // check above and the write below. Re-check there, and refuse unless the
  // target still resolves to the very file that was verified: pinning a
  // pathname is not enough on its own, because the pinned path can itself be
  // replaced by a link to somewhere else.
  assertTrustedSpecPath(update.targetRoot, update.target);
  if (FileSystemUtils.canonicalizeExistingPath(update.target) !== verifiedTarget) {
    throw new Error(
      `Spec target for '${update.id}' changed before it could be written: ${update.target}`
    );
  }
  // Preserve the established in-place write semantics: symlink referents,
  // hard-linked specs, ACLs, extended attributes, and filesystems without hard
  // links must continue to behave as they did before capability retirement.
  await fs.writeFile(verifiedTarget, toWrite);
  if (options.silent) return;

  const specName = update.id;
  console.log(`Applying changes to ${options.displayPath ?? `openspec/specs/${specName}/spec.feature`}:`);
  if (counts.added) console.log(`  + ${counts.added} added`);
  if (counts.modified) console.log(`  ~ ${counts.modified} modified`);
  if (counts.removed) console.log(`  - ${counts.removed} removed`);
  if (counts.renamed) console.log(`  → ${counts.renamed} renamed`);
}


/**
 * The feature a new capability starts from: the delta's feature name and
 * description, or a placeholder Purpose when the delta has none.
 */
export function buildSpecSkeleton(
  specFolderName: string,
  changeName: string,
  purpose?: string,
  featureName?: string
): string {
  return buildFeatureSkeleton(specFolderName, changeName, featureName, purpose);
}
