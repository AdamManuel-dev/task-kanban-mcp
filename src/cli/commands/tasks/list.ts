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
import {
  withErrorHandling,
  ensureBoardId,
  validateTasksResponse,
  formatOutput,
  parseLimit,
  parseSortParams,
} from '../../utils/command-helpers';

/**
 * Register the list command
 */
export function registerListCommand(taskCmd: Command): void {
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

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
      withErrorHandling(
        'list tasks',
        async (options: {
          board?: string;
          status?: string;
          tags?: string;
          limit?: string;
          sort?: string;
          order?: string;
        }) => {
          const { apiClient } = getComponents();

          // Use helper functions for parameter processing
          const boardId = options.board ?? ensureBoardId();
          const limit = parseLimit(options.limit);
          const { sort, order } = parseSortParams(options.sort, options.order);

          const params = buildSearchTasksParams({
            limit,
            sort,
            order,
            board: boardId,
            ...(options.status && { status: options.status }),
            ...(options.tags && { tags: options.tags }),
          });

          const tasks = await apiClient.getTasks(params as Record<string, string>);
          const validatedTasks = validateTasksResponse(tasks);

          formatOutput(validatedTasks, {
            fields: ['id', 'title', 'status', 'priority', 'dueDate', 'createdAt'],
            headers: ['ID', 'Title', 'Status', 'Priority', 'Due Date', 'Created'],
          });
        }
      )
    );
}
