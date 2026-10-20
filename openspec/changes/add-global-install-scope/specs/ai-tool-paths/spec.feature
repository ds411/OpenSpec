Feature: ai-tool-paths

  @modified @REQ-0001
  Rule: AIToolOption skillsDir field
    The `AIToolOption` interface SHALL include scope support metadata in addition to path metadata.

    Scenario: Scope support metadata present
      When a tool entry is defined in `AI_TOOLS`
      Then it MAY declare supported install scopes for skills and commands
      And this metadata SHALL be used for effective scope resolution

    Scenario: Scope support metadata absent
      When a tool entry in `AI_TOOLS` omits scope support metadata for a surface
      Then resolver behavior SHALL default that surface to project-only support
      And effective scope resolution SHALL apply normal preferred/fallback rules against that default

  @modified @REQ-0002
  Rule: Path configuration for supported tools
    Path metadata SHALL support both project and global install targets via resolver logic.

    Scenario: Project scope path
      When effective scope is `project` for skills
      Then `skillsDir` SHALL be treated as a tool-specific container path under project root
      And managed skill artifacts SHALL be written under `<projectRoot>/<skillsDir>/skills/`
      And tool definitions SHALL set `skillsDir` accordingly (for example `.openspec` -> `.openspec/skills/`)

    Scenario: Global scope path
      When effective scope is `global` for a supported tool/surface
      Then paths SHALL resolve to tool-specific global directories
      And environment overrides (for example `CODEX_HOME`) SHALL be respected where applicable

    Scenario: Windows global path resolution for Codex commands
      When effective scope is `global`
      And tool is Codex
      And platform is Windows
      Then command targets SHALL resolve to `%CODEX_HOME%\prompts` when `CODEX_HOME` is set
      And SHALL otherwise resolve to `%USERPROFILE%\.codex\prompts`
