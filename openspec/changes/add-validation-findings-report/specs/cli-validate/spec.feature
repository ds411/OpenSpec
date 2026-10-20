Feature: cli-validate

  @added @REQ-0289
  Rule: Bulk validation SHALL provide an opt-in item-findings report
    The `validate` command SHALL support case-sensitive `--report full` and `--report findings` for explicit, unambiguous bulk scopes. Omitting `--report` SHALL retain current targeted, interactive, bulk, human, and JSON behavior. Findings mode SHALL return whole issue-bearing item records separately from top-level advisories while preserving full item order, complete requested-scope totals, root selection, issue severities, strict-mode semantics, and exit status. The current full-result fields are `items`, `summary`, `version`, and `root`; this implementation SHALL NOT invent advisory fields or copy unknown top-level fields. A future advisory section requires an explicit contract update.

    Scenario: Default and explicit bulk full output remain compatible
      When a user runs bulk validation without `--report` or with a valid explicit `--report full` request
      Then human output SHALL retain the current complete item listing and totals, or the current empty-scope message when no items exist
      And JSON output SHALL retain the documented full-v1 top-level `version: "1.0"` and complete `items` collection
      And the two bulk invocations SHALL have equivalent observable output and exit status for the same scope

    Scenario: Explicit report values select a bulk report
      When a user supplies `--report full` or `--report findings` with exactly one resolvable bulk scope and no item name
      Then validation SHALL run that bulk report without prompting for a scope

    Scenario: Explicit report values do not alias targeted or interactive flows
      When a user supplies an explicit report value with an item name or without a bulk scope
      Then validation SHALL reject the request rather than treating explicit `full` as a targeted or interactive alias

    Scenario: A changes-only report retains changes scope
      When a findings report request uses `--changes` alone
      Then `report.scope` SHALL be `changes`

    Scenario: A specs-only report retains specs scope
      When a findings report request uses `--specs` alone
      Then `report.scope` SHALL be `specs`

    Scenario: Combined active scopes normalize to all
      When a findings report request uses `--changes --specs`, `--all`, or `--all` with either active subset flag
      Then the complete active scope SHALL be validated and `report.scope` SHALL be `all`

    Scenario: Archived and active scopes cannot be combined for a report
      When a user supplies `--archived` with `--all`, `--changes`, or `--specs` and an explicit report value
      Then validation SHALL reject the request rather than choosing one scope by precedence
      And SHALL NOT validate either scope

    Scenario: Invalid human report requests fail before work
      When a non-JSON request has an item/report conflict, archived/active conflict, missing bulk scope, or unsupported report value
      Then validation SHALL write a targeted diagnostic to stderr and nothing to stdout
      And SHALL exit with code 1
      And SHALL NOT resolve a root, prompt, render a spinner, or validate any item

    Scenario: Invalid JSON report requests return one stable diagnostic
      When a JSON request has an item/report conflict, archived/active conflict, missing bulk scope, or unsupported report value
      Then stdout SHALL contain exactly one JSON document with exactly one `status` entry
      And that entry SHALL have `severity: "error"` and stable `code: "invalid_validation_report_request"`
      And it SHALL include a targeted `message` and corrective `fix`
      And no human text SHALL be written to stdout or stderr
      And validation SHALL exit with code 1 without resolving a root, prompting, rendering a spinner, or validating any item

    Scenario: Missing report arguments retain parser errors
      When the CLI parser rejects a missing required argument such as bare `--report`
      Then the existing CLI syntax-error behavior SHALL remain unchanged
      And the command SHALL NOT run or resolve a root
      And generic parser errors SHALL NOT be covered by the structured `invalid_validation_report_request` contract

    Scenario: Root and scope-discovery failures remain diagnostics
      Given a syntactically valid report request with a supported scope
      When root resolution fails or scope discovery encounters a fatal error
      Then validation SHALL retain the existing diagnostic and nonzero exit status for that failure
      And JSON output SHALL contain the existing `status` diagnostic envelope rather than a findings document with empty totals
      And a per-item validation failure SHALL instead remain an item result in the completed findings report

    Scenario: Findings JSON uses an exact distinct contract
      When a valid `--json --report findings` request completes root resolution, scope discovery, and validation
      Then stdout SHALL contain exactly one parseable JSON document and stderr SHALL be empty
      And `report.kind` SHALL equal `validation-findings`
      And `report.version` SHALL be the JSON string `"1.0"`
      And `report` SHALL include canonical `scope`, `returnedItems`, and `totalItems`
      And `summary` SHALL contain totals for the complete requested scope
      And `root` SHALL retain the current resolved-root envelope

    Scenario: Findings JSON is not the documented full-v1 document
      When a valid `--json --report findings` request produces a completed report
      Then the document SHALL NOT contain a top-level `items` field
      And SHALL NOT contain the full-v1 top-level `version` field
      And contract tests SHALL reject it against the documented full-v1 shape requiring top-level `version: "1.0"` and complete `items`
      And compatibility assertions SHALL be limited to documented full-v1 conformance, leaving undocumented permissive parser behavior outside this contract

    Scenario: Item findings project whole issue-bearing records
      Given the corresponding full result has item records in a defined order
      When findings JSON is produced
      Then `itemFindings` SHALL equal those full item records filtered by `issues.length > 0`
      And record order and issue order SHALL match the full result
      And each selected record SHALL preserve every current field and future additive field from that full item record
      And clean item records SHALL be omitted

    Scenario: Every item issue severity counts as an item finding
      Given separate item records containing only `ERROR`, only `WARNING`, or only `INFO` issues
      When findings mode is produced
      Then all three records SHALL appear in `itemFindings`
      And every issue SHALL retain its original severity, path, and message
      And `valid` and exit behavior SHALL remain whatever full mode reports under the same strictness

    Scenario: Item counts exclude top-level advisories
      When findings JSON is produced
      Then `report.returnedItems` SHALL equal `itemFindings.length`
      And `report.totalItems` SHALL equal `summary.totals.items`
      And separately named top-level advisory records SHALL NOT increase either item count

    Scenario: Zero item findings in a non-empty scope remain auditable
      Given the requested bulk scope contains one or more items and none has an issue
      When validation runs with `--json --report findings`
      Then `itemFindings` SHALL be an empty array and `report.returnedItems` SHALL be `0`
      And `report.totalItems`, `report.scope`, `summary`, and `root` SHALL still identify the complete validated scope
      And the successful exit status SHALL match full mode for the same scope

    Scenario: Empty JSON scope is explicit and successful
      Given the selected bulk scope contains no items
      When validation runs with `--json --report findings`
      Then `itemFindings` SHALL be empty, item counts and summary totals SHALL be zero, and scope and root SHALL remain explicit
      And validation SHALL preserve the current successful empty-scope exit status

    Scenario: Human findings use independently ordered streams
      Given a bulk scope with issue-bearing and clean item records
      When validation runs with `--report findings` and without `--json`
      Then within stdout the final report SHALL emit `Scope:` first, followed by complete-scope `Totals:`, followed by any existing active-scope first-failure `Details:` command
      And within stderr the final report SHALL emit item-finding blocks in full item order, with each item heading followed by all issues in issue order
      And `ERROR`, `WARNING`, and `INFO` labels, paths, and messages SHALL all be emitted to stderr
      And clean item rows SHALL be omitted
      And within stderr any explicitly named advisory section SHALL be emitted after item-finding blocks
      And archived scope SHALL NOT gain a new details command
      And no relative ordering between stdout and stderr sections SHALL be required

    Scenario: Human output distinguishes no item findings from advisories
      Given no item record has an issue
      When validation runs with `--report findings` and without `--json`
      Then within stdout `No item findings.` SHALL be emitted after `Scope:` and before `Totals:`
      And any explicitly named advisory section SHALL still be emitted separately to stderr
      And `No item findings.` SHALL NOT assert that no top-level advisory exists
      And no relative ordering between that stderr advisory and stdout sections SHALL be required

    Scenario: Human empty scope is explicit and successful
      Given the selected bulk scope contains no items
      When validation runs with `--report findings` and without `--json`
      Then within stdout the report SHALL contain zero-item `Scope:`, `No item findings.`, and zero `Totals:` in that order
      And validation SHALL preserve the current successful empty-scope exit status

    Scenario: Full and findings verdicts remain equal
      Given the same bulk scope, root, inputs, and strictness
      When full mode and findings mode run
      Then both modes SHALL validate the same items
      And SHALL produce the same complete summary totals and exit status
      And store and archived scopes SHALL inspect exactly the items their corresponding full invocations inspect

    Scenario: Completion support follows existing shell capabilities
      When completion output is generated for the currently supported Bash, Zsh, Fish, and PowerShell surfaces
      Then the `--report` flag SHALL be registered on all four surfaces
      And Zsh and Fish SHALL suggest the fixed values `full` and `findings`
      And Bash and PowerShell SHALL remain unchanged beyond registering the flag and SHALL NOT be required to suggest fixed values
      And this change SHALL NOT add another completion generator or completion capability

    Scenario: Findings output is cross-platform
      When the same findings validation scenario runs on Windows, macOS, and Linux
      Then report selection, projection, totals, severities, streams, and exit status SHALL be equivalent
      And paths in item records and the root envelope SHALL remain exactly as emitted by full validation, including native root paths and existing POSIX-normalized issue paths

  @modified @REQ-0124
  Rule: Bulk and filtered validation
    The validate command SHALL support flags for bulk validation (--all) and filtered validation by type (--changes, --specs). These flags SHALL select the same items for full and findings reports. Complete per-item listings SHALL apply when `--report` is omitted or is `full`; findings output SHALL follow the item-findings report contract.

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
      When executing `openspec validate --changes` with `--report` omitted or set to `full`
      Then validate all changes in openspec/changes/ (excluding archive)
      And display results for each change
      And show summary statistics

    Scenario: Validate all specs
      When executing `openspec validate --specs` with `--report` omitted or set to `full`
      Then validate all specs in openspec/specs/
      And display results for each spec
      And show summary statistics

  @modified @REQ-0125
  Rule: Validation options and progress indication
    The validate command SHALL support standard validation options (--strict, --json) and display progress during bulk operations. Explicit bulk reports SHALL use `--report full` or `--report findings`, independently of JSON serialization. The complete JSON schema below SHALL apply when `--report` is omitted or is `full`; findings output SHALL follow the distinct item-findings report contract.

    Scenario: Strict validation
      When executing `openspec validate --all --strict`
      Then apply strict validation to all items
      And treat warnings as errors
      And fail if any item has warnings or errors

    Scenario: JSON output
      When executing `openspec validate --all --json` with `--report` omitted or set to `full`
      Then output validation results as JSON
      And include detailed issues for each item
      And include summary statistics

    Scenario: JSON output schema for bulk validation
      When executing `openspec validate --all --json` (or `--changes` / `--specs`) with `--report` omitted or set to `full`
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
