import { ZodError } from 'zod';
import { readFileSync, promises as fs } from 'fs';
import path from 'path';
import { SpecSchema, ChangeSchema, Spec, Change } from '../schemas/index.js';
import { ChangeParser } from '../parsers/change-parser.js';
import { ValidationReport, ValidationIssue, ValidationLevel } from './types.js';
import { findSpecUpdates, buildUpdatedSpec } from '../specs-apply.js';
import {
  MIN_PURPOSE_LENGTH,
  MAX_REQUIREMENT_TEXT_LENGTH,
  VALIDATION_MESSAGES
} from './constants.js';
import { containsShallOrMust as containsShallOrMustShared } from '../parsers/requirement-text.js';
import {
  DELTA_OPERATION_TAGS,
  parseFeature,
  type FeatureDocument,
  type SpecRule,
  type SpecScenario,
} from '../gherkin/document.js';
import { featureToSpec, SPEC_MISSING_FEATURE } from '../gherkin/spec-model.js';
import { parseDeltaFeature, type DeltaRuleEntry } from '../gherkin/delta.js';
import { findDeltaPlanErrors, findDroppedScenarios } from '../gherkin/merge.js';
import { FileSystemUtils } from '../../utils/file-system.js';
import { assertDiscoveredSpecFile } from '../../utils/spec-path-containment.js';
import {
  discoverSpecFiles,
  findUnreadDeltaFiles,
  hasAnyFileUnder,
  LEGACY_SPEC_ISSUE_MARKER,
  SPEC_FILE_NAME,
} from '../../utils/spec-discovery.js';
import {
  METADATA_FILENAME,
  formatUnknownChangeMetadataKeysMessage,
  readSkipSpecsMarker,
  readUnknownChangeMetadataKeys,
  resolveSchemaForChange,
} from '../../utils/change-metadata.js';
import { resolveTaskFilesForChange } from '../../utils/task-progress.js';
import { findTaskNumberingIssues } from './task-numbering.js';
import { findMissingTaskCheckboxIssues } from './task-checkboxes.js';
import { findPurposePlaceholderIssue } from './purpose-placeholder.js';
import { getPackageSchemasDir, getSchemaDir } from '../artifact-graph/index.js';

export class Validator {
  private strictMode: boolean;

  constructor(strictMode: boolean = false) {
    this.strictMode = strictMode;
  }

  async validateSpec(filePath: string): Promise<ValidationReport> {
    const specName = this.extractNameFromPath(filePath);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createReport([{ level: 'ERROR', path: 'file', message: baseMessage }]);
    }
    return this.validateSpecContent(specName, content);
  }

  /**
   * Validate spec content from a string (also used for pre-write validation of
   * rebuilt specs).
   */
  async validateSpecContent(specName: string, content: string): Promise<ValidationReport> {
    const issues: ValidationIssue[] = [];
    const document = parseFeature(content);
    if (document.errors.length > 0) {
      for (const error of document.errors) {
        issues.push({
          level: 'ERROR',
          path: 'file',
          line: error.line,
          message: `Gherkin syntax error: ${error.message}`,
        });
      }
      return this.createReport(issues);
    }
    let spec: Spec;
    try {
      spec = featureToSpec(document, specName);
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : 'Unknown error';
      issues.push({ level: 'ERROR', path: 'file', message: this.enrichTopLevelError(specName, baseMessage) });
      return this.createReport(issues);
    }
    const result = SpecSchema.safeParse(spec);
    if (!result.success) {
      issues.push(...this.convertZodErrors(result.error));
    }
    issues.push(...this.applySpecRules(spec, document));
    return this.createReport(issues);
  }

  async validateChange(filePath: string): Promise<ValidationReport> {
    const issues: ValidationIssue[] = [];
    const changeName = this.extractNameFromPath(filePath);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const changeDir = path.dirname(filePath);
      const parser = new ChangeParser(content, changeDir);

      const change = await parser.parseChangeWithDeltas(changeName);

      const result = ChangeSchema.safeParse(change);

      const marker = readSkipSpecsMarker(changeDir);
      if (marker.invalidReason) {
        issues.push({ level: 'ERROR', path: METADATA_FILENAME, message: this.formatInvalidMarkerMessage(marker.invalidReason) });
      }

      if (!result.success) {
        let zodIssues = this.convertZodErrors(result.error);
        // Only the no-deltas error is marker-aware here: the marker+files
        // conflict is validateChangeDeltaSpecs's job, and every caller of
        // this proposal-level pass (archive's non-blocking warnings) pairs
        // it with that gate.
        if (marker.declared) {
          zodIssues = zodIssues.filter(
            issue => !issue.message.startsWith(VALIDATION_MESSAGES.CHANGE_NO_DELTAS)
          );
        }
        issues.push(...zodIssues);
      }
      
      issues.push(...this.applyChangeRules(change, content));
      
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : 'Unknown error';
      const enriched = this.enrichTopLevelError(changeName, baseMessage);
      issues.push({
        level: 'ERROR',
        path: 'file',
        message: enriched,
      });
    }
    
    return this.createReport(issues);
  }

  /**
   * Validate the Gherkin delta specs under a change directory.
   * Enforces:
   * - At least one delta across all files
   * - Each rule carries exactly one operation tag (@added, @modified,
   *   @removed) and exactly one requirement ID; no ID twice in a file
   * - @added/@modified: a statement and at least one scenario with steps;
   *   missing English SHALL/MUST keywords are guidance unless strict mode is
   *   enabled
   * - @removed: ID only; no scenario or statement required
   *
   * When `options.mainSpecsDir` is given, @modified rules are also checked
   * against the current main specs for scenario loss (#1477), and merge
   * conflicts are reported as INFO without changing the verdict (#1112).
   * When `options.projectRoot` is given, the schema's tracked task files are
   * checked for ambiguous numbering (#1520).
   */
  async validateChangeDeltaSpecs(
    changeDir: string,
    options: { mainSpecsDir?: string; projectRoot?: string } = {}
  ): Promise<ValidationReport> {
    const issues: ValidationIssue[] = [];
    const specsDir = path.join(changeDir, 'specs');
    let totalDeltas = 0;
    let hasRootLevelSpec = false;
    const emptySpecs: string[] = [];

    try {
      // Discover delta specs through the same helper the change parser, show,
      // apply, and archive use, so validate never accepts a layout the merge
      // path silently skips (#1385).
      const discoveredSpecs = await discoverSpecFiles(specsDir);

      // A spec.feature directly at the specs/ root has no capability folder, so
      // the merge path drops it (#1385). Only a regular file counts - a
      // *directory* named spec.feature is a capability folder like any other.
      const rootSpecStat = await fs.stat(path.join(specsDir, SPEC_FILE_NAME)).catch(() => null);
      hasRootLevelSpec = rootSpecStat?.isFile() === true;
      if (hasRootLevelSpec) {
        issues.push({
          level: 'ERROR',
          path: SPEC_FILE_NAME,
          message:
            `Delta spec found at specs/${SPEC_FILE_NAME}. Delta specs must live under a capability path (e.g. specs/<capability-path>/${SPEC_FILE_NAME}) — a file at the specs/ root is ignored when the change is applied or archived.`,
        });
      }

      for (const { id: specId, specFile } of discoveredSpecs) {
        let content: string | undefined;
        try {
          content = await fs.readFile(specFile, 'utf-8');
        } catch {
          continue;
        }

        const plan = parseDeltaFeature(content);
        const entryPath = FileSystemUtils.toPosixPath(path.relative(specsDir, specFile));

        for (const error of findDeltaPlanErrors(plan)) {
          issues.push({ level: 'ERROR', path: entryPath, line: error.line, message: error.message });
        }
        if (plan.document.errors.length > 0 || !plan.document.feature) continue;

        if (plan.document.rules.length === 0) {
          emptySpecs.push(entryPath);
          continue;
        }

        // Archive carries rules only. Warn so content written elsewhere is
        // moved rather than lost without notice.
        const feature = plan.document.feature;
        if (feature.backgroundLine !== undefined) {
          issues.push({
            level: 'WARNING',
            path: entryPath,
            line: feature.backgroundLine,
            message:
              'The feature Background is not carried into the main spec by archive. Put shared steps into each scenario, or edit the main spec directly.',
          });
        }
        for (const scenario of feature.looseScenarios) {
          issues.push({
            level: 'WARNING',
            path: entryPath,
            line: scenario.line,
            message: `Scenario "${scenario.name}" is outside every Rule, so archive does not carry it into the main spec. Move it into the Rule of the requirement it belongs to.`,
          });
        }

        for (const entry of plan.added) {
          totalDeltas++;
          issues.push(...this.checkDeltaRule('@added', entry, entryPath, true));
        }
        for (const entry of plan.modified) {
          totalDeltas++;
          issues.push(...this.checkDeltaRule('@modified', entry, entryPath, false));
        }
        totalDeltas += plan.removed.length;

        // Run archive's scenario-loss check here too, so the change fails at
        // authoring time instead of days later at archive time (#1477).
        if (options.mainSpecsDir && plan.modified.length > 0) {
          const mainSpecFile = path.join(options.mainSpecsDir, ...specId.split('/'), SPEC_FILE_NAME);
          issues.push(
            ...(await this.findScenarioLossIssues(plan.modified, mainSpecFile, entryPath, options.mainSpecsDir))
          );
        }
      }

      // Reuse archive's merge builder to report conflicts with the main specs.
      // Keep structural errors and scenario loss in their existing diagnostics.
      if (options.mainSpecsDir) {
        issues.push(
          ...(await this.findArchiveBlockers(changeDir, options.mainSpecsDir, [
            ...issues.filter((issue) => issue.level === 'ERROR').map((issue) => issue.path),
            ...emptySpecs,
          ]))
        );
      }
    } catch (error) {
      // A missing specs dir (or a stray `specs` file) means no deltas;
      // anything else (EACCES, EIO) must stay loud — discoverSpecFiles
      // documents that silently dropping an unreadable capability recreates
      // the data-loss class it prevents, and archive lets the same error
      // propagate.
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw error;
      }
    }

    // The same drop happens to deltas in any other file the merge path does
    // not read (specs/<capability>.feature, a note beside spec.feature, a
    // markdown delta in the old format).
    const unreadDeltaFiles = await findUnreadDeltaFiles(specsDir);
    for (const file of unreadDeltaFiles) {
      issues.push({
        level: 'ERROR',
        path: file.path,
        message: file.legacyMarkdown
          ? `Delta spec found at specs/${file.path} ${LEGACY_SPEC_ISSUE_MARKER}. Specs are Gherkin feature files now: run "openspec convert-specs" to convert it into specs/${file.expected}.`
          : `Delta spec found at specs/${file.path}. Delta specs must be a ${SPEC_FILE_NAME} inside a capability folder — this file is ignored when the change is applied or archived. Move its rules into specs/${file.expected}.`,
      });
    }

    for (const specPath of emptySpecs) {
      issues.push({
        level: 'ERROR',
        path: specPath,
        message: 'No delta rules found. Add a "Rule:" tagged @added, @modified or @removed, or move non-delta notes outside specs/.',
      });
    }

    const marker = readSkipSpecsMarker(changeDir);
    if (marker.invalidReason) {
      issues.push({ level: 'ERROR', path: METADATA_FILENAME, message: this.formatInvalidMarkerMessage(marker.invalidReason) });
    }

    const unknownMetadataKeys = readUnknownChangeMetadataKeys(changeDir);
    if (unknownMetadataKeys.length > 0) {
      issues.push({
        level: 'WARNING',
        path: METADATA_FILENAME,
        message: formatUnknownChangeMetadataKeysMessage(unknownMetadataKeys),
      });
    }

    // ANY file under specs/ contradicts the marker - not just parsed deltas.
    // Probed only when the marker is declared, and unreadable specs/ fails
    // closed as a conflict.
    const skipSpecs = marker.declared;
    let specsDirHasFiles = false;
    if (skipSpecs) {
      try {
        specsDirHasFiles = await hasAnyFileUnder(specsDir);
      } catch {
        specsDirHasFiles = true;
      }
    }
    if (skipSpecs && specsDirHasFiles) {
      issues.push({ level: 'ERROR', path: 'file', message: VALIDATION_MESSAGES.CHANGE_SKIP_SPECS_CONFLICT });
    }

    // The root-level and unread-file errors already name the file and the fix;
    // adding "No deltas found" on top would contradict them.
    if (totalDeltas === 0 && !hasRootLevelSpec && unreadDeltaFiles.length === 0) {
      if (skipSpecs && !specsDirHasFiles) {
        issues.push({ level: 'INFO', path: 'file', message: VALIDATION_MESSAGES.CHANGE_SKIP_SPECS_ACCEPTED });
      } else if (!skipSpecs) {
        issues.push({ level: 'ERROR', path: 'file', message: this.enrichTopLevelError('change', VALIDATION_MESSAGES.CHANGE_NO_DELTAS) });
      }
    }

    if (options.projectRoot) {
      issues.push(...await this.collectTaskFileIssues(changeDir, options.projectRoot));
    }

    return this.createReport(issues);
  }

  /**
   * Checks an @added or @modified rule's own content: statement, keyword,
   * length (new requirements only) and scenarios.
   */
  private checkDeltaRule(
    operation: '@added' | '@modified',
    entry: DeltaRuleEntry,
    entryPath: string,
    checkLength: boolean
  ): ValidationIssue[] {
    const { rule } = entry;
    const label = `${operation} "${rule.name}"`;
    const issues: ValidationIssue[] = [];
    issues.push(...this.checkStatement(rule, label, entryPath));
    // Same limit the main spec enforces after archive (#1976). A modified rule
    // is left alone: its text is the existing requirement.
    if (checkLength && rule.description.length > MAX_REQUIREMENT_TEXT_LENGTH) {
      issues.push({
        level: 'WARNING',
        path: entryPath,
        line: rule.keywordLine,
        message: `${label}: ${VALIDATION_MESSAGES.REQUIREMENT_TOO_LONG}`,
      });
    }
    const scenarios = rule.scenarios.filter((scenario) => !this.isRemovedScenario(scenario));
    if (scenarios.length === 0) {
      issues.push({
        level: 'ERROR',
        path: entryPath,
        line: rule.keywordLine,
        message: `${label} must include at least one scenario`,
      });
    }
    issues.push(...this.checkScenarios(scenarios, label, entryPath));
    return issues;
  }

  private checkStatement(rule: SpecRule, label: string, issuePath: string): ValidationIssue[] {
    if (!rule.description) {
      return [{
        level: 'ERROR',
        path: issuePath,
        line: rule.keywordLine,
        message: this.containsShallOrMust(rule.name)
          ? this.buildMissingShallOrMustMessage(label, rule.name)
          : `${label} is missing its requirement statement (the text under "Rule:")`,
      }];
    }
    if (!this.containsShallOrMust(rule.description)) {
      return [{
        level: 'WARNING',
        path: issuePath,
        line: rule.keywordLine,
        message: this.buildMissingShallOrMustMessage(label, rule.name, true),
      }];
    }
    return [];
  }

  private checkScenarios(scenarios: SpecScenario[], label: string, issuePath: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (const scenario of scenarios) {
      if (scenario.steps.length === 0) {
        issues.push({
          level: 'ERROR',
          path: issuePath,
          line: scenario.line,
          message: `${label}: scenario "${scenario.name}" has no steps. Add steps such as "When ..." and "Then ...".`,
        });
      } else if (!scenario.steps.some((step) => step.keywordType === 'Outcome')) {
        issues.push({
          level: 'WARNING',
          path: issuePath,
          line: scenario.line,
          message: `${label}: scenario "${scenario.name}" has no "Then" step, so it states no expected outcome.`,
        });
      }
    }
    return issues;
  }

  private isRemovedScenario(scenario: SpecScenario): boolean {
    return scenario.tags.some((tag) => tag.toLowerCase() === 'removed');
  }

  /**
   * Report @modified rules that leave out a scenario the main spec still has.
   * Uses the same comparison archive applies, so validate can only report what
   * archive would refuse.
   *
   * Silent when the main spec or the requirement is absent: applying a
   * @modified rule against a base that is not there yet is a different failure
   * (a sister change still in flight is the legitimate case), and archive is
   * the gate for it. A spec that exists but cannot be read is not absent,
   * though — archive aborts on it, so reporting it beats calling the change
   * valid.
   */
  private async findScenarioLossIssues(
    modified: DeltaRuleEntry[],
    mainSpecFile: string,
    entryPath: string,
    mainSpecRoot: string
  ): Promise<ValidationIssue[]> {
    let mainContent: string;
    assertDiscoveredSpecFile(mainSpecRoot, mainSpecFile);
    try {
      mainContent = await fs.readFile(mainSpecFile, 'utf-8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      // Reported only for the codes that mean the file itself is unusable, and
      // will be just as unusable when archive reads it. `validate --all` reads
      // six changes at once, so a resource error must never become a verdict.
      const UNUSABLE = new Set(['EACCES', 'EPERM', 'EISDIR', 'ELOOP', 'ENAMETOOLONG']);
      if (!code || !UNUSABLE.has(code)) return [];
      return [
        {
          level: 'ERROR',
          path: entryPath,
          message:
            `Could not read ${FileSystemUtils.toPosixPath(mainSpecFile)} to check the @modified rules against it ` +
            `(${code}). Archive reads the same file, so fix the file before archiving.`,
        },
      ];
    }

    const main = parseFeature(mainContent);
    const current = new Map<string, SpecRule>();
    for (const rule of main.rules) if (rule.id) current.set(rule.id, rule);

    const issues: ValidationIssue[] = [];
    for (const { rule } of modified) {
      if (!rule.id) continue;
      const base = current.get(rule.id);
      if (!base) continue;
      const removed = new Set(rule.scenarios.filter((s) => this.isRemovedScenario(s)).map((s) => s.name));
      const dropped = findDroppedScenarios(base, rule).filter((name) => !removed.has(name));
      if (dropped.length === 0) continue;
      issues.push({
        level: 'ERROR',
        path: entryPath,
        line: rule.keywordLine,
        message:
          `@modified ${rule.id} ("${rule.name}") leaves out scenario(s) the current spec still has: ` +
          `${dropped.map((name) => `"${name}"`).join(', ')}. ` +
          'A @modified rule replaces the whole rule, so archive refuses to drop them. ' +
          'Copy them into the @modified rule, or keep them there tagged @removed to delete them on purpose.',
      });
    }
    return issues;
  }

  private applySpecRules(spec: Spec, document: FeatureDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const feature = document.feature!;

    for (const scenario of feature.looseScenarios) {
      issues.push({
        level: 'ERROR',
        path: 'file',
        line: scenario.line,
        message: `Scenario "${scenario.name}" is outside every Rule. Each scenario belongs to the Rule (requirement) it illustrates.`,
      });
    }

    // The placeholder is longer than MIN_PURPOSE_LENGTH, so the brevity check
    // below cannot reach it; it is reported on its own terms instead.
    const placeholder = findPurposePlaceholderIssue(spec.overview, document);
    if (placeholder) {
      issues.push({
        level: 'WARNING',
        path: 'overview',
        line: placeholder.line,
        message: VALIDATION_MESSAGES.PURPOSE_IS_PLACEHOLDER,
      });
    } else if (spec.overview && spec.overview.length < MIN_PURPOSE_LENGTH) {
      issues.push({
        level: 'WARNING',
        path: 'overview',
        message: VALIDATION_MESSAGES.PURPOSE_TOO_BRIEF,
      });
    }

    const seenIds = new Map<string, SpecRule>();
    document.rules.forEach((rule, index) => {
      const at = `requirements[${index}]`;
      const label = `Requirement "${rule.name}"`;
      if (rule.ids.length === 0) {
        issues.push({
          level: 'ERROR',
          path: at,
          line: rule.keywordLine,
          message: `${label} has no requirement ID. ${VALIDATION_MESSAGES.GUIDE_ASSIGN_IDS}`,
        });
      } else if (rule.ids.length > 1) {
        issues.push({
          level: 'ERROR',
          path: at,
          line: rule.keywordLine,
          message: `${label} has more than one requirement ID (${rule.ids.join(', ')}). Keep one.`,
        });
      } else {
        const previous = seenIds.get(rule.ids[0]);
        if (previous) {
          issues.push({
            level: 'ERROR',
            path: at,
            line: rule.keywordLine,
            message: `Requirement ID ${rule.ids[0]} is used more than once in this spec (also line ${previous.keywordLine}).`,
          });
        } else {
          seenIds.set(rule.ids[0], rule);
        }
      }
      const operationTags = rule.operations;
      if (operationTags.length > 0) {
        issues.push({
          level: 'ERROR',
          path: at,
          line: rule.keywordLine,
          message: `${label} carries the delta tag ${operationTags.map((tag) => `@${tag}`).join(', ')}. ` +
            `Delta tags (${DELTA_OPERATION_TAGS.map((tag) => `@${tag}`).join(', ')}) belong only in a change's specs; remove it from the main spec.`,
        });
      }
      if (rule.description.length > MAX_REQUIREMENT_TEXT_LENGTH) {
        issues.push({
          level: 'WARNING',
          path: at,
          line: rule.keywordLine,
          message: VALIDATION_MESSAGES.REQUIREMENT_TOO_LONG,
        });
      }
      issues.push(...this.checkStatement(rule, label, at));
      if (rule.scenarios.length === 0) {
        issues.push({
          level: 'WARNING',
          path: `${at}.scenarios`,
          line: rule.keywordLine,
          message: `${VALIDATION_MESSAGES.REQUIREMENT_NO_SCENARIOS}. ${VALIDATION_MESSAGES.GUIDE_SCENARIO_FORMAT}`,
        });
      }
      issues.push(...this.checkScenarios(rule.scenarios, label, at));
    });

    return issues;
  }

  private containsShallOrMust(text: string): boolean {
    return containsShallOrMustShared(text);
  }

  /**
   * Build a message for a requirement whose statement lacks SHALL/MUST. When
   * the keyword already appears in the rule name, point the author at moving
   * it into the statement under "Rule:".
   */
  private buildMissingShallOrMustMessage(
    prefix: string,
    ruleName: string,
    guidanceOnly = false
  ): string {
    const base = `${prefix} ${guidanceOnly ? 'should' : 'must'} contain SHALL or MUST`;
    const suffix = guidanceOnly ? ' (RFC 2119 best practice for English specs)' : '';
    if (this.containsShallOrMust(ruleName)) {
      return `${base} in the requirement statement, not only in the rule name. Move the SHALL/MUST statement to the text under the "Rule: ..." line.${suffix}`;
    }
    return `${base}${suffix}`;
  }

  /**
   * Lints the change's task files.
   *
   * Two checks with deliberately different reach. Checkbox formatting is read
   * from whatever the change's own schema declares as its tracked task output,
   * because every schema's progress, apply and archive behavior is computed by
   * counting checkboxes in exactly those files. Numbering stays scoped to the
   * built-in `spec-driven` schema, whose template is the one that numbers tasks
   * in the first place.
   *
   * The checkbox check never falls back to a bare top-level `tasks.md`: a file
   * no artifact declares is not a tracked task list, and warning about its
   * formatting would be a guess about a file the tool does not read.
   */
  private async collectTaskFileIssues(
    changeDir: string,
    projectRoot: string
  ): Promise<ValidationIssue[]> {
    let trackedFiles: string[];
    try {
      trackedFiles = resolveTaskFilesForChange(changeDir, projectRoot);
    } catch {
      return [];
    }

    const files = trackedFiles.length > 0 ? trackedFiles : [path.join(changeDir, 'tasks.md')];
    const { documents, unreadable } = await this.readTaskDocuments(changeDir, files);
    const toWarning = (issue: { path: string; line: number; message: string }): ValidationIssue => ({
      level: 'WARNING',
      path: issue.path,
      line: issue.line,
      message: issue.message,
    });

    const issues: ValidationIssue[] = [];
    // "No file here holds a checkbox" is a claim about the whole tracked set, so
    // a file that exists but could not be read withdraws it: the checkboxes may
    // be in exactly that file. `validate --archived` is the surface that reports
    // an unreadable task file loudly (#205); this one must not guess from it.
    if (trackedFiles.length > 0 && unreadable === 0) {
      issues.push(...findMissingTaskCheckboxIssues(documents).map(toWarning));
    }
    if (this.usesBuiltInSpecDrivenSchema(changeDir, projectRoot)) {
      issues.push(...findTaskNumberingIssues(documents).map(toWarning));
    }
    return issues;
  }

  /**
   * Reads task files into change-relative documents, counting the ones that
   * exist but could not be read. A file that is simply absent is not counted:
   * the resolver only returns files it found, so the remaining read failures
   * are permissions and I/O, and a check that reasons over the whole set needs
   * to know its evidence was incomplete.
   */
  private async readTaskDocuments(
    changeDir: string,
    files: readonly string[]
  ): Promise<{ documents: Array<{ path: string; content: string }>; unreadable: number }> {
    const documents: Array<{ path: string; content: string }> = [];
    let unreadable = 0;
    for (const file of files) {
      let content: string;
      try {
        content = await fs.readFile(file, 'utf-8');
      } catch (error: any) {
        if (error?.code !== 'ENOENT') unreadable++;
        continue;
      }

      documents.push({ path: this.taskDocumentPath(changeDir, file), content });
    }

    documents.sort((left, right) => left.path.localeCompare(right.path));
    return { documents, unreadable };
  }

  /**
   * Names a task file relative to its change, POSIX-separated.
   *
   * Both sides are canonicalized first. `resolveArtifactOutputs` hands back real
   * paths, while `changeDir` carries whatever spelling the caller resolved, and
   * the two can differ without being apart: on Windows a short 8.3 alias
   * (`RUNNER~1`) against its expanded form turned `tasks.md` into a
   * `../../../..`-prefixed absolute path in the report, and a symlinked project
   * directory does the same elsewhere. Canonicalizing recovers the real
   * relationship. The Windows CI job is the regression guard — the mismatch
   * cannot be staged on POSIX, where the spawned CLI's `process.cwd()` is
   * already physical.
   *
   * A path that still escapes would be a resolver bug rather than a spelling
   * difference, but the report must never leak an absolute filesystem path, so
   * the file name stands in.
   */
  private taskDocumentPath(changeDir: string, file: string): string {
    const relative = path.relative(
      FileSystemUtils.canonicalizeExistingPath(changeDir),
      FileSystemUtils.canonicalizeExistingPath(file)
    );
    const escapes = relative === '' || relative.startsWith('..') || path.isAbsolute(relative);
    return escapes ? path.basename(file) : FileSystemUtils.toPosixPath(relative);
  }

  /**
   * True when the change resolves to the package's own `spec-driven` schema. A
   * project schema that merely reuses the name is not it, so checks written
   * against the built-in template never fire on someone else's task format.
   */
  private usesBuiltInSpecDrivenSchema(changeDir: string, projectRoot: string): boolean {
    try {
      const schemaName = resolveSchemaForChange(changeDir, undefined, projectRoot).replace(
        /\.ya?ml$/,
        ''
      );
      if (schemaName !== 'spec-driven') return false;
      const schemaDir = getSchemaDir(schemaName, projectRoot);
      if (schemaDir === null) return false;
      const builtInSchemaDir = path.join(getPackageSchemasDir(), 'spec-driven');
      return (
        FileSystemUtils.canonicalizeExistingPath(schemaDir) ===
        FileSystemUtils.canonicalizeExistingPath(builtInSchemaDir)
      );
    } catch {
      return false;
    }
  }

  private formatInvalidMarkerMessage(invalidReason: string): string {
    return `${VALIDATION_MESSAGES.CHANGE_SKIP_SPECS_INVALID_METADATA} (${invalidReason})`;
  }

  private convertZodErrors(error: ZodError): ValidationIssue[] {
    return error.issues.map(err => {
      let message = err.message;
      if (message === VALIDATION_MESSAGES.CHANGE_NO_DELTAS) {
        message = `${message}. ${VALIDATION_MESSAGES.GUIDE_NO_DELTAS}`;
      }
      return {
        level: 'ERROR' as ValidationLevel,
        path: err.path.join('.'),
        message,
      };
    });
  }

  private applyChangeRules(change: Change, content: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
    const MIN_DELTA_DESCRIPTION_LENGTH = 10;
    
    change.deltas.forEach((delta, index) => {
      if (!delta.description || delta.description.length < MIN_DELTA_DESCRIPTION_LENGTH) {
        issues.push({
          level: 'WARNING',
          path: `deltas[${index}].description`,
          message: VALIDATION_MESSAGES.DELTA_DESCRIPTION_TOO_BRIEF,
        });
      }
      
      if ((delta.operation === 'ADDED' || delta.operation === 'MODIFIED') && 
          (!delta.requirements || delta.requirements.length === 0)) {
        issues.push({
          level: 'WARNING',
          path: `deltas[${index}].requirements`,
          message: `${delta.operation} ${VALIDATION_MESSAGES.DELTA_MISSING_REQUIREMENTS}`,
        });
      }
    });
    
    return issues;
  }

  private enrichTopLevelError(itemId: string, baseMessage: string): string {
    const msg = baseMessage.trim();
    if (msg === VALIDATION_MESSAGES.CHANGE_NO_DELTAS) {
      return `${msg}. ${VALIDATION_MESSAGES.GUIDE_NO_DELTAS}`;
    }
    if (msg.includes(SPEC_MISSING_FEATURE)) {
      return `${msg}. ${VALIDATION_MESSAGES.GUIDE_MISSING_SPEC_SECTIONS}`;
    }
    if (msg.includes('Change must have a Why section') || msg.includes('Change must have a What Changes section')) {
      return `${msg}. ${VALIDATION_MESSAGES.GUIDE_MISSING_CHANGE_SECTIONS}`;
    }
    return msg;
  }

  private extractNameFromPath(filePath: string): string {
    const normalizedPath = FileSystemUtils.toPosixPath(filePath);
    const parts = normalizedPath.split('/');
    
    // Look for the directory name after 'specs' or 'changes'
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === 'specs' || parts[i] === 'changes') {
        if (i < parts.length - 1) {
          return parts[i + 1];
        }
      }
    }
    
    // Fallback to filename without extension if not in expected structure
    const fileName = parts[parts.length - 1] ?? '';
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  }

  /**
   * Dry-run archive's merge builder without writing its result. Reusing the
   * builder preserves its already-synced delta rules instead of duplicating them.
   * INFO leaves the verdict unchanged: a missing target can be a typo or a
   * requirement introduced by a sibling change that has not archived yet.
   * This does not run archive's later merged-spec validation or retirement checks.
   */
  private async findArchiveBlockers(
    changeDir: string,
    mainSpecsDir: string,
    alreadyReportedPaths: string[]
  ): Promise<ValidationIssue[]> {
    const alreadyReported = new Set(alreadyReportedPaths);
    // Only ever reaches a generated skeleton's placeholder Purpose, which this
    // dry run discards.
    const changeName = path.basename(changeDir);
    const issues: ValidationIssue[] = [];

    let updates: Awaited<ReturnType<typeof findSpecUpdates>>;
    try {
      updates = await findSpecUpdates(changeDir, mainSpecsDir);
    } catch (error) {
      // An incomplete advisory check must not discard the validation report.
      // Source discovery already ran above; archive retains its own path guards.
      return [{
        level: 'INFO',
        path: 'specs',
        message: `Could not check archive merge conflicts: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }];
    }

    for (const update of updates) {
      // discoverSpecFiles builds both this id and the entryPath the checks
      // above report under, from the same walk.
      const entryPath = FileSystemUtils.toPosixPath(`${update.id}/${SPEC_FILE_NAME}`);
      // A delta those checks already rejected would be reported twice, the
      // second time in archive's wording rather than the wording that names
      // the actual mistake.
      if (alreadyReported.has(entryPath)) continue;

      try {
        await buildUpdatedSpec(update, changeName, { silent: true });
      } catch (error) {
        // Only the thrown preconditions, which carry no errno. A filesystem
        // error says nothing about whether the delta applies, and `validate
        // --all` reads six changes at once, so a transient EMFILE would report
        // a collision that is not there - the same reason the scenario-loss
        // check above reads only the codes that mean the file is unusable.
        if ((error as NodeJS.ErrnoException)?.code !== undefined) continue;
        issues.push({
          level: 'INFO',
          path: entryPath,
          message: `Archive would refuse this delta: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }

    return issues;
  }

  private createReport(issues: ValidationIssue[]): ValidationReport {
    const errors = issues.filter(i => i.level === 'ERROR').length;
    const warnings = issues.filter(i => i.level === 'WARNING').length;
    const info = issues.filter(i => i.level === 'INFO').length;
    
    const valid = this.strictMode 
      ? errors === 0 && warnings === 0
      : errors === 0;
    
    return {
      valid,
      issues,
      summary: {
        errors,
        warnings,
        info,
      },
    };
  }

  isValid(report: ValidationReport): boolean {
    return report.valid;
  }
}
