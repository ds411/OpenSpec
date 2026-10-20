Feature: cli-show

  @added @REQ-0354
  Rule: Requirement block extraction for diffing
    The system SHALL extract raw markdown text for individual requirement blocks from spec files to support per-requirement diffing.

    Scenario: Extract requirement block by name
      When a requirement name is provided and a spec file contains a matching `### Requirement: <name>` header
      Then the system SHALL return the raw markdown text from the `### Requirement:` header line through all content until the next `###` header at the same or higher level (or end of file)

    Scenario: Requirement name matching
      When a requirement name matches a `### Requirement:` header exactly (after trimming)
      Then the system SHALL return that block and report the match as exact
      And when only a case- or interior-whitespace-folded match exists, the system SHALL return that block, report the match as inexact, and report the name as the main spec spells it
      And an exact match SHALL take precedence over a folded one

    Scenario: Requirement name not found in the main spec
      When a MODIFIED delta requirement name does not match any `### Requirement:` header in the main spec, exactly or folded
      Then the system SHALL return null for the main block
      And the caller SHALL display the full MODIFIED requirement text with a warning that no main requirement was found

    Scenario: Main spec paths resolve against the selected root
      When resolving the main spec path for a given capability
      Then the system SHALL build `openspec/specs/<cap>/spec.md` under the same OpenSpec root the change was read from, so `--store <id>` diffs against that store's main specs rather than the working directory
      And the system SHALL use `path.join()` for filesystem operations
      And display paths SHALL use forward slashes regardless of platform

  @modified @REQ-0104
  Rule: Output format options
    The show command SHALL support various output formats consistent with existing commands.

    Scenario: JSON output
      When executing `openspec show <item> --json`
      Then output the item in JSON format
      And include parsed metadata and structure
      And maintain format consistency with existing change/spec show commands

    Scenario: Flag scoping and delegation
      When showing a change or a spec via the top-level command
      Then accept common flags such as `--json`
      And pass through type-specific flags to the corresponding implementation
        """
        - Change-only flags: `--deltas-only` (alias `--requirements-only` deprecated), `--diff`
        - Spec-only flags: `--requirements`, `--no-scenarios`, `-r/--requirement`
        """
      And ignore irrelevant flags for the detected type with a warning

    Scenario: Text mode change display is unchanged without --diff
      When executing `openspec show <change-name>` in text mode without `--diff`
      Then print the proposal markdown and nothing else, exactly as before `--diff` existed

    Scenario: Diff output in text mode
      When executing `openspec show <change-name> --diff` in text mode (no `--json`)
      Then display the proposal markdown text
      And for each delta spec file under `openspec/changes/<change-name>/specs/<cap>/spec.md`, display the parsed deltas grouped by capability
      And for ADDED requirements, display the full requirement text with a green "ADDED" label
      And for REMOVED requirements, display the authored removal block, including its Reason and Migration text, with a red "REMOVED" label
      And for RENAMED requirements, display the FROM:/TO: with a cyan "RENAMED" label
      And for MODIFIED requirements, extract the matching requirement block from the main spec at `openspec/specs/<cap>/spec.md` by `### Requirement:` header name, compute a unified diff of the main block vs the delta block, and display it colorized (green for `+` lines, red for `-` lines, plain for context lines)
      And when a MODIFIED requirement's name matches a RENAMED entry's TO name in the same spec, the system SHALL look up the main block using the RENAMED entry's FROM name instead
      And when multiple RENAMED entries form a chain, the system SHALL resolve the MODIFIED name back to the original main requirement
      And when a MODIFIED requirement's header matches a main requirement only after folding case and interior whitespace, display the diff together with a warning that archive matches names exactly
      And if a MODIFIED requirement has no matching main requirement (and no corresponding RENAMED entry), display the full text with a warning
      And if the capability has no main spec at all, display the full text with a warning naming the missing spec, rather than rendering the requirement as an addition
      And if the MODIFIED block is textually identical to the matching main block, display `(no textual changes)`

    Scenario: Diff output in JSON mode
      When executing `openspec show <change-name> --json --diff`
      Then the output SHALL use the same JSON structure as `--json` alone (`{ id, title, deltaCount, deltas }`)
      And for each MODIFIED delta, the delta object SHALL include an additional `diff` string field containing the unified diff of the main requirement block vs the delta requirement block
      And when a MODIFIED requirement corresponds to a RENAMED entry, the main block SHALL be looked up using the RENAMED FROM name
      And ADDED, REMOVED, and RENAMED deltas SHALL NOT have a `diff` field
      And if a MODIFIED requirement has no matching main requirement, or its capability has no main spec, the delta object SHALL include a `warning` string field instead of `diff`
      And if a MODIFIED requirement matched only after folding case and interior whitespace, the delta object SHALL include both `diff` and `warning`
      And a textually identical MODIFIED block SHALL include `diff` as an empty string

    Scenario: Diff input cannot be read
      When delta discovery fails, a delta spec cannot be read, or a main spec exists but cannot be read
      Then the command SHALL exit with an error
      And the command SHALL NOT present the result as an empty delta set, a missing main spec, or a partial diff

    Scenario: Diff with no delta specs
      When executing `openspec show <change-name> --diff` and the change has no delta spec files
      Then print a message reporting that the change has no delta specs to diff
      And exit with code 0

    Scenario: Diff flag on non-change item
      When executing `openspec show <spec-name> --diff`
      Then ignore the `--diff` flag with a warning (flag is not applicable to specs)
