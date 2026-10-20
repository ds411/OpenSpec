Feature: schema-fork-command
  Define `openspec schema fork` behavior for cloning existing schemas into project-local schemas with safe overwrite controls.

  @REQ-0212
  Rule: Schema fork copies existing schema
    The CLI SHALL provide an `openspec schema fork <source> [name]` command that copies an existing schema to the project's `openspec/schemas/` directory.

    Scenario: Fork with explicit name
      When user runs `openspec schema fork spec-driven my-custom`
      Then system locates `spec-driven` schema using resolution order (project → user → package)
      And copies all files to `openspec/schemas/my-custom/`
      And updates `name` field in `schema.yaml` to `my-custom`
      And displays success message with source and destination paths

    Scenario: Fork with default name
      When user runs `openspec schema fork spec-driven` without specifying a name
      Then system copies to `openspec/schemas/spec-driven-custom/`
      And updates `name` field in `schema.yaml` to `spec-driven-custom`

    Scenario: Source schema not found
      When user runs `openspec schema fork nonexistent`
      Then system displays error that schema was not found
      And lists available schemas
      And exits with non-zero code

  @REQ-0213
  Rule: Schema fork prevents accidental overwrites
    The CLI SHALL require confirmation or `--force` flag when the destination schema already exists.

    Scenario: Destination exists without force
      When user runs `openspec schema fork spec-driven my-custom` and `openspec/schemas/my-custom/` exists
      Then system displays error that destination already exists
      And suggests using `--force` to overwrite
      And exits with non-zero code

    Scenario: Destination exists with force flag
      When user runs `openspec schema fork spec-driven my-custom --force` and destination exists
      Then system removes existing destination directory
      And copies source schema to destination
      And displays success message

    Scenario: Interactive confirmation for overwrite
      When user runs `openspec schema fork spec-driven my-custom` in interactive mode and destination exists
      Then system prompts for confirmation to overwrite
      And proceeds based on user response

  @REQ-0214
  Rule: Schema fork preserves all schema files
    The CLI SHALL copy the complete schema directory including templates, configuration, and any additional files.

    Scenario: Copy includes template files
      When user forks a schema with template files (e.g., `proposal.md`, `design.md`)
      Then all template files are copied to the destination
      And template file contents are unchanged

    Scenario: Copy includes nested directories
      When user forks a schema with nested directories (e.g., `templates/specs/`)
      Then nested directory structure is preserved
      And all nested files are copied

  @REQ-0215
  Rule: Schema fork outputs JSON format
    The CLI SHALL support `--json` flag for machine-readable output.

    Scenario: JSON output on success
      When user runs `openspec schema fork spec-driven my-custom --json`
      Then system outputs JSON with `forked: true`, `source`, `destination`, and `sourcePath` fields

    Scenario: JSON output shows source location
      When user runs `openspec schema fork spec-driven --json`
      Then JSON output includes `sourceLocation` field indicating "project", "user", or "package"
