Feature: ai-tool-paths

  @added @REQ-0332
  Rule: Codex skills path is the supported Codex integration path
    The system SHALL identify `.codex/skills/` as the supported Codex OpenSpec workflow path.

    Scenario: Codex skills path defined
      When looking up the `codex` tool
      Then the system SHALL provide `.codex` as the Codex skills base directory
      And generated Codex skills SHALL be written under `<projectRoot>/.codex/skills/`

    Scenario: Codex command path is not advertised as supported
      When displaying AI tool path documentation or command-generation metadata
      Then the system SHALL present Codex as a skills-only OpenSpec integration
      And it SHALL NOT advertise `$CODEX_HOME/prompts/opsx-<id>.md` as a generated Codex command path

  @added @REQ-0333
  Rule: Codex global prompt cleanup path resolution
    The system SHALL resolve the legacy Codex prompt cleanup directory using Codex home semantics.

    Scenario: CODEX_HOME is set
      When cleaning up previously managed Codex prompt files
      And `CODEX_HOME` is set
      Then the system SHALL inspect the `prompts` directory under the resolved `CODEX_HOME` path

    Scenario: CODEX_HOME is unset
      When cleaning up previously managed Codex prompt files
      And `CODEX_HOME` is not set
      Then the system SHALL inspect the `prompts` directory under the user's default `.codex` home

    Scenario: Cross-platform Codex prompt paths
      When resolving Codex skills or legacy prompt cleanup paths on Windows, macOS, or Linux
      Then the system SHALL construct paths with platform path utilities
      And it SHALL preserve correct path separators for the current operating system

  @added @REQ-0334
  Rule: Codex-managed legacy prompt cleanup patterns reflect the final managed surfaces
    The system SHALL identify managed Codex prompt cleanup targets using the final split patterns for global and repo-local artifacts.

    Scenario: Global legacy Codex prompts use an exact directory and filename allowlist
      When detecting managed legacy Codex prompt files in the resolved Codex prompt directory
      Then the system SHALL match only exact historical OpenSpec-owned filenames directly under that resolved directory
      And it SHALL infer the represented workflow IDs from those filenames
      And the allowlist SHALL include `opsx-update.md` mapped to the `update` workflow

    Scenario: Repo-local openspec compatibility prompt names
      When detecting legacy Codex prompt files in the project tree
      Then the system SHALL match repo-local files named `.codex/prompts/openspec-*.md`

    Scenario: Other Codex prompts are unmanaged
      When a Codex prompt file does not match the managed pattern for its scope
      Then cleanup SHALL leave that file unchanged
