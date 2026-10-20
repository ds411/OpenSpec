Feature: opsx-update-skill

  @added @REQ-0284
  Rule: Update Workflow Command
    The system SHALL provide a `/opsx:update` workflow skill that revises a change's existing planning artifacts in place. It SHALL NOT advance the build frontier (it does not create a not-yet-started artifact) and SHALL edit planning artifacts only, never implementation code.

    Scenario: Select the change to update
      When the user invokes `/opsx:update` without a change name
      Then the skill infers the change from conversation context if possible, or auto-selects the change when only one active change exists
      And if it is still ambiguous, it lists available changes (most-recently-modified first) via `openspec list --json` and asks the user to choose
      And it announces which change was selected and how to override

    Scenario: Revise without advancing the frontier
      When the user asks `/opsx:update` to revise an existing artifact
      Then the skill updates that artifact and reconciles the change's other existing artifacts with it
      And it does NOT create any artifact that does not yet exist (that remains the job of `/opsx:continue`/`/opsx:propose`)

    Scenario: Missing artifacts are deferred to continue
      When keeping the change coherent would require an artifact with no existing output files and status `ready` or `blocked`
      Then the skill revises only the artifacts that currently exist
      And it notes the not-yet-created artifacts and points the user to `/opsx:continue` to create them

    Scenario: Update stays within the plan
      When revising artifacts would imply changes to implementation code
      Then the skill updates the planning artifacts only
      And it directs the user to `/opsx:apply` to carry the revised plan into code, rather than editing code itself

  @added @REQ-0285
  Rule: Schema-Driven Artifact Resolution
    The `/opsx:update` skill SHALL learn which artifacts exist and where they live by reading the change's status from the CLI, and SHALL NOT rely on hardcoded artifact names or assumed path separators. This makes the skill correct for custom schemas and on every platform, not only the default `spec-driven` schema.

    Scenario: Reads the artifact set from status
      When the skill needs to know which artifacts a change has and where they are
      Then it runs `openspec status --change <id> --json` and uses the reported artifact ids, statuses, and the `artifactPaths` map (`existingOutputPaths` for the files to edit)
      And it does not assume the artifact ids or output paths

    Scenario: Does not branch on hardcoded artifact names
      When the skill decides which artifacts to read and revise
      Then its control flow uses the ids reported by the CLI
      And it does not branch on literal `proposal`/`specs`/`design`/`tasks` names

    Scenario: Works for a custom schema
      When the active change uses a custom schema whose artifact ids are not `proposal`/`specs`/`design`/`tasks`
      Then the skill uses the artifact ids and paths reported by the CLI
      And it works without any change to the skill

    Scenario: Resolve artifact paths cross-platform
      When the skill reads or revises an existing artifact file on macOS, Linux, or Windows
      Then it uses the `existingOutputPaths` provided by the CLI status output
      And it does not assume forward-slash separators

    Scenario: Edit the concrete files of a glob artifact
      When an artifact's declared output path is a glob (for example `specs/**/*.md`)
      Then the skill edits the concrete files reported in that artifact's `existingOutputPaths`
      And it does not write to `resolvedOutputPath`, which for a glob artifact remains the glob pattern rather than a real file

    Scenario: A missing companion file under a populated glob artifact
      When reconciliation identifies a missing companion file for a glob artifact with non-empty `existingOutputPaths`
      Then the skill MAY propose creating that file using the artifact's instructions, template, project context, rules, and current dependency files
      And it selects an unused concrete path matching the artifact's `outputPath` inside `changeRoot`, including after resolving linked parent directories
      And it creates the file only after user confirmation, refreshing status, instructions, and path checks immediately before creation
      And creation SHALL fail rather than overwrite a file that appeared in the meantime
      And it SHALL NOT start another artifact, write main specs, or edit implementation code

    Scenario: Required inputs are no longer available
      When a populated glob artifact remains `done` but a required non-skipped dependency is missing
      Then the skill SHALL stop new companion creation and ask the user to restore the dependency first

    Scenario: Schema delegates companion creation
      When the artifact instruction delegates creation to another skill or command
      Then the skill SHALL invoke it only if it can honor the confirmed concrete path and the update guardrails
      And otherwise it SHALL stop rather than invoke broader generation

    Scenario: Intentionally skipped artifact
      When status or instructions mark an artifact as skipped
      Then the skill SHALL leave it untouched and SHALL NOT treat its empty outputs as missing or send it to continue

  @added @REQ-0286
  Rule: Bidirectional Coherence Review
    The `/opsx:update` skill SHALL keep a change's existing planning artifacts coherent with one another after a revision, reviewing affected artifacts in any direction rather than assuming a fixed downstream flow.

    Scenario: Reconcile related artifacts after an edit
      When the user revises one artifact
      Then the skill reviews the change's other existing artifacts against the revision
      And it proposes follow-on edits to any artifact that is now inconsistent, whether that artifact is upstream or downstream of the edited one

    Scenario: Upstream artifact may be revised
      When an edit to a later artifact (for example design) contradicts an earlier one (for example the proposal)
      Then the skill may propose revising the earlier artifact to restore coherence
      And it does not treat propagation as downstream-only

    Scenario: Coherence review with no specific edit
      When the user invokes `/opsx:update` without a specific revision in mind ("make this change coherent")
      Then the skill reads the change's existing artifacts and reviews them against each other for contradictions, gaps, and duplication
      And it presents any findings for the user to confirm before editing

    Scenario: Coherent change yields no changes
      When the skill finds the change's artifacts already coherent
      Then it reports the change as coherent and makes no edits

  @added @REQ-0287
  Rule: Next-Step Guidance
    After applying confirmed revisions (or finding none needed), the `/opsx:update` skill SHALL report where the change stands and recommend the next command, without acting on the recommendation itself.

    Scenario: Updating an already-implemented change
      When the user updates a change whose implementation already happened (for example tasks are checked off or `/opsx:apply` was already run)
      Then the skill still revises planning artifacts only
      And it notes that the implementation may no longer match the revised plan and recommends `/opsx:apply` to carry the delta into code
      And it does not implement anything itself

    Scenario: Next step when artifacts are incomplete
      When the update finishes and the change still has artifacts with no outputs and status `ready` or `blocked`
      Then the skill recommends `/opsx:continue` to create them

    Scenario: Next step when the change is fully done
      When the update finishes and the change's artifacts are complete and already implemented
      Then the skill recommends `/opsx:archive`

  @added @REQ-0288
  Rule: User-Confirmed Incremental Application
    The `/opsx:update` skill SHALL propose each artifact revision and apply it only after user confirmation.

    Scenario: Confirm before writing
      When the skill has a proposed revision for an artifact
      Then it shows the user what it intends to change and why before writing
      And it writes only after the user confirms

    Scenario: Rejected revision is not written
      When the user rejects a proposed revision for an artifact
      Then the skill does not write that revision
      And the artifact is left unchanged

    Scenario: Intent change is redirected to a new change
      When the requested revision changes the intent of the change rather than refining it (per the "Update vs. Start Fresh" heuristic)
      Then the skill recommends starting a new change (`/opsx:new`) instead of mutating the existing proposal into different work
