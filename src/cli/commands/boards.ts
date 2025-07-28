/**
 * @module cli/commands/boards
 * @description Board management commands for the CLI.
 *
 * Provides comprehensive board operations including creating, updating, listing,
 * archiving, and viewing boards. Supports interactive board setup with templates
 * and real-time board visualization.
 *
 * @example
 * ```bash
 * # List all boards
 * kanban board list
 *
 * # Create a board interactively
 * kanban board create --interactive
 *
 * # Quick setup with template
 * kanban board quick-setup --template scrum --name "Dev Sprint"
 *
 * # View board in interactive mode
 * kanban board view board123
 *
 * # Set default board
 * kanban board use board123
 * ```
 */

import type { Command } from 'commander';
import inquirer from 'inquirer';
import * as React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import type { CliComponents, CreateBoardRequest } from '../types';
import type { Task, Board, Column } from '../../types';
import { isSuccessResponse } from '../api-client-wrapper';
import BoardView from '../ui/components/BoardView';
import { SpinnerManager } from '../utils/spinner';
import { logger } from '../../utils/logger';

interface ListBoardOptions {
  active?: boolean;
  archived?: boolean;
}

interface ShowBoardOptions {
  tasks?: boolean;
  stats?: boolean;
}

interface BoardData {
  id: string;
  name: string;
  description?: string | undefined;
  archived: boolean;
  createdAt: string;
  updatedAt?: string | undefined;
  columns?: Column[] | undefined;
  tasks?: Task[] | undefined;
}

interface ApiColumnData {
  id: string;
  name: string;
  wip_limit?: number;
  tasks?: ApiTaskData[];
}

interface ApiTaskData {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  tags?: string[];
  due_date?: string;
}

interface ApiBoardResponse {
  id: string;
  name: string;
  description?: string;
  columns?: ApiColumnData[];
}

interface ViewBoardOptions {
  interactive?: boolean;
  wipLimits?: boolean;
  refresh?: string;
  maxHeight?: string;
  columnWidth?: string;
}

interface CreateBoardData {
  name?: string;
  description?: string;
  useAsDefault?: boolean;
}

interface CreateBoardOptions {
  name?: string;
  description?: string;
  interactive?: boolean;
}

interface CreateBoardPromptResult {
  name?: string;
  description?: string;
  useAsDefault?: boolean;
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

interface ConfirmPromptResult {
  confirm: boolean;
}

interface QuickSetupOptions {
  name?: string;
  description?: string;
  template?: string;
  public?: boolean;
  setDefault?: boolean;
}

interface QuickSetupDefaults {
  name?: string;
  description?: string;
  isPublic?: boolean;
  columns?: Array<{ name: string; order: number }>;
}

/**
 * Register all board-related commands with the CLI program.
 *
 * @param program - The commander program instance
 *
 * Available commands:
 * - `list` (alias: `ls`) - List boards with filtering
 * - `show <id>` - Display board details and statistics
 * - `view [id]` - Interactive board visualization
 * - `create` (alias: `new`) - Create a new board
 * - `update <id>` - Update board properties
 * - `delete <id>` (alias: `rm`) - Delete a board
 * - `use <id>` - Set board as default
 * - `archive <id>` - Archive a board
 * - `unarchive <id>` - Restore archived board
 * - `quick-setup` (alias: `setup`) - Quick board setup with templates
 */
export function registerBoardCommands(program: Command): void {
  const boardCmd = program.command('board').alias('b').description('Manage boards');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

  /**
   * List all boards with optional filtering.
   *
   * @command list
   * @alias ls
   *
   * @option --active - Show only active (non-archived) boards
   * @option --archived - Show only archived boards
   *
   * @example
   * ```bash
   * # List all boards
   * kanban board list
   *
   * # List only active boards
   * kanban board list --active
   *
   * # List archived boards
   * kanban board list --archived
   * ```
   *
   * Output columns:
   * - ID: Board identifier
   * - Name: Board name
   * - Description: Board description
   * - Archived: Archive status
   * - Created: Creation timestamp
   */
  boardCmd
    .command('list')
    .alias('ls')
    .description('List boards')
    .option('--active', 'show only active boards')
    .option('--archived', 'show only archived boards')
    .action(async (options: ListBoardOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const response = await apiClient.getBoards();
        const boards = 'data' in response ? (response.data as BoardData[]) : [];

        if (!boards || boards.length === 0) {
          formatter.info('No boards found');
          return;
        }

        // Filter based on options
        let filteredBoards = boards;
        if (options.active) {
          filteredBoards = boards.filter((board: BoardData) => !board.archived);
        } else if (options.archived) {
          filteredBoards = boards.filter((board: BoardData) => board.archived);
        }

        formatter.output(filteredBoards, {
          fields: ['id', 'name', 'description', 'archived', 'createdAt'],
          headers: ['ID', 'Name', 'Description', 'Archived', 'Created'],
        });
      } catch (error) {
        formatter.error(
          `Failed to list boards: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  /**
   * Show detailed information about a specific board.
   *
   * @command show <id>
   *
   * @param id - The board ID to display
   * @option --tasks - Include all tasks in the board
   * @option --stats - Include board statistics and analytics
   *
   * @example
   * ```bash
   * # Show basic board details
   * kanban board show board123
   *
   * # Show board with tasks
   * kanban board show board123 --tasks
   *
   * # Show board with statistics
   * kanban board show board123 --stats
   * ```
   *
   * Statistics include:
   * - Total tasks by status
   * - Task completion rate
   * - Average task age
   * - Overdue task count
   * - Team productivity metrics
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
        formatter.error(
          `Failed to get board: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  /**
   * Interactive board view with real-time updates.
   *
   * @command view [id]
   *
   * @param id - Board ID (uses default board if not specified)
   * @option -i, --interactive - Enable interactive mode (default: true)
   * @option --no-interactive - Disable interactive mode
   * @option --wip-limits - Show Work-In-Progress limits (default: true)
   * @option --refresh <seconds> - Auto-refresh interval in seconds (default: 30)
   * @option --max-height <number> - Maximum tasks shown per column (default: 8)
   * @option --column-width <number> - Column display width (default: 25)
   *
   * @example
   * ```bash
   * # View default board interactively
   * kanban board view
   *
   * # View specific board with custom refresh
   * kanban board view board123 --refresh 10
   *
   * # Non-interactive view (static display)
   * kanban board view board123 --no-interactive
   * ```
   *
   * Interactive controls:
   * - ←/→ or h/l: Switch columns
   * - ↑/↓ or j/k: Navigate tasks
   * - Enter: Select task/column
   * - r: Manual refresh
   * - n: New task in column
   * - e: Edit selected task
   * - d: Delete selected task
   * - ?: Show help
   * - q: Quit
   *
   * @note Interactive mode is temporarily disabled pending Ink/React ESM resolution
   */
  boardCmd
    .command('view [id]')
    .description('Interactive board view with live updates')
    .option('-i, --interactive', 'enable interactive mode (default)', true)
    .option('--no-interactive', 'disable interactive mode')
    .option('--wip-limits', 'show WIP limits', true)
    .option('--refresh <seconds>', 'auto-refresh interval', '30')
    .option('--max-height <number>', 'maximum column height', '8')
    .option('--column-width <number>', 'column width', '25')
    .action(async (id?: string, options?: ViewBoardOptions): Promise<void> => {
      const { config, apiClient, formatter } = getComponents();

      try {
        // Determine board ID
        const boardId = id ?? config.getDefaultBoard();
        if (!boardId) {
          formatter.error(
            'Board ID is required. Specify an ID or set default board with "kanban board use <id>"'
          );
          process.exit(1);
        }

        // Fetch board data with spinner
        const spinner = new SpinnerManager();
        const boardData = await spinner.withSpinner(
          `Loading board: ${String(boardId)}`,
          apiClient.getBoard(boardId),
          {
            successText: 'Board loaded successfully',
            failText: 'Failed to load board',
          }
        );

        if (!boardData) {
          formatter.error(`Board ${String(boardId)} not found`);
          process.exit(1);
        }

        // Transform API data to component format
        const apiResponse = boardData as ApiBoardResponse;
        const board: Board = {
          id: apiResponse.id,
          name: apiResponse.name,
          description: apiResponse.description,
          color: '#007acc',
          created_at: new Date(),
          updated_at: new Date(),
          archived: false,
        };

        if (!options?.interactive) {
          // Non-interactive mode - just show board data
          formatter.output(board);
          return;
        }

        // Interactive mode with React component
        spinner.info(`Starting interactive board view for: ${board.name}`);

        let refreshInterval: NodeJS.Timeout | null = null;
        let shouldRefresh = false;

        const InteractiveBoardView = (): React.ReactElement => {
          const [currentBoard, setCurrentBoard] = React.useState<BoardData>({
            id: board.id,
            name: board.name,
            description: board.description || undefined,
            archived: board.archived,
            createdAt: board.created_at.toISOString(),
            updatedAt: board.updated_at.toISOString(),
            columns: [],
            tasks: []
          });

          // Auto-refresh functionality
          React.useEffect(() => {
            if (options?.refresh && parseInt(options.refresh, 10) > 0) {
              const interval = parseInt(options.refresh, 10) * 1000;
              refreshInterval = setInterval(() => {
                if (!shouldRefresh) return;

                (async (): Promise<void> => {
                  try {
                    const refreshedData = await apiClient.getBoard(boardId);
                    if (refreshedData) {
                      const refreshedApiResponse = refreshedData as ApiBoardResponse;
                      const refreshedBoard: Board = {
                        id: refreshedApiResponse.id,
                        name: refreshedApiResponse.name,
                        description: refreshedApiResponse.description,
                        color: '#2196F3', // Default color
                        created_at: new Date(),
                        updated_at: new Date(),
                        archived: false,
                      };

                      // Process refreshed board data with proper typing
                      const boardWithContent: BoardData = {
                        id: refreshedBoard.id,
                        name: refreshedBoard.name,
                        description: refreshedBoard.description || undefined,
                        archived: refreshedBoard.archived,
                        createdAt: refreshedBoard.created_at.toISOString(),
                        updatedAt: refreshedBoard.updated_at.toISOString(),
                        columns: (refreshedApiResponse.columns || []) as Column[],
                        tasks: [],
                      };
                      setCurrentBoard(boardWithContent);
                    }
                  } catch (error) {
                    // Silently fail refresh
                  }
                })().catch((err: Error) => {
                  logger.error('Auto-refresh failed', { error: err.message });
                });
              }, interval);
            }

            return () => {
              if (refreshInterval) {
                clearInterval(refreshInterval);
              }
            };
          }, []);

          // Enable refresh after initial render
          React.useEffect(() => {
            shouldRefresh = true;
          }, []);

          const boardForView: Board = {
            id: currentBoard.id,
            name: currentBoard.name,
            description: currentBoard.description,
            color: '#2196F3',
            created_at: new Date(currentBoard.createdAt),
            updated_at: new Date(currentBoard.updatedAt || currentBoard.createdAt),
            archived: currentBoard.archived
          };

          return React.createElement(BoardView, {
            board: boardForView,
            columns: currentBoard.columns || [],
            tasks: currentBoard.tasks || [],
            showDetails: false,
          });
        };

        // Show loading indicator and instructions
        formatter.info(`Starting interactive board view for: ${String(board.name)}`);
        formatter.info('Press ? for help, q to quit');

        // Render the interactive board view
        render(React.createElement(InteractiveBoardView));
      } catch (error) {
        formatter.error(
          `Failed to start board view: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  /**
   * Create a new board.
   *
   * @command create
   * @alias new
   *
   * @option -n, --name <name> - Board name (required in non-interactive mode)
   * @option -d, --description <desc> - Board description
   * @option -i, --interactive - Use interactive prompts
   *
   * @example
   * ```bash
   * # Create board with options
   * kanban board create --name "Q4 Sprint" --description "Fourth quarter development"
   *
   * # Create board interactively
   * kanban board create --interactive
   * ```
   *
   * Interactive mode prompts:
   * - Board name (required)
   * - Description (optional)
   * - Set as default board
   */
  boardCmd
    .command('create')
    .alias('new')
    .description('Create a new board')
    .option('-n, --name <name>', 'board name')
    .option('-d, --description <desc>', 'board description')
    .option('-i, --interactive', 'interactive mode')
    .action(async (options: CreateBoardOptions) => {
      const { config, apiClient, formatter } = getComponents();

      let boardData: CreateBoardData = {};

      if (options.interactive ?? !options.name) {
        const questions: Array<{
          type: string;
          name: string;
          message: string;
          validate?: (input: string) => boolean | string;
          default?: boolean;
        }> = [];

        if (!options.name) {
          questions.push({
            type: 'input',
            name: 'name',
            message: 'Board name:',
            validate: (input: string) => input.length > 0 || 'Name is required',
          });
        }

        if (!options.description) {
          questions.push({
            type: 'input',
            name: 'description',
            message: 'Board description (optional):',
          });
        }

        questions.push({
          type: 'confirm',
          name: 'useAsDefault',
          message: 'Set as default board?',
          default: false,
        });

        const answers = await inquirer.prompt<CreateBoardPromptResult>(questions);
        const { useAsDefault, ...restAnswers } = answers;
        boardData = { ...boardData, ...restAnswers, useAsDefault: useAsDefault ?? false };
      }

      // Use command line options or answers
      if (options.name !== undefined) boardData.name = options.name;
      if (options.description !== undefined) boardData.description = options.description;

      try {
        const { useAsDefault: _useAsDefault, ...createData } = boardData;
        const board = await apiClient.createBoard(createData as CreateBoardRequest);
        if (isSuccessResponse(board)) {
          formatter.success(`Board created successfully: ${String(board.data.id)}`);
          formatter.output(board.data);

          // Set as default if requested from interactive prompt
          if (boardData.useAsDefault) {
            config.setDefaultBoard(board.data.id);
            formatter.info(`Set as default board`);
          }
        } else {
          formatter.error('Failed to create board');
          process.exit(1);
        }
      } catch (error) {
        formatter.error(
          `Failed to create board: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

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
        formatter.error(
          `Failed to update board: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  boardCmd
    .command('delete <id>')
    .alias('rm')
    .description('Delete a board')
    .option('-f, --force', 'skip confirmation')
    .action(async (id: string, options: DeleteBoardOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          const board = await apiClient.getBoard(id);
          if (!isSuccessResponse(board)) {
            formatter.error(`Board ${String(id)} not found`);
            process.exit(1);
          }

          const { confirm } = await inquirer.prompt<ConfirmPromptResult>([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete board "${String((board.data as Board).name)}"? This will also delete all tasks in the board.`,
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Delete cancelled');
            return;
          }
        }

        await apiClient.deleteBoard(id);
        formatter.success(`Board ${String(id)} deleted successfully`);
      } catch (error) {
        formatter.error(
          `Failed to delete board: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  /**
   * Set a board as the default for all CLI operations.
   *
   * @command use <id>
   *
   * @param id - The board ID to set as default
   *
   * @example
   * ```bash
   * # Set default board
   * kanban board use board123
   *
   * # Now all task operations use this board by default
   * kanban task list  # Lists tasks from board123
   * ```
   */
  boardCmd
    .command('use <id>')
    .description('Set board as default')
    .action(async (id: string) => {
      const { config, apiClient, formatter } = getComponents();

      try {
        // Verify board exists
        const board = await apiClient.getBoard(id);
        if (!isSuccessResponse(board)) {
          formatter.error(`Board ${String(id)} not found`);
          process.exit(1);
        }

        config.setDefaultBoard(id);
        formatter.success(
          `Default board set to "${String(String((board.data as Board).name))}" (${String(id)})`
        );
      } catch (error) {
        formatter.error(
          `Failed to set default board: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  /**
   * Archive a board to hide it from active board lists.
   *
   * @command archive <id>
   *
   * @param id - The board ID to archive
   *
   * @example
   * ```bash
   * kanban board archive board123
   * ```
   *
   * @note Archived boards can be restored using the `unarchive` command.
   * Tasks within archived boards remain accessible.
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
        formatter.error(
          `Failed to archive board: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  boardCmd
    .command('unarchive <id>')
    .description('Unarchive a board')
    .action(async (id: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        await apiClient.updateBoard(id, { archived: false });
        formatter.success(`Board ${String(id)} unarchived successfully`);
      } catch (error) {
        formatter.error(
          `Failed to unarchive board: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  /**
   * Quick board setup with pre-configured templates.
   *
   * @command quick-setup
   * @alias setup
   *
   * @option -n, --name <name> - Board name
   * @option -d, --description <desc> - Board description
   * @option --template <type> - Template type: basic, scrum, bugs, content
   * @option --public - Make board publicly accessible
   * @option --set-default - Automatically set as default board
   *
   * @example
   * ```bash
   * # Interactive setup
   * kanban board quick-setup
   *
   * # Use Scrum template
   * kanban board quick-setup --template scrum --name "Sprint Board"
   *
   * # Quick setup with all options
   * kanban board quick-setup --template bugs --name "Bug Tracker" --public --set-default
   * ```
   *
   * Available templates:
   * - **basic**: To Do → In Progress → Done
   * - **scrum**: Backlog → To Do → In Progress → Review → Done
   * - **bugs**: New → Confirmed → In Progress → Testing → Resolved
   * - **content**: Ideas → Writing → Editing → Review → Published
   *
   * After creation:
   * - View board: `kanban board view <id>`
   * - Create task: `kanban task create --interactive`
   * - List tasks: `kanban task list`
   */
  boardCmd
    .command('quick-setup')
    .alias('setup')
    .description('Quick interactive board setup with templates')
    .option('-n, --name <name>', 'board name')
    .option('-d, --description <desc>', 'board description')
    .option('--template <type>', 'use template (basic, scrum, bugs, content)')
    .option('--public', 'make board public')
    .option('--set-default', 'set as default board after creation')
    .action(async (options: QuickSetupOptions) => {
      const { config, apiClient, formatter } = getComponents();

      try {
        // Import the quick setup function
        const { quickBoardSetup, confirmAction } = await import('../prompts/board-prompts');

        // Prepare defaults from command line options
        const defaults: QuickSetupDefaults = {};
        if (options.name) defaults.name = options.name;
        if (options.description) defaults.description = options.description;
        if (options.public) defaults.isPublic = true;

        // If template is specified, we'll handle it differently
        if (options.template) {
          const templates = {
            basic: [
              { name: 'To Do', order: 0 },
              { name: 'In Progress', order: 1 },
              { name: 'Done', order: 2 },
            ],
            scrum: [
              { name: 'Backlog', order: 0 },
              { name: 'To Do', order: 1 },
              { name: 'In Progress', order: 2 },
              { name: 'Review', order: 3 },
              { name: 'Done', order: 4 },
            ],
            bugs: [
              { name: 'New', order: 0 },
              { name: 'Confirmed', order: 1 },
              { name: 'In Progress', order: 2 },
              { name: 'Testing', order: 3 },
              { name: 'Resolved', order: 4 },
            ],
            content: [
              { name: 'Ideas', order: 0 },
              { name: 'Writing', order: 1 },
              { name: 'Editing', order: 2 },
              { name: 'Review', order: 3 },
              { name: 'Published', order: 4 },
            ],
          };

          const templateKey = options.template as keyof typeof templates;
          if (!templates[templateKey]) {
            formatter.error(
              `Invalid template: ${String(String(options.template))}. Available: ${String(String(Object.keys(templates).join(', ')))}`
            );
            process.exit(1);
          }

          defaults.columns = templates[templateKey];
        }

        formatter.info('Starting quick board setup...');

        // Run the interactive setup
        const boardData = await quickBoardSetup(defaults);

        // Show confirmation if not using command line options
        if (!options.name || !options.template) {
          const confirmed = await confirmAction('Create board with these settings?', true);

          if (!confirmed) {
            formatter.warn('Board creation cancelled');
            return;
          }
        }

        // Transform data for API
        const createData: CreateBoardRequest = {
          name: boardData.name,
          ...(boardData.description && { description: boardData.description }),
          columns: boardData.columns.map(col => ({
            name: col.name,
            position: col.order,
          })),
        };

        // Create the board with spinner
        const spinner = new SpinnerManager();
        const board = await spinner.withSpinner(
          `Creating board: ${String(String(boardData.name))}`,
          apiClient.createBoard(createData),
          {
            successText: 'Board created successfully! 🎉',
            failText: 'Failed to create board',
          }
        );

        if (isSuccessResponse(board)) {
          formatter.success(
            `Board "${String(String(boardData.name))}" created with ID: ${String(board.data.id)}`
          );
        } else {
          formatter.error('Failed to create board');
          process.exit(1);
        }

        // Show board details
        formatter.info('\n📊 Board Summary:');
        formatter.info(`Name: ${String(String(chalk.bold(boardData.name)))}`);
        if (boardData.description) {
          formatter.info(`Description: ${String(String(boardData.description))}`);
        }
        formatter.info(`Visibility: ${String(String(boardData.isPublic ? 'Public' : 'Private'))}`);
        formatter.info(
          `Columns: ${String(String(boardData.columns.map(c => c.name).join(' → ')))}`
        );

        // Set as default if requested
        if (options.setDefault && isSuccessResponse(board)) {
          config.setDefaultBoard(board.data.id);
          formatter.success('Set as default board');
        } else if (!options.setDefault && isSuccessResponse(board)) {
          // Ask if they want to set it as default
          const setAsDefault = await confirmAction('Set this board as your default?', false);

          if (setAsDefault) {
            config.setDefaultBoard(board.data.id);
            formatter.success('Set as default board');
          }
        }

        // Offer quick actions
        if (isSuccessResponse(board)) {
          formatter.info('\n💡 Quick Actions:');
          formatter.info(`  View board: kanban board view ${String(board.data.id)}`);
          formatter.info(`  Create task: kanban task create --interactive`);
          formatter.info(`  List tasks: kanban task list`);

          formatter.output(board.data);
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'Board setup cancelled') {
          formatter.warn('Board setup cancelled');
          return;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        formatter.error(`Failed to setup board: ${String(errorMessage)}`);
        process.exit(1);
      }
    });
}
