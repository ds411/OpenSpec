# Writing Good Specs

You rarely write a spec from a blank page. You describe a change in plain language, `/opsx:propose` drafts the requirements and scenarios, and then you make them good. This page is about that last part — what "good" looks like, and how to steer the AI toward it.

It's the companion to [Reviewing a Change](reviewing-changes.md): reviewing is catching the weak spots in a draft, writing is knowing what a strong one is made of.

## A spec is behavior, not code

A spec says what your system *does*, in terms anyone could check — not how it's built. It's made of **requirements** (statements of behavior) and **scenarios** (concrete examples that prove them).

```gherkin
@REQ-0007
Rule: Session Timeout
  The system SHALL expire a session after 30 minutes of inactivity.

  Scenario: Idle timeout
    Given an authenticated session
    When 30 minutes pass with no activity
    Then the session is invalidated and the user must re-authenticate
```

Specs are Gherkin feature files (`spec.feature`). Each requirement is a `Rule:` with a stable ID tag such as `@REQ-0007`, the text under the rule is the requirement statement, and its scenarios sit inside the rule. The ID never changes, even when the requirement is renamed, so code and tests can point at it. See [Requirement IDs](#requirement-ids) below.

Keep the *how* — the queue, the library, the table schema — in `design.md` or the code. When behavior and implementation get mixed into one requirement, the requirement stops being testable and starts going stale the moment the code changes.

## What makes a good requirement

A good requirement is one behavior, stated so plainly you could hand it to someone else to test.

- **One statement, one `SHALL`/`MUST`.** If a requirement has three "and also" clauses, it's really three requirements. Split them.
- **Observable.** Someone outside the code should be able to tell whether it holds. "The system SHALL show an error banner when the upload exceeds 10 MB" is observable. "The system SHALL handle large uploads gracefully" is not.
- **The right strength.** OpenSpec uses the RFC 2119 keywords, and they mean different things:

  | Keyword | Meaning |
  |---------|---------|
  | `MUST` / `SHALL` | A hard requirement. Non-negotiable. |
  | `SHOULD` | A strong recommendation, with room for a justified exception. |
  | `MAY` | Genuinely optional. |

  Reach for `MUST`/`SHALL` by default. Use `SHOULD` only when you truly mean "unless there's a good reason not to."

The test for a requirement: *could a tester who's never seen the code tell whether it passed?* If not, it needs sharpening.

## What makes a good scenario

Scenarios are where a requirement earns its keep. Each one is a concrete `Given` / `When` / `Then` that could become an automated test.

- **It exercises its requirement.** A scenario that just restates the requirement in other words tests nothing. Make it a specific situation with a specific outcome.
- **Cover the cases that matter, not just the happy path.** The valid login is easy. The empty input, the expired token, the second click, the thing that goes wrong — those are where bugs live, and where a scenario is worth the most.
- **Name the case in the title.** "Scenario: Rejects an expired token" tells a reviewer what's covered at a glance; "Scenario: Test 2" doesn't.

A useful habit: before approving, ask *what's the one case I'd be upset to see broken?* — and make sure a scenario names it.

## Pick the right kind of delta

A change describes its edits to the specs with a delta file, `openspec/changes/<name>/specs/<capability>/spec.feature`. Each rule in it carries one of three tags, next to the requirement's ID. Using the right one keeps your archived specs honest:

- **`@added`** — brand-new behavior that didn't exist before. Give it a new ID.
- **`@modified`** — behavior that already existed and is changing. Use the ID of the requirement in the current spec, and include the full new version: the statement and every scenario you keep. A short note on what changed helps a reviewer.
- **`@removed`** — behavior going away. Use the ID of the requirement in the current spec, and add a line on why.

```gherkin
Feature: User Auth

  @added @REQ-0012
  Rule: Two-factor login
    The system SHALL ask for a one-time code after the password when 2FA is on.

    Scenario: Code requested
      Given a user with 2FA enabled
      When they enter a correct password
      Then the system asks for a one-time code

  @modified @REQ-0007
  Rule: Session Timeout
    The system SHALL expire a session after 15 minutes of inactivity.

    Scenario: Idle timeout
      Given an authenticated session
      When 15 minutes pass with no activity
      Then the session is invalidated and the user must re-authenticate

  @removed @REQ-0003
  Rule: Remember me
    Removed because sessions no longer outlive the browser.
```

Archive matches rules by ID, not by name. On archive, `@added` rules are appended to the main spec, a `@modified` rule replaces the rule with the same ID, and a `@removed` rule is dropped from it. To rename a requirement, use `@modified` with the same ID and the new name. A `@modified` rule must keep every scenario of the current version; to drop one on purpose, keep the scenario in the delta and tag it `@removed`. A `@removed` rule needs only its ID and name — anything under it is ignored.

Remove the last requirement a capability has and you retire it: rather than leave a spec with nothing in it, archive deletes `openspec/specs/<capability>/spec.feature`. Because that is the one archive step that removes a file, it has to be asked for — add `retire_capabilities: true` to the change's `.openspec.yaml`, alongside the `schema:` that file already needs. Without it the archive aborts and tells you so. Retirement deletes the whole file, so it is also refused while the spec holds anything outside its `Feature:` line, its description, and its rules — a `Background:`, a scenario outside a rule, a comment. The abort names those lines; move them into the description or a rule, or delete the spec by hand. For a spec in the caller's checkout, the archive output also names the `git checkout` that restores a committed file; selected stores receive checkout-scoped recovery guidance instead. If you mark a real change as `@added`, archive refuses it because the ID is already in the spec; if you describe new behavior as `@modified`, there's nothing to replace. When in doubt, open the current spec and see whether the requirement is already there.

One more thing is worth knowing about. When your delta creates a capability that doesn't exist yet, put a sentence or two on what the capability is for under its `Feature:` line. That text is the Purpose: archive uses it as the description of the main spec it creates; skip it and you get a `TBD` placeholder to fill in by hand. An existing spec already has a Purpose, so a delta's is ignored there — edit `openspec/specs/<capability-path>/spec.feature` directly to change one. Here, `<capability-path>` is the directory relative to `specs/`, such as `user-auth` in a flat project or `identity/user-auth` in a project organized by domain.

## Requirement IDs

Every requirement has an ID such as `REQ-0007`, written as a tag on the line above its `Rule:`. IDs are numbered from one counter for the whole project, `openspec/requirement-ids.yaml`, so they never collide across capabilities and are never reused, even after a requirement is removed.

You rarely pick an ID by hand:

- `openspec ids assign` gives a new ID to every rule that has none — main-spec rules and `@added` delta rules — in the main specs and in active changes, and moves the counter. Run it after you or the AI add rules without IDs. Pass a change name to limit it to that change, or `--dry-run` to see the IDs first. It never invents an ID for a `@modified` or `@removed` rule: those must copy the ID of the requirement they change, so it reports them instead.
- `openspec ids next --count 3` takes the next three IDs from the counter without writing them anywhere, for a tool or a person that writes the tags itself.

Validation fails when a rule has no ID or two rules in one spec share an ID, so a forgotten ID shows up before archive.

Coming from markdown specs? `openspec convert-specs` turns every `spec.md` under `openspec/specs/` and in active changes into `spec.feature`, gives each requirement an ID, and deletes the markdown files (pass `--keep` to keep them, or `--dry-run` to see the plan). Archived changes stay as they are.

## Right-size the change

The single most common authoring mistake isn't a badly worded requirement — it's a change that's trying to be three changes.

**A good change has one intent you can say in a sentence.** "Add a dark-mode toggle." "Rate-limit the login endpoint." "Migrate sessions off cookies." If describing the change needs a lot of "and also," that's the signal to split it.

Signs a change is too big:

- The proposal's scope reads like a list of unrelated features.
- Reviewing it would take an afternoon, so nobody will.
- Two people couldn't work on it without colliding.
- Half the tasks could ship on their own.

Smaller changes are easier to review, easier to build in one focused session, and easier to reason about six months later when the archive is all that's left. You can always run several changes in parallel — see [Editing & iterating](editing-changes.md) and [Workflows](workflows.md).

The opposite also happens: a one-line typo fix doesn't need three requirements and a design doc. Match the ceremony to the stakes.

## How to steer the AI toward a good draft

Because `/opsx:propose` does the first draft, the quality of what you get back tracks the quality of what you give it. You don't have to write requirements by hand — you have to aim the AI well:

- **State the intent and the boundary.** *"Add a dark-mode toggle that follows the OS setting on first load — don't touch the existing theme API."* The out-of-scope half matters as much as the in-scope half.
- **Name the cases you care about.** *"Make sure there's a scenario for a user who already picked a theme manually."* The AI covers what you point at.
- **Then edit.** It's a plain-text Gherkin file. Tighten a vague `SHALL`, delete a scenario that tests nothing, add the case it missed — or ask the AI to: *"the timeout requirement is vague, pin it to 30 minutes."*

Draft, sharpen, repeat. A few rounds of that produces a spec you'd trust, which is the whole point.

## A quick checklist

- [ ] Each requirement is one observable behavior with a `SHALL`/`MUST`.
- [ ] No implementation details are baked into the requirements.
- [ ] Every requirement has at least one scenario that actually exercises it.
- [ ] The important edge and error cases have scenarios, not just the happy path.
- [ ] Every requirement has an ID (`openspec ids assign` fills in the missing ones).
- [ ] Deltas use `@added` / `@modified` / `@removed` correctly against the current spec, with the IDs it uses.
- [ ] The whole change has one intent you can state in a sentence.

## Where to go next

- [Reviewing a Change](reviewing-changes.md) — the two-minute pass that catches what slipped through.
- [Concepts](concepts.md) — the deeper model behind specs, changes, and deltas.
- [Examples & Recipes](examples.md) — real changes from start to finish.
