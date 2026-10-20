Feature: ai-tool-paths

  @added @REQ-0343
  Rule: IBM Bob tool identity
    The `AI_TOOLS` entry for `bob` SHALL use the IBM Bob product name without changing its skill or command paths.

    Scenario: IBM Bob paths and display name
      When looking up the `bob` tool
      Then `name` and `successLabel` SHALL be `IBM Bob`
      And `skillsDir` SHALL be `.bob`
      And generated commands SHALL remain under `.bob/commands/`
