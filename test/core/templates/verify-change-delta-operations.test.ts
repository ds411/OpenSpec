import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  getVerifyChangeSkillTemplate,
  getOpsxVerifyCommandTemplate,
} from '../../../src/core/templates/skill-templates.js';

// #1959: verify treated every requirement in a change's delta specs as
// behavior that must exist, whatever its operation. A removed requirement that
// was removed correctly came back as CRITICAL "Requirement not found" with the
// recommendation to implement it, so an agent following the report restored
// what the change had just deleted.
const bodies: Array<[string, string]> = [
  ['skill', getVerifyChangeSkillTemplate().instructions],
  ['command', getOpsxVerifyCommandTemplate().content],
  // The committed skills.sh mirror is what `npx skills add` installs.
  [
    'committed skill file',
    readFileSync(new URL('../../../skills/openspec-verify-change/SKILL.md', import.meta.url), 'utf8'),
  ],
];

function section(body: string, start: string, end: string, label: string): string {
  const from = body.indexOf(start);
  const to = body.indexOf(end, from + start.length);
  expect(from, `${label}: "${start}" not found`).toBeGreaterThanOrEqual(0);
  expect(to, `${label}: "${end}" not found after "${start}"`).toBeGreaterThan(from);
  return body.slice(from, to);
}

describe('verify checks each requirement by its delta operation', () => {
  it.each(bodies)('%s: classifies requirements by operation tag before checking them', (label, body) => {
    const coverage = section(body, '**Spec Coverage**', '6. **Verify Correctness**', label);

    expect(coverage, label).toContain('each `Rule:` with its requirement ID tag');
    for (const tag of ['`@added`', '`@modified`', '`@removed`']) {
      expect(coverage, label).toContain(tag);
    }
    expect(coverage, label).toContain('The operation tag decides what the check looks for.');
    // The unscoped loop is what produced the bug.
    expect(coverage, label).not.toMatch(/^\s*- For each requirement:$/m);
    // Markdown delta sections are gone.
    expect(coverage, label).not.toContain('## RENAMED Requirements');
  });

  it.each(bodies)('%s: reports a missing requirement only for @added or @modified', (label, body) => {
    const coverage = section(body, '**Spec Coverage**', '6. **Verify Correctness**', label);
    const addedOrModified = section(coverage, '- For each `@added` or `@modified` requirement', '- For each `@removed` requirement', label);

    expect(addedOrModified, label).toContain('Add CRITICAL issue: "Requirement not found: <ID> <requirement name>"');
    expect(addedOrModified, label).toContain('`@trace` comments that name the requirement\'s ID');
  });

  // A rename is a @modified rule with a new name, checked against the delta
  // text like any other @modified rule.
  it.each(bodies)('%s: checks a rename as a @modified rule', (label, body) => {
    const coverage = section(body, '**Spec Coverage**', '6. **Verify Correctness**', label);

    expect(coverage, label).toContain('A `@modified` rule whose name differs from the main spec\'s is a rename');
    expect(coverage, label).toContain('do not require code symbols, identifiers, or file names to be renamed');
    expect(body, label).not.toContain('Renamed requirement not found');
  });

  it.each(bodies)('%s: inverts the check for a @removed requirement', (label, body) => {
    const removed = section(body, '- For each `@removed` requirement', '6. **Verify Correctness**', label);

    expect(removed, label).toContain('Finding no implementation is the expected result, but only once the baseline behavior was the thing you searched for.');
    expect(removed, label).toContain('Never report a `@removed` requirement as "Requirement not found"');
    expect(removed, label).toContain('Add CRITICAL issue: "Removed requirement still implemented: <requirement name>"');
    expect(removed, label).not.toContain('Recommendation: "Implement');
  });

  it.each(bodies)('%s: reports a trace left on a removed requirement', (label, body) => {
    const removed = section(body, '- For each `@removed` requirement', '6. **Verify Correctness**', label);

    expect(removed, label).toContain('Add WARNING: "Trace to removed requirement: <ID> at <file>:<line>"');
  });

  it.each(bodies)('%s: maps implementation and scenarios only for @added or @modified requirements', (label, body) => {
    const correctness = section(body, '6. **Verify Correctness**', '7. **Verify Coherence**', label);

    expect(correctness, label).toContain('- For each `@added` or `@modified` requirement from delta specs');
    expect(correctness, label).toContain('- For each scenario under an `@added` or `@modified` requirement in delta specs');
    expect(correctness, label).toContain('skip a scenario the delta tags `@removed`');
    expect(correctness, label).toContain('Skip scenarios under a `@removed` requirement');
    expect(correctness, label).toContain('Add SUGGESTION: "Untraced requirement: <ID>"');
    expect(correctness, label).not.toContain('- For each requirement from delta specs:');
    expect(correctness, label).not.toContain('- For each scenario in delta specs');
  });

  // With #1732's "Not verified" rule, a change with nothing to add or modify
  // left both correctness checks empty, which read as unverified and withheld
  // readiness. That is the exact case #1959 reports.
  it.each(bodies)('%s: treats the correctness checks of a removal-only change as not applicable', (label, body) => {
    const correctness = section(body, '6. **Verify Correctness**', '**Requirement Implementation Mapping**:', label);

    expect(correctness, label).toContain('If the delta specs are readable and contain at least one `@removed` rule but no `@added` or `@modified` rules');
    // An empty or unparseable delta must not pass as a removal-only change.
    expect(correctness, label).toContain('A delta spec with no parseable requirements at all is unusable evidence, not a removal-only change: mark these checks as not verified.');
    expect(correctness, label).toContain('report **Requirement Implementation Mapping** and **Scenario Coverage** as **Not applicable**');
    expect(correctness, label).toContain('do not mark these two checks as not verified');
    expect(body, label).toContain('The correctness checks of a change whose readable delta specs contain `@removed` rules but no `@added` or `@modified` rules are also **Not applicable** (see step 6).');
  });

  it.each(bodies)('%s: does not treat artifacts or replacement code as the removed behavior', (label, body) => {
    const removed = section(body, '- For each `@removed` requirement', '6. **Verify Correctness**', label);

    expect(removed, label).toContain('Matches in `openspec/` artifacts or docs, or in code that serves only the migration note or an `@added` requirement, are not evidence by themselves.');
    expect(removed, label).toContain('Report any code path that still delivers the removed behavior, including one shared with an `@added` requirement.');
  });

  // #2067: the removal branch said only "search codebase for the removed
  // behavior". A removal carries just the requirement name plus reason and
  // migration notes, so the search started from the name alone - and because
  // an absent match is the passing result here, an implementation written in
  // different vocabulary read as a clean removal.
  it.each(bodies)('%s: reads the removed requirement baseline before searching', (label, body) => {
    const removed = section(body, '- For each `@removed` requirement', '6. **Verify Correctness**', label);

    expect(removed, label).toContain("A `@removed` rule carries only the requirement's ID and name and any reason and migration notes");
    expect(removed, label).toContain('`<planningHome.root>/openspec/specs/<capability-path>/spec.feature`');
    expect(removed, label).toContain('Its statement and scenarios are the evidence for the behavior that must be gone');
    expect(removed, label).toContain('never search from the requirement name alone');
    // Requirements are matched by ID, so a renamed baseline is still found.
    expect(removed, label).toContain('Match it by its requirement ID, never by its name.');
  });

  // The baseline read, the history fallback and the search have to stay in
  // that order. Each index is checked present first: an unguarded indexOf
  // returns -1, and -1 is less than everything, so a reworded sentence would
  // satisfy a bare ordering comparison and silently retire this guard.
  it.each(bodies)('%s: orders the baseline read, then the fallback, then the search', (label, body) => {
    const removed = section(body, '- For each `@removed` requirement', '6. **Verify Correctness**', label);

    const baselineAt = removed.indexOf('Before searching, read the baseline requirement');
    const fallbackAt = removed.indexOf("recover the baseline from the same file's history");
    const bailOutAt = removed.indexOf('mark **Spec Coverage** as not verified for that entry');
    const searchAt = removed.indexOf('Search codebase for that behavior');

    expect(baselineAt, `${label}: baseline-read sentence missing`).toBeGreaterThanOrEqual(0);
    expect(fallbackAt, `${label}: history fallback missing`).toBeGreaterThanOrEqual(0);
    expect(bailOutAt, `${label}: not-verified bail-out missing`).toBeGreaterThanOrEqual(0);
    expect(searchAt, `${label}: search step missing`).toBeGreaterThanOrEqual(0);

    // The main spec is the primary source; history is only its fallback.
    expect(baselineAt, `${label}: fallback must follow the primary read`).toBeLessThan(fallbackAt);
    // Bailing out must be reachable before the search, not two bullets after
    // the rule that says finding nothing is expected.
    expect(bailOutAt, `${label}: bail-out must precede the search`).toBeLessThan(searchAt);
  });

  // The git example is the one piece of the fallback an agent runs verbatim.
  // `git log` treats an unmatched pathspec as success and prints nothing, so a
  // path missing the `openspec/specs/` prefix reads as "no baseline in
  // history" and sends every post-sync removal to the not-verified branch.
  it.each(bodies)('%s: gives a runnable, store-aware history command', (label, body) => {
    const removed = section(body, '- For each `@removed` requirement', '6. **Verify Correctness**', label);

    expect(removed, label).toContain('git -C "<planningHome.root>" log -p -- openspec/specs/<capability-path>/spec.feature');
    // `rev:path` resolves from the repository root, not from `-C`; the `./`
    // keeps it relative to a planning root that is a subdirectory (monorepo).
    expect(removed, label).toContain('git -C "<planningHome.root>" show <commit>^:./openspec/specs/<capability-path>/spec.feature');
    expect(removed, label).not.toMatch(/show <commit>\^:openspec\//);
    // An unquoted planning root splits on spaces and runs git in the wrong place.
    expect(removed, label).not.toMatch(/git -C <planningHome\.root>/);
    expect(removed, label).toContain('Empty output means the pathspec matched nothing');
    // A bare `<capability-path>/spec.feature` pathspec matches nothing: the
    // placeholder is defined relative to `specs/`.
    expect(removed, label).not.toMatch(/git[^`\n]*log[^`\n]*--\s+<capability-path>/);
    // History must be read from the planning home, which may be a store repo
    // rather than the current checkout (#1702).
    expect(removed, label).not.toMatch(/\bgit log -p -- openspec/);
  });

  it.each(bodies)('%s: never counts an unsearched removal as passing', (label, body) => {
    const removed = section(body, '- For each `@removed` requirement', '6. **Verify Correctness**', label);

    expect(removed, label).toContain('mark **Spec Coverage** as not verified for that entry with the reason and stop there');
    expect(removed, label).toContain('do not search, and never count an unsearched removal as passing');
    // A baseline that only restates its title gives no more vocabulary than
    // the name did, which is the #2067 failure mode in miniature.
    expect(removed, label).toContain('A baseline that adds nothing to its own title');
    expect(removed, label).toContain('is unusable evidence, the same as a missing one');
    // Reworded re-introductions must fail too, not just the exact old
    // sentence: the bug was searching from the name, however it is phrased.
    expect(removed, label).not.toMatch(/Search\b[^.\n]*\bfor the removed behavior/i);
    expect(removed, label).not.toMatch(/Finding no implementation is the expected result[.;]/);
  });

  // Step 6 asserts that Spec Coverage carries the evidence for a removal-only
  // change. That claim has to leave room for the entry the branch above marks
  // not verified, or it reads as licence to drop the mark.
  it.each(bodies)('%s: does not claim a baseline check that may not have happened', (label, body) => {
    expect(body, label).toContain('each `@removed` entry with a usable baseline is checked there against its baseline behavior');
    expect(body, label).toContain('an entry already marked not verified there stays not verified');
    // The scorecard must model the not-verified wording, not only the
    // confirming kind.
    expect(body, label).toContain('"1 removal not verified (baseline unavailable)"');
  });

  it.each(bodies)('%s: counts removals separately from covered requirements', (label, body) => {
    expect(body, label).toContain('Count only `@added` and `@modified` requirements in N, and report `@removed` requirements separately');
    expect(body, label).toContain('the Correctness cell reads `Not applicable (no @added or @modified requirements)`');
  });
});
