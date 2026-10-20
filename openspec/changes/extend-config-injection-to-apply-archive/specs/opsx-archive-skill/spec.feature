Feature: OPSX Archive Skill

  @added @REQ-0307
  Rule: Load current archive operation inputs
    The `/opsx:archive` skill SHALL request current archive operation inputs after resolving the target change and selected planning root, while preserving its existing archive workflow.

    Scenario: Archive context and guidance are configured
      When the skill has selected a change
      And current config contains project context and `operations.archive.guidance`
      Then the skill calls `openspec instructions archive --change "<name>" --json` with the selected-root context
      And treats context as a required prompt-level instruction input
      And tells the agent to read it and apply relevant project facts, conventions, and constraints
      And treats operation guidance as optional additive advice
      And tells the agent to read and consider it and follow entries that are applicable and compatible with the built-in archive workflow

    Scenario: Archive operation inputs are absent
      When archive instruction output omits context and operation guidance
      Then the skill continues with its existing archive workflow

    Scenario: Archive instruction lookup fails
      When `openspec instructions archive --change "<name>" --json` exits non-zero or does not return valid archive-instruction JSON
      Then the skill reports the instruction lookup error
      And stops before inspecting or writing specs or moving the change
      And does not treat the failed lookup as absent context or operation guidance

    Scenario: Archive context or guidance conflicts with the workflow
      When returned context or operation guidance conflicts with a built-in archive step, explicit user choice, resolved path, or command contract
      Then the generated skill keeps required project context and advisory operation guidance separate from built-in steps and CLI-derived values
      And tells the agent to report context conflicts
      And tells the agent to explain why conflicting or inapplicable operation guidance was not followed
      And this change leaves existing CLI checks, resolved paths, and command contracts unchanged
      And the template tells the agent not to infer replacement paths, skipped prompts, or command flags from either field
      And the system does not represent that prompt-level precedence as an enforceable check

    Scenario: Archive consumes runtime instructions without copying them
      When the skill receives context or operation guidance
      Then it does not copy those fields verbatim into specs, change artifacts, or archive summaries unless separately requested by the user

  @added @REQ-0308
  Rule: Preserve archive execution behavior
    The `/opsx:archive` skill SHALL keep its existing completion checks, task checks, spec-sync decision, confirmation behavior, archive move, and completion summary in this change.

    Scenario: Runtime inputs are loaded
      When archive instructions return configured inputs
      Then no archive execution phase, filesystem operation, or user decision is added, removed, or reordered solely by this change

  @added @REQ-0309
  Rule: Carry artifact rules into archive-driven spec sync
    The `/opsx:archive` skill SHALL fetch current `specs` artifact instructions before archive-driven spec sync writes main specs and SHALL use the returned artifact rules only to constrain those specs.

    Scenario: Archive discovers delta specs from the specs artifact
      When archive assesses delta specs for a selected change
      Then it uses `artifactPaths.specs.existingOutputPaths` from that change's status output as the complete delta-spec input
      And does not infer delta specs from other artifacts

    Scenario: Schema or change has no specs outputs
      When `artifactPaths.specs` is absent or its `existingOutputPaths` list is empty
      Then archive continues without a spec-sync prompt
      And does not request `specs` artifact instructions

    Scenario: Archive sync writes main specs
      When `artifactPaths.specs.existingOutputPaths` contains delta specs
      And the user chooses to sync them during archive
      Then the skill requests `openspec instructions specs --change "<name>" --json` once using the selected change and planning root
      And applies the returned artifact rules while semantically merging the delta into the main spec
      And keeps artifact rules separate from archive `operationGuidance`
      And passes the specs-rule snapshot to the inline sync workflow so that workflow does not fetch the same instructions again

    Scenario: Specs instruction lookup fails
      When delta specs exist and the user chooses to sync them during archive
      And `openspec instructions specs --change "<name>" --json` exits non-zero or does not return valid artifact-instruction JSON
      Then the skill reports the instruction lookup error
      And stops before modifying any main spec or moving the change
      And does not treat the failed lookup as an absent artifact rule set

    Scenario: User archives without syncing
      When delta specs exist and the user explicitly chooses archive without syncing
      Then the skill does not request `specs` artifact instructions for a merge
      And the existing archive-without-sync path continues

    Scenario: Artifact rules are absent
      When archive-driven spec sync receives no rules from `specs` artifact instructions
      Then the existing semantic merge behavior continues unchanged

    Scenario: Artifact rules contain operation-like advice
      When an artifact rule describes archive paths, prompts, command flags, or unrelated workflow steps
      Then the generated skill limits that rule to the content and form of the artifact being written
      And existing archive paths, prompts, CLI checks, and command contracts remain unchanged

    Scenario: Artifact rule text is consumed
      When archive-driven spec sync applies artifact rules
      Then the rules guide the resulting artifact without being copied verbatim into that artifact or the archive summary
