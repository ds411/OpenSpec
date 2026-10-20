Feature: profiles
  Profiles SHALL define which workflows to install, enabling a streamlined core experience for new users while allowing power users to customize their workflow selection.

  @added @REQ-0344
  Rule: Profile definitions
    The system SHALL support two workflow profiles: `core` and `custom`.

    Scenario: Core profile contents
      When profile is set to `core`
      Then the profile SHALL include workflows: `propose`, `explore`, `apply`, `archive`

    Scenario: Custom profile contents
      When profile is set to `custom`
      Then the profile SHALL include only the workflows specified in global config `workflows` array

  @added @REQ-0345
  Rule: Delivery is independent of profile
    The delivery setting SHALL control HOW workflows are installed (skills, commands, or both), separate from WHICH workflows are installed.

    Scenario: Delivery options
      When configuring delivery
      Then the system SHALL support three options: `both` (skills and commands), `skills` (skill files only), `commands` (command files only)

    Scenario: Both delivery
      When delivery is set to `both`
      Then the system SHALL install both skill files and command files for each workflow

    Scenario: Skills-only delivery
      When delivery is set to `skills`
      Then the system SHALL install only skill files for each workflow
      Then the system SHALL NOT install command files

    Scenario: Commands-only delivery
      When delivery is set to `commands`
      Then the system SHALL install only command files for each workflow
      Then the system SHALL NOT install skill files

    Scenario: Core profile with custom delivery
      When profile is set to `core`
      And delivery is set to `skills`
      Then the system SHALL install core workflows as skills only (no commands)

    Scenario: Delivery defaults
      When delivery is not set in global config
      Then the system SHALL default to `both`

  @added @REQ-0346
  Rule: Profile configuration via interactive picker
    The system SHALL provide an interactive picker for configuring profiles.

    Scenario: Interactive profile configuration
      When user runs `openspec config profile`
      Then the system SHALL display an interactive picker with:
        """
        - Delivery selection: `skills`, `commands`, `both`
        - Workflow toggles for all available workflows
        """
      Then the system SHALL pre-select current config values
      Then on confirmation, the system SHALL update global config
      Then the system SHALL set profile to `custom` if selected workflows differ from core defaults
      Then the system SHALL set profile to `core` if selected workflows match core defaults exactly (propose, explore, apply, archive), regardless of delivery setting
      Then the system SHALL NOT modify any project files
      Then the system SHALL display: "Config updated. Run `openspec update` in your projects to apply."

    Scenario: Core preset shortcut
      When user runs `openspec config profile core`
      Then the system SHALL set profile to `core`
      Then the system SHALL set workflows to `['propose', 'explore', 'apply', 'archive']`
      Then the system SHALL NOT change the delivery setting (preserves user preference)
      Then the system SHALL NOT modify any project files
      Then the system SHALL display: "Config updated. Run `openspec update` in your projects to apply."
      Then the new profile takes effect on the next `openspec init` or `openspec update` run

    Scenario: Config profile run inside a project
      When user runs `openspec config profile` inside an OpenSpec project directory
      Then after updating global config, the system SHALL prompt: "Apply to this project now? (y/n)"
      When user confirms
      Then the system SHALL run `openspec update` automatically
      Then the system SHALL still display: "Run `openspec update` in your other projects to apply."

    Scenario: Config profile - user declines apply
      When user runs `openspec config profile` inside an OpenSpec project directory
      And user declines the "Apply to this project now?" prompt
      Then the system SHALL display: "Config updated. Run `openspec update` in your projects to apply."
      Then the system SHALL exit successfully without modifying project files

    Scenario: Config profile non-interactive
      When user runs `openspec config profile` non-interactively (e.g., in CI, no TTY)
      Then the system SHALL display an error: "Interactive mode required. Use `openspec config profile core` or set config via environment/flags."
      Then the system SHALL exit with code 1

  @added @REQ-0347
  Rule: Profile settings stored in global config
    Profile and delivery settings SHALL be stored in the existing global config file (`~/.config/openspec/config.json`) alongside telemetry and feature flags.

    Scenario: Config schema
      When reading profile configuration
      Then the config SHALL contain `profile` (core|custom), `delivery` (both|skills|commands), and optionally `workflows` (array of workflow names)

    Scenario: Schema evolution
      When loading config without profile/delivery fields
      Then the system SHALL use defaults (profile=core, delivery=both)
      And existing config fields (telemetry, featureFlags) SHALL be preserved

    Scenario: Config list displays profile settings
      When user runs `openspec config list`
      Then the system SHALL display profile, delivery, and workflows settings
      And SHALL indicate which values are defaults vs explicitly set

  @added @REQ-0348
  Rule: Config is global, projects are explicit
    Config changes SHALL NOT automatically propagate to projects.

    Scenario: Config update does not modify projects
      When user updates config via `openspec config profile`
      Then the system SHALL only update global config (`~/.config/openspec/config.json`)
      Then the system SHALL NOT modify any project skill/command files
      Then existing projects retain their current workflow files until user runs `openspec update`

  @added @REQ-0349
  Rule: Config changes applied via update command
    The existing `openspec update` command SHALL apply the current global config to a project. See `specs/cli-update/spec.md` for detailed update behavior.

    Scenario: Config changes require explicit project sync
      When user updates profile or delivery via `openspec config profile`
      Then the global config SHALL be updated immediately
      And project files SHALL remain unchanged until `openspec update` is run for that project

  @added @REQ-0350
  Rule: Profile defaults
    The system SHALL use `core` as the default profile for new users, while preserving existing users' workflows via migration.

    Scenario: No global config exists (new user)
      When global config file does not exist
      And no existing workflows are installed in the project
      Then the system SHALL behave as if profile is `core`

    Scenario: Global config exists but profile field absent (new user)
      When global config file exists but does not contain a `profile` field
      And no existing workflows are installed in the project
      Then the system SHALL behave as if profile is `core`

    Scenario: Profile field absent with existing workflows (existing user migration)
      When global config does not contain a `profile` field
      And the `update` command detects existing workflow files in the project
      Then the system SHALL perform one-time migration (see `specs/cli-update/spec.md` for details)
      Then the system SHALL set profile to `custom` with the detected workflows
      Then the system SHALL NOT add or remove any workflow files during migration
