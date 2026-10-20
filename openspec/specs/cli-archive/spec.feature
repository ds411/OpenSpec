Feature: CLI Archive Command
  The archive command moves completed changes from the active changes directory to the archive folder with date-based naming, following OpenSpec conventions.

  **Command Syntax**

  ```bash
  openspec archive [change-name] [--yes|-y]
  ```

  Options:
  - `--yes`, `-y`: Skip confirmation prompts (for automation)

  **Why These Decisions**

  **Interactive selection**: Reduces typing and helps users see available changes
  **Task checking**: Prevents accidental archiving of incomplete work
  **Date prefixing**: Maintains chronological order and prevents naming conflicts; a name that already carries a date prefix keeps it, so archived names never stack dates
  **No overwrite**: Preserves historical archives and prevents data loss
  **Claim-first transaction**: The destination is claimed before main specs are mutated, spec changes are rollback-protected, and the active change is moved only after the spec transaction succeeds
  **Confirmation for spec updates**: Provides visibility into what will change, prevents accidental overwrites, and ensures users understand the impact before specs are modified
  **--yes flag for automation**: Allows CI/CD pipelines to archive without interactive prompts while maintaining safety by default for manual use

  @REQ-0020
  Rule: Change Selection
    The command SHALL support both interactive and direct change selection methods.

    Scenario: Interactive selection
      When no change-name is provided
      Then display interactive list of available changes (excluding archive/)
      And allow user to select one

    Scenario: Direct selection
      When change-name is provided
      Then use that change directly
      And validate it exists

    Scenario: No change name and no answer available
      When no change-name is provided and the selection prompt cannot be answered
      Then report that a change name is required
      And state that no answer could be read from stdin
      And suggest a rerun naming the change and passing `--yes`
      And exit with a non-zero status code rather than reporting success for a run that archived nothing

  @REQ-0021
  Rule: Task Completion Check
    The command SHALL verify task completion status before archiving to prevent premature archival.

    Scenario: Incomplete tasks found
      When incomplete tasks are found (marked with `- [ ]`)
      Then display all incomplete tasks to the user
      And prompt for confirmation to continue
      And default to "No" for safety

    Scenario: All tasks complete
      When all tasks are complete OR no tasks.md exists
      Then proceed with archiving without prompting

  @REQ-0022
  Rule: Archive Process
    The archive operation SHALL follow a structured process to safely move changes to the archive.

    Scenario: Performing archive
      When archiving a change
      Then execute these steps:
        """
        1. Create archive/ directory if it doesn't exist
        2. Generate target name as `YYYY-MM-DD-[change-name]` using current date, keeping the name as-is when it already starts with a `YYYY-MM-DD-` prefix
        3. Claim the target and verify that it does not already exist
        4. Prepare and validate spec updates from the active change's delta specs
        5. Apply the spec updates as a rollback-capable transaction
        6. Move the entire change directory to the archive location
        7. If a spec mutation or final move fails before a complete archive is secured, restore the spec transaction and leave or return the change at its active path
        8. If a verified fallback copy completes but staged-source cleanup fails, retain the complete archive and committed spec state for recovery instead of risking the only complete copy
        """

    Scenario: Archive already exists
      When target archive already exists
      Then fail with error message
      And do not overwrite existing archive

    Scenario: Successful archive
      When move succeeds
      Then display success message with archived name and list of updated specs

  @REQ-0023
  Rule: Spec Update Process
    After claiming the archive destination, the command SHALL apply delta changes to main specs to reflect the deployed reality, then move the change to its archive destination. It SHALL restore the spec transaction when a mutation or final move fails before a complete archive is secured. Once a verified fallback archive is complete, a staged-source cleanup failure SHALL retain that archive and committed spec state for recovery.

    Scenario: Applying delta changes
      When archiving a change with delta-based specs
      Then parse and apply delta changes as defined in openspec-conventions
      And validate all operations before applying

    Scenario: Validating delta changes
      When processing delta changes
      Then perform validations as specified in openspec-conventions
      And if validation fails, show specific errors and abort

    Scenario: Conflict detection
      When applying deltas would create duplicate requirement headers
      Then abort with error message showing the conflict
      And suggest manual resolution

    Scenario: Duplicate requirement already exists in the main spec
      When a main spec contains two canonical requirement headers with the same name
      Then reject the structurally ambiguous main spec before applying any delta
      And preserve the main spec and active change unchanged

    Scenario: New main spec inherits the delta's Purpose
      When a delta creates a main spec that does not exist yet
      And the delta spec has a line-initial `## Purpose` header that is not inside a fenced code block or an HTML comment
      And the section body, ignoring fenced blocks and HTML comments, is not empty
      Then write the section body into the new main spec, trimmed but otherwise verbatim, fenced code blocks included
      And the section body runs to the next `## ` heading outside a fenced block

    Scenario: New main spec without an authored Purpose
      When a delta creates a main spec that does not exist yet
      And the delta spec has no such `## Purpose` header, or that section's body is empty once fenced blocks and HTML comments are ignored
      Then write the TBD placeholder Purpose naming the change to update after archive

    Scenario: Delta Purpose that would leave the new main spec unreadable
      When a delta creates a main spec that does not exist yet
      And carrying its `## Purpose` body over would leave a spec that reads differently to different readers - a heading or requirement header that truncates a section, an unterminated code fence that swallows one, or any HTML comment, which the section scan skips but the file keeps
      Then write the TBD placeholder Purpose instead and warn that the delta Purpose was ignored
      And complete the archive rather than aborting it

    Scenario: Carried Purpose shorter than the strict-mode minimum
      When the Purpose parsed back out of the new main spec is shorter than the minimum Purpose length strict validation enforces
      Then carry it over unchanged and warn that `openspec validate --strict` reports it as too brief

    Scenario: Delta Purpose for a capability that already has a main spec
      When a delta carries a `## Purpose` and the target main spec already exists
      Then leave the existing Purpose untouched
      And warn that the delta Purpose was ignored, naming the spec file to edit directly, but only when that spec has a Purpose of its own and it differs from the delta's

  @REQ-0024
  Rule: Capability Retirement
    A delta whose REMOVED entries cover every requirement a capability has SHALL retire that capability instead of writing a main spec with no requirements, which can never pass validation.

    Scenario: Deciding that a rebuilt spec cannot be written
      When applying a delta leaves the rebuilt spec with no requirement blocks, and every other nonblank line in the whole file is accounted for as the title, Purpose, Requirements header, or a canonical requirement's statement, scenarios, or fenced examples
      Then put that rebuilt spec to the spec validator
      And treat it as retirable only when its sole validation error is that the spec has no requirements
      And otherwise write or reject it exactly as any other rebuilt spec, so a spec the validator still accepts, one broken in some further way, and one still holding a `###` heading are all left alone

    Scenario: Validation was skipped
      When the archive runs with validation disabled
      Then retire nothing, because no verdict was produced to justify a deletion
      And write the rebuilt spec exactly as an archive without this behavior would

    Scenario: Retirement is not declared
      When a rebuilt spec is retirable but the change does not declare `retire_capabilities: true` in its metadata, or declares it in metadata that cannot be honored
      Then write the spec as any other, so the archive aborts on it exactly as it did before this behavior existed
      And name the marker as the fix in that abort, and say when a marker that is present cannot be honored
      And say nothing about the marker when retiring would not have made the spec writable anyway

    Scenario: Delta removes the capability's last requirement
      When a retirable rebuilt spec belongs to a capability whose main spec exists
      And at least one requirement was actually removed by this run
      And the change declares `retire_capabilities: true`
      Then delete the capability's `spec.md` instead of writing it
      And refuse to delete when the target resolves outside the real specs root
      And delete any in-root directory the deletion leaves empty, and never the specs root itself
      And count every operation the delta applied in the archive totals
      And record the retirement in the archive warnings, naming what the deleted file held and giving a pasteable Git recovery command only when the spec lived in the caller's checkout

    Scenario: Retirement is deferred until every spec is written
      When an archive both retires one capability and updates another
      Then settle the archive destination before touching any spec, so a name collision cannot strand a retirement
      And perform the deletion only after every spec write has succeeded
      And report a destination claimed while the merge ran as the same collision, rather than as a raw filesystem error

    Scenario: Capability directory holds other files
      When retiring a capability whose directory still holds other files after `spec.md` is deleted
      Then leave that directory in place

    Scenario: Removal was already synced
      When a retirable rebuilt spec removed nothing this run and its main spec exists
      Then leave the file untouched
      And abort the archive with the validation error, as for any other unwritable spec, unless validation was skipped

    Scenario: Content the merge cannot account for
      When the spec holds any non-blank line the merge cannot name - anywhere in the file, including above the requirements section and inside a requirement block, where content the parser did not read as a new header rides along
      Then refuse the retirement, because deleting the file would take that content with it
      And say which lines stood in the way when the change declared the marker, rather than aborting on the bare validation error

    Scenario: Main spec is already gone
      When a REMOVED-only delta targets a capability that has no main spec, and the change declares `retire_capabilities: true`
      Then complete the archive without creating or retiring one

  @REQ-0025
  Rule: Confirmation Behavior
    The spec update confirmation SHALL provide clear visibility into changes before they are applied.

    Scenario: Displaying confirmation
      When prompting for confirmation
      Then display a clear summary showing:
        """
        - Which specs will be created (new capabilities)
        - Which specs will be updated (existing capabilities)
        - The source path for each spec
        """
      And format the confirmation prompt as:
        """
        The following specs will be updated:

        NEW specs to be created:
          - cli-archive (from changes/add-archive-command/specs/cli-archive/spec.md)

        EXISTING specs to be updated:
          - cli-init (from changes/update-init-command/specs/cli-init/spec.md)

        Proceed with spec updates? (Y/n)
        """

    Scenario: Handling confirmation response
      When waiting for user confirmation
      Then default to "Yes", so pressing Enter proceeds (declining requires an explicit "n" or "no")
      And skip confirmation when `--yes` or `-y` flag is provided

    Scenario: User declines confirmation
      When user declines the confirmation
      Then abort the entire archive operation
      And display message: "Archive cancelled. No changes were made."
      And exit with non-zero status code

  @REQ-0026
  Rule: Error Conditions
    The command SHALL handle various error conditions gracefully.

    Scenario: Handling errors
      When errors occur
      Then handle the following conditions:
        """
        - Missing openspec/changes/ directory
        - Change not found
        - Archive target already exists
        - File system permissions issues
        - A confirmation prompt that cannot be answered because no answer can be read from stdin
        """

    Scenario: Confirmation cannot be answered
      When a confirmation prompt fails because no answer can be read from stdin
      Then report which decision needed an answer
      And suggest a rerun that adds `--yes` and reproduces the flags the caller already passed
      And make no filesystem change
      And exit with a non-zero status code

    Scenario: Cancellation is not treated as a missing answer
      When the user cancels a prompt with Ctrl-C
      Then treat it as a cancellation rather than an unanswerable prompt
      And preserve the existing cancellation behavior

  @REQ-0027
  Rule: Skip Specs Option
    The archive command SHALL support a `--skip-specs` flag that skips all spec update operations and proceeds directly to archiving.

    Scenario: Skipping spec updates with flag
      When executing `openspec archive <change> --skip-specs`
      Then skip spec discovery and update confirmation
      And proceed directly to moving the change to archive
      And display a message indicating specs were skipped

  @REQ-0028
  Rule: Non-blocking confirmation
    The archive operation SHALL proceed when the user declines spec updates instead of cancelling the entire operation.

    Scenario: User declines spec update confirmation
      When the user declines spec update confirmation
      Then skip spec updates
      And continue with the archive operation
      And display a success message indicating specs were not updated

  @REQ-0029
  Rule: Display Output
    The command SHALL provide clear feedback about delta operations.

    Scenario: Showing delta application
      When applying delta changes
      Then display for each spec:
        """
        - Number of requirements added
        - Number of requirements modified
        - Number of requirements removed
        - Number of requirements renamed
        """
      And use standard output symbols (+ ~ - →) as defined in openspec-conventions:
        """
        Applying changes to specs/user-auth/spec.md:
          + 2 added
          ~ 3 modified
          - 1 removed
          → 1 renamed
        """

  @REQ-0030
  Rule: Archive Validation
    The archive command SHALL validate changes before applying them to ensure data integrity.

    Scenario: Pre-archive validation
      When executing `openspec archive change-name`
      Then validate the change structure first
      And only proceed if validation passes
      And show validation errors if it fails

    Scenario: Proposal warnings stay proposal-level
      When archiving a change
      Then the non-blocking proposal warnings SHALL NOT repeat requirement-level
        """
        issues reached through the delta specs
        """
      And a requirement removed by a `## REMOVED Requirements` delta SHALL NOT be
        """
        reported as missing a scenario
        """
      And proposal-level issues SHALL still be reported

    Scenario: Force archive without validation
      When executing `openspec archive change-name --no-validate`
      Then skip validation (unsafe mode)
      And show warning about skipping validation
