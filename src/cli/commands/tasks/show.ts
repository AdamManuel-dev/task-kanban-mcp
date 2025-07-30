/**
 * @fileoverview Task show command implementation
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Display detailed task information with optional AI context
 * Main APIs: registerShowCommand() - registers show subcommand
 * Constraints: Requires apiClient for task retrieval
 * Patterns: Optional AI context, graceful error handling
 */

import type { Command } from 'commander';
import type { CliComponents } from '../../types';
import type { ShowTaskOptions } from './types';
import { isSuccessResponse } from '../../api-client-wrapper';

/**
 * Register the show command
 */
export function registerShowCommand(taskCmd: Command): void {
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  taskCmd
    .command('show <id>')
    .description('Show task details')
    .option('--context', 'include AI context')
    .action(async (id: string, options: ShowTaskOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const taskResponse = await apiClient.getTask(id);

        if (!isSuccessResponse(taskResponse)) {
          formatter.error(`Task ${String(id)} not found`);
          process.exit(1);
        }

        formatter.output(taskResponse.data);

        if (options.context) {
          formatter.info('Getting AI context...');
          try {
            const context = await apiClient.getTaskContext(id);
            formatter.info('\n--- AI Context ---');
            formatter.output(context);
          } catch (error) {
            formatter.warn('Could not retrieve AI context');
          }
        }
      } catch (error) {
        formatter.error(
          `Failed to get task: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}
