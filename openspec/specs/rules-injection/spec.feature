Feature: rules-injection
  Define how per-artifact rules from project config are injected into generated instructions with deterministic formatting and validation.

  @REQ-0206
  Rule: Inject rules only for matching artifact
    The system SHALL inject rules from config into instructions only when the artifact ID matches a key in the rules object.

    Scenario: Rules exist for the artifact
      When loading instructions for "proposal" and config has `rules: { proposal: ["Rule 1", "Rule 2"] }`
      Then instruction output includes rules section with both rules

    Scenario: No rules for the artifact
      When loading instructions for "design" and config has `rules: { proposal: [...] }`
      Then instruction output does not include `<rules>` tags

    Scenario: Rules object is undefined
      When config omits the rules field or rules is undefined
      Then instruction output does not include `<rules>` tags for any artifact

    Scenario: Rules array is empty for artifact
      When config has `rules: { proposal: [] }`
      Then instruction output does not include `<rules>` tags

  @REQ-0207
  Rule: Format rules with XML-style tags and bullet list
    The system SHALL wrap rules in `<rules>` tags with each rule as a bulleted list item.

    Scenario: Single rule for artifact
      When config has `rules: { proposal: ["Include rollback plan"] }`
      Then instruction output includes `<rules>\n- Include rollback plan\n</rules>\n\n`

    Scenario: Multiple rules for artifact
      When config has `rules: { proposal: ["Rule 1", "Rule 2", "Rule 3"] }`
      Then instruction output includes each rule as separate bullet point

    Scenario: Rules appear after context and before template
      When instructions are generated with both context and rules
      Then order is `<context>` then `<rules>` then `<template>`

  @REQ-0208
  Rule: Preserve rule text exactly as provided
    The system SHALL inject rule text without modification, escaping, or interpretation.

    Scenario: Rule contains markdown
      When rule includes markdown like "Use **Given/When/Then** format"
      Then markdown is preserved in the injected content

    Scenario: Rule contains special characters
      When rule includes characters like `<`, `>`, quotes
      Then characters are preserved exactly as written

    Scenario: Rule is multi-line string
      When rule text contains line breaks
      Then line breaks are preserved within the bullet point

  @REQ-0209
  Rule: Support multiple artifacts with different rules
    The system SHALL allow different rule sets for different artifacts in the same config.

    Scenario: Multiple artifacts have rules
      When config has `rules: { proposal: ["P1"], specs: ["S1", "S2"], tasks: ["T1"] }`
      Then proposal instructions show only ["P1"], specs show only ["S1", "S2"], tasks show only ["T1"]

    Scenario: Some artifacts have rules, others do not
      When config has rules for proposal and specs only
      Then design and tasks instructions have no `<rules>` section

  @REQ-0210
  Rule: Rules are additive to schema guidance
    The system SHALL add config rules to the schema's built-in artifact instruction, not replace it.

    Scenario: Artifact has schema instruction and config rules
      When artifact has built-in instruction from schema and config provides rules
      Then final instruction contains both schema guidance and config rules

    Scenario: Rules provide additional constraints
      When schema says "create proposal" and config rules say "include rollback plan"
      Then agent sees both the schema template and the additional rule

  @REQ-0211
  Rule: Validate artifact IDs during instruction loading
    The system SHALL validate artifact IDs in rules against the schema when instructions are loaded and emit warnings for unknown IDs.

    Scenario: All artifact IDs are valid
      When instructions loaded and config has `rules: { proposal: [...], specs: [...] }` for schema with those artifacts
      Then no validation warnings are emitted

    Scenario: Unknown artifact ID in rules
      When instructions loaded and config has `rules: { unknownartifact: [...] }`
      Then warning emitted: "Unknown artifact ID in rules: 'unknownartifact'. Valid IDs for schema 'spec-driven': design, proposal, specs, tasks"

    Scenario: Multiple unknown artifact IDs
      When instructions loaded and config has multiple unknown artifact IDs
      Then separate warning emitted for each unknown artifact ID

    Scenario: Validation warnings shown once per session
      When instructions loaded multiple times in same CLI session
      Then each unique validation warning is shown only once (cached)
