Feature: CLI Archive Command

  @added @REQ-0319
  Rule: Local Archive Date
    The archive command SHALL derive the `YYYY-MM-DD` prefix of a new archive target from the calendar date in the effective local time zone of the Node.js process executing the CLI.

    Scenario: Archive crosses a UTC date boundary
      Given the CLI process's effective local time zone is `Asia/Shanghai`
      And the current instant is `2026-07-14T16:30:00.000Z`
      When the user archives a change named `add-auth`
      Then the target archive name begins with `2026-07-15-add-auth`

    Scenario: Non-interactive archive uses the local date
      When an automation invokes `openspec archive <change-name> --yes`
      Then the target archive name uses the CLI process's effective local calendar date
