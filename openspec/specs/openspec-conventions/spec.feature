Feature: OpenSpec Conventions
  OpenSpec conventions SHALL define how system capabilities are documented, how changes are proposed and tracked, and how specifications evolve over time. This meta-specification serves as the source of truth for OpenSpec's own conventions.

  @REQ-0174
  Rule: Structured conventions for specs and changes
    OpenSpec conventions SHALL mandate a structured spec format with clear requirement and scenario sections so tooling can parse consistently.

    Scenario: Following the structured spec format
      When writing or updating OpenSpec specifications
      Then authors SHALL use `### Requirement: ...` followed by at least one `#### Scenario: ...` section

  @REQ-0175
  Rule: Behavior-First Specification Boundary
    OpenSpec specifications SHALL capture verifiable behavior contracts and avoid internal implementation detail.

    Scenario: Writing behavior requirements
      When documenting a capability in `spec.md`
      Then requirements focus on externally observable behavior, interfaces, error handling, and constraints
      And scenarios remain testable or explicitly verifiable

    Scenario: Avoiding implementation leakage
      When details involve concrete library choices, class/function structure, or execution mechanics
      Then those details SHALL be documented in `design.md` or `tasks.md` instead of behavioral requirements

  @REQ-0176
  Rule: Progressive Rigor
    OpenSpec conventions SHALL keep specs lightweight by default and scale rigor only when risk or coordination complexity demands it.

    Scenario: Routine change specification
      When a change is local and low-risk
      Then authors use concise, behavior-first requirements with minimal ceremony

    Scenario: High-risk or cross-boundary change specification
      When a change is cross-team, cross-repo, API-contract breaking, migration-heavy, or security/privacy sensitive
      Then authors increase detail and explicit validation expectations proportionally

  @REQ-0177
  Rule: Project Structure
    An OpenSpec project SHALL maintain a consistent directory structure for specifications and changes.

    Scenario: Initializing project structure
      When an OpenSpec project is initialized
      Then it SHALL have this structure:
        """
        openspec/
        ├── project.md              # Project-specific context
        ├── AGENTS.md               # AI assistant instructions
        ├── specs/                  # Current deployed capabilities
        │   └── <capability-path>/  # One or more directories for a focused capability
        │       ├── spec.md         # WHAT and WHY
        │       └── design.md       # HOW (optional, for established patterns)
        └── changes/                # Proposed changes
            ├── [change-name]/      # Descriptive change identifier
            │   ├── proposal.md     # Why, what, and impact
            │   ├── tasks.md        # Implementation checklist
            │   ├── design.md       # Technical decisions (optional)
            │   └── specs/          # Complete future state
            │       └── <capability-path>/
            │           └── spec.md # Clean markdown (no diff syntax)
            └── archive/            # Completed changes
                └── YYYY-MM-DD-[name]/
        """

  @REQ-0178
  Rule: Structured Format for Behavioral Specs
    Behavioral specifications SHALL use a structured format with consistent section headers and keywords to ensure visual consistency and parseability.

    Scenario: Writing requirement sections
      When documenting a requirement in a behavioral specification
      Then use a level-3 heading with format `### Requirement: [Name]`
      And immediately follow with a SHALL statement describing core behavior
      And keep requirement names descriptive and under 50 characters

    Scenario: Documenting scenarios
      When documenting specific behaviors or use cases
      Then use level-4 headings with format `#### Scenario: [Description]`
      And use bullet points with bold keywords for steps:
        """
        - **GIVEN** for initial state (optional)
        - **WHEN** for conditions or triggers
        - **THEN** for expected outcomes
        - **AND** for additional outcomes or conditions
        """

    Scenario: Adding implementation details
      When a step requires additional detail
      Then use sub-bullets under the main step
      And maintain consistent indentation
        """
        - Sub-bullets provide examples or specifics
        - Keep sub-bullets concise
        """

  @REQ-0179
  Rule: Header-Based Requirement Identification
    Requirement headers SHALL serve as unique identifiers for programmatic matching between current specs and proposed changes.

    Scenario: Matching requirements programmatically
      When processing delta changes
      Then use the `### Requirement: [Name]` header as the unique identifier
      And strip a closing run of `#` characters when a space or tab precedes it and only spaces or tabs follow it, then trim surrounding whitespace
      And compare normalized requirement names with case-sensitive equality

    Scenario: Handling requirement renames
      When renaming a requirement
      Then use a special `## RENAMED Requirements` section
      And specify both old and new names explicitly:
        """markdown
        ## RENAMED Requirements
        - FROM: `### Requirement: Old Name`
        - TO: `### Requirement: New Name`
        """
      And if content also changes, include under MODIFIED using the NEW header

    Scenario: Validating header uniqueness
      When creating or modifying requirements
      Then ensure no duplicate headers exist within a spec
      And validation tools SHALL flag duplicate headers as errors

  @REQ-0180
  Rule: Change Storage Convention
    Change proposals SHALL store only the additions, modifications, and removals to specifications, not complete future states.

    Scenario: Creating change proposals with additions
      When creating a change proposal that adds new requirements
      Then include only the new requirements under `## ADDED Requirements`
      And each requirement SHALL include its complete content
      And use the standard structured format for requirements and scenarios

    Scenario: Creating change proposals with modifications
      When creating a change proposal that modifies existing requirements
      Then include the modified requirements under `## MODIFIED Requirements`
      And use the same header text as in the current spec (normalized)
      And include the complete modified requirement (not a diff)
      And optionally annotate what changed with inline comments like `← (was X)`

    Scenario: Creating change proposals with removals
      When creating a change proposal that removes requirements
      Then list them under `## REMOVED Requirements`
      And use the normalized header text for identification
      And include reason for removal
      And document any migration path if applicable
        """
        The `changes/[name]/specs/` directory SHALL contain:
        """
      And Delta files showing only what changes
      And Sections for ADDED, MODIFIED, REMOVED, and RENAMED requirements
      And An optional `## Purpose` section on deltas that introduce a new capability
      And Normalized header matching for requirement identification
      And Complete requirements using the structured format
      And Clear indication of change type for each requirement

    Scenario: Introducing a new capability
      When a delta introduces a capability that has no main spec yet
      Then the delta MAY open with a `## Purpose` section describing the capability
      And that Purpose SHALL seed the main spec created for it
      And a delta for a capability that already has a main spec SHOULD NOT carry a `## Purpose`, because the existing Purpose is authoritative and the delta's is ignored

    Scenario: Using standard output symbols
      When displaying delta operations in CLI output
      Then use these standard symbols:
        """
        - `+` for ADDED (green)
        - `~` for MODIFIED (yellow)
        - `-` for REMOVED (red)
        - `→` for RENAMED (cyan)
        """

  @REQ-0181
  Rule: Archive Process Enhancement
    The archive process SHALL programmatically apply delta changes to current specifications using header-based matching.

    Scenario: Archiving changes with deltas
      When archiving a completed change
      Then the archive command SHALL:
        """
        1. Parse RENAMED sections first and apply renames
        2. Parse REMOVED sections and remove by normalized header match
        3. Parse MODIFIED sections and replace by normalized header match (using new names if renamed)
        4. Parse ADDED sections and append new requirements
        """
      And validate that all MODIFIED headers exist in current spec
      And treat a REMOVED header that is already absent as already removed (warn and continue; a REMOVED header that names the FROM side of a RENAMED in the same delta — compared case- and whitespace-insensitively — or that differs only in case or whitespace from an existing requirement, is a conflict)
      And treat an ADDED header that already exists with identical content as already synced (differing content is a conflict)
      And treat a RENAMED whose source is gone but target present as already synced
      And generate the updated spec in the main specs/ directory

    Scenario: Handling conflicts during archive
      When delta changes conflict with current spec state
      Then the archive command SHALL report specific conflicts
      And require manual resolution before proceeding
      And provide clear guidance on resolving conflicts

  @REQ-0182
  Rule: Proposal Format
    Proposals SHALL explicitly document all changes with clear from/to comparisons.

    Scenario: Documenting changes
      When documenting what changes
      Then the proposal SHALL explicitly describe each change:
        """
        ```markdown
        **[Section or Behavior Name]**
        - From: [current state/requirement]
        - To: [future state/requirement]
        - Reason: [why this change is needed]
        - Impact: [breaking/non-breaking, who's affected]
        ```

        This explicit format compensates for not having inline diffs and ensures reviewers understand exactly what will change.
        """

  @REQ-0183
  Rule: Change Review
    The system SHALL support multiple methods for reviewing proposed changes.

    Scenario: Reviewing changes
      When reviewing proposed changes
      Then reviewers can compare using:
      And GitHub PR diff view when changes are committed
      And Command line: `diff -u "specs/<capability-path>/spec.md" "changes/<name>/specs/<capability-path>/spec.md"`
      And Any visual diff tool comparing current vs future state

  @REQ-0184
  Rule: Structured Format Adoption
    Behavioral specifications SHALL adopt the structured format with `### Requirement:` and `#### Scenario:` headers as the default.

    Scenario: Use structured headings for behavior
      When documenting behavioral requirements
      Then use `### Requirement:` for requirements
      And use `#### Scenario:` for scenarios with bold WHEN/THEN/AND keywords

  @REQ-0185
  Rule: Verb–Noun CLI Command Structure
    OpenSpec CLI design SHALL use verbs as top-level commands with nouns provided as arguments or flags for scoping.

    Scenario: Verb-first command discovery
      When a user runs a command like `openspec list`
      Then the verb communicates the action clearly
      And nouns refine scope via flags or arguments (e.g., `--changes`, `--specs`)

    Scenario: Backward compatibility for noun commands
      When users run noun-prefixed commands such as `openspec spec ...` or `openspec change ...`
      Then the CLI SHALL continue to support them for at least one release
      And display a deprecation warning that points to verb-first alternatives

    Scenario: Disambiguation guidance
      When item names are ambiguous between changes and specs
      Then `openspec show` and `openspec validate` SHALL accept `--type spec|change`
      And the help text SHALL document this clearly
