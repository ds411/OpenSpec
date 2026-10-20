import { describe, expect, it } from 'vitest';

import { analyzeTraces, coverageRatio } from '../../../src/core/trace/analysis.js';
import type {
  ChangeRequirement,
  IndexedRequirement,
  RequirementIndex,
} from '../../../src/core/trace/requirements.js';
import type { TraceHit } from '../../../src/core/trace/scanner.js';

function requirement(id: string, overrides: Partial<IndexedRequirement> = {}): IndexedRequirement {
  return {
    id,
    name: `Rule ${id}`,
    capability: 'cli-list',
    file: '/project/openspec/specs/cli-list/spec.feature',
    line: 1,
    notrace: false,
    ...overrides,
  };
}

function changeEntry(
  id: string,
  operation: ChangeRequirement['operation'],
  change: string,
  overrides: Partial<ChangeRequirement> = {}
): ChangeRequirement {
  return {
    ...requirement(id),
    file: `/project/openspec/changes/${change}/specs/cli-list/spec.feature`,
    change,
    operation,
    ...overrides,
  };
}

function hit(id: string, file = 'src/a.ts', line = 1): TraceHit {
  return { id, file, line, text: `// @trace ${id}` };
}

function index(partial: Partial<RequirementIndex>): RequirementIndex {
  return { requirements: [], changes: [], problems: [], ...partial };
}

describe('analyzeTraces', () => {
  it('passes when every requirement is traced and every trace is known', () => {
    const analysis = analyzeTraces(index({ requirements: [requirement('REQ-0001')] }), [hit('REQ-0001')]);
    expect(analysis.requirements[0].status).toBe('traced');
    expect(analysis.orphans).toEqual([]);
    expect(analysis.summary).toMatchObject({ requirements: 1, traced: 1, untraced: 0, coverage: 1 });
  });

  it('reports a requirement with no trace as untraced', () => {
    const analysis = analyzeTraces(
      index({ requirements: [requirement('REQ-0001'), requirement('REQ-0002')] }),
      [hit('REQ-0001')]
    );
    expect(analysis.requirements.map((r) => [r.id, r.status])).toEqual([
      ['REQ-0001', 'traced'],
      ['REQ-0002', 'untraced'],
    ]);
    expect(analysis.summary.coverage).toBe(0.5);
  });

  it('reports a trace to an unknown ID as an orphan', () => {
    const analysis = analyzeTraces(index({ requirements: [requirement('REQ-0001')] }), [
      hit('REQ-0001'),
      hit('REQ-0099', 'src/b.ts', 4),
    ]);
    expect(analysis.orphans).toEqual([hit('REQ-0099', 'src/b.ts', 4)]);
  });

  it('keeps a @notrace requirement out of the untraced check and the coverage', () => {
    const analysis = analyzeTraces(
      index({ requirements: [requirement('REQ-0001'), requirement('REQ-0002', { notrace: true })] }),
      [hit('REQ-0001')]
    );
    expect(analysis.requirements[1].status).toBe('notrace');
    expect(analysis.summary).toMatchObject({ untraced: 0, notrace: 1, coverage: 1 });
  });

  it('treats an ID that an active change adds as pending, not orphan', () => {
    const analysis = analyzeTraces(
      index({ changes: [changeEntry('REQ-0042', 'added', 'add-json'), changeEntry('REQ-0043', 'added', 'add-json')] }),
      [hit('REQ-0042')]
    );
    expect(analysis.orphans).toEqual([]);
    expect(analysis.pending.map((p) => [p.id, p.change, p.traced])).toEqual([
      ['REQ-0042', 'add-json', true],
      ['REQ-0043', 'add-json', false],
    ]);
    expect(analysis.summary).toMatchObject({ requirements: 0, untraced: 0, pending: 2, coverage: null });
  });

  it('warns on a trace to a requirement that an active change removes, and does not require a trace for it', () => {
    const analysis = analyzeTraces(
      index({
        requirements: [requirement('REQ-0005'), requirement('REQ-0006')],
        changes: [changeEntry('REQ-0005', 'removed', 'drop-borders'), changeEntry('REQ-0006', 'removed', 'drop-borders')],
      }),
      [hit('REQ-0005', 'src/borders.ts', 3)]
    );
    expect(analysis.requirements.map((r) => r.status)).toEqual(['removing', 'removing']);
    expect(analysis.orphans).toEqual([]);
    expect(analysis.warnings).toEqual([
      {
        code: 'trace_to_removed_requirement',
        message: expect.stringContaining('drop-borders'),
        file: 'src/borders.ts',
        line: 3,
        id: 'REQ-0005',
        change: 'drop-borders',
      },
    ]);
    expect(analysis.summary).toMatchObject({ removing: 2, untraced: 0, coverage: null });
  });

  it('treats a trace to an ID that is only removed, and in no main spec, as an orphan', () => {
    const analysis = analyzeTraces(index({ changes: [changeEntry('REQ-0005', 'removed', 'drop')] }), [
      hit('REQ-0005'),
    ]);
    expect(analysis.orphans.map((o) => o.id)).toEqual(['REQ-0005']);
    expect(analysis.warnings).toEqual([]);
  });

  it('does not count an ID that a change modifies as pending', () => {
    const analysis = analyzeTraces(
      index({ requirements: [requirement('REQ-0001')], changes: [changeEntry('REQ-0001', 'modified', 'rename')] }),
      [hit('REQ-0001')]
    );
    expect(analysis.pending).toEqual([]);
    expect(analysis.requirements[0].status).toBe('traced');
  });

  it('passes spec problems through as warnings', () => {
    const analysis = analyzeTraces(
      index({
        problems: [
          {
            code: 'requirement_without_id',
            file: '/project/openspec/specs/a/spec.feature',
            line: 3,
            message: 'Rule "A" has no requirement ID',
          },
        ],
      }),
      []
    );
    expect(analysis.warnings).toEqual([
      {
        code: 'requirement_without_id',
        file: '/project/openspec/specs/a/spec.feature',
        line: 3,
        message: 'Rule "A" has no requirement ID',
      },
    ]);
  });

  it('groups coverage by capability, sorted by name', () => {
    const analysis = analyzeTraces(
      index({
        requirements: [
          requirement('REQ-0001', { capability: 'web' }),
          requirement('REQ-0002', { capability: 'cli' }),
          requirement('REQ-0003', { capability: 'cli' }),
        ],
        changes: [changeEntry('REQ-0004', 'added', 'c', { capability: 'web' })],
      }),
      [hit('REQ-0001'), hit('REQ-0002')]
    );
    expect(analysis.capabilities).toEqual([
      { capability: 'cli', requirements: 2, traced: 1, untraced: 1, notrace: 0, removing: 0, pending: 0, coverage: 0.5 },
      { capability: 'web', requirements: 1, traced: 1, untraced: 0, notrace: 0, removing: 0, pending: 1, coverage: 1 },
    ]);
  });

  it('groups traces by ID', () => {
    const analysis = analyzeTraces(index({ requirements: [requirement('REQ-0001')] }), [
      hit('REQ-0001', 'a.ts', 1),
      hit('REQ-0001', 'b.ts', 9),
    ]);
    expect(analysis.tracesById.get('REQ-0001')?.map((h) => h.file)).toEqual(['a.ts', 'b.ts']);
    expect(analysis.requirements[0].traces).toHaveLength(2);
  });
});

describe('coverageRatio', () => {
  it('rounds to four places and is null with nothing to trace', () => {
    expect(coverageRatio(1, 3)).toBe(0.3333);
    expect(coverageRatio(0, 0)).toBeNull();
  });
});
