Feature: schema-init-command
  Define `openspec schema init` behavior for creating project-local schema skeletons in interactive and non-interactive modes.

  @REQ-0216
  Rule: Schema init command creates project-local schema
    The CLI SHALL provide an `openspec schema init <name>` command that creates a new schema directory under `openspec/schemas/<name>/` with a valid `schema.yaml` file and default template files.

    Scenario: Create schema with valid name
      When user runs `openspec schema init my-workflow`
      Then system creates directory `openspec/schemas/my-workflow/`
      And creates `schema.yaml` with name, version, description, and artifacts array
      And creates template files referenced by artifacts
      And displays success message with created path

    Scenario: Reject invalid schema name
      When user runs `openspec schema init "My Workflow"` (contains space)
      Then system displays error about invalid schema name
      And suggests using kebab-case format
      And exits with non-zero code

    Scenario: Schema name already exists
      When user runs `openspec schema init existing-schema` and `openspec/schemas/existing-schema/` already exists
      Then system displays error that schema already exists
      And suggests using `--force` to overwrite or `schema fork` to copy
      And exits with non-zero code

  @REQ-0217
  Rule: Schema init supports interactive mode
    The CLI SHALL prompt for schema configuration when run in an interactive terminal without explicit flags.

    Scenario: Interactive prompts for description
      When user runs `openspec schema init my-workflow` in an interactive terminal
      Then system prompts for schema description
      And uses provided description in generated `schema.yaml`

    Scenario: Interactive prompts for artifact selection
      When user runs `openspec schema init my-workflow` in an interactive terminal
      Then system displays multi-select prompt with common artifacts (proposal, specs, design, tasks)
      And each option includes a brief description
      And uses selected artifacts in generated `schema.yaml`

    Scenario: Non-interactive mode with flags
      When user runs `openspec schema init my-workflow --description "My workflow" --artifacts proposal,tasks`
      Then system creates schema without prompting
      And uses flag values for configuration

  @REQ-0218
  Rule: Schema init supports setting project default
    The CLI SHALL offer to set the newly created schema as the project default.

    Scenario: Set as default interactively
      When user runs `openspec schema init my-workflow` in interactive mode
      And user confirms setting as default
      Then system updates an existing `openspec/config.yaml` or `openspec/config.yml` in place with `schema: my-workflow`
      And removes the legacy `defaultSchema` key when updating an existing configuration
      And creates `openspec/config.yaml` when neither configuration file exists

    Scenario: Set as default via flag
      When user runs `openspec schema init my-workflow --default`
      Then system creates the schema and updates an existing `openspec/config.yaml` or `openspec/config.yml` in place with `schema: my-workflow`
      And removes the legacy `defaultSchema` key when updating an existing configuration
      And creates `openspec/config.yaml` when neither configuration file exists

    Scenario: Skip setting default
      When user runs `openspec schema init my-workflow --no-default`
      Then system creates schema without modifying `openspec/config.yaml`

    Scenario: Invalid config prevents schema creation
      Given `openspec/config.yaml` or `openspec/config.yml` is invalid YAML, is not a YAML object, is not a regular file, or is not writable
      When user runs `openspec schema init my-workflow --default`
      Then the command exits with a non-zero status
      And does not create `openspec/schemas/my-workflow/`
      And leaves the config byte-for-byte unchanged

    Scenario: Config failure preserves a schema during forced replacement
      Given `openspec/schemas/my-workflow/` already contains user-authored files
      And the project config cannot be validated or atomically replaced
      When user runs `openspec schema init my-workflow --force --default`
      Then the command exits with a non-zero status
      And restores the existing schema and config byte-for-byte

  @REQ-0219
  Rule: Schema init outputs JSON format
    The CLI SHALL support `--json` flag for machine-readable output.

    Scenario: JSON output on success
      When user runs `openspec schema init my-workflow --json --description "Test" --artifacts proposal`
      Then system outputs JSON with `created: true`, `path`, and `schema` fields
      And does not display interactive prompts or spinners

    Scenario: JSON output on error
      When user runs `openspec schema init "invalid name" --json`
      Then system outputs JSON with `error` field describing the issue
      And exits with non-zero code

  @REQ-0220
  Rule: Schema init validates artifacts before forced replacement
    The CLI SHALL validate all requested artifact IDs before replacing an existing project-local schema. If artifact validation fails, the CLI SHALL leave the existing schema directory and all of its contents unchanged on every supported platform.

    Scenario: Unknown artifact preserves existing schema
      Given `openspec/schemas/tdd-driven/` already exists with user-authored files
      When the user runs `schema init tdd-driven` with `--force` and an artifact list containing the unknown ID `task`
      Then the command exits with a non-zero status and reports the unknown artifact
      And the existing `tdd-driven` schema directory and its contents remain unchanged

    Scenario: Unknown artifact preserves a schema at a Windows project path
      Given an existing project-local schema is resolved from a Windows filesystem path
      When forced schema initialization fails artifact validation
      Then the resolved schema directory and its contents remain unchanged

    Scenario: Valid artifacts allow forced replacement
      Given a project-local schema already exists
      When the user runs `schema init` with `--force` and only valid artifact IDs
      Then the command replaces the existing schema with the newly generated schema
      And reports successful creation
