Feature: change-stacking-workflow

  @added @REQ-0255
  Rule: Stack Metadata Model
    The system SHALL support optional metadata on active changes to express sequencing and decomposition relationships.

    Scenario: Optional stack metadata is present
      When a change includes stack metadata fields
      Then the system SHALL parse and expose `dependsOn`, `provides`, `requires`, `touches`, and `parent`
      And validation SHALL enforce normalized field shapes and value types (`dependsOn`/`provides`/`requires`/`touches` as string arrays, `parent` as string when present)

    Scenario: Backward compatibility without stack metadata
      When a change does not include stack metadata
      Then existing behavior SHALL continue without migration steps
      And validation SHALL not fail solely because stack metadata is absent

  @added @REQ-0256
  Rule: Change Dependency Graph
    The system SHALL provide dependency-aware ordering for active changes.

    Scenario: Build dependency order
      When users request stack planning output
      Then the system SHALL compute a dependency graph across active changes
      And SHALL return a deterministic topological order for unblocked changes

    Scenario: Tie-breaking within the same dependency depth
      When multiple unblocked changes share the same topological dependency depth
      Then ordering SHALL break ties lexicographically by change ID
      And repeated runs over the same input SHALL return the same order

    Scenario: Dependency cycle detection
      When active changes contain a dependency cycle
      Then validation SHALL fail with cycle details before archive or sequencing actions proceed
      And output SHALL include actionable guidance to break the cycle

  @added @REQ-0257
  Rule: Capability marker and overlap semantics
    The system SHALL treat capability markers as validation contracts and `touches` as advisory overlap signals.

    Scenario: Required capability provided by an active change
      When change B declares `requires` marker `X`
      And active change A declares `provides` marker `X`
      Then validation SHALL require B to declare an explicit ordering edge in `dependsOn` to at least one active provider of `X`
      And validation SHALL fail if no explicit dependency is declared

    Scenario: Requires marker without active provider
      When a change declares a `requires` marker
      And no active change declares the corresponding `provides` marker
      Then validation SHALL NOT infer an implicit dependency edge
      And ordering SHALL continue to be determined solely by explicit `dependsOn` relationships

    Scenario: Requires marker satisfied by archived history
      When a change declares a `requires` marker
      And no active change provides that marker
      And at least one archived change in history provides that marker
      Then validation SHALL NOT warn solely about missing provider
      And SHALL continue to use explicit `dependsOn` for active ordering

    Scenario: Requires marker missing in full history
      When a change declares a `requires` marker
      And no active or archived change in history provides that marker
      Then validation SHALL emit a non-blocking warning naming the change and missing marker
      And SHALL NOT infer an implicit dependency edge

    Scenario: Overlap warning for shared touches
      When multiple active changes declare overlapping `touches` values
      Then validation SHALL emit a warning listing the overlapping changes and touched areas
      And validation SHALL NOT fail solely on overlap
