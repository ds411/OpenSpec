Feature: opsx-scan-command
  Define `/opsx:scan`, the agent command in which a lead agent and a team of helper agents write Gherkin requirements and `@trace` comments for the code of a repository with full, partial or no OpenSpec coverage.

  @REQ-0369
  Rule: Agent command files
    The system SHALL write each agent command as a command file, never as a skill, for every configured tool that has a command adapter, whatever the profile and delivery settings are.

    Scenario: Delivery is skills
      Given the global delivery setting is `skills`
      When `openspec init --tools claude` runs
      Then `.claude/commands/opsx/scan.md` exists
      And it is the only file in `.claude/commands/opsx/`

    Scenario: Custom profile without the scan command
      Given a custom profile with only the `explore` workflow
      When `openspec init --tools cursor` runs
      Then `.cursor/commands/` holds `opsx-explore.md` and `opsx-scan.md`

    Scenario: No skill and no subagent definition
      When `openspec init --tools claude` runs
      Then no skill directory for the scan command exists under `.claude/skills/`
      And `.claude/agents/` does not exist

    Scenario: Delivery changes to skills
      Given a project that `openspec init --tools claude` set up with delivery `both`
      When the delivery setting changes to `skills` and `openspec update` runs
      Then the workflow command files are removed
      And `.claude/commands/opsx/scan.md` stays

  @REQ-0370
  Rule: Skills-only tools
    The system SHALL not write agent command files for a tool that has no command adapter, and init and update SHALL print a note that names each such tool.

    Scenario: Codex is selected
      When `openspec init --tools claude,codex` runs
      Then the output contains "Agent command 'scan' not written for: Codex. This tool supports only skills."

    Scenario: Every tool has command files
      When `openspec init --tools claude` runs
      Then the output does not contain "Agent command 'scan' not written"

  @REQ-0371
  Rule: Model invocation in Claude Code
    The Claude Code command file of an agent command SHALL set `disable-model-invocation: true`, so that its description stays out of the model context until the user runs it.

    Scenario: Scan command frontmatter
      When the Claude Code adapter formats the scan command
      Then the YAML frontmatter has `disable-model-invocation: true`

    Scenario: Workflow command frontmatter
      When the Claude Code adapter formats a workflow command such as `propose`
      Then the frontmatter does not have `disable-model-invocation`

  @REQ-0372
  Rule: Agent command refresh
    `openspec update` SHALL rewrite an agent command file that is missing or that differs from the generated content, also without `--force`.

    Scenario: Missing scan command file
      Given a configured Claude Code project without `.claude/commands/opsx/scan.md`
      When `openspec update` runs
      Then `.claude/commands/opsx/scan.md` has the generated content

    Scenario: Changed scan command file
      Given `.claude/commands/opsx/scan.md` has local edits
      When `openspec update` runs
      Then the file has the generated content again

    Scenario: Line endings only
      Given `.claude/commands/opsx/scan.md` differs from the generated content only by a byte order mark and CRLF line endings
      When the update checks for drift
      Then it reports no drift

  @REQ-0373
  Rule: Scan phases
    The scan command SHALL tell a lead agent to run five phases in order: a survey, a spec wave, an ID step, a trace wave and a verify step.

    Scenario: Survey reads the coverage
      When the lead agent runs the survey
      Then it runs `openspec list --specs --json`, `openspec trace report --json` and `openspec trace check --json`
      And it marks each area of the code as full, partial or no coverage
      And it asks the user to confirm the plan unless `--yes` is given

    Scenario: Helpers work in parallel
      When the lead agent starts a spec wave or a trace wave
      Then it starts one helper agent for each area that is not full, at most 8 at a time
      And an agent that cannot start subagents does the work of each helper in sequence

    Scenario: Only the lead assigns IDs
      When every helper of the spec wave has reported
      Then the lead agent runs `openspec ids assign` one time
      And helpers write new rules without ID tags

    Scenario: Verify step
      When the trace wave is complete
      Then the lead agent runs `openspec validate --specs --strict` and `openspec trace check --json`
      And it fixes the gaps in the scan scope or lists them in a summary

  @REQ-0374
  Rule: Scan output
    The scan command SHALL write new requirements to the main specs by default, and to a change when the user gives `--as-change <name>`.

    Scenario: Main specs
      When the user runs the scan command without `--as-change`
      Then new rules go to `openspec/specs/<capability>/spec.feature`

    Scenario: Change for review
      When the user runs the scan command with `--as-change <name>`
      Then new rules go to `openspec/changes/<name>/specs/<capability>/spec.feature` with the tag `@added`
      And the lead agent runs `openspec ids assign "<name>" --json`

  @REQ-0375
  Rule: Placeholder trace examples
    The scan command text SHALL show the trace syntax only with placeholders, so that the trace scanner finds no trace in a generated scan command file.

    Scenario: Generated file in a user repository
      Given a repository with a generated scan command file that git tracks
      When `openspec trace check --json` runs
      Then it reports no trace and no orphan from that file

  @REQ-0376
  Rule: Stores
    The scan command SHALL tell the lead agent to stop when the specs are in a store, because the trace commands read the specs from the nearest `openspec/` folder.

    Scenario: Root from a store
      Given `openspec list --specs --json` reports a `root.source` other than `nearest`
      When the lead agent runs the survey
      Then it stops and tells the user that the scan does not support stores
