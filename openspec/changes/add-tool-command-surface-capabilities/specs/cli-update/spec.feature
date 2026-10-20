Feature: Update Command

  @added @REQ-0281
  Rule: Delivery sync by command surface capability
    The update command SHALL synchronize artifacts using each configured tool's command surface capability.

    Scenario: Commands delivery for adapter-backed configured tool
      When user runs `openspec update`
      And delivery is set to `commands`
      And a configured tool has an adapter-backed command surface
      Then the system SHALL generate or refresh command files for active workflows
      And the system SHALL remove managed skill directories for that tool

    Scenario: Commands delivery for skills-invocable configured tool
      When user runs `openspec update`
      And delivery is set to `commands`
      And a configured tool has `skills-invocable` command surface capability
      Then the system SHALL generate or refresh managed skill directories for active workflows
      And the system SHALL NOT remove those managed skill directories as part of commands-only cleanup
      And the system SHALL NOT attempt to require adapter-generated command files for that tool

    Scenario: Commands delivery with unsupported command surface
      When user runs `openspec update`
      And delivery is set to `commands`
      And a configured tool has no command surface capability
      Then the system SHALL fail with exit code 1 before applying partial updates
      And the output SHALL identify incompatible tools and recommended remediation

  @added @REQ-0282
  Rule: Configured-tool detection for skills-invocable command surfaces
    The update command SHALL treat tools with skills-invocable command surfaces as configured when managed skill artifacts are present, including under commands delivery.

    Scenario: Skills-invocable tool under commands delivery
      When user runs `openspec update`
      And delivery is set to `commands`
      And a tool has no adapter-generated command files
      And that tool is marked `skills-invocable` and has managed skills installed
      Then the system SHALL include the tool in configured-tool detection
      And the system SHALL apply normal version/profile/delivery sync to that tool

  @added @REQ-0283
  Rule: Update summary reflects effective per-tool delivery
    The update command SHALL report effective artifact behavior when delivery intent and artifact type differ due to tool capability.

    Scenario: Summary for skills-invocable tools in commands delivery
      When update completes successfully
      And delivery is `commands`
      And at least one updated tool is `skills-invocable`
      Then output SHALL include a clear note that those tools use skills as their command surface
      And output SHALL avoid implying that command generation was skipped due to an error
