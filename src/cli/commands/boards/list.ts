/**
 * @fileoverview Board list and basic operations command implementation
 * @lastmodified 2025-07-28T12:30:00Z
 *
 * Features: Board listing, show details, use/archive operations
 * Main APIs: registerListCommands() - registers list, show, use, archive commands
 * Constraints: Requires API client, handles board state management
 * Patterns: Filtering options, output formatting, confirmation prompts
 */

import type { Command } from 'commander';
import inquirer from 'inquirer';
import type { CliComponents } from '../../types';
import type { Task, Board } from '../../../types';
import { isSuccessResponse } from '../../api-client-wrapper';
import { extractErrorMessage } from '../../../utils/type-guards';
import {
  withErrorHandling,
  validateBoardsResponse,
  formatOutput,
  showSuccess,
  confirmAction,
} from '../../utils/command-helpers';

interface ListBoardOptions {
  active?: boolean;
  archived?: boolean;
}

interface ShowBoardOptions {
  tasks?: boolean;
  stats?: boolean;
}

interface UpdateBoardOptions {
  name?: string;
  description?: string;
  interactive?: boolean;
}

interface UpdateBoardPromptResult {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

interface DeleteBoardOptions {
  force?: boolean;
}

interface BoardData {
  id: string;
  name: string;
  description?: string | undefined;
  archived: boolean;
  createdAt: string;
  updatedAt?: string | undefined;
  tasks?: Task[] | undefined;
}

/**
 * Register list and basic board management commands
 */
export function registerListCommands(boardCmd: Command): void {
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  /**
   * List all boards with optional filtering.
   *
   * @command list
   * @alias ls
   *
   * @option --active - Show only active (non-archived) boards
   * @option --archived - Show only archived boards
   */
  boardCmd
    .command('list')
    .alias('ls')
    .description('List boards')
    .option('--active', 'show only active boards')
    .option('--archived', 'show only archived boards')
    .action(
      withErrorHandling('list boards', async (options: ListBoardOptions) => {
        const { apiClient } = getComponents();

        const response = await apiClient.getBoards();
        const boards: Board[] = validateBoardsResponse(response);

        // Filter based on options
        let filteredBoards = boards;
        if (options.active) {
          filteredBoards = boards.filter((board: Board) => !board.archived);
        } else if (options.archived) {
          filteredBoards = boards.filter((board: Board) => board.archived);
        }

        formatOutput(filteredBoards, {
          fields: ['id', 'name', 'description', 'archived', 'createdAt'],
          headers: ['ID', 'Name', 'Description', 'Archived', 'Created'],
        });
      })
    );

  /**
   * Show detailed information about a specific board.
   *
   * @command show <id>
   *
   * @param id - The board ID to display
   * @option --tasks - Include all tasks in the board
   * @option --stats - Include board statistics and analytics
   */
  boardCmd
    .command('show <id>')
    .description('Show board details')
    .option('--tasks', 'include tasks in board')
    .option('--stats', 'include board statistics')
    .action(async (id: string, options: ShowBoardOptions): Promise<void> => {
      const { apiClient, formatter } = getComponents();

      try {
        const response = await apiClient.getBoard(id);
        const board = 'data' in response ? (response.data as BoardData) : undefined;

        if (!board) {
          formatter.error(`Board ${String(id)} not found`);
          process.exit(1);
        }

        formatter.output(board);

        if (options.tasks && board.tasks) {
          formatter.info('\n--- Tasks ---');
          formatter.output(board.tasks, {
            fields: ['id', 'title', 'status', 'priority'],
            headers: ['ID', 'Title', 'Status', 'Priority'],
          });
        }

        if (options.stats) {
          formatter.info('\n--- Statistics ---');
          try {
            const statsResponse = await apiClient.getBoardStats(id);
            if ('data' in statsResponse) {
              formatter.output(statsResponse.data);
            } else {
              formatter.warn('No statistics data available');
            }
          } catch (error) {
            formatter.warn('Could not retrieve board statistics');
          }
        }
      } catch (error) {
        formatter.error(`Failed to get board: ${extractErrorMessage(error)}`);
        process.exit(1);
      }
    });

  /**
   * Update board properties
   */
  boardCmd
    .command('update <id>')
    .description('Update a board')
    .option('-n, --name <name>', 'board name')
    .option('-d, --description <desc>', 'board description')
    .option('-i, --interactive', 'interactive mode')
    .action(async (id: string, options: UpdateBoardOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        // Get current board data
        const currentBoard = await apiClient.getBoard(id);
        if (!isSuccessResponse(currentBoard)) {
          formatter.error(`Board ${String(id)} not found`);
          process.exit(1);
        }

        let updates: Record<string, unknown> = {};

        if (options.interactive) {
          const answers = await inquirer.prompt<UpdateBoardPromptResult>([
            {
              type: 'input',
              name: 'name',
              message: 'Board name:',
              default: (currentBoard.data as Board).name,
            },
            {
              type: 'input',
              name: 'description',
              message: 'Board description:',
              default: (currentBoard.data as Board).description ?? '',
            },
          ]);
          updates = answers;
        } else {
          // Use command line options
          if (options.name) updates.name = options.name;
          if (options.description) updates.description = options.description;
        }

        if (Object.keys(updates).length === 0) {
          formatter.warn('No updates specified');
          return;
        }

        const updatedBoard = await apiClient.updateBoard(id, updates);
        formatter.success('Board updated successfully');
        formatter.output(updatedBoard);
      } catch (error) {
        formatter.error(`Failed to update board: ${extractErrorMessage(error)}`);
        process.exit(1);
      }
    });

  /**
   * Delete a board
   */
  boardCmd
    .command('delete <id>')
    .alias('rm')
    .description('Delete a board')
    .option('-f, --force', 'skip confirmation')
    .action(
      withErrorHandling('delete board', async (id: string, options: DeleteBoardOptions) => {
        const { apiClient } = getComponents();

        if (!options.force) {
          const board = await apiClient.getBoard(id);
          if (!isSuccessResponse(board)) {
            throw new Error(`Board ${String(id)} not found`);
          }

          const shouldDelete = await confirmAction(
            `Delete board "${String((board.data as Board).name)}"? This will also delete all tasks in the board.`,
            false
          );

          if (!shouldDelete) {
            formatOutput('Delete cancelled');
            return;
          }
        }

        await apiClient.deleteBoard(id);
        showSuccess(`Board ${String(id)} deleted successfully`);
      })
    );

  /**
   * Set a board as the default for all CLI operations.
   *
   * @command use <id>
   *
   * @param id - The board ID to set as default
   */
  boardCmd
    .command('use <id>')
    .description('Set board as default')
    .action(
      withErrorHandling('set default board', async (id: string) => {
        const { config, apiClient } = getComponents();

        // Verify board exists
        const board = await apiClient.getBoard(id);
        if (!isSuccessResponse(board)) {
          throw new Error(`Board ${String(id)} not found`);
        }

        config.setDefaultBoard(id);
        showSuccess(`Default board set to "${String((board.data as Board).name)}" (${String(id)})`);
      })
    );

  /**
   * Archive a board to hide it from active board lists.
   */
  boardCmd
    .command('archive <id>')
    .description('Archive a board')
    .action(async (id: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        await apiClient.updateBoard(id, { archived: true });
        formatter.success(`Board ${String(id)} archived successfully`);
      } catch (error) {
        formatter.error(`Failed to archive board: ${extractErrorMessage(error)}`);
        process.exit(1);
      }
    });

  /**
   * Restore an archived board
   */
  boardCmd
    .command('unarchive <id>')
    .description('Unarchive a board')
    .action(async (id: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        await apiClient.updateBoard(id, { archived: false });
        formatter.success(`Board ${String(id)} unarchived successfully`);
      } catch (error) {
        formatter.error(`Failed to unarchive board: ${extractErrorMessage(error)}`);
        process.exit(1);
      }
    });
}
