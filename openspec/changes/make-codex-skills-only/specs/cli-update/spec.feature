Feature: Update Command

  @added @REQ-0338
  Rule: Codex update uses the skills-invocable command surface
    `openspec update` SHALL treat Codex as a skills-invocable tool, not as an adapter-backed command-file tool.

    Scenario: Codex command surface resolution
      When `openspec update` detects Codex as a configured tool
      Then the command SHALL resolve Codex command surface capability as `skills-invocable`
      And it SHALL apply delivery behavior through the shared command-surface capability model when that model is available
      And it SHALL NOT use a Codex-specific delivery predicate that duplicates command-surface capability rules

  @added @REQ-0339
  Rule: Codex update uses skills only
    `openspec update` SHALL refresh Codex through generated OpenSpec skills without generating or refreshing Codex custom prompt files.

    Scenario: Legacy Codex prompt migration infers workflows from the legacy filenames
      When `openspec update` upgrades an unconfigured Codex tool from detected exact allowlisted global legacy Codex prompt files
      Then it SHALL infer the replacement workflow IDs from the detected prompt filenames where possible
      And it SHALL use that inferred workflow subset for the replacement Codex skills instead of expanding to the current profile's full workflow set

    Scenario: Updating Codex with default delivery
      When a project has Codex OpenSpec skills configured
      And the active delivery mode is `both`
      Then `openspec update` SHALL refresh the selected Codex skill files under `.codex/skills/`
      And it SHALL NOT create or refresh Codex prompt files under `$CODEX_HOME/prompts` or the default Codex prompt directory

    Scenario: Updating Codex with commands delivery
      When a project has Codex configured
      And the active delivery mode is `commands`
      Then `openspec update` SHALL keep Codex usable by refreshing selected Codex skills
      And it SHALL skip Codex command-file generation because Codex is skills-invocable
      And it SHALL NOT remove Codex skills solely because the global delivery mode is `commands`

    Scenario: Updating Codex with skills delivery
      When a project has Codex configured
      And the active delivery mode is `skills`
      Then `openspec update` SHALL refresh selected Codex skills
      And it SHALL treat OpenSpec-managed Codex prompt files as legacy cleanup candidates
      And it SHALL NOT delete global Codex prompt files through ordinary delivery reconciliation without accepted or forced cleanup

  @added @REQ-0340
  Rule: Codex update cleanup removes managed legacy prompts
    `openspec update` SHALL clean up previously managed Codex prompt files from the resolved global Codex prompt directory only after replacement Codex skills exist.

    Scenario: Forced update cleanup removes Codex prompts
      When a user runs `openspec update --force`
      And the resolved Codex prompt directory contains exact allowlisted managed global Codex prompt files
      And replacement Codex skills exist for the workflows represented by those prompt filenames
      Then the command SHALL remove those managed Codex prompt files
      And it SHALL leave non-OpenSpec Codex prompt files unchanged

    Scenario: Configured Codex cleanup completes after skills refresh
      When an approved or forced update detects an allowlisted global Codex prompt whose configured project is missing the replacement skill
      And the configured-tool update installs that replacement skill, including under `delivery=commands`
      Then the command SHALL perform deferred global prompt cleanup after the configured-tool update loop
      And it SHALL remove the replaced prompt in the same update run

    Scenario: Interactive update cleanup includes Codex prompts
      When a user runs `openspec update` interactively
      Then the preview SHALL list immediate repo-local removals separately from deferred global prompts cleanup
      And the deferred section SHALL list the concrete global prompt paths before the user confirms cleanup
      And managed Codex prompt files are detected
      Then the cleanup prompt SHALL include those files in the cleanup plan
      And accepting cleanup SHALL remove only the prompt files whose replacement Codex skills exist

    Scenario: Non-interactive update without force does not delete prompts
      When a user runs `openspec update` without interaction and without `--force`
      And managed Codex prompt files are detected
      Then the command SHALL warn that legacy cleanup requires `--force` or an interactive run
      And it SHALL NOT delete Codex prompt files

  @modified @REQ-0115
  Rule: Slash Command Updates
    The update command SHALL refresh existing slash command files for configured adapter-backed tools without creating new ones, keep legacy command cleanup safe, and treat Codex custom prompts as legacy artifacts that are cleaned up rather than refreshed.

    Scenario: Updating slash commands for Antigravity
      When `.agent/workflows/` contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      Then refresh the OpenSpec-managed portion of each file so the workflow copy matches other tools while preserving the existing single-field `description` frontmatter
      And skip creating any missing workflow files during update, mirroring the behavior for Windsurf and other IDEs

    Scenario: Updating slash commands for Claude Code
      When `.claude/commands/openspec/` contains `proposal.md`, `apply.md`, and `archive.md`
      Then refresh each file using shared templates
      And ensure templates include instructions for the relevant workflow stage

    Scenario: Updating slash commands for CodeBuddy Code
      When `.codebuddy/commands/openspec/` contains `proposal.md`, `apply.md`, and `archive.md`
      Then refresh each file using the shared CodeBuddy templates that include YAML frontmatter for the `description` and `argument-hint` fields
      And use square bracket format for `argument-hint` parameters (e.g., `[change-id]`)
      And preserve any user customizations outside the OpenSpec managed markers

    Scenario: Updating slash commands for Cline
      When `.clinerules/workflows/` contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      Then refresh each file using shared templates
      And include Cline-specific Markdown heading frontmatter
      And ensure templates include instructions for the relevant workflow stage

    Scenario: Updating slash commands for Continue
      When `.continue/prompts/` contains `openspec-proposal.prompt`, `openspec-apply.prompt`, and `openspec-archive.prompt`
      Then refresh each file using shared templates
      And ensure templates include instructions for the relevant workflow stage

    Scenario: Updating slash commands for Crush
      When `.crush/commands/` contains `openspec/proposal.md`, `openspec/apply.md`, and `openspec/archive.md`
      Then refresh each file using shared templates
      And include Crush-specific frontmatter with OpenSpec category and tags
      And ensure templates include instructions for the relevant workflow stage

    Scenario: Updating slash commands for Cursor
      When `.cursor/commands/` contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      Then refresh each file using shared templates
      And ensure templates include instructions for the relevant workflow stage

    Scenario: Updating slash commands for Factory Droid
      When `.factory/commands/` contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      Then refresh each file using the shared Factory templates that include YAML frontmatter for the `description` and `argument-hint` fields
      And ensure the template body retains the `$ARGUMENTS` placeholder so user input keeps flowing into droid
      And update only the content inside the OpenSpec managed markers, leaving any unmanaged notes untouched
      And skip creating missing files during update

    Scenario: Updating slash commands for OpenCode
      When `.opencode/command/` contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      Then refresh each file using shared templates
      And ensure templates include instructions for the relevant workflow stage
      And ensure the archive command includes `$ARGUMENTS` placeholder in frontmatter for accepting change ID arguments

    Scenario: Updating slash commands for Windsurf
      When `.windsurf/workflows/` contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      Then refresh each file using shared templates wrapped in OpenSpec markers
      And ensure templates include instructions for the relevant workflow stage
      And skip creating missing files (the update command only refreshes what already exists)

    Scenario: Updating slash commands for Kilo Code
      When `.kilocode/workflows/` contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      Then refresh each file using shared templates wrapped in OpenSpec markers
      And ensure templates include instructions for the relevant workflow stage
      And skip creating missing files (the update command only refreshes what already exists)

    Scenario: Codex prompt files are not refreshed
      Given the global Codex prompt directory contains OpenSpec-managed Codex prompt files
      When a user runs `openspec update`
      Then the command SHALL NOT refresh Codex prompt files
      And it SHALL treat those files as legacy cleanup candidates
      And it SHALL preserve unmanaged files by deleting only exact allowlisted OpenSpec-owned filenames under the resolved global Codex prompt directory after replacement skills exist

    Scenario: Updating slash commands for GitHub Copilot
      When `.github/prompts/` contains `openspec-proposal.prompt.md`, `openspec-apply.prompt.md`, and `openspec-archive.prompt.md`
      Then refresh each file using shared templates while preserving the YAML frontmatter
      And update only the OpenSpec-managed block between markers
      And ensure templates include instructions for the relevant workflow stage

    Scenario: Updating slash commands for Gemini CLI
      When `.gemini/commands/openspec/` contains `proposal.toml`, `apply.toml`, and `archive.toml`
      Then refresh the body of each file using the shared proposal/apply/archive templates
      And replace only the content between `<!-- OPENSPEC:START -->` and `<!-- OPENSPEC:END -->` markers inside the `prompt = """` block so the TOML framing (`description`, `prompt`) stays intact
      And skip creating any missing `.toml` files during update; only pre-existing Gemini commands are refreshed

    Scenario: Updating slash commands for iFlow CLI
      When `.iflow/commands/` contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      Then refresh each file using shared templates
      And preserve the YAML frontmatter with `name`, `id`, `category`, and `description` fields
      And update only the OpenSpec-managed block between markers
      And ensure templates include instructions for the relevant workflow stage

    Scenario: Missing slash command file
      When a tool lacks a slash command file
      Then do not create a new file during update
