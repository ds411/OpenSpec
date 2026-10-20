import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { Validator } from '../../src/core/validation/validator.js';

describe('Validator enriched messages', () => {
  const testDir = path.join(process.cwd(), 'test-validation-enriched-tmp');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('adds guidance for no deltas in change', async () => {
    const changeContent = `# Test Change

## Why
This is a sufficiently long explanation to pass the why length requirement for validation purposes.

## What Changes
There are changes proposed, but no delta specs provided yet.`;
    const changePath = path.join(testDir, 'proposal.md');
    await fs.writeFile(changePath, changeContent);

    const validator = new Validator();
    const report = await validator.validateChange(changePath);
    expect(report.valid).toBe(false);
    const msg = report.issues.map(i => i.message).join('\n');
    expect(msg).toContain('Change must have at least one delta');
    expect(msg).toContain('Ensure your change has a specs/ directory');
    expect(msg).toContain('Gherkin rules tagged @added, @modified or @removed');
  });

  it('adds an example of the format when the spec has no Feature line', async () => {
    const specContent = `# Test Spec\n# Requirements are written as comments, so there is no Feature.\n`;
    const specPath = path.join(testDir, 'spec.feature');
    await fs.writeFile(specPath, specContent);

    const validator = new Validator();
    const report = await validator.validateSpec(specPath);
    expect(report.valid).toBe(false);
    const msg = report.issues.map(i => i.message).join('\n');
    expect(msg).toContain('Spec must have a "Feature:" line');
    expect(msg).toContain('A spec is a Gherkin feature file. Example:');
    expect(msg).toContain('  @REQ-0001\n  Rule: <requirement name>');
  });

  it('warns with a scenario template when a requirement has no scenario', async () => {
    const specContent = `Feature: Test Spec
  This is a sufficiently long purpose section to avoid warnings about brevity.

  @REQ-0001
  Rule: Foo
    Foo SHALL be described.
`;
    const specPath = path.join(testDir, 'spec.feature');
    await fs.writeFile(specPath, specContent);

    const validator = new Validator();
    const report = await validator.validateSpec(specPath);
    expect(report.valid).toBe(false);
    const warn = report.issues.find(i => i.path.includes('requirements[0].scenarios'));
    expect(warn?.message).toContain('Requirement must have at least one scenario');
    expect(warn?.message).toContain('Write each scenario inside its Rule:');
    expect(warn?.message).toContain('    Scenario: Short name');
  });
});
