Feature: ai-tool-paths

  @added @REQ-0261
  Rule: Migrating OpenSpec content out of a renamed tool's former directory
    When a tool's directory is renamed, OpenSpec-managed content left in the former
    location SHALL be moved to the current one. Content the user wrote SHALL never
    be moved or deleted.

    Some renames are safe to apply silently and some are not, so each former root
    declares whether leaving it needs the user's consent. Kimi CLI is gone, so
    `.kimi` can be vacated without asking. Windsurf's `.windsurf` cannot: a
    pre-rebrand Windsurf build reads only that directory, and nothing on disk
    distinguishes that user from one who took the rebrand.

    Scenario: Moving a former directory that needs no consent
      When `openspec init` or `openspec update` runs and OpenSpec-managed content is found under a former root marked as needing no consent, such as `.kimi`
      Then move it to the tool's current directory without prompting
      And report what moved

    Scenario: Offering a move that needs consent
      Given OpenSpec skills or command files under `.windsurf/`
      When `openspec update` runs interactively without `--force`
      Then explain that Windsurf is now Devin Desktop, that `.devin/` is the current directory, and that Devin Local does not read `.windsurf/` at all
      And ask before moving anything
      And on decline, leave every file untouched and state that `.windsurf/` will no longer be refreshed until it is moved

    Scenario: Unattended runs take the move
      When `openspec update` runs with `--force`, or non-interactively
      Then perform the move without prompting, reporting what moved

    Scenario: Selecting a renamed tool is consent
      When `openspec init` configures a tool that has OpenSpec content under a former root
      Then move that content as part of setup, rather than leaving the user with two installs of one tool

    Scenario: Both directories already hold OpenSpec content
      Given the same OpenSpec-managed skill or command exists under both the former and the current root
      When the move runs
      Then the copy under the current root SHALL win, rather than being merged or overwritten
      And only the file OpenSpec generated SHALL be removed from the former root — for a skill directory that is `SKILL.md` alone, never the directory and whatever else it holds
      And one rule SHALL govern skills and command files alike: the former copy SHALL be removed only when it is byte-identical to the surviving one
      And a former copy that differs SHALL be left where it is, since the difference may be a customization
      And files left behind for that reason SHALL be reported, so the user knows two copies now exist

    Scenario: Every former file differs, so nothing is movable
      Given every OpenSpec-managed file under the former root differs from its counterpart under the current one
      When the move runs
      Then report the files left in place, rather than staying silent because nothing moved
      And NOT offer to move anything, since there is nothing movable to consent to
      And NOT report a migration that did not happen

    Scenario: One root is a symbolic link to the other
      Given the former and current roots resolve to the same directory, as when a user symlinks one at the other to straddle the rename
      When the move runs
      Then recognize that source and destination are the same file and change nothing, rather than deleting the only copy

    Scenario: User files survive the move
      Given a former root also holds files the user wrote, such as a hand-written workflow beside the generated ones
      When the move runs
      Then move only the files OpenSpec generates — each skill's `SKILL.md` and command files named `opsx-*`
      And delete the former directory only when the move leaves it empty

    Scenario: A user file beside a generated skill is not carried into a directory OpenSpec prunes
      Given a former skill directory holds `SKILL.md` alongside a file the user wrote
      And OpenSpec removes whole skill directories it owns, as under commands-only delivery or for a workflow outside the active profile
      When the move runs
      Then move `SKILL.md` alone and leave the user's file under the former root
      And never move the enclosing directory, which would hand that file to a later removal

    Scenario: The move is idempotent
      When `openspec update` runs again after a completed move
      Then find nothing to migrate and report nothing

  @modified @REQ-0002
  Rule: Path configuration for supported tools
    The `AI_TOOLS` array SHALL include `skillsDir` for tools that support the Agent Skills specification.

    Scenario: Claude Code paths defined
      When looking up the `claude` tool
      Then `skillsDir` SHALL be `.claude`

    Scenario: Cursor paths defined
      When looking up the `cursor` tool
      Then `skillsDir` SHALL be `.cursor`

    Scenario: Windsurf paths defined
      Given RETIRED — Windsurf was rebranded to Devin Desktop and `windsurf` is no longer a tool id
      When looking up the `windsurf` tool
      Then no `AI_TOOLS` entry SHALL exist for it
      And the id SHALL resolve to `devin`, whose `skillsDir` is `.devin` and whose `detectionPaths` still include the legacy `.windsurf`

    Scenario: Kimi Code paths defined
      When looking up the `kimi` tool
      Then `skillsDir` SHALL be `.kimi-code`
      And OpenSpec-managed skills remaining under the legacy `.kimi/skills` directory SHALL be migrated to `.kimi-code/skills` during init and update, preserving user files

    Scenario: Hermes Agent paths defined
      When looking up the `hermes` tool
      Then `skillsDir` SHALL be `.hermes`
      And `setupNote` SHALL explain that project `.hermes/skills` must be added to `skills.external_dirs` in `~/.hermes/config.yaml`
      And `openspec init` and `openspec update` SHALL display the note whenever `hermes` is configured

    Scenario: Devin Desktop paths defined
      When looking up the `devin` tool
      Then `skillsDir` SHALL be `.devin`
      And workflow files SHALL be written to `.devin/workflows/opsx-<id>.md`
      And `detectionPaths` SHALL include both `.devin` and the legacy `.windsurf`, so a project set up before the rebrand is still recognized

    Scenario: Retired tool ids resolve on the command line
      When a retired brand is named on the command line, such as `--tools windsurf`
      Then it SHALL resolve to the current tool id `devin` rather than erroring as unknown
      And generation SHALL write the current directory `.devin/`, not the retired one

    Scenario: Tools without skillsDir
      When a tool has no `skillsDir` defined
      Then skill generation SHALL error with message indicating the tool is not supported
