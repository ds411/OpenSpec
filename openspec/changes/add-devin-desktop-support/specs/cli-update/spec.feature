Feature: Update Command

  @modified @REQ-0115
  Rule: Slash Command Updates
    The update command SHALL refresh existing slash command files for configured tools without creating new ones, and ensure the OpenCode archive command accepts change ID arguments.

    Scenario: Updating slash commands for Antigravity
      When `.agent/workflows/` contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      Then refresh the OpenSpec-managed portion of each file so the workflow copy matches other tools while preserving the existing single-field `description` frontmatter
      And skip creating any missing workflow files during update, mirroring the behavior for Devin Desktop and other IDEs

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
      When the legacy Windsurf location `.windsurf/workflows/`, now Devin's, contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
      Then refresh each file using shared templates wrapped in OpenSpec markers
      And ensure templates include instructions for the relevant workflow stage
      And skip creating missing files (the update command only refreshes what already exists)

    Scenario: Updating workflows for Devin Desktop
      When Devin Desktop is a configured tool (its `.devin/` directory exists)
      Then write `.devin/workflows/opsx-<id>.md` for each workflow in the active profile, from shared templates
      And emit frontmatter with `name`, `description`, `category`, and `tags`
      And transform command references to hyphen form (for example `/opsx-propose`), the name Devin registers for a workflow file
      And refresh `.devin/skills/openspec-*/SKILL.md` with `/openspec-*` skill references, the one invocation both Devin agents accept

    Scenario: Updating slash commands for Kilo Code
      When `.kilocode/workflows/` contains `openspec-proposal.md`, `openspec-apply.md`, and `openspec-archive.md`
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
