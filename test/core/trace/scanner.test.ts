import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createTracePathFilter,
  findTracesInText,
  isBinaryContent,
  listTraceFiles,
  MAX_TRACE_FILE_BYTES,
  scanTraces,
} from '../../../src/core/trace/scanner.js';
import { isolatedGitEnv } from '../../helpers/store-git.js';
import { cleanupTempPath } from '../../helpers/temp-cleanup.js';

function ids(text: string): string[] {
  return findTracesInText(text, 'file.ts').map((hit) => hit.id);
}

describe('findTracesInText', () => {
  it.each([
    ['// @trace REQ-0001', 'TypeScript, Java, Go, C#, Rust'],
    ['# @trace REQ-0001', 'Python, Ruby, shell, YAML'],
    ['-- @trace REQ-0001', 'SQL, Lua, Haskell'],
    ['/* @trace REQ-0001 */', 'CSS, C'],
    ['<!-- @trace REQ-0001 -->', 'HTML, XML, Markdown'],
    ['<!--@trace REQ-0001-->', 'a comment with no spaces'],
    ['; @trace REQ-0001', 'Lisp, INI'],
    ['const x = 1; // @trace REQ-0001', 'a trace after code'],
    ['    * @trace REQ-0001', 'a line inside a block comment'],
    ['// @trace: REQ-0001', 'a colon after @trace'],
  ])('reads %s (%s)', (line) => {
    expect(ids(line)).toEqual(['REQ-0001']);
  });

  it('reads more than one ID, split by commas or spaces', () => {
    expect(ids('# @trace REQ-0001, REQ-0002')).toEqual(['REQ-0001', 'REQ-0002']);
    expect(ids('# @trace REQ-0001,REQ-0002 REQ-0003')).toEqual(['REQ-0001', 'REQ-0002', 'REQ-0003']);
    expect(ids('# @trace REQ-0001 and REQ-0002')).toEqual(['REQ-0001']);
  });

  it('reads more than one trace on a line', () => {
    expect(ids('/* @trace REQ-0001 */ x(); /* @trace REQ-0002 */')).toEqual(['REQ-0001', 'REQ-0002']);
  });

  it('keeps IDs with five or more digits', () => {
    expect(ids('// @trace REQ-12345')).toEqual(['REQ-12345']);
  });

  it('keeps an ID with too few digits, so the check can report it as an orphan', () => {
    expect(ids('// @trace REQ-12')).toEqual(['REQ-12']);
  });

  it.each([
    ['the @trace scanner reads comments', 'prose about the feature'],
    ['// @trace <ID>', 'a placeholder in a template'],
    ['grep -E "@trace[[:space:]]+REQ-[0-9]{4,}"', 'a search pattern'],
    ['// @trace', 'a trace with no ID'],
    ['user@trace REQ-0001', 'an address-like word'],
    ['// @@trace REQ-0001', 'a doubled at sign'],
    ['// @traced REQ-0001', 'a longer word'],
    ['// @TRACE REQ-0001', 'upper case'],
    ['// @trace REQ-0001abc', 'an ID glued to a word'],
    ['// @trace req-0001', 'a lower-case ID'],
  ])('ignores %s (%s)', (line) => {
    expect(ids(line)).toEqual([]);
  });

  it('gives 1-based lines for LF, CRLF and CR line endings', () => {
    for (const eol of ['\n', '\r\n', '\r']) {
      const text = ['line one', '// @trace REQ-0001', 'line three', '# @trace REQ-0002'].join(eol);
      expect(findTracesInText(text, 'a.ts').map((hit) => hit.line)).toEqual([2, 4]);
    }
  });

  it('keeps the file name and the trimmed line text', () => {
    const [hit] = findTracesInText('   // @trace REQ-0007   \n', 'src/a.ts');
    expect(hit).toEqual({ id: 'REQ-0007', file: 'src/a.ts', line: 1, text: '// @trace REQ-0007' });
  });

  it('cuts a long line in the text', () => {
    const [hit] = findTracesInText(`// @trace REQ-0001 ${'x'.repeat(500)}`, 'a.ts');
    expect(hit.text.length).toBe(200);
    expect(hit.text.endsWith('…')).toBe(true);
  });
});

describe('isBinaryContent', () => {
  it('finds a NUL byte in the first 8000 bytes', () => {
    expect(isBinaryContent(Buffer.from('text\0more'))).toBe(true);
    expect(isBinaryContent(Buffer.from('plain text'))).toBe(false);
    expect(isBinaryContent(Buffer.concat([Buffer.alloc(8000, 0x61), Buffer.from([0])]))).toBe(false);
  });
});

describe('createTracePathFilter', () => {
  it('keeps every file with no globs', () => {
    expect(createTracePathFilter({})('anything/at/all.ts')).toBe(true);
  });

  it('keeps only included files, then drops excluded ones', () => {
    const keep = createTracePathFilter({ include: ['src/**'], exclude: ['**/*.test.ts'] });
    expect(keep('src/a.ts')).toBe(true);
    expect(keep('src/a.test.ts')).toBe(false);
    expect(keep('docs/a.md')).toBe(false);
  });

  it('reads a glob that ends in a slash as a whole folder', () => {
    const keep = createTracePathFilter({ exclude: ['vendor/'] });
    expect(keep('vendor/lib/a.js')).toBe(false);
    expect(keep('src/vendor.js')).toBe(true);
  });

  it('matches dot files', () => {
    expect(createTracePathFilter({ include: ['**/*.yml'] })('.github/workflows/ci.yml')).toBe(true);
  });
});

describe('listTraceFiles and scanTraces', () => {
  let tempDir: string;
  let root: string;

  beforeEach(() => {
    tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-trace-scan-')));
    root = path.join(tempDir, 'project');
    fs.mkdirSync(root);
    // Keep git from finding a repository above the temp folder, and from
    // reading the host's global ignore rules.
    vi.stubEnv('GIT_CEILING_DIRECTORIES', tempDir);
    for (const [key, value] of Object.entries(isolatedGitEnv(tempDir))) {
      vi.stubEnv(key, value as string);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    cleanupTempPath(tempDir);
  });

  function write(relativePath: string, content: string | Buffer): void {
    const file = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  function git(args: string[]): void {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  }

  it('in a git work tree, reads tracked and new files and honors .gitignore', async () => {
    write('.gitignore', 'ignored/\n*.log\n');
    write('src/tracked.ts', '// @trace REQ-0001\n');
    write('ignored/skip.ts', '// @trace REQ-0002\n');
    write('debug.log', '@trace REQ-0003\n');
    git(['init', '-q']);
    git(['add', '.gitignore', 'src/tracked.ts']);
    git(['commit', '-q', '-m', 'base']);
    write('src/new.ts', '// @trace REQ-0004\n');

    const { files, source } = await listTraceFiles(root);
    expect(source).toBe('git');
    expect(files).toEqual(['.gitignore', 'src/new.ts', 'src/tracked.ts']);

    const scan = await scanTraces(root);
    expect(scan.traces.map((hit) => `${hit.id} ${hit.file}:${hit.line}`)).toEqual([
      'REQ-0004 src/new.ts:1',
      'REQ-0001 src/tracked.ts:1',
    ]);
  });

  it('in a git work tree, skips a tracked file that was deleted', async () => {
    write('src/gone.ts', '// @trace REQ-0001\n');
    git(['init', '-q']);
    git(['add', '.']);
    git(['commit', '-q', '-m', 'base']);
    fs.rmSync(path.join(root, 'src', 'gone.ts'));

    const scan = await scanTraces(root);
    expect(scan.traces).toEqual([]);
    expect(scan.filesScanned).toBe(0);
  });

  it('outside git, walks the folder and skips node_modules, .git, dist and build', async () => {
    write('src/a.ts', '// @trace REQ-0001\n');
    write('node_modules/pkg/index.js', '// @trace REQ-0002\n');
    write('dist/a.js', '// @trace REQ-0003\n');
    write('build/a.js', '// @trace REQ-0004\n');
    write('packages/x/node_modules/y.js', '// @trace REQ-0005\n');
    write('.github/workflows/ci.yml', '# @trace REQ-0006\n');

    const { files, source } = await listTraceFiles(root);
    expect(source).toBe('walk');
    expect(files).toEqual(['.github/workflows/ci.yml', 'src/a.ts']);
  });

  it('skips the openspec folder at the root, but not a folder of that name deeper down', async () => {
    write('openspec/specs/a/spec.feature', '# @trace REQ-0001\n');
    write('openspec/notes.md', '@trace REQ-0002\n');
    write('src/openspec/a.ts', '// @trace REQ-0003\n');

    const { files } = await listTraceFiles(root);
    expect(files).toEqual(['src/openspec/a.ts']);
  });

  it('applies the include and exclude globs', async () => {
    write('src/a.ts', '// @trace REQ-0001\n');
    write('src/a.test.ts', '// @trace REQ-0002\n');
    write('docs/a.md', '<!-- @trace REQ-0003 -->\n');

    const { files } = await listTraceFiles(root, { include: ['src/**'], exclude: ['**/*.test.ts'] });
    expect(files).toEqual(['src/a.ts']);
  });

  it('skips binary files and files over the size limit', async () => {
    write('src/a.ts', '// @trace REQ-0001\n');
    write('assets/image.bin', Buffer.concat([Buffer.from('// @trace REQ-0002\n'), Buffer.from([0, 1, 2])]));
    write('vendor/huge.js', `// @trace REQ-0003\n${'x'.repeat(MAX_TRACE_FILE_BYTES)}`);

    const scan = await scanTraces(root);
    expect(scan.traces.map((hit) => hit.id)).toEqual(['REQ-0001']);
    expect(scan.filesScanned).toBe(1);
  });

  it('sorts traces by file and then line', async () => {
    write('b.ts', '// @trace REQ-0002\n\n// @trace REQ-0001\n');
    write('a.ts', '// @trace REQ-0003\n');

    const scan = await scanTraces(root);
    expect(scan.traces.map((hit) => `${hit.file}:${hit.line}`)).toEqual(['a.ts:1', 'b.ts:1', 'b.ts:3']);
  });
});
