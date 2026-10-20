Feature: instruction-loader
  The instruction-loader loads instruction templates from schema directories, validates and enriches them with metadata and parameters (such as change context and dependency status), and exposes them for use by downstream services including template retrieval, parameter substitution, and enrichment.

  @REQ-0164
  Rule: Template Loading
    The system SHALL load templates from schema directories.

    Scenario: Load template from schema directory
      When `loadTemplate(schemaName, templatePath)` is called
      Then the system loads the template from `schemas/<schemaName>/templates/<templatePath>`

    Scenario: Template file not found
      When a template file does not exist in the schema's templates directory
      Then the system throws an error with the template path

  @REQ-0165
  Rule: Change Context Loading
    The system SHALL load change context combining graph and completion state.

    Scenario: Load context for existing change
      When `loadChangeContext(projectRoot, changeName)` is called for an existing change
      Then the system returns a context with graph, completed set, schema name, and change info

    Scenario: Load context with custom schema
      When `loadChangeContext(projectRoot, changeName, schemaName)` is called
      Then the system uses the specified schema instead of default

    Scenario: Load context for non-existent change directory
      When `loadChangeContext` is called for a non-existent change directory
      Then the system returns context with empty completed set

  @REQ-0166
  Rule: Template Enrichment
    The system SHALL enrich templates with change-specific context.

    Scenario: Include artifact metadata
      When instructions are generated for an artifact
      Then the output includes change name, artifact ID, schema name, and output path

    Scenario: Include dependency status
      When an artifact has dependencies
      Then the output shows each dependency with completion status (done/missing)

    Scenario: Include unlocked artifacts
      When instructions are generated
      Then the output includes which artifacts become available after this one
      And they are listed in the order the schema declares them, matching the order `openspec status` recommends them

    Scenario: Root artifact indicator
      When an artifact has no dependencies
      Then the dependency section indicates this is a root artifact

  @REQ-0167
  Rule: Status Formatting
    The system SHALL format change status as readable output.

    Scenario: All artifacts completed
      When all artifacts are completed
      Then status shows all artifacts as "done"

    Scenario: Mixed completion status
      When some artifacts are completed
      Then status shows completed as "done", ready as "ready", blocked as "blocked"

    Scenario: Blocked artifact details
      When an artifact is blocked
      Then status shows which dependencies are missing

    Scenario: Include output paths
      When status is formatted
      Then each artifact shows its output path pattern
