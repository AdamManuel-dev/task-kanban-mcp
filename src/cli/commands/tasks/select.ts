/**
 * @fileoverview Task interactive selection command implementation
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Interactive task selection with keyboard navigation and actions
 * Main APIs: registerSelectCommand() - registers select subcommand
 * Constraints: Requires React/Ink components, complex state management
 * Patterns: Interactive UI components, action delegation, real-time updates
 */

import type { Command } from 'commander';
import React from 'react';
import inquirer from 'inquirer';
import type { CliComponents } from '../../types';
import type { Task } from '../../../types';
import type {
  SelectTaskOptions,
  TaskListItem,
  TaskListResponse,
  ActionPromptResult,
  ColumnPromptResult,
  StatusPromptResult,
  ConfirmPromptResult,
  QueryPromptResult,
} from './types';
import { SpinnerManager } from '../../utils/spinner';
import { hasValidTaskData } from '../../../utils/type-guards';

/**
 * Register the select command
 */
export function registerSelectCommand(taskCmd: Command): void {
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  taskCmd
    .command('select')
    .alias('choose')
    .description('Interactive task selection and management')
    .option('-b, --board <id>', 'filter by board ID')
    .option('-s, --status <status>', 'filter by status')
    .option('-t, --tags <tags>', 'filter by tags (comma-separated)')
    .option('--limit <number>', 'limit number of results', '50')
    .option('--sort <field>', 'sort by field', 'priority')
    .option('--order <direction>', 'sort order (asc/desc)', 'desc')
    .action(async (options: SelectTaskOptions) => {
      const { config, apiClient, formatter } = getComponents();
      const spinner = new SpinnerManager();

      try {
        // Fetch tasks with spinner
        const params: Record<string, string> = {
          limit: options.limit ?? '50',
          sort: options.sort ?? 'priority',
          order: options.order ?? 'desc',
        };

        if (options.board) params.board = options.board;
        if (options.status) params.status = options.status;
        if (options.tags) params.tags = options.tags;

        // Use default board if no board specified
        if (!options.board && config.getDefaultBoard()) {
          params.board = config.getDefaultBoard()!;
        }

        const tasks = await spinner.withSpinner('Loading tasks...', apiClient.getTasks(params), {
          successText: 'Tasks loaded successfully',
          failText: 'Failed to load tasks',
        });

        if (!hasValidTaskData(tasks)) {
          formatter.info('No tasks found');
          return;
        }

        const taskResponse = tasks as unknown as TaskListResponse;

        // TODO: Re-enable interactive task selection once ink module resolution is fixed
        // const React = await import('react');
        // const { render } = await import('ink');
        const TaskList = (await import('../../ui/components/TaskList')).default;

        // Transform API tasks to component format with required Task properties
        const taskList: Array<Task & { tags?: string[] }> = taskResponse.data.map(
          (item: TaskListItem) => ({
            id: item.id,
            title: item.title,
            description: item.description ?? '',
            board_id: '', // Not available in TaskListItem, using empty string
            column_id: '', // Not available in TaskListItem, using empty string
            position: 0, // Not available in TaskListItem, using default
            status: item.status as Task['status'],
            priority:
              typeof item.priority === 'string'
                ? parseInt(item.priority, 10)
                : (item.priority ?? 0),
            assignee: item.assignee,
            due_date: item.due_date ? new Date(item.due_date) : undefined,
            estimated_hours: undefined,
            actual_hours: undefined,
            parent_task_id: undefined,
            progress: undefined,
            created_at: item.created_at ? new Date(item.created_at) : new Date(),
            updated_at: item.updated_at ? new Date(item.updated_at) : new Date(),
            completed_at: undefined,
            archived: false,
            metadata: undefined,
            tags: item.tags ?? [], // Extended property for UI
          })
        );

        let shouldExit = false;

        const InteractiveTaskSelector = () => {
          const [currentTasks, setCurrentTasks] = React.useState(taskList);
          const [statusFilter, setStatusFilter] = React.useState<string[]>([]);
          const [, setSearchMode] = React.useState(false);
          const [searchQuery, setSearchQuery] = React.useState('');

          const handleTaskSelect = async (task: Task & { tags?: string[] }) => {
            formatter.info(
              `\n✅ Selected: ${String(String(task.title))} [${String(String(task.id))}]`
            );
            formatter.info(`   Status: ${String(String(task.status))}`);
            formatter.info(`   Priority: ${String(String(task.priority ?? 'None'))}`);
            if (task.assignee) formatter.info(`   Assignee: ${String(String(task.assignee))}`);
            if (task.tags?.length)
              formatter.info(`   Tags: ${String(String(task.tags.join(', ')))}`);
            if (task.due_date) formatter.info(`   Due: ${String(String(task.due_date))}`);

            // Ask what to do with selected task
            const { action } = await inquirer.prompt<ActionPromptResult>([
              {
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                  { name: 'View details', value: 'view' },
                  { name: 'Edit task', value: 'edit' },
                  { name: 'Move to column', value: 'move' },
                  { name: 'Update status', value: 'status' },
                  { name: 'Delete task', value: 'delete' },
                  { name: 'Select another task', value: 'continue' },
                  { name: 'Exit', value: 'exit' },
                ],
              },
            ]);

            switch (action) {
              case 'view': {
                const taskDetails = await apiClient.getTask(task.id);
                formatter.output(taskDetails);
                break;
              }
              case 'edit': {
                // Launch edit command
                formatter.info(
                  `\n💡 Run: kanban task update ${String(String(task.id))} --interactive`
                );
                break;
              }
              case 'move': {
                // Launch move command
                const { columnId } = await inquirer.prompt<ColumnPromptResult>([
                  {
                    type: 'input',
                    name: 'columnId',
                    message: 'Enter column ID to move to:',
                    validate: (input: string) => input.length > 0 || 'Column ID is required',
                  },
                ]);
                await apiClient.moveTask(task.id, columnId);
                formatter.success(`Task moved to column ${String(columnId)}`);
                break;
              }
              case 'status': {
                const { newStatus } = await inquirer.prompt<StatusPromptResult>([
                  {
                    type: 'list',
                    name: 'newStatus',
                    message: 'Select new status:',
                    choices: ['todo', 'in_progress', 'done', 'blocked'],
                  },
                ]);
                await apiClient.updateTask(task.id, {
                  status: newStatus as 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived',
                });
                formatter.success(`Task status updated to ${String(newStatus)}`);
                break;
              }
              case 'delete': {
                const { confirmed } = await inquirer.prompt<ConfirmPromptResult>([
                  {
                    type: 'confirm',
                    name: 'confirmed',
                    message: `Delete task "${String(String(task.title))}"?`,
                    default: false,
                  },
                ]);
                if (confirmed) {
                  await apiClient.deleteTask(task.id);
                  formatter.success('Task deleted successfully');
                }
                break;
              }
              case 'continue': {
                return;
              }
              case 'exit': {
                shouldExit = true;
                break;
              }
              default: {
                formatter.warn(`Unknown action: ${String(action)}`);
                break;
              }
            }

            if (action !== 'continue') {
              shouldExit = true;
            }
          };

          const handleKeyPress = async (key: string, _selectedTask: Task | null) => {
            switch (key) {
              case 'search': {
                setSearchMode(true);
                const { query } = await inquirer.prompt<QueryPromptResult>([
                  {
                    type: 'input',
                    name: 'query',
                    message: 'Search tasks:',
                  },
                ]);
                setSearchQuery(query);
                if (query) {
                  const filtered = taskList.filter(
                    t =>
                      t.title.toLowerCase().includes(query.toLowerCase()) ||
                      (t.assignee && t.assignee.toLowerCase().includes(query.toLowerCase())) ||
                      (t.tags &&
                        t.tags.some((tag: string) =>
                          tag.toLowerCase().includes(query.toLowerCase())
                        ))
                  );
                  setCurrentTasks(filtered);
                } else {
                  setCurrentTasks(taskList);
                }
                setSearchMode(false);
                break;
              }
              case 'refresh': {
                try {
                  const refreshedTasks = await apiClient.getTasks(params);
                  const refreshedResponse = refreshedTasks as TaskListResponse;
                  const refreshedTaskList: Array<Task & { tags?: string[] }> =
                    refreshedResponse.data.map((item: TaskListItem) => ({
                      id: item.id,
                      title: item.title,
                      description: item.description ?? '',
                      board_id: '',
                      column_id: '',
                      position: 0,
                      status: item.status as Task['status'],
                      priority:
                        typeof item.priority === 'string'
                          ? parseInt(item.priority, 10)
                          : (item.priority ?? 0),
                      assignee: item.assignee,
                      due_date: item.due_date ? new Date(item.due_date) : undefined,
                      estimated_hours: undefined,
                      actual_hours: undefined,
                      parent_task_id: undefined,
                      progress: undefined,
                      created_at: item.created_at ? new Date(item.created_at) : new Date(),
                      updated_at: item.updated_at ? new Date(item.updated_at) : new Date(),
                      completed_at: undefined,
                      archived: false,
                      metadata: undefined,
                      tags: item.tags ?? [],
                    }));
                  setCurrentTasks(refreshedTaskList);
                  formatter.info('\n🔄 Tasks refreshed');
                } catch (error) {
                  formatter.error('\n❌ Failed to refresh tasks');
                }
                break;
              }
              case 'help': {
                formatter.info('\n📖 Task Selection Help:');
                formatter.info('  ↑/↓ or j/k: Navigate tasks');
                formatter.info('  Enter: Select task');
                formatter.info('  /: Search tasks');
                formatter.info('  r: Refresh task list');
                formatter.info('  h/l or ←/→: Filter by status');
                formatter.info('  ?: Show this help');
                formatter.info('  q: Exit');
                break;
              }
              default: {
                // Handle status filter changes
                if (key.startsWith('filter:')) {
                  const status = key.replace('filter:', '');
                  const filtered = taskList.filter(t => t.status === status);
                  setCurrentTasks(filtered);
                  setStatusFilter([status]);
                  formatter.info(`\n🔍 Filtered by status: ${String(status)}`);
                }
                break;
              }
            }
          };

          React.useEffect(() => {
            if (shouldExit) {
              process.exit(0);
            }
          }, [shouldExit]);

          return React.createElement(TaskList, {
            tasks: currentTasks,
            maxHeight: 15,
          });
        };

        // Show instructions
        formatter.info(
          `Starting interactive task selection (${String(String(taskList.length))} tasks)`
        );
        formatter.info('Use ↑/↓ to navigate, Enter to select, ? for help, q to quit');

        // Render the interactive task selector
        // render(React.createElement(InteractiveTaskSelector));
        formatter.info(
          'Interactive task selector temporarily disabled - showing task list instead'
        );
        const taskListOutput = TaskList({
          tasks: taskList,
          maxHeight: 15,
        });
        formatter.output(taskListOutput);
      } catch (error) {
        formatter.error(
          `Failed to start task selection: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });
}
