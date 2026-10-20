Feature: cli-view
  The `openspec view` command provides a comprehensive dashboard view of the OpenSpec project state, displaying specifications, changes, and progress metrics in a unified, visually appealing format to help developers quickly understand project status.

  @REQ-0129
  Rule: Dashboard Display
    The system SHALL provide a `view` command that displays a dashboard overview of specs and changes.

    Scenario: Basic dashboard display
      When user runs `openspec view`
      Then system displays a formatted dashboard with sections for summary, active changes, completed changes, and specifications

    Scenario: No OpenSpec directory
      When user runs `openspec view` in a directory without OpenSpec
      Then system displays error message "✗ No openspec directory found"

  @REQ-0130
  Rule: Summary Section
    The dashboard SHALL display a summary section with key project metrics, including draft change count.

    Scenario: Complete summary display
      When dashboard is rendered with specs and changes
      Then system shows total number of specifications and requirements
      And shows number of draft changes
      And shows number of active changes in progress
      And shows number of completed changes
      And shows overall task progress percentage

    Scenario: Empty project summary
      When no specs or changes exist
      Then summary shows zero counts for all metrics

  @REQ-0131
  Rule: Active Changes Display
    The dashboard SHALL show active changes with visual progress indicators.

    Scenario: Active changes ordered by completion percentage
      When multiple active changes are displayed with progress information
      Then list them sorted by completion percentage ascending so 0% items appear first
      And treat missing progress values as 0% for ordering
      And break ties by change identifier in ascending alphabetical order to keep output deterministic

  @REQ-0132
  Rule: Active Change Workflow Status
    The dashboard SHALL show each active change's schema and artifact states beneath its task progress, using the same workflow resolution as `openspec status`. Workflow status SHALL NOT change task progress, change categories, or sorting.

    Scenario: Workflow states
      When an active change's workflow can be loaded
      Then show the schema name and artifacts in dependency order
      And mark existing artifact outputs with `✓`, ready artifacts with `→`, blocked artifacts with no symbol, and skipped artifacts with `(skipped)`
      And treat an existing tasks artifact as done even when its implementation checklist is unfinished

    Scenario: Store-local workflow
      When the dashboard targets a store through `--store` or a project store pointer
      Then resolve workflow schemas and artifact files from that store
      And use the store's default schema for changes without a schema in their metadata

    Scenario: Invalid workflow
      When an active change's metadata or schema cannot be loaded
      Then print a warning identifying the change and the error
      And omit only that change's workflow status while retaining its task progress and rendering other changes

    Scenario: Terminal controls in workflow text
      When schema names, artifact identifiers, or workflow errors contain terminal control characters
      Then replace those characters with inert text in the dashboard output
      And preserve the underlying identifiers and workflow states

  @REQ-0133
  Rule: Completed Changes Display
    The dashboard SHALL list completed changes in a separate section, only showing changes with ALL tasks completed.

    > **Fixes bug**: Previously, changes with `total === 0` were incorrectly shown as completed.

    Scenario: Completed changes listing
      When there are changes with `tasks.total > 0` AND `tasks.completed === tasks.total`
      Then system shows them with checkmark indicators in a dedicated section

    Scenario: Mixed completion states
      When some changes are complete and others active
      Then system separates them into appropriate sections

    Scenario: Empty changes not completed
      When a change has no tasks.md or zero tasks defined
      Then system does NOT show it in "Completed Changes" section
      And shows it in "Draft Changes" section instead

  @REQ-0134
  Rule: Specifications Display
    The dashboard SHALL display specifications sorted by requirement count.

    Scenario: Specs listing with counts
      When specifications exist in the project
      Then system shows specs sorted by requirement count (descending) with count labels

    Scenario: Specs with parsing errors
      When a spec file cannot be parsed
      Then system includes it with 0 requirement count

  @REQ-0135
  Rule: Visual Formatting
    The dashboard SHALL use consistent visual formatting with colors and symbols.

    Scenario: Color coding
      When dashboard elements are displayed
      Then system uses cyan for specification items
      And yellow for active changes
      And green for completed items
      And dim gray for supplementary text

    Scenario: Progress bar rendering
      When displaying progress bars
      Then system uses filled blocks (█) for completed portions and light blocks (░) for remaining

  @REQ-0136
  Rule: Error Handling
    The view command SHALL handle errors gracefully.

    Scenario: File system errors
      When file system operations fail
      Then system continues with available data and omits inaccessible items

    Scenario: Invalid data structures
      When specs or changes have invalid format
      Then system skips invalid items and continues rendering

  @REQ-0137
  Rule: Draft Changes Display
    The dashboard SHALL display changes without tasks in a separate "Draft" section.

    Scenario: Draft changes listing
      When there are changes with no tasks.md or zero tasks defined
      Then system shows them in a "Draft Changes" section
      And uses a distinct indicator (e.g., `○`) to show draft status

    Scenario: Draft section ordering
      When multiple draft changes exist
      Then system sorts them alphabetically by name
