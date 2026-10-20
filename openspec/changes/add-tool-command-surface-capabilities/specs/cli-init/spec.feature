Feature: CLI Init

  @added @REQ-0278
  Rule: Command surface capability resolution
    The init command SHALL resolve each selected tool's command surface using explicit metadata first, then deterministic inference.

    Scenario: Explicit command surface override
      When a tool declares an explicit command-surface capability
      Then init SHALL use that explicit capability
      And SHALL NOT override it based on adapter presence

    Scenario: Inferred command surface from adapter presence
      When a tool does not declare an explicit command-surface capability
      And a command adapter is registered for the tool
      Then init SHALL infer `adapter` as the command surface

    Scenario: Inferred command surface for skills-only tool
      When a tool does not declare an explicit command-surface capability
      And no command adapter is registered for the tool
      And the tool has a configured `skillsDir`
      Then init SHALL infer `skills-invocable` as the command surface

    Scenario: Inferred command surface without adapter or skills
      When a tool does not declare an explicit command-surface capability
      And no command adapter is registered for the tool
      And the tool has no `skillsDir`
      Then init SHALL infer `none` as the command surface

  @added @REQ-0279
  Rule: Delivery compatibility by tool command surface
    The init command SHALL apply delivery settings using each tool's command surface capability, not adapter presence alone.

    Scenario: Both delivery for adapter-backed tool
      When user runs `openspec init` with a selected tool that has a command adapter
      And delivery is set to `both`
      Then the system SHALL generate command files for active workflows using that adapter
      And SHALL generate or refresh managed skills when the tool has `skillsDir`

    Scenario: Both delivery for skills-invocable tool
      When user runs `openspec init` with a selected tool whose command surface is `skills-invocable`
      And delivery is set to `both`
      Then the system SHALL generate or refresh managed skill directories when the tool has `skillsDir`
      And SHALL NOT require adapter-generated command files for that tool

    Scenario: Both delivery for none command surface
      When user runs `openspec init` with a selected tool whose command surface is `none`
      And delivery is set to `both`
      Then the system SHALL perform no command-surface artifact action for that tool
      And MAY emit a compatibility note indicating no command surface is available

    Scenario: Skills delivery for adapter-backed tool
      When user runs `openspec init` with a selected tool that has a command adapter
      And delivery is set to `skills`
      Then the system SHALL generate or refresh managed skill directories when the tool has `skillsDir`
      And SHALL remove managed adapter-generated command files for that tool

    Scenario: Skills delivery for skills-invocable tool
      When user runs `openspec init` with a selected tool whose command surface is `skills-invocable`
      And delivery is set to `skills`
      Then the system SHALL generate or refresh managed skill directories when the tool has `skillsDir`
      And SHALL NOT require adapter-generated command files for that tool

    Scenario: Skills delivery for none command surface
      When user runs `openspec init` with a selected tool whose command surface is `none`
      And delivery is set to `skills`
      Then the system SHALL perform no command-surface artifact action for that tool
      And MAY emit a compatibility note indicating no command surface is available

    Scenario: Commands delivery for adapter-backed tool
      When user runs `openspec init` with a selected tool that has a command adapter
      And delivery is set to `commands`
      Then the system SHALL generate command files for active workflows using that adapter
      And the system SHALL remove managed skill directories for that tool

    Scenario: Commands delivery for skills-invocable tool
      When user runs `openspec init` with a selected tool whose command surface is `skills-invocable`
      And delivery is set to `commands`
      Then the system SHALL generate or refresh managed skill directories for active workflows
      And the system SHALL NOT remove those managed skill directories as part of commands-only cleanup
      And the system SHALL NOT require a command adapter for that tool

    Scenario: Commands delivery for mixed tool selection
      When user runs `openspec init` with multiple tools
      And selected tools include both adapter-backed and skills-invocable command surfaces
      And delivery is set to `commands`
      Then the system SHALL apply commands-only behavior per tool capability
      And the resulting install SHALL include command files for adapter-backed tools and skills for skills-invocable tools

    Scenario: Commands delivery for unsupported command surface
      When user runs `openspec init` with a selected tool that has no command surface capability
      And delivery is set to `commands`
      Then the system SHALL fail before generating or deleting artifacts
      And the error SHALL list incompatible tool IDs and explain supported alternatives (`both` or `skills`)

    Scenario: Interactive handling for unsupported command surface
      When user runs `openspec init` interactively
      And delivery is set to `commands`
      And selected tools include one or more tools with command surface `none`
      Then the CLI SHALL show a compatibility error and return to the interactive selection flow for correction
      And SHALL not perform artifact writes until a valid selection is confirmed

  @added @REQ-0280
  Rule: Init compatibility signaling
    The init command SHALL clearly signal command-surface compatibility outcomes in both interactive and non-interactive flows.

    Scenario: Interactive compatibility note
      When init runs interactively
      And delivery is `commands`
      And selected tools include skills-invocable command surfaces
      Then the system SHALL display a compatibility note before the confirmation prompt indicating those tools will use skills as their command surface

    Scenario: Non-interactive compatibility summary for skills-invocable tools
      When init runs non-interactively (including `--tools` usage)
      And delivery is `commands`
      And selected tools include one or more `skills-invocable` command surfaces
      Then the command SHALL proceed with exit code 0
      And the command SHALL write deterministic compatibility summary lines to stdout indicating those tools will use managed skills as their command surface

    Scenario: Non-interactive compatibility failure
      When init runs non-interactively (including `--tools` usage)
      And delivery is `commands`
      And selected tools include any tool with no command surface capability
      Then the command SHALL exit with code 1
      And the command SHALL write deterministic, actionable guidance for resolving the selection to stderr
