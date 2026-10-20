Feature: command-generation

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
      Then the adapter SHALL output YAML frontmatter with `name`, `description`, `allowed-tools`, `category`, `tags` fields
      And the `allowed-tools` field SHALL have the value `Bash(openspec:*)` so Claude Code runs `openspec` commands from the slash command without prompting for approval
      And file path SHALL follow pattern `.claude/commands/opsx/<id>.md`

    Scenario: Cursor adapter formatting
      When formatting a command for Cursor
      Then the adapter SHALL output YAML frontmatter with `name` as `/opsx-<id>`, `id`, `category`, `description` fields
      And file path SHALL follow pattern `.cursor/commands/opsx-<id>.md`

    Scenario: Windsurf adapter formatting
      When formatting a command for Windsurf
      Then the adapter SHALL output YAML frontmatter with `name`, `description`, `category`, `tags` fields
      And file path SHALL follow pattern `.windsurf/workflows/opsx-<id>.md`
