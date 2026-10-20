Feature: cli-validate

  @added @REQ-0360
  Rule: Spec validation SHALL report a Purpose left as the archive placeholder
    The `validate` command SHALL report, as a warning against the spec's Purpose, a
    `## Purpose` that is still a placeholder rather than a Purpose someone wrote:
    the sentence `openspec archive` writes for a new capability, or a marker left in
    its place. The report SHALL name the line the placeholder is on when it can be
    located, and SHALL omit the line rather than point at the wrong text when it
    cannot.

    The remediation SHALL say to edit the main spec directly, because a `## Purpose`
    in a delta is read only when a capability is created and therefore cannot replace
    one that already exists.

    The finding SHALL be a warning. A project that already carries placeholders
    therefore keeps validating by default, and only `--strict` fails — the
    placeholder is worth keeping at the moment archive writes it, and worth reporting
    once it has outlived that moment.

    Detection SHALL be narrow, because a Purpose is prose and prose that raises an
    open question is not a placeholder:

    - the sentence archive itself writes SHALL be reported wherever it appears in the
      Purpose, since nobody writes it by accident;
    - otherwise only a `TBD` or `TODO` marker opening the Purpose SHALL be reported.
      The two words SHALL be read the same way, because which one got typed says
      nothing about whether the Purpose was written;
    - a marker appearing inside a sentence SHALL NOT be reported;
    - a longer word that merely begins with those letters SHALL NOT be reported,
      in any script.

    Text inside a fenced code block SHALL NOT be read as the Purpose speaking, for
    either rule. A Purpose that quotes the placeholder is documenting it rather than
    carrying it, and a check that fails the document explaining the placeholder
    teaches its readers to ignore the warning.

    An empty Purpose SHALL NOT be reported by this requirement, which the
    empty-Purpose error already covers. A Purpose reported as a placeholder SHALL NOT
    also be reported as too brief, so a bare `TBD` yields one finding and not two.

    Validation performed inside `openspec archive` SHALL be unaffected, because
    archive validates a rebuilt spec without `--strict` and a warning does not change
    that verdict: a spec archive writes SHALL still pass the validation it would have
    passed before this requirement existed.

    Scenario: The placeholder passes by default and fails under strict
      Given a main spec whose Purpose is the placeholder archive wrote
      When `openspec validate --specs` runs
      Then report a warning against the Purpose, naming the line it is on and
        """
        saying to edit the main spec directly
        """
      And the spec is reported valid

    Scenario: Strict validation fails on the placeholder
      Given the same main spec
      When `openspec validate --specs --strict` runs
      Then the spec is reported invalid

    Scenario: An authored Purpose raising an open question is not reported
      Given a Purpose reading "Bounds how often a failed delivery is retried. The exact budget is TBD pending load tests."
      When `openspec validate --specs --strict` runs
      Then report no placeholder warning, because the marker does not open the Purpose
      And the spec is reported valid

    Scenario: A Purpose left as a TODO is reported like a TBD
      Given a Purpose consisting only of "TODO"
      When `openspec validate --specs --strict` runs
      Then report the placeholder warning, the same finding a bare "TBD" reports

    Scenario: A Purpose quoting the placeholder inside a fence is not reported
      Given a Purpose that explains the placeholder and shows it inside a fenced
        """
        code block
        """
      When `openspec validate --specs --strict` runs
      Then report no placeholder warning
      And the spec is reported valid

    Scenario: A word beginning with the marker is not reported
      Given a Purpose opening "TBDs raised during design review are tracked in the linked issue.", or the same sentence opening with "TODOs"
      When `openspec validate --specs --strict` runs
      Then report no placeholder warning

    Scenario: A bare TBD is reported once
      Given a Purpose consisting only of "TBD"
      When `openspec validate --specs --strict` runs
      Then report exactly one finding against the Purpose, the placeholder warning
        """
        rather than the too-brief warning
        """

    Scenario: A terse but authored Purpose still reports as too brief
      Given a Purpose reading "Does stuff."
      When `openspec validate --specs --strict` runs
      Then report the too-brief warning and no placeholder warning

    Scenario: Archive still writes the spec it would have written
      Given a change whose delta introduces a capability with no usable `## Purpose`
      When `openspec archive` validates the rebuilt spec before writing it
      Then that spec is reported valid and archive completes exactly as before

    Scenario: Line endings do not change what is reported
      Given two main specs with the same placeholder Purpose, one saved with LF
        """
        line endings and one with CRLF
        """
      When `openspec validate --specs` runs on each
      Then both report the same warning against the same line number
