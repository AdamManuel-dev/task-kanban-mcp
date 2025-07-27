import type { Command } from 'commander';
import inquirer from 'inquirer';
// import * as React from 'react';
// import { render } from 'ink';
import chalk from 'chalk';
import type { CliComponents } from '../types';
import type { Task, Board, Column } from '../../types';
// import { BoardView } from '../ui/components/BoardView';
// import type { Board, Column } from '../ui/components/BoardView';
// import type { Task } from '../ui/components/TaskList';
import { spinner } from '../utils/spinner';

interface ListBoardOptions {
  active?: boolean;
  archived?: boolean;
}

interface CreateBoardOptions {
  description?: string;
  template?: string;
}

interface ShowBoardOptions {
  tasks?: boolean;
  stats?: boolean;
}

interface UpdateBoardOptions {
  name?: string;
  description?: string;
}

interface BoardData {
  id: string;
  name: string;
  description?: string;
  archived: boolean;
  createdAt: string;
  updatedAt?: string;
  columns?: Column[];
  tasks?: Task[];
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

interface QuickSetupDefaults {
  name?: string;
  description?: string;
  isPublic?: boolean;
  columns?: Array<{ name: string; order: number }>;
}

interface BoardSetupData {
  name: string;
  description?: string;
  isPublic: boolean;
  columns: Array<{ name: string; order: number }>;
}

export function registerBoardCommands(program: Command): void {
  const boardCmd = program.command('board').alias('b').description('Manage boards');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

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
        const boards = response.data as BoardData[];

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
          `Failed to list boards: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  boardCmd
    .command('show <id>')
    .description('Show board details')
    .option('--tasks', 'include tasks in board')
    .option('--stats', 'include board statistics')
    .action(async (id: string, options: ShowBoardOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const response = await apiClient.getBoard(id);
        const board = response.data as BoardData;

        if (!board) {
          formatter.error(`Board ${id} not found`);
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
            formatter.output(statsResponse.data);
          } catch (error) {
            formatter.warn('Could not retrieve board statistics');
          }
        }
      } catch (error) {
        formatter.error(
          `Failed to get board: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  boardCmd
    .command('view [id]')
    .description('Interactive board view with live updates')
    .option('-i, --interactive', 'enable interactive mode (default)', true)
    .option('--no-interactive', 'disable interactive mode')
    .option('--wip-limits', 'show WIP limits', true)
    .option('--refresh <seconds>', 'auto-refresh interval', '30')
    .option('--max-height <number>', 'maximum column height', '8')
    .option('--column-width <number>', 'column width', '25')
    .action(async (id?: string, options?: ViewBoardOptions) => {
      const { config, apiClient, formatter } = getComponents();

      try {
        // Determine board ID
        const boardId = id || config.getDefaultBoard();
        if (!boardId) {
          formatter.error(
            'Board ID is required. Specify an ID or set default board with "kanban board use <id>"'
          );
          process.exit(1);
        }

        // Fetch board data with spinner
        const boardData = await spinner.withSpinner(
          `Loading board: ${boardId}`,
          apiClient.getBoard(boardId),
          {
            successText: 'Board loaded successfully',
            failText: 'Failed to load board',
          }
        );

        if (!boardData) {
          formatter.error(`Board ${boardId} not found`);
          process.exit(1);
        }

        // Transform API data to component format
        const apiResponse = boardData as ApiBoardResponse;
        const board: Board = {
          id: apiResponse.id,
          name: apiResponse.name,
          description: apiResponse.description,
          columns: (apiResponse.columns || []).map(
            (col: ApiColumnData): Column => ({
              id: col.id,
              name: col.name,
              limit: col.wip_limit,
              tasks: (col.tasks || []).map(
                (task: ApiTaskData): Task => ({
                  id: task.id,
                  title: task.title,
                  status: task.status,
                  priority: task.priority,
                  assignee: task.assignee,
                  tags: task.tags,
                  due_date: task.due_date,
                })
              ),
            })
          ),
        };

        if (!options?.interactive) {
          // Non-interactive mode - just show board data
          formatter.output(board);
          return;
        }

        // Interactive mode with React component - temporarily disabled
        formatter.info('Interactive board view temporarily disabled');
        formatter.output(board);

        /*
        let refreshInterval: NodeJS.Timeout | null = null;
        let shouldRefresh = false;

        const InteractiveBoardView = () => {
          const [currentBoard, setCurrentBoard] = React.useState<Board>(board);
          const [isLoading, setIsLoading] = React.useState(false);

          // Auto-refresh functionality
          React.useEffect(() => {
            if (options?.refresh && parseInt(options.refresh) > 0) {
              const interval = parseInt(options.refresh) * 1000;
              refreshInterval = setInterval(async () => {
                if (!shouldRefresh) return;

                setIsLoading(true);
                try {
                  const refreshedData = await apiClient.getBoard(boardId);
                  if (refreshedData) {
                    const apiResponse = refreshedData as ApiBoardResponse;
                    const refreshedBoard: Board = {
                      id: apiResponse.id,
                      name: apiResponse.name,
                      description: apiResponse.description,
                      columns: (apiResponse.columns || []).map(
                        (col: ApiColumnData): Column => ({
                          id: col.id,
                          name: col.name,
                          limit: col.wip_limit,
                          tasks: (col.tasks || []).map(
                            (task: ApiTaskData): Task => ({
                              id: task.id,
                              title: task.title,
                              status: task.status,
                              priority: task.priority,
                              assignee: task.assignee,
                              tags: task.tags,
                              due_date: task.due_date,
                            })
                          ),
                        })
                      ),
                    };
                    setCurrentBoard(refreshedBoard);
                  }
                } catch (error) {
                  // Silently fail refresh
                } finally {
                  setIsLoading(false);
                }
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

          return React.createElement(BoardView, {
            board: currentBoard,
            showWIPLimits: options?.wipLimits,
            maxColumnHeight: parseInt(options?.maxHeight || '8'),
            columnWidth: parseInt(options?.columnWidth || '25'),
            onTaskSelect: async (task, _columnId) => {
              try {
                // Show task details
                formatter.info(`\nTask: ${task.title}`);
                formatter.info(`Status: ${task.status}`);
                formatter.info(`Priority: ${task.priority || 'None'}`);
                if (task.assignee) formatter.info(`Assignee: ${task.assignee}`);
                if (task.tags?.length) formatter.info(`Tags: ${task.tags.join(', ')}`);
                if (task.due_date) formatter.info(`Due: ${task.due_date}`);
              } catch (error) {
                // Handle task selection error
              }
            },
            onColumnSelect: async column => {
              try {
                formatter.info(`\nColumn: ${column.name}`);
                formatter.info(`Tasks: ${column.tasks.length}`);
                if (column.limit) formatter.info(`WIP Limit: ${column.limit}`);
              } catch (error) {
                // Handle column selection error
              }
            },
            onKeyPress: async (key, context) => {
              switch (key) {
                case 'r':
                  // Manual refresh
                  setIsLoading(true);
                  try {
                    const refreshedData = await apiClient.getBoard(boardId);
                    if (refreshedData) {
                      const apiResponse = refreshedData as ApiBoardResponse;
                      const refreshedBoard: Board = {
                        id: apiResponse.id,
                        name: apiResponse.name,
                        description: apiResponse.description,
                        columns: (apiResponse.columns || []).map(
                          (col: ApiColumnData): Column => ({
                            id: col.id,
                            name: col.name,
                            limit: col.wip_limit,
                            tasks: (col.tasks || []).map(
                              (task: ApiTaskData): Task => ({
                                id: task.id,
                                title: task.title,
                                status: task.status,
                                priority: task.priority,
                                assignee: task.assignee,
                                tags: task.tags,
                                due_date: task.due_date,
                              })
                            ),
                          })
                        ),
                      };
                      setCurrentBoard(refreshedBoard);
                    }
                  } catch (error) {
                    // Handle refresh error
                  } finally {
                    setIsLoading(false);
                  }
                  break;
                case 'n':
                  // Create new task in selected column
                  if (context.selectedColumn) {
                    formatter.info(`\nCreate new task in column: ${context.selectedColumn.name}`);
                  }
                  break;
                case 'e':
                  // Edit selected task
                  if (context.selectedTask) {
                    formatter.info(`\nEdit task: ${context.selectedTask.title}`);
                  }
                  break;
                case 'd':
                  // Delete selected task
                  if (context.selectedTask) {
                    formatter.info(`\nDelete task: ${context.selectedTask.title}`);
                  }
                  break;
                case '?':
                  // Show help
                  formatter.info('\nKeyboard shortcuts:');
                  formatter.info('  ←/→ or h/l: Switch columns');
                  formatter.info('  ↑/↓ or j/k: Navigate tasks');
                  formatter.info('  Enter: Select task/column');
                  formatter.info('  r: Refresh board');
                  formatter.info('  n: New task in column');
                  formatter.info('  e: Edit selected task');
                  formatter.info('  d: Delete selected task');
                  formatter.info('  ?: Show this help');
                  formatter.info('  q: Quit');
                  break;
                default:
                  // Handle unknown key
                  break;
              }
            },
          });
        };

        // Show loading indicator and instructions
        formatter.info(`Starting interactive board view for: ${board.name}`);
        formatter.info('Press ? for help, q to quit');

        // Render the interactive board view
        render(React.createElement(InteractiveBoardView));
        */
      } catch (error) {
        formatter.error(
          `Failed to start board view: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  boardCmd
    .command('create')
    .alias('new')
    .description('Create a new board')
    .option('-n, --name <name>', 'board name')
    .option('-d, --description <desc>', 'board description')
    .option('-i, --interactive', 'interactive mode')
    .action(async options => {
      const { config, apiClient, formatter } = getComponents();

      let boardData: CreateBoardData = {};

      if (options.interactive || !options.name) {
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

        const answers = await inquirer.prompt(questions);
        boardData = { ...boardData, ...answers };
      }

      // Use command line options or answers
      boardData.name = options.name || boardData.name;
      boardData.description = options.description || boardData.description;

      try {
        const board = await apiClient.createBoard(boardData);
        formatter.success(`Board created successfully: ${(board as { id: string }).id}`);
        formatter.output(board);

        // Set as default if requested
        if (boardData.useAsDefault) {
          config.setDefaultBoard(board.id);
          formatter.info(`Set as default board`);
        }
      } catch (error) {
        formatter.error(
          `Failed to create board: ${error instanceof Error ? error.message : 'Unknown error'}`
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
    .action(async (id: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        // Get current board data
        const currentBoard = await apiClient.getBoard(id);
        if (!currentBoard) {
          formatter.error(`Board ${id} not found`);
          process.exit(1);
        }

        let updates: Record<string, unknown> = {};

        if (options.interactive) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: 'Board name:',
              default: currentBoard.name,
            },
            {
              type: 'input',
              name: 'description',
              message: 'Board description:',
              default: currentBoard.description || '',
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
          `Failed to update board: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  boardCmd
    .command('delete <id>')
    .alias('rm')
    .description('Delete a board')
    .option('-f, --force', 'skip confirmation')
    .action(async (id: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          const board = await apiClient.getBoard(id);
          if (!board) {
            formatter.error(`Board ${id} not found`);
            process.exit(1);
          }

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete board "${board.name}"? This will also delete all tasks in the board.`,
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Delete cancelled');
            return;
          }
        }

        await apiClient.deleteBoard(id);
        formatter.success(`Board ${id} deleted successfully`);
      } catch (error) {
        formatter.error(
          `Failed to delete board: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  boardCmd
    .command('use <id>')
    .description('Set board as default')
    .action(async (id: string) => {
      const { config, apiClient, formatter } = getComponents();

      try {
        // Verify board exists
        const board = await apiClient.getBoard(id);
        if (!board) {
          formatter.error(`Board ${id} not found`);
          process.exit(1);
        }

        config.setDefaultBoard(id);
        formatter.success(`Default board set to "${board.name}" (${id})`);
      } catch (error) {
        formatter.error(
          `Failed to set default board: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  boardCmd
    .command('archive <id>')
    .description('Archive a board')
    .action(async (id: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        await apiClient.updateBoard(id, { archived: true });
        formatter.success(`Board ${id} archived successfully`);
      } catch (error) {
        formatter.error(
          `Failed to archive board: ${error instanceof Error ? error.message : 'Unknown error'}`
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
        formatter.success(`Board ${id} unarchived successfully`);
      } catch (error) {
        formatter.error(
          `Failed to unarchive board: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  boardCmd
    .command('quick-setup')
    .alias('setup')
    .description('Quick interactive board setup with templates')
    .option('-n, --name <name>', 'board name')
    .option('-d, --description <desc>', 'board description')
    .option('--template <type>', 'use template (basic, scrum, bugs, content)')
    .option('--public', 'make board public')
    .option('--set-default', 'set as default board after creation')
    .action(async options => {
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

          if (!templates[options.template]) {
            formatter.error(
              `Invalid template: ${options.template}. Available: ${Object.keys(templates).join(', ')}`
            );
            process.exit(1);
          }

          defaults.columns = templates[options.template];
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
        const createData = {
          name: boardData.name,
          description: boardData.description,
          isPublic: boardData.isPublic,
          columns: boardData.columns.map(col => ({
            name: col.name,
            order: col.order,
          })),
        };

        // Create the board with spinner
        const board = await spinner.withSpinner(
          `Creating board: ${boardData.name}`,
          apiClient.createBoard(createData),
          {
            successText: 'Board created successfully! 🎉',
            failText: 'Failed to create board',
          }
        );

        formatter.success(
          `Board "${boardData.name}" created with ID: ${(board as { id: string }).id}`
        );

        // Show board details
        formatter.info('\n📊 Board Summary:');
        formatter.info(`Name: ${chalk.bold(boardData.name)}`);
        if (boardData.description) {
          formatter.info(`Description: ${boardData.description}`);
        }
        formatter.info(`Visibility: ${boardData.isPublic ? 'Public' : 'Private'}`);
        formatter.info(`Columns: ${boardData.columns.map(c => c.name).join(' → ')}`);

        // Set as default if requested
        if (options.setDefault) {
          config.setDefaultBoard((board as { id: string }).id);
          formatter.success('Set as default board');
        } else {
          // Ask if they want to set it as default
          const setAsDefault = await confirmAction('Set this board as your default?', false);

          if (setAsDefault) {
            config.setDefaultBoard((board as { id: string }).id);
            formatter.success('Set as default board');
          }
        }

        // Offer quick actions
        formatter.info('\n💡 Quick Actions:');
        formatter.info(`  View board: kanban board view ${(board as { id: string }).id}`);
        formatter.info(`  Create task: kanban task create --interactive`);
        formatter.info(`  List tasks: kanban task list`);

        formatter.output(board);
      } catch (error) {
        if (error.message === 'Board setup cancelled') {
          formatter.warn('Board setup cancelled');
          return;
        }

        formatter.error(
          `Failed to setup board: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}
