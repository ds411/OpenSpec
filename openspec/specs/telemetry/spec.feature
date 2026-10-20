Feature: telemetry
  This spec defines how OpenSpec collects anonymous usage telemetry to help improve the tool. It governs the `src/telemetry/` module, which handles PostHog integration, privacy-preserving event design, user opt-out mechanisms, and first-run notice display. The spec ensures telemetry is minimal, transparent, and respects user privacy.

  @REQ-0244
  Rule: Command execution tracking
    The system SHALL send a `command_executed` event to PostHog when any CLI command executes, including only the command name and OpenSpec version as properties.

    Scenario: Standard command execution
      When a user runs any openspec command
      Then the system sends a `command_executed` event with `command` and `version` properties

    Scenario: Subcommand execution
      When a user runs a nested command like `openspec change apply`
      Then the system sends a `command_executed` event with the full command path (e.g., `change:apply`)

  @REQ-0245
  Rule: Privacy-preserving event design
    The system SHALL NOT include command arguments, file paths, project names, spec content, error messages, or IP addresses in telemetry events.

    Scenario: Command with arguments
      When a user runs `openspec init my-project --force`
      Then the telemetry event contains only `command: "init"` and `version: "<version>"` without arguments

    Scenario: IP address exclusion
      When the system sends a telemetry event
      Then the event explicitly sets `$ip: null` to prevent IP tracking

  @REQ-0246
  Rule: Environment variable opt-out
    The system SHALL disable telemetry when `OPENSPEC_TELEMETRY=0` or `DO_NOT_TRACK=1` environment variables are set.

    Scenario: OPENSPEC_TELEMETRY opt-out
      When `OPENSPEC_TELEMETRY=0` is set in the environment
      Then the system sends no telemetry events

    Scenario: DO_NOT_TRACK opt-out
      When `DO_NOT_TRACK=1` is set in the environment
      Then the system sends no telemetry events

    Scenario: Environment variable takes precedence
      When the user has previously used the CLI (config exists)
      And the user sets `OPENSPEC_TELEMETRY=0`
      Then telemetry is disabled regardless of config state

  @REQ-0247
  Rule: CI environment auto-disable
    The system SHALL automatically disable telemetry when `CI=true` environment variable is detected.

    Scenario: CI environment detection
      When `CI=true` is set in the environment
      Then the system sends no telemetry events

    Scenario: CI with explicit enable
      When `CI=true` is set
      And `OPENSPEC_TELEMETRY=1` is explicitly set
      Then telemetry remains disabled (CI takes precedence for privacy)

  @REQ-0248
  Rule: First-run telemetry notice
    The system SHALL display a one-line telemetry disclosure notice on the first command execution, before any telemetry is sent.

    Scenario: First command execution
      When a user runs their first openspec command
      And telemetry is enabled
      Then the system displays: "Note: OpenSpec collects anonymous usage stats. Opt out: OPENSPEC_TELEMETRY=0 or openspec config set telemetry.enabled false"

    Scenario: Subsequent command execution
      When a user has already seen the notice (noticeSeen: true in config)
      Then the system does not display the notice

    Scenario: Notice before telemetry
      When displaying the first-run notice
      Then the notice appears before any telemetry event is sent

  @REQ-0249
  Rule: Anonymous user identification
    The system SHALL generate a random UUID as an anonymous identifier on first telemetry send, stored in global config.

    Scenario: First telemetry event
      When the first telemetry event is sent
      And no anonymousId exists in config
      Then the system generates a random UUID v4 and stores it in config

    Scenario: Persistent identity
      When a user runs multiple commands across sessions
      Then the same anonymousId is used for all events

    Scenario: Lazy generation with opt-out
      When a user opts out before running any command
      Then no anonymousId is ever generated or stored

  @REQ-0250
  Rule: Immediate event sending
    The system SHALL send telemetry events immediately without batching, using `flushAt: 1` and `flushInterval: 0` configuration.

    Scenario: Event transmission timing
      When a command executes
      Then the telemetry event is sent immediately, not queued for batch transmission

  @REQ-0251
  Rule: Graceful shutdown
    The system SHALL call `posthog.shutdown()` before CLI exit to ensure pending events are flushed.

    Scenario: Normal exit
      When a command completes successfully
      Then the system awaits `shutdown()` before exiting

    Scenario: Error exit
      When a command fails with an error
      Then the system still awaits `shutdown()` before exiting

  @REQ-0252
  Rule: Silent failure handling
    The system SHALL silently ignore telemetry failures without affecting CLI functionality.

    Scenario: Network failure
      When the telemetry request fails due to network error
      Then the CLI command completes normally without error message

    Scenario: PostHog outage
      When PostHog service is unavailable
      Then the CLI command completes normally without error message

    Scenario: Shutdown failure
      When `shutdown()` fails or times out
      Then the CLI exits normally without error message
