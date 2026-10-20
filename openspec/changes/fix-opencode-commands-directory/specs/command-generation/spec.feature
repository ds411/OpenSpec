Feature: command-generation

  @added @REQ-0320
  Rule: Legacy cleanup for renamed OpenCode command directory
    The legacy cleanup module SHALL detect and remove old OpenCode command files from the previous singular `.opencode/command/` directory path.

    Scenario: Detect old singular-path OpenCode command files
      When running legacy artifact detection on a project with files matching `.opencode/command/opsx-*.md` or `.opencode/command/openspec-*.md`
      Then the system SHALL include those files in the legacy slash command files list via `LEGACY_SLASH_COMMAND_PATHS`
      And `LegacySlashCommandPattern.pattern` SHALL accept `string | string[]` to support multiple glob patterns per tool

    Scenario: Clean up old OpenCode command files on init
      When a user runs `openspec init` in a project with old `.opencode/command/` artifacts
      Then the system SHALL remove the old files
      And generate new command files at `.opencode/commands/`

    Scenario: Auto-cleanup legacy artifacts in non-interactive mode
      When a user runs `openspec init` in non-interactive mode (e.g., CI) and legacy artifacts are detected
      Then the system SHALL auto-cleanup legacy artifacts without requiring `--force`
      And legacy slash command files (100% OpenSpec-managed) SHALL be removed
      And config file cleanup SHALL only remove OpenSpec markers (never delete user files)

  @modified @REQ-0139
  Rule: ToolCommandAdapter interface
    The system SHALL define a `ToolCommandAdapter` interface for per-tool formatting.

    Scenario: Adapter interface structure
      When implementing a tool adapter
      Then `ToolCommandAdapter` SHALL require:
        """
        - `toolId`: string identifier matching `AIToolOption.value`
        - `getFilePath(commandId: string)`: returns file path for command (relative from project root, or absolute for global-scoped tools like Codex)
        - `formatFile(content: CommandContent)`: returns complete file content with frontmatter
        """

    Scenario: Claude adapter formatting
      When formatting a command for Claude Code
      Then the adapter SHALL output YAML frontmatter with `name`, `description`, `category`, `tags` fields
      And file path SHALL follow pattern `.claude/commands/opsx/<id>.md`

    Scenario: Cursor adapter formatting
      When formatting a command for Cursor
      Then the adapter SHALL output YAML frontmatter with `name` as `/opsx-<id>`, `id`, `category`, `description` fields
      And file path SHALL follow pattern `.cursor/commands/opsx-<id>.md`

    Scenario: Windsurf adapter formatting
      When formatting a command for Windsurf
      Then the adapter SHALL output YAML frontmatter with `name`, `description`, `category`, `tags` fields
      And file path SHALL follow pattern `.windsurf/workflows/opsx-<id>.md`

    Scenario: OpenCode adapter formatting
      When formatting a command for OpenCode
      Then the adapter SHALL output YAML frontmatter with `description` field
      And file path SHALL follow pattern `.opencode/commands/opsx-<id>.md` using `path.join('.opencode', 'commands', ...)` for cross-platform compatibility
      And the adapter SHALL transform colon-based command references (`/opsx:name`) to hyphen-based (`/opsx-name`) in the body
