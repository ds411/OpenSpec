import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { findMainSpecStructureIssues } from '../../src/core/parsers/spec-structure.js';
import { parseFeature } from '../../src/core/gherkin/document.js';
import { requirementIdNumber } from '../../src/core/gherkin/ids.js';
import { readIdCounter } from '../../src/core/gherkin/id-store.js';
import { discoverLegacySpecFiles, discoverSpecFiles } from '../../src/utils/spec-discovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const openspecRoot = path.join(projectRoot, 'openspec');
const specsRoot = path.join(openspecRoot, 'specs');

const PURPOSE_PLACEHOLDER_PATTERN = /TBD - created by archiving change .*?\. Update Purpose after archive\./;

describe('source-of-truth specs normalization', () => {
  it('reports duplicate canonical requirement names', () => {
    const content = [
      '# Capability',
      '',
      '## Purpose',
      'A purpose.',
      '',
      '## Requirements',
      '',
      '### Requirement: Same name',
      'The first definition.',
      '',
      '#### Scenario: First',
      '- **WHEN** something happens',
      '- **THEN** the first result occurs',
      '',
      '### Requirement: Same name',
      'The second definition.',
      '',
      '#### Scenario: Second',
      '- **WHEN** something else happens',
      '- **THEN** the second result occurs',
      '',
    ].join('\n');

    expect(findMainSpecStructureIssues(content)).toEqual([
      expect.objectContaining({
        kind: 'duplicate-requirement',
        message: expect.stringContaining('Same name'),
      }),
    ]);
  });

  it('keeps every main spec a valid Gherkin feature with one unique ID per requirement', async () => {
    const specs = await discoverSpecFiles(specsRoot);
    expect(specs.length).toBeGreaterThan(0);
    expect(await discoverLegacySpecFiles(specsRoot), 'every main spec must be converted to spec.feature').toEqual([]);

    const next = await readIdCounter(openspecRoot);
    expect(next, 'openspec/requirement-ids.yaml must hold the ID counter').toBeDefined();
    const seen = new Map<string, string>();

    for (const { specFile } of specs) {
      const relativeFile = path.relative(projectRoot, specFile);
      const document = parseFeature(await fs.readFile(specFile, 'utf8'));

      expect(document.errors, `${relativeFile} must parse`).toEqual([]);
      expect(document.feature?.description, `${relativeFile} must have a Purpose`).toBeTruthy();
      expect(document.feature?.description, `${relativeFile} must not keep the archive placeholder Purpose`).not.toMatch(
        PURPOSE_PLACEHOLDER_PATTERN
      );
      expect(document.rules.length, `${relativeFile} must have requirements`).toBeGreaterThan(0);

      for (const rule of document.rules) {
        const label = `${relativeFile}:${rule.keywordLine} "${rule.name}"`;
        expect(rule.operations, `${label} must not carry a delta operation tag`).toEqual([]);
        expect(rule.ids, `${label} must carry exactly one requirement ID`).toHaveLength(1);
        const id = rule.ids[0];
        expect(seen.get(id), `${label} reuses ${id}`).toBeUndefined();
        seen.set(id, label);
        expect(requirementIdNumber(id)!, `${label} has ${id}, which the counter has not handed out`).toBeLessThan(next!);
        expect(rule.scenarios.length, `${label} must have a scenario`).toBeGreaterThan(0);
      }
    }
  });
});
