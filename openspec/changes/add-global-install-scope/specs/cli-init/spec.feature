Feature: CLI Init

  @added @REQ-0264
  Rule: Init install scope selection
    The init command SHALL support install scope selection for generated artifacts.

    Scenario: Scope defaults to global
      When user runs `openspec init` without explicit scope override
      Then init SHALL use global config install scope
      And if unset, SHALL resolve migration-aware default (`global` for newly created configs, `project` for legacy schema-evolved configs)

    Scenario: Scope override via flag
      When user runs `openspec init --scope project`
      Then init SHALL use `project` as preferred scope for that run
      And SHALL NOT mutate persisted global config unless user explicitly changes config

  @added @REQ-0265
  Rule: Init uses effective scope resolution
    The init command SHALL resolve effective scope per tool surface before generating files.

    Scenario: Effective scope with fallback
      When selected tool/surface does not support preferred scope
      And supports alternate scope
      Then init SHALL generate files at alternate effective scope
      And SHALL display fallback note in summary

    Scenario: Unsupported scope selection
      When selected tool/surface supports neither preferred nor alternate scope
      Then init SHALL fail before writing files
      And SHALL provide clear error guidance
