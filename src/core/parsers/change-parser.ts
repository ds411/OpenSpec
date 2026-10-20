import { MarkdownParser } from './markdown-parser.js';
import { Change, Delta, DeltaOperation } from '../schemas/index.js';
import path from 'path';
import { promises as fs } from 'fs';
import { discoverSpecFiles, type DiscoveredSpec } from '../../utils/spec-discovery.js';
import { hasDeltaOperations, parseDeltaFeature, type GherkinDeltaPlan } from '../gherkin/delta.js';
import { ruleToRequirement } from '../gherkin/spec-model.js';

/**
 * Reads a change: the proposal (markdown) and the Gherkin deltas under its
 * specs/ folder.
 */
export class ChangeParser extends MarkdownParser {
  private changeDir: string;

  constructor(content: string, changeDir: string) {
    super(content);
    this.changeDir = changeDir;
  }

  async parseChangeWithDeltas(name: string): Promise<Change> {
    const sections = this.parseSections();
    const why = this.findSection(sections, 'Why')?.content || '';
    const whatChanges = this.findSection(sections, 'What Changes')?.content || '';

    if (!why) {
      throw new Error('Change must have a Why section');
    }

    if (!whatChanges) {
      throw new Error('Change must have a What Changes section');
    }

    // Delta spec files that carry operation tags are the only source of
    // structured deltas. The "What Changes" prose is read only when no spec
    // file has a tagged rule at all: a change with no spec files yet.
    const specFiles = await discoverSpecFiles(path.join(this.changeDir, 'specs'));
    const { deltas: specDeltas, hasDeltaSections } = await this.parseDeltaSpecs(specFiles);
    const deltas = hasDeltaSections ? specDeltas : this.parseDeltas(whatChanges);

    return {
      name,
      why: why.trim(),
      whatChanges: whatChanges.trim(),
      deltas,
      metadata: {
        version: '1.0.0',
        format: 'openspec-change',
      },
    };
  }

  // The spec files come from discoverSpecFiles, which walks specs/ recursively
  // so nested layouts like specs/<area>/<capability>/spec.feature are parsed too (#1353)
  private async parseDeltaSpecs(
    specFiles: DiscoveredSpec[]
  ): Promise<{ deltas: Delta[]; hasDeltaSections: boolean }> {
    const deltas: Delta[] = [];
    let hasDeltaSections = false;

    for (const { id, specFile } of specFiles) {
      let content: string;
      try {
        content = await fs.readFile(specFile, 'utf-8');
      } catch {
        // Spec file might not be readable, which is okay
        continue;
      }
      const plan = parseDeltaFeature(content);
      if (hasDeltaOperations(plan)) hasDeltaSections = true;
      deltas.push(...this.parseSpecDeltas(id, plan));
    }

    return { deltas, hasDeltaSections };
  }

  /**
   * The deltas in one spec file, read by parseDeltaFeature - the reader archive
   * applies - so what `show` reports is what archive will do.
   */
  private parseSpecDeltas(specName: string, plan: GherkinDeltaPlan): Delta[] {
    const deltas: Delta[] = [];
    const push = (operation: DeltaOperation, verb: string, entries: GherkinDeltaPlan['added']) => {
      for (const { rule } of entries) {
        const requirement = ruleToRequirement(rule);
        deltas.push({
          spec: specName,
          operation,
          description: `${verb} requirement${rule.id ? ` ${rule.id}` : ''}: ${requirement.text}`,
          // Provide both single and plural forms for compatibility
          requirement,
          requirements: [requirement],
        });
      }
    };
    push('ADDED', 'Add', plan.added);
    push('MODIFIED', 'Modify', plan.modified);
    push('REMOVED', 'Remove', plan.removed);
    return deltas;
  }
}
