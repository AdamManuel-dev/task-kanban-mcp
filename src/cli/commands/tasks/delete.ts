/**
 * @fileoverview Task delete command implementation
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Task deletion with confirmation prompt
 * Main APIs: registerDeleteCommand() - registers delete subcommand
 * Constraints: Irreversible operation, requires confirmation
 * Patterns: Safety confirmation, force flag bypass
 */

import type { Command } from 'commander';
import inquirer from 'inquirer';
import type { CliComponents } from '../../types';
import type { Task } from '../../../types';
import type { DeleteTaskOptions, ConfirmPromptResult } from './types';
import { isSuccessResponse } from '../../api-client-wrapper';

/**
 * Register the delete command
 */
export function registerDeleteCommand(taskCmd: Command): void {
  const getComponents = (): CliComponents => global.cliComponents;

  taskCmd
    .command('delete <id>')
    .alias('rm')
    .description('Delete a task')
    .option('-f, --force', 'skip confirmation')
    .action(async (id: string, options: DeleteTaskOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          const response = await apiClient.getTask(id);
          if (!isSuccessResponse(response) || !response.data) {
            formatter.error(`Task ${String(id)} not found`);
            process.exit(1);
          }

          const task = response.data as Task;
          const { confirmed } = await inquirer.prompt<ConfirmPromptResult>([
            {
              type: 'confirm',
              name: 'confirmed',
              message: `Delete task "${String(String(task.title))}"?`,
              default: false,
            },
          ]);

          if (!confirmed) {
            formatter.info('Delete cancelled');
            return;
          }
        }

        await apiClient.deleteTask(id);
        formatter.success(`Task ${String(id)} deleted successfully`);
      } catch (error) {
        formatter.error(
          `Failed to delete task: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });
}
