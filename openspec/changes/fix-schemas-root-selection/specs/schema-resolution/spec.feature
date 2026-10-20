Feature: schema-resolution

  @added @REQ-0321
  Rule: Schemas command SHALL honor authoritative root selection
    `openspec schemas` SHALL resolve the authoritative OpenSpec root with the same precedence and diagnostics as other root-scoped commands, then list schemas using that root. The command SHALL accept `--store <id>` for explicit registered-store selection. Successful human output and successful `--json` output SHALL retain their existing formats.

    Scenario: Nearest project root supplies schemas
      Given the current directory is inside an OpenSpec root containing a project-local schema
      When the user runs `openspec schemas --json`
      Then the result SHALL include that root's project-local schema

    Scenario: Explicit store overrides the current project
      Given the current project and a registered store contain different project-local schemas
      When the user runs `openspec schemas --json --store <id>`
      Then the result SHALL include schemas from the selected store root
      And it SHALL NOT include schemas that exist only in the current project

    Scenario: Local store pointer supplies schemas
      Given the nearest `openspec/config.yaml` is a config-only root declaring `store: <id>`
      When the user runs `openspec schemas --json` without an explicit store flag
      Then the result SHALL include schemas from the declared store root

    Scenario: Global default store supplies schemas
      Given no nearer OpenSpec root or pointer exists
      And global configuration declares `defaultStore: <id>`
      When the user runs `openspec schemas --json`
      Then the result SHALL include schemas from the default store root

    Scenario: Explicit store preserves root-selection precedence
      Given a nearest project root, a global default store, and an explicitly selected registered store all exist
      When the user runs `openspec schemas --json --store <id>`
      Then the explicitly selected store SHALL supply the project-local schemas

    Scenario: Nearest root precedes the global default
      Given a nearest project root and a global default store contain different schemas
      When the user runs `openspec schemas --json` without `--store`
      Then the nearest project root SHALL supply the project-local schemas

    Scenario: Rootless listing remains available without registered stores
      Given no OpenSpec root, pointer, global default, or registered store exists
      When the user runs `openspec schemas --json`
      Then the command SHALL list user and package schemas using the current directory as its implicit root, as before

    Scenario: Registered stores require an authoritative selection
      Given no OpenSpec root, pointer, or global default exists
      And one or more stores are registered
      When the user runs `openspec schemas --json` without `--store`
      Then the command SHALL fail with the standard root-selection diagnostic that asks the user to select a registered store
      And it SHALL NOT silently list schemas from the current directory

    Scenario: Invalid or unavailable store fails closed
      When explicit, declared, or global-default store resolution fails
      Then `openspec schemas` SHALL report the existing root-selection diagnostic and exit non-zero
      And it SHALL NOT fall back to schemas from the current directory

    Scenario: Removed store-path option is rejected deliberately
      When the user runs `openspec schemas --store-path <path>`
      Then the command SHALL reject the removed option with the standard instruction to register the store and use `--store <id>`

    Scenario: Success output remains compatible
      When root resolution succeeds
      Then human output SHALL retain the existing schema listing and source labels
      And `--json` output SHALL remain the existing top-level array of schema information

    Scenario: Store path works across supported platforms
      Given the selected store root uses a valid platform-native path, including a path containing spaces
      When the user runs `openspec schemas --json --store <id>`
      Then the command SHALL list schemas from that store without requiring the user or an Agent to compose a shell `cd` command
