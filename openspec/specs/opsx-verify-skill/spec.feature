Feature: opsx-verify-skill
  Define `/opsx:verify` behavior for assessing implementation completeness, correctness, and coherence against change artifacts.

  @REQ-0200
  Rule: Verify Skill Invocation
    The system SHALL provide an `/opsx:verify` skill that validates implementation against change artifacts.

    Scenario: Verify with change name provided
      When agent executes `/opsx:verify <change-name>`
      Then the agent verifies implementation for that specific change
      And produces a verification report

    Scenario: Verify without change name
      When agent executes `/opsx:verify` without a change name
      Then the agent infers the change from conversation context, or auto-selects it when only one active change exists
      And when ambiguous, prompts user to select from all active changes, including changes with no tracked tasks
      And announces which change was selected and how to override

    Scenario: Change has no task descriptions
      When the schema configures task tracking but the structured task list provides no usable task descriptions, even if task progress reports nonzero totals
      Then the agent reports Task Completion as not verified with the reason
      And continues checks supported by the remaining artifacts

    Scenario: Schema has no task tracking
      When the schema does not configure `apply.tracks`
      Then apply instructions report `taskTrackingConfigured: false`
      And the agent reports Task Completion as not applicable, not as skipped or failed
      And continues the checks that apply to the schema

  @REQ-0201
  Rule: Completeness Verification
    The agent SHALL verify that all required work has been completed.

    Scenario: Task completion check
      When verifying completeness
      Then the agent uses the top-level `tasks` and `progress` from apply instructions
      And apply instructions aggregate every concrete file matched by the active schema's `apply.tracks`, regardless of the tracked artifact's ID
      And reports complete and total task counts from `progress`
      And reports completion status with specific incomplete tasks listed
      And reports remaining checkboxes without descriptions when `progress.remaining` exceeds the listed incomplete tasks

    Scenario: Tracking evidence becomes unavailable
      When one or more files matched by `apply.tracks` cannot be read after resolution
      Then apply instructions include every unavailable path and reason
      And preserve tasks and progress from readable tracking files
      And do not report `all_done`
      And the agent marks Task Completion as not verified from partial evidence

    Scenario: Spec coverage check
      When verifying completeness
      And delta specs exist in `openspec/changes/<name>/specs/`
      Then the agent extracts all requirements from delta specs, noting the delta section each one sits under
      And searches codebase for implementation of each ADDED or MODIFIED requirement
      And reports which ADDED or MODIFIED requirements appear to have implementation vs which are missing
      And checks REMOVED and RENAMED requirements as described in the Removed requirement and Renamed requirement scenarios

    Scenario: All tasks complete
      When all tasks are marked complete
      Then report "Tasks: N/N complete"
      And mark Task Completion as passed only when task descriptions are available
      And mark the completeness dimension as passed only when all applicable checks ran and passed

    Scenario: Incomplete tasks found
      When some tasks are incomplete
      Then report "Tasks: X/N complete"
      And list each incomplete task
      And mark as CRITICAL issue
      And suggest: "Complete remaining tasks or mark as done if already implemented"

  @REQ-0202
  Rule: Correctness Verification
    The agent SHALL verify that implementation matches the specifications.

    Scenario: Requirement implementation mapping
      When verifying correctness
      Then for each ADDED or MODIFIED requirement in delta specs:
        """
        - Search codebase for implementation
        - Identify relevant files and line numbers
        - Assess whether implementation satisfies the requirement
        """

    Scenario: Scenario coverage check
      When verifying correctness
      Then for each scenario under an ADDED or MODIFIED requirement in delta specs:
        """
        - Check if the scenario's conditions are handled in code
        - Check if tests exist that cover the scenario
        - Report coverage status
        """

    Scenario: Implementation matches spec
      When implementation appears to satisfy a requirement
      Then report which files/lines implement it
      And mark requirement as covered

    Scenario: Implementation diverges from spec
      When implementation exists but doesn't match spec intent
      Then report the divergence as WARNING
      And explain what differs
      And suggest: either update implementation or update spec to match reality

    Scenario: Missing implementation
      When no implementation found for an ADDED or MODIFIED requirement
      Then report as CRITICAL issue
      And suggest: "Implement requirement X" with guidance on what's needed

    Scenario: Removed requirement
      When a requirement sits under `## REMOVED Requirements` in a delta spec
      Then the agent reads the baseline requirement (its body and scenarios in the main spec, matched by normalized name) before searching, rather than searching from the requirement name alone
      And recovers the baseline from the main spec file's history when that file no longer holds the requirement, for example because an earlier sync already applied the removal
      And treats a baseline that adds nothing to its own title as unusable, the same as a missing one
      And marks spec coverage as not verified for the entry, without searching, when no usable baseline can be found or read
      And treats the absence of an implementation of that baseline behavior as the expected result
      And does not report it as missing or suggest implementing it
      And reports it as CRITICAL only if the removed behavior is still present in the codebase
      And skips scenario coverage for it
      And does not treat matches in OpenSpec artifacts or docs, or in code that serves only the Migration note or an ADDED requirement, as evidence by themselves
      And still reports a code path that delivers the removed behavior, even when it is shared with an ADDED requirement

    Scenario: Renamed requirement
      When a requirement is listed under `## RENAMED Requirements` in a delta spec
      Then the agent does not report its FROM name as missing
      And does not require code symbols or file names to be renamed
      And unless the TO name also appears under MODIFIED, verifies that the behavior of the baseline requirement (its body and scenarios in the main spec, under the FROM name, or under the TO name only when the main spec is already synced) is still implemented
      And reports CRITICAL "Renamed requirement not found" when that behavior is missing
      And marks spec coverage as not verified for the entry when the baseline requirement cannot be found or read

    Scenario: Change that only removes or renames requirements
      When the delta specs are readable and contain at least one REMOVED or RENAMED requirement but no ADDED or MODIFIED requirements
      Then the agent reports requirement implementation mapping and scenario coverage as not applicable
      And does not mark them as not verified or withhold readiness because of them
      And a delta spec with no parseable requirements still marks them as not verified

  @REQ-0203
  Rule: Coherence Verification
    The agent SHALL verify that implementation is sensible and follows design decisions.

    Scenario: Design.md adherence check
      When verifying coherence
      And design.md exists for the change
      Then extract key decisions from design.md
      And verify implementation follows those decisions
      And report any deviations

    Scenario: No design.md
      When verifying coherence
      And no design.md exists
      Then skip design adherence check
      And report "Design Adherence: Not verified (No design.md to verify against)"

    Scenario: Design decision followed
      When implementation follows a design decision
      Then report as confirmed
      And cite evidence from code

    Scenario: Design decision violated
      When implementation contradicts a design decision
      Then report as WARNING
      And explain the contradiction
      And suggest: either update implementation or update design.md

    Scenario: Code pattern consistency
      When verifying coherence
      And available artifacts support identifying implementation changes beyond a tasks-only check
      Then check if new code follows existing project patterns
      And flag any significant deviations as suggestions
      And report Code Pattern Consistency as not verified if implementation changes cannot be identified

  @REQ-0204
  Rule: Verification Report Format
    The agent SHALL produce a structured, prioritized report.

    Scenario: Report summary
      When verification completes
      Then display summary scorecard:
        """text
        ## Verification Report: <change-name>

        ### Summary
        | Dimension    | Status   |
        |--------------|----------|
        | Completeness | X/Y      |
        | Correctness  | X/Y      |
        | Coherence    | Followed |
        """
      And report `Not verified (<reason>)` for every skipped or partially verified check in its dimension's status
      And never count a skipped check as passing

    Scenario: Issue prioritization
      When issues are found
      Then group and display in priority order:
        """
        1. CRITICAL - Must fix before archive (missing implementation, incomplete tasks)
        2. WARNING - Should fix (divergence from spec/design, missing tests)
        3. SUGGESTION - Nice to fix (pattern inconsistencies, minor improvements)
        """

    Scenario: Actionable recommendations
      When reporting an issue
      Then include specific, actionable fix recommendation
      And reference relevant files and line numbers where applicable
      And avoid vague suggestions like "consider reviewing"

    Scenario: All checks pass
      When every applicable check ran and no issues were found across all dimensions
      Then display:
        """text
        All checks passed. Ready for archive.
        """

    Scenario: Critical issues found
      When CRITICAL issues exist
      Then display:
        """text
        X critical issue(s) found. Fix before archiving.
        """
      And do NOT suggest running archive
      And name every skipped check and its reason, if any

    Scenario: Only warnings
      When every applicable check ran and no CRITICAL issues but warnings exist
      Then display:
        """text
        No critical issues. Y warning(s) to consider.
        Ready for archive (with noted improvements).
        """

    Scenario: Only suggestions
      When every applicable check ran and only suggestions exist
      Then report "No critical issues or warnings. Z suggestion(s) to consider. Ready for archive (with noted improvements)."

    Scenario: Checks skipped
      When any check was skipped or partially verified and no CRITICAL issues exist
      Then report "No critical issues found in the checks that ran"
      And name every unverified check and its reason
      And include the warning count when nonzero
      And do not claim archive readiness

    Scenario: Suggestions in final assessment
      When suggestions exist
      Then include their count in the final assessment, including assessments with critical issues or skipped checks

  @REQ-0205
  Rule: Flexible Artifact Handling
    The agent SHALL gracefully handle changes with varying artifact completeness.

    Scenario: Minimal change (tasks only)
      When change has only tasks.md
      Then verify task completion only
      And skip spec and design checks
      And note which checks were skipped

    Scenario: Change with specs but no design
      When change has tasks.md and delta specs but no design.md
      Then verify completeness and correctness
      And skip design adherence
      And still check code coherence against project patterns

    Scenario: Full change (all artifacts)
      When change has proposal, design, specs, and tasks
      Then perform all verification checks
      And cross-reference artifacts for consistency

    Scenario: Unusable or partial artifact evidence
      When an artifact cannot be read or lacks usable requirements, scenarios, or design decisions
      Then mark each affected check as not verified with its reason
      And continue checks supported by the remaining evidence without treating partial coverage as a fully verified check

    Scenario: Intentional artifact omissions
      When a check has no supporting artifacts because the schema omits task tracking or optional artifacts, or the change declares `skip_specs: true`
      Then report the corresponding checks as not applicable and explain why
      And exclude not-applicable checks from skipped-check counts and readiness assessment
      And do not require or create optional or intentionally skipped artifacts to obtain a passing report
      And treat verification as advisory: not verified describes missing evidence for an applicable check, not a new archive gate
      And leave archive checks and user-confirmation behavior unchanged
