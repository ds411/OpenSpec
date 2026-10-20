Feature: template-artifact-pipeline
  Define a unified architecture for workflow template generation that centralizes workflow definitions, tool capability wiring, transform execution, and artifact synchronization while preserving output fidelity.

  @added @REQ-0355
  Rule: Canonical Workflow Manifest
    The system SHALL define a canonical workflow manifest as the single source of truth for generated skill and command artifacts.

    Scenario: Register workflow once
      When a workflow (for example `explore`, `ff`, or `onboard`) is added or modified
      Then its canonical definition SHALL be registered once in the workflow manifest
      And skill/command projections SHALL be derived from that manifest
      And duplicate hand-maintained lists SHALL NOT be required

    Scenario: Required skill metadata
      When defining a workflow skill entry in the manifest
      Then it SHALL include required metadata fields (`license`, `compatibility`, and `metadata`)
      And generation SHALL use those values or explicit defaults in a consistent way for all workflows

  @added @REQ-0356
  Rule: Tool Profile Registry
    The system SHALL define a tool profile registry that captures generation capabilities per tool.

    Scenario: Resolve tool capabilities
      When generating artifacts for a selected tool
      Then the system SHALL resolve a tool profile that declares skill path capability, command adapter linkage, and transform set
      And tools with skills support but no command adapter SHALL be handled explicitly without implicit fallback behavior

    Scenario: Capability consistency validation
      When running validation checks
      Then the system SHALL detect mismatches between configured tools, profile definitions, and registered adapters
      And fail with actionable errors in development/CI

  @added @REQ-0357
  Rule: Ordered Transform Pipeline
    The system SHALL support ordered artifact transforms with explicit scope and phase semantics.

    Scenario: Execute pre-adapter and post-adapter transforms
      When generating an artifact
      Then matching transforms SHALL execute in deterministic order based on phase and priority
      And `preAdapter` transforms SHALL run before command adapter formatting
      And `postAdapter` transforms SHALL run after adapter formatting

    Scenario: Apply tool-specific rewrites declaratively
      When a tool requires instruction rewrites (for example command reference syntax changes)
      Then those rewrites SHALL be implemented as registered transforms with explicit applicability predicates
      And generation entry points SHALL NOT implement ad-hoc rewrite logic

  @added @REQ-0358
  Rule: Shared Artifact Sync Engine
    The system SHALL provide a shared artifact sync engine used by all generation entry points.

    Scenario: Init and update use same engine
      When `openspec init` or `openspec update` writes skills/commands
      Then both flows SHALL use the same orchestration engine for planning, rendering, validating, and writing artifacts
      And behavior differences SHALL be configuration-driven rather than separate duplicated loops

    Scenario: Legacy upgrade path reuses engine
      When legacy cleanup triggers artifact regeneration
      Then the regeneration path SHALL use the same shared engine
      And generated outputs SHALL follow the same transform and validation rules

  @added @REQ-0359
  Rule: Fidelity Guardrails
    The system SHALL enforce guardrails that prevent output drift during refactors.

    Scenario: Projection parity checks
      When CI runs template generation tests
      Then it SHALL verify manifest-derived projections remain consistent (workflows, command IDs, skill directories)
      And detect missing exports or missing workflow registration

    Scenario: Output parity checks
      When running parity tests for representative workflow/tool combinations
      Then generated artifacts SHALL remain behaviorally equivalent to approved baselines unless intentionally changed
      And intentional changes SHALL be captured in explicit spec/proposal updates
