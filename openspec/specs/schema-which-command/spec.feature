Feature: schema-which-command
  Define `openspec schema which` behavior for reporting resolved schema source, location, and fallback details.

  @REQ-0237
  Rule: Schema which shows resolution result
    The CLI SHALL provide an `openspec schema which <name>` command that displays where a schema resolves from.

    Scenario: Schema resolves from project
      When user runs `openspec schema which my-workflow` and schema exists in `openspec/schemas/my-workflow/`
      Then system displays source as "project"
      And displays full path to schema directory

    Scenario: Schema resolves from user directory
      When user runs `openspec schema which my-workflow` and schema exists only in user data directory
      Then system displays source as "user"
      And displays full path including XDG data directory

    Scenario: Schema resolves from package
      When user runs `openspec schema which spec-driven` and no override exists
      Then system displays source as "package"
      And displays full path to package's schemas directory

    Scenario: Schema not found
      When user runs `openspec schema which nonexistent`
      Then system displays error that schema was not found
      And lists available schemas
      And exits with non-zero code

  @REQ-0238
  Rule: Schema which shows shadowing information
    The CLI SHALL indicate when a schema shadows another schema at a lower priority level.

    Scenario: Project schema shadows package
      When user runs `openspec schema which spec-driven` and both project and package have `spec-driven`
      Then system displays that project schema is active
      And indicates it shadows the package version
      And shows path to shadowed package schema

    Scenario: No shadowing
      When schema exists only in one location
      Then system does not display shadowing information

    Scenario: Multiple shadows
      When project schema shadows both user and package schemas
      Then system lists all shadowed locations in priority order

  @REQ-0239
  Rule: Schema which outputs JSON format
    The CLI SHALL support `--json` flag for machine-readable output.

    Scenario: JSON output basic
      When user runs `openspec schema which spec-driven --json`
      Then system outputs JSON with `name`, `source`, and `path` fields

    Scenario: JSON output with shadows
      When user runs `openspec schema which spec-driven --json` and schema has shadows
      Then JSON includes `shadows` array with `source` and `path` for each shadowed schema

  @REQ-0240
  Rule: Schema which supports list mode
    The CLI SHALL support listing all schemas with their resolution sources.

    Scenario: List all schemas
      When user runs `openspec schema which --all`
      Then system displays all available schemas grouped by source
      And indicates which schemas shadow others

    Scenario: List in JSON format
      When user runs `openspec schema which --all --json`
      Then system outputs JSON array with resolution info for each schema
