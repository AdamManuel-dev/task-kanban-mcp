import { Command } from 'commander';
import { existsSync } from 'fs';
import { logger } from '@/utils/logger';
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
        logger.error(`Error: File not found: ${String(file)}`);
        process.exit(1);
      }

      logger.info('\n🚀 Processing TODOs...\n');

      await todoProcessor.process(file, {
        concurrent: options.concurrent,
        maxConcurrent: parseInt(options.maxConcurrent, 10),
        groupByPhase: options.groupByPhase,
        showDependencies: options.showDependencies,
        generateReport: options.generateReport,
        dryRun: options.dryRun,
      });

      logger.info('\n✅ TODO processing complete!\n');
    } catch (error) {
      logger.error(
        '\n❌ Error processing TODOs:',
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });
