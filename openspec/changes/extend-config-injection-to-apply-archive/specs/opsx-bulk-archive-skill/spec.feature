Feature: opsx-bulk-archive-skill

  @added @REQ-0310
  Rule: Load current archive inputs for a batch
    The `/opsx:bulk-archive` skill SHALL request current archive operation inputs once for the selected planning root without changing its existing batch orchestration.

    Scenario: Batch context and guidance are configured
      When the skill has selected one or more changes from one planning root
      Then it calls `openspec instructions archive --change "<selected-change>" --json` once for that root
      And treats context as a required prompt-level instruction input and applies relevant project facts, conventions, and constraints across the batch
      And treats operation guidance as optional additive advice, considers every entry, and follows entries that are applicable and compatible with the built-in batch workflow

    Scenario: Batch operation inputs are absent
      When archive instruction output omits context and operation guidance
      Then the skill continues with its existing bulk archive behavior

    Scenario: Batch archive instruction lookup fails
      When `openspec instructions archive --change "<selected-change>" --json` exits non-zero or does not return valid archive-instruction JSON
      Then the skill reports the instruction lookup error
      And stops the batch before inspecting or writing specs or moving any change
      And does not treat the failed lookup as absent context or operation guidance

    Scenario: Context or guidance conflicts with batch behavior
      When context or operation guidance conflicts with built-in conflict analysis, explicit user choices, resolved paths, or command contracts
      Then the generated skill keeps required project context and advisory operation guidance separate from conflict analysis and CLI-derived values
      And tells the agent to report context conflicts
      And tells the agent to explain why conflicting or inapplicable operation guidance was not followed
      And this change leaves existing CLI checks, resolved paths, and command contracts unchanged
      And the template tells the agent not to infer skipped prompts, replacement paths, or command flags from either field
      And the system does not represent that prompt-level precedence as an enforceable check

  @added @REQ-0311
  Rule: Carry artifact rules into each batch spec sync
    The `/opsx:bulk-archive` skill SHALL fetch current `specs` artifact instructions for each selected change with concrete delta specs and SHALL use the returned artifact rules only for main specs written by that change's merge.

    Scenario: Discover specs inputs per change
      When bulk archive assesses delta specs for a selected change
      Then it uses that change's `artifactPaths.specs.existingOutputPaths` as the complete delta-spec input
      And does not infer delta specs from other artifacts

    Scenario: Selected changes use different schemas
      When a batch contains changes using different schemas
      Then the skill evaluates `artifactPaths.specs.existingOutputPaths` separately for each change
      And requests `specs` artifact instructions once for each change whose list contains delta specs, using that change and selected root
      And obtains every required specs-instruction snapshot before the first main-spec write
      And applies each returned rule set only to main specs produced from that change
      And passes each change's specs-rule snapshot to its inline sync workflow without a duplicate instruction fetch

    Scenario: A batch specs instruction lookup fails
      When a required `openspec instructions specs --change "<name>" --json` lookup exits non-zero or does not return valid artifact-instruction JSON
      Then the skill reports the affected change and instruction lookup error
      And stops the whole batch before writing any main spec or moving any change
      And does not treat the failed lookup as an absent artifact rule set

    Scenario: A batch change has no specs outputs
      When a selected change has no `artifactPaths.specs` entry or its `existingOutputPaths` list is empty
      Then no spec sync or `specs` instruction lookup is performed for that change
      And the change continues through the existing batch archive flow

    Scenario: Batch artifact rules remain separate from archive guidance
      When artifact instructions contain rules and archive instructions contain `operationGuidance`
      Then artifact rules constrain spec content and form
      And configured archive guidance remains optional additive advice for choices within the archive operation
      And neither field is relabeled or merged into the other

    Scenario: Batch has no artifact rules
      When `specs` artifact instructions return no rules for a selected change
      Then the existing batch conflict resolution and semantic merge behavior continue unchanged
