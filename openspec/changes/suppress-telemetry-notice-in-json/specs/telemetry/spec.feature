Feature: telemetry

  @modified @REQ-0248
  Rule: First-run telemetry notice
    The system SHALL display a one-line telemetry disclosure notice on the first command execution, before any telemetry is sent. In `--json` mode the system SHALL NOT display the notice on that run and SHALL leave `noticeSeen` unset, deferring the disclosure to the first later non-JSON run.

    Scenario: First command execution
      When a user runs their first openspec command without `--json`
      And telemetry is enabled
      Then the system displays: "Note: OpenSpec collects anonymous usage stats. Opt out: OPENSPEC_TELEMETRY=0"

    Scenario: Subsequent command execution
      When a user has already seen the notice (noticeSeen: true in config)
      Then the system does not display the notice

    Scenario: Notice before telemetry
      When displaying the first-run notice
      Then the notice appears before any telemetry event is sent

    Scenario: First command execution in JSON mode
      When a user's first openspec command passes `--json`
      And telemetry is enabled
      Then the system displays no notice on stdout
      And `noticeSeen` remains unset

    Scenario: Disclosure deferred, not skipped
      When a user's first run was in `--json` mode and displayed no notice
      And the user later runs a command without `--json`
      Then the system displays the disclosure notice on that later run
