Feature: CLI Init

  @added @REQ-0275
  Rule: Shared .agents target initialization
    `openspec init` SHALL accept the shared `agents` target wherever tool IDs are selected, and SHALL treat it as a skills-only tool.

    Scenario: Non-interactive selection of the shared target
      When the user runs `openspec init --tools agents`
      Then OpenSpec SHALL generate skills for the `agents` target
      And initialization SHALL NOT fail because `agents` has no registered command adapter

    Scenario: Shared agents target skips command-file generation
      Given the configured delivery includes command generation
      When the user selects the shared `agents` target during initialization
      Then command-file generation SHALL be skipped because no `agents` adapter is registered
      And `agents` SHALL be listed among the tools reported as having commands skipped
