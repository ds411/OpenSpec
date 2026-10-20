Feature: cli-artifact-workflow

  @modified @REQ-0032
  Rule: Next Artifact Discovery
    The workflow SHALL use `openspec status` output to determine what can be created next, rather than a separate next-command surface.

    Scenario: Discover next artifacts from status output
      When a user needs to know which artifact to create next
      Then `openspec status --change <id>` identifies ready artifacts with `[ ]`
      And the first `[ ]` entry is the schema's recommended next artifact
      And no dedicated "next command" is required to continue the workflow

    Scenario: Status names the command that moves the change forward
      When a user runs `openspec status --change <id>` in text mode and a next step resolves
      Then the output ends with a `Next:` line naming exactly one command to run
      And that command is `openspec instructions <artifact> --change "<id>" --json` for the first ready artifact while any planning artifact is still ready
      And it is `openspec instructions apply --change "<id>" --json` once every planning artifact exists, printed after the completion line rather than in place of it, because that line alone reads as "you are done" while implementation tasks remain
      And the named artifact is never one the change skipped, which satisfies its dependents but must not be created
      And the artifact id comes from the resolved schema, so a project whose schema declares neither of the default artifact names still gets a usable command

    Scenario: The named command carries the store selection
      When the resolved root is a store
      Then the `Next:` command includes `--store <id>`, so it resolves against the same root the status was read from rather than the pointer repo

    Scenario: Both surfaces name the same command
      When a next step resolves
      Then the command printed on the `Next:` line and the command inside the JSON `nextSteps` sentence are derived from one resolution, so the two surfaces cannot name different commands
      And the `Next:` line never appears in `--json` output, which stays parseable

    Scenario: No next step resolves
      When no artifact is ready and planning is not complete, or a change in an `--all` sweep failed to load
      Then no `Next:` line is printed for it, rather than a guessed or shared command
