/**
 * Shared Utilities
 *
 * Common code shared between init and update commands.
 */

export {
  SKILL_NAMES,
  type SkillName,
  COMMAND_IDS,
  type CommandId,
  type ToolSkillStatus,
  type ToolVersionStatus,
  getToolsWithSkillsDir,
  getToolSkillStatus,
  getToolStates,
  extractGeneratedByVersion,
  getToolVersionStatus,
  getConfiguredTools,
  getAllToolVersionStatus,
} from './tool-detection.js';

export {
  type SkillTemplateEntry,
  type CommandTemplateEntry,
  getSkillTemplates,
  getCommandTemplates,
  getCommandContents,
  generateSkillContent,
} from './skill-generation.js';

export {
  AGENT_COMMAND_IDS,
  type AgentCommandId,
  getAgentCommandContents,
  shouldGenerateAgentCommandsForTool,
  writeAgentCommandFiles,
  hasAgentCommandDrift,
  formatAgentCommandSkipNote,
} from './agent-commands.js';

export {
  type SkillCapableTool,
  toolSupportsSkills,
  getSkillCapableTools,
  hasGlobalSkillTarget,
  resolveToolSkillsDir,
} from './skill-paths.js';

export {
  type IdeRestartSurface,
  resolveIdeRestartSurface,
  formatIdeRestart,
} from './ide-restart.js';
