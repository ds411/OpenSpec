import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parse as parseYaml } from 'yaml';
import { parse as parseToml } from 'smol-toml';
import {
  AGENT_COMMAND_IDS,
  formatAgentCommandSkipNote,
  getAgentCommandContents,
  hasAgentCommandDrift,
  shouldGenerateAgentCommandsForTool,
  writeAgentCommandFiles,
} from '../../../src/core/shared/agent-commands.js';
import { CommandAdapterRegistry, generateCommand } from '../../../src/core/command-generation/index.js';
import { getCommandContents, getSkillTemplates } from '../../../src/core/shared/skill-generation.js';
import { COMMAND_IDS } from '../../../src/core/shared/tool-detection.js';
import { ALL_WORKFLOWS } from '../../../src/core/profiles.js';
import { PROJECT_ROOT_GUARD } from '../../../src/core/templates/workflows/project-root.js';

describe('agent commands', () => {
  describe('registry', () => {
    it('ships the scan command', () => {
      expect(AGENT_COMMAND_IDS).toEqual(['scan']);
      expect(getAgentCommandContents().map((content) => content.id)).toEqual(['scan']);
    });

    it('keeps agent commands out of the profile workflows and the skills', () => {
      for (const id of AGENT_COMMAND_IDS) {
        expect(ALL_WORKFLOWS as readonly string[]).not.toContain(id);
        expect(COMMAND_IDS as readonly string[]).not.toContain(id);
        expect(getCommandContents().map((content) => content.id)).not.toContain(id);
      }
      const skillNames = getSkillTemplates().map(({ template }) => template.name);
      expect(skillNames.some((name) => name.includes('scan'))).toBe(false);
    });

    it('marks every agent command as started only by the user', () => {
      for (const content of getAgentCommandContents()) {
        expect(content.disableModelInvocation, content.id).toBe(true);
      }
    });

    it('carries the project check in every agent command', () => {
      for (const content of getAgentCommandContents()) {
        expect(content.body, content.id).toContain(PROJECT_ROOT_GUARD);
      }
    });
  });

  describe('tool support', () => {
    it.each(['claude', 'cursor', 'gemini', 'opencode', 'github-copilot'])(
      'writes agent commands for %s, which has command files',
      (toolId) => {
        expect(shouldGenerateAgentCommandsForTool(toolId)).toBe(true);
      }
    );

    it.each(['codex', 'warp', 'agents'])('skips agent commands for %s, which supports only skills', (toolId) => {
      expect(shouldGenerateAgentCommandsForTool(toolId)).toBe(false);
    });
  });

  describe('generated files', () => {
    const adapters = CommandAdapterRegistry.getAll();

    it.each(adapters.map((adapter) => [adapter.toolId, adapter] as const))(
      'formats a well-formed scan file for %s',
      (_toolId, adapter) => {
        for (const content of getAgentCommandContents()) {
          const generated = generateCommand(content, adapter);
          expect(generated.path).toBe(adapter.getFilePath(content.id));
          expect(generated.fileContent).toContain('**Phase 3: ID step (lead only)**');
          expect(generated.fileContent).not.toContain('[[opsx:');

          if (generated.path.endsWith('.toml')) {
            const parsed = parseToml(generated.fileContent);
            expect(parsed.description).toBe(content.description);
          } else if (generated.fileContent.startsWith('---\n')) {
            const frontmatter = generated.fileContent.match(/^---\n([\s\S]*?)\n---\n/);
            expect(frontmatter, adapter.toolId).not.toBeNull();
            expect(() => parseYaml(frontmatter![1])).not.toThrow();
          }
        }
      }
    );

    it('keeps the scan description out of the Claude Code model context', () => {
      const claude = CommandAdapterRegistry.get('claude')!;
      const [scan] = getAgentCommandContents();
      const output = generateCommand(scan, claude).fileContent;
      const frontmatter = parseYaml(output.match(/^---\n([\s\S]*?)\n---\n/)![1]);

      expect(frontmatter['disable-model-invocation']).toBe(true);
      expect(output.startsWith('---\n')).toBe(true);
    });

    it('leaves the workflow commands invocable by the model', () => {
      const claude = CommandAdapterRegistry.get('claude')!;
      for (const content of getCommandContents()) {
        expect(generateCommand(content, claude).fileContent, content.id).not.toContain(
          'disable-model-invocation'
        );
      }
    });

    it('passes the command arguments to OpenCode exactly once', () => {
      const opencode = CommandAdapterRegistry.get('opencode')!;
      for (const content of getAgentCommandContents()) {
        const output = generateCommand(content, opencode).fileContent;
        expect(output.match(/\$ARGUMENTS/g) ?? [], content.id).toHaveLength(1);
      }
    });
  });

  describe('writing and drift', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-agent-commands-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('writes the scan command file for a command tool', async () => {
      expect(await writeAgentCommandFiles(tempDir, 'claude')).toBe(1);

      const scanFile = path.join(tempDir, '.claude', 'commands', 'opsx', 'scan.md');
      expect(fs.readFileSync(scanFile, 'utf-8')).toContain('disable-model-invocation: true');
      expect(hasAgentCommandDrift(tempDir, 'claude')).toBe(false);
    });

    it('writes nothing for a skills-only tool', async () => {
      expect(await writeAgentCommandFiles(tempDir, 'codex')).toBe(0);
      expect(fs.readdirSync(tempDir)).toEqual([]);
      expect(hasAgentCommandDrift(tempDir, 'codex')).toBe(false);
    });

    it('reports a missing or changed scan file as drift', async () => {
      expect(hasAgentCommandDrift(tempDir, 'cursor')).toBe(true);

      await writeAgentCommandFiles(tempDir, 'cursor');
      const scanFile = path.join(tempDir, '.cursor', 'commands', 'opsx-scan.md');
      expect(hasAgentCommandDrift(tempDir, 'cursor')).toBe(false);

      fs.appendFileSync(scanFile, 'local edit\n');
      expect(hasAgentCommandDrift(tempDir, 'cursor')).toBe(true);
    });

    it('does not report a BOM or CRLF line endings as drift', async () => {
      await writeAgentCommandFiles(tempDir, 'claude');
      const scanFile = path.join(tempDir, '.claude', 'commands', 'opsx', 'scan.md');
      const content = fs.readFileSync(scanFile, 'utf-8');
      fs.writeFileSync(scanFile, `﻿${content.replace(/\n/g, '\r\n')}`);

      expect(hasAgentCommandDrift(tempDir, 'claude')).toBe(false);
    });
  });

  describe('skip note', () => {
    it('says nothing when every tool got the agent commands', () => {
      expect(formatAgentCommandSkipNote([])).toBeNull();
    });

    it('names the skills-only tools', () => {
      expect(formatAgentCommandSkipNote(['Codex'])).toBe(
        "Agent command 'scan' not written for: Codex. This tool supports only skills."
      );
      expect(formatAgentCommandSkipNote(['Codex', 'Warp'])).toBe(
        "Agent command 'scan' not written for: Codex, Warp. These tools support only skills."
      );
    });
  });
});
