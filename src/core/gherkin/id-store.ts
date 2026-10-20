/**
 * The requirement ID counter and ID assignment.
 *
 * The counter lives in `openspec/requirement-ids.yaml`, committed with the
 * specs. Two branches that each take an ID both change that file, so the
 * collision shows up as a merge conflict instead of two requirements that
 * silently share an ID.
 *
 * The counter is a high-water mark, not the only source of truth: the next ID
 * is the larger of the counter and one past the highest ID used anywhere under
 * `openspec/` (specs, active changes and archived changes). A stale or missing
 * counter therefore cannot hand out an ID that is already in use.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { parseFeature, type SpecRule } from './document.js';
import { findRequirementIdTags, formatRequirementId, requirementIdNumber } from './ids.js';
import { matchLineEnding } from '../../utils/line-endings.js';

export const ID_COUNTER_FILENAME = 'requirement-ids.yaml';
const ID_LOCK_FILENAME = '.requirement-ids.lock';
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 100;
const LOCK_ATTEMPTS = 100;

export function idCounterPath(openspecDir: string): string {
  return path.join(openspecDir, ID_COUNTER_FILENAME);
}

/** The `next` value in the counter file, or undefined when there is no usable file. */
export async function readIdCounter(openspecDir: string): Promise<number | undefined> {
  let content: string;
  try {
    content = await fs.readFile(idCounterPath(openspecDir), 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
    throw error;
  }
  const match = content.match(/^next:\s*(\d+)\s*$/m);
  if (!match) {
    throw new Error(
      `${idCounterPath(openspecDir)} has no "next: <number>" line. ` +
        'Restore it from git, or delete it: the next "openspec ids" run rebuilds it from the IDs in use.'
    );
  }
  return Number(match[1]);
}

async function writeIdCounter(openspecDir: string, next: number): Promise<void> {
  const content =
    '# Requirement ID counter. Managed by `openspec ids`; do not edit by hand.\n' +
    '# On a merge conflict, keep the larger number.\n' +
    `next: ${next}\n`;
  await fs.writeFile(idCounterPath(openspecDir), content, 'utf-8');
}

/**
 * Every `.feature` file under a directory, sorted. Dot entries are skipped and
 * symlinked directories are not followed, like spec discovery.
 */
export async function collectFeatureFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith('.feature')) files.push(full);
    }
  };
  const stat = await fs.stat(root).catch(() => null);
  if (stat?.isFile()) return root.endsWith('.feature') ? [root] : [];
  await walk(root);
  return files.sort();
}

/**
 * Where each requirement ID is tagged, across main specs and all changes,
 * archived ones included. Keyed by ID; the value lists the files, with a file
 * repeated once per tag in it.
 */
export async function scanUsedIds(openspecDir: string): Promise<Map<string, string[]>> {
  const used = new Map<string, string[]>();
  const files = [
    ...(await collectFeatureFiles(path.join(openspecDir, 'specs'))),
    ...(await collectFeatureFiles(path.join(openspecDir, 'changes'))),
  ];
  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(file, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') continue;
      throw error;
    }
    for (const id of findRequirementIdTags(content)) {
      const list = used.get(id) ?? [];
      list.push(file);
      used.set(id, list);
    }
  }
  return used;
}

async function withCounterLock<T>(openspecDir: string, run: () => Promise<T>): Promise<T> {
  const lockPath = path.join(openspecDir, ID_LOCK_FILENAME);
  await fs.mkdir(openspecDir, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
      const stat = await fs.stat(lockPath).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
        await fs.rm(lockPath, { force: true });
        continue;
      }
      if (attempt >= LOCK_ATTEMPTS) {
        throw new Error(
          `Another "openspec ids" run holds ${lockPath}. Wait for it to finish, or delete the file if no run is active.`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
  try {
    return await run();
  } finally {
    await fs.rm(lockPath, { force: true });
  }
}

/**
 * The first number the next ID may take: past both the counter and every ID
 * already in use.
 */
export async function nextIdNumber(openspecDir: string): Promise<number> {
  const counter = (await readIdCounter(openspecDir)) ?? 1;
  let highest = 0;
  for (const id of (await scanUsedIds(openspecDir)).keys()) {
    highest = Math.max(highest, requirementIdNumber(id) ?? 0);
  }
  return Math.max(counter, highest + 1, 1);
}

/**
 * Run `use` with the first free ID number. It returns how many numbers it
 * used, and the counter moves past them. The counter is locked for the whole
 * run, so `use` can write files that carry the new IDs before another run
 * reads the counter. A dry run takes no lock and leaves the counter alone.
 */
export async function withNextIdNumber<T>(
  openspecDir: string,
  use: (first: number) => Promise<{ used: number; result: T }>,
  options: { dryRun?: boolean } = {}
): Promise<T> {
  const run = async () => {
    const first = await nextIdNumber(openspecDir);
    const { used, result } = await use(first);
    if (!options.dryRun && used > 0) await writeIdCounter(openspecDir, first + used);
    return result;
  };
  return options.dryRun ? run() : withCounterLock(openspecDir, run);
}

/** Take `count` new IDs and move the counter past them. */
export async function reserveIds(openspecDir: string, count: number): Promise<string[]> {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error(`Count must be a positive integer, got ${count}`);
  }
  return withCounterLock(openspecDir, async () => {
    const first = await nextIdNumber(openspecDir);
    await writeIdCounter(openspecDir, first + count);
    return Array.from({ length: count }, (_, i) => formatRequirementId(first + i));
  });
}

export interface IdAssignment {
  file: string;
  line: number;
  rule: string;
  id: string;
}

export interface IdAssignmentProblem {
  file: string;
  line: number;
  message: string;
}

/**
 * Give an ID to every rule that has none, in the given files, in file order
 * and then source order. Rules that already have an ID keep it.
 */
export async function assignMissingIds(
  openspecDir: string,
  files: string[],
  options: { dryRun?: boolean } = {}
): Promise<{ assigned: IdAssignment[]; problems: IdAssignmentProblem[] }> {
  const run = async () => {
    const problems: IdAssignmentProblem[] = [];
    const pending: Array<{ file: string; original: string; lines: string[]; rules: SpecRule[] }> = [];

    for (const file of files) {
      const original = await fs.readFile(file, 'utf-8');
      const document = parseFeature(original);
      if (document.errors.length > 0) {
        for (const error of document.errors) {
          problems.push({ file, line: error.line, message: `Syntax error: ${error.message}` });
        }
        continue;
      }
      const missing: SpecRule[] = [];
      for (const rule of document.rules) {
        if (rule.ids.length > 1) {
          problems.push({
            file,
            line: rule.keywordLine,
            message: `Rule "${rule.name}" has more than one ID (${rule.ids.join(', ')}). Keep one.`,
          });
        } else if (rule.ids.length === 0 && (rule.operations.includes('modified') || rule.operations.includes('removed'))) {
          // A fresh ID would point the entry at a requirement that does not
          // exist; it needs the ID of the requirement it changes.
          problems.push({
            file,
            line: rule.keywordLine,
            message: `Rule "${rule.name}" is @${rule.operations.includes('modified') ? 'modified' : 'removed'} but has no ID. Copy the ID of the requirement it changes from the main spec.`,
          });
        } else if (rule.ids.length === 0) {
          missing.push(rule);
        }
      }
      if (missing.length > 0) pending.push({ file, original, lines: document.lines, rules: missing });
    }

    const total = pending.reduce((sum, entry) => sum + entry.rules.length, 0);
    if (total === 0) return { assigned: [], problems };

    const first = await nextIdNumber(openspecDir);
    if (!options.dryRun) await writeIdCounter(openspecDir, first + total);
    const ids = Array.from({ length: total }, (_, i) => formatRequirementId(first + i));

    const assigned: IdAssignment[] = [];
    let cursor = 0;
    for (const entry of pending) {
      let lines = entry.lines;
      const fileIds = entry.rules.map(() => ids[cursor++]);
      // Bottom-up, so a line inserted for one rule never shifts a rule above it.
      for (let i = entry.rules.length - 1; i >= 0; i--) {
        lines = insertIdTag(lines, entry.rules[i], fileIds[i]);
      }
      entry.rules.forEach((rule, i) => {
        assigned.push({ file: entry.file, line: rule.keywordLine, rule: rule.name, id: fileIds[i] });
      });
      if (!options.dryRun) {
        await fs.writeFile(entry.file, matchLineEnding(lines.join('\n'), entry.original), 'utf-8');
      }
    }
    return { assigned, problems };
  };
  return options.dryRun ? run() : withCounterLock(openspecDir, run);
}

/**
 * Add an ID tag to a rule: at the end of the tag line just above `Rule:`, or
 * on a new line above it at the same indentation when the rule has no tags.
 */
export function insertIdTag(lines: string[], rule: SpecRule, id: string): string[] {
  const result = [...lines];
  const lastTagLine = rule.tagLines.length > 0 ? rule.tagLines[rule.tagLines.length - 1] : undefined;
  if (lastTagLine !== undefined) {
    const index = lastTagLine - 1;
    const line = result[index];
    // A tag line may end in a comment (`@added # new`); the ID goes before it.
    const comment = line.match(/\s+#.*$/);
    const head = comment ? line.slice(0, comment.index) : line.trimEnd();
    result[index] = `${head} @${id}${comment ? comment[0] : ''}`;
    return result;
  }
  const keywordIndex = rule.keywordLine - 1;
  const indent = result[keywordIndex].match(/^[ \t]*/)![0];
  result.splice(keywordIndex, 0, `${indent}@${id}`);
  return result;
}
