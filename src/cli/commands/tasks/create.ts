/**
 * @fileoverview Task create command implementation
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Task creation with templates, interactive mode, AI estimation
 * Main APIs: registerCreateCommand() - registers create subcommand
 * Constraints: Requires board ID, validates priority range
 * Patterns: Template processing, interactive prompts, spinner feedback
 */

import type { Command } from 'commander';
import inquirer from 'inquirer';
import type { CliComponents, CreateTaskRequest } from '../../types';
import type { Task } from '../../../types';
import type { CreateTaskOptions } from './types';
import { createTaskPrompt } from '../../prompts/task-prompts';
import { PromptCancelledError } from '../../prompts/types';
import { SpinnerManager } from '../../utils/spinner';
import { isSuccessResponse } from '../../api-client-wrapper';
import { TaskTemplateService } from '../../../services/TaskTemplateService';
import {
  getComponents,
  withErrorHandling,
  withSpinner,
  validateRequiredFields,
  showSuccess,
  ensureBoardId,
} from '../../utils/command-helpers';
import { PRIORITY_MAPPING } from '../../../constants';
import { handleValidationError } from '../../../utils/error-handler';
import { logger } from '../../../utils/logger';

// Helper functions for template processing (declared first to avoid hoisting issues)
function extractTemplateVariables(template: string): string[] {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;

  let tempMatch = variableRegex.exec(template);
  while (tempMatch !== null) {
    match = tempMatch;
    if (match[1]) {
      variables.add(match[1]);
    }
    tempMatch = variableRegex.exec(template);
  }

  return Array.from(variables).sort();
}

function processTemplate(template: string, variables: Record<string, unknown>): string {
  let result = template;

  // Replace variables in format {{variable_name}}
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, String(value));
  }

  return result;
}

/**
 * Register the create command
 */
export function registerCreateCommand(taskCmd: Command): void {
  const getCliComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized');
    }
    return global.cliComponents;
  };

  taskCmd
    .command('create')
    .alias('new')
    .description('Create a new task')
    .option('-t, --title <title>', 'task title')
    .option('-d, --description <desc>', 'task description')
    .option('-b, --board <id>', 'board ID')
    .option('-c, --column <id>', 'column ID')
    .option('-p, --priority <number>', 'priority (1-10)', '5')
    .option('--due <date>', 'due date (YYYY-MM-DD)')
    .option('--tags <tags>', 'tags (comma-separated)')
    .option('--template <id>', 'create from template')
    .option('-i, --interactive', 'interactive mode')
    .action(
      withErrorHandling('create task', async (options: CreateTaskOptions) => {
        const { config, apiClient, formatter } = getCliComponents();
        const spinner = new SpinnerManager();

        let taskData: Record<string, unknown> = {};

        // Handle template creation
        if (options.template) {
          const templateService = TaskTemplateService.getInstance();
          const template = await templateService.getTemplate(options.template);

          if (!template) {
            spinner.fail(`Template not found: ${options.template}`);
            process.exit(1);
          }

          if (!template.is_active) {
            spinner.fail(`Template is inactive: ${template.name}`);
            process.exit(1);
          }

          // Extract variables from template
          const titleVariables = extractTemplateVariables(template.title_template);
          const descVariables = template.description_template
            ? extractTemplateVariables(template.description_template)
            : [];
          const uniqueVariables = new Set([...titleVariables, ...descVariables]);
          const allVariables = Array.from(uniqueVariables);

          let variables: Record<string, unknown> = {};
          if (allVariables.length > 0) {
            logger.info('Using task template', { templateName: template.name });

            const variableAnswers = await inquirer.prompt(
              allVariables.map(variable => ({
                type: 'input',
                name: variable,
                message: `${variable}:`,
              }))
            );
            variables = variableAnswers;
          }

          // Process templates
          const title = processTemplate(template.title_template, variables);
          const description = template.description_template
            ? processTemplate(template.description_template, variables)
            : '';

          taskData = {
            title,
            description,
            priority: template.priority,
            estimated_hours: template.estimated_hours,
            tags: template.tags,
          };

          spinner.succeed(`Using template: ${template.name}`);
        }

        if (options.interactive ?? !options.title) {
          // Enhanced interactive mode with AI size estimation
          spinner.info('Starting interactive task creation...');

          try {
            const defaults = {
              title: options.title ?? '',
              description: options.description ?? '',
              dueDate: options.due ?? '',
              tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
            };

            const promptResult = await createTaskPrompt(defaults);

            // Map prompt result to task data
            taskData = {
              title: promptResult.title,
              description: promptResult.description,
              priority: promptResult.priority,
              size: promptResult.size,
              assignee: promptResult.assignee,
              dueDate: promptResult.dueDate,
              estimatedHours: promptResult.estimatedHours,
              tags: promptResult.tags,
            };

            // Convert priority from P1-P5 to 1-10 scale
            if (promptResult.priority) {
              taskData.priority = PRIORITY_MAPPING[promptResult.priority] ?? 5;
            }
          } catch (error) {
            if (error instanceof PromptCancelledError) {
              spinner.info('Task creation cancelled');
              return;
            }
            throw error;
          }
        }

        // Use command line options or answers
        taskData.title = options.title ?? taskData.title;
        taskData.description = options.description ?? taskData.description;
        taskData.boardId = ensureBoardId(options.board ?? (taskData.board as string));
        taskData.columnId = options.column ?? taskData.column;
        taskData.priority = parseInt(options.priority ?? String(taskData.priority ?? ''), 10);

        if (options.due ?? taskData.dueDate) {
          taskData.dueDate = options.due ?? taskData.dueDate;
        }

        if (options.tags ?? taskData.tags) {
          const tagsStr = options.tags ?? String(taskData.tags ?? '');
          taskData.tags = tagsStr.split(',').map((tag: string) => tag.trim());
        }

        // Validate required fields
        const validationErrors = validateRequiredFields({
          title: taskData.title,
          boardId: taskData.boardId,
        });

        if (validationErrors.length > 0) {
          const components = getCliComponents();
          handleValidationError(components.formatter, 'create task', validationErrors);
          return;
        }

        const createTaskRequest: CreateTaskRequest = {
          title: String(taskData.title),
          description: taskData.description as string,
          boardId: String(taskData.boardId),
          columnId: taskData.columnId as string,
          priority: taskData.priority as number,
          status: 'todo',
          assignee: taskData.assignee as string,
          dueDate: taskData.dueDate as string,
          tags: taskData.tags as string[],
        };

        const createTaskWithSpinner = withSpinner(
          `Creating task: ${createTaskRequest.title}`,
          'Task created successfully',
          async () => {
            const response = await apiClient.createTask(createTaskRequest);

            if (isSuccessResponse(response)) {
              const task = response.data as Task;
              logger.info('Task created successfully', {
                taskId: task.id,
                title: task.title,
                status: task.status,
                priority: task.priority,
                assignee: task.assignee,
                dueDate: task.due_date,
              });
              return task;
            }
            throw new Error(response.error?.message ?? 'Unknown error');
          }
        );

        const task = await createTaskWithSpinner();
        showSuccess(`Task created: ${task.id}`, task);
      })
    );
}
