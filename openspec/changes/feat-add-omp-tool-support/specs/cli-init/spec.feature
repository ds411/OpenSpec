Feature: CLI Init

  @added @REQ-0313
  Rule: Oh My Pi tool supported in init
    The `openspec init` command SHALL support Oh My Pi as a configurable tool, generating both skill files and command files using Oh My Pi's conventions when selected.

    Scenario: Selecting Oh My Pi during init
      When a user selects Oh My Pi during `openspec init`
      Then skill files are written to `.omp/skills/openspec-<id>/SKILL.md` for each active command
      And command files are written to `.omp/commands/opsx-<id>.md` for each active command
      And skill file bodies use hyphen-based `/opsx-<id>` command references
      And command file bodies have `**Provided arguments**: $@` injected after any `**Input**:` heading

    Scenario: Oh My Pi listed when .omp directory is detected
      When the project root contains a `.omp/` directory
      Then Oh My Pi is pre-checked in the tool selection during `openspec init`
