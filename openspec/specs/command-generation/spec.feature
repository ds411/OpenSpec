Feature: command-generation
  Define tool-agnostic command content and adapter contracts for generating tool-specific OpenSpec command files.

  @REQ-0138
  Rule: CommandContent interface
    The system SHALL define a tool-agnostic `CommandContent` interface for command data.

    Scenario: CommandContent structure
      When defining a command to generate
      Then `CommandContent` SHALL include:
        """
        - `id`: string identifier (e.g., 'explore', 'apply')
        - `name`: human-readable name (e.g., 'OpenSpec Explore')
        - `description`: brief description of command purpose
        - `category`: grouping category (e.g., 'OpenSpec')
        - `tags`: array of tag strings
        - `body`: the command instruction content
        """

  @REQ-0139
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

    Scenario: Trae adapter formatting
      When formatting a command for Trae
      Then the adapter SHALL output YAML frontmatter with `name` and `description` fields
      And file path SHALL follow pattern `.trae/commands/opsx-<id>.md`

  @REQ-0140
  Rule: Command generator function
    The system SHALL provide a `generateCommand` function that combines content with adapter.

    Scenario: Generate command file
      When calling `generateCommand(content, adapter)`
      Then it SHALL return an object with:
        """
        - `path`: the file path from `adapter.getFilePath(content.id)`
        - `fileContent`: the formatted content from `adapter.formatFile(content)`
        """

    Scenario: Command references match the name the tool registers
      When the adapter's file path names the command by filename (`opsx-<id>`)
      Then `generateCommand` SHALL rewrite `/opsx:<id>` references in the body to `/opsx-<id>` before formatting
      When the adapter's file path does not name the command by filename (for example it namespaces the command under an `opsx/` directory)
      Then the body's `/opsx:<id>` references SHALL be left unchanged

    Scenario: Command references use the tool's own invocation prefix
      When an adapter declares an `invocationPrefix` because its files are not invoked with a slash (Amazon Q loads `.amazonq/prompts/opsx-<id>.md` into a prompt library invoked with `@`)
      Then `generateCommand` SHALL rewrite `/opsx:<id>` references in the body to `<prefix>opsx-<id>` — for Amazon Q, `@opsx-<id>` — replacing the leading slash rather than adding to it
      And generated skills and the `init`/`update` "Getting started" hint SHALL use the same form
      When an adapter declares no `invocationPrefix`
      Then the prefix SHALL default to `/`

    Scenario: Generate multiple commands
      When generating all opsx commands for a tool
      Then the system SHALL iterate over command contents and generate each using the tool's adapter

  @REQ-0141
  Rule: CommandAdapterRegistry
    The system SHALL provide a registry for looking up tool adapters.

    Scenario: Get adapter by tool ID
      When calling `CommandAdapterRegistry.get('cursor')`
      Then it SHALL return the Cursor adapter or undefined if not registered

    Scenario: Get all adapters
      When calling `CommandAdapterRegistry.getAll()`
      Then it SHALL return array of all registered adapters

    Scenario: Adapter not found
      When looking up an adapter for unregistered tool
      Then `CommandAdapterRegistry.get()` SHALL return undefined
      And caller SHALL handle missing adapter appropriately

  @REQ-0142
  Rule: Shared command body content
    The body content of commands SHALL be shared across all tools.

    Scenario: Same instructions across tools
      When generating the 'explore' command for Claude and Cursor
      Then both SHALL use the same `body` content
      And only the frontmatter, the file path, and the spelling of `/opsx:*` command references SHALL differ
