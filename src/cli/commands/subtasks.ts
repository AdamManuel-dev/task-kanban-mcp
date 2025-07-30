/**
 * @fileoverview Subtask management CLI commands
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Subtask creation, dependency visualization, hierarchy management
 * Main APIs: registerSubtaskCommands() - subtask and dependency command suite
 * Constraints: Requires parent task validation, handles hierarchical relationships
 * Patterns: Interactive prompts, dependency tree display, parent-child relationships
 */

import { logger } from '@/utils/logger';
import type { Command } from 'commander';
import inquirer from 'inquirer';
import type { CliComponents, AnyApiResponse, CreateTaskRequest, TasksResponse } from '../types';

interface DependencyNode {
  id: string;
  title: string;
  status: string;
  dependencies?: DependencyNode[];
}

export function registerSubtaskCommands(program: Command): void {
  const subtaskCmd = program
    .command('subtask')
    .alias('sub')
    .description('Manage subtasks and dependencies');

  // Get global components with proper typing
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  subtaskCmd
    .command('create <parentId>')
    .description('Create a subtask for a parent task')
    .option('-t, --title <title>', 'subtask title')
    .option('-d, --description <desc>', 'subtask description')
    .option('-p, --priority <number>', 'priority (1-10)', '5')
    .option('--due <date>', 'due date (YYYY-MM-DD)')
    .option('-i, --interactive', 'interactive mode')
    .action(
      async (
        parentId: string,
        options: {
          title?: string;
          description?: string;
          priority?: string;
          due?: string;
          interactive?: boolean;
        }
      ) => {
        const { apiClient, formatter } = getComponents();

        try {
          // Verify parent task exists
          const parentTask = await apiClient.getTask(parentId);
          if (!parentTask) {
            formatter.error(`Parent task ${String(parentId)} not found`);
            process.exit(1);
          }

          let subtaskData: Partial<CreateTaskRequest> & { parent_task_id?: string } = {
            parent_task_id: parentId,
            boardId: (parentTask as unknown as { boardId: string }).boardId,
            columnId: (parentTask as unknown as { columnId: string }).columnId,
          };

          if (options.interactive ?? !options.title) {
            const questions: Array<
              | {
                  type: string;
                  name: string;
                  message: string;
                  validate?: (input: string) => boolean | string;
                  default?: number;
                }
              | {
                  type: string;
                  name: string;
                  message: string;
                  validate?: (input: number) => boolean | string;
                  default?: number;
                }
            > = [];

            if (!options.title) {
              questions.push({
                type: 'input',
                name: 'title',
                message: 'Subtask title:',
                validate: (input: string) => input.length > 0 || 'Title is required',
              });
            }

            if (!options.description) {
              questions.push({
                type: 'input',
                name: 'description',
                message: 'Subtask description (optional):',
              });
            }

            if (!options.priority) {
              questions.push({
                type: 'number',
                name: 'priority',
                message: 'Priority (1-10):',
                default: 5,
                validate: (input: number) =>
                  (input >= 1 && input <= 10) || 'Priority must be between 1 and 10',
              });
            }

            if (!options.due) {
              questions.push({
                type: 'input',
                name: 'dueDate',
                message: 'Due date (YYYY-MM-DD, optional):',
                validate: (input: string) => {
                  if (!input) return true;
                  const date = new Date(input);
                  return !Number.isNaN(date.getTime()) || 'Invalid date format';
                },
              });
            }

            const answers = await inquirer.prompt(questions);
            subtaskData = { ...subtaskData, ...answers };
          }

          // Use command line options or answers
          subtaskData.title = options.title ?? subtaskData.title;
          subtaskData.description = options.description ?? subtaskData.description;
          subtaskData.priority = parseInt(options.priority ?? String(subtaskData.priority), 10);

          if (options.due ?? subtaskData.dueDate) {
            subtaskData.dueDate = options.due ?? subtaskData.dueDate;
          }

          // Validate required fields before creating
          if (!subtaskData.title || !subtaskData.boardId) {
            formatter.error('Missing required fields: title and boardId');
            process.exit(1);
          }

          const subtask = await apiClient.createTask(subtaskData as CreateTaskRequest);
          if (
            'data' in subtask &&
            subtask.data &&
            typeof subtask.data === 'object' &&
            'id' in subtask.data
          ) {
            formatter.success(`Subtask created successfully: ${String(subtask.data.id)}`);
            formatter.output(subtask);
          } else {
            formatter.error('Failed to create subtask: Invalid response format');
            process.exit(1);
          }
        } catch (error) {
          formatter.error(
            `Failed to create subtask: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
          );
          process.exit(1);
        }
      }
    );

  subtaskCmd
    .command('list <parentId>')
    .description('List subtasks for a parent task')
    .option('--status <status>', 'filter by status')
    .option('-l, --limit <number>', 'limit number of results', '20')
    .action(async (parentId: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        const params: Record<string, string> = {
          parent: parentId,
          limit: options.limit,
        };

        if (options.status) {
          params.status = options.status;
        }

        const subtasksResponse = await apiClient.getTasks(params);

        if (
          !('data' in subtasksResponse) ||
          !subtasksResponse.data ||
          (subtasksResponse as TasksResponse).data.length === 0
        ) {
          formatter.info(`No subtasks found for task ${String(parentId)}`);
          return;
        }

        formatter.output(subtasksResponse, {
          fields: ['id', 'title', 'status', 'priority', 'dueDate', 'createdAt'],
          headers: ['ID', 'Title', 'Status', 'Priority', 'Due Date', 'Created'],
        });
      } catch (error) {
        formatter.error(
          `Failed to list subtasks: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  // Dependency commands
  const dependCmd = subtaskCmd
    .command('depend')
    .alias('dep')
    .description('Manage task dependencies');

  dependCmd
    .command('add <taskId> <dependsOnId>')
    .description('Add a dependency (taskId depends on dependsOnId)')
    .action(async (taskId: string, dependsOnId: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        await apiClient.request<AnyApiResponse>(
          'POST',
          `/api/tasks/${String(taskId)}/dependencies`,
          { dependsOn: dependsOnId }
        );
        formatter.success(`Task ${String(taskId)} now depends on task ${String(dependsOnId)}`);
      } catch (error) {
        formatter.error(
          `Failed to add dependency: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  dependCmd
    .command('remove <taskId> <dependsOnId>')
    .description('Remove a dependency')
    .action(async (taskId: string, dependsOnId: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        await apiClient.request<AnyApiResponse>(
          'DELETE',
          `/api/tasks/${String(taskId)}/dependencies/${String(dependsOnId)}`
        );
        formatter.success(
          `Removed dependency: task ${String(taskId)} no longer depends on task ${String(dependsOnId)}`
        );
      } catch (error) {
        formatter.error(
          `Failed to remove dependency: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  dependCmd
    .command('list <taskId>')
    .description('List task dependencies')
    .option('--blocked', 'show tasks blocked by this task')
    .action(async (taskId: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (options.blocked) {
          // Show tasks that are blocked by this task
          const blockedTasksResponse = await apiClient.request<TasksResponse>(
            'GET',
            `/api/tasks/${String(taskId)}/blocking`
          );

          if (!blockedTasksResponse.data || blockedTasksResponse.data.length === 0) {
            formatter.info(`No tasks are blocked by task ${String(taskId)}`);
            return;
          }

          formatter.info(`Tasks blocked by ${String(taskId)}:`);
          formatter.output(blockedTasksResponse, {
            fields: ['id', 'title', 'status', 'priority'],
            headers: ['ID', 'Title', 'Status', 'Priority'],
          });
        } else {
          // Show dependencies of this task
          const dependenciesResponse = await apiClient.request<TasksResponse>(
            'GET',
            `/api/tasks/${String(taskId)}/dependencies`
          );

          if (!dependenciesResponse.data || dependenciesResponse.data.length === 0) {
            formatter.info(`Task ${String(taskId)} has no dependencies`);
            return;
          }

          formatter.info(`Dependencies for task ${String(taskId)}:`);
          formatter.output(dependenciesResponse, {
            fields: ['id', 'title', 'status', 'priority'],
            headers: ['ID', 'Title', 'Status', 'Priority'],
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to list dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  dependCmd
    .command('visualize <taskId>')
    .description('Visualize dependency graph for a task')
    .option('--depth <number>', 'depth of dependency tree', '3')
    .action(async (taskId: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        const depth = parseInt(String(options.depth || '3'), 10);
        const graph = (await apiClient.request<AnyApiResponse>(
          'GET',
          `/api/tasks/${String(taskId)}/dependency-graph`,
          undefined,
          { depth: depth.toString() }
        )) as unknown;

        if (!graph) {
          formatter.info(`No dependency graph available for task ${String(taskId)}`);
          return;
        }

        formatter.info(`Dependency graph for task ${String(taskId)}:`);

        // Simple text-based visualization
        const printNode = (node: DependencyNode, indent = 0) => {
          const prefix = '  '.repeat(indent) + (indent > 0 ? '└─ ' : '');
          let status: string;
          if (node.status === 'completed') {
            status = '✓';
          } else if (node.status === 'blocked') {
            status = '⚠';
          } else {
            status = '○';
          }
          logger.info(
            `${String(prefix)}${String(status)} ${String(String(node.id))}: ${String(String(node.title))} (${String(String(node.status))})`
          );

          if (node.dependencies && node.dependencies.length > 0) {
            node.dependencies.forEach((dep: DependencyNode) => printNode(dep, indent + 1));
          }
        };

        printNode(graph as DependencyNode);
      } catch (error) {
        formatter.error(
          `Failed to visualize dependencies: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });
}
