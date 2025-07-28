/**
 * @fileoverview Task list command implementation
 * @lastmodified 2025-07-28T10:30:00Z
 * 
 * Features: Task listing with filtering, sorting, and pagination
 * Main APIs: registerListCommand() - registers list subcommand
 * Constraints: Requires apiClient and formatter from global components
 * Patterns: Builder pattern for search params, consistent error handling
 */

import type { Command } from 'commander';
import type { CliComponents } from '../../types';
import { buildSearchTasksParams } from '../../utils/parameter-builder';

/**
 * Register the list command
 */
export function registerListCommand(taskCmd: Command): void {
  const getComponents = (): CliComponents => global.cliComponents;

  taskCmd
    .command('list')
    .alias('ls')
    .description('List tasks')
    .option('-b, --board <board>', 'filter by board')
    .option('-s, --status <status>', 'filter by status')
    .option('-t, --tags <tags>', 'filter by tags (comma-separated)')
    .option('-l, --limit <limit>', 'limit number of results')
    .option('--sort <field>', 'sort by field')
    .option('--order <order>', 'sort order (asc/desc)')
    .action(
      async (options: {
        board?: string;
        status?: string;
        tags?: string;
        limit?: string;
        sort?: string;
        order?: string;
      }) => {
        const { config, apiClient, formatter } = getComponents();

        try {
          const params = buildSearchTasksParams({
            limit: parseInt(options.limit ?? '20', 10),
            sort: options.sort ?? 'createdAt',
            order: options.order ?? 'desc',
            ...(options.board && { board: options.board }),
            ...(!options.board && config.getDefaultBoard() && { board: config.getDefaultBoard()! }),
            ...(options.status && { status: options.status }),
            ...(options.tags && { tags: options.tags }),
          });

          const tasks = await apiClient.getTasks(params);

          if (
            !tasks ||
            !('data' in tasks) ||
            !tasks.data ||
            (Array.isArray(tasks.data) && tasks.data.length === 0)
          ) {
            formatter.info('No tasks found');
            return;
          }

          formatter.output(tasks, {
            fields: ['id', 'title', 'status', 'priority', 'dueDate', 'createdAt'],
            headers: ['ID', 'Title', 'Status', 'Priority', 'Due Date', 'Created'],
          });
        } catch (error) {
          formatter.error(
            `Failed to list tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          process.exit(1);
        }
      }
    );
}