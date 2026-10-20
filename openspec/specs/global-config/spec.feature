Feature: global-config
  This spec defines how OpenSpec resolves, reads, and writes user-level global configuration. It governs the `src/core/global-config.ts` module, which provides the foundation for storing user preferences, feature flags, and settings that persist across projects. The spec ensures cross-platform compatibility by following XDG Base Directory Specification with platform-specific fallbacks, and guarantees forward/backward compatibility through schema evolution rules.

  @REQ-0158
  Rule: Global configuration storage
    The system SHALL store global configuration in `~/.config/openspec/config.json`, including telemetry state with `anonymousId` and `noticeSeen` fields.

    Scenario: Initial config creation
      When no global config file exists
      And the first telemetry event is about to be sent
      Then the system creates `~/.config/openspec/config.json` with telemetry configuration

    Scenario: Telemetry config structure
      When reading or writing telemetry configuration
      Then the config contains a `telemetry` object with `anonymousId` (string UUID) and `noticeSeen` (boolean) fields

    Scenario: Config file format
      When storing configuration
      Then the system writes valid JSON that can be read and modified by users

    Scenario: Existing config preservation
      When adding telemetry fields to an existing config file
      Then the system preserves all existing configuration fields

  @REQ-0159
  Rule: Global Config Directory Path
    The system SHALL resolve the global configuration directory path following XDG Base Directory Specification with platform-specific fallbacks.

    Scenario: Unix/macOS with XDG_CONFIG_HOME set
      When `$XDG_CONFIG_HOME` environment variable is set to `/custom/config`
      Then `getGlobalConfigDir()` returns `/custom/config/openspec`

    Scenario: Unix/macOS without XDG_CONFIG_HOME
      When `$XDG_CONFIG_HOME` environment variable is not set
      And the platform is Unix or macOS
      Then `getGlobalConfigDir()` returns `~/.config/openspec` (expanded to absolute path)

    Scenario: Windows platform
      When the platform is Windows
      And `%APPDATA%` is set to `C:\Users\User\AppData\Roaming`
      Then `getGlobalConfigDir()` returns `C:\Users\User\AppData\Roaming\openspec`

  @REQ-0160
  Rule: Global Config Loading
    The system SHALL load global configuration from the config directory with sensible defaults when the config file does not exist or cannot be parsed.

    Scenario: Config file exists and is valid
      When `config.json` exists in the global config directory
      And the file contains valid JSON matching the config schema
      Then `getGlobalConfig()` returns the parsed configuration

    Scenario: Config file does not exist
      When `config.json` does not exist in the global config directory
      Then `getGlobalConfig()` returns the default configuration
      And no directory or file is created

    Scenario: Config file is invalid JSON
      When `config.json` exists but contains invalid JSON
      Then `getGlobalConfig()` returns the default configuration
      And a warning is logged to stderr

  @REQ-0161
  Rule: Global Config Saving
    The system SHALL save global configuration to the config directory, creating the directory if it does not exist.

    Scenario: Save config to new directory
      When `saveGlobalConfig(config)` is called
      And the global config directory does not exist
      Then the directory is created
      And `config.json` is written with the provided configuration

    Scenario: Save config to existing directory
      When `saveGlobalConfig(config)` is called
      And the global config directory already exists
      Then `config.json` is written (overwriting if exists)

  @REQ-0162
  Rule: Default Configuration
    The system SHALL provide a default configuration that is used when no config file exists.

    Scenario: Default config structure
      When no config file exists
      Then the default configuration includes an empty `featureFlags` object

  @REQ-0163
  Rule: Config Schema Evolution
    The system SHALL merge loaded configuration with default values to ensure new config fields are available even when loading older config files.

    Scenario: Config file missing new fields
      When `config.json` exists with `{ "featureFlags": {} }`
      And the current schema includes a new field `defaultAiTool`
      Then `getGlobalConfig()` returns `{ featureFlags: {}, defaultAiTool: <default> }`
      And the loaded values take precedence over defaults for fields that exist in both

    Scenario: Config file has extra unknown fields
      When `config.json` contains fields not in the current schema
      Then the unknown fields are preserved in the returned configuration
      And no error or warning is raised
