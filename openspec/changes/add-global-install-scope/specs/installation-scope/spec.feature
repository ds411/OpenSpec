Feature: installation-scope
  Define the install scope model for OpenSpec-generated skills and commands, including scope preference, effective scope resolution, and fallback/error semantics.

  @added @REQ-0269
  Rule: Install scope preference model
    The system SHALL support a user-level install scope preference with values `global` and `project`.

    Scenario: Default install scope
      When install scope is not explicitly configured
      Then the system SHALL resolve a migration-aware default:
      And use `global` for newly created configs
      And use `project` for legacy schema-evolved configs until explicit migration

    Scenario: Explicit install scope
      When user configures install scope to `project`
      Then generation and update flows SHALL use `project` as the preferred scope

  @added @REQ-0270
  Rule: Effective scope resolution by tool surface
    The system SHALL compute effective scope per tool surface (skills, commands) based on preferred scope and tool capability support.

    Scenario: Preferred scope is supported
      When preferred scope is supported for a tool surface
      Then the system SHALL use that scope as the effective scope

    Scenario: Preferred scope is unsupported but alternate is supported
      When preferred scope is not supported for a tool surface
      And the alternate scope is supported
      Then the system SHALL use the alternate scope as effective scope
      And SHALL record a fallback note for user-facing output

    Scenario: No supported scope
      When neither `global` nor `project` is supported for a tool surface
      Then the command SHALL fail before writing files
      And SHALL display actionable remediation

  @added @REQ-0271
  Rule: Effective scope reporting
    The system SHALL report effective scope decisions in command output when they differ from the preferred scope.

    Scenario: Fallback reporting
      When fallback resolution occurs for any selected/configured tool surface
      Then init/update summaries SHALL include effective scope notes per affected tool

  @added @REQ-0272
  Rule: Cross-platform path behavior
    Install scope resolution SHALL produce platform-correct target paths.

    Scenario: Global scope path on Windows
      When effective scope is `global`
      And the command runs on Windows
      Then resolved target paths SHALL use Windows path conventions and separators
      And SHALL NOT reuse POSIX-style home-relative defaults directly

  @added @REQ-0273
  Rule: Cleanup safety for scope transitions
    Scope transitions SHALL update new targets first and clean old managed targets safely.

    Scenario: Automatic cleanup for managed files on scope change
      When update or init applies a scope transition for a configured tool/surface
      Then the system SHALL write new artifacts in the new effective scope before cleanup
      And SHALL automatically remove only OpenSpec-managed files in the previous effective scope

    Scenario: Cleanup scope boundaries
      When cleanup runs after a scope transition
      Then the system SHALL leave non-managed files untouched
      And SHALL limit removal scope to the affected tool/workflow-managed paths

    Scenario: Cleanup failure after successful writes
      When new artifacts were written successfully in the new scope
      And cleanup of old managed targets fails
      Then the command SHALL report failure with leftover cleanup paths
      And SHALL NOT rollback successfully written new-scope artifacts
