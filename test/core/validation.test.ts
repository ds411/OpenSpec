import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { Validator } from '../../src/core/validation/validator.js';
import {
  MAX_REQUIREMENT_TEXT_LENGTH,
  VALIDATION_MESSAGES,
} from '../../src/core/validation/constants.js';
import { 
  ScenarioSchema, 
  RequirementSchema, 
  SpecSchema, 
  ChangeSchema,
  DeltaSchema 
} from '../../src/core/schemas/index.js';
import { featureRule, featureSpec } from '../helpers/openspec-fixtures.js';

describe('Validation Schemas', () => {
  describe('ScenarioSchema', () => {
    it('should validate a valid scenario', () => {
      const scenario = {
        rawText: 'Given a user is logged in\nWhen they click logout\nThen they are redirected to login page',
      };
      
      const result = ScenarioSchema.safeParse(scenario);
      expect(result.success).toBe(true);
    });

    it('should reject scenario with empty text', () => {
      const scenario = {
        rawText: '',
      };
      
      const result = ScenarioSchema.safeParse(scenario);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Scenario text cannot be empty');
      }
    });
  });

  describe('RequirementSchema', () => {
    it('should validate a valid requirement', () => {
      const requirement = {
        text: 'The system SHALL provide user authentication',
        scenarios: [
          {
            rawText: 'Given a user with valid credentials\nWhen they submit the login form\nThen they are authenticated',
          },
        ],
      };
      
      const result = RequirementSchema.safeParse(requirement);
      expect(result.success).toBe(true);
    });

    it('no longer enforces SHALL or MUST at the schema level (moved to the validator)', () => {
      // SHALL/MUST body-keyword enforcement moved out of the Zod refine and into
      // Validator.applySpecRules so it can recover the requirement header and
      // emit the targeted body-keyword hint (#1156). The schema therefore accepts
      // a body without the keyword; the validator (exercised below) reports it.
      const requirement = {
        text: 'The system provides user authentication',
        scenarios: [
          {
            rawText: 'Given a user\nWhen they login\nThen authenticated',
          },
        ],
      };

      const result = RequirementSchema.safeParse(requirement);
      expect(result.success).toBe(true);
    });

    it('should reject requirement without scenarios', () => {
      const requirement = {
        text: 'The system SHALL provide user authentication',
        scenarios: [],
      };
      
      const result = RequirementSchema.safeParse(requirement);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Requirement must have at least one scenario');
      }
    });
  });

  describe('SpecSchema', () => {
    it('should validate a valid spec', () => {
      const spec = {
        name: 'user-auth',
        overview: 'This spec defines user authentication requirements',
        requirements: [
          {
            text: 'The system SHALL provide user authentication',
            scenarios: [
              {
                rawText: 'Given a user with valid credentials\nWhen they submit the login form\nThen they are authenticated',
              },
            ],
          },
        ],
      };
      
      const result = SpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it('should reject spec without requirements', () => {
      const spec = {
        name: 'user-auth',
        overview: 'This spec defines user authentication requirements',
        requirements: [],
      };
      
      const result = SpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Spec must have at least one requirement');
      }
    });
  });

  describe('ChangeSchema', () => {
    it('should validate a valid change', () => {
      const change = {
        name: 'add-user-auth',
        why: 'We need user authentication to secure the application and protect user data',
        whatChanges: 'Add authentication module with login and logout capabilities',
        deltas: [
          {
            spec: 'user-auth',
            operation: 'ADDED',
            description: 'Add new user authentication spec',
          },
        ],
      };
      
      const result = ChangeSchema.safeParse(change);
      expect(result.success).toBe(true);
    });

    it('should reject change with short why section', () => {
      const change = {
        name: 'add-user-auth',
        why: 'Need auth',
        whatChanges: 'Add authentication',
        deltas: [
          {
            spec: 'user-auth',
            operation: 'ADDED',
            description: 'Add auth',
          },
        ],
      };
      
      const result = ChangeSchema.safeParse(change);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Why section must be at least 50 characters');
      }
    });

    it('should warn about too many deltas', () => {
      const deltas = Array.from({ length: 11 }, (_, i) => ({
        spec: `spec-${i}`,
        operation: 'ADDED' as const,
        description: `Add spec ${i}`,
      }));
      
      const change = {
        name: 'massive-change',
        why: 'This is a massive change that affects many parts of the system',
        whatChanges: 'Update everything',
        deltas,
      };
      
      const result = ChangeSchema.safeParse(change);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Consider splitting changes with more than 10 deltas');
      }
    });
  });
});

const PURPOSE = 'This specification defines the requirements for user authentication in the system.';

describe('Validator', () => {
  const testDir = path.join(process.cwd(), 'test-validation-tmp');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function writeSpecFile(content: string): Promise<string> {
    const specPath = path.join(testDir, 'specs', 'auth', 'spec.feature');
    await fs.mkdir(path.dirname(specPath), { recursive: true });
    await fs.writeFile(specPath, content);
    return specPath;
  }

  /** Writes `content` as the change's specs/<capability>/spec.feature and returns the change dir. */
  async function writeDelta(content: string, capability = 'test-spec', change = 'change'): Promise<string> {
    const changeDir = path.join(testDir, change);
    const specDir = path.join(changeDir, 'specs', ...capability.split('/'));
    await fs.mkdir(specDir, { recursive: true });
    await fs.writeFile(path.join(specDir, 'spec.feature'), content);
    return changeDir;
  }

  const delta = (...rules: string[]) => `Feature: Test spec\n\n${rules.join('\n\n')}\n`;

  describe('validateSpec', () => {
    it('should validate a valid spec file', async () => {
      const specPath = await writeSpecFile(
        featureSpec('User authentication', PURPOSE, [
          {
            id: 'REQ-0001',
            name: 'Secure login',
            statement: 'The system SHALL provide secure user authentication mechanisms.',
            scenarios: [
              {
                name: 'Successful login',
                steps: ['Given a user with valid credentials', 'When they submit the login form', 'Then they are authenticated'],
              },
            ],
          },
          {
            id: 'REQ-0002',
            name: 'Invalid login attempts',
            statement: 'The system SHALL gracefully handle incorrect credentials.',
          },
        ])
      );

      const report = await new Validator().validateSpec(specPath);

      expect(report.issues).toEqual([]);
      expect(report.valid).toBe(true);
    });

    it('flags requirement statements only after the documented length limit', async () => {
      const requirementPrefix = 'The system SHALL ';
      const validateLength = (length: number) =>
        new Validator().validateSpecContent(
          'auth',
          featureSpec('Auth', PURPOSE, [
            {
              id: 'REQ-0001',
              name: 'Long',
              statement: `${requirementPrefix}${'x'.repeat(length - requirementPrefix.length)}`,
            },
          ])
        );

      const atLimit = await validateLength(MAX_REQUIREMENT_TEXT_LENGTH);
      const overLimit = await validateLength(MAX_REQUIREMENT_TEXT_LENGTH + 1);

      expect(atLimit.issues).toEqual([]);
      expect(overLimit.issues).toContainEqual(
        expect.objectContaining({ level: 'WARNING', message: VALIDATION_MESSAGES.REQUIREMENT_TOO_LONG })
      );
    });

    it('fails strict validation, but not normal validation, on an overlong requirement (#1976)', async () => {
      const content = featureSpec('Auth', PURPOSE, [
        { id: 'REQ-0001', name: 'Long', statement: `The system SHALL ${'x'.repeat(MAX_REQUIREMENT_TEXT_LENGTH)}` },
      ]);

      expect((await new Validator().validateSpecContent('auth', content)).valid).toBe(true);
      expect((await new Validator(true).validateSpecContent('auth', content)).valid).toBe(false);
    });

    it('should detect a missing purpose (feature description)', async () => {
      const report = await new Validator().validateSpecContent(
        'auth',
        featureSpec('Auth', '', [{ id: 'REQ-0001', name: 'Login' }])
      );

      expect(report.valid).toBe(false);
      expect(report.issues.map((issue) => issue.message)).toContain(VALIDATION_MESSAGES.SPEC_PURPOSE_EMPTY);
    });

    it('reports a Gherkin syntax error with its line', async () => {
      const report = await new Validator().validateSpecContent(
        'auth',
        'Feature: Auth\n  Purpose text that is long enough.\n\n  Scenario: One\n    When it runs\n\nFeature: Again\n'
      );

      expect(report.valid).toBe(false);
      expect(report.issues[0]).toEqual(
        expect.objectContaining({
          level: 'ERROR',
          line: expect.any(Number),
          message: expect.stringContaining('Gherkin syntax error'),
        })
      );
    });

    it('reports a file with no Feature line with an example of the format', async () => {
      const report = await new Validator().validateSpecContent('auth', '# Only a comment\n');

      expect(report.valid).toBe(false);
      expect(report.issues[0].message).toContain(VALIDATION_MESSAGES.GUIDE_MISSING_SPEC_SECTIONS);
    });

    it('should error on delta tags inside a main spec', async () => {
      const report = await new Validator().validateSpecContent(
        'auth',
        featureSpec('Auth', PURPOSE, [{ id: 'REQ-0001', name: 'Login', tags: ['added'] }])
      );

      expect(report.valid).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          level: 'ERROR',
          line: 5,
          message: expect.stringContaining('carries the delta tag @added'),
        })
      );
    });

    it('errors on a rule with no ID, and points at "openspec ids assign"', async () => {
      const report = await new Validator().validateSpecContent('auth', featureSpec('Auth', PURPOSE, [{ name: 'Login' }]));

      expect(report.valid).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          level: 'ERROR',
          path: 'requirements[0]',
          message: `Requirement "Login" has no requirement ID. ${VALIDATION_MESSAGES.GUIDE_ASSIGN_IDS}`,
        })
      );
    });

    it('errors on a rule with two IDs and on an ID used twice', async () => {
      const report = await new Validator().validateSpecContent(
        'auth',
        featureSpec('Auth', PURPOSE, [
          { id: 'REQ-0001', name: 'Login', tags: ['REQ-0009'] },
          { id: 'REQ-0002', name: 'Logout' },
          { id: 'REQ-0002', name: 'Session' },
        ])
      );

      const messages = report.issues.map((issue) => issue.message);
      expect(messages).toContainEqual(expect.stringContaining('has more than one requirement ID (REQ-0009, REQ-0001)'));
      expect(messages).toContainEqual(expect.stringContaining('Requirement ID REQ-0002 is used more than once'));
    });

    it('errors on a scenario outside every rule', async () => {
      const content = [
        'Feature: Auth',
        `  ${PURPOSE}`,
        '',
        '  Scenario: Loose',
        '    When it runs',
        '    Then it works',
        '',
        featureRule({ id: 'REQ-0001', name: 'Login' }),
        '',
      ].join('\n');

      const report = await new Validator().validateSpecContent('auth', content);

      expect(report.issues).toContainEqual(
        expect.objectContaining({
          level: 'ERROR',
          line: 4,
          message: expect.stringContaining('Scenario "Loose" is outside every Rule'),
        })
      );
    });

    it('errors on a scenario with no steps and warns on one with no Then', async () => {
      const report = await new Validator().validateSpecContent(
        'auth',
        featureSpec('Auth', PURPOSE, [
          {
            id: 'REQ-0001',
            name: 'Login',
            scenarios: [
              { name: 'Empty', steps: [] },
              { name: 'No outcome', steps: ['When it runs'] },
            ],
          },
        ])
      );

      expect(report.issues).toContainEqual(
        expect.objectContaining({ level: 'ERROR', message: expect.stringContaining('scenario "Empty" has no steps') })
      );
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          level: 'WARNING',
          message: expect.stringContaining('scenario "No outcome" has no "Then" step'),
        })
      );
    });

    it('rejects a requirement with no scenario, with an example of where scenarios go', async () => {
      const content = [
        'Feature: Auth',
        `  ${PURPOSE}`,
        '',
        '  @REQ-0001',
        '  Rule: Login',
        '    The system SHALL log users in.',
        '',
      ].join('\n');

      const report = await new Validator().validateSpecContent('auth', content);

      expect(report.valid).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          level: 'WARNING',
          path: 'requirements[0].scenarios',
          message: expect.stringContaining(VALIDATION_MESSAGES.REQUIREMENT_NO_SCENARIOS),
        })
      );
    });

    it('ignores comments and Gherkin examples inside doc strings', async () => {
      const content = [
        'Feature: Auth',
        `  ${PURPOSE}`,
        '',
        '  # A comment that says @added is not a tag.',
        '  @REQ-0001',
        '  Rule: Login',
        '    The system SHALL log users in.',
        '',
        '    Scenario: Example file',
        '      Given a delta file:',
        '        """',
        '        @added',
        '        Rule: Not a rule',
        '        """',
        '      Then it works',
        '',
      ].join('\n');

      const report = await new Validator(true).validateSpecContent('auth', content);

      expect(report.issues).toEqual([]);
    });
  });

  describe('validateChange', () => {
    it('should validate a valid change file', async () => {
      const changeContent = `# Add User Authentication

## Why
We need to implement user authentication to secure the application and protect user data from unauthorized access.

## What Changes
- **user-auth:** Add new user authentication specification
- **api-endpoints:** Modify to include auth endpoints`;

      const changePath = path.join(testDir, 'change.md');
      await fs.writeFile(changePath, changeContent);

      const report = await new Validator().validateChange(changePath);

      expect(report.valid).toBe(true);
      expect(report.summary.errors).toBe(0);
    });

    it('should detect missing why section', async () => {
      const changeContent = `# Add User Authentication

## What Changes
- **user-auth:** Add new user authentication specification`;

      const changePath = path.join(testDir, 'change.md');
      await fs.writeFile(changePath, changeContent);

      const report = await new Validator().validateChange(changePath);

      expect(report.valid).toBe(false);
      expect(report.issues.some((i) => i.message.includes('Why'))).toBe(true);
    });
  });

  describe('strict mode', () => {
    const briefSpec = featureSpec('Test', 'Brief overview', [{ id: 'REQ-0001', name: 'Something' }]);

    it('should fail on warnings in strict mode', async () => {
      const report = await new Validator(true).validateSpec(await writeSpecFile(briefSpec));

      expect(report.valid).toBe(false);
    });

    it('should pass warnings in non-strict mode', async () => {
      const report = await new Validator(false).validateSpec(await writeSpecFile(briefSpec));

      expect(report.valid).toBe(true);
      expect(report.summary.warnings).toBeGreaterThan(0);
    });
  });

  describe('validateChangeDeltaSpecs requirement length (#1976)', () => {
    const requirementPrefix = 'The system SHALL ';
    const writeLong = (name: string, operation: 'added' | 'modified', length: number) =>
      writeDelta(
        delta(
          featureRule({
            id: 'REQ-0001',
            tags: [operation],
            name: 'Long',
            statement: `${requirementPrefix}${'x'.repeat(length - requirementPrefix.length)}`,
            scenarios: [
              { name: 'Long is checked', steps: ['When the change is validated', 'Then the length finding is reported'] },
            ],
          })
        ),
        'test-spec',
        name
      );

    it('fails strict, but not normal, validation on an overlong @added requirement', async () => {
      const changeDir = await writeLong('added-long', 'added', MAX_REQUIREMENT_TEXT_LENGTH + 1);

      const normal = await new Validator().validateChangeDeltaSpecs(changeDir);
      const strict = await new Validator(true).validateChangeDeltaSpecs(changeDir);

      expect(normal.valid).toBe(true);
      expect(strict.valid).toBe(false);
      expect(strict.issues).toEqual([
        expect.objectContaining({
          level: 'WARNING',
          message: `@added "Long": ${VALIDATION_MESSAGES.REQUIREMENT_TOO_LONG}`,
        }),
      ]);
    });

    it('accepts an @added requirement at the limit', async () => {
      const changeDir = await writeLong('added-at-limit', 'added', MAX_REQUIREMENT_TEXT_LENGTH);

      const strict = await new Validator(true).validateChangeDeltaSpecs(changeDir);

      expect(strict.issues).toEqual([]);
      expect(strict.valid).toBe(true);
    });

    it('does not flag an overlong @modified requirement, which keeps the existing text whole', async () => {
      const changeDir = await writeLong('modified-long', 'modified', MAX_REQUIREMENT_TEXT_LENGTH + 1);

      const strict = await new Validator(true).validateChangeDeltaSpecs(changeDir);

      expect(strict.issues.map((i) => i.message)).not.toContainEqual(
        expect.stringContaining(VALIDATION_MESSAGES.REQUIREMENT_TOO_LONG)
      );
    });
  });

  describe('validateChangeDeltaSpecs', () => {
    it('accepts one rule of each operation', async () => {
      const changeDir = await writeDelta(
        delta(
          featureRule({ tags: ['added'], id: 'REQ-0003', name: 'New' }),
          featureRule({ tags: ['modified'], id: 'REQ-0001', name: 'Changed' }),
          '  @removed @REQ-0002\n  Rule: Gone\n    No longer needed.'
        )
      );

      const report = await new Validator(true).validateChangeDeltaSpecs(changeDir);

      expect(report.issues).toEqual([]);
      expect(report.valid).toBe(true);
    });

    it('accepts a @removed rule with no statement and no scenario', async () => {
      const changeDir = await writeDelta(delta('  @removed @REQ-0002\n  Rule: Gone'));

      const report = await new Validator(true).validateChangeDeltaSpecs(changeDir);

      expect(report.issues).toEqual([]);
    });

    it('errors on a rule with no operation tag', async () => {
      const changeDir = await writeDelta(delta(featureRule({ id: 'REQ-0001', name: 'Untagged' })));

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.valid).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          path: 'test-spec/spec.feature',
          line: 4,
          message: 'Rule "Untagged" has no operation tag. Tag it @added, @modified or @removed.',
        })
      );
    });

    it('errors on a rule with two operation tags', async () => {
      const changeDir = await writeDelta(
        delta(featureRule({ tags: ['added', 'modified'], id: 'REQ-0001', name: 'Both' }))
      );

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.issues.map((i) => i.message)).toContainEqual(
        'Rule "Both" has more than one operation tag (@added, @modified). Keep one.'
      );
    });

    it('errors on a delta rule with no ID and names the command that gives one', async () => {
      const changeDir = await writeDelta(delta(featureRule({ tags: ['added'], name: 'New' })));

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.valid).toBe(false);
      expect(report.issues.map((i) => i.message)).toContainEqual(
        'Rule "New" has no requirement ID. Run "openspec ids assign <change>" to give it one.'
      );
    });

    it('errors on the same ID twice in one delta', async () => {
      const changeDir = await writeDelta(
        delta(
          featureRule({ tags: ['modified'], id: 'REQ-0001', name: 'One' }),
          featureRule({ tags: ['added'], id: 'REQ-0001', name: 'Two' })
        )
      );

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.issues.map((i) => i.message)).toContainEqual(
        expect.stringContaining('Requirement REQ-0001 appears more than once in this delta')
      );
    });

    it('should fail when a delta spec.feature sits directly under specs/', async () => {
      const changeDir = path.join(testDir, 'root-level');
      await fs.mkdir(path.join(changeDir, 'specs'), { recursive: true });
      await fs.writeFile(
        path.join(changeDir, 'specs', 'spec.feature'),
        delta(featureRule({ tags: ['added'], id: 'REQ-0001', name: 'Root' }))
      );

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.valid).toBe(false);
      expect(report.issues[0].message).toContain('specs/<capability-path>/spec.feature');
      expect(report.issues.map((i) => i.message)).not.toContainEqual(expect.stringContaining('No deltas found'));
    });

    it('should accept a capability folder that is literally named spec.feature', async () => {
      const changeDir = await writeDelta(
        delta(featureRule({ tags: ['added'], id: 'REQ-0001', name: 'Odd folder' })),
        'spec.feature'
      );

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.issues).toEqual([]);
      expect(report.valid).toBe(true);
    });

    it('discovers and validates deltas in a nested specs/<area>/<capability> layout (#1182b)', async () => {
      const changeDir = await writeDelta(
        delta(featureRule({ tags: ['added'], id: 'REQ-0001', name: 'Nested' })),
        'platform/session-layout'
      );

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.issues).toEqual([]);
      expect(report.valid).toBe(true);
    });

    it('reports a nested delta problem under its nested path', async () => {
      const changeDir = await writeDelta(
        delta(featureRule({ id: 'REQ-0001', name: 'Untagged' })),
        'platform/session-layout'
      );

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.issues[0].path).toBe('platform/session-layout/spec.feature');
    });

    it('points a markdown delta at "openspec convert-specs"', async () => {
      const changeDir = path.join(testDir, 'legacy');
      await fs.mkdir(path.join(changeDir, 'specs', 'auth'), { recursive: true });
      await fs.writeFile(
        path.join(changeDir, 'specs', 'auth', 'spec.md'),
        '## ADDED Requirements\n\n### Requirement: Login\nThe system SHALL log in.\n\n#### Scenario: Works\n- **WHEN** x\n- **THEN** y\n'
      );

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.valid).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          level: 'ERROR',
          path: 'auth/spec.md',
          message: expect.stringContaining('run "openspec convert-specs"'),
        })
      );
    });

    it('errors on a delta file with no rule', async () => {
      const changeDir = await writeDelta('Feature: Test spec\n  Only notes.\n');

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.issues.map((i) => i.message)).toContainEqual(expect.stringContaining('No delta rules found'));
    });

    it('errors on a change with no specs at all', async () => {
      const changeDir = path.join(testDir, 'empty');
      await fs.mkdir(changeDir, { recursive: true });

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.valid).toBe(false);
      expect(report.issues[0].message).toContain(VALIDATION_MESSAGES.CHANGE_NO_DELTAS);
    });

    it('should fail strict validation when requirement text lacks SHALL/MUST', async () => {
      const changeDir = await writeDelta(
        delta(featureRule({ tags: ['added'], id: 'REQ-0001', name: 'Plain', statement: 'The system logs users in.' }))
      );

      const normal = await new Validator().validateChangeDeltaSpecs(changeDir);
      const strict = await new Validator(true).validateChangeDeltaSpecs(changeDir);

      expect(normal.valid).toBe(true);
      expect(strict.valid).toBe(false);
      expect(strict.issues).toEqual([
        expect.objectContaining({
          level: 'WARNING',
          message: '@added "Plain" should contain SHALL or MUST (RFC 2119 best practice for English specs)',
        }),
      ]);
    });

    for (const operation of ['added', 'modified'] as const) {
      it(`should keep a missing requirement statement as an error for @${operation} rules`, async () => {
        const changeDir = await writeDelta(
          delta(`  @${operation} @REQ-0001\n  Rule: No statement\n\n    Scenario: Works\n      When it runs\n      Then it works`)
        );

        const report = await new Validator().validateChangeDeltaSpecs(changeDir);

        expect(report.valid).toBe(false);
        expect(report.issues).toContainEqual(
          expect.objectContaining({
            level: 'ERROR',
            message: `@${operation} "No statement" is missing its requirement statement (the text under "Rule:")`,
          })
        );
      });

      it(`should hint the author when a @${operation} rule only has SHALL/MUST in its name`, async () => {
        const changeDir = await writeDelta(
          delta(
            featureRule({ tags: [operation], id: 'REQ-0001', name: 'The system SHALL log in', statement: 'Users sign in.' })
          )
        );

        const report = await new Validator().validateChangeDeltaSpecs(changeDir);

        expect(report.issues).toContainEqual(
          expect.objectContaining({
            level: 'WARNING',
            message: expect.stringContaining('in the requirement statement, not only in the rule name'),
          })
        );
      });
    }

    it('errors on an @added rule with no scenario', async () => {
      const changeDir = await writeDelta(delta('  @added @REQ-0001\n  Rule: Lonely\n    The system SHALL be alone.'));

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.issues.map((i) => i.message)).toContain('@added "Lonely" must include at least one scenario');
    });

    it('does not count a scenario tagged @removed toward the required scenario', async () => {
      const changeDir = await writeDelta(
        delta(
          [
            '  @modified @REQ-0001',
            '  Rule: Changed',
            '    The system SHALL change.',
            '',
            '    @removed',
            '    Scenario: Old',
            '      When it ran',
            '      Then it worked',
          ].join('\n')
        )
      );

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.issues.map((i) => i.message)).toContain('@modified "Changed" must include at least one scenario');
    });

    it('warns that a Background and a loose scenario are not carried into the main spec', async () => {
      const changeDir = await writeDelta(
        [
          'Feature: Test spec',
          '',
          '  Background:',
          '    Given a user',
          '',
          '  Scenario: Loose',
          '    When it runs',
          '    Then it works',
          '',
          featureRule({ tags: ['added'], id: 'REQ-0001', name: 'New' }),
          '',
        ].join('\n')
      );

      const report = await new Validator().validateChangeDeltaSpecs(changeDir);

      expect(report.valid).toBe(true);
      expect(report.issues.map((i) => i.message)).toEqual([
        expect.stringContaining('The feature Background is not carried into the main spec'),
        expect.stringContaining('Scenario "Loose" is outside every Rule'),
      ]);
    });
  });

  describe('main-spec SHALL/MUST statement hint (#1156)', () => {
    const validate = (statement: string, name = 'Login') =>
      new Validator().validateSpecContent('auth', featureSpec('Auth', PURPOSE, [{ id: 'REQ-0001', name, statement }]));

    it('emits the targeted hint when the keyword is only in the rule name', async () => {
      const report = await validate('Users sign in with a password.', 'The system SHALL log users in');

      expect(report.issues).toEqual([
        expect.objectContaining({
          level: 'WARNING',
          message: expect.stringContaining('Move the SHALL/MUST statement to the text under the "Rule: ..." line.'),
        }),
      ]);
    });

    it('keeps generic missing-keyword guidance when neither name nor statement has the keyword', async () => {
      const report = await validate('Users sign in with a password.');

      expect(report.issues).toEqual([
        expect.objectContaining({
          level: 'WARNING',
          message: 'Requirement "Login" should contain SHALL or MUST (RFC 2119 best practice for English specs)',
        }),
      ]);
    });

    it('allows non-English requirement text in normal mode and warns about English keywords', async () => {
      const report = await validate('El sistema DEBE autenticar a los usuarios.');

      expect(report.valid).toBe(true);
      expect(report.summary.warnings).toBe(1);
    });

    it('does not flag a statement that contains the keyword', async () => {
      const report = await validate('The system MUST log users in.');

      expect(report.issues).toEqual([]);
    });

    it('rejects a lowercase shall/must (matching the delta path)', async () => {
      const report = await validate('The system must log users in.');

      expect(report.summary.warnings).toBe(1);
    });

    it('does not treat a SHALL inside a word as the keyword', async () => {
      const report = await validate('The marshall logs users in.');

      expect(report.summary.warnings).toBe(1);
    });

    it('reads a statement over several lines as one', async () => {
      const report = await validate('Users sign in with a password,\nand the system SHALL lock the account after five failures.');

      expect(report.issues).toEqual([]);
    });
  });
});
