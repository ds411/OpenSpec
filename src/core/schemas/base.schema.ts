import { z } from 'zod';
import { VALIDATION_MESSAGES } from '../validation/constants.js';

export const ScenarioSchema = z.object({
  // Header text without `####`, the closing `#` run, and the `Scenario:`
  // prefix. Optional so objects built outside the parser still validate.
  name: z.string().optional(),
  rawText: z.string().min(1, VALIDATION_MESSAGES.SCENARIO_EMPTY),
});

export const RequirementSchema = z.object({
  // The stable requirement ID from the rule's tag (`@REQ-0001` → `REQ-0001`):
  // what archive matches MODIFIED and REMOVED entries against, and what code
  // traces cite.
  id: z.string().optional(),
  // The rule's name, without the `Rule:` keyword.
  name: z.string().optional(),
  // SHALL/MUST body-keyword enforcement lives in the imperative validator
  // (Validator.applySpecRules), not here: the parser collapses the requirement
  // header into `text`, so a Zod refine on `text` cannot tell "keyword in header
  // only" from "keyword in body" and emits a misleading generic error. The
  // validator recovers the header and emits the targeted hint for both the
  // main-spec and change-delta paths (#1156).
  text: z.string()
    .min(1, VALIDATION_MESSAGES.REQUIREMENT_EMPTY),
  scenarios: z.array(ScenarioSchema)
    .min(1, VALIDATION_MESSAGES.REQUIREMENT_NO_SCENARIOS),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
