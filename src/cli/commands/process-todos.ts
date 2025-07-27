import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { todoProcessor } from '../utils/todo-processor';

interface ProcessTodosOptions {
  concurrent: boolean;
  maxConcurrent: string;
  groupByPhase: boolean;
  showDependencies: boolean;
  generateReport: boolean;
  dryRun: boolean;
}

export const processTodosCommand = new Command('process-todos')
  .description('Process TODO items with visual feedback')
  .argument('<file>', 'Path to TODO.md file')
  .option('-c, --concurrent', 'Run independent tasks concurrently', false)
  .option('-m, --max-concurrent <number>', 'Maximum concurrent tasks', '5')
  .option('-g, --group-by-phase', 'Group tasks by phase', false)
  .option('-d, --show-dependencies', 'Show task dependencies', false)
  .option('-r, --generate-report', 'Generate implementation report', false)
  .option('--dry-run', 'Simulate execution without making changes', false)
  .action(async (file: string, options: ProcessTodosOptions): Promise<void> => {
    try {
      // Validate file exists
      if (!existsSync(file)) {
        console.error(chalk.red(`Error: File not found: ${file}`));
        process.exit(1);
      }

      console.log(chalk.cyan('\n🚀 Processing TODOs...\n'));

      await todoProcessor.processTodos(file, {
        concurrent: options.concurrent,
        maxConcurrent: parseInt(options.maxConcurrent, 10),
        groupByPhase: options.groupByPhase,
        showDependencies: options.showDependencies,
        generateReport: options.generateReport,
        dryRun: options.dryRun,
      });

      console.log(chalk.green('\n✅ TODO processing complete!\n'));
    } catch (error) {
      console.error(
        chalk.red('\n❌ Error processing TODOs:'),
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });
