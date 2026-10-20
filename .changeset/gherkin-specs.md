---
'@fission-ai/openspec': minor
---

### New Features

- **Gherkin specs** — Specs are now Gherkin feature files (`spec.feature`). The `Feature:` is the capability and its description is the Purpose; each requirement is a `Rule:` with its scenarios inside it.
- **Requirement IDs** — Every requirement carries a stable ID tag such as `@REQ-0001`, numbered from one project counter in `openspec/requirement-ids.yaml`. IDs never change on a rename and are never reused.
- **Deltas by ID** — Delta rules are tagged `@added`, `@modified` or `@removed` and archive matches them to the main spec by ID. A `@modified` rule with a new name renames the requirement, and a `@removed` scenario tag inside a `@modified` rule drops that scenario on purpose.
- **`openspec ids assign` and `openspec ids next`** — Give an ID to every new requirement that has none, or take free IDs from the counter for a tool that writes the tags itself.
- **`openspec convert-specs`** — Convert markdown specs (`spec.md`) in the main specs and in active changes to Gherkin, with IDs. Archived changes stay as they are.

### Breaking Changes

- Markdown specs (`spec.md`) and markdown deltas (`## ADDED Requirements` and so on) are no longer read. `openspec list --specs`, `openspec validate` and `openspec archive` name them and point to `openspec convert-specs`; archive refuses a change whose capability still has a markdown main spec.
- Requirement JSON from `openspec show` gains an `id` field. A delta's `operation` values stay `ADDED`, `MODIFIED` and `REMOVED`; `RENAMED` is no longer produced, because a rename is a `@modified` rule.
