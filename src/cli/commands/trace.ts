import { Command } from 'commander';
import type { TraceCheckOptions, TraceCommonOptions } from '../../commands/trace.js';

export function registerTraceCommand(program: Command): Command {
  const traceCommand = program
    .command('trace')
    .description('Check that requirements and @trace comments in code point at each other');

  traceCommand
    .command('check')
    .description('Find requirements with no trace and traces to requirements that do not exist')
    .option('--untraced', 'Only check for requirements with no trace')
    .option('--orphans', 'Only check for traces to requirements that do not exist')
    .option('--json', 'Output as JSON')
    .action(async (options: TraceCheckOptions) => {
      const { traceCheckCommand } = await import('../../commands/trace.js');
      await traceCheckCommand(options);
    });

  traceCommand
    .command('show <requirement-id>')
    .description('List each file and line that traces to a requirement')
    .option('--json', 'Output as JSON')
    .action(async (requirementId: string, options: TraceCommonOptions) => {
      const { traceShowCommand } = await import('../../commands/trace.js');
      await traceShowCommand(requirementId, options);
    });

  traceCommand
    .command('report')
    .description('Show traced and total requirements for each capability')
    .option('--json', 'Output as JSON')
    .action(async (options: TraceCommonOptions) => {
      const { traceReportCommand } = await import('../../commands/trace.js');
      await traceReportCommand(options);
    });

  return traceCommand;
}
