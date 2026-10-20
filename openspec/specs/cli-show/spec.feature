Feature: cli-show
  Define top-level `openspec show` behavior for interactive and direct display of change and spec content.

  @REQ-0103
  Rule: Top-level show command
    The CLI SHALL provide a top-level `show` command for displaying changes and specs with intelligent selection.

    Scenario: Interactive show selection
      When executing `openspec show` without arguments
      Then prompt user to select type (change or spec)
      And display list of available items for selected type
      And show the selected item's content

    Scenario: Non-interactive environments do not prompt
      Given stdin is not a TTY or `--no-interactive` is provided or environment variable `OPEN_SPEC_INTERACTIVE=0`
      When executing `openspec show` without arguments
      Then do not prompt
      And print a helpful hint with examples for `openspec show <item>` or `openspec change/spec show`
      And exit with code 1

    Scenario: Direct item display
      When executing `openspec show <item-name>`
      Then automatically detect if item is a change or spec
      And display the item's content
      And use appropriate formatting based on item type

    Scenario: Type detection and ambiguity handling
      When executing `openspec show <item-name>`
      Then if `<item-name>` uniquely matches a change or a spec, show that item
      And if it matches both, print an ambiguity error and suggest `--type change|spec` or using `openspec change show`/`openspec spec show`
      And if it matches neither, print not-found with nearest-match suggestions

    Scenario: Explicit type override
      When executing `openspec show --type change <item>`
      Then treat `<item>` as a change ID and show it (skipping auto-detection)
      When executing `openspec show --type spec <item>`
      Then treat `<item>` as a spec ID and show it (skipping auto-detection)

  @REQ-0104
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
        - Change-only flags: `--deltas-only` (alias `--requirements-only` deprecated)
        - Spec-only flags: `--requirements`, `--no-scenarios`, `-r/--requirement`
        """
      And ignore irrelevant flags for the detected type with a warning

  @REQ-0105
  Rule: Interactivity controls
    - The CLI SHALL respect `--no-interactive` to disable prompts.
    - The CLI SHALL respect `OPEN_SPEC_INTERACTIVE=0` to disable prompts globally.
    - Interactive prompts SHALL only be shown when stdin is a TTY and interactivity is not disabled.

    Scenario: Change-specific options
      When showing a change with `openspec show <change-name> --deltas-only`
      Then display only the deltas in JSON format
      And maintain compatibility with existing change show options

    Scenario: Spec-specific options
      When showing a spec with `openspec show <spec-id> --requirements`
      Then display only requirements in JSON format
      And support other spec options (--no-scenarios, -r)
      And maintain compatibility with existing spec show options
