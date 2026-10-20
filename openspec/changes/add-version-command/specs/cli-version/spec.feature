Feature: cli-version

  @added @REQ-0290
  Rule: Report the installed version
    The system SHALL provide an `openspec version` command that reports the running OpenSpec version and install context without requiring an OpenSpec project or contacting the network.

    Scenario: Human-readable version report
      When a user runs `openspec version`
      Then the command reports the running OpenSpec version
      And identifies the install's package manager and scope when they can be determined
      And exits successfully without contacting a registry

    Scenario: Machine-readable version report
      When a user runs `openspec version --json`
      Then stdout contains one valid JSON document
      And the document contains `schemaVersion: 1`, `version`, and `install`
      And `install` contains `location`, `packageManager`, and `scope`
      And `scope` is one of `global`, `project`, `temporary`, or `source`
      And values that cannot be determined are represented as `null`

    Scenario: Source checkout
      When the running CLI is a source checkout
      Then the command reports `scope` as `source`
      And it does not claim that a package manager owns the checkout

    Scenario: Existing version flag remains compatible
      When a user runs `openspec --version`
      Then the command prints the same bare version string as before this capability was added
      And no JSON or install metadata is added to that output

  @added @REQ-0291
  Rule: Check for an available update on request
    The system SHALL contact the configured package registry only when `openspec version` receives `--check`, and SHALL report the outcome without making command success depend on registry availability.

    Scenario: Update is available
      When a user runs `openspec version --check`
      And the registry reports a safe newer version
      Then the command reports the latest version
      And reports the appropriate update command only when one exists for this install
      And human-readable output omits package-manager guidance when no such command exists
      And reports whether the existing self-upgrade path can safely update this copy
      And exits successfully

    Scenario: Installed version is current
      When a user runs `openspec version --check`
      And the registry reports no version newer than the running version
      Then the command reports the update status as `current`
      And exits successfully

    Scenario: Update check is disabled
      When a user runs `openspec version --check`
      And an existing OpenSpec privacy or update-check opt-out disables registry access
      Then the command does not contact the registry
      And reports the update status as `disabled`
      And reports no latest version
      And exits successfully

    Scenario: Registry is unavailable
      When a user runs `openspec version --check`
      And the registry cannot be reached or returns an unusable response
      Then the command reports the update status as `offline`
      And reports no latest version
      And exits successfully

    Scenario: Machine-readable update result
      When a user runs `openspec version --check --json`
      Then the base version and install fields remain present
      And the document contains an `update` object with `status`, `latest`, `command`, and `canSelfUpgrade`
      And `status` is one of `available`, `current`, `disabled`, or `offline`
      And unavailable values are represented as `null`
      And stdout contains no text outside the JSON document

  @added @REQ-0292
  Rule: Preserve update-check safeguards
    The version command SHALL use the same privacy, registry, timeout, response-size, redirect, and version-validation safeguards as OpenSpec's existing update check.

    Scenario: Explicit privacy opt-out
      When telemetry is disabled or `DO_NOT_TRACK`, `OPENSPEC_TELEMETRY`, or `OPENSPEC_NO_UPDATE_CHECK` disables outbound checks
      And a user runs `openspec version --check`
      Then the command performs no update-check request
      And reports the update status as `disabled`

    Scenario: Unsafe configured registry
      When the configured registry is rejected by the existing registry safeguards
      And a user runs `openspec version --check`
      Then the command does not fall back to the public registry
      And reports the update status as `disabled`

    Scenario: Untrusted version response
      When the registry response does not contain a version accepted by OpenSpec's existing version validator
      Then the command does not print the untrusted value
      And reports the update status as `offline`

  @added @REQ-0293
  Rule: Version reporting is read-only
    The version command SHALL NOT install, upgrade, or modify OpenSpec, project files, or user configuration.

    Scenario: Update is available
      When `openspec version --check` reports an available update
      Then it reports guidance only
      And does not run a package manager or alter the installed copy

    Scenario: Upgrade option is rejected
      When a user runs `openspec version --upgrade`
      Then the command reports that `--upgrade` is not supported
      And does not attempt an upgrade
