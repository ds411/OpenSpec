Feature: change-creation

  @added @REQ-0254
  Rule: Stack Metadata Scaffolding
    Change creation workflows SHALL support optional dependency metadata for new or split changes.

    Scenario: Create change with stack metadata
      When a change is created with stack metadata inputs
      Then creation SHALL persist metadata fields in change configuration
      And persisted metadata SHALL be validated against change metadata schema rules

    Scenario: Split-generated child metadata
      When child changes are generated from a split workflow
      Then each child SHALL include a `parent` link to the source change
      And SHALL include dependency metadata needed for deterministic sequencing
