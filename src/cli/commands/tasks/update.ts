/**
 * @fileoverview Task update command implementation
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Task property updates with interactive mode
 * Main APIs: registerUpdateCommand() - registers update subcommand
 * Constraints: Requires valid task ID, validates field values
 * Patterns: Current value defaults, optional field updates
 */

import type { Command } from 'commander';
import inquirer from 'inquirer';
import type { CliComponents, UpdateTaskRequest } from '../../types';
import type { Task } from '../../../types';
import type { UpdateTaskOptions, UpdateTaskPromptResult } from './types';

/**
 * Register the update command
 */
export function registerUpdateCommand(taskCmd: Command): void {
  const getComponents = (): CliComponents => global.cliComponents;

  taskCmd
    .command('update <id>')
    .description('Update a task')
    .option('-t, --title <title>', 'task title')
    .option('-d, --description <desc>', 'task description')
    .option('-s, --status <status>', 'task status')
    .option('-p, --priority <number>', 'priority (1-10)')
    .option('--due <date>', 'due date (YYYY-MM-DD)')
    .option('-i, --interactive', 'interactive mode')
    .action(async (id: string, options: UpdateTaskOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        // Get current task data
        const currentTaskResponse = await apiClient.getTask(id);
        if (!currentTaskResponse || !('data' in currentTaskResponse) || !currentTaskResponse.data) {
          formatter.error(`Task ${String(id)} not found`);
          process.exit(1);
        }

        const currentTask = currentTaskResponse.data as Task;

        let updates: UpdateTaskRequest = {};

        if (options.interactive) {
          const answers = await inquirer.prompt<UpdateTaskPromptResult>([
            {
              type: 'input',
              name: 'title',
              message: 'Task title:',
              default: currentTask.title,
            },
            {
              type: 'input',
              name: 'description',
              message: 'Task description:',
              default: currentTask.description ?? '',
            },
            {
              type: 'list',
              name: 'status',
              message: 'Status:',
              choices: ['todo', 'in_progress', 'done', 'blocked'],
              default: currentTask.status,
            },
            {
              type: 'number',
              name: 'priority',
              message: 'Priority (1-10):',
              default: currentTask.priority ?? 5,
              validate: (input: number) =>
                (input >= 1 && input <= 10) || 'Priority must be between 1 and 10',
            },
          ]);

          // Convert prompt result to UpdateTaskRequest - filter out undefined values
          updates = {};
          if (answers.title !== undefined) updates.title = answers.title;
          if (answers.description !== undefined) updates.description = answers.description;
          if (answers.status !== undefined)
            updates.status = answers.status as
              | 'todo'
              | 'in_progress'
              | 'done'
              | 'blocked'
              | 'archived';
          if (answers.priority !== undefined) updates.priority = answers.priority;
          if (answers.assignee !== undefined) updates.assignee = answers.assignee;
          if (answers.due_date !== undefined) updates.dueDate = answers.due_date;
        } else {
          // Use command line options
          if (options.title) updates.title = options.title;
          if (options.description) updates.description = options.description;
          if (options.status)
            updates.status = options.status as
              | 'todo'
              | 'in_progress'
              | 'done'
              | 'blocked'
              | 'archived';
          if (options.priority) updates.priority = parseInt(options.priority, 10);
          if (options.due) updates.dueDate = options.due;
        }

        if (Object.keys(updates).length === 0) {
          formatter.warn('No updates specified');
          return;
        }

        const updatedTask = await apiClient.updateTask(id, updates);
        formatter.success('Task updated successfully');
        formatter.output(updatedTask);
      } catch (error) {
        formatter.error(
          `Failed to update task: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });
}
