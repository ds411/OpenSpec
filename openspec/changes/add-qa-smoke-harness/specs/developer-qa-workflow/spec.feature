Feature: developer-qa-workflow

  @added @REQ-0276
  Rule: Makefile QA Entry Point
    The repository SHALL provide Makefile targets as the primary developer entrypoint for CLI QA flows.

    Scenario: Default QA target runs smoke suite
      When a developer runs `make qa`
      Then the command SHALL execute the non-interactive smoke suite
      And exit with status code 0 only when all smoke scenarios pass

    Scenario: Smoke suite target is directly invokable
      When a developer runs `make qa-smoke`
      Then the command SHALL execute the same smoke suite used by `make qa`
      And return a non-zero exit code on assertion failure

    Scenario: Interactive checklist target exists
      When a developer runs `make qa-interactive`
      Then the command SHALL provide the manual interactive verification checklist
      And SHALL NOT run interactive prompt automation by default

  @added @REQ-0277
  Rule: Sandboxed Smoke Scenario Runner
    The smoke suite SHALL run CLI scenarios in isolated sandboxes so tests are repeatable and do not depend on machine-global state.

    Scenario: Scenario execution is environment-isolated
      When a smoke scenario runs
      Then it SHALL use temporary values for `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, and `CODEX_HOME`
      And global config from the host machine SHALL NOT affect scenario outcomes

    Scenario: Scenario artifacts are captured for review
      When a smoke scenario completes
      Then the runner SHALL capture command output and exit status
      And SHALL capture enough filesystem state to inspect before/after behavior

    Scenario: High-risk workflow coverage exists
      When the smoke suite executes
      Then it SHALL include scenarios covering profile/delivery behavior and migration-sensitive flows
      And include at least:
        """
        - non-interactive tool detection
        - migration when profile is unset
        - delivery cleanup (`both -> skills`, `both -> commands`)
        - commands-only update detection
        """
