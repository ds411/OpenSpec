import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { convertSpecs } from '../../src/core/convert-specs.js';
import { parseFeature } from '../../src/core/gherkin/document.js';
import { readIdCounter } from '../../src/core/gherkin/id-store.js';
import { Validator } from '../../src/core/validation/validator.js';

let root: string;

async function write(relative: string, content: string): Promise<string> {
  const file = path.join(root, 'openspec', relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return file;
}

const read = (relative: string) => fs.readFile(path.join(root, 'openspec', relative), 'utf-8');

const MAIN_SPEC = `# Billing Specification

## Purpose
Issue invoices and credit notes for every order.

## Requirements

### Requirement: Invoices
The system SHALL issue an invoice for each order.

#### Scenario: Order placed
- **WHEN** an order is placed
- **THEN** an invoice is issued
- **AND** the customer gets an email

### Requirement: Old discounts
The system SHALL apply old discounts.

#### Scenario: Discount applied
- **WHEN** a coupon is used
- **THEN** the total drops

### Requirement: Credit notes
The system SHALL issue a credit note when an invoice is voided.

#### Scenario: Invoice voided
- **WHEN** an invoice is voided
- **THEN** a credit note reads:
  \`\`\`text
  Credit for invoice 42
  \`\`\`
`;

const DELTA = `# Billing Delta

## ADDED Requirements

### Requirement: Refunds
The system SHALL refund a voided payment.

#### Scenario: Payment voided
- **WHEN** a payment is voided
- **THEN** it is refunded

## MODIFIED Requirements

### Requirement: Invoices
The system SHALL issue an invoice for each paid order.

#### Scenario: Order placed
- **WHEN** an order is paid
- **THEN** an invoice is issued

## RENAMED Requirements
- FROM: \`### Requirement: Credit notes\`
- TO: \`### Requirement: Credit memos\`

## REMOVED Requirements

### Requirement: Old discounts
**Reason**: Replaced by promotions.
`;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-convert-'));
  await write('specs/billing/spec.md', MAIN_SPEC);
  await write('changes/rework-billing/specs/billing/spec.md', DELTA);
  await write('changes/archive/2026-01-01-old/specs/billing/spec.md', DELTA);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('convertSpecs', () => {
  it('converts a main spec to a feature file with an ID per requirement', async () => {
    const result = await convertSpecs(root);

    expect(result.problems).toEqual([]);
    const spec = await read('specs/billing/spec.feature');
    expect(spec).toBe(`Feature: Billing
  Issue invoices and credit notes for every order.

  @REQ-0001
  Rule: Invoices
    The system SHALL issue an invoice for each order.

    Scenario: Order placed
      When an order is placed
      Then an invoice is issued
      And the customer gets an email

  @REQ-0002
  Rule: Old discounts
    The system SHALL apply old discounts.

    Scenario: Discount applied
      When a coupon is used
      Then the total drops

  @REQ-0003
  Rule: Credit notes
    The system SHALL issue a credit note when an invoice is voided.

    Scenario: Invoice voided
      When an invoice is voided
      Then a credit note reads:
        """text
        Credit for invoice 42
        """
`);
    const report = await new Validator().validateSpecContent('billing', spec);
    expect(report.valid).toBe(true);
    await expect(fs.access(path.join(root, 'openspec', 'specs', 'billing', 'spec.md'))).rejects.toThrow();
  });

  it('gives a delta the IDs of the requirements it changes, and new IDs to what it adds', async () => {
    const result = await convertSpecs(root);

    const delta = parseFeature(await read('changes/rework-billing/specs/billing/spec.feature'));
    expect(delta.rules.map((rule) => `${rule.operations[0]} ${rule.id} ${rule.name}`)).toEqual([
      'added REQ-0004 Refunds',
      'modified REQ-0001 Invoices',
      // A rename with no MODIFIED entry copies the main rule under its new name.
      'modified REQ-0003 Credit memos',
      'removed REQ-0002 Old discounts',
    ]);
    expect(delta.rules[2].scenarios.map((scenario) => scenario.name)).toEqual(['Invoice voided']);
    expect(result.ids.map((entry) => entry.id)).toEqual(['REQ-0001', 'REQ-0002', 'REQ-0003', 'REQ-0004']);
    await expect(readIdCounter(path.join(root, 'openspec'))).resolves.toBe(5);

    const report = await new Validator().validateChangeDeltaSpecs(
      path.join(root, 'openspec', 'changes', 'rework-billing'),
      path.join(root, 'openspec', 'specs')
    );
    expect(report.issues.filter((issue) => issue.level === 'ERROR')).toEqual([]);
  });

  it('leaves archived changes as they are', async () => {
    await convertSpecs(root);
    await expect(read('changes/archive/2026-01-01-old/specs/billing/spec.md')).resolves.toBe(DELTA);
    await expect(
      fs.access(path.join(root, 'openspec', 'changes', 'archive', '2026-01-01-old', 'specs', 'billing', 'spec.feature'))
    ).rejects.toThrow();
  });

  it('writes nothing on a dry run, and keeps the markdown with --keep', async () => {
    const dry = await convertSpecs(root, { dryRun: true });
    expect(dry.converted).toHaveLength(2);
    await expect(fs.access(path.join(root, 'openspec', 'specs', 'billing', 'spec.feature'))).rejects.toThrow();
    await expect(readIdCounter(path.join(root, 'openspec'))).resolves.toBeUndefined();

    await convertSpecs(root, { keep: true });
    await expect(read('specs/billing/spec.md')).resolves.toBe(MAIN_SPEC);
    await expect(read('specs/billing/spec.feature')).resolves.toContain('Feature: Billing');
  });

  it('refuses to overwrite a feature file that already exists', async () => {
    await write('specs/billing/spec.feature', 'Feature: Billing\n');
    const result = await convertSpecs(root);
    expect(result.problems.map((problem) => problem.message)).toContainEqual(
      expect.stringContaining('spec.feature already exists next to it')
    );
    await expect(read('specs/billing/spec.md')).resolves.toBe(MAIN_SPEC);
  });

  it('warns when a delta names a requirement the main spec does not have', async () => {
    await write(
      'changes/other/specs/billing/spec.md',
      '## MODIFIED Requirements\n\n### Requirement: Unknown\nThe system SHALL do something.\n\n#### Scenario: S\n- **WHEN** x\n- **THEN** y\n'
    );
    const result = await convertSpecs(root);
    expect(result.warnings.map((warning) => warning.message)).toContainEqual(
      'MODIFIED requirement "Unknown" is not in specs/billing/spec.feature, so it has no ID. Add the ID of the requirement it changes.'
    );
    await expect(read('changes/other/specs/billing/spec.feature')).resolves.toContain('  @modified\n  Rule: Unknown');
  });

  it('keeps text Gherkin would misread as a keyword or comment', async () => {
    await write(
      'specs/notes/spec.md',
      '# Notes\n\n## Purpose\nNotes about the product.\n\n### Background reading\n#hashtag, not a comment\n@not-a-tag\nScenario: a word, not a keyword\n\n## Requirements\n\n### Requirement: Keep notes\nThe system SHALL keep notes.\n\n#### Scenario: Note kept\n- **WHEN** a note is written\n- **THEN** it is kept\n'
    );
    const result = await convertSpecs(root);
    expect(result.problems).toEqual([]);
    const spec = parseFeature(await read('specs/notes/spec.feature'));
    expect(spec.errors).toEqual([]);
    expect(spec.feature?.description).toContain('**Background reading**');
    expect(spec.feature?.description).toContain('\\#hashtag, not a comment');
    expect(spec.feature?.description).toContain('\\@not-a-tag');
    expect(spec.feature?.description).toContain('\\Scenario: a word, not a keyword');
  });

  it('reports no work when there is no markdown', async () => {
    await fs.rm(path.join(root, 'openspec'), { recursive: true, force: true });
    await fs.mkdir(path.join(root, 'openspec', 'specs'), { recursive: true });
    await expect(convertSpecs(root)).resolves.toEqual({ converted: [], ids: [], problems: [], warnings: [] });
  });
});
