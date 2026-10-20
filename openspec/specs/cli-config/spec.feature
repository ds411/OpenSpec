Feature: cli-config
  Provide a user-friendly CLI interface for viewing and modifying global OpenSpec configuration settings without manually editing JSON files.

  @REQ-0061
  Rule: Command Structure
    The config command SHALL provide subcommands for all configuration operations.

    Scenario: Available subcommands
      When user executes `openspec config --help`
      Then display available subcommands:
        """
        - `path` - Show config file location
        - `list` - Show all current settings
        - `get <key>` - Get a specific value
        - `set <key> <value>` - Set a value
        - `unset <key>` - Remove a key (revert to default)
        - `reset` - Reset configuration to defaults
        - `edit` - Open config in editor
        """

  @REQ-0062
  Rule: Config Path
    The config command SHALL display the config file location.

    Scenario: Show config path
      When user executes `openspec config path`
      Then print the absolute path to the config file
      And exit with code 0

  @REQ-0063
  Rule: Config List
    The config command SHALL display all current configuration values.

    Scenario: List config in human-readable format
      When user executes `openspec config list`
      Then display all config values in YAML-like format
      And show nested objects with indentation

    Scenario: List config as JSON
      When user executes `openspec config list --json`
      Then output the complete config as valid JSON
      And output only JSON (no additional text)

  @REQ-0064
  Rule: Config Get
    The config command SHALL retrieve specific configuration values.

    Scenario: Get top-level key
      When user executes `openspec config get <key>` with a valid top-level key
      Then print the raw value only (no labels or formatting)
      And exit with code 0

    Scenario: Get nested key with dot notation
      When user executes `openspec config get featureFlags.someFlag`
      Then traverse the nested structure using dot notation
      And print the value at that path

    Scenario: Get non-existent key
      When user executes `openspec config get <key>` with a key that does not exist
      Then print nothing (empty output)
      And exit with code 1

    Scenario: Get object value
      When user executes `openspec config get <key>` where the value is an object
      Then print the object as JSON

  @REQ-0065
  Rule: Config Set
    The config command SHALL set configuration values with automatic type coercion.

    Scenario: Set string value
      When user executes `openspec config set <key> <value>`
      And value does not match boolean or number patterns
      Then store value as a string
      And display confirmation message

    Scenario: Set boolean value
      When user executes `openspec config set <key> true` or `openspec config set <key> false`
      Then store value as boolean (not string)
      And display confirmation message

    Scenario: Set numeric value
      When user executes `openspec config set <key> <value>`
      And value is a valid number (integer or float)
      Then store value as number (not string)

    Scenario: Force string with --string flag
      When user executes `openspec config set <key> <value> --string`
      Then store value as string regardless of content
      And this allows storing literal "true" or "123" as strings

    Scenario: Set nested key
      When user executes `openspec config set featureFlags.newFlag true`
      Then create intermediate objects if they don't exist
      And set the value at the nested path

  @REQ-0066
  Rule: Config Unset
    The config command SHALL remove configuration overrides.

    Scenario: Unset existing key
      When user executes `openspec config unset <key>`
      And the key exists in the config
      Then remove the key from the config file
      And the value reverts to its default
      And display confirmation message

    Scenario: Unset non-existent key
      When user executes `openspec config unset <key>`
      And the key does not exist in the config
      Then display message indicating key was not set
      And exit with code 0

  @REQ-0067
  Rule: Config Reset
    The config command SHALL reset configuration to defaults.

    Scenario: Reset all with confirmation
      When user executes `openspec config reset --all`
      Then prompt for confirmation before proceeding
      And if confirmed, delete the config file or reset to defaults
      And display confirmation message

    Scenario: Reset all with -y flag
      When user executes `openspec config reset --all -y`
      Then reset without prompting for confirmation

    Scenario: Reset without --all flag
      When user executes `openspec config reset` without `--all`
      Then display error indicating `--all` is required
      And exit with code 1

  @REQ-0068
  Rule: Config Edit
    The config command SHALL open the config file in the user's editor.

    Scenario: Open editor successfully
      When user executes `openspec config edit`
      And `$EDITOR` or `$VISUAL` environment variable is set
      Then open the config file in that editor
      And create the config file with defaults if it doesn't exist
      And wait for the editor to close before returning

    Scenario: No editor configured
      When user executes `openspec config edit`
      And neither `$EDITOR` nor `$VISUAL` is set
      Then display error message suggesting to set `$EDITOR`
      And exit with code 1

  @REQ-0069
  Rule: Profile Configuration Flow
    The `openspec config profile` command SHALL provide an action-first interactive flow that allows users to modify delivery and workflow settings independently.

    Scenario: Current profile summary appears first
      When user runs `openspec config profile` in an interactive terminal
      Then display a current-state header with:
        """
        - current delivery value
        - workflow count with profile label (core or custom)
        """

    Scenario: Action-first menu offers skippable paths
      When user runs `openspec config profile` interactively
      Then the first prompt SHALL offer:
        """
        - `Delivery and workflows`
        - `Delivery only`
        - `Workflows only`
        - `Keep current settings (exit)`
        """

    Scenario: Delivery prompt marks current selection
      When delivery selection is shown in `openspec config profile`
      Then the currently configured delivery option SHALL include `[current]` in its label
      And that value SHALL be preselected by default

    Scenario: No-op exits without saving or apply prompt
      When user chooses `Keep current settings (exit)` OR makes selections that do not change effective config values
      Then the command SHALL print `No config changes.`
      And SHALL NOT write config changes
      And SHALL NOT ask to apply updates to the current project

    Scenario: No-op warns when current project is out of sync
      When `openspec config profile` exits with `No config changes.` inside an OpenSpec project
      And project files are out of sync with the current global profile/delivery
      Then display a non-blocking warning that global config is not yet applied to this project
      And include guidance to run `openspec update` to sync project files

    Scenario: Apply prompt is gated on actual changes
      When config values were changed and saved
      And current directory is an OpenSpec project
      Then prompt `Apply changes to this project now?`
      And if confirmed, run `openspec update` for the current project

  @REQ-0070
  Rule: Key Naming Convention
    The config command SHALL use camelCase keys matching the JSON structure.

    Scenario: Keys match JSON structure
      When accessing configuration keys via CLI
      Then use camelCase matching the actual JSON property names
      And support dot notation for nested access (e.g., `featureFlags.someFlag`)

  @REQ-0071
  Rule: Schema Validation
    The config command SHALL validate configuration writes against the config schema using zod, while rejecting unknown keys for `config set` unless explicitly overridden.

    Scenario: Unknown key rejected by default
      When user executes `openspec config set someFutureKey 123`
      Then display a descriptive error message indicating the key is invalid
      And do not modify the config file
      And exit with code 1

    Scenario: Unknown key accepted with override
      When user executes `openspec config set someFutureKey 123 --allow-unknown`
      Then the value is saved successfully
      And exit with code 0

    Scenario: Invalid feature flag value rejected
      When user executes `openspec config set featureFlags.someFlag notABoolean`
      Then display a descriptive error message
      And do not modify the config file
      And exit with code 1

  @REQ-0072
  Rule: Reserved Scope Flag
    The config command SHALL reserve the `--scope` flag for future extensibility.

    Scenario: Scope flag defaults to global
      When user executes any config command without `--scope`
      Then operate on global configuration (default behavior)

    Scenario: Project scope not yet implemented
      When user executes `openspec config --scope project <subcommand>`
      Then display error message: "Project-local config is not yet implemented"
      And exit with code 1
