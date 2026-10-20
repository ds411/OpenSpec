Feature: cli-change
  Define `openspec change` command behavior for showing, listing, and validating change proposals and deltas.

  @REQ-0046
  Rule: Change Command
    The system SHALL provide a `change` command with subcommands for displaying, listing, and validating change proposals.

    Scenario: Show change as JSON
      When executing `openspec change show update-error --json`
      Then parse the markdown change file
      And extract change structure and deltas
      And output valid JSON to stdout

    Scenario: List all changes
      When executing `openspec change list`
      Then scan the openspec/changes directory
      And return list of all pending changes
      And support JSON output with `--json` flag

    Scenario: Show only requirement changes
      When executing `openspec change show update-error --requirements-only`
      Then display only the requirement changes (ADDED/MODIFIED/REMOVED/RENAMED)
      And exclude why and what changes sections

    Scenario: Validate change structure
      When executing `openspec change validate update-error`
      Then parse the change file
      And validate against Zod schema
      And ensure deltas are well-formed

  @REQ-0047
  Rule: Legacy Compatibility
    The system SHALL retain `openspec change list` as a deprecated alias for listing active changes and direct users to `openspec list`.

    Scenario: Legacy list command
      When executing `openspec change list`
      Then display the current list of active changes on stdout
      And write `Warning: "openspec change list" is deprecated. Use "openspec list".` to stderr

    Scenario: Legacy list with JSON output
      When executing `openspec change list --json`
      Then output the active changes as a JSON array on stdout
      And write the deprecation warning to stderr without corrupting the JSON output

    Scenario: Unsupported legacy list flag
      When executing `openspec change list --all`
      Then reject the unknown option with a nonzero exit code

    Scenario: Preferred list command
      When executing `openspec list`
      Then display the current list of active changes without a deprecation warning

  @REQ-0048
  Rule: Interactive show selection
    The change show command SHALL support interactive selection when no change name is provided.

    Scenario: Interactive change selection for show
      When executing `openspec change show` without arguments
      Then display an interactive list of available changes
      And allow the user to select a change to show
      And display the selected change content
      And maintain all existing show options (--json, --deltas-only)

    Scenario: Non-interactive fallback keeps current behavior
      Given stdin is not a TTY or `--no-interactive` is provided or environment variable `OPEN_SPEC_INTERACTIVE=0`
      When executing `openspec change show` without a change name
      Then do not prompt interactively
      And print the existing hint including available change IDs
      And set `process.exitCode = 1`

  @REQ-0049
  Rule: Interactive validation selection
    The change validate command SHALL support interactive selection when no change name is provided.

    Scenario: Interactive change selection for validation
      When executing `openspec change validate` without arguments
      Then display an interactive list of available changes
      And allow the user to select a change to validate
      And validate the selected change

    Scenario: Non-interactive fallback keeps current behavior
      Given stdin is not a TTY or `--no-interactive` is provided or environment variable `OPEN_SPEC_INTERACTIVE=0`
      When executing `openspec change validate` without a change name
      Then do not prompt interactively
      And print the existing hint including available change IDs
      And set `process.exitCode = 1`
