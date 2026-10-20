Feature: context-injection

  @added @REQ-0299
  Rule: Expose current context to operation instruction surfaces
    The system SHALL expose project context to apply and archive instruction output by reading the current config from the selected planning root at execution time.

    Scenario: Apply requests current context
      When a user requests apply instructions and config contains project context
      Then apply output includes that context as a structured optional field

    Scenario: Archive requests current context
      When a user requests archive instructions and config contains project context
      Then archive output includes that context as a structured optional field

    Scenario: Selected store supplies context
      When apply or archive instructions target a selected store
      Then context is read from that store's resolved config rather than the current repository config

    Scenario: Context changes between operations
      When project context changes after one instruction call
      Then the next apply or archive instruction call receives the updated context

    Scenario: Context is absent
      When project config has no non-empty context
      Then apply and archive structured outputs omit the context field

  @added @REQ-0300
  Rule: Consume operation context as required agent instruction
    The system SHALL identify returned operation context as a required agent instruction input with the same prompt-level consumption expectation as the built-in instruction. Context supplies applicable project facts, conventions, and constraints without becoming output content or replacing CLI-controlled workflow state.

    Scenario: Skill applies project context
      When an apply or archive skill receives project context
      Then the skill tells the agent to read and consider the context
      And apply its relevant project facts, conventions, and constraints while performing the operation
      And the workflow does not automatically insert the context into an output file

    Scenario: Context conflicts with controlling workflow input
      When project context conflicts with a built-in workflow step, explicit user choice, resolved path, CLI-controlled state, or command contract
      Then the skill reports the conflict
      And does not use context to replace or bypass the controlling workflow input
      And does not claim that prompt text can enforce agent compliance
