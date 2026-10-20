Feature: cli-spec
  Define `openspec spec` command behavior for listing, showing, and validating source-of-truth specifications.

  @REQ-0106
  Rule: Interactive spec show
    The spec show command SHALL support interactive selection when no spec-id is provided.

    Scenario: Interactive spec selection for show
      When executing `openspec spec show` without arguments
      Then display an interactive list of available specs
      And allow the user to select a spec to show
      And display the selected spec content
      And maintain all existing show options (--json, --requirements, --no-scenarios, -r)

    Scenario: Non-interactive fallback keeps current behavior
      Given stdin is not a TTY or `--no-interactive` is provided or environment variable `OPEN_SPEC_INTERACTIVE=0`
      When executing `openspec spec show` without a spec-id
      Then do not prompt interactively
      And print the existing error message for missing spec-id
      And set non-zero exit code

  @REQ-0107
  Rule: Spec Command
    The system SHALL provide a `spec` command with subcommands for displaying, listing, and validating specifications.

    Scenario: Show spec as JSON
      When executing `openspec spec show init --json`
      Then parse the markdown spec file
      And extract headings and content hierarchically
      And output valid JSON to stdout

    Scenario: List all specs
      When executing `openspec spec list`
      Then scan the openspec/specs directory
      And return list of all available capabilities
      And support JSON output with `--json` flag

    Scenario: Filter spec content
      When executing `openspec spec show init --requirements`
      Then display only requirement names and SHALL statements
      And exclude scenario content

    Scenario: Validate spec structure
      When executing `openspec spec validate init`
      Then parse the spec file
      And validate against Zod schema
      And report any structural issues

  @REQ-0108
  Rule: JSON Schema Definition
    The system SHALL define Zod schemas that accurately represent the spec structure for runtime validation.

    Scenario: Schema validation
      When parsing a spec into JSON
      Then validate the structure using Zod schemas
      And ensure all required fields are present
      And provide clear error messages for validation failures

  @REQ-0109
  Rule: Interactive spec validation
    The spec validate command SHALL support interactive selection when no spec-id is provided.

    Scenario: Interactive spec selection for validation
      When executing `openspec spec validate` without arguments
      Then display an interactive list of available specs
      And allow the user to select a spec to validate
      And validate the selected spec
      And maintain all existing validation options (--strict, --json)

    Scenario: Non-interactive fallback keeps current behavior
      Given stdin is not a TTY or `--no-interactive` is provided or environment variable `OPEN_SPEC_INTERACTIVE=0`
      When executing `openspec spec validate` without a spec-id
      Then do not prompt interactively
      And print the existing error message for missing spec-id
      And set non-zero exit code
