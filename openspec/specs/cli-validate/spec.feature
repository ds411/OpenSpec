Feature: cli-validate
  Define `openspec validate` behavior for validating changes and specs with actionable remediation guidance and structured output.

  @REQ-0117
  Rule: Validation SHALL provide actionable remediation steps
    Validation output SHALL include specific guidance to fix each error, including expected structure, example headers, and suggested commands to verify fixes.

    Scenario: No deltas found in change
      When validating a change with zero parsed deltas
      Then show error "No deltas found" with guidance:
        """
        - Explain that change specs must include `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, or `## RENAMED Requirements`
        - Remind authors that files must live under `openspec/changes/{id}/specs/<capability-path>/spec.md`
        - Include an explicit note: "Spec delta files cannot start with titles before the operation headers"
        - Suggest running `openspec change show {id} --json --deltas-only` for debugging
        """

    Scenario: Missing required sections
      When a required section is missing
      Then include expected header names and a minimal skeleton:
        """
        - For Spec: `## Purpose`, `## Requirements`
        - For Change: `## Why`, `## What Changes`
        - Provide an example snippet of the missing section with placeholder prose ready to copy
        - Mention the quick-reference section in `openspec/AGENTS.md` as the authoritative template
        """

    Scenario: Missing requirement descriptive text
      When a requirement header lacks descriptive text before scenarios
      Then emit an error explaining that `### Requirement:` lines must be followed by narrative text before any `#### Scenario:` headers
        """
        - Show compliant example: "### Requirement: Foo" followed by "The system SHALL ..."
        - Suggest adding 1-2 sentences describing the normative behavior prior to listing scenarios
        - Reference the pre-validation checklist in `openspec/AGENTS.md`
        """

  @REQ-0118
  Rule: Validator SHALL detect likely misformatted scenarios and warn with a fix
    The validator SHALL recognize bulleted lines that look like scenarios (e.g., lines beginning with WHEN/THEN/AND) and emit a targeted warning with a conversion example to `#### Scenario:`.

    Scenario: Bulleted WHEN/THEN under a Requirement
      When bullets that start with WHEN/THEN/AND are found under a requirement without any `#### Scenario:` headers
      Then emit warning: "Scenarios must use '#### Scenario:' headers", and show a conversion template:
        """
        #### Scenario: Short name
        - **WHEN** ...
        - **THEN** ...
        - **AND** ...
        """

  @REQ-0119
  Rule: Normative keyword guidance SHALL not require English
    The validation report SHALL include a warning for a non-empty requirement body without the literal English keywords `SHALL` or `MUST`. Normal validation SHALL remain valid when that warning is the only issue, while strict validation SHALL remain invalid because strict mode treats warnings as failures.

    A requirement with no body content before its scenarios SHALL remain an error.

    Scenario: Non-English main spec
      When a main spec has a non-empty requirement body written without the English keywords `SHALL` or `MUST`
      Then the validation report includes an RFC 2119 guidance warning
      And normal validation succeeds

    Scenario: Non-English change delta
      When an ADDED or MODIFIED requirement has a non-empty body written without the English keywords `SHALL` or `MUST`
      Then the validation report includes an RFC 2119 guidance warning
      And normal validation succeeds

    Scenario: Strict validation preserves keyword enforcement
      When the same main spec or change is validated in strict mode
      Then the warning causes validation to fail

    Scenario: Requirement body is missing
      When a requirement has no body content before its scenarios
      Then validation reports an error

  @REQ-0120
  Rule: All issues SHALL include file paths and structured locations
    Error, warning, and info messages SHALL include:
    - Source file path (`openspec/changes/{id}/proposal.md`, `.../specs/{cap}/spec.md`)
    - Structured path (e.g., `deltas[0].requirements[0].scenarios`)

    Scenario: Zod validation error
      When a schema validation fails
      Then the message SHALL include `file`, `path`, and a remediation hint if applicable

  @REQ-0121
  Rule: Invalid results SHALL include a Next steps footer in human-readable output
    The CLI SHALL append a Next steps footer when the item is invalid and not using `--json`, including:
    - Summary line with counts
    - Top-3 guidance bullets (contextual to the most frequent or blocking errors)
    - A suggestion to re-run with `--json` and/or the debug command

    Scenario: Change invalid summary
      When a change validation fails
      Then print "Next steps" with 2-3 targeted bullets and suggest `openspec change show <id> --json --deltas-only`

  @REQ-0122
  Rule: Change validation SHALL report scenarios a MODIFIED block would drop
    The `validate` command SHALL compare every `MODIFIED` requirement in a change against the main specs and report, as an error naming the delta file, each scenario the main spec still has that the `MODIFIED` block omits. A `MODIFIED` requirement replaces the whole requirement block, so archive refuses to apply one that drops a scenario; this is the same check, run without writing anything.

    The comparison SHALL match archive's operation order, comparing a `MODIFIED` that names the new header of a rename against the renamed requirement's scenarios.

    The check SHALL be silent when the main spec file or the requirement header is absent, because a `MODIFIED` written against a base that has not landed yet is a separate condition that archive gates. A main spec that exists but cannot be read SHALL be reported instead, since archive fails on it too.

    Validation run inside `openspec archive` SHALL NOT report these issues, because archive enforces the same check when it applies the deltas.

    Scenario: MODIFIED omits an existing scenario
      Given the main spec's requirement has scenarios "A" and "B"
      When a change MODIFIES that requirement with only scenario "A" and `openspec validate <change>` runs
      Then report an error naming the delta file and scenario "B"
      And exit with code 1

    Scenario: MODIFIED names the new header of a rename
      Given the main spec has requirement "A" with scenarios "S1" and "S2"
      When a change renames "A" to "B" and MODIFIES "B" with only scenario "S1"
      Then report an error naming scenario "S2"

    Scenario: MODIFIED header is not in the main spec
      Given a change MODIFIES a requirement header the main spec does not contain
      When `openspec validate <change>` runs
      Then do not report a dropped-scenario error for that requirement

  @REQ-0123
  Rule: Top-level validate command
    The CLI SHALL provide a top-level `validate` command for validating changes and specs with flexible selection options.

    Scenario: Interactive validation selection
      When executing `openspec validate` without arguments
      Then prompt user to select what to validate (all, changes, specs, or specific item)
      And perform validation based on selection
      And display results with appropriate formatting

    Scenario: Non-interactive environments do not prompt
      Given stdin is not a TTY or `--no-interactive` is provided or environment variable `OPEN_SPEC_INTERACTIVE=0`
      When executing `openspec validate` without arguments
      Then do not prompt interactively
      And print a helpful hint listing available commands/flags and exit with code 1

    Scenario: Direct item validation
      When executing `openspec validate <item-name>`
      Then automatically detect if item is a change or spec
      And validate the specified item
      And display validation results

  @REQ-0124
  Rule: Bulk and filtered validation
    The validate command SHALL support flags for bulk validation (--all) and filtered validation by type (--changes, --specs).

    Scenario: Validate everything
      When executing `openspec validate --all`
      Then validate all changes in openspec/changes/ (excluding archive)
      And validate all specs in openspec/specs/
      And display a summary showing passed/failed items
      And exit with code 1 if any validation fails

    Scenario: Scope of bulk validation
      When validating with `--all` or `--changes`
      Then include all change proposals under `openspec/changes/`
      And exclude the `openspec/changes/archive/` directory
      When validating with `--specs`
      Then include all specs that have a `spec.md` under `openspec/specs/<capability-path>/spec.md`

    Scenario: Validate all changes
      When executing `openspec validate --changes`
      Then validate all changes in openspec/changes/ (excluding archive)
      And display results for each change
      And show summary statistics

    Scenario: Validate all specs
      When executing `openspec validate --specs`
      Then validate all specs in openspec/specs/
      And display results for each spec
      And show summary statistics

  @REQ-0125
  Rule: Validation options and progress indication
    The validate command SHALL support standard validation options (--strict, --json) and display progress during bulk operations.

    Scenario: Strict validation
      When executing `openspec validate --all --strict`
      Then apply strict validation to all items
      And treat warnings as errors
      And fail if any item has warnings or errors

    Scenario: JSON output
      When executing `openspec validate --all --json`
      Then output validation results as JSON
      And include detailed issues for each item
      And include summary statistics

    Scenario: JSON output schema for bulk validation
      When executing `openspec validate --all --json` (or `--changes` / `--specs`)
      Then output a JSON object with the following shape:
        """
        - `items`: Array of objects with fields `{ id: string, type: "change"|"spec", valid: boolean, issues: Issue[], durationMs: number }`
        - `summary`: Object `{ totals: { items: number, passed: number, failed: number }, byType: { change?: { items: number, passed: number, failed: number }, spec?: { items: number, passed: number, failed: number } } }`
        - `version`: String identifier for the schema (e.g., `"1.0"`)
        """
      And exit with code 1 if any `items[].valid === false`
        """
        Where `Issue` follows the existing per-item validation report shape `{ level: "ERROR"|"WARNING"|"INFO", path: string, message: string }`.
        """

    Scenario: Show validation progress
      When validating multiple items (--all, --changes, or --specs)
      Then show progress indicator or status updates
      And indicate which item is currently being validated
      And display running count of passed/failed items

    Scenario: Concurrency limits for performance
      When validating multiple items
      Then run validations with a bounded concurrency (e.g., 4–8 in parallel)
      And ensure progress indicators remain responsive

  @REQ-0126
  Rule: Item type detection and ambiguity handling
    The validate command SHALL handle ambiguous names and explicit type overrides to ensure clear, deterministic behavior.

    Scenario: Direct item validation with automatic type detection
      When executing `openspec validate <item-name>`
      Then if `<item-name>` uniquely matches a change or a spec, validate that item

    Scenario: Ambiguity between change and spec names
      Given `<item-name>` exists both as a change and as a spec
      When executing `openspec validate <item-name>`
      Then print an ambiguity error explaining both matches
      And suggest passing `--type change` or `--type spec`, or using `openspec change validate` / `openspec spec validate`
      And exit with code 1 without performing validation

    Scenario: Unknown item name
      When the `<item-name>` matches neither a change nor a spec
      Then print a not-found error
      And show nearest-match suggestions when available
      And exit with code 1

    Scenario: Explicit type override
      When executing `openspec validate --type change <item>`
      Then treat `<item>` as a change ID and validate it (skipping auto-detection)
      When executing `openspec validate --type spec <item>`
      Then treat `<item>` as a spec ID and validate it (skipping auto-detection)

  @REQ-0127
  Rule: Interactivity controls
    - The CLI SHALL respect `--no-interactive` to disable prompts.
    - The CLI SHALL respect `OPEN_SPEC_INTERACTIVE=0` to disable prompts globally.
    - Interactive prompts SHALL only be shown when stdin is a TTY and interactivity is not disabled.

    Scenario: Disabling prompts via flags or environment
      When `openspec validate` is executed with `--no-interactive` or with environment `OPEN_SPEC_INTERACTIVE=0`
      Then the CLI SHALL not display interactive prompts
      And SHALL print non-interactive hints or chosen outputs as appropriate

  @REQ-0128
  Rule: Parser SHALL handle cross-platform line endings
    The markdown parser SHALL correctly identify sections regardless of line ending format (LF, CRLF, CR).

    Scenario: Required sections parsed with CRLF line endings
      Given a change proposal markdown saved with CRLF line endings
      And the document contains `## Why` and `## What Changes`
      When running `openspec validate <change-id>`
      Then validation SHALL recognize the sections and NOT raise parsing errors
