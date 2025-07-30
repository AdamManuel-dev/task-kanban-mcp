/**
 * @fileoverview Task move command implementation
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Move tasks between columns with position control
 * Main APIs: registerMoveCommand() - registers move subcommand
 * Constraints: Requires valid column ID, optional position
 * Patterns: Simple parameter validation, success feedback
 */

import type { Command } from 'commander';
import type { CliComponents } from '../../types';
import type { MoveTaskOptions } from './types';

/**
 * Register the move command
 */
export function registerMoveCommand(taskCmd: Command): void {
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  taskCmd
    .command('move <id> <column>')
    .description('Move task to different column')
    .option('-p, --position <number>', 'position in column')
    .action(async (id: string, columnId: string, options: MoveTaskOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const position = options.position ? parseInt(options.position, 10) : undefined;
        await apiClient.moveTask(id, columnId, position);
        formatter.success(`Task ${String(id)} moved to column ${String(columnId)}`);
      } catch (error) {
        formatter.error(
          `Failed to move task: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });
}
