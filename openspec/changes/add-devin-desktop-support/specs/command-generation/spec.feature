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
      Then the adapter SHALL output YAML frontmatter with `name`, `description`, `category`, `tags` fields
      And file path SHALL follow pattern `.claude/commands/opsx/<id>.md`

    Scenario: Cursor adapter formatting
      When formatting a command for Cursor
      Then the adapter SHALL output YAML frontmatter with `name` as `/opsx-<id>`, `id`, `category`, `description` fields
      And file path SHALL follow pattern `.cursor/commands/opsx-<id>.md`

    Scenario: Windsurf adapter formatting
      Given RETIRED — Windsurf was rebranded to Devin Desktop and its config directory moved
      When looking for a Windsurf adapter
      Then none SHALL be registered — it is replaced by the Devin adapter below, not kept alongside a second adapter for the same product

    Scenario: Devin Desktop adapter formatting
      When formatting a command for Devin Desktop
      Then the adapter SHALL output YAML frontmatter with `name`, `description`, `category`, `tags` fields
      And file path SHALL follow pattern `.devin/workflows/opsx-<id>.md`

    Scenario: Trae adapter formatting
      When formatting a command for Trae
      Then the adapter SHALL output YAML frontmatter with `name` and `description` fields
      And file path SHALL follow pattern `.trae/commands/opsx-<id>.md`
