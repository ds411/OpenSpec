Feature: Update Command

  @added @REQ-0314
  Rule: Oh My Pi tool supported in update
    The `openspec update` command SHALL refresh Oh My Pi skill files and command files when Oh My Pi is configured, using Oh My Pi's hyphen-based command reference convention.

    Scenario: Updating Oh My Pi skill files
      When `openspec update` runs and Oh My Pi is a configured tool
      Then skill files in `.omp/skills/openspec-<id>/SKILL.md` are refreshed with the latest templates
      And skill file bodies use hyphen-based `/opsx-<id>` command references

    Scenario: Updating Oh My Pi command files
      When `openspec update` runs and Oh My Pi is a configured tool
      Then command files are written to `.omp/commands/opsx-<id>.md` for each workflow in the active profile, creating them if they do not yet exist and overwriting them if they do
