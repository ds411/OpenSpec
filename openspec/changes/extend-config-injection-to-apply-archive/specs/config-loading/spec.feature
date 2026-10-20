Feature: config-loading

  @added @REQ-0298
  Rule: Load operation guidance independently
    The system SHALL parse the optional `operations` project-config field independently from `schema`, `context`, `rules`, `references`, and `store` so an invalid operation entry does not discard other valid configuration.

    Scenario: Valid operation guidance
      When config contains `operations.apply.guidance` and `operations.archive.guidance` as arrays of strings
      Then the returned project config includes both operation entries

    Scenario: One operation is malformed
      When apply guidance is a valid string array and archive guidance is malformed
      Then the returned project config includes apply guidance
      And omits archive guidance with an actionable warning

    Scenario: Operations field is not an object
      When config contains a non-object `operations` value
      Then the system warns about the invalid field
      And continues with all independently valid config fields

    Scenario: Unknown operation ID
      When config contains an unsupported operation ID
      Then the system warns with the supported operation IDs
      And ignores only the unsupported operation entry

    Scenario: Unknown fields in an operation
      When a supported operation contains fields other than `guidance`
      Then the system warns about those fields
      And preserves valid guidance for that operation

    Scenario: Empty and formatted guidance
      When a guidance array contains empty strings and non-empty strings with line breaks or Markdown
      Then the system removes the empty entries
      And preserves the non-empty entries in their original order and form
