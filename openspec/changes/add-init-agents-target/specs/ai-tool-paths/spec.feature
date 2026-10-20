Feature: ai-tool-paths

  @added @REQ-0274
  Rule: Shared .agents skills target
    OpenSpec SHALL provide a vendor-neutral `agents` tool target rooted at the shared `.agents` directory, for assistants that read skills from the shared location rather than a vendor-specific one.

    Scenario: Shared agents target paths defined
      When looking up the `agents` tool
      Then `skillsDir` SHALL be `.agents`

    Scenario: Detection keys off the shared skills subtree
      When a project contains a `.agents/skills` path
      Then OpenSpec SHALL detect `agents` as an available target

    Scenario: A bare shared root does not select the target
      Given a project contains `.agents` but no `.agents/skills` path
      When OpenSpec detects available tools
      Then `agents` SHALL NOT be reported as available
