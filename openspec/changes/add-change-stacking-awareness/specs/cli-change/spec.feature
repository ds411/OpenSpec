Feature: cli-change

  @added @REQ-0258
  Rule: Stack Planning Commands
    The change CLI SHALL provide commands for dependency-aware sequencing of active changes.

    Scenario: Show dependency graph
      When a user runs `openspec change graph`
      Then the CLI SHALL display dependency relationships for active changes
      And SHALL include a deterministic recommended order for execution

    Scenario: Show next unblocked changes
      When a user runs `openspec change next`
      Then the CLI SHALL list changes that are not blocked by unresolved dependencies
      And SHALL use deterministic tie-breaking when multiple options are available

  @added @REQ-0259
  Rule: Split Large Change Scaffolding
    The change CLI SHALL support scaffolding child slices from an existing large change.

    Scenario: Split command scaffolds child changes
      When a user runs `openspec change split <change-id>`
      Then the CLI SHALL create child change directories with proposal/tasks stubs
      And generated metadata SHALL include `parent` and dependency links back to the source change

    Scenario: Re-running split on an already-split change
      When a user runs `openspec change split <change-id>` for a parent whose generated child directories already exist
      Then the CLI SHALL fail with a deterministic, actionable error
      And SHALL NOT mutate existing child change content unless an explicit overwrite mode is requested
