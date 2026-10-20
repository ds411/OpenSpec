Feature: CLI Init
  The `openspec init` command SHALL create a complete OpenSpec directory structure in any project, enabling immediate adoption of OpenSpec conventions with support for multiple AI coding assistants.

  **Why**

  Manual creation of OpenSpec structure is error-prone and creates adoption friction. A standardized init command ensures:
  - Consistent structure across all projects
  - Proper AI instruction files are always included
  - Quick onboarding for new projects
  - Clear conventions from the start

  @REQ-0080
  Rule: Progress Indicators
    The command SHALL display progress indicators during initialization to provide clear feedback about each step.

    Scenario: Displaying initialization progress
      When executing initialization steps
      Then validate environment silently in background (no output unless error)
      And display progress with ora spinners:
        """
        - Show spinner: "⠋ Creating OpenSpec structure..."
        - Then success: "✔ OpenSpec structure created"
        - Show spinner: "⠋ Configuring AI tools..."
        - Then success: "✔ AI tools configured"
        """

  @REQ-0081
  Rule: Directory Creation
    The command SHALL create the OpenSpec directory structure with config file.

    Scenario: Creating OpenSpec structure
      When `openspec init` is executed
      Then create the following directory structure:
        """
        openspec/
        ├── config.yaml
        ├── specs/
        └── changes/
            └── archive/
        """

  @REQ-0082
  Rule: AI Tool Configuration
    The command SHALL configure AI coding assistants with skills and slash commands using a searchable multi-select experience.

    Scenario: Prompting for AI tool selection
      When run interactively
      Then display animated welcome screen with OpenSpec logo
      And present a searchable multi-select that shows all available tools
      And mark already configured tools with "(configured ✓)" indicator
      And pre-select configured tools for easy refresh
      And sort configured tools to appear first in the list
      And allow filtering by typing to search

    Scenario: Selecting tools to configure
      When user selects tools and confirms
      Then generate skills in `.<tool>/skills/` directory for each selected tool
      And generate slash commands for each selected tool with a command adapter, at that adapter's own path (for example `.claude/commands/opsx/<id>.md` or `.cursor/commands/opsx-<id>.md`)
      And create `openspec/config.yaml` with default schema setting

  @REQ-0083
  Rule: Interactive Mode
    The command SHALL provide an interactive menu for AI tool selection with clear navigation instructions.

    Scenario: Displaying interactive menu
      When run in fresh or extend mode
      Then present a looping select menu that lets users toggle tools with Space and review selections with Enter
      And when Enter is pressed on a highlighted selectable tool that is not already selected, automatically add it to the selection before moving to review so the highlighted tool is configured
      And label already configured tools with "(already configured)" while keeping disabled options marked "coming soon"
      And change the prompt copy in extend mode to "Which AI tools would you like to add or refresh?"
      And display inline instructions clarifying that Space toggles tools and Enter selects the highlighted tool before reviewing selections

  @REQ-0084
  Rule: Safety Checks
    The command SHALL perform safety checks to prevent overwriting existing structures and ensure proper permissions.

    Scenario: Detecting existing initialization
      When the `openspec/` directory already exists
      Then inform the user that OpenSpec is already initialized, skip recreating the base structure, and enter an extend mode
      And continue to the AI tool selection step so additional tools can be configured
      And display the existing-initialization error message only when the user declines to add any AI tools

  @REQ-0085
  Rule: Success Output
    The command SHALL provide clear, actionable next steps upon successful initialization.

    Scenario: Displaying success message
      When initialization completes successfully
      Then display categorized summary:
        """
        - "Created: <tools>" for newly configured tools
        - "Refreshed: <tools>" for already-configured tools that were updated
        - Count of skills and commands generated
        """
      And display a getting started section naming an installed onboarding workflow (for example `/opsx:propose` - Start a change)
      And spell each command the way the configured tool registers it: `/opsx-<id>` for tools whose command files are named `opsx-<id>`, and the tool's skill invocation (`$openspec-<skill>` for Codex, `/skill:openspec-<skill>` for Kimi Code, `/openspec-<skill>` otherwise) for tools that receive no command files
      And print one labeled line per distinct form when the selected tools disagree
      And display links to documentation and feedback

    Scenario: Displaying restart instruction
      When initialization completes successfully and tools were created or refreshed
      Then display instruction to restart IDE for slash commands to take effect

  @REQ-0086
  Rule: Exit Codes
    The command SHALL use consistent exit codes to indicate different failure modes.

    Scenario: Returning exit codes
      When the command completes
      Then return appropriate exit code:
        """
        - 0: Success
        - 1: General error (including when OpenSpec directory already exists)
        - 2: Insufficient permissions (reserved for future use)
        - 3: User cancelled operation (reserved for future use)
        """

  @REQ-0087
  Rule: Additional AI Tool Initialization
    `openspec init` SHALL allow users to add configuration files for new AI coding assistants after the initial setup.

    Scenario: Configuring an extra tool after initial setup
      Given an `openspec/` directory already exists and at least one AI tool file is present
      When the user runs `openspec init` and selects a different supported AI tool
      Then generate that tool's configuration files with OpenSpec markers the same way as during first-time initialization
      And leave existing tool configuration files unchanged except for managed sections that need refreshing
      And exit with code 0 and display a success summary highlighting the newly added tool files

  @REQ-0088
  Rule: Success Output Enhancements
    `openspec init` SHALL summarize tool actions when initialization or extend mode completes.

    Scenario: Showing tool summary
      When the command completes successfully
      Then display a categorized summary of tools that were created, refreshed, or skipped (including already-configured skips)
      And personalize the "Next steps" header using the names of the selected tools, defaulting to a generic label when none remain

  @REQ-0089
  Rule: Exit Code Adjustments
    `openspec init` SHALL treat extend mode without new native tool selections as a successful refresh.

    Scenario: Allowing empty extend runs
      When OpenSpec is already initialized and the user selects no additional natively supported tools
      Then complete successfully without requiring additional tool setup
      And preserve the existing OpenSpec structure and config files
      And exit with code 0

  @REQ-0090
  Rule: Non-Interactive Mode
    The command SHALL support non-interactive operation through command-line options.

    Scenario: Select all tools non-interactively
      When run with `--tools all`
      Then automatically select every available AI tool without prompting
      And proceed with skill and command generation

    Scenario: Select specific tools non-interactively
      When run with `--tools claude,cursor`
      Then parse the comma-separated tool IDs
      And generate skills and commands for specified tools only

    Scenario: Skip tool configuration non-interactively
      When run with `--tools none`
      Then create only the openspec directory structure
      And skip skill and command generation
      And create config only when config creation conditions are met

    Scenario: Invalid tool specification
      When run with `--tools invalid-tool`
      Then fail with exit code 1
      And display an error listing available values (`all`, `none`, and supported tool IDs)

    Scenario: Reserved value combined with tool IDs
      When run with `--tools all,claude` or `--tools none,cursor`
      Then fail with exit code 1
      And display an error explaining reserved values cannot be combined with specific tool IDs

    Scenario: Missing --tools in non-interactive mode
      Given prompts are unavailable in non-interactive execution
      When user runs `openspec init` without `--tools`
      Then fail with exit code 1
      And instruct to use `--tools all`, `--tools none`, or explicit tool IDs

  @REQ-0091
  Rule: Skill Generation
    The command SHALL generate Agent Skills for selected AI tools.

    Scenario: Generating skills for a tool
      When a tool is selected during initialization
      Then create 9 skill directories under `.<tool>/skills/`:
        """
        - `openspec-explore/SKILL.md`
        - `openspec-new-change/SKILL.md`
        - `openspec-continue-change/SKILL.md`
        - `openspec-apply-change/SKILL.md`
        - `openspec-ff-change/SKILL.md`
        - `openspec-verify-change/SKILL.md`
        - `openspec-sync-specs/SKILL.md`
        - `openspec-archive-change/SKILL.md`
        - `openspec-bulk-archive-change/SKILL.md`
        """
      And each SKILL.md SHALL contain YAML frontmatter with name and description
      And each SKILL.md SHALL contain the skill instructions

  @REQ-0092
  Rule: Slash Command Generation
    The command SHALL generate opsx slash commands only for selected tools that have a registered command adapter, while keeping adapterless tools valid for skill generation.

    Scenario: Generating slash commands for a tool with a registered adapter
      When a tool with a registered command adapter is selected during initialization
      Then create 9 slash command files using the tool's command adapter:
        """
        - `/opsx:explore`
        - `/opsx:new`
        - `/opsx:continue`
        - `/opsx:apply`
        - `/opsx:ff`
        - `/opsx:verify`
        - `/opsx:sync`
        - `/opsx:archive`
        - `/opsx:bulk-archive`
        """
      And use tool-specific path conventions (e.g., `.claude/commands/opsx/` for Claude)
      And include tool-specific frontmatter format

    Scenario: Selected tool has no command adapter
      Given a selected tool has `skillsDir` configured but no registered command adapter
      When initialization includes command generation
      Then skill generation for that tool SHALL still remain valid
      And command-file generation SHALL be skipped for that tool
      And the command output SHALL include `Commands skipped for: <tool-id> (no adapter)`

    Scenario: Kimi Code skips command-file generation
      When the user selects Kimi Code during initialization
      Then OpenSpec SHALL treat it as a supported tool with `skillsDir: '.kimi-code'`
      And command-file generation SHALL be skipped because no Kimi adapter is registered

    Scenario: Grok Build skips command-file generation
      When the user selects Grok Build during initialization
      Then OpenSpec SHALL treat it as a supported tool with `skillsDir: '.grok'`
      And command-file generation SHALL be skipped because no Grok adapter is registered

  @REQ-0093
  Rule: Config File Generation
    The command SHALL create an OpenSpec config file with schema settings.

    Scenario: Creating config.yaml
      When initialization completes
      And config.yaml does not exist
      Then create `openspec/config.yaml` with default schema setting
      And display config location in output

    Scenario: Preserving existing config.yaml
      When initialization runs in extend mode
      And `openspec/config.yaml` already exists
      Then preserve the existing config file
      And display "(exists)" indicator in output

  @REQ-0094
  Rule: Artifact Language Configuration
    The command SHALL let users configure the artifact language during initialization without changing existing project guidance.

    Scenario: Configuring language for a new project
      When the user runs `openspec init --language <language>` and no OpenSpec config exists
      Then create `openspec/config.yaml` with context instructing agents to write artifacts in the selected language
      And keep OpenSpec structural headings and `SHALL`/`MUST` requirement keywords in English
      And make the language context available to artifact instructions

    Scenario: Protecting existing project context
      When the user runs `openspec init --language <language>` and an OpenSpec config already exists without the same generated language guidance
      Then fail before changing project files
      And direct the user to edit the existing config context

    Scenario: Rejecting an unsafe language value
      When the `--language` value is empty, multiline, contains control characters, or would exceed the project context size limit
      Then fail before creating OpenSpec files
      And explain why the value is invalid

    Scenario: Language config cannot be written
      When the user runs `openspec init --language <language>` and the new config cannot be written
      Then fail instead of reporting successful initialization
      And avoid creating unrelated tool files when writability can be determined in advance

  @REQ-0095
  Rule: Experimental Command Alias
    The command SHALL maintain backward compatibility with the experimental command.

    Scenario: Running openspec experimental
      When user runs `openspec experimental`
      Then delegate to `openspec init`
      And the command SHALL be hidden from help output
