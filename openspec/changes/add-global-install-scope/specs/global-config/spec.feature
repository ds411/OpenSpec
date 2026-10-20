Feature: global-config

  @added @REQ-0268
  Rule: Install scope field in global config
    The global config schema SHALL include install scope preference.

    Scenario: Config shape supports install scope
      When reading or writing global config
      Then config SHALL support `installScope` with allowed values `global` and `project`

    Scenario: Schema evolution default
      When loading legacy config without `installScope`
      Then the system SHALL preserve schema compatibility without mutating the file
      And effective install scope SHALL resolve to `project` until user explicitly sets `installScope`
      And preserve all other existing fields

    Scenario: New config default
      When creating a new global config
      Then the system SHALL persist `installScope: global` by default
      And users MAY switch to `project` explicitly

    Scenario: Invalid install scope value
      When config validation receives an invalid install scope value
      Then the value SHALL be rejected
      And the system SHALL preserve the existing valid configuration
