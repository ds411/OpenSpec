Feature: OpenSpec Conventions

  @added @REQ-0260
  Rule: Stack-Aware Change Planning Conventions
    OpenSpec conventions SHALL define optional metadata fields for sequencing and decomposition across concurrent changes.

    Scenario: Declaring change dependencies
      When authors need to sequence related changes
      Then conventions SHALL define how to declare dependencies and provided/required capability markers
      And validation guidance SHALL distinguish hard blockers from soft overlap warnings

    Scenario: Dependency source of truth during migration
      When both stack metadata and `openspec/changes/IMPLEMENTATION_ORDER.md` are present
      Then conventions SHALL treat per-change stack metadata as the normative dependency source
      And `IMPLEMENTATION_ORDER.md` SHALL be treated as optional narrative guidance

    Scenario: Explicit ordering remains required for capability markers
      When authors use `provides` and `requires` markers to describe capability contracts
      Then conventions SHALL require explicit `dependsOn` edges for ordering relationships
      And conventions SHALL prohibit treating `requires` as an implicit dependency edge

    Scenario: Declaring advisory overlap via touches
      When a change may affect capability/spec areas shared by concurrent changes without requiring ordering
      Then conventions SHALL allow authors to declare `touches` with advisory area identifiers (for example capability IDs, spec area names, or paths)
      And tooling SHALL treat `touches` as informational only (no implicit dependency edge, non-blocking validation signal)

    Scenario: Declaring parent-child split structure
      When a large change is decomposed into smaller slices
      Then conventions SHALL define parent-child metadata and expected ordering semantics
      And docs SHALL describe when to split versus keep a single change
