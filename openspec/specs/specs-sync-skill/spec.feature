Feature: specs-sync-skill
  Defines the agent skill for syncing delta specs from changes to main specs.

  @REQ-0241
  Rule: Specs Sync Skill
    The system SHALL provide an `/opsx:sync` skill that syncs delta specs from a change to the main specs.

    Scenario: Sync delta specs to main specs
      When agent executes `/opsx:sync` with a change name
      Then the agent reads delta specs from `openspec/changes/<name>/specs/`
      And reads corresponding main specs from `openspec/specs/`
      And reconciles main specs to match what the deltas describe

    Scenario: Idempotent operation
      When agent executes `/opsx:sync` multiple times on the same change
      Then the result is the same as running it once
      And no duplicate requirements are created

    Scenario: Change selection prompt
      When agent executes `/opsx:sync` without specifying a change
      Then the agent infers the change from conversation context, or auto-selects it when only one active change exists
      And when ambiguous, prompts user to select from available changes, showing changes that have delta specs
      And announces which change was selected and how to override

  @REQ-0242
  Rule: Delta Reconciliation Logic
    The agent SHALL reconcile main specs with delta specs using the delta operation headers.

    Scenario: ADDED requirements
      When delta contains `## ADDED Requirements` with a requirement
      And the requirement does not exist in main spec
      Then add the requirement to main spec

    Scenario: ADDED requirement already exists
      When delta contains `## ADDED Requirements` with a requirement
      And a requirement with the same name already exists in main spec
      Then update the existing requirement to match the delta version

    Scenario: MODIFIED requirements
      When delta contains `## MODIFIED Requirements` with a requirement
      And the requirement exists in main spec
      Then replace the requirement in main spec with the delta version

    Scenario: REMOVED requirements
      When delta contains `## REMOVED Requirements` with a requirement name
      And the requirement exists in main spec
      Then remove the requirement from main spec

    Scenario: REMOVED requirements retire the capability
      When removing the requirements named in the delta leaves no requirement blocks
      And every other nonblank line in the whole file is accounted for as the title, Purpose, Requirements header, or a canonical requirement's statement, scenarios, or fenced examples
      And the rest of the spec is well-formed and it was not already empty before this sync
      And the change declares `retire_capabilities: true` in its metadata
      And the `spec.md` resolves inside the real specs root
      Then delete that capability's `spec.md`, and its directory once nothing else remains in it
      And report the retirement and name the deleted `## Purpose`
      And leave the file in place and say the marker is missing when it is not declared

    Scenario: Something is left in the spec
      When any of those conditions fails - unaccounted content remains anywhere in the file, the spec is malformed, or nothing was removed this run
      Then do not modify the main spec and stop the sync for that capability
      And report the blocking condition and how the user can resolve it
      And never write or leave an empty `## Requirements` section

    Scenario: RENAMED requirements
      When delta contains `## RENAMED Requirements` with FROM:/TO: format
      And the FROM requirement exists in main spec
      Then rename the requirement to the TO name

    Scenario: New capability spec
      When delta spec exists for a capability not in main specs
      And it has ADDED requirements and no MODIFIED or RENAMED requirements
      Then create new main spec file at `openspec/specs/<capability-path>/spec.md`, preserving the delta's path relative to `specs/`
      And copy the delta's `## Purpose` body into it when the delta has one, matching what `openspec archive` does
      And write a brief TBD placeholder Purpose only when the delta has none

    Scenario: MODIFIED or RENAMED against a capability with no main spec
      When delta contains `## MODIFIED Requirements` or `## RENAMED Requirements`
      And the capability has no main spec yet
      Then stop the sync for that capability and report that only ADDED requirements are allowed for a new spec, matching what `openspec archive` does
      And never invent the missing requirement
      And skip any `## REMOVED Requirements` with a warning, since there is nothing to remove

    Scenario: Nothing to put in a new spec
      When a delta targets a capability with no main spec
      And the delta has no `## ADDED Requirements` to seed it with
      Then create no main spec and leave the specs directory untouched
      And for a REMOVED-only delta with `retire_capabilities: true` in the change's `.openspec.yaml`, report the capability as already retired and continue without recreating it
      And without that marker, report a REMOVED-only sync as blocked, matching `openspec archive`, which aborts with `Spec must have at least one requirement`
      And report an empty delta as blocked because it has no operations to sync
      And never write an empty `## Requirements` section

    Scenario: Merged main spec keeps canonical structure
      When the agent writes a main spec during sync
      Then every requirement lives under a single `## Requirements` section
      And the main spec contains no delta operation headers (`## ADDED/MODIFIED/REMOVED/RENAMED Requirements`)

  @REQ-0243
  Rule: Skill Output
    The skill SHALL provide clear feedback on what was applied.

    Scenario: Show applied changes
      When reconciliation completes successfully
      Then display summary of changes per capability:
        """
        - Number of requirements added
        - Number of requirements modified
        - Number of requirements removed
        - Number of requirements renamed
        """

    Scenario: No changes needed
      When main specs already match delta specs
      Then display "Specs already in sync - no changes needed"
