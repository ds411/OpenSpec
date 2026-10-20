Feature: legacy-cleanup
  Define detection and cleanup behavior for legacy OpenSpec artifacts during initialization and update workflows.

  @REQ-0168
  Rule: Legacy artifact detection
    The system SHALL detect legacy OpenSpec artifacts from previous init versions.

    Scenario: Detecting legacy config files
      When running `openspec init` on an existing project
      Then the system SHALL check for config files with OpenSpec markers:
        """
        - `CLAUDE.md`
        - `.cursorrules`
        - `.windsurfrules`
        - `.clinerules`
        - `.kilocode_rules`
        - `.github/copilot-instructions.md`
        - `.amazonq/instructions.md`
        - `CODEBUDDY.md`
        - `IFLOW.md`
        - And all other tool config files from the legacy ToolRegistry
        """

    Scenario: Detecting legacy slash command directories
      When running `openspec init` on an existing project
      Then the system SHALL check for old slash command directories:
        """
        - `.claude/commands/openspec/`
        - `.cursor/commands/openspec/` (note: old format used `openspec-*.md` in commands root)
        - `.windsurf/workflows/openspec-*.md`
        - And equivalent directories for all tools in the legacy SlashCommandRegistry
        """

    Scenario: Detecting legacy Kilo Code workflows
      When `.kilocode/workflows/` contains OpenSpec-managed `opsx-*.md` or `openspec-*.md` workflow files
      Then `openspec init` or legacy cleanup SHALL remove those files
      And Kilo Code commands SHALL be generated under `.kilo/command/`
      And `openspec update` SHALL NOT refresh files that remain only under `.kilocode/workflows/`

    Scenario: Detecting legacy OpenSpec structure files
      When running `openspec init` on an existing project
      Then the system SHALL check for:
        """
        - `openspec/AGENTS.md`
        - `openspec/project.md` (for migration messaging only, not deleted)
        - Root `AGENTS.md` with OpenSpec markers
        """

  @REQ-0169
  Rule: Legacy cleanup confirmation
    The system SHALL prompt for confirmation before removing legacy artifacts.

    Scenario: Prompting for cleanup when legacy detected
      When legacy artifacts are detected
      Then the system SHALL display what was found
      And prompt: "Legacy files detected. Upgrade and clean up? [Y/n]"
      And default to Yes if user presses Enter

    Scenario: User confirms cleanup
      When user responds Y or presses Enter
      Then the system SHALL remove legacy artifacts
      And proceed with skill-based setup

    Scenario: User declines cleanup
      When user responds N
      Then the system SHALL abort initialization
      And display message suggesting manual cleanup or using `--force` flag

    Scenario: Non-interactive mode
      When running with `--no-interactive` or in CI environment
      And legacy artifacts are detected
      Then the system SHALL abort with exit code 1
      And display detected legacy artifacts
      And suggest running interactively or using `--force` flag

  @REQ-0170
  Rule: Surgical removal of config file content
    The system SHALL preserve user content when removing OpenSpec markers from config files.

    Scenario: Config file with only OpenSpec content
      When a config file contains only OpenSpec marker block (whitespace outside is acceptable)
      Then the system SHALL remove the OpenSpec marker block
      And preserve the file (even if empty or whitespace-only)
      And NOT delete the file (config files belong to the user's project root)

    Scenario: Config file with mixed content
      When a config file contains content outside OpenSpec markers
      Then the system SHALL remove only the `<!-- OPENSPEC:START -->` to `<!-- OPENSPEC:END -->` block
      And preserve all content before and after the markers
      And clean up any resulting double blank lines

    Scenario: Root AGENTS.md with mixed content
      When root `AGENTS.md` contains OpenSpec markers AND other content
      Then the system SHALL remove only the OpenSpec marker block
      And preserve the rest of the file

  @REQ-0171
  Rule: Legacy directory removal
    The system SHALL remove legacy slash command directories entirely.

    Scenario: Removing old slash command directory
      When a legacy slash command directory exists (e.g., `.claude/commands/openspec/`)
      Then the system SHALL delete the entire directory and its contents
      And NOT delete the parent directory (e.g., `.claude/commands/` remains)

    Scenario: Removing legacy AGENTS.md
      When `openspec/AGENTS.md` exists
      Then the system SHALL delete the file
      And NOT delete the `openspec/` directory itself

  @REQ-0172
  Rule: project.md migration hint
    The system SHALL preserve project.md and display a migration hint instead of deleting it.

    Scenario: project.md exists during upgrade
      When `openspec/project.md` exists during legacy cleanup
      Then the system SHALL NOT delete the file
      And the system SHALL display a migration hint in the output:
        """
        Manual migration needed:
          → openspec/project.md still exists
            Move useful content to config.yaml's "context:" field, then delete
        """

    Scenario: project.md migration rationale
      Given project.md may contain user-written project documentation
      And config.yaml's context field serves the same purpose (auto-injected into artifacts)
      When displaying the migration hint
      Then users can migrate manually or use `/opsx:explore` to get AI assistance

  @REQ-0173
  Rule: Cleanup reporting
    The system SHALL report what was cleaned up.

    Scenario: Displaying cleanup summary
      When legacy cleanup completes
      Then the system SHALL display a summary section:
        """
        Cleaned up legacy files:
          ✓ Removed OpenSpec markers from CLAUDE.md
          ✓ Removed .claude/commands/openspec/ (replaced by OpenSpec skills and commands)
          ✓ Removed openspec/AGENTS.md (no longer needed)
        """
      And **AND IF** `openspec/project.md` exists
      Then the system SHALL display a separate migration section:
        """
        Manual migration needed:
          → openspec/project.md still exists
            Move useful content to config.yaml's "context:" field, then delete
        """

    Scenario: No legacy detected
      When no legacy artifacts are found
      Then the system SHALL NOT display the cleanup section
      And proceed directly with skill setup
