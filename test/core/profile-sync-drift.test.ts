import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  hasProjectConfigDrift,
  hasToolProfileOrDeliveryDrift,
  WORKFLOW_TO_SKILL_DIR,
} from '../../src/core/profile-sync-drift.js';
import { CORE_WORKFLOWS } from '../../src/core/profiles.js';
import { CommandAdapterRegistry, generateCommands } from '../../src/core/command-generation/index.js';
import { getAgentCommandContents } from '../../src/core/shared/agent-commands.js';

function writeSkill(projectDir: string, workflowId: string): void {
  const skillDirName = WORKFLOW_TO_SKILL_DIR[workflowId as keyof typeof WORKFLOW_TO_SKILL_DIR];
  const skillPath = path.join(projectDir, '.claude', 'skills', skillDirName, 'SKILL.md');
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath, `name: ${skillDirName}\n`);
}

function writeCommand(projectDir: string, workflowId: string): void {
  const adapter = CommandAdapterRegistry.get('claude');
  if (!adapter) throw new Error('Claude adapter unavailable in test environment');
  const cmdPath = adapter.getFilePath(workflowId);
  const fullPath = path.isAbsolute(cmdPath) ? cmdPath : path.join(projectDir, cmdPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `# ${workflowId}\n`);
}

function setupCoreSkills(projectDir: string): void {
  for (const workflow of CORE_WORKFLOWS) {
    writeSkill(projectDir, workflow);
  }
}

function writeAgentCommands(projectDir: string): string[] {
  const adapter = CommandAdapterRegistry.get('claude');
  if (!adapter) throw new Error('Claude adapter unavailable in test environment');
  return generateCommands(getAgentCommandContents(), adapter).map((cmd) => {
    const fullPath = path.join(projectDir, cmd.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, cmd.fileContent);
    return fullPath;
  });
}

function setupCoreCommands(projectDir: string): void {
  for (const workflow of CORE_WORKFLOWS) {
    writeCommand(projectDir, workflow);
  }
  writeAgentCommands(projectDir);
}

function setupCodexCoreSkills(projectDir: string): string {
  const skillsDir = path.join(projectDir, '.agents', 'skills');
  for (const workflow of CORE_WORKFLOWS) {
    const skillDirName = WORKFLOW_TO_SKILL_DIR[workflow];
    const skillPath = path.join(skillsDir, skillDirName, 'SKILL.md');
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, `name: ${skillDirName}\n`);
  }
  fs.writeFileSync(path.join(skillsDir, '.openspec-target'), 'codex\n');
  return skillsDir;
}

describe('profile sync drift detection', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-profile-sync-drift-test-'));
    fs.mkdirSync(path.join(tempDir, 'openspec'), { recursive: true });
    vi.stubEnv('HOME', path.join(tempDir, 'home'));
    vi.stubEnv('USERPROFILE', path.join(tempDir, 'home'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects drift for skills-only delivery when commands still exist', () => {
    setupCoreSkills(tempDir);
    setupCoreCommands(tempDir);

    const hasDrift = hasProjectConfigDrift(tempDir, CORE_WORKFLOWS, 'skills');
    expect(hasDrift).toBe(true);
  });

  it('detects drift for commands-only delivery when skills still exist', () => {
    setupCoreCommands(tempDir);
    setupCoreSkills(tempDir);

    const hasDrift = hasProjectConfigDrift(tempDir, CORE_WORKFLOWS, 'commands');
    expect(hasDrift).toBe(true);
  });

  it('does not remove global MiniMax Code skills for commands-only delivery', () => {
    const skillPath = path.join(
      tempDir,
      'home',
      '.minimax',
      'skills',
      'openspec-explore',
      'SKILL.md'
    );
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, 'name: openspec-explore\n');

    expect(hasProjectConfigDrift(tempDir, CORE_WORKFLOWS, 'commands')).toBe(false);
  });

  it('detects drift when required profile workflow files are missing', () => {
    writeSkill(tempDir, 'explore');

    const hasDrift = hasProjectConfigDrift(tempDir, CORE_WORKFLOWS, 'both');
    expect(hasDrift).toBe(true);
  });

  it('returns false when project files match core profile and delivery', () => {
    setupCoreSkills(tempDir);
    setupCoreCommands(tempDir);

    const hasDrift = hasProjectConfigDrift(tempDir, CORE_WORKFLOWS, 'both');
    expect(hasDrift).toBe(false);
  });

  it('detects drift when extra workflows are installed for both delivery', () => {
    setupCoreSkills(tempDir);
    setupCoreCommands(tempDir);
    writeSkill(tempDir, 'new');
    writeCommand(tempDir, 'new');

    const hasDrift = hasProjectConfigDrift(tempDir, CORE_WORKFLOWS, 'both');
    expect(hasDrift).toBe(true);
  });

  it('does not report legacy Codex drift when both roots resolve to the same files', () => {
    setupCodexCoreSkills(tempDir);
    fs.symlinkSync(
      process.platform === 'win32' ? path.join(tempDir, '.agents') : '.agents',
      path.join(tempDir, '.codex'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    expect(
      hasToolProfileOrDeliveryDrift(tempDir, 'codex', CORE_WORKFLOWS, 'skills')
    ).toBe(false);
  });

  it('reports an equal distinct legacy Codex copy that migration can remove', () => {
    const skillsDir = setupCodexCoreSkills(tempDir);
    const currentSkill = path.join(skillsDir, 'openspec-explore', 'SKILL.md');
    const legacySkill = path.join(
      tempDir,
      '.codex',
      'skills',
      'openspec-explore',
      'SKILL.md'
    );
    fs.mkdirSync(path.dirname(legacySkill), { recursive: true });
    fs.copyFileSync(currentSkill, legacySkill);

    expect(
      hasToolProfileOrDeliveryDrift(tempDir, 'codex', CORE_WORKFLOWS, 'skills')
    ).toBe(true);
  });

  it('reports generated-only Codex differences that migration can remove', () => {
    const skillsDir = setupCodexCoreSkills(tempDir);
    const currentSkill = path.join(skillsDir, 'openspec-explore', 'SKILL.md');
    const legacySkill = path.join(
      tempDir,
      '.codex',
      'skills',
      'openspec-explore',
      'SKILL.md'
    );
    fs.writeFileSync(
      currentSkill,
      '---\nmetadata:\n  generatedBy: "1.7.0"\n---\nUse $openspec-apply-change (Codex) or /openspec-apply-change (other agents).\n'
    );
    fs.mkdirSync(path.dirname(legacySkill), { recursive: true });
    fs.writeFileSync(
      legacySkill,
      '\uFEFF---\r\nmetadata:\r\n  generatedBy: "0.1.0"\r\n---\r\nUse $openspec-apply-change.\r\n'
    );

    expect(
      hasToolProfileOrDeliveryDrift(tempDir, 'codex', CORE_WORKFLOWS, 'skills')
    ).toBe(true);
  });

  it.each(['both', 'skills', 'commands'] as const)(
    'detects drift when an agent command file is missing (delivery=%s)',
    (delivery) => {
      if (delivery !== 'commands') setupCoreSkills(tempDir);
      if (delivery !== 'skills') setupCoreCommands(tempDir);
      else writeAgentCommands(tempDir);
      expect(hasToolProfileOrDeliveryDrift(tempDir, 'claude', CORE_WORKFLOWS, delivery)).toBe(false);

      fs.rmSync(path.join(tempDir, '.claude', 'commands', 'opsx', 'scan.md'));

      expect(hasToolProfileOrDeliveryDrift(tempDir, 'claude', CORE_WORKFLOWS, delivery)).toBe(true);
    }
  );

  it('detects drift when an agent command file differs from the generated content', () => {
    setupCoreSkills(tempDir);
    setupCoreCommands(tempDir);
    const scanFile = path.join(tempDir, '.claude', 'commands', 'opsx', 'scan.md');
    fs.writeFileSync(scanFile, fs.readFileSync(scanFile, 'utf-8') + 'local edit\n');

    expect(hasProjectConfigDrift(tempDir, CORE_WORKFLOWS, 'both')).toBe(true);
  });

  it('accepts CRLF line endings in an agent command file', () => {
    setupCoreSkills(tempDir);
    setupCoreCommands(tempDir);
    const scanFile = path.join(tempDir, '.claude', 'commands', 'opsx', 'scan.md');
    fs.writeFileSync(scanFile, fs.readFileSync(scanFile, 'utf-8').replace(/\n/g, '\r\n'));

    expect(hasProjectConfigDrift(tempDir, CORE_WORKFLOWS, 'both')).toBe(false);
  });

  it('does not expect agent command files for a skills-only tool', () => {
    setupCodexCoreSkills(tempDir);

    expect(hasToolProfileOrDeliveryDrift(tempDir, 'codex', CORE_WORKFLOWS, 'both')).toBe(false);
  });

  it('does not repeatedly report a divergent legacy Codex copy', () => {
    setupCodexCoreSkills(tempDir);
    const legacySkill = path.join(
      tempDir,
      '.codex',
      'skills',
      'openspec-explore',
      'SKILL.md'
    );
    fs.mkdirSync(path.dirname(legacySkill), { recursive: true });
    fs.writeFileSync(legacySkill, 'user customization\n');

    expect(
      hasToolProfileOrDeliveryDrift(tempDir, 'codex', CORE_WORKFLOWS, 'skills')
    ).toBe(false);
  });
});
