Feature: ai-tool-paths
  Define AI tool path metadata used to generate OpenSpec skills and commands in tool-specific directories.

  @REQ-0001
  Rule: AIToolOption skillsDir field
    The `AIToolOption` interface SHALL include an optional `skillsDir` field for skill generation path configuration.

    Scenario: Interface includes skillsDir field
      When a tool entry is defined in `AI_TOOLS` that supports skill generation
      Then it SHALL include a `skillsDir` field specifying the project-local base directory (e.g., `.claude`)

    Scenario: Skills path follows Agent Skills spec
      When generating skills for a tool with `skillsDir: '.claude'`
      Then skills SHALL be written to `<projectRoot>/<skillsDir>/skills/`
      And the `/skills` suffix is appended per Agent Skills specification

  @REQ-0002
  Rule: Path configuration for supported tools
    The `AI_TOOLS` array SHALL include `skillsDir` for tools that support the Agent Skills specification.

    Scenario: Claude Code paths defined
      When looking up the `claude` tool
      Then `skillsDir` SHALL be `.claude`

    Scenario: Cursor paths defined
      When looking up the `cursor` tool
      Then `skillsDir` SHALL be `.cursor`

    Scenario: Devin Desktop paths defined
      When looking up the `devin` tool
      Then `skillsDir` SHALL be `.devin`

    Scenario: Legacy Windsurf tool ID
      When initializing with `openspec init --tools windsurf`
      Then the `windsurf` alias SHALL resolve to `devin`
      And when skill delivery is enabled, skills SHALL be generated under `.devin/skills/`, not `.windsurf/skills/`

    Scenario: Kimi Code paths defined
      When looking up the `kimi` tool
      Then `skillsDir` SHALL be `.kimi-code`
      And OpenSpec-managed skills remaining under the legacy `.kimi/skills` directory SHALL be migrated to `.kimi-code/skills` during init and update, preserving user files

    Scenario: Hermes Agent paths defined
      When looking up the `hermes` tool
      Then `skillsDir` SHALL be `.hermes`
      And `setupNote` SHALL explain that project `.hermes/skills` must be added to `skills.external_dirs` in `~/.hermes/config.yaml`
      And `openspec init` and `openspec update` SHALL display the note whenever `hermes` is configured

    Scenario: DeepSeek Harness paths defined
      When looking up the `dsh` tool
      Then `skillsDir` SHALL be `.dsh`
      And auto-detection SHALL require `.dsh` to be a directory
      And OpenSpec SHALL write dsh skills under `<projectRoot>/.dsh/skills/` using platform-native path joining

    Scenario: Grok Build paths defined
      When looking up the `grok` tool
      Then `skillsDir` SHALL be `.grok`

    Scenario: Warp paths and detection defined
      When looking up the `warp` tool
      Then `skillsDir` SHALL be `.warp`
      And `detectionPaths` SHALL include `.warp` and `WARP.md`

    Scenario: Warp invokes skills without command files
      When generating workflows for the `warp` tool with delivery set to `commands`
      Then skills SHALL remain installed in `.warp/skills/`
      And no command adapter or command files SHALL be required
      And each skill SHALL be directly invocable by its `/openspec-*` name

    Scenario: Tools without skillsDir
      When a tool has no `skillsDir` defined
      Then skill generation SHALL error with message indicating the tool is not supported

  @REQ-0003
  Rule: Cross-platform path handling
    The system SHALL handle paths correctly across operating systems.

    Scenario: Path construction on Windows
      When constructing skill paths on Windows
      Then the system SHALL use `path.join()` for all path construction
      And SHALL NOT hardcode forward slashes

    Scenario: Path construction on Unix
      When constructing skill paths on macOS or Linux
      Then the system SHALL use `path.join()` for consistency
