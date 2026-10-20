import { promises as fs } from 'fs';
import path from 'path';
import { assertDiscoveredSpecFile } from './spec-path-containment.js';
import { parseDeltaSpec } from '../core/parsers/requirement-blocks.js';
import { parseFeature } from '../core/gherkin/document.js';

/** The file that holds a capability's spec, in main specs and in change deltas. */
export const SPEC_FILE_NAME = 'spec.feature';

export interface DiscoveredSpec {
  /** Spec id relative to the specs root, forward-slash separated on every platform (e.g. "web" or "platform/session-layout"). */
  id: string;
  /** Path to the spec.feature file (absolute if the specs root is absolute). */
  specFile: string;
}

/**
 * Recursively discover every `spec.feature` under a specs root, so both the flat
 * `specs/<id>/spec.feature` layout and nested `specs/<area>/<id>/spec.feature` layouts
 * are found (#1353). A `spec.feature` sitting directly in the root is ignored,
 * matching the historical requirement that specs live in a capability folder.
 * Dot-directories are skipped and symlinked directories are not followed.
 * A symlinked `spec.feature` IS resolved: `hasAnyFileUnder` and the artifact
 * graph's globs both count it as content, so dropping it here would silently
 * lose the delta on archive. `assertSpecFilePathAllowed` decides how far such
 * a link may point; a dangling link is skipped. Results are sorted by id.
 *
 * A missing root (ENOENT) yields an empty list, but any other read failure
 * (EACCES, EIO, ...) is thrown rather than swallowed: since this feeds the
 * archive/apply merge path, silently dropping an unreadable capability would
 * recreate the exact data-loss class #1353 is closing.
 */
export async function discoverSpecFiles(specsRoot: string): Promise<DiscoveredSpec[]> {
  const results: DiscoveredSpec[] = [];
  const walk = async (dir: string, segments: string[]): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      if (err?.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), [...segments, entry.name]);
      } else if (entry.name === SPEC_FILE_NAME && segments.length > 0) {
        const specFile = path.join(dir, entry.name);
        if (entry.isFile()) {
          assertDiscoveredSpecFile(specsRoot, specFile);
          results.push({ id: segments.join('/'), specFile });
        } else if (entry.isSymbolicLink()) {
          try {
            if ((await fs.stat(specFile)).isFile()) {
              assertDiscoveredSpecFile(specsRoot, specFile);
              results.push({ id: segments.join('/'), specFile });
            }
          } catch (err: any) {
            // A dangling link is not content; anything else fails loudly.
            if (err?.code !== 'ENOENT') throw err;
          }
        }
      }
    }
  };
  await walk(specsRoot, []);
  // Plain code-point comparison, not localeCompare: the latter follows the
  // process's ICU locale, so ordering could vary by OS/CI. Code-point ordering
  // guarantees the deterministic output the docstring promises.
  return results.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface UnreadDeltaFile {
  /** File path relative to the specs root, forward-slash separated. */
  path: string;
  /** The spec.feature the merge path reads for it, relative to the specs root. */
  expected: string;
  /** True for a markdown file in the old delta format, which needs converting. */
  legacyMarkdown: boolean;
}

/**
 * Files under a change's specs/ that carry deltas but are not a capability's
 * `spec.feature`, so discoverSpecFiles, and with it validate and archive, never
 * reads them: `specs/user-auth.feature`, `specs/user-auth/delta.feature`, or a
 * markdown file still written in the old `## ADDED Requirements` format. A
 * `spec.feature` at the specs/ root has its own check (#1385) and is not
 * repeated here. Files with no delta content are not reported. The walk matches
 * discoverSpecFiles: dot entries are skipped, symlinked directories are not
 * followed, and a dangling link is skipped. A missing root yields an empty
 * list; any other read failure is thrown. Results are sorted by path.
 */
export async function findUnreadDeltaFiles(specsRoot: string): Promise<UnreadDeltaFile[]> {
  const results: UnreadDeltaFile[] = [];
  const walk = async (dir: string, segments: string[]): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') return;
      throw err;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), [...segments, entry.name]);
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (entry.name === SPEC_FILE_NAME) continue;
      const lower = entry.name.toLowerCase();
      const isFeature = lower.endsWith('.feature');
      if (!isFeature && !lower.endsWith('.md')) continue;
      const filePath = path.join(dir, entry.name);
      let content: string;
      try {
        if (entry.isSymbolicLink() && !(await fs.stat(filePath)).isFile()) continue;
        content = await fs.readFile(filePath, 'utf-8');
      } catch (err: any) {
        // A dangling link is not content; anything else fails loudly.
        if (err?.code === 'ENOENT') continue;
        throw err;
      }
      const carriesDeltas = isFeature
        ? parseFeature(content).rules.length > 0
        : Object.values(parseDeltaSpec(content).sectionPresence).some(Boolean);
      if (!carriesDeltas) continue;
      const extension = isFeature ? '.feature' : '.md';
      const capability =
        segments.length > 0 ? segments.join('/') : entry.name.slice(0, -extension.length);
      results.push({
        path: [...segments, entry.name].join('/'),
        expected: `${capability}/${SPEC_FILE_NAME}`,
        legacyMarkdown: !isFeature,
      });
    }
  };
  await walk(specsRoot, []);
  return results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * True when any regular non-dot file exists anywhere under the given
 * directory. Used by validate/archive to detect content under a change's
 * specs/ that contradicts a declared skip_specs marker - including files that
 * discoverSpecFiles ignores (a root spec.feature, stray notes), since
 * anything there would be silently dropped or misread while the change claims
 * to have nothing. Dot entries (.DS_Store, .gitkeep, dot-directories) are
 * skipped to match discoverSpecFiles - they are invisible to every other
 * code path, so they must not count as spec content. Symlinks DO count
 * (without being followed): the artifact graph's globs follow them, so a
 * symlinked spec would read as existing content while the change claims to
 * have none - it contradicts the marker like any regular file. A missing
 * directory returns false; other read failures are thrown for the caller to
 * decide.
 */
export async function hasAnyFileUnder(dirPath: string): Promise<boolean> {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    if (entry.isFile() || entry.isSymbolicLink()) {
      return true;
    }
    if (entry.isDirectory() && (await hasAnyFileUnder(path.join(dirPath, entry.name)))) {
      return true;
    }
  }
  return false;
}
