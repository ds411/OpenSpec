Feature: cli-artifact-workflow

  @added @REQ-0297
  Rule: Apply instructions include current operation inputs
    The system SHALL include current project context and apply operation guidance as separate optional fields in schema-aware apply instruction output without changing existing apply state behavior.

    Scenario: Apply JSON contains context and guidance
      When a user runs `openspec instructions apply --change <id> --json`
      And config contains project context and `operations.apply.guidance`
      Then the JSON contains separate `context` and `operationGuidance` fields
      And preserves existing apply state, task, progress, context-file, reference, and root fields

    Scenario: Apply text contains context and guidance
      When a user runs `openspec instructions apply --change <id>` with configured context and apply guidance
      Then text output labels project context as a required instruction input
      And labels operation guidance as separate advisory input
      And preserves the built-in apply instruction content

    Scenario: Apply has artifact rules only
      When config contains artifact rules but no apply operation guidance
      Then apply instruction output does not expose artifact rules as operation guidance

    Scenario: Apply reads current config
      When config changes between two apply instruction calls
      Then the second output reflects the current context and apply guidance

    Scenario: Apply operation inputs are absent
      When config has no non-empty context or apply guidance
      Then apply output omits both optional fields
      And otherwise matches existing apply behavior
