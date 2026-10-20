import { describe, expect, it } from 'vitest';
import { parseDeltaFeature } from '../../../src/core/gherkin/delta.js';
import { parseFeature } from '../../../src/core/gherkin/document.js';
import {
  buildSpecSkeleton,
  findDeltaPlanErrors,
  findDroppedScenarios,
  mergeDelta,
} from '../../../src/core/gherkin/merge.js';
import { featureRule, featureSpec, type FixtureRequirement } from '../../helpers/openspec-fixtures.js';

const A: FixtureRequirement = { id: 'REQ-0001', name: 'A', statement: 'The system SHALL do A.' };
const B: FixtureRequirement = { id: 'REQ-0002', name: 'B', statement: 'The system SHALL do B.' };
const MAIN = featureSpec('demo', 'Demo purpose.', [A, B]);

function delta(...requirements: FixtureRequirement[]): string {
  return `Feature: demo\n\n${requirements.map(featureRule).join('\n\n')}\n`;
}

/** Merge into `mainContent`; null merges into a capability with no spec yet. */
function merge(deltaContent: string, mainContent: string | null = MAIN) {
  return mergeDelta({
    specName: 'demo',
    changeName: 'change-1',
    plan: parseDeltaFeature(deltaContent),
    mainContent: mainContent ?? undefined,
  });
}

describe('mergeDelta', () => {
  it('adds, modifies and removes rules by ID', () => {
    const result = merge(
      delta(
        { ...B, tags: ['modified'], statement: 'The system SHALL do B better.' },
        { ...A, tags: ['removed'], scenarios: [] },
        { id: 'REQ-0003', tags: ['added'], name: 'C' }
      )
    );
    expect(result.counts).toEqual({ added: 1, modified: 1, removed: 1 });
    const rebuilt = parseFeature(result.rebuilt);
    expect(rebuilt.rules.map((rule) => `${rule.id} ${rule.name}`)).toEqual(['REQ-0002 B', 'REQ-0003 C']);
    expect(rebuilt.rules[0].description).toBe('The system SHALL do B better.');
    expect(result.rebuilt).not.toMatch(/@(added|modified|removed)/);
    expect(result.rebuilt.endsWith('\n')).toBe(true);
  });

  it('renames a rule through @modified and keeps its place', () => {
    const result = merge(delta({ ...A, tags: ['modified'], name: 'A renamed' }));
    expect(parseFeature(result.rebuilt).rules.map((rule) => rule.name)).toEqual(['A renamed', 'B']);
  });

  it('is a no-op when the delta is already applied', () => {
    const applied = featureSpec('demo', 'Demo purpose.', [A, { id: 'REQ-0003', name: 'C' }]);
    const result = merge(
      delta({ ...A, tags: ['modified'] }, { id: 'REQ-0003', tags: ['added'], name: 'C' }, { ...B, tags: ['removed'] }),
      applied
    );
    expect(result.counts).toEqual({ added: 0, modified: 0, removed: 0 });
    expect(result.warnings).toEqual([
      'demo - @removed requirement REQ-0002 ("B") is not in the current spec; treating it as already removed.',
    ]);
  });

  it('refuses an @added ID that the spec holds with different content', () => {
    expect(() => merge(delta({ ...A, tags: ['added'], statement: 'Something else entirely.' }))).toThrow(
      'demo @added failed for REQ-0001 ("A") - the spec already has a requirement with this ID'
    );
  });

  it('refuses a @modified ID that the spec does not hold', () => {
    expect(() => merge(delta({ id: 'REQ-0009', tags: ['modified'], name: 'X' }))).toThrow(
      'demo @modified failed for REQ-0009 ("X") - not found in the current spec'
    );
  });

  it('refuses a @removed ID that is missing while a rule of that name has another ID', () => {
    expect(() => merge(delta({ id: 'REQ-0009', tags: ['removed'], name: 'a', scenarios: [] }))).toThrow(
      'demo @removed failed for REQ-0009 ("a") - not in the current spec, but REQ-0001 has the same name'
    );
  });

  it('refuses a @modified rule that leaves out a current scenario, unless it tags it @removed', () => {
    const main = featureSpec('demo', 'Demo purpose.', [
      { ...A, scenarios: [{ name: 'One' }, { name: 'Two' }] },
    ]);
    expect(() => merge(delta({ ...A, tags: ['modified'], scenarios: [{ name: 'One' }] }), main)).toThrow(
      'leaves out: "Two"'
    );

    const kept = [
      'Feature: demo',
      '',
      '  @modified @REQ-0001',
      '  Rule: A',
      '    The system SHALL do A.',
      '',
      '    Scenario: One',
      '      When it runs',
      '      Then it works',
      '',
      '    # Two is obsolete.',
      '    @removed',
      '    Scenario: Two',
      '      When it runs',
      '      Then it works',
      '',
    ].join('\n');
    const result = merge(kept, main);
    expect(result.rebuilt).toContain('Scenario: One');
    expect(result.rebuilt).not.toContain('Scenario: Two');
    expect(result.rebuilt).not.toContain('Two is obsolete');
  });

  it('builds a new spec from the delta feature name and description', () => {
    const result = merge(
      'Feature: Widgets\n  Lets users build widgets.\n\n  @added @REQ-0001\n  Rule: Build\n    The system SHALL build widgets.\n',
      null
    );
    expect(result.rebuilt).toBe(
      'Feature: Widgets\n  Lets users build widgets.\n\n  @REQ-0001\n  Rule: Build\n    The system SHALL build widgets.\n'
    );
  });

  it('refuses @modified on a spec that does not exist, and ignores @removed there', () => {
    expect(() => merge(delta({ ...A, tags: ['modified'] }), null)).toThrow(
      'demo: target spec does not exist; only @added rules are allowed for a new spec'
    );
    const result = merge(delta({ id: 'REQ-0003', tags: ['added'], name: 'C' }, { ...A, tags: ['removed'] }), null);
    expect(result.warnings).toEqual(['demo - 1 @removed rule(s) ignored for new spec (nothing to remove).']);
  });

  it('refuses a delta with plan errors, naming the line', () => {
    expect(() => merge('Feature: demo\n\n  @REQ-0001\n  Rule: A\n')).toThrow(
      'demo validation failed - line 4: Rule "A" has no operation tag'
    );
    expect(() => merge('Feature: demo\n')).toThrow('Delta parsing found no operations for demo');
  });

  it('refuses a main spec that does not parse or repeats an ID', () => {
    expect(() => merge(delta({ ...A, tags: ['modified'] }), 'Feature: demo\n  Scenario: S\n    When x\nFeature: again\n')).toThrow(
      'demo: target spec is invalid and cannot be updated until fixed (line 4:'
    );
    expect(() => merge(delta({ ...A, tags: ['modified'] }), featureSpec('demo', 'P.', [A, { ...A, name: 'A again' }]))).toThrow(
      'demo: target spec has requirement REQ-0001 more than once.'
    );
  });

  it('keeps comments between rules when it replaces or removes the rule above them', () => {
    const main = [
      'Feature: demo',
      '  Demo purpose.',
      '',
      featureRule(A),
      '',
      '  # Payments rules start here.',
      '',
      featureRule(B),
      '',
      '  # End of the rules.',
      '',
    ].join('\n');
    const removed = merge(delta({ ...A, tags: ['removed'], scenarios: [] }), main).rebuilt;
    expect(removed).toContain('  # Payments rules start here.\n\n  @REQ-0002');
    const modified = merge(delta({ ...A, tags: ['modified'], statement: 'The system SHALL do A now.' }), main).rebuilt;
    expect(modified).toContain('The system SHALL do A now.');
    expect(modified).toContain('  # Payments rules start here.');
    // A new rule goes after the last rule, ahead of the closing comment.
    const added = merge(delta({ id: 'REQ-0003', tags: ['added'], name: 'C' }), main).rebuilt;
    expect(added.indexOf('Rule: C')).toBeLessThan(added.indexOf('# End of the rules.'));
    expect(added.indexOf('Rule: B')).toBeLessThan(added.indexOf('Rule: C'));
  });

  it('keeps the comment above a modified rule unless the delta brings its own', () => {
    const main = featureSpec('demo', 'Demo purpose.', [A]).replace('  @REQ-0001', '  # About A.\n  @REQ-0001');
    expect(merge(delta({ ...A, tags: ['modified'], statement: 'New A.' }), main).rebuilt).toContain(
      '  # About A.\n  @REQ-0001\n  Rule: A\n    New A.'
    );
    const own = `Feature: demo\n\n  # A, reworded.\n${featureRule({ ...A, tags: ['modified'], statement: 'New A.' })}\n`;
    const rebuilt = merge(own, main).rebuilt;
    expect(rebuilt).toContain('  # A, reworded.\n  @REQ-0001');
    expect(rebuilt).not.toContain('About A.');
  });

  it('moves delta rules to the indentation of the main spec', () => {
    const flat = MAIN.split('\n').map((line) => line.replace(/^ {2}/, '')).join('\n');
    const rebuilt = merge(delta({ id: 'REQ-0003', tags: ['added'], name: 'C' }), flat).rebuilt;
    expect(rebuilt).toContain('\n@REQ-0003\nRule: C\n  The system SHALL support C.\n\n  Scenario: It works\n    When it runs');
  });

  it('reports what a retirement would delete once no rule is left', () => {
    const main = `${featureSpec('demo', 'Demo purpose.', [A])}\n  # Owned by the platform team.\n`;
    const result = merge(delta({ ...A, tags: ['removed'], scenarios: [] }), main);
    expect(result.noRequirementBlocks).toBe(true);
    expect(result.unaccountedContent).toEqual(['# Owned by the platform team.']);
    const clean = merge(delta({ ...A, tags: ['removed'], scenarios: [] }), featureSpec('demo', 'Demo purpose.', [A]));
    expect(clean.unaccountedContent).toEqual([]);
  });
});

describe('findDeltaPlanErrors', () => {
  it('names every rule archive cannot act on', () => {
    const plan = parseDeltaFeature(
      [
        'Feature: demo',
        '',
        '  Rule: Untagged',
        '',
        '  @added @modified @REQ-0001',
        '  Rule: Both',
        '',
        '  @added',
        '  Rule: No ID',
        '',
        '  @added @REQ-0002 @REQ-0003',
        '  Rule: Two IDs',
        '',
        '  @added @REQ-0004',
        '  Rule: First',
        '',
        '  @removed @REQ-0004',
        '  Rule: Again',
        '',
      ].join('\n')
    );
    expect(findDeltaPlanErrors(plan).map((error) => `${error.line}: ${error.message}`)).toEqual([
      '3: Rule "Untagged" has no operation tag. Tag it @added, @modified or @removed.',
      '6: Rule "Both" has more than one operation tag (@added, @modified). Keep one.',
      '9: Rule "No ID" has no requirement ID. Run "openspec ids assign <change>" to give it one.',
      '12: Rule "Two IDs" has more than one requirement ID (REQ-0002, REQ-0003). Keep one.',
      '18: Requirement REQ-0004 appears more than once in this delta (also line 15).',
    ]);
  });

  it('reports a syntax error and a missing Feature line', () => {
    expect(findDeltaPlanErrors(parseDeltaFeature('Feature: a\n  Scenario: s\n    When x\nFeature: b\n'))[0].message).toMatch(
      /^Gherkin syntax error: /
    );
    expect(findDeltaPlanErrors(parseDeltaFeature('# nothing here\n'))).toEqual([
      { line: 1, message: 'Delta spec has no "Feature:" line.' },
    ]);
  });
});

describe('findDroppedScenarios', () => {
  it('counts scenarios that share a name', () => {
    const rules = parseFeature(
      featureSpec('demo', 'P.', [
        { ...A, scenarios: [{ name: 'Same' }, { name: 'Same' }, { name: 'Other' }] },
        { ...B, scenarios: [{ name: 'Same' }, { name: 'New' }] },
      ])
    ).rules;
    expect(findDroppedScenarios(rules[0], rules[1])).toEqual(['Same', 'Other']);
  });
});

describe('buildSpecSkeleton', () => {
  it('uses a placeholder Purpose that names the change when there is none', () => {
    expect(buildSpecSkeleton('cap', 'add-cap')).toBe(
      'Feature: cap\n  TBD - created by archiving change add-cap. Update Purpose after archive.\n'
    );
    expect(buildSpecSkeleton('cap', 'add-cap', 'Capability', 'First line.\n\nSecond line.')).toBe(
      'Feature: Capability\n  First line.\n\n  Second line.\n'
    );
  });
});
