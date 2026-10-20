import { describe, it, expect, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { ChangeParser } from '../../../src/core/parsers/change-parser.js';
import { parseDeltaFeature } from '../../../src/core/gherkin/delta.js';
import type { Change } from '../../../src/core/schemas/index.js';

/**
 * `openspec show --json --deltas-only` reads deltas through ChangeParser, while
 * `archive` applies them through parseDeltaFeature. The inspection command
 * OpenSpec recommends must report what archive applies.
 */

const PROPOSAL = [
  '# Edit billing',
  '',
  '## Why',
  'We need to keep the billing contract accurate for operators and customers over time.',
  '',
  '## What Changes',
  '- **billing**: updates billing requirements',
  '',
].join('\n');

const temps: string[] = [];
afterAll(async () => {
  await Promise.all(temps.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** Parse a change whose single delta spec, specs/billing/spec.feature, is `delta`. */
async function parseChange(delta: string): Promise<Change> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-change-deltas-'));
  temps.push(dir);
  await fs.mkdir(path.join(dir, 'specs', 'billing'), { recursive: true });
  await fs.writeFile(path.join(dir, 'specs', 'billing', 'spec.feature'), delta);
  return new ChangeParser(PROPOSAL, dir).parseChangeWithDeltas('edit');
}

function archiveView(delta: string): string[] {
  const plan = parseDeltaFeature(delta);
  return [
    ...plan.added.map(({ rule }) => `ADDED ${rule.name}`),
    ...plan.modified.map(({ rule }) => `MODIFIED ${rule.name}`),
    ...plan.removed.map(({ rule }) => `REMOVED ${rule.name}`),
  ];
}

const showView = (change: Change) =>
  change.deltas.map((delta) => `${delta.operation} ${delta.requirement?.name}`);

const DELTA = [
  'Feature: Billing',
  '',
  '  @removed @REQ-0002',
  '  Rule: Late Fees',
  '    Gone.',
  '',
  '  @added',
  '  Rule: Grace Period',
  '    The system SHALL wait seven days before charging a late fee.',
  '',
  '    Scenario: Within the grace period',
  '      When an invoice is five days late',
  '      Then no fee is charged',
  '',
  '  @modified @REQ-0001',
  '  Rule: Invoice Total',
  '    The system SHALL include taxes in the invoice total.',
  '',
  '    Scenario: Taxes',
  '      When an invoice is issued',
  '      Then its total includes taxes',
  '',
].join('\n');

describe('ChangeParser reads deltas the way archive applies them', () => {
  it('reports every operation archive applies, and nothing else', async () => {
    const change = await parseChange(DELTA);
    expect(showView(change).sort()).toEqual(archiveView(DELTA).sort());
  });

  it('never invents a delta from the proposal prose when the spec has tagged rules', async () => {
    const change = await parseChange(DELTA);
    expect(change.deltas.every((delta) => delta.spec === 'billing')).toBe(true);
    expect(change.deltas).toHaveLength(3);
  });

  it('reads a rule with two operation tags as no delta, as archive does', async () => {
    const delta = [
      'Feature: Billing',
      '',
      '  @added @modified @REQ-0001',
      '  Rule: Invoice Total',
      '    The system SHALL include taxes.',
      '',
      '  @removed @REQ-0002',
      '  Rule: Late Fees',
      '    Gone.',
      '',
    ].join('\n');
    const change = await parseChange(delta);
    expect(showView(change)).toEqual(archiveView(delta));
    expect(showView(change)).toEqual(['REMOVED Late Fees']);
  });
});
