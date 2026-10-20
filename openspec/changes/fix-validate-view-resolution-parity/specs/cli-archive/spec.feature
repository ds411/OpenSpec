Feature: CLI Archive Command

  @added @REQ-0326
  Rule: Archive incomplete-task gate SHALL use the tracked-tasks artifact glob
    `openspec archive`'s incomplete-task gate — the check that prevents archiving a change whose tasks are not all complete — SHALL read task progress through the change's tracked-tasks artifact glob, the same file-resolution `openspec status` and `openspec view` use, rather than a fixed `changes/<name>/tasks.md` path. The tracked-tasks artifact SHALL be identified as the artifact whose `generates` equals the schema's `apply.tracks` value, falling back to the artifact with id `tasks` when no `apply` block is present; checkbox counts SHALL be aggregated across every file matched by that artifact's `generates` glob, scoped to the change directory. When the schema cannot be resolved or no tracked-tasks artifact is found, the gate SHALL fall back to a single top-level `tasks.md` exactly as today and SHALL NOT crash. This closes the data-safety gap where a change whose tasks live in nested/glob `tasks.md` files is read as having zero tasks, no incomplete work, and is allowed to archive while unfinished.

    Scenario: Glob-tasks change with unfinished work cannot archive
      Given a schema whose tasks artifact `generates` is `**/tasks.md`
      And a change with `backend/tasks.md` containing unchecked tasks and no top-level `tasks.md`
      When running `openspec archive` on that change
      Then the incomplete-task gate SHALL detect the unfinished tasks and block (or require explicit override of) the archive
      And SHALL NOT treat the change as having zero tasks

    Scenario: Archive gate resolves the same tracked files as view
      Given any change with a tracked-tasks glob
      When the `archive` incomplete-task gate and `openspec view` each compute task progress for that change
      Then they SHALL resolve the same set of `tasks.md` files and count the same checkboxes

    Scenario: Unresolvable schema falls back without error
      Given a change whose configured schema cannot be resolved
      When running `openspec archive` on that change
      Then the incomplete-task gate SHALL fall back to a single top-level `tasks.md`
      And SHALL NOT crash

    Scenario: Single top-level tasks file archiving is unchanged
      Given a change with a single top-level `changes/<name>/tasks.md`, or a project with no resolvable schema
      When running `openspec archive`
      Then the incomplete-task gate SHALL behave exactly as today
