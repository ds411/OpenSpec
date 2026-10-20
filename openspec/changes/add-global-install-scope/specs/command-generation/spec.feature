Feature: command-generation

  @modified @REQ-0139
  Rule: ToolCommandAdapter interface
    The system SHALL provide install-context-aware command path resolution.

    Scenario: Adapter interface structure
      When implementing a tool adapter
      Then command file path resolution SHALL receive install context (including effective scope and environment context)
      And SHALL return the effective command output path for that context

    Scenario: Codex global path remains supported
      When resolving Codex command paths in global scope
      Then the adapter SHALL target `$CODEX_HOME/prompts` when `CODEX_HOME` is set
      And SHALL otherwise target `~/.codex/prompts`

  @modified @REQ-0140
  Rule: Command generator function
    The command generator SHALL pass install context into adapter path resolution for all generated commands.

    Scenario: Scoped command generation
      When generating commands for a tool with a resolved effective scope
      Then generated command paths SHALL match that effective scope
      And the formatted command body/frontmatter behavior SHALL remain tool-specific and unchanged
