Feature: Trace commands
  The `openspec trace` commands check the link between requirements and code in
  both directions. Code names a requirement with a `@trace` comment, and every
  requirement in the main specs should have at least one such comment.

  @REQ-0361
  Rule: Trace comment syntax
    The scanner SHALL read the word `@trace` followed by one or more requirement IDs, split by commas or spaces, anywhere on a line and in any comment style.

    Scenario: Comment styles of different languages
      Given a project with the lines "// @trace REQ-0001", "# @trace REQ-0002", "-- @trace REQ-0003", "/* @trace REQ-0004 */" and "<!-- @trace REQ-0005 -->" in its code
      When `openspec trace check` runs
      Then each of the five IDs counts as traced

    Scenario: More than one ID in one trace
      Given a line "# @trace REQ-0001, REQ-0002" in the code
      When the scanner reads the line
      Then the line traces to both REQ-0001 and REQ-0002

    Scenario: Text that is not a trace
      Given a line "@trace <ID>" or "the @trace comments" in a template or in prose
      When the scanner reads the line
      Then the line is not a trace
      And no error and no warning is reported for it

  @REQ-0362
  Rule: Files that the scanner reads
    The scanner SHALL read the files that git tracks and the new files that `.gitignore` does not exclude, and SHALL skip the `openspec/` folder, binary files and files larger than 10 MB.

    Scenario: Ignored files in a git work tree
      Given a git work tree with a file that `.gitignore` excludes
      When `openspec trace check` runs
      Then the trace check does not read that file
      And it reads tracked files and new files that are not ignored

    Scenario: A project outside git
      Given a project folder that is not in a git work tree
      When `openspec trace check` runs
      Then the scanner reads every file in the folder
      And it skips the `node_modules`, `.git`, `dist` and `build` folders

    Scenario: The openspec folder
      Given a spec file under `openspec/` that contains the text "@trace REQ-0001"
      When `openspec trace check` runs
      Then that text is not a trace

  @REQ-0363
  Rule: Trace scope in the project config
    The scanner SHALL apply the optional `trace.include` and `trace.exclude` glob lists in `openspec/config.yaml`, matched against paths relative to the project root.

    Scenario: Include and exclude globs
      Given `trace.include` is "src/**" and `trace.exclude` is "**/*.test.ts"
      When `openspec trace check` runs
      Then the scanner reads `src/list.ts`
      And it does not read `src/list.test.ts` or `docs/guide.md`

    Scenario: A bad glob list
      Given `trace.include` is a string instead of a list
      When `openspec trace check` runs
      Then the command prints a warning about `trace.include`
      And it still applies a valid `trace.exclude` list

  @REQ-0364
  Rule: Trace check
    `openspec trace check` SHALL report each main-spec requirement that has no trace and each trace to an ID that no requirement has, and SHALL exit with code 1 when it finds either.

    Scenario: Every requirement traced and every trace known
      Given every requirement in `openspec/specs/` has a trace
      And every trace names a requirement
      When `openspec trace check` runs
      Then the command reports that the trace check passed
      And it exits with code 0

    Scenario: A requirement with no trace
      Given requirement REQ-0002 in `openspec/specs/cli-list/spec.feature` has no trace
      When `openspec trace check` runs
      Then the command lists REQ-0002 with its capability, name, file and line
      And it exits with code 1

    Scenario: A trace to an ID that does not exist
      Given `src/list.ts` line 3 has "// @trace REQ-0099"
      And no spec and no active change has REQ-0099
      When `openspec trace check` runs
      Then the command lists REQ-0099 at `src/list.ts:3`
      And it exits with code 1

    Scenario: One check only
      When `openspec trace check --untraced` runs
      Then the command reports only the requirements with no trace
      When `openspec trace check --orphans` runs
      Then the command reports only the traces to IDs that do not exist

  @REQ-0365
  Rule: Special cases in the trace check
    The trace check SHALL leave out requirements tagged `@notrace`, SHALL treat requirements that an active change adds as pending, and SHALL give a warning, not an error, for a trace to a requirement that an active change removes.

    Scenario: A requirement tagged notrace
      Given a requirement with the tag `@notrace` and no trace
      When `openspec trace check` runs
      Then the requirement is not reported as untraced

    Scenario: A requirement that a change in progress adds
      Given an active change adds requirement REQ-0042 with the tag `@added`
      And the code has "// @trace REQ-0042"
      When `openspec trace check` runs
      Then the trace is not an orphan
      And the command lists REQ-0042 as pending and traced

    Scenario: A requirement that a change in progress removes
      Given an active change removes requirement REQ-0005 with the tag `@removed`
      And the code has "// @trace REQ-0005"
      When `openspec trace check` runs
      Then the command gives a warning for the trace
      And REQ-0005 is not reported as untraced
      And the exit code does not change because of it

    Scenario: A rule with no ID
      Given a rule in a main spec has no requirement ID
      When `openspec trace check` runs
      Then the command gives a warning that tells the user to run `openspec ids assign`

  @REQ-0366
  Rule: Trace show
    `openspec trace show <id>` SHALL list each file and line that traces to the requirement, with the requirement's name, capability and state.

    Scenario: Show a requirement with traces
      Given `src/a.ts` line 1 and `src/b.ts` line 3 trace to REQ-0001
      When `openspec trace show REQ-0001` runs
      Then the command shows the name and capability of REQ-0001
      And it lists `src/a.ts:1` and `src/b.ts:3`
      And it exits with code 0

    Scenario: Show an ID that no requirement has
      When `openspec trace show REQ-0099` runs
      Then the command says that REQ-0099 is not a requirement in the specs or in an active change
      And it lists the traces to REQ-0099
      And it exits with code 0

    Scenario: Text that is not an ID
      When `openspec trace show not-an-id` runs
      Then the command reports that the text is not a requirement ID
      And it exits with code 1

  @REQ-0367
  Rule: Trace report
    `openspec trace report` SHALL show the traced and total requirements for each capability, and SHALL exit with code 0.

    Scenario: Coverage for each capability
      Given capability cli-list has 2 traceable requirements and 1 of them is traced
      When `openspec trace report` runs
      Then the row for cli-list shows "1/2" and "50%"
      And the command exits with code 0

  @REQ-0368
  Rule: JSON output and paths
    Each trace command SHALL print a JSON document with `--json`, with file paths relative to the project root, written with forward slashes on every platform.

    Scenario: Paths on Windows
      Given the project runs on Windows
      When `openspec trace check --json` runs
      Then each file path in the output uses forward slashes, for example `src/list.ts`

    Scenario: Run from a subfolder
      Given the user is in the `src/` folder of the project
      When `openspec trace check --json` runs
      Then the command uses the nearest `openspec/` folder above
      And it scans the whole project, not only `src/`
