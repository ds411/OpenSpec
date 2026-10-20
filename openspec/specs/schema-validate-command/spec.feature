Feature: schema-validate-command
  Define `openspec schema validate` behavior for validating schema syntax, structure, templates, and dependency graphs.

  @REQ-0231
  Rule: Schema validate checks schema structure
    The CLI SHALL provide an `openspec schema validate [name]` command that validates schema configuration and reports errors.

    Scenario: Validate specific schema
      When user runs `openspec schema validate my-workflow`
      Then system locates schema using resolution order
      And validates `schema.yaml` against the schema Zod type
      And displays validation result (valid or list of errors)

    Scenario: Validate all project schemas
      When user runs `openspec schema validate` without a name
      Then system validates all schemas in `openspec/schemas/`
      And displays results for each schema
      And exits with non-zero code if any schema is invalid

    Scenario: Schema not found
      When user runs `openspec schema validate nonexistent`
      Then system displays error that schema was not found
      And exits with non-zero code

  @REQ-0232
  Rule: Schema validate checks YAML syntax
    The CLI SHALL report YAML parsing errors with line numbers when possible.

    Scenario: Invalid YAML syntax
      When user runs `openspec schema validate my-workflow` and `schema.yaml` has syntax errors
      Then system displays YAML parse error with line number
      And exits with non-zero code

    Scenario: Valid YAML but missing required fields
      When `schema.yaml` is valid YAML but missing `name` field
      Then system displays Zod validation error for missing required field
      And identifies the specific missing field

  @REQ-0233
  Rule: Schema validate checks template existence
    The CLI SHALL verify that all template files referenced by artifacts exist.

    Scenario: Missing template file
      When artifact references `template: proposal.md` but file doesn't exist in schema directory
      Then system reports error: "Template file 'proposal.md' not found for artifact 'proposal'"
      And exits with non-zero code

    Scenario: All templates exist
      When all artifact templates exist
      Then system reports that templates are valid
      And template existence is included in validation summary

  @REQ-0234
  Rule: Schema validate checks dependency graph
    The CLI SHALL verify that artifact dependencies form a valid directed acyclic graph.

    Scenario: Valid dependency graph
      When artifact dependencies form a valid DAG (e.g., tasks → specs → proposal)
      Then system reports dependency graph is valid

    Scenario: Circular dependency detected
      When artifact A requires B and artifact B requires A
      Then system reports circular dependency error
      And identifies the artifacts involved in the cycle
      And exits with non-zero code

    Scenario: Unknown dependency reference
      When artifact requires `nonexistent-artifact`
      Then system reports error: "Artifact 'x' requires unknown artifact 'nonexistent-artifact'"
      And exits with non-zero code

  @REQ-0235
  Rule: Schema validate outputs JSON format
    The CLI SHALL support `--json` flag for machine-readable validation results.

    Scenario: JSON output for valid schema
      When user runs `openspec schema validate my-workflow --json` and schema is valid
      Then system outputs JSON with `valid: true`, `name`, and `path` fields

    Scenario: JSON output for invalid schema
      When user runs `openspec schema validate my-workflow --json` and schema has errors
      Then system outputs JSON with `valid: false` and `issues` array
      And each issue includes `level`, `path`, and `message` fields
      And format matches existing `openspec validate` output structure

  @REQ-0236
  Rule: Schema validate supports verbose mode
    The CLI SHALL support `--verbose` flag for detailed validation information.

    Scenario: Verbose output shows all checks
      When user runs `openspec schema validate my-workflow --verbose`
      Then system displays each validation check as it runs
      And shows pass/fail status for: YAML parsing, Zod validation, template existence, dependency graph
