import * as fs from 'node:fs';
import * as path from 'node:path';

/** Minimal healthy OpenSpec root layout shared by slice test suites. */
export function createOpenSpecRoot(rootDir: string): void {
  fs.mkdirSync(path.join(rootDir, 'openspec', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'openspec', 'changes', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'openspec', 'config.yaml'), 'schema: spec-driven\n');
}

/** Writes a spec file under the root's openspec/specs/<id>/spec.feature. */
export function writeSpec(rootDir: string, specId: string, body: string): void {
  const specDir = path.join(rootDir, 'openspec', 'specs', specId);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'spec.feature'), body);
}

export interface FixtureScenario {
  name: string;
  /** Step lines such as `When it runs`; defaults to one When and one Then. */
  steps?: string[];
}

export interface FixtureRequirement {
  /** The requirement ID, such as `REQ-0001`. Left out for an untagged rule. */
  id?: string;
  name: string;
  /** The requirement statement; defaults to a SHALL sentence built from the name. */
  statement?: string;
  scenarios?: FixtureScenario[];
  /** Tags other than the ID, such as `added` or `notrace`. */
  tags?: string[];
}

const DEFAULT_STEPS = ['When it runs', 'Then it works'];

/** One rule block, indented as a main spec or delta holds it. */
export function featureRule(requirement: FixtureRequirement): string {
  const tags = [...(requirement.tags ?? []), ...(requirement.id ? [requirement.id] : [])];
  const lines: string[] = [];
  if (tags.length > 0) lines.push(`  ${tags.map((tag) => `@${tag}`).join(' ')}`);
  lines.push(`  Rule: ${requirement.name}`);
  lines.push(`    ${requirement.statement ?? `The system SHALL support ${requirement.name}.`}`);
  for (const scenario of requirement.scenarios ?? [{ name: 'It works' }]) {
    lines.push('', `    Scenario: ${scenario.name}`);
    for (const step of scenario.steps ?? DEFAULT_STEPS) lines.push(`      ${step}`);
  }
  return lines.join('\n');
}

/**
 * A spec as a Gherkin feature file: a `Feature:` line, the Purpose as its
 * description, and one rule per requirement.
 */
export function featureSpec(name: string, purpose: string, requirements: FixtureRequirement[] = []): string {
  const lines = [`Feature: ${name}`];
  for (const line of purpose.split('\n')) lines.push(line.trim() === '' ? '' : `  ${line}`);
  for (const requirement of requirements) lines.push('', featureRule(requirement));
  return `${lines.join('\n')}\n`;
}
