Feature: artifact-graph
  Define the artifact graph model, dependency validation, and completion-state logic used by schema-driven workflows.

  @REQ-0004
  Rule: Schema Loading
    The system SHALL load artifact graph definitions from YAML schema files within schema directories.

    Scenario: Valid schema loaded
      When a schema directory contains a valid `schema.yaml` file
      Then the system returns an ArtifactGraph with all artifacts and dependencies

    Scenario: Invalid schema rejected
      When a schema YAML file is missing required fields
      Then the system throws an error with a descriptive message

    Scenario: Cyclic dependencies detected
      When a schema contains cyclic artifact dependencies
      Then the system throws an error listing the artifact IDs in the cycle

    Scenario: Invalid dependency reference
      When an artifact's `requires` array references a non-existent artifact ID
      Then the system throws an error identifying the invalid reference

    Scenario: Duplicate artifact IDs rejected
      When a schema contains multiple artifacts with the same ID
      Then the system throws an error identifying the duplicate

    Scenario: Schema directory not found
      When resolving a schema name that has no corresponding directory
      Then the system throws an error listing available schemas

  @REQ-0005
  Rule: Build Order Calculation
    The system SHALL compute a valid topological build order for artifacts.

    Scenario: Linear dependency chain
      When artifacts form a linear chain (A → B → C)
      Then getBuildOrder() returns [A, B, C]

    Scenario: Diamond dependency
      When artifacts form a diamond (A → B, A → C, B → D, C → D)
      Then getBuildOrder() returns A before B and C, and D last

    Scenario: Independent artifacts
      When artifacts have no dependencies
      Then getBuildOrder() returns them in the order the schema declares them

    Scenario: Simultaneously ready artifacts ordered by declaration
      When artifacts become ready at the same time (spec-driven's specs and design both require only proposal)
      Then getBuildOrder() returns them in the order the schema's artifacts list declares them, not alphabetically
      And an artifact already waiting to be built is not placed ahead of one the schema declares before it

  @REQ-0006
  Rule: State Detection
    The system SHALL detect artifact completion state by scanning the filesystem.

    The system SHALL recognize `generates` values containing `*`, `?`, or `[` as glob patterns. It SHALL also support brace alternatives, brace ranges, and the `@()`, `+()`, `!()`, `*()`, and `?()` extglob forms. An artifact with a glob output SHALL be completed when at least one matching file exists.

    The system SHALL preserve literal filenames with a bare leading `!`, plain parentheses, or single-element braces when no supported glob syntax is present. Brace expansion SHALL preserve literal brace groups and recognize later and nested expansion groups. Expanded output paths and traversed symbolic links SHALL remain within the change directory.

    Scenario: Simple file exists
      When an artifact generates "proposal.md" and the file exists
      Then the artifact is marked as completed

    Scenario: Simple file missing
      When an artifact generates "proposal.md" and the file does not exist
      Then the artifact is not marked as completed

    Scenario: Glob pattern with files
      When an artifact generates "specs/*.md" and the specs/ directory contains .md files
      Then the artifact is marked as completed

    Scenario: Glob pattern empty
      When an artifact generates "specs/*.md" and the specs/ directory is empty or missing
      Then the artifact is not marked as completed

    Scenario: Missing change directory
      When the change directory does not exist
      Then all artifacts are marked as not completed (empty state)

    Scenario: Brace alternatives with matching files
      When an artifact generates "review-{api,ui}.md" and "review-api.md" exists
      Then the artifact is marked as completed

    Scenario: Brace range after a literal brace group
      When an artifact generates "report-{draft}-{1..3}.md"
      And "report-{draft}-1.md", "report-{draft}-2.md", "report-{draft}-3.md", and "report-{draft}-4.md" exist
      Then its resolved outputs contain exactly the first three files
      And the artifact is marked as completed

    Scenario: Later and nested brace alternatives
      When an artifact generates "report-{draft}-{{api},ui}.md" and "report-{draft}-{api}.md" exists
      Then the artifact is marked as completed

    Scenario: Extglob alternatives with matching files
      When an artifact generates "@(proposal|design).md" or "+(proposal|design).md" and "proposal.md" exists
      Then the artifact is marked as completed

    Scenario: Negative extglob excludes its alternatives
      When an artifact generates "!(proposal|design).md"
      And "proposal.md", "design.md", and "notes.md" exist
      Then its resolved outputs contain only "notes.md"
      And the artifact is marked as completed

    Scenario: Brace or extglob pattern without matching files
      When an artifact generates "review-{api,ui}.md" or "@(proposal|design).md" and no matching files exist
      Then the artifact is not marked as completed

    Scenario: Literal output names remain literal
      When an artifact generates "!review.md", "(proposal|design).md", or "review-{api}.md"
      Then completion depends on the existence of a file with that exact name

    Scenario: Brace expansion escapes the change directory
      When an artifact generates "{safe,../outside}/review.md"
      Then output resolution rejects the expanded path outside the change directory before matching files
      And rejection does not depend on whether the outside file exists

    Scenario: Expanded directory pattern reaches an outbound symbolic link
      When an artifact generates "content/{safe,linked}/review.md" or "content/@(safe|linked)/review.md"
      And "content/linked" is a symbolic link to a directory outside the change directory
      Then output resolution rejects traversal through that link even when no matching files exist

  @REQ-0007
  Rule: Glob Nesting Limit
    The system SHALL reject a glob `generates` or `apply.tracks` value that nests braces or parentheses more than 16 levels deep, counting them as the brace parser does, with an error naming the limit, before any glob matching runs.

    Scenario: Brace nesting beyond the limit
      When an artifact generates a pattern whose braces nest 17 levels deep
      Then resolving its outputs fails with an error naming the 16-level limit
      And no glob matching runs for that pattern

  @REQ-0008
  Rule: Ready Artifact Query
    The system SHALL identify which artifacts are ready to be created based on dependency completion.

    Scenario: Root artifacts ready initially
      When no artifacts are completed
      Then getNextArtifacts() returns artifacts with no dependencies

    Scenario: Dependent artifact becomes ready
      When an artifact's dependencies are all completed
      Then getNextArtifacts() includes that artifact

    Scenario: Blocked artifacts excluded
      When an artifact has uncompleted dependencies
      Then getNextArtifacts() does not include that artifact

    Scenario: Ready artifacts ordered by declaration
      When several artifacts are ready at once
      Then getNextArtifacts() returns them in the order the schema declares them, so the first entry is the artifact the schema recommends writing next

  @REQ-0009
  Rule: Completion Check
    The system SHALL determine when all artifacts in a graph are complete.

    Scenario: All complete
      When all artifacts in the graph are in the completed set
      Then isComplete() returns true

    Scenario: Partially complete
      When some artifacts in the graph are not completed
      Then isComplete() returns false

  @REQ-0010
  Rule: Blocked Query
    The system SHALL identify which artifacts are blocked and return all their unmet dependencies.

    Scenario: Artifact blocked by single dependency
      When artifact B requires artifact A and A is not complete
      Then getBlocked() returns `{ B: ['A'] }`

    Scenario: Artifact blocked by multiple dependencies
      When artifact C requires A and B, and only A is complete
      Then getBlocked() returns `{ C: ['B'] }`

    Scenario: Artifact blocked by all dependencies
      When artifact C requires A and B, and neither is complete
      Then getBlocked() returns `{ C: ['A', 'B'] }`
      And unmet dependencies are listed in the order the schema declares them

  @REQ-0011
  Rule: Schema Directory Structure
    The system SHALL support self-contained schema directories with co-located templates.

    Scenario: Schema with templates
      When a schema directory contains `schema.yaml` and `templates/` subdirectory
      Then artifacts can reference templates relative to the schema's templates directory

    Scenario: User schema override
      When a schema directory exists at `${XDG_DATA_HOME}/openspec/schemas/<name>/`
      Then the system uses that directory instead of the built-in

    Scenario: Built-in schema fallback
      When no user override exists for a schema
      Then the system uses the package built-in schema directory

    Scenario: List available schemas
      When listing schemas
      Then the system returns schema names from both user and package directories
