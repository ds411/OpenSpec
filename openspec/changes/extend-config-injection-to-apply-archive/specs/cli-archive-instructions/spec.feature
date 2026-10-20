Feature: cli-archive-instructions

  @added @REQ-0294
  Rule: Provide current archive operation inputs
    The CLI SHALL provide `openspec instructions archive --change <name>` as a read-only workflow instruction surface for current archive operation inputs.

    Scenario: Archive JSON contains context and guidance
      When a user runs `openspec instructions archive --change <name> --json`
      And config contains project context and `operations.archive.guidance`
      Then the JSON contains `changeName`, `context`, and `operationGuidance` as separate fields
      And includes the normal resolved-root envelope

    Scenario: Archive text contains context and guidance
      When a user runs `openspec instructions archive --change <name>` with configured inputs
      Then text output labels project context as a required instruction input
      And labels operation guidance as separate advisory input

    Scenario: Archive inputs are absent
      When config has no non-empty context or archive guidance
      Then the command succeeds with change and root metadata
      And omits both optional fields

    Scenario: Archive reads current config
      When config changes between two archive instruction calls
      Then the second output reflects the current context and archive guidance

  @added @REQ-0295
  Rule: Scope archive inputs to a valid selected root
    The archive instruction surface SHALL require a valid change and use existing repo/store root selection before reading config.

    Scenario: Change is missing
      When the archive instruction command is called without `--change`
      Then it returns the existing actionable missing-change error

    Scenario: Change does not exist in the selected root
      When the supplied change is absent from the resolved repo or store
      Then the command fails before returning operation inputs

    Scenario: Store is selected
      When the command is run with a selected store
      Then change validation and config loading both use that store's planning root

  @added @REQ-0296
  Rule: Keep archive instructions read-only
    The archive instruction surface SHALL return runtime instruction inputs without performing archive execution work.

    Scenario: Archive instructions are requested
      When the command succeeds
      Then it does not inspect or rewrite delta specs
      And does not update main specs
      And does not move or otherwise modify the change
      And does not include the static archive workflow template in JSON output
