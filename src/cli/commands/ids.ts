import { Command, Option } from 'commander';
import { COMMAND_REGISTRY } from '../../core/completions/command-registry.js';
import { COMMON_FLAGS } from '../../core/completions/shared-flags.js';
import type { IdsAssignOptions, IdsNextOptions } from '../../commands/ids.js';

function describe(name: string, fallback: string, subcommand?: string): string {
  const entry = COMMAND_REGISTRY.find((command) => command.name === name);
  const found = subcommand ? entry?.subcommands?.find((command) => command.name === subcommand) : entry;
  return found?.description ?? fallback;
}

function hiddenStorePathOption(): Option {
  return new Option('--store-path <path>', 'Removed; register the store and use --store').hideHelp();
}

export function registerIdsCommand(program: Command): void {
  const ids = program
    .command('ids')
    .description(describe('ids', 'Give requirements their IDs'));

  ids
    .command('assign [target]')
    .description(describe('ids', 'Give an ID to every requirement that has none', 'assign'))
    .option('--dry-run', 'Show the IDs without writing them')
    .option('--json', 'Output as JSON')
    .option('--store <id>', COMMON_FLAGS.store.description)
    .addOption(hiddenStorePathOption())
    .action(async (target: string | undefined, options: IdsAssignOptions) => {
      const { idsAssignCommand } = await import('../../commands/ids.js');
      await idsAssignCommand(target, options);
    });

  ids
    .command('next')
    .description(describe('ids', 'Take the next free IDs from the counter', 'next'))
    .option('--count <n>', 'How many IDs to take', '1')
    .option('--json', 'Output as JSON')
    .option('--store <id>', COMMON_FLAGS.store.description)
    .addOption(hiddenStorePathOption())
    .action(async (options: IdsNextOptions) => {
      const { idsNextCommand } = await import('../../commands/ids.js');
      await idsNextCommand(options);
    });
}
