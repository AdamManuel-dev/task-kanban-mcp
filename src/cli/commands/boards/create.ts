/**
 * @fileoverview Board create command implementation
 * @lastmodified 2025-07-28T12:30:00Z
 *
 * Features: Board creation with templates, interactive setup, and quick-setup options
 * Main APIs: registerCreateCommand() - registers create and quick-setup subcommands
 * Constraints: Requires prompt handling, template processing, API validation
 * Patterns: Interactive prompts, template selection, spinner feedback
 */

import type { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import type { CliComponents, CreateBoardRequest } from '../../types';
import { isSuccessResponse } from '../../api-client-wrapper';
import { SpinnerManager } from '../../utils/spinner';
import { extractErrorMessage } from '../../../utils/type-guards';

interface CreateBoardOptions {
  name?: string;
  description?: string;
  interactive?: boolean;
}

interface CreateBoardData {
  name?: string;
  description?: string;
  useAsDefault?: boolean;
}

interface CreateBoardPromptResult {
  name?: string;
  description?: string;
  useAsDefault?: boolean;
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
 * Register the create and quick-setup commands
 */
export function registerCreateCommand(boardCmd: Command): void {
  const getComponents = (): CliComponents => global.cliComponents;

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
        const { useAsDefault, ...createData } = boardData;
        const board = await apiClient.createBoard(createData as CreateBoardRequest);
        if (isSuccessResponse(board)) {
          formatter.success(`Board created successfully: ${String(board.data.id)}`);
          formatter.output(board.data);

          // Set as default if requested from interactive prompt
          if (useAsDefault) {
            config.setDefaultBoard(board.data.id);
            formatter.info(`Set as default board`);
          }
        } else {
          formatter.error('Failed to create board');
          process.exit(1);
        }
      } catch (error) {
        formatter.error(`Failed to create board: ${extractErrorMessage(error)}`);
        process.exit(1);
      }
    });

  /**
   * Quick board setup with pre-configured templates.
   *
   * @command quick-setup
   * @alias setup
   *
   * Available templates:
   * - **basic**: To Do → In Progress → Done
   * - **scrum**: Backlog → To Do → In Progress → Review → Done
   * - **bugs**: New → Confirmed → In Progress → Testing → Resolved
   * - **content**: Ideas → Writing → Editing → Review → Published
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
        const { quickBoardSetup, confirmAction } = await import('../../prompts/board-prompts');

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
              `Invalid template: ${String(options.template)}. Available: ${Object.keys(templates).join(', ')}`
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
          `Creating board: ${String(boardData.name)}`,
          apiClient.createBoard(createData),
          {
            successText: 'Board created successfully! 🎉',
            failText: 'Failed to create board',
          }
        );

        if (isSuccessResponse(board)) {
          formatter.success(
            `Board "${String(boardData.name)}" created with ID: ${String(board.data.id)}`
          );
        } else {
          formatter.error('Failed to create board');
          process.exit(1);
        }

        // Show board details
        formatter.info('\\n📊 Board Summary:');
        formatter.info(`Name: ${String(chalk.bold(boardData.name))}`);
        if (boardData.description) {
          formatter.info(`Description: ${String(boardData.description)}`);
        }
        formatter.info(`Visibility: ${String(boardData.isPublic ? 'Public' : 'Private')}`);
        formatter.info(`Columns: ${String(boardData.columns.map(c => c.name).join(' → '))}`);

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
          formatter.info('\\n💡 Quick Actions:');
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

        formatter.error(`Failed to setup board: ${extractErrorMessage(error)}`);
        process.exit(1);
      }
    });
}
