/**
 * The @trace scanner.
 *
 * Code points back at a requirement with the word `@trace` and one or more
 * requirement IDs, anywhere on a line, in any comment style (`//`, `#`, `--`,
 * `/* *\/`, `<!-- -->`). The scanner does not parse comment syntax, so a
 * trace works the same in every language. (The examples in this file write
 * the ID as `REQ-…`, so that the scanner does not read them as traces.)
 *
 * Which files count: in a git work tree, the files git tracks plus new files
 * that `.gitignore` does not exclude. Outside git, a walk of the folder that
 * skips `node_modules`, `.git`, `dist` and `build`. Either way the
 * `openspec/` folder, binary files and very large files are skipped, and the
 * optional `trace.include` / `trace.exclude` globs narrow the set.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import picomatch from 'picomatch';

const execFileAsync = promisify(execFile);

/** One requirement ID found after `@trace`. */
export interface TraceHit {
  id: string;
  /** Path relative to the scan root, forward-slash separated. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** The line the trace is on, trimmed and cut to a readable length. */
  text: string;
}

export interface TraceScanOptions {
  /** Globs, relative to the scan root. When given, only matching files are read. */
  include?: string[];
  /** Globs, relative to the scan root. Matching files are not read. */
  exclude?: string[];
}

export interface TraceScanResult {
  /** Every trace, sorted by file and then line. */
  traces: TraceHit[];
  /** Number of text files read. */
  filesScanned: number;
  /** How the file list was made. */
  source: 'git' | 'walk';
}

/** Folder at the scan root that holds specs and changes, never code. */
export const OPENSPEC_DIR_NAME = 'openspec';

/** Folders the folder walk skips at any depth when there is no git. */
export const WALK_SKIPPED_DIRS = ['node_modules', '.git', 'dist', 'build'] as const;

/** Files larger than this are not read: they are bundles or data, not code to trace. */
export const MAX_TRACE_FILE_BYTES = 10 * 1024 * 1024;

/** Git reads the first 8000 bytes to tell binary from text; do the same. */
const BINARY_SNIFF_BYTES = 8000;

const MAX_TEXT_LENGTH = 200;
const READ_CONCURRENCY = 32;

const GIT_LIST_OPTIONS = {
  encoding: 'utf8',
  timeout: 30_000,
  killSignal: 'SIGKILL',
  maxBuffer: 256 * 1024 * 1024,
  windowsHide: true,
} as const;

/**
 * `@trace` at a word start, then one or more IDs separated by commas or
 * spaces. An ID token is `REQ-` and digits; a token with fewer than four
 * digits is kept, so that a short ID shows up as a trace to an ID that does
 * not exist instead of being skipped in silence. `@trace` with no ID after it
 * (prose about the feature, `@trace <ID>` in a template) is not a trace.
 */
// @trace REQ-0361
const TRACE_PATTERN = /(?<![\w@])@trace(?::[ \t]*|[ \t]+)(REQ-\d+(?!\w)(?:(?:[ \t]*,[ \t]*|[ \t]+)REQ-\d+(?!\w))*)/g;
const ID_TOKEN = /REQ-\d+/g;

/**
 * Find the traces in one file's text. `file` is copied into each hit as is.
 */
export function findTracesInText(text: string, file: string): TraceHit[] {
  if (!text.includes('@trace')) {
    return [];
  }
  const hits: TraceHit[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length; index++) {
    const lineText = lines[index];
    if (!lineText.includes('@trace')) continue;
    for (const match of lineText.matchAll(TRACE_PATTERN)) {
      for (const idMatch of match[1].matchAll(ID_TOKEN)) {
        hits.push({ id: idMatch[0], file, line: index + 1, text: displayText(lineText) });
      }
    }
  }
  return hits;
}

function displayText(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > MAX_TEXT_LENGTH ? `${trimmed.slice(0, MAX_TEXT_LENGTH - 1)}…` : trimmed;
}

/** True when the bytes hold a NUL in the first 8000 bytes, as git decides. */
export function isBinaryContent(content: Uint8Array): boolean {
  const end = Math.min(content.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < end; i++) {
    if (content[i] === 0) return true;
  }
  return false;
}

/**
 * Build the filter for `trace.include` and `trace.exclude`. A glob that ends
 * in `/` means everything under that folder.
 */
// @trace REQ-0363
export function createTracePathFilter(options: TraceScanOptions): (relativePath: string) => boolean {
  const compile = (globs: string[] | undefined) => {
    const list = (globs ?? []).map((glob) => (glob.endsWith('/') ? `${glob}**` : glob));
    return list.length > 0 ? picomatch(list, { dot: true }) : undefined;
  };
  const include = compile(options.include);
  const exclude = compile(options.exclude);
  return (relativePath) => {
    if (include && !include(relativePath)) return false;
    if (exclude && exclude(relativePath)) return false;
    return true;
  };
}

function isInOpenSpecDir(relativePath: string): boolean {
  return relativePath === OPENSPEC_DIR_NAME || relativePath.startsWith(`${OPENSPEC_DIR_NAME}/`);
}

/**
 * The files git knows in `root`: tracked files and untracked files that are
 * not ignored, relative to `root`. Undefined when `root` is not in a git work
 * tree or git is not installed.
 */
// @trace REQ-0362
export async function listGitFiles(root: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-c', 'core.quotePath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { ...GIT_LIST_OPTIONS, cwd: root }
    );
    return [...new Set(stdout.split('\0').filter(Boolean))];
  } catch {
    return undefined;
  }
}

/**
 * Every file under `root`, relative to it, for a folder with no git. Skips
 * the folders in WALK_SKIPPED_DIRS at any depth and does not follow
 * symlinked folders, so a link loop cannot hang the scan.
 */
// @trace REQ-0362
export async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const skipped = new Set<string>(WALK_SKIPPED_DIRS);
  const walk = async (dir: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EACCES' || code === 'EPERM') return;
      throw error;
    }
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (skipped.has(entry.name)) continue;
        await walk(path.join(dir, entry.name), relative);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(relative);
      }
    }
  };
  await walk(root, '');
  return files;
}

/**
 * Read one file for the scan. Undefined for anything that is not a readable
 * text file of a sensible size: a folder (git lists submodules and symlinks to
 * folders as paths), a deleted file git still tracks, a binary file.
 */
// @trace REQ-0362
async function readTextFile(absolutePath: string): Promise<string | undefined> {
  try {
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile() || stat.size > MAX_TRACE_FILE_BYTES) return undefined;
    const content = await fs.readFile(absolutePath);
    if (isBinaryContent(content)) return undefined;
    return content.toString('utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'EISDIR' || code === 'EACCES' || code === 'EPERM' || code === 'ELOOP') {
      return undefined;
    }
    throw error;
  }
}

/**
 * The files the scan reads, relative to `root` and sorted. Exported so that
 * tests and other commands can see the scope without reading the files.
 */
// @trace REQ-0362, REQ-0368
export async function listTraceFiles(
  root: string,
  options: TraceScanOptions = {}
): Promise<{ files: string[]; source: 'git' | 'walk' }> {
  const gitFiles = await listGitFiles(root);
  const source = gitFiles ? 'git' : 'walk';
  const candidates = gitFiles ?? (await walkFiles(root));
  const keep = createTracePathFilter(options);
  const files = candidates
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => !isInOpenSpecDir(file) && keep(file))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { files, source };
}

/**
 * Scan the code under `root` for traces.
 */
export async function scanTraces(root: string, options: TraceScanOptions = {}): Promise<TraceScanResult> {
  const { files, source } = await listTraceFiles(root, options);
  const perFile: TraceHit[][] = new Array(files.length);
  let filesScanned = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const index = next++;
      const text = await readTextFile(path.join(root, files[index]));
      if (text === undefined) {
        perFile[index] = [];
        continue;
      }
      filesScanned++;
      perFile[index] = findTracesInText(text, files[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, files.length) }, worker));
  // Files are already sorted, and hits within a file come in line order.
  return { traces: perFile.flat(), filesScanned, source };
}
