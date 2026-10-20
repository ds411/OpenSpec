Feature: CLI Init
  The init command SHALL provide a streamlined setup experience that auto-detects tools and uses smart defaults, getting users to their first change in under a minute.

  @modified
  Rule: Skill generation per tool (REPLACES fixed 9-skill mandate)
    The init command SHALL generate skills based on the active profile, not a fixed set.

    Scenario: Core profile skill generation
      When user runs init with profile `core`
      Then the system SHALL generate skills for workflows in CORE_WORKFLOWS constant: propose, explore, apply, archive
      Then the system SHALL NOT generate skills for workflows outside the profile

    Scenario: Custom profile skill generation
      When user runs init with profile `custom`
      Then the system SHALL generate skills only for workflows listed in config `workflows` array

    Scenario: Propose workflow included in skill templates
      When generating skills
      Then the system SHALL include the `propose` workflow as an available skill template

  @modified
  Rule: Command generation per tool (REPLACES fixed 9-command mandate)
    The init command SHALL generate commands based on profile AND delivery settings.

    Scenario: Skills-only delivery
      When delivery is set to `skills`
      Then the system SHALL NOT generate any command files

    Scenario: Commands-only delivery
      When delivery is set to `commands`
      Then the system SHALL NOT generate any skill files

    Scenario: Both delivery
      When delivery is set to `both`
      Then the system SHALL generate both skill and command files for profile workflows

    Scenario: Propose workflow included in command templates
      When generating commands
      Then the system SHALL include the `propose` workflow as an available command template

  @modified
  Rule: Tool auto-detection
    The init command SHALL detect installed AI tools by scanning for their configuration directories in the project root.

    Scenario: Detection from directories
      When scanning for tools
      Then the system SHALL check for directories matching each supported AI tool's configuration directory (e.g., `.claude/`, `.cursor/`, `.windsurf/`)
      Then all tools with a matching directory SHALL be returned as detected

    Scenario: Detection covers all supported tools
      When scanning for tools
      Then the system SHALL check for all tools defined in the supported tools configuration that have a configuration directory

    Scenario: No tools detected
      When no tool configuration directories exist in project root
      Then the system SHALL return an empty list of detected tools

  @modified
  Rule: Smart defaults init flow
    The init command SHALL work with sensible defaults and tool confirmation, minimizing required user input.

    Scenario: Init with detected tools (interactive)
      When user runs `openspec init` interactively and tool directories are detected
      Then the system SHALL show detected tools pre-selected
      Then the system SHALL ask for confirmation (not full selection)
      Then the system SHALL use default profile (`core`) and delivery (`both`)

    Scenario: Init with no detected tools (interactive)
      When user runs `openspec init` interactively and no tool directories are detected
      Then the system SHALL prompt for tool selection
      Then the system SHALL use default profile (`core`) and delivery (`both`)

    Scenario: Non-interactive with detected tools
      When user runs `openspec init` non-interactively (e.g., in CI)
      And tool directories are detected
      Then the system SHALL use detected tools automatically without prompting
      Then the system SHALL use default profile and delivery

    Scenario: Non-interactive with no detected tools
      When user runs `openspec init` non-interactively
      And no tool directories are detected
      Then the system SHALL fail with exit code 1
      And display message to use `--tools` flag

    Scenario: Non-interactive with explicit tools
      When user runs `openspec init --tools claude`
      Then the system SHALL use specified tools
      Then the system SHALL NOT prompt for any input

    Scenario: Interactive with explicit tools
      When user runs `openspec init --tools claude` interactively
      Then the system SHALL use specified tools (ignoring auto-detection)
      Then the system SHALL NOT prompt for tool selection
      Then the system SHALL proceed with default profile and delivery

    Scenario: Init success message (propose installed)
      When init completes successfully
      And `propose` is in the active profile
      Then the system SHALL display a tool-appropriate success message
      Then for tools using colon syntax (Claude Code): "Start your first change: /opsx:propose \"your idea\""
      Then for tools using hyphen syntax (Cursor, others): "Start your first change: /opsx-propose \"your idea\""

    Scenario: Init success message (propose not installed, new installed)
      When init completes successfully
      And `propose` is NOT in the active profile
      And `new` is in the active profile
      Then for tools using colon syntax: "Start your first change: /opsx:new \"your idea\""
      Then for tools using hyphen syntax: "Start your first change: /opsx-new \"your idea\""

    Scenario: Init success message (neither propose nor new)
      When init completes successfully
      And neither `propose` nor `new` is in the active profile
      Then the system SHALL display: "Done. Run 'openspec config profile' to configure your workflows."

  @modified
  Rule: Init performs migration on existing projects
    The init command SHALL perform one-time migration when re-initializing an existing project, using the same shared migration logic as the update command.

    Scenario: Re-init on existing project (no profile set)
      When user runs `openspec init` on a project with existing workflow files
      And global config does not contain a `profile` field
      Then the system SHALL perform one-time migration before proceeding (see `specs/cli-update/spec.md`)
      Then the system SHALL proceed with init using the migrated config

    Scenario: Init on new project (no existing workflows)
      When user runs `openspec init` on a project with no existing workflow files
      And global config does not contain a `profile` field
      Then the system SHALL NOT perform migration
      Then the system SHALL use `core` profile defaults

  @modified
  Rule: Init respects global config
    The init command SHALL read and apply settings from global config.

    Scenario: User has profile preference
      When global config contains `profile: "custom"` with custom workflows
      Then init SHALL install custom profile workflows

    Scenario: User has delivery preference
      When global config contains `delivery: "skills"`
      Then init SHALL install only skill files, not commands

    Scenario: Override via flags
      When user runs `openspec init --profile core`
      Then the system SHALL use the flag value instead of config value
      Then the system SHALL NOT update the global config

    Scenario: Invalid profile override
      When user runs `openspec init --profile <invalid>`
      And `<invalid>` is not one of `core` or `custom`
      Then the system SHALL exit with code 1
      Then the system SHALL display a validation error listing allowed profile values

  @modified
  Rule: Init applies configured profile without confirmation
    The init command SHALL apply the resolved profile (`--profile` override or global config) directly without prompting for confirmation.

    Scenario: Init with custom profile (interactive)
      When user runs `openspec init` interactively
      And global config specifies `profile: "custom"` with workflows
      Then the system SHALL proceed directly using the custom profile workflows
      And the system SHALL NOT show a profile confirmation prompt

    Scenario: Non-interactive init with custom profile
      When user runs `openspec init` non-interactively
      And global config specifies a custom profile
      Then the system SHALL proceed without confirmation

    Scenario: Init with core profile
      When user runs `openspec init` interactively
      And profile is `core` (default)
      Then the system SHALL proceed directly without a profile confirmation prompt

  @modified
  Rule: Init preserves existing workflows
    The init command SHALL NOT remove workflows that are already installed, but SHALL respect delivery setting.

    Scenario: Existing custom installation
      When user has custom profile with extra workflows and runs `openspec init` with core profile
      Then the system SHALL NOT remove extra workflows
      Then the system SHALL regenerate core workflow files, overwriting existing content with latest templates

    Scenario: Init with different delivery setting
      When user runs `openspec init` on existing project
      And delivery setting differs from what's installed (e.g., was `both`, now `skills`)
      Then the system SHALL generate files matching current delivery setting
      Then the system SHALL delete files that don't match delivery (e.g., commands removed if `skills`)
      Then this applies to all workflows, including extras not in profile

    Scenario: Re-init applies delivery cleanup even when templates are current
      When user runs `openspec init` on an existing project
      And existing files are already on current template versions
      And delivery changed since the previous init
      Then the system SHALL still remove files that no longer match delivery
      Then for example, switching from `both` to `skills` SHALL remove generated command files

  @modified
  Rule: Init tool confirmation UX
    The init command SHALL show detected tools and ask for confirmation.

    Scenario: Confirmation prompt
      When tools are detected in interactive mode
      Then the system SHALL display: "Detected: Claude Code, Cursor"
      Then the system SHALL show pre-selected checkboxes for confirmation
      Then the system SHALL allow user to deselect unwanted tools
