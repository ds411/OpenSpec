Feature: oh-my-pi-tool

  @added @REQ-0315
  Rule: Oh My Pi command file generation
    OpenSpec SHALL generate command files for Oh My Pi in `.omp/commands/opsx-<id>.md`, one per active workflow command.

    Each file SHALL include a YAML frontmatter block with a `description` field. The command body SHALL transform `/opsx:` references to `/opsx-` to match Oh My Pi's filename-based slash command naming (e.g., `opsx-propose.md` → `/opsx-propose`). It SHALL inject `**Provided arguments**: $@` on the line immediately following any `**Input**:` heading, unless `$@` or `$ARGUMENTS` is already present in the body.

    Scenario: Command file path follows OMP convention
      When OpenSpec generates a command file for Oh My Pi for workflow command `propose`
      Then the file is written to `.omp/commands/opsx-propose.md`

    Scenario: Command file format includes description frontmatter
      When OpenSpec writes a command file for Oh My Pi
      Then the file begins with a YAML frontmatter block containing only a `description` field
      And the body follows the closing `---`

    Scenario: Command body uses hyphen-based references
      When OpenSpec writes a command file for Oh My Pi whose body contains `/opsx:apply` or similar colon-style references
      Then those references are transformed to `/opsx-apply` in the output file

    Scenario: Command body exposes user arguments via $@
      When OpenSpec writes a command file for Oh My Pi whose body contains a `**Input**:` heading and no existing `$@` or `$ARGUMENTS` reference
      Then `**Provided arguments**: $@` is injected on the line immediately after the `**Input**:` heading
      And when the user invokes `/opsx-propose my-feature`, the agent receives `my-feature` as the value of `$@`

  @added @REQ-0316
  Rule: Oh My Pi skill file generation
    OpenSpec SHALL generate skill files for Oh My Pi in `.omp/skills/openspec-<id>/SKILL.md`, one per active workflow command.

    Skill file bodies SHALL have `/opsx:` references transformed to `/opsx-` so that skill invocations refer to the correct hyphen-based slash command names.

    Scenario: Skill file path follows OMP convention
      When OpenSpec generates a skill file for Oh My Pi for workflow command `explore`
      Then the file is written to `.omp/skills/openspec-explore/SKILL.md`

    Scenario: Skill body uses hyphen-based references
      When OpenSpec writes a skill file for Oh My Pi whose body contains `/opsx:explore`
      Then the reference is transformed to `/opsx-explore` in the output file

  @added @REQ-0317
  Rule: Oh My Pi tool detection
    OpenSpec SHALL detect an Oh My Pi installation when the `.omp/` directory exists at the project root, and SHALL present Oh My Pi as a selectable tool in `openspec init` and `openspec update`.

    Scenario: Auto-detection when .omp directory exists
      When the project root contains a `.omp/` directory
      Then Oh My Pi is listed as a detected tool during `openspec init` and `openspec update`

    Scenario: Oh My Pi appears in the tool selection list
      When a user runs `openspec init` interactively
      Then Oh My Pi appears as a selectable option in the tool list
