Feature: CLI Init

  @modified @REQ-0091
  Rule: Skill Generation
    The command SHALL generate Agent Skills for selected AI tools.

    Scenario: Generating skills for a tool
      When a tool is selected during initialization
      Then create 9 skill directories under `.<tool>/skills/`:
        """
        - `openspec-explore/SKILL.md`
        - `openspec-new-change/SKILL.md`
        - `openspec-continue-change/SKILL.md`
        - `openspec-apply-change/SKILL.md`
        - `openspec-ff-change/SKILL.md`
        - `openspec-verify-change/SKILL.md`
        - `openspec-sync-specs/SKILL.md`
        - `openspec-archive-change/SKILL.md`
        - `openspec-bulk-archive-change/SKILL.md`
        """
      And each SKILL.md SHALL contain YAML frontmatter with name and description
      And each SKILL.md SHALL contain the skill instructions

    Scenario: Devin skills reference skills rather than workflows
      Given the Devin Local agent does not support workflows and its documentation directs users to skills instead
      When generating skills for the `devin` tool
      Then rewrite `/opsx:<id>` references in the skill body to the matching `/openspec-<skill>` invocation, which both Devin agents accept
      And the getting-started hint SHALL name `/openspec-propose` rather than a workflow
      And under commands-only delivery, where no Devin skills are written, both the workflow bodies and the hint SHALL fall back to `/opsx-<id>`

  @modified @REQ-0092
  Rule: Slash Command Generation
    The command SHALL generate opsx slash commands only for selected tools that have a registered command adapter, while keeping adapterless tools valid for skill generation.

    Scenario: Generating slash commands for a tool with a registered adapter
      When a tool with a registered command adapter is selected during initialization
      Then create 9 slash command files using the tool's command adapter:
        """
        - `/opsx:explore`
        - `/opsx:new`
        - `/opsx:continue`
        - `/opsx:apply`
        - `/opsx:ff`
        - `/opsx:verify`
        - `/opsx:sync`
        - `/opsx:archive`
        - `/opsx:bulk-archive`
        """
      And use tool-specific path conventions (e.g., `.claude/commands/opsx/` for Claude)
      And include tool-specific frontmatter format

    Scenario: Selected tool has no command adapter
      Given a selected tool has `skillsDir` configured but no registered command adapter
      When initialization includes command generation
      Then skill generation for that tool SHALL still remain valid
      And command-file generation SHALL be skipped for that tool
      And the command output SHALL include `Commands skipped for: <tool-id> (no adapter)`

    Scenario: Kimi Code skips command-file generation
      When the user selects Kimi Code during initialization
      Then OpenSpec SHALL treat it as a supported tool with `skillsDir: '.kimi-code'`
      And command-file generation SHALL be skipped because no Kimi adapter is registered

    Scenario: Generating workflows for Devin Desktop
      When the user selects Devin Desktop during initialization
      Then create one workflow file per profile workflow at `.devin/workflows/opsx-<id>.md`
      And include frontmatter with `name`, `description`, `category`, and `tags`
      And rewrite `/opsx:<id>` references in the body to `/opsx-<id>`, the name Devin registers for a workflow file
