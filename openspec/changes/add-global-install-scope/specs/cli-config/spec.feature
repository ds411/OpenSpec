Feature: cli-config

  @added @REQ-0262
  Rule: Install scope configuration via profile flow
    The config profile workflow SHALL allow users to configure install scope preference.

    Scenario: Interactive profile includes install scope
      When user runs `openspec config profile`
      Then the interactive flow SHALL include install scope selection with values `global` and `project`
      And the currently configured value SHALL be pre-selected

    Scenario: Save install scope
      When user confirms config profile changes
      Then selected install scope SHALL be saved to global config

  @added @REQ-0263
  Rule: Install scope visibility in config output
    The config command SHALL display install scope preference in human-readable output.

    Scenario: Config list shows install scope
      When user runs `openspec config list`
      Then output SHALL include current install scope value
      And indicate whether value is default or explicit
