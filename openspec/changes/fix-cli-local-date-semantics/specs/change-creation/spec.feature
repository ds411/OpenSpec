Feature: change-creation

  @added @REQ-0318
  Rule: Local Creation Date Metadata
    The system SHALL record the `created` value in metadata for a newly created change as the `YYYY-MM-DD` calendar date in the effective local time zone of the Node.js process executing the CLI.

    Scenario: Create change across a UTC date boundary
      Given the CLI process's effective local time zone is `Asia/Shanghai`
      And the current instant is `2026-07-14T16:30:00.000Z`
      When the user creates a change
      Then the new change's `.openspec.yaml` contains `created: 2026-07-15`
