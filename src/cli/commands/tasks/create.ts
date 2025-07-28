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

/**
 * Register the create command
 */
export function registerCreateCommand(taskCmd: Command): void {
  const getComponents = (): CliComponents => global.cliComponents;

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
    .action(async (options: CreateTaskOptions) => {
      const { config, apiClient } = getComponents();
      const spinner = new SpinnerManager();

      try {
        spinner.start('Initializing...');

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
            console.log(`\n📝 Template: ${template.name}\n`);

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
              due_date: options.due ?? '',
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
              dueDate: promptResult.due_date,
              estimatedHours: promptResult.estimated_hours,
              tags: promptResult.tags,
            };

            // Convert priority from P1-P5 to 1-10 scale
            if (promptResult.priority) {
              const priorityMap = { P1: 10, P2: 8, P3: 5, P4: 3, P5: 1 };
              taskData.priority = priorityMap[promptResult.priority] ?? 5;
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
        taskData.boardId = options.board ?? taskData.board ?? config.getDefaultBoard();
        taskData.columnId = options.column ?? taskData.column;
        taskData.priority = parseInt(options.priority ?? String(taskData.priority ?? ''), 10);

        if (options.due ?? taskData.dueDate) {
          taskData.dueDate = options.due ?? taskData.dueDate;
        }

        if (options.tags ?? taskData.tags) {
          const tagsStr = options.tags ?? String(taskData.tags ?? '');
          taskData.tags = tagsStr.split(',').map((tag: string) => tag.trim());
        }

        if (!taskData.boardId) {
          spinner.fail(
            'Board ID is required. Set default board with "kanban config set defaults.board <id>"'
          );
          process.exit(1);
        }

        const createTaskRequest: CreateTaskRequest = {
          title: String(taskData.title),
          description: taskData.description as string,
          board_id: String(taskData.boardId),
          column_id: taskData.columnId as string,
          priority: taskData.priority as number,
          status: 'todo',
          assignee: taskData.assignee as string,
          due_date: taskData.dueDate as string,
          tags: taskData.tags as string[],
        };

        spinner.start(`Creating task: ${createTaskRequest.title}`);
        const response = await apiClient.createTask(createTaskRequest);

        if (isSuccessResponse(response)) {
          const task = response.data as Task;
          spinner.succeed(`Task created successfully: ${task.id}`);
          console.log('\n📋 Task Details:');
          console.log(`   Title: ${task.title}`);
          console.log(`   Status: ${task.status}`);
          if (task.priority) console.log(`   Priority: ${task.priority}`);
          if (task.assignee) console.log(`   Assignee: ${task.assignee}`);
          if (task.due_date) console.log(`   Due: ${task.due_date}`);
        } else {
          spinner.fail(`Failed to create task: ${response.error?.message ?? 'Unknown error'}`);
          process.exit(1);
        }
      } catch (error) {
        spinner.fail(
          `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}

// Helper functions for template processing
function extractTemplateVariables(template: string): string[] {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;

  while ((match = variableRegex.exec(template)) !== null) {
    if (match[1]) {
      variables.add(match[1]);
    }
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