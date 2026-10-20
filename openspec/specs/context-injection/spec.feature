Feature: context-injection
  Define how project context from `openspec/config.yaml` is injected into workflow instructions while preserving source text and formatting.

  @REQ-0149
  Rule: Inject context into all artifact instructions
    The system SHALL inject the context field from project config into instructions for all artifacts, wrapped in XML-style `<context>` tags.

    Scenario: Config has context field
      When config contains `context: "Tech stack: TypeScript, React"`
      Then instruction output includes `<context>\nTech stack: TypeScript, React\n</context>`

    Scenario: Config has no context field
      When config omits the context field or context is undefined
      Then instruction output does not include `<context>` tags

    Scenario: Context is multi-line string
      When config contains context with multiple lines
      Then instruction output preserves line breaks within `<context>` tags

    Scenario: Context applied to all artifacts
      When instructions are loaded for any artifact (proposal, specs, design, tasks)
      Then context section appears in all instruction outputs

  @REQ-0150
  Rule: Format context with XML-style tags
    The system SHALL wrap context content in `<context>` opening and `</context>` closing tags with content on separate lines.

    Scenario: Context tag structure
      When context is injected into instructions
      Then format is exactly `<context>\n{content}\n</context>\n\n`

    Scenario: Context appears before template
      When instructions are generated with context
      Then `<context>` section appears before the `<template>` section

  @REQ-0151
  Rule: Preserve context content exactly as provided
    The system SHALL inject context content without modification, escaping, or interpretation.

    Scenario: Context contains special characters
      When context includes characters like `<`, `>`, `&`, quotes
      Then characters are preserved exactly as written in the config

    Scenario: Context contains URLs
      When context includes URLs like "docs at https://example.com"
      Then URLs are preserved exactly in the injected content

    Scenario: Context contains Markdown
      When context includes Markdown formatting like `**bold**` or `[links](url)`
      Then Markdown is preserved without rendering or escaping
