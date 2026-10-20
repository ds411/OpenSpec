Feature: Update Command

  @added @REQ-0266
  Rule: Update install scope selection
    The update command SHALL support install scope selection for sync operations.

    Scenario: Scope defaults to global config value
      When user runs `openspec update` without explicit scope override
      Then update SHALL use configured install scope
      And if unset, SHALL resolve migration-aware default (`global` for newly created configs, `project` for legacy schema-evolved configs)

    Scenario: Scope override via flag
      When user runs `openspec update --scope project`
      Then update SHALL use `project` as preferred scope for that run

  @added @REQ-0267
  Rule: Scope-aware sync and drift detection
    The update command SHALL evaluate configured state and drift using effective scoped paths.

    Scenario: Scoped drift detection
      When update evaluates whether tools are up-to-date
      Then it SHALL inspect files at effective scoped targets for each tool/surface
      And SHALL compare current resolved scope against last successful effective scope for each tool/surface
      And SHALL treat a difference as sync-required drift

    Scenario: Scope fallback during update
      When preferred scope is unsupported for a configured tool/surface
      And alternate scope is supported
      Then update SHALL apply fallback scope resolution
      And SHALL report fallback in output

    Scenario: Unsupported scope during update
      When configured tool/surface supports neither preferred nor alternate scope
      Then scope support SHALL be validated for all configured tools/surfaces before any write
      And update SHALL fail without performing file writes when incompatibilities are detected
      And SHALL report incompatible tools with remediation steps
