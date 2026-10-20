/**
 * Scan agent command.
 *
 * `/opsx:scan` is a command file only, never a skill: a skill's description
 * sits in the agent context in every session, and this workflow is large and
 * rarely run. The command text defines the agent roles itself, so no subagent
 * definition files (whose descriptions would also load) are written either.
 */
import type { CommandTemplate } from '../types.js';
import { PROJECT_ROOT_GUARD } from './project-root.js';

/** Most helper agents a wave starts at the same time. */
export const SCAN_MAX_PARALLEL_HELPERS = 8;

const AGENT_RULES = `**Rules for every agent**

- Describe only the behavior that the code has now. Do not write requirements for planned work, TODO comments, or behavior that you guess.
- In source files, only add \`@trace\` comments. Do not change code, formatting, imports or line endings.
- Do not change or remove an existing requirement ID tag (for example \`@REQ-0001\`), and do not write a new ID tag yourself. New rules get their IDs from \`openspec ids assign\` in phase 3.
- Do not edit archived changes or other active changes.
- Do not commit, stash, reset or check out files. The user reviews the result as a git diff.
- Skip \`openspec/\`, generated files, vendored code, build output, lock files and binary files.`;

const SPEC_FORMAT = `**Spec format**

Each capability has one Gherkin feature file. The \`Feature:\` is the capability, the text under it is its Purpose, and each \`Rule:\` is one requirement:

\`\`\`gherkin
Feature: <Capability name>
  <Purpose: one to three sentences, 50 characters or more, on what the capability does for its users.>

  Rule: <Requirement name>
    The system SHALL <one behavior that a user or a caller can see>.

    Scenario: <Scenario name>
      Given <a start state>
      When <an action>
      Then <a result that a test can check>
\`\`\`

- The text under \`Rule:\` is the requirement statement. It uses SHALL or MUST.
- Each rule has at least one \`Scenario:\` (or \`Scenario Outline:\` with \`Examples:\`). Each scenario has a \`Then\` step. Scenarios are only inside rules.
- A requirement is behavior that a user, a caller or another system can see: an input, an output, an error, a file, a message or a stored value. Do not name private functions or classes.
- Put one behavior in each rule. Put the variants of that behavior in its scenarios.
- A capability name is kebab-case and can be nested (\`billing/invoices\`). Name it after what it does, not after a folder.
- A rule that no code can implement (for example a process rule) gets the tag \`@notrace\` on the line above \`Rule:\`. A scan seldom needs this tag.

Main specs are at \`openspec/specs/<capability>/spec.feature\`. With \`--as-change <name>\`, write to \`openspec/changes/<name>/specs/<capability>/spec.feature\` instead, and put the tag \`@added\` on the line above each new \`Rule:\`. The change file holds only the new rules. For a new capability, the text under \`Feature:\` becomes its Purpose.`;

// @trace REQ-0373, REQ-0374, REQ-0375, REQ-0376
export function getOpsxScanCommandTemplate(): CommandTemplate {
  return {
    name: 'OPSX: Scan',
    description: 'Scan the repository with a team of agents and write Gherkin requirements and @trace comments for its code',
    category: 'Workflow',
    tags: ['workflow', 'specs', 'traceability', 'agents'],
    disableModelInvocation: true,
    content: `Scan the repository with a team of agents. Write Gherkin requirements for the behavior that the code has now, and add \`@trace\` comments that connect the code to those requirements. The repository can have full, partial or no OpenSpec coverage: the scan keeps what exists and fills the gaps.

${PROJECT_ROOT_GUARD}

**Stores:** The scan works only on a repository that holds its own specs, because \`openspec trace\` reads the specs from the nearest \`openspec/\` folder. In phase 1, read \`root.source\` from \`openspec list --specs --json\`. If it is not \`nearest\`, the specs are in a store (a standalone OpenSpec repo registered on this machine): stop and tell the user that the scan does not support stores.

**Input**: Optional arguments after the command name:
- One or more paths (for example \`src/billing packages/api\`): scan only these folders or files. With no path, scan the whole repository.
- \`--as-change <name>\`: write the new requirements as a change in \`openspec/changes/<name>/\` for review, not into the main specs in \`openspec/specs/\`.
- \`--yes\`: do not stop for confirmation after the survey.

**The team**

- **Lead agent**: you. You do the survey, make the plan, run every \`openspec ids\` command and run the final checks. Only you change \`openspec/requirement-ids.yaml\`, so two agents cannot take the same ID.
- **Helper agents**: one helper for each area of the plan, in two waves: first specs, then traces. Start all helpers of a wave at the same time, in one message, with the subagent tool of your agent (for example the Agent or Task tool in Claude Code). Start at most ${SCAN_MAX_PARALLEL_HELPERS} helpers at a time; with more areas, run the wave in batches. Wait for every helper of a wave to report before you start the next phase.
- If your agent cannot start subagents, do the work of each helper yourself, one area at a time, with the same brief and the same rules.
- Helpers do not see this command. Give each helper its full brief in the prompt, with a copy of the sections "Rules for every agent" and "Spec format". Do not create agent definition files such as \`.claude/agents/*.md\`.

${AGENT_RULES}

${SPEC_FORMAT}

**Phase 1: Survey (lead)**

1. Run \`git status --porcelain\`. If it shows changes, tell the user that the scan's edits will mix with their uncommitted changes in the diff, and ask whether to continue.

2. Read the current state. If the CLI does not know \`openspec ids\` or \`openspec trace\`, it is older than this command: stop and ask the user to update OpenSpec and run \`openspec update\`.
   - \`openspec list --specs --json\`: the capabilities and the number of requirements in each.
   - \`openspec trace report --json\`: traced and untraced requirements for each capability.
   - \`openspec trace check --json\`: \`untraced\` requirements, \`orphans\` (traces to IDs that do not exist), \`warnings\`, and \`pending\` requirements of active changes. It exits with 1 when it finds a problem; read the JSON. A \`requirement_without_id\` warning means that an earlier scan stopped before phase 3: keep those rules, because phase 3 gives them IDs.
   - \`git grep -n -E "@trace[:[:space:]]+REQ-[0-9]{4,}"\`: the code lines that have traces now. Outside a git repository, use \`grep -rnE\` and skip \`node_modules\`, \`.git\`, \`dist\` and \`build\`.
   - \`grep -rnE "@REQ-[0-9]{4,}" openspec/specs\`: the spec file of each existing ID.
   - \`git ls-files\` (only the input paths, if there are any): the files to scan. If \`openspec/config.yaml\` has \`trace.include\` or \`trace.exclude\` globs, apply them. For a large repository, count the files in each folder first.

3. Divide the code into areas. An area is a group of source files with one purpose that one helper can read in full: usually a top-level module, a package of a monorepo, or a source folder. Keep an area to about 40 files or 6,000 lines: split a larger module and merge small folders. Put tests in the same area as the code that they test. Use the file list and the file sizes, not the file contents: the helpers read the code.

4. Give each area its capabilities. Use the existing capabilities where the code fits them: the traces show which files belong to which capability. Name new capabilities for the rest. Each capability has exactly one owner area, so two helpers never write the same spec file. If two areas implement one capability, give it to one of them; the other helper reports its rules for that capability to you.

5. Mark the coverage of each area:
   - **full**: the capabilities of the area have requirements, no requirement is untraced, there are no orphan traces, and each source file with behavior has a trace.
   - **partial**: some requirements or traces exist, but there are untraced requirements, orphan traces, or source files with behavior and no trace.
   - **none**: no requirement and no trace relates to the area.

6. Show the plan to the user as a table: area, paths, number of files, coverage, capabilities (existing or new) and the helper work. Full areas get no helpers. Then ask the user to confirm or change the plan. With \`--yes\`, do not wait.

7. With \`--as-change <name>\`: if the change does not exist, run \`openspec new change "<name>"\`. Write its \`proposal.md\`: why (record the behavior that the code has now) and what changes (the capabilities that the scan adds or extends).

**Phase 2: Spec wave (one helper for each area, in parallel)**

Start one helper for each area that is not full. Brief:

\`\`\`text
You are a spec helper in an OpenSpec scan.
Area: <name>
Files: <paths>
Your spec files (only you write them): <capability: path, new or existing>
Mode: <main specs | change "<name>">
<copy of "Rules for every agent" and "Spec format">

1. Read every file of the area, also its tests. Tests show the intended behavior.
2. Read your spec files in full, and the rule names in the other spec files under openspec/specs/.
3. For each behavior of the area that no rule describes, write a new rule in the correct one of your spec files.
4. Do not repeat a requirement that exists in any spec file. Do not change existing rules. If an existing rule does not agree with the code, do not fix it: report it.
5. Write new rules without an ID tag.
6. If a behavior belongs to a capability of another area, do not write it: report it with the full rule text.
7. Report: the spec files that you wrote, with the names of the new rules in each; existing rules that do not agree with the code (ID, and what the code does); rules for capabilities of other areas (capability and rule text); your questions.
\`\`\`

**Phase 3: ID step (lead only)**

1. Write the rules that helpers reported for capabilities of other areas into the correct spec files. Do not repeat a rule that exists.
2. Run the ID command one time, after every helper of the spec wave has reported:
   - Main specs: \`openspec ids assign openspec/specs --json\`
   - With \`--as-change <name>\`: \`openspec ids assign "<name>" --json\`
3. If \`problems\` is not empty, fix the files that it names (often a Gherkin syntax error) and run the command again.
4. Keep the \`assigned\` list: the file, line, rule name and new ID of each new rule.

**Phase 4: Trace wave (one helper for each area, in parallel)**

Start one helper for each area that is not full. Brief:

\`\`\`text
You are a trace helper in an OpenSpec scan.
Area: <name>
Files: <paths>
Requirements to trace: <ID, name, statement and capability of each new rule from phase 3, and of each untraced requirement of the area's capabilities>
Orphan traces in the area: <file:line and ID of each>
<copy of "Rules for every agent">

1. For each requirement, find the code in your area that implements it: the function, method, handler, route, command or config entry that makes the behavior happen.
2. On the line above that code, add a trace comment in the comment style of the file. Replace <ID> with the requirement ID, for example REQ-0042:
   // @trace <ID>      # @trace <ID>      -- @trace <ID>      /* @trace <ID> */      <!-- @trace <ID> -->
   Put several IDs in one comment, with commas: // @trace <ID>, <ID>. Use the indentation of the code below the comment.
3. Trace the main code of the behavior, not each helper function. A behavior that is split across files can have a trace in each file.
4. Do not trace test files. Do not put a trace in a file that cannot have comments (JSON, for example): trace the code that reads it.
5. You can also trace code of your area to requirements of other capabilities. Read their IDs in openspec/specs/. Trace only to IDs that exist.
6. Do not change existing traces. For each orphan trace, find the requirement that the code implements now, if there is one.
7. Report: for each requirement, the file and line of each trace, or "not found"; for each orphan trace, the ID that it should have, or "no match"; your questions.
\`\`\`

**Phase 5: Verify (lead)**

1. Run \`openspec validate --specs --strict\` (with \`--as-change <name>\`: \`openspec validate "<name>" --strict\`). Fix each error in the spec files that the scan wrote.
2. Run \`openspec trace check --json\`. With \`--as-change <name>\`, the new rules are in \`pending\`, and \`traced\` shows whether each one has a trace.
3. Fix the gaps in the scan scope:
   - A new rule that a helper reported as "not found": search the code for it one time. If you find the code, add the trace. If not, the rule does not describe real behavior: delete the rule and list it in the summary. Its ID is not used again.
   - An orphan trace with a clear new ID: replace the ID in the comment. If there is no clear ID, list the trace.
   - An existing rule that does not agree with the code: do not change it. List it.
4. Run both checks again. Stop after two rounds of fixes, and list what is left.
5. Give a short summary:
   - A table of the areas: coverage before and after, rules added, traces added.
   - The result of \`openspec validate\` and \`openspec trace check\`, and the coverage from \`openspec trace report\`.
   - Items for the user: rules that do not agree with the code, orphan traces that are left, deleted rules, and questions from the helpers.
   - The next step: review the diff (\`git diff\`), then commit. With \`--as-change <name>\`: review the change, then archive it (\`openspec archive "<name>"\`).

**Guardrails**
- Run the scan again at any time. The survey sees the specs and traces that exist, and the helpers only fill the gaps.
- Only the lead runs \`openspec ids\`. Helpers never write ID tags.
- Keep the scope: with input paths, do not write traces outside them, and only list (do not fix) the problems outside them.`,
  };
}
