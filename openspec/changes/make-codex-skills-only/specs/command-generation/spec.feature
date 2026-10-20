Feature: command-generation

  @added @REQ-0341
  Rule: Codex is not a command generation target
    The command-generation system SHALL exclude Codex from active command adapter lookup and generation.

    Scenario: Codex adapter lookup
      When callers request a command adapter for `codex`
      Then the registry SHALL return no command adapter
      And command-file generation callers SHALL treat Codex the same as other skills-only tools

    Scenario: Generating commands for all registered adapters
      When callers enumerate registered command adapters
      Then the returned adapter list SHALL NOT include Codex
      And no generated command path SHALL point to a Codex global prompt directory

    Scenario: Codex command adapter module is not exported
      When callers import supported command adapters through the command-generation adapter index
      Then Codex SHALL NOT be exported as a supported command adapter

  @added @REQ-0342
  Rule: Skills-only command skip behavior remains valid for Codex
    The system SHALL skip Codex command-file generation while still allowing Codex skill generation.

    Scenario: Command generation requested for selected Codex tool
      When a selected tool is Codex
      And command generation would otherwise be included by delivery mode
      Then the command generation step SHALL skip Codex command files
      And the Codex skill generation step SHALL remain valid

  @modified @REQ-0139
  Rule: ToolCommandAdapter interface
    The system SHALL define a `ToolCommandAdapter` interface for per-tool formatting.

    Scenario: Adapter interface structure
      When implementing a tool adapter
      Then `ToolCommandAdapter` SHALL require:
        """
        - `toolId`: string identifier matching `AIToolOption.value`
        - `getFilePath(commandId: string)`: returns file path for command relative from project root unless a supported scoped install resolver provides an absolute target for that adapter
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
