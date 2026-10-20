Feature: change-creation
  Provide programmatic utilities for creating and validating OpenSpec change directories.

  @REQ-0012
  Rule: Change Creation
    The system SHALL provide a function to create new change directories programmatically.

    Scenario: Create change
      When `createChange(projectRoot, 'add-auth')` is called
      Then the system creates `openspec/changes/add-auth/` directory

    Scenario: Duplicate change rejected
      When `createChange(projectRoot, 'add-auth')` is called and `openspec/changes/add-auth/` already exists
      Then the system throws an error indicating the change already exists

    Scenario: Creates parent directories if needed
      When `createChange(projectRoot, 'add-auth')` is called and `openspec/changes/` does not exist
      Then the system creates the full path including parent directories

    Scenario: Invalid change name rejected
      When `createChange(projectRoot, 'Add Auth')` is called with an invalid name
      Then the system throws a validation error

  @REQ-0013
  Rule: Change Name Validation
    The system SHALL validate change names follow kebab-case conventions.

    Scenario: Valid kebab-case name accepted
      When a change name like `add-user-auth` is validated
      Then validation returns `{ valid: true }`

    Scenario: Numeric suffixes accepted
      When a change name like `add-feature-2` is validated
      Then validation returns `{ valid: true }`

    Scenario: Single word accepted
      When a change name like `refactor` is validated
      Then validation returns `{ valid: true }`

    Scenario: Uppercase characters rejected
      When a change name like `Add-Auth` is validated
      Then validation returns `{ valid: false, error: "..." }`

    Scenario: Spaces rejected
      When a change name like `add auth` is validated
      Then validation returns `{ valid: false, error: "..." }`

    Scenario: Underscores rejected
      When a change name like `add_auth` is validated
      Then validation returns `{ valid: false, error: "..." }`

    Scenario: Special characters rejected
      When a change name like `add-auth!` is validated
      Then validation returns `{ valid: false, error: "..." }`

    Scenario: Leading hyphen rejected
      When a change name like `-add-auth` is validated
      Then validation returns `{ valid: false, error: "..." }`

    Scenario: Trailing hyphen rejected
      When a change name like `add-auth-` is validated
      Then validation returns `{ valid: false, error: "..." }`

    Scenario: Consecutive hyphens rejected
      When a change name like `add--auth` is validated
      Then validation returns `{ valid: false, error: "..." }`
