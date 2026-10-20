Feature: Update Command
  The update command SHALL apply global configuration changes to existing projects, syncing profile and delivery preferences without requiring full re-initialization.

  @modified
  Rule: Update respects global profile config
    The update command SHALL read global config and apply profile settings to the project.

    Scenario: Update adds missing workflows from config
      When user runs `openspec update`
      And global config specifies workflows not currently installed in the project
      Then the system SHALL generate skill/command files for missing workflows
      Then the system SHALL display: "Added: <workflow-names>"

    Scenario: Update refreshes existing workflows
      When user runs `openspec update`
      And workflows are already installed in the project
      Then the system SHALL refresh those workflow files with latest templates
      Then the system SHALL display: "Updated: <workflow-names>"

    Scenario: Update with no changes needed
      When user runs `openspec update`
      And installed workflows match global config
      And all templates are current
      And delivery setting matches installed files
      Then the system SHALL display: "Already up to date."

    Scenario: Profile or delivery drift with current templates
      When user runs `openspec update`
      And workflow templates are current for the installed skills
      And project files do not match current profile and/or delivery config
      Then the system SHALL treat this as an update-required state (not "Already up to date.")
      Then the system SHALL add/remove files to match current profile and delivery settings

    Scenario: Update summary output
      When update completes with changes
      Then the system SHALL display a summary:
        """
        - "Added: propose, explore" (new workflows installed)
        - "Updated: apply, archive" (existing workflows refreshed)
        - "Removed: 4 command files" (if delivery changed)
        """
      Then the system SHALL list affected tools: "Tools: Claude Code, Cursor"

  @modified
  Rule: Update respects delivery setting
    The update command SHALL add or remove files based on the delivery setting.

    Scenario: Delivery changed to skills-only
      When user runs `openspec update`
      And global config specifies `delivery: skills`
      And project has command files installed
      Then the system SHALL delete command files for workflows in the profile
      Then the system SHALL generate/update skill files only
      Then the system SHALL display: "Removed: <count> command files (delivery: skills)"

    Scenario: Delivery changed to commands-only
      When user runs `openspec update`
      And global config specifies `delivery: commands`
      And project has skill files installed
      Then the system SHALL delete skill directories for workflows in the profile
      Then the system SHALL generate/update command files only
      Then the system SHALL display: "Removed: <count> skill directories (delivery: commands)"

    Scenario: Delivery is both
      When user runs `openspec update`
      And global config specifies `delivery: both`
      Then the system SHALL generate/update both skill and command files

  @modified
  Rule: Update detects configured tools from skills or commands
    The update command SHALL treat a tool as configured if it has either generated skill files or generated command files.

    Scenario: Commands-only installation
      When user runs `openspec update`
      And a tool has generated OpenSpec command files
      And that tool has no OpenSpec skill files (commands-only delivery)
      Then the tool SHALL still be treated as configured
      Then the system SHALL apply profile and delivery sync for that tool

  @modified
  Rule: One-time migration for existing users
    The update command SHALL detect existing users (no `profile` in global config + existing workflows) and migrate them to `custom` profile before applying updates.

    Scenario: First update after upgrade (existing user)
      When user runs `openspec update`
      And global config does not contain a `profile` field
      And project has existing workflow files installed
      Then the system SHALL scan installed workflows across all tool directories in the project
      Then the system SHALL only match workflow names present in `ALL_WORKFLOWS` constant (ignoring user-created custom skills)
      Then the system SHALL take the union of detected workflow names across all tools
      Then the system SHALL write to global config: `profile: "custom"`, `delivery: "both"`, `workflows: [<detected>]`
      Then the system SHALL display: "Migrated: custom profile with <count> workflows (<workflow-names>)"
      Then the system SHALL display: "New in this version: /opsx:propose (combines new + ff). Try 'openspec config profile core' for the streamlined 4-workflow experience."
      Then the system SHALL proceed with normal update logic (using the migrated config)
      Then the result SHALL be template refresh only (no workflows added or removed)

    Scenario: Migration with partial workflows (user manually removed some)
      When user runs `openspec update`
      And global config does not contain a `profile` field
      And project has fewer than the original 10 workflows installed
      Then the system SHALL migrate with only the workflows that are actually present
      Then the migrated `workflows` array SHALL reflect the user's current state, not the original set

    Scenario: Migration with multiple tools having different workflow sets
      When user runs `openspec update`
      And project has multiple tools configured (e.g., Claude Code, Cursor)
      And different tools have different workflows installed
      Then the system SHALL take the union of all detected workflows across all tools
      Then the migrated `workflows` array SHALL include any workflow that exists in at least one tool

    Scenario: No migration needed (profile already set)
      When user runs `openspec update`
      And global config already contains a `profile` field
      Then the system SHALL NOT perform migration
      Then the system SHALL proceed with normal update logic using existing config

    Scenario: No migration needed (no existing workflows)
      When user runs `openspec update`
      And global config does not contain a `profile` field
      And project has no existing workflow files
      Then the system SHALL NOT perform migration
      Then the system SHALL use `core` profile defaults

    Scenario: Migration is idempotent
      When user runs `openspec update` multiple times
      Then migration SHALL only occur on the first run (when `profile` field is absent)
      Then subsequent runs SHALL use the existing global config without re-scanning

    Scenario: Non-interactive migration
      When user runs `openspec update` non-interactively (e.g., in CI)
      And migration is triggered
      Then the system SHALL perform migration without prompting
      Then the system SHALL display the migration summary to stdout

  @modified
  Rule: Update detects new tool directories
    The update command SHALL notify the user if new AI tool directories are detected that aren't currently configured.

    Scenario: New tool directory detected
      When user runs `openspec update`
      And a new tool directory is detected (e.g., `.windsurf/` exists but Windsurf is not configured)
      Then the system SHALL display: "Detected new tool: Windsurf. Run 'openspec init' to add it."
      Then the system SHALL NOT automatically add the new tool
      Then the system SHALL proceed with update for currently configured tools only

    Scenario: Multiple new tool directories detected
      When user runs `openspec update`
      And multiple new tool directories are detected (e.g., `.github/` and `.windsurf/` exist but neither tool is configured)
      Then the system SHALL display one consolidated message listing all detected tools, for example: "Detected new tools: GitHub Copilot, Windsurf. Run 'openspec init' to add them."
      Then the system SHALL NOT automatically add any new tools
      Then the system SHALL proceed with update for currently configured tools only

    Scenario: No new tool directories
      When user runs `openspec update`
      And no new tool directories are detected
      Then the system SHALL NOT display any tool detection message

  @modified
  Rule: Update requires an OpenSpec project
    The update command SHALL only run inside an initialized OpenSpec project.

    Scenario: Update outside a project
      When user runs `openspec update`
      And no `openspec/` directory exists in the current working directory
      Then the system SHALL display: "No OpenSpec project found. Run 'openspec init' to set up."
      Then the system SHALL exit with code 1

  @modified
  Rule: Extra workflows synchronized to active profile
    The update command SHALL remove workflow files that are no longer selected in the current profile.

    Scenario: Deselected workflows from previous profile
      When user runs `openspec update`
      And project has workflows not in current profile (e.g., user switched from custom to core or deselected workflows via `openspec config profile`)
      Then the system SHALL delete skill and command workflow files for deselected workflows (respecting active delivery mode)
      Then the system SHALL keep only workflows currently selected in profile

    Scenario: Delivery change with extra workflows
      When user runs `openspec update`
      And delivery changed (e.g., `both` → `skills`)
      And project has extra workflows not in current profile
      Then the system SHALL delete files for extra workflows that match the removed delivery type
      Then for example: if switching to `skills`, all command files are deleted (including for extra workflows)
