Feature: cli-validate

  @added @REQ-0327
  Rule: Validate SHALL resolve changes by directory existence, matching status
    `openspec validate` SHALL resolve whether a named item is a change using the same rule `openspec status` and `openspec instructions` use — directory existence within the resolved root — rather than requiring a `proposal.md` to be present. This SHALL apply to targeted validation (`openspec validate <name>`), bulk validation (`openspec validate --all` / `--changes`), and the interactive "pick one" selector shown when no item is given in a TTY — within both the repository root and a `--store`-selected root. A resolved change with a nested multi-area spec layout SHALL have its deltas discovered and validated. Spec/change ambiguity handling and `--type` overrides SHALL remain unchanged. The spec-resolution side (a spec is resolved by the presence of its `spec.md`) is correct today and SHALL be left unchanged.

    Scenario: Scaffolded change without proposal.md
      Given a change directory created by `openspec new change <name>` that has not yet had `proposal.md` written
      When executing `openspec validate <name>`
      Then validate resolves the change and validates it
      And it SHALL NOT print `Unknown item '<name>'`

    Scenario: Targeted-resolution parity with status
      Given any change that `openspec status --change <name>` resolves, including a change in a `--store`-selected root
      When executing `openspec validate <name>` (passing the same `--store` when applicable)
      Then validate SHALL resolve the same change that status resolved, and SHALL NOT report it as unknown

    Scenario: Bulk validation includes a sole proposal-less change
      Given a repository whose only active change lacks `proposal.md` and is listed by `openspec status`
      When executing `openspec validate --all` (or `--changes`)
      Then validate SHALL validate that change, and SHALL NOT print "No items found to validate"
      And the exit status SHALL reflect the change's validity

    Scenario: Interactive selector lists proposal-less changes
      Given a TTY and a change directory without `proposal.md` that `openspec status` lists
      When executing `openspec validate` with no item name
      Then the interactive "pick one" selector SHALL include that change

    Scenario: Resolved-but-invalid change exits non-zero
      Given a change that resolves by directory existence but fails validation
      When executing `openspec validate <name>` or `openspec validate --all`
      Then validate SHALL exit with a non-zero status
      And SHALL NOT exit 0 while reporting the change as having issues

    Scenario: Nested multi-area delta discovery
      Given a resolved change whose deltas live at `specs/<area>/<capability>/spec.md` (nested deeper than one directory)
      When validating that change
      Then validate SHALL discover and validate those delta specs
      And SHALL NOT report "No delta sections found" for a change that does contain deltas

    Scenario: Change/spec ambiguity is preserved
      Given a name that exists both as a change directory and as a spec
      When executing `openspec validate <name>`
      Then validate SHALL print the ambiguity error and respect `--type change` / `--type spec`, exactly as before

    Scenario: Changes with proposal.md are unaffected
      Given a change that already contains `proposal.md`
      When validating it targeted or in bulk
      Then resolution and validation behavior SHALL be byte-for-byte unchanged from today

  @added @REQ-0328
  Rule: SHALL/MUST body-keyword hint SHALL apply to main specs
    When a requirement places the normative keyword (SHALL or MUST) only in its `### Requirement:` header and omits it from the requirement body line, `openspec validate` SHALL emit the same targeted remediation guidance for main specs under `openspec/specs/**` as it already does for change delta specs, instead of the generic "must contain SHALL or MUST" message. The targeted message SHALL be emitted exactly once for such a requirement, the generic `REQUIREMENT_NO_SHALL` message SHALL no longer be emitted on the main-spec path, and the behavior SHALL be uniform across every main-spec validation surface (`openspec validate <spec>`, `--all`, JSON output, `openspec spec validate`, and rebuilt-spec validation via `validateSpecContent`). The main-spec message's actionable sentence SHALL be byte-identical to the change-delta message; only the leading prefix differs (main specs have no `ADDED`/`MODIFIED` action).

    Scenario: Main spec with the keyword in the header only
      Given a main spec requirement whose header contains SHALL or MUST but whose body line omits it
      When running `openspec validate` over that spec
      Then the error message SHALL contain the actionable sentence: "must contain SHALL or MUST in the requirement body, not only in the header. Move the SHALL/MUST statement to the line immediately after the \"### Requirement: ...\" header."
      And SHALL NOT be the generic "Requirement must contain SHALL or MUST keyword" message

    Scenario: Actionable-sentence parity with change deltas
      Given the identical header-only-keyword mistake authored once in a main spec and once in a change delta
      When validating each
      Then the actionable remediation sentence SHALL be byte-identical between the two (the change-delta `ADDED`/`MODIFIED` prefix is not required for the main-spec message)

    Scenario: Exactly one issue is emitted
      Given a main spec requirement with the keyword in the header only
      When validating it
      Then validate SHALL emit exactly one issue for the missing body keyword
      And SHALL NOT emit both the generic message and the targeted message for the same requirement

    Scenario: Requirement missing the keyword entirely still errors
      Given a main spec requirement that contains no SHALL or MUST in either the header or the body
      When running `openspec validate` over that spec
      Then validate SHALL report that the requirement must contain SHALL or MUST, as it does today

    Scenario: Keyword present in the body is not flagged
      Given a main spec requirement whose body line contains SHALL or MUST (whether or not the header also does)
      When running `openspec validate` over that spec
      Then validate SHALL NOT raise a missing-keyword error for that requirement

    Scenario: Lowercase keyword does not satisfy the body requirement
      Given a main spec requirement whose only "shall"/"must" is lowercase
      When running `openspec validate` over that spec
      Then validate SHALL report a missing-keyword error, matching the change-delta behavior for the same lowercase mistake

    Scenario: Header keyword with no body line emits the hint
      Given a main spec requirement whose header contains SHALL or MUST and that has no body line before its first scenario
      When running `openspec validate` over that spec
      Then validate SHALL emit the body-keyword hint (the keyword is only in the header)
      And this case, which is reported valid today, becomes a deliberate, additive validation improvement

    Scenario: Renamed requirements are not subject to the body-keyword hint
      Given a change delta `## RENAMED Requirements` whose TO header contains SHALL or MUST
      When validating that change
      Then validate SHALL NOT emit the body-keyword hint for the renamed pair
      And RENAMED validation behavior SHALL be byte-for-byte unchanged
