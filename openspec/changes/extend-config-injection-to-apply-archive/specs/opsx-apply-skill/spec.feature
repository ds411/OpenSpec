Feature: opsx-apply-skill

  @added @REQ-0305
  Rule: Consume current apply operation inputs
    The `/opsx:apply` skill SHALL consume current project context and apply operation guidance returned by `openspec instructions apply --change "<name>" --json` while preserving its existing state-driven workflow.

    Scenario: Apply context and guidance are configured
      When apply instruction output contains `context` and `operationGuidance`
      Then the skill treats context as a required prompt-level instruction input
      And tells the agent to read it and apply relevant project facts, conventions, and constraints
      And treats operation guidance as optional additive advice
      And tells the agent to read and consider it and follow entries that are applicable and compatible with the built-in workflow

    Scenario: Apply operation inputs are absent
      When apply instruction output omits context and operation guidance
      Then the skill continues with its existing apply workflow

    Scenario: Runtime instructions conflict with apply state
      When context or operation guidance conflicts with CLI-returned state, missing artifacts, tasks, progress, context files, or built-in instruction
      Then the generated skill keeps required project context and advisory operation guidance separate from the CLI-returned apply fields
      And tells the agent to report context conflicts
      And tells the agent to explain why conflicting or inapplicable operation guidance was not followed
      And this change does not modify the CLI-returned state, missing artifacts, tasks, progress, context files, or built-in instruction
      And the template tells the agent that neither field is evidence of task completion or permission to bypass a blocked state
      And the system does not represent that prompt-level precedence as an enforceable check

    Scenario: Apply consumes runtime instructions without copying them
      When the skill receives context or operation guidance
      Then it does not copy those fields verbatim into implementation files or planning artifacts unless separately requested by the user

  @added @REQ-0306
  Rule: Preserve apply workflow behavior
    The `/opsx:apply` skill template and CLI contract SHALL keep their existing change selection, context loading, task progression, pause-on-blocker behavior, and completion reporting structure in this change.

    Scenario: Runtime inputs are consumed
      When apply instructions return configured operation inputs
      Then no CLI-controlled apply state transition, required implementation task, or completion criterion is added, removed, or replaced solely by this change
