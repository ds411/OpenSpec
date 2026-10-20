Feature: OPSX Archive Skill
  Define the expected behavior for the `/opsx:archive` skill, including readiness checks, spec sync prompting, archive execution, and user-facing output.

  @REQ-0186
  Rule: OPSX Archive Skill
    The system SHALL provide an `/opsx:archive` skill that archives completed changes in the experimental workflow.

    Scenario: Archive a change with all artifacts complete
      When agent executes `/opsx:archive` with a change name
      And all artifacts in the schema are complete
      And all tasks are complete
      Then the agent moves the change to `openspec/changes/archive/<target-name>/`
      And displays success message with archived location

    Scenario: Change selection prompt
      When agent executes `/opsx:archive` without specifying a change
      Then the agent infers the change from conversation context, or auto-selects it when only one active change exists
      And when ambiguous, prompts user to select from available changes, showing only active changes (excludes archive/)
      And announces which change was selected and how to override

  @REQ-0187
  Rule: Artifact Completion Check
    The skill SHALL check artifact completion status using the artifact graph before archiving.

    Scenario: Incomplete artifacts warning
      When agent checks artifact status
      And one or more artifacts have status other than `done`
      Then display warning listing incomplete artifacts
      And prompt user for confirmation to continue
      And proceed if user confirms

    Scenario: All artifacts complete
      When agent checks artifact status
      And all artifacts have status `done`
      Then proceed without warning

  @REQ-0188
  Rule: Task Completion Check
    The skill SHALL check the selected change's task completion using `totalTasks` and `completedTasks` from `openspec list --json`, with the same selected-root flags used for the rest of the workflow. It SHALL match the change by name and use the CLI's schema-aware task resolution in both single and bulk archive workflows.

    Scenario: Incomplete tasks found
      When the selected change has `totalTasks` greater than `completedTasks`
      Then display warning showing count of incomplete tasks
      And prompt user for confirmation to continue
      And proceed if user confirms

    Scenario: All tasks complete
      When the selected change has equal `totalTasks` and `completedTasks`
      Then proceed without task-related warning

    Scenario: No tracked tasks
      When the CLI reports `totalTasks` as zero for the selected change
      Then proceed without task-related warning

    Scenario: Custom task artifact or output path
      When the schema tracks tasks under a custom artifact name, output path, or glob
      Then use the CLI totals across the schema-resolved files
      And do not infer completion from artifact existence, an artifact id of `tasks`, or the absence of a top-level `tasks.md`

    Scenario: Task progress lookup unavailable
      When the list command fails, returns invalid JSON, omits or duplicates a selected change, or reports invalid task counts
      Then report the lookup problem and stop before syncing or archiving
      And do not treat the missing progress as zero tasks

  @REQ-0189
  Rule: Spec Sync Prompt
    The skill SHALL prompt to sync delta specs before archiving if specs exist.

    Scenario: Delta specs exist
      When agent checks for delta specs
      And `specs/` directory exists in the change with spec files
      Then prompt user: "This change has delta specs. Would you like to sync them to main specs before archiving?"
      And if user cancels, stop without archiving
      And if user confirms, execute `/opsx:sync` logic inline and wait for it to complete
      And verify every capability that has a delta spec, not only those the sync reports it touched: ADDED requirements present, MODIFIED requirements carrying the changes named in the delta, REMOVED requirements absent, RENAMED requirements present under the new name and absent under the old one
      And treat a capability whose last requirement the sync removed as verified when its main spec was deleted rather than left empty
      And treat any stop or blocking condition the sync reports as a failed sync, including a main spec it left unmodified because a retirement was blocked
      And stop without archiving if the sync fails or any capability does not verify
      And archive only after verification passes, or when the user explicitly chose to archive without syncing or to archive already-synced specs

    Scenario: Applicable ADDED delta whose main spec does not exist yet
      When agent compares a delta spec against its main spec at `openspec/specs/<capability-path>/spec.md`
      And that main spec does not exist yet
      And the delta has `## ADDED Requirements`
      And the delta has no `## MODIFIED Requirements` or `## RENAMED Requirements`
      Then count that capability as needing sync rather than as already synced
      And name it in the summary as a main spec the sync will create
      And never treat the missing main spec as nothing to apply
      And if the delta also has `## REMOVED Requirements`, warn that they will be ignored because there is no main spec to remove them from
      And create the main spec from only the delta's `## ADDED Requirements`

    Scenario: Unsupported delta operation whose main spec does not exist yet
      When a delta targets a capability whose main spec does not exist yet
      And the delta has `## MODIFIED Requirements` or `## RENAMED Requirements`
      Then report that only ADDED requirements can create a new main spec
      And mark the capability as sync-blocked without writing a main spec

    Scenario: Explicitly retired capability whose main spec is missing
      When a delta contains only `## REMOVED Requirements` and its main spec is missing
      And the change's `.openspec.yaml` declares `retire_capabilities: true`
      Then count that capability as already synced and report that it is already retired
      And warn that there is nothing left to remove and do not recreate the main spec
      And apply the same rule when verifying a completed sync, so retiring a capability does not block archiving

    Scenario: Nothing to put in a missing main spec without a declared retirement
      When a delta targets a capability whose main spec does not exist yet
      And the delta has no `## ADDED Requirements`
      And it is not a REMOVED-only delta with `retire_capabilities: true`
      Then report that no sync is possible
      And if the delta has only `## REMOVED Requirements`, warn that there is no main spec to remove them from and leave the main-spec tree unchanged
      And mark the capability as sync-blocked, since the verification pass would re-read the same missing spec

    Scenario: Sync-blocked capability during archive assessment
      When any capability is sync-blocked during the initial assessment
      Then assess the remaining capabilities and summarize the blockers before prompting
      And offer only "Archive without syncing" and "Cancel"
      And archive without writing main specs only if the user explicitly chooses "Archive without syncing"
      And stop without archiving if the user cancels
      And do not start any sync while a capability is blocked, even if other capabilities could sync
      And a failed sync or post-sync verification still stops without archiving; do not silently fall back to skipping sync

    Scenario: No delta specs
      When agent checks for delta specs
      And no `specs/` directory or no spec files exist
      Then proceed without sync prompt

  @REQ-0190
  Rule: Archive Process
    The skill SHALL move the change to the archive folder with date prefix.

    Scenario: Successful archive
      When archiving a change
      Then create `archive/` directory if it doesn't exist
      And generate target name as `YYYY-MM-DD-<change-name>` using current date, keeping the name as-is when it already starts with a `YYYY-MM-DD-` prefix
      And move entire change directory to archive location
      And preserve `.openspec.yaml` file in archived change

    Scenario: Archive already exists
      When target archive directory already exists
      Then fail with error message
      And suggest renaming existing archive or using different date

  @REQ-0191
  Rule: Skill Output
    The skill SHALL provide clear feedback about the archive operation.

    Scenario: Archive complete with sync
      When archive completes after syncing specs
      Then display summary:
        """
        - Specs synced (from `/opsx:sync` output)
        - Change archived to location
        - Schema that was used
        """

    Scenario: Archive complete without sync
      When archive completes without syncing specs
      Then display summary:
        """
        - Note that specs were not synced (if applicable)
        - Change archived to location
        - Schema that was used
        """

    Scenario: Archive complete with warnings
      When archive completes with incomplete artifacts or tasks
      Then include note about what was incomplete
      And suggest reviewing if archive was intentional
