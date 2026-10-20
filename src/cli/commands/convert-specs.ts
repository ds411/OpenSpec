import { Command, Option } from 'commander';
import { COMMAND_REGISTRY } from '../../core/completions/command-registry.js';
import { COMMON_FLAGS } from '../../core/completions/shared-flags.js';
import type { ConvertSpecsCommandOptions } from '../../commands/convert-specs.js';

export function registerConvertSpecsCommand(program: Command): void {
  program
    .command('convert-specs')
    .description(COMMAND_REGISTRY.find((entry) => entry.name === 'convert-specs')?.description ??
        'Convert markdown specs to Gherkin feature files with requirement IDs')
    .option('--dry-run', 'Show what would change without writing files')
    .option('--keep', 'Keep the markdown files after conversion')
    .option('--json', 'Output as JSON')
    .option('--store <id>', COMMON_FLAGS.store.description)
    .addOption(
      new Option('--store-path <path>', 'Removed; register the store and use --store').hideHelp()
    )
    .action(async (options: ConvertSpecsCommandOptions) => {
      const { convertSpecsCommand } = await import('../../commands/convert-specs.js');
      await convertSpecsCommand(options);
    });
}
