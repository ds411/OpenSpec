Feature: List Command
  The `openspec list` command SHALL provide developers with a quick overview of all active changes in the project, showing their names and task completion status.

  **Why**

  Developers need a quick way to:
  - See what changes are in progress
  - Identify which changes are ready to archive
  - Understand the overall project evolution status
  - Get a bird's-eye view without opening multiple files

  This command provides that visibility with minimal effort, following OpenSpec's philosophy of simplicity and clarity.

  @REQ-0096
  Rule: Command Execution
    The command SHALL scan and analyze either active changes or specs based on the selected mode.

    Scenario: Scanning for changes (default)
      When `openspec list` is executed without flags
      Then scan the `openspec/changes/` directory for change directories
      And exclude the `archive/` subdirectory from results
      And parse each change's `tasks.md` file to count task completion

    Scenario: Scanning for specs
      When `openspec list --specs` is executed
      Then scan the `openspec/specs/` directory for capabilities
      And read each capability's `spec.md`
      And parse requirements to compute requirement counts

  @REQ-0097
  Rule: Task Counting
    The command SHALL accurately count task completion status using standard markdown checkbox patterns.

    Scenario: Counting tasks in tasks.md
      When parsing a `tasks.md` file
      Then count tasks matching these patterns:
        """
        - Completed: Lines containing `- [x]`
        - Incomplete: Lines containing `- [ ]`
        """
      And calculate total tasks as the sum of completed and incomplete

  @REQ-0098
  Rule: Output Format
    The command SHALL display items in a clear, readable table format with mode-appropriate progress or counts.

    Scenario: Displaying change list (default)
      When displaying the list of changes
      Then show a table with columns:
        """
        - Change name (directory name)
        - Task progress (e.g., "3/5 tasks" or "✓ Complete")
        """

    Scenario: Displaying spec list
      When displaying the list of specs
      Then show a table with columns:
        """
        - Spec id (directory name)
        - Requirement count (e.g., "requirements 12")
        """

  @REQ-0099
  Rule: Flags
    The command SHALL accept flags to select the noun being listed.

    Scenario: Selecting specs
      When `--specs` is provided
      Then list specs instead of changes

    Scenario: Selecting changes
      When `--changes` is provided
      Then list changes explicitly (same as default behavior)

  @REQ-0100
  Rule: Empty State
    The command SHALL provide clear feedback when no items are present for the selected mode.

    Scenario: Handling empty state (changes)
      When no active changes exist (only archive/ or empty changes/)
      Then display: "No active changes found."

    Scenario: Handling empty state (specs)
      When no specs directory exists or contains no capabilities
      Then display: "No specs found."

  @REQ-0101
  Rule: Error Handling
    The command SHALL gracefully handle missing files and directories with appropriate messages.

    Scenario: Missing tasks.md file
      When a change directory has no `tasks.md` file
      Then display the change with "No tasks" status

    Scenario: Missing changes directory
      When `openspec/changes/` directory doesn't exist
      Then display error: "No OpenSpec changes directory found. Run 'openspec init' first."
      And exit with code 1

  @REQ-0102
  Rule: Sorting
    The command SHALL maintain consistent ordering of changes for predictable output.

    Scenario: Ordering changes
      When displaying multiple changes
      Then sort them in alphabetical order by change name
