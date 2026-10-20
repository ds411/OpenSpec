Feature: CLI Init

  @added @REQ-0335
  Rule: Codex initialization uses the skills-invocable command surface
    `openspec init` SHALL treat Codex as a skills-invocable tool, not as an adapter-backed command-file tool.

    Scenario: Codex command surface resolution
      When a user runs `openspec init` and selects Codex
      Then the command SHALL resolve Codex command surface capability as `skills-invocable`
      And it SHALL apply delivery behavior through the shared command-surface capability model when that model is available
      And it SHALL NOT use a Codex-specific delivery predicate that duplicates command-surface capability rules

  @added @REQ-0336
  Rule: Codex initialization uses skills only
    `openspec init` SHALL configure Codex through generated OpenSpec skills without generating Codex custom prompt files.

    Scenario: Initializing Codex with default delivery
      When a user runs `openspec init` and selects Codex
      And the active delivery mode is `both`
      Then the command SHALL create the selected OpenSpec skill files under `.codex/skills/`
      And it SHALL NOT create Codex prompt files under `$CODEX_HOME/prompts` or the default Codex prompt directory

    Scenario: Initializing Codex with skills delivery
      When a user runs `openspec init` and selects Codex
      And the active delivery mode is `skills`
      Then the command SHALL create the selected OpenSpec skill files under `.codex/skills/`
      And it SHALL NOT create Codex prompt files

    Scenario: Initializing Codex with commands delivery
      When a user runs `openspec init` and selects Codex
      And the active delivery mode is `commands`
      Then the command SHALL still create the selected OpenSpec skill files under `.codex/skills/`
      And it SHALL skip Codex command-file generation because Codex is `skills-invocable`

  @added @REQ-0337
  Rule: Codex initialization cleanup removes managed legacy prompts
    `openspec init` SHALL remove previously managed global Codex prompt files only after replacement Codex skills exist, without deleting user-authored Codex prompts.

    Scenario: Cleanup removes allowlisted global Codex prompt files after replacement exists
      When initialization cleanup runs
      And the Codex prompt directory contains exact allowlisted managed global Codex prompt files
      And replacement Codex skills exist for the workflows represented by those prompt filenames
      Then the command SHALL remove those managed Codex prompt files
      And it SHALL leave other Codex prompt files unchanged

    Scenario: Non-interactive initialization preserves unreplaced global Codex prompts
      When `openspec init` runs without interaction and without `--force`
      And the resolved global Codex prompt directory contains exact allowlisted managed Codex prompt files
      And replacement Codex skills do not yet exist for at least one detected prompt workflow
      Then the command SHALL preserve the unreplaced Codex prompt files
      And it SHALL continue to leave unmanaged Codex prompt files unchanged

    Scenario: Non-interactive initialization removes replaced global Codex prompts
      When `openspec init` runs without interaction and without `--force`
      And the resolved global Codex prompt directory contains exact allowlisted managed Codex prompt files
      And replacement Codex skills exist for the workflows represented by those prompt filenames
      Then the command SHALL remove those managed Codex prompt files
      And it SHALL leave unmanaged Codex prompt files unchanged

    Scenario: Initialization preview lists deferred global prompts cleanup separately
      When `openspec init` detects managed global Codex prompt files before tool setup
      Then the command SHALL present deferred global prompts cleanup in a separate section from immediate repo-local removals
      And that section SHALL list the concrete prompt paths
      And it SHALL explain that those global prompts are removed only after matching replacement skills are installed

    Scenario: Cleanup reports Codex skills as the replacement
      When initialization cleanup reports removed Codex prompt files
      Then the cleanup summary SHALL indicate that the removed prompt files are replaced by Codex skills
