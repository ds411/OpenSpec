/**
 * Agent Commands
 *
 * An agent command is a workflow that OpenSpec writes only as a command file,
 * never as a skill, so nothing about it loads into the agent context until the
 * user runs it. It is not part of a profile, and the delivery setting does not
 * apply to it: each configured tool that supports command files gets it. Tools
 * that support only skills do not.
 */

import path from 'path';
import * as fs from 'fs';
import {
  CommandAdapterRegistry,
  generateCommands,
  type CommandContent,
} from '../command-generation/index.js';
import { resolveCommandSurfaceCapability } from '../command-surface.js';
import { getOpsxScanCommandTemplate } from '../templates/skill-templates.js';
import { FileSystemUtils } from '../../utils/file-system.js';

/**
 * IDs of the agent commands.
 */
export const AGENT_COMMAND_IDS = ['scan'] as const;

export type AgentCommandId = (typeof AGENT_COMMAND_IDS)[number];

/**
 * Gets the tool-agnostic content of every agent command.
 */
export function getAgentCommandContents(): CommandContent[] {
  const all: Array<{ template: ReturnType<typeof getOpsxScanCommandTemplate>; id: AgentCommandId }> = [
    { template: getOpsxScanCommandTemplate(), id: 'scan' },
  ];

  return all.map(({ template, id }) => ({
    id,
    name: template.name,
    description: template.description,
    category: template.category,
    tags: template.tags,
    body: template.content,
    disableModelInvocation: template.disableModelInvocation,
  }));
}

/**
 * True when the tool gets agent command files: it has a command adapter.
 */
// @trace REQ-0369, REQ-0370
export function shouldGenerateAgentCommandsForTool(toolId: string): boolean {
  return resolveCommandSurfaceCapability(toolId) === 'adapter-backed';
}

/**
 * Writes the agent command files for a tool.
 *
 * @returns The number of files written (0 for a tool without command files)
 */
// @trace REQ-0369
export async function writeAgentCommandFiles(projectPath: string, toolId: string): Promise<number> {
  const adapter = CommandAdapterRegistry.get(toolId);
  if (!adapter || !shouldGenerateAgentCommandsForTool(toolId)) return 0;

  const generatedCommands = generateCommands(getAgentCommandContents(), adapter);
  for (const cmd of generatedCommands) {
    const commandFile = FileSystemUtils.resolveProjectArtifactPath(projectPath, cmd.path);
    await FileSystemUtils.writeFile(commandFile, cmd.fileContent);
  }

  return generatedCommands.length;
}

/**
 * Normalizes checkout artifacts that are not real content drift: a UTF-8 BOM and
 * CRLF line endings.
 */
function normalizeCommandContent(content: string): string {
  return content.replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

/**
 * True when an agent command file of the tool is missing or differs from the
 * content this CLI generates.
 */
// @trace REQ-0372
export function hasAgentCommandDrift(projectPath: string, toolId: string): boolean {
  const adapter = CommandAdapterRegistry.get(toolId);
  if (!adapter || !shouldGenerateAgentCommandsForTool(toolId)) return false;

  for (const cmd of generateCommands(getAgentCommandContents(), adapter)) {
    const fullPath = path.isAbsolute(cmd.path) ? cmd.path : path.join(projectPath, cmd.path);
    try {
      if (!fs.existsSync(fullPath)) return true;
      const existing = fs.readFileSync(fullPath, 'utf-8');
      if (normalizeCommandContent(existing) !== normalizeCommandContent(cmd.fileContent)) {
        return true;
      }
    } catch {
      return true;
    }
  }

  return false;
}

/**
 * The note for tools that did not get the agent commands, or null when every
 * tool got them.
 */
// @trace REQ-0370
export function formatAgentCommandSkipNote(toolNames: readonly string[]): string | null {
  if (toolNames.length === 0) return null;
  const ids = AGENT_COMMAND_IDS.map((id) => `'${id}'`).join(', ');
  const noun = AGENT_COMMAND_IDS.length === 1 ? 'command' : 'commands';
  const subject = toolNames.length === 1 ? 'This tool supports' : 'These tools support';
  return `Agent ${noun} ${ids} not written for: ${toolNames.join(', ')}. ${subject} only skills.`;
}
