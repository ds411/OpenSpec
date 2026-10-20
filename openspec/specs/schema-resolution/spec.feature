Feature: schema-resolution
  Define project-local schema resolution behavior, including precedence order (project-local, then user override, then package built-in) and backward-compatible fallback when `projectRoot` is not provided.

  @REQ-0221
  Rule: Project-local schema resolution
    The system SHALL resolve schemas from the project-local directory (`./openspec/schemas/<name>/`) with highest priority when a `projectRoot` is provided.

    Scenario: Project-local schema takes precedence over user override
      When a schema named "my-workflow" exists at `./openspec/schemas/my-workflow/schema.yaml`
      And a schema named "my-workflow" exists at `~/.local/share/openspec/schemas/my-workflow/schema.yaml`
      And `getSchemaDir("my-workflow", projectRoot)` is called
      Then the system SHALL return the project-local path

    Scenario: Project-local schema takes precedence over package built-in
      When a schema named "spec-driven" exists at `./openspec/schemas/spec-driven/schema.yaml`
      And "spec-driven" is a package built-in schema
      And `getSchemaDir("spec-driven", projectRoot)` is called
      Then the system SHALL return the project-local path

    Scenario: Falls back to user override when no project-local schema
      When no schema named "my-workflow" exists at `./openspec/schemas/my-workflow/`
      And a schema named "my-workflow" exists at `~/.local/share/openspec/schemas/my-workflow/schema.yaml`
      And `getSchemaDir("my-workflow", projectRoot)` is called
      Then the system SHALL return the user override path

    Scenario: Falls back to package built-in when no project-local or user schema
      When no schema named "spec-driven" exists at `./openspec/schemas/spec-driven/`
      And no schema named "spec-driven" exists at `~/.local/share/openspec/schemas/spec-driven/`
      And "spec-driven" is a package built-in schema
      And `getSchemaDir("spec-driven", projectRoot)` is called
      Then the system SHALL return the package built-in path

    Scenario: Backward compatibility when projectRoot not provided
      When `getSchemaDir("my-workflow")` is called without a `projectRoot` parameter
      Then the system SHALL only check user override and package built-in locations
      And the system SHALL NOT check project-local location

  @REQ-0222
  Rule: Project schemas directory helper
    The system SHALL provide a `getProjectSchemasDir(projectRoot)` function that returns the project-local schemas directory path.

    Scenario: Returns correct path
      When `getProjectSchemasDir("/path/to/project")` is called
      Then the system SHALL return `/path/to/project/openspec/schemas`

  @REQ-0223
  Rule: List schemas includes project-local
    The system SHALL include project-local schemas when listing available schemas if `projectRoot` is provided.

    Scenario: Project-local schemas appear in list
      When a schema named "team-flow" exists at `./openspec/schemas/team-flow/schema.yaml`
      And `listSchemas(projectRoot)` is called
      Then the returned list SHALL include "team-flow"

    Scenario: Project-local schema shadows same-named user schema in list
      When a schema named "custom" exists at both project-local and user override locations
      And `listSchemas(projectRoot)` is called
      Then the returned list SHALL include "custom" exactly once

    Scenario: Backward compatibility for listSchemas
      When `listSchemas()` is called without a `projectRoot` parameter
      Then the system SHALL only include user override and package built-in schemas

  @REQ-0224
  Rule: Schema info includes project source
    The system SHALL indicate `source: 'project'` for project-local schemas in `listSchemasWithInfo()` results.

    Scenario: Project-local schema shows project source
      When a schema named "team-flow" exists at `./openspec/schemas/team-flow/schema.yaml`
      And `listSchemasWithInfo(projectRoot)` is called
      Then the schema info for "team-flow" SHALL have `source: 'project'`

    Scenario: User override schema shows user source
      When a schema named "my-custom" exists only at `~/.local/share/openspec/schemas/my-custom/`
      And `listSchemasWithInfo(projectRoot)` is called
      Then the schema info for "my-custom" SHALL have `source: 'user'`

    Scenario: Package built-in schema shows package source
      When "spec-driven" exists only as a package built-in
      And `listSchemasWithInfo(projectRoot)` is called
      Then the schema info for "spec-driven" SHALL have `source: 'package'`

  @REQ-0225
  Rule: Schemas command shows source
    The `openspec schemas` command SHALL display the source of each schema.

    Scenario: Display format includes source
      When user runs `openspec schemas`
      Then the output SHALL show each schema with its source label (project, user, or package)

  @REQ-0226
  Rule: Use config schema as default for new changes
    The system SHALL use the schema field from `openspec/config.yaml` as the default when creating new changes without an explicit `--schema` flag, and SHALL fall back to the planning-home default when the config supplies no schema.

    Scenario: Create change without --schema flag and config exists
      When user runs `openspec new change foo` and config contains `schema: "tdd"`
      Then system creates change with schema "tdd", even when a planning-home default applies

    Scenario: Create change without --schema flag and no config
      When user runs `openspec new change foo`, no config file exists, and no planning-home default applies
      Then system creates change with default schema "spec-driven"

    Scenario: Create change with explicit --schema flag
      When user runs `openspec new change foo --schema custom` and config contains `schema: "tdd"`
      Then system creates change with schema "custom" (CLI flag overrides config)

  @REQ-0227
  Rule: Resolve schema with updated precedence order
    The system SHALL resolve the schema for a change using the following precedence order: CLI flag, change metadata, project config, planning-home default, hardcoded default.

    Scenario: CLI flag is provided
      When user runs command with `--schema custom`
      Then system uses "custom" regardless of change metadata or config

    Scenario: Change metadata specifies schema
      When change has `.openspec.yaml` with `schema: bound` and config has `schema: tdd`
      Then system uses "bound" from change metadata

    Scenario: Only project config specifies schema
      When no CLI flag or change metadata exists, but config has `schema: tdd`
      Then system uses "tdd" from project config, even when a planning-home default applies

    Scenario: No schema specified anywhere
      When no CLI flag, change metadata, project config, or planning-home default
      Then system uses hardcoded default "spec-driven"

  @REQ-0228
  Rule: Support project-local schema names in config
    The system SHALL allow the config schema field to reference project-local schemas defined in `openspec/schemas/`.

    Scenario: Config references project-local schema
      When config contains `schema: "my-workflow"` and `openspec/schemas/my-workflow/` exists
      Then system resolves to the project-local schema

    Scenario: Config references non-existent schema
      When config contains `schema: "nonexistent"` and that schema does not exist
      Then system shows error when attempting to load the schema with fuzzy match suggestions and list of all valid schemas

  @REQ-0229
  Rule: Provide helpful error message for invalid schema
    The system SHALL display schema error with fuzzy match suggestions, list of available schemas, and fix instructions.

    Scenario: Schema name with typo (close match)
      When config contains `schema: "spce-driven"` (typo)
      Then error message includes "Did you mean: spec-driven (built-in)" as suggestion

    Scenario: Schema name with no close matches
      When config contains `schema: "completely-wrong"`
      Then error message shows list of all available built-in and project-local schemas

    Scenario: Error message includes fix instructions
      When config references invalid schema
      Then error message includes "Fix: Edit openspec/config.yaml and change 'schema: X' to a valid schema name"

    Scenario: Error distinguishes built-in vs project-local schemas
      When error lists available schemas
      Then output clearly labels each as "built-in" or "project-local"

  @REQ-0230
  Rule: Maintain backwards compatibility for existing changes
    The system SHALL continue to work with existing changes that do not have project config.

    Scenario: Existing change without config
      When change was created before config feature and no config file exists
      Then system resolves schema using existing logic (change metadata or hardcoded default)

    Scenario: Existing change with config added later
      When config file is added to project with existing changes
      Then existing changes continue to use their bound schema from `.openspec.yaml`
