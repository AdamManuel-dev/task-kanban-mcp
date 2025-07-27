import type { Command } from 'commander';
import inquirer from 'inquirer';
import type { ConfigManager } from '../config';
import type { ApiClient } from '../client';
import type { OutputFormatter } from '../formatter';

export function registerBoardCommands(program: Command): void {
  const boardCmd = program.command('board').alias('b').description('Manage boards');

  // Get global components
  const getComponents = () =>
    (global as any).cliComponents as {
      config: ConfigManager;
      apiClient: ApiClient;
      formatter: OutputFormatter;
    };

  boardCmd
    .command('list')
    .alias('ls')
    .description('List boards')
    .option('--active', 'show only active boards')
    .option('--archived', 'show only archived boards')
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        const boards = (await apiClient.getBoards()) as any;

        if (!boards || boards.length === 0) {
          formatter.info('No boards found');
          return;
        }

        // Filter based on options
        let filteredBoards = boards;
        if (options.active) {
          filteredBoards = boards.filter((board: any) => !board.archived);
        } else if (options.archived) {
          filteredBoards = boards.filter((board: any) => board.archived);
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
    .action(async (id: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        const board = (await apiClient.getBoard(id)) as any;

        if (!board) {
          formatter.error(`Board ${id} not found`);
          process.exit(1);
        }

        formatter.output(board);

        if (options.tasks && board.tasks) {
          console.log('\n--- Tasks ---');
          formatter.output(board.tasks, {
            fields: ['id', 'title', 'status', 'priority'],
            headers: ['ID', 'Title', 'Status', 'Priority'],
          });
        }

        if (options.stats) {
          console.log('\n--- Statistics ---');
          try {
            const stats = await apiClient.getBoardStats(id);
            formatter.output(stats);
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
    .command('create')
    .alias('new')
    .description('Create a new board')
    .option('-n, --name <name>', 'board name')
    .option('-d, --description <desc>', 'board description')
    .option('-i, --interactive', 'interactive mode')
    .action(async options => {
      const { config, apiClient, formatter } = getComponents();

      let boardData: any = {};

      if (options.interactive || !options.name) {
        const questions: any[] = [];

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
        const board = (await apiClient.createBoard(boardData)) as any;
        formatter.success(`Board created successfully: ${board.id}`);
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
        const currentBoard = (await apiClient.getBoard(id)) as any;
        if (!currentBoard) {
          formatter.error(`Board ${id} not found`);
          process.exit(1);
        }

        let updates: any = {};

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
          const board = (await apiClient.getBoard(id)) as any;
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
        const board = (await apiClient.getBoard(id)) as any;
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
}
