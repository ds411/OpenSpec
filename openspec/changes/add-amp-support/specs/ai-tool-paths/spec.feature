Feature: ai-tool-paths

  @added @REQ-0253
  Rule: Amp skills integration
    OpenSpec SHALL expose Amp as a supported skills-only tool that uses Amp's project Agent Skills directory.

    Scenario: Selecting Amp
      When the user selects Amp in `openspec init` or passes `--tools amp`
      Then OpenSpec SHALL generate the active profile's skills under `.agents/skills/`
      And the generated skills SHALL use `/openspec-<skill>` references
      And OpenSpec SHALL NOT generate command files for Amp

    Scenario: Detecting an Amp project
      When a project contains an `.amp/` directory
      Then OpenSpec SHALL detect Amp as an available tool

    Scenario: Updating an Amp-owned skill tree
      Given `.agents/skills/.openspec-target` names `amp`
      When `openspec update` runs
      Then OpenSpec SHALL refresh the Amp skill tree through the shared skill generator

    Scenario: Sharing the Agent Skills directory
      When Amp is selected with another tool that writes `.agents/skills/`
      Then OpenSpec SHALL write one compatible skill tree rather than letting the tools overwrite each other
