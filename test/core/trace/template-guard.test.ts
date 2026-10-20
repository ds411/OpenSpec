import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { getCommandTemplates, getSkillTemplates } from '../../../src/core/shared/skill-generation.js';
import { findTracesInText } from '../../../src/core/trace/scanner.js';

// `openspec init` writes skills, commands and schema templates into the user's
// repository, and git tracks them there. A trace example in any of them, such
// as "// @trace REQ-0001", would then count as a real trace in every user
// repository: an orphan, or a false trace to the user's own REQ-0001. The
// templates must describe the syntax with a placeholder instead.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function traceLines(text: string, name: string): string[] {
  return findTracesInText(text, name).map((hit) => `${hit.file}:${hit.line}: ${hit.text}`);
}

describe('generated agent files hold no trace', () => {
  it('skill templates', () => {
    const found = getSkillTemplates().flatMap(({ template, dirName }) =>
      traceLines(template.instructions, `skill ${dirName}`)
    );
    expect(found).toEqual([]);
  });

  it('command templates', () => {
    const found = getCommandTemplates().flatMap(({ template, id }) =>
      traceLines(template.content, `command ${id}`)
    );
    expect(found).toEqual([]);
  });

  it('schema templates and published skills', () => {
    const files = [...filesUnder(path.join(repoRoot, 'schemas')), ...filesUnder(path.join(repoRoot, 'skills'))];
    expect(files.length).toBeGreaterThan(0);
    const found = files.flatMap((file) =>
      traceLines(fs.readFileSync(file, 'utf-8'), path.relative(repoRoot, file).split(path.sep).join('/'))
    );
    expect(found).toEqual([]);
  });
});
