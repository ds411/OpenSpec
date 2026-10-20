Feature: operation-guidance

  @added @REQ-0301
  Rule: Configure operation guidance
    The system SHALL allow projects to configure additive advice for supported operations under `operations.<operation>.guidance` without treating that guidance as an artifact rule, the built-in workflow, or an enforceable check.

    Scenario: Configure apply and archive guidance
      When config contains guidance arrays under `operations.apply.guidance` and `operations.archive.guidance`
      Then both operation configurations are available to their matching operation
      And artifact rules remain unchanged

    Scenario: Operation has no guidance
      When a supported operation has no configured guidance or only empty guidance entries
      Then the operation output omits `operationGuidance`

  @added @REQ-0302
  Rule: Consume operation guidance as optional additive advice
    The system SHALL present returned operation guidance as optional additive advice rather than as the operation's built-in flow or an enforceable check. A skill that receives guidance SHALL tell the agent to read and consider every entry, follow entries that are applicable and compatible with the built-in workflow, and keep the field separate from built-in instructions, CLI-controlled state, and explicit user choices.

    Scenario: Guidance complements built-in flow
      When archive guidance asks for a concise completion summary
      Then the archive skill tells the agent to follow that applicable guidance
      And preserves its built-in steps and prompts

    Scenario: Guidance conflicts with built-in behavior
      When operation guidance conflicts with a built-in workflow step, explicit user choice, resolved path, or command contract
      Then instruction output keeps the conflicting text in `operationGuidance` rather than merging it into built-in instruction, state, path, or command fields
      And the generated skill tells the agent to explain why the advice was not followed
      And does not use the conflicting entry to replace or bypass the controlling workflow input
      And existing CLI validation, state calculation, resolved paths, and command contracts remain unchanged
      And the system does not claim that prompt text can enforce agent compliance

  @added @REQ-0303
  Rule: Load operation guidance at execution time
    The system SHALL read operation guidance from the current selected-root config whenever an apply or archive instruction surface is invoked.

    Scenario: Guidance changes after skill generation
      When a generated skill already exists and project operation guidance is later changed
      Then the next matching operation receives the updated guidance without regenerating the skill

    Scenario: Selected store supplies guidance
      When operation instructions target a selected store
      Then guidance is read from that store's config

  @added @REQ-0304
  Rule: Preserve guidance content
    The system SHALL preserve non-empty guidance strings, including line breaks and Markdown, when returning them to an operation.

    Scenario: Multi-line Markdown guidance
      When configured operation guidance contains multiple lines and Markdown
      Then structured operation output returns the text without rewriting its content
