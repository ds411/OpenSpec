/**
 * Conversion from a parsed feature file to the tool-agnostic spec model that
 * `show --json`, `list`, `view` and validation read.
 */

import type { Requirement, Scenario, Spec } from '../schemas/index.js';
import { parseFeature, type FeatureDocument, type SpecRule, type SpecScenario } from './document.js';

export const SPEC_SYNTAX_ERROR_PREFIX = 'Gherkin syntax error';
export const SPEC_MISSING_FEATURE = 'Spec must have a "Feature:" line';

/** A scenario's steps as plain text, one `Keyword text` line per step. */
export function scenarioText(scenario: SpecScenario): string {
  return scenario.steps.map((step) => `${step.keyword} ${step.text}`.trim()).join('\n');
}

export function ruleToRequirement(rule: SpecRule): Requirement {
  return {
    ...(rule.id ? { id: rule.id } : {}),
    name: rule.name,
    // A rule with no statement still has a name; the name stands in so the
    // requirement reads as something rather than as an empty string. The
    // validator reports the missing statement on its own.
    text: rule.description || rule.name,
    scenarios: rule.scenarios.map(
      (scenario): Scenario => ({ name: scenario.name, rawText: scenarioText(scenario) })
    ),
  };
}

/**
 * The spec model of a parsed feature file. Throws when the file does not parse
 * or has no `Feature:`, since there is then no spec to describe.
 */
export function featureToSpec(document: FeatureDocument, specName: string): Spec {
  if (document.errors.length > 0) {
    const first = document.errors[0];
    throw new Error(`${SPEC_SYNTAX_ERROR_PREFIX} on line ${first.line}: ${first.message}`);
  }
  if (!document.feature) {
    throw new Error(SPEC_MISSING_FEATURE);
  }
  return {
    name: specName,
    overview: document.feature.description,
    requirements: document.rules.map(ruleToRequirement),
    metadata: {
      version: '1.0.0',
      format: 'openspec',
    },
  };
}

/** Parse and convert in one step. */
export function parseSpecContent(content: string, specName: string): Spec {
  return featureToSpec(parseFeature(content), specName);
}
