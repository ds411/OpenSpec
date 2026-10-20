Feature: specs-sync-skill

  @added @REQ-0312
  Rule: Carry artifact rules into standalone spec sync
    The `/opsx:sync` skill SHALL use the selected change's concrete `specs` artifact outputs as its delta-spec input and SHALL apply current `specs` artifact rules before writing a main spec.

    Scenario: Discover delta specs from status
      When standalone sync assesses a selected change
      Then it uses `artifactPaths.specs.existingOutputPaths` from that change's status output as the complete delta-spec input
      And does not infer delta specs from other artifacts

    Scenario: Standalone sync fetches current artifact rules
      When `artifactPaths.specs.existingOutputPaths` contains one or more delta specs
      Then standalone sync requests `openspec instructions specs --change "<name>" --json` once using the selected change and planning root
      And applies only the returned artifact rules to main specs produced from those delta paths
      And keeps artifact rules separate from operation guidance and unrelated workflow steps

    Scenario: Specs instruction lookup fails
      When `openspec instructions specs --change "<name>" --json` exits non-zero or does not return valid artifact-instruction JSON
      Then standalone sync reports the instruction lookup error
      And stops before writing any main spec
      And does not treat the failed lookup as an absent artifact rule set

    Scenario: Schema or change has no specs outputs
      When `artifactPaths.specs` is absent or its `existingOutputPaths` list is empty
      Then standalone sync reports that there are no delta specs to sync
      And does not request artifact instructions or write a main spec

    Scenario: Archive supplies an artifact-rule snapshot
      When the sync workflow is invoked inline by archive with a specs-rule snapshot from current artifact instructions
      Then it reuses that supplied snapshot
      And does not fetch `specs` artifact instructions again

    Scenario: Artifact rules are absent
      When current `specs` instructions contain no rules
      Then the existing semantic merge behavior continues unchanged
