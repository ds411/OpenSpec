Feature: Update Command
  As a developer using OpenSpec, I want to update the OpenSpec instructions in my project when new versions are released, so that I can benefit from improvements to AI agent instructions.

  @REQ-0110
  Rule: Update Behavior
    The update command SHALL update OpenSpec instruction files to the latest templates in a team-friendly manner.

    Scenario: Running update command
      When a user runs `openspec update`
      Then replace `openspec/AGENTS.md` with the latest template
      And if a root-level stub (`AGENTS.md`/`CLAUDE.md`) exists, refresh it so it points to `@/openspec/AGENTS.md`

  @REQ-0111
  Rule: Prerequisites
    The command SHALL require an existing OpenSpec structure before allowing updates.

    Scenario: Checking prerequisites
      Given the command requires an existing `openspec` directory (created by `openspec init`)
      When the `openspec` directory does not exist
      Then display error: "No OpenSpec directory found. Run 'openspec init' first."
      And exit with code 1

  @REQ-0112
  Rule: File Handling
    The update command SHALL handle file updates in a predictable and safe manner.

    Scenario: Updating files
      When updating files
      Then completely replace `openspec/AGENTS.md` with the latest template
      And if a root-level stub exists, update the managed block content so it keeps directing teammates to `@/openspec/AGENTS.md`

  @REQ-0113
  Rule: Tool-Agnostic Updates
    The update command SHALL refresh OpenSpec-managed files in a predictable manner while respecting each team's chosen tooling.

    Scenario: Updating files
      When updating files
      Then completely replace `openspec/AGENTS.md` with the latest template
      And create or refresh the root-level `AGENTS.md` stub using the managed marker block, even if the file was previously absent
      And update only the OpenSpec-managed sections inside existing AI tool files, leaving user-authored content untouched
      And avoid creating new native-tool configuration files (slash commands, CLAUDE.md, etc.) unless they already exist

  @REQ-0114
  Rule: Core Files Always Updated
    The update command SHALL always update the core OpenSpec files and display an ASCII-safe success message.

    Scenario: Successful update
      When the update completes successfully
      Then replace `openspec/AGENTS.md` with the latest template
      And if a root-level stub exists, refresh it so it still directs contributors to `@/openspec/AGENTS.md`

  @REQ-0115
  Rule: Slash Command Updates
    The update command SHALL refresh existing slash command files for configured tools without creating new ones, and ensure the OpenCode archive command accepts change ID arguments.

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
      When `.opencode/commands/` contains OpenSpec-managed `opsx-*.md` command files for the configured profile (for example `opsx-propose.md`, `opsx-apply.md`, and `opsx-archive.md`)
      Then refresh each file using shared templates
      And transform command references to hyphen form (for example `/opsx-propose`), as for every tool whose command files are named `opsx-<id>`
      And ensure templates include instructions for the relevant workflow stage
      And ensure the archive command includes `$ARGUMENTS` placeholder in frontmatter for accepting change ID arguments

    Scenario: Legacy OpenCode command path cleanup
      When a project still has command files under the legacy singular path `.opencode/command/` (for example `opsx-*.md` or `openspec-*.md`)
      Then `openspec init` or legacy cleanup SHALL remove those files and generate replacements under `.opencode/commands/`
      And `openspec update` SHALL NOT refresh files that remain only under `.opencode/command/`

    Scenario: Updating slash commands for Windsurf
      When `.windsurf/workflows/` contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      Then refresh each file using shared templates wrapped in OpenSpec markers
      And ensure templates include instructions for the relevant workflow stage
      And skip creating missing files (the update command only refreshes what already exists)

    Scenario: Updating slash commands for Kilo Code
      When `.kilo/command/` contains OpenSpec-managed `opsx-*.md` command files for the configured profile
      Then refresh each file using shared templates wrapped in OpenSpec markers
      And ensure templates include instructions for the relevant workflow stage
      And skip creating missing files (the update command only refreshes what already exists)

    Scenario: Updating slash commands for Codex
      Given the global Codex prompt directory contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      When a user runs `openspec update`
      Then refresh each file using the shared slash-command templates (including placeholder guidance)
      And preserve any unmanaged content outside the OpenSpec marker block
      And skip creation when a Codex prompt file is missing

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

  @REQ-0116
  Rule: Archive Command Argument Support
    The archive slash command template SHALL support optional change ID arguments for tools that support `$ARGUMENTS` placeholder.

    Scenario: Archive command with change ID argument
      When a user invokes `/openspec:archive <change-id>` with a change ID
      Then the template SHALL instruct the AI to validate the provided change ID against `openspec list`
      And use the provided change ID for archiving if valid
      And fail fast if the provided change ID doesn't match an archivable change

    Scenario: Archive command without argument (backward compatibility)
      When a user invokes `/openspec:archive` without providing a change ID
      Then the template SHALL instruct the AI to identify the change ID from context or by running `openspec list`
      And proceed with the existing behavior (maintaining backward compatibility)

    Scenario: OpenCode archive template generation
      When generating the OpenCode archive slash command file
      Then include the `$ARGUMENTS` placeholder in the frontmatter
      And wrap it in a clear structure like `<ChangeId>\n  $ARGUMENTS\n</ChangeId>` to indicate the expected argument
      And include validation steps in the template body to check if the change ID is valid
