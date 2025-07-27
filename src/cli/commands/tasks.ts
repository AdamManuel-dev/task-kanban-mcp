import type { Command } from 'commander';
import inquirer from 'inquirer';

import type { CliComponents } from '../types';
import { createTaskPrompt, PromptCancelledError } from '../prompts/task-prompts';
import { spinner } from '../utils/spinner';

interface ListTaskOptions {
  board?: string;
  status?: string;
  tags?: string;
  limit?: string;
  sort?: string;
  order?: string;
}

interface ShowTaskOptions {
  context?: boolean;
}

interface CreateTaskOptions {
  interactive?: boolean;
  title?: string;
  description?: string;
  due?: string;
  tags?: string;
  priority?: string;
  column?: string;
  board?: string;
}

interface UpdateTaskOptions {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  due?: string;
  tags?: string;
  interactive?: boolean;
}

interface MoveTaskOptions {
  column?: string;
  position?: string;
  interactive?: boolean;
}

interface BulkTaskOptions {
  ids?: string;
  action?: string;
  interactive?: boolean;
}

interface TaskFilterOptions {
  status?: string;
  priority?: string;
  assignee?: string;
  tags?: string;
  board?: string;
  due?: string;
  interactive?: boolean;
}

interface DeleteTaskOptions {
  force?: boolean;
}

interface SelectTaskOptions {
  board?: string;
  status?: string;
  tags?: string;
  limit?: string;
  sort?: string;
  order?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string | number;
  assignee?: string;
  tags?: string[];
  due_date?: string;
  created_at?: string;
  updated_at?: string;
}

interface TaskListResponse {
  data: Task[];
  total?: number;
  page?: number;
  limit?: number;
}

export function registerTaskCommands(program: Command): void {
  const taskCmd = program.command('task').alias('t').description('Manage tasks');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

  taskCmd
    .command('list')
    .alias('ls')
    .description('List tasks')
    .option('-b, --board <id>', 'filter by board ID')
    .option('-s, --status <status>', 'filter by status')
    .option('-t, --tags <tags>', 'filter by tags (comma-separated)')
    .option('-l, --limit <number>', 'limit number of results', '20')
    .option('--sort <field>', 'sort by field', 'priority')
    .option('--order <direction>', 'sort order (asc/desc)', 'desc')
    .action(async options => {
      const { config, apiClient, formatter } = getComponents();

      try {
        const params: Record<string, string> = {
          limit: options.limit,
          sort: options.sort,
          order: options.order,
        };

        if (options.board) params.board = options.board;
        if (options.status) params.status = options.status;
        if (options.tags) params.tags = options.tags;

        // Use default board if no board specified
        if (!options.board && config.getDefaultBoard()) {
          params.board = config.getDefaultBoard()!;
        }

        const tasks = await apiClient.getTasks(params);

        if (!tasks || tasks.length === 0) {
          formatter.info('No tasks found');
          return;
        }

        formatter.output(tasks, {
          fields: ['id', 'title', 'status', 'priority', 'dueDate', 'createdAt'],
          headers: ['ID', 'Title', 'Status', 'Priority', 'Due Date', 'Created'],
        });
      } catch (error) {
        formatter.error(
          `Failed to list tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  taskCmd
    .command('show <id>')
    .description('Show task details')
    .option('--context', 'include AI context')
    .action(async (id: string, options: ShowTaskOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const task = await apiClient.getTask(id);

        if (!task) {
          formatter.error(`Task ${id} not found`);
          process.exit(1);
        }

        formatter.output(task);

        if (options.context) {
          formatter.info('Getting AI context...');
          try {
            const context = await apiClient.getTaskContext(id);
            formatter.info('\n--- AI Context ---');
            formatter.output(context);
          } catch (error) {
            formatter.warn('Could not retrieve AI context');
          }
        }
      } catch (error) {
        formatter.error(
          `Failed to get task: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

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
    .option('-i, --interactive', 'interactive mode')
    .action(async (options: CreateTaskOptions) => {
      const { config, apiClient, formatter } = getComponents();

      let taskData: Record<string, unknown> = {};

      if (options.interactive || !options.title) {
        // Enhanced interactive mode with AI size estimation
        try {
          const defaults = {
            title: options.title,
            description: options.description,
            due_date: options.due,
            tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined,
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
            taskData.priority = priorityMap[promptResult.priority] || 5;
          }
        } catch (error) {
          if (error instanceof PromptCancelledError) {
            formatter.warn('Task creation cancelled');
            return;
          }
          throw error;
        }
      }

      // Use command line options or answers
      taskData.title = options.title || taskData.title;
      taskData.description = options.description || taskData.description;
      taskData.boardId = options.board || taskData.board || config.getDefaultBoard();
      taskData.columnId = options.column || taskData.column;
      taskData.priority = parseInt(options.priority || taskData.priority, 10);

      if (options.due || taskData.dueDate) {
        taskData.dueDate = options.due || taskData.dueDate;
      }

      if (options.tags || taskData.tags) {
        const tagsStr = options.tags || taskData.tags;
        taskData.tags = tagsStr.split(',').map((tag: string) => tag.trim());
      }

      try {
        if (!taskData.boardId) {
          formatter.error(
            'Board ID is required. Set default board with "kanban config set defaults.board <id>"'
          );
          process.exit(1);
        }

        const task = await spinner.withSpinner(
          `Creating task: ${taskData.title}`,
          apiClient.createTask(taskData),
          {
            successText: `✅ Task created successfully`,
            failText: `❌ Failed to create task`,
          }
        );

        formatter.success(`Task ID: ${task.id || 'Unknown'}`);
        if (taskData.size) {
          formatter.info(
            `Estimated size: ${taskData.size} (${taskData.estimatedHours || 'Unknown'} hours)`
          );
        }
        formatter.output(task);
      } catch (error) {
        formatter.error(
          `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

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
        const currentTask = await apiClient.getTask(id);
        if (!currentTask) {
          formatter.error(`Task ${id} not found`);
          process.exit(1);
        }

        let updates: Record<string, unknown> = {};

        if (options.interactive) {
          const answers = await inquirer.prompt([
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
              default: currentTask.description || '',
            },
            {
              type: 'list',
              name: 'status',
              message: 'Status:',
              choices: ['todo', 'in_progress', 'completed', 'blocked'],
              default: currentTask.status,
            },
            {
              type: 'number',
              name: 'priority',
              message: 'Priority (1-10):',
              default: currentTask.priority || 5,
              validate: (input: number) =>
                (input >= 1 && input <= 10) || 'Priority must be between 1 and 10',
            },
          ]);
          updates = answers;
        } else {
          // Use command line options
          if (options.title) updates.title = options.title;
          if (options.description) updates.description = options.description;
          if (options.status) updates.status = options.status;
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
          `Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  taskCmd
    .command('delete <id>')
    .alias('rm')
    .description('Delete a task')
    .option('-f, --force', 'skip confirmation')
    .action(async (id: string, options: DeleteTaskOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          const task = await apiClient.getTask(id);
          if (!task) {
            formatter.error(`Task ${id} not found`);
            process.exit(1);
          }

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete task "${task.title}"?`,
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Delete cancelled');
            return;
          }
        }

        await apiClient.deleteTask(id);
        formatter.success(`Task ${id} deleted successfully`);
      } catch (error) {
        formatter.error(
          `Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  taskCmd
    .command('move <id> <column>')
    .description('Move task to different column')
    .option('-p, --position <number>', 'position in column')
    .action(async (id: string, columnId: string, options: MoveTaskOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const position = options.position ? parseInt(options.position, 10) : undefined;
        await apiClient.moveTask(id, columnId, position);
        formatter.success(`Task ${id} moved to column ${columnId}`);
      } catch (error) {
        formatter.error(
          `Failed to move task: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

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

        const taskResponse = tasks as TaskListResponse;
        if (!taskResponse.data || taskResponse.data.length === 0) {
          formatter.info('No tasks found');
          return;
        }

        // Start interactive task selection
        const React = await import('react');
        const { render } = await import('ink');
        const { TaskList } = await import('../ui/components/TaskList');

        // Transform API tasks to component format
        const taskList: Task[] = taskResponse.data.map((task: Task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          assignee: task.assignee,
          tags: task.tags,
          due_date: task.due_date,
        }));

        let _selectedTask: Task | null = null;
        let shouldExit = false;

        const InteractiveTaskSelector = () => {
          const [currentTasks, setCurrentTasks] = React.useState(taskList);
          const [statusFilter, setStatusFilter] = React.useState<string[]>([]);
          const [_searchMode, setSearchMode] = React.useState(false);
          const [searchQuery, setSearchQuery] = React.useState('');

          const handleTaskSelect = async (task: Task) => {
            _selectedTask = task;
            formatter.info(`\n✅ Selected: ${task.title} [${task.id}]`);
            formatter.info(`   Status: ${task.status}`);
            formatter.info(`   Priority: ${task.priority || 'None'}`);
            if (task.assignee) formatter.info(`   Assignee: ${task.assignee}`);
            if (task.tags?.length) formatter.info(`   Tags: ${task.tags.join(', ')}`);
            if (task.due_date) formatter.info(`   Due: ${task.due_date}`);

            // Ask what to do with selected task
            const { action } = await inquirer.prompt([
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
              case 'view':
                const taskDetails = await apiClient.getTask(task.id);
                formatter.output(taskDetails);
                break;
              case 'edit':
                // Launch edit command
                formatter.info(`\n💡 Run: kanban task update ${task.id} --interactive`);
                break;
              case 'move':
                // Launch move command
                const { columnId } = await inquirer.prompt([
                  {
                    type: 'input',
                    name: 'columnId',
                    message: 'Enter column ID to move to:',
                    validate: (input: string) => input.length > 0 || 'Column ID is required',
                  },
                ]);
                await apiClient.moveTask(task.id, columnId);
                formatter.success(`Task moved to column ${columnId}`);
                break;
              case 'status':
                const { newStatus } = await inquirer.prompt([
                  {
                    type: 'list',
                    name: 'newStatus',
                    message: 'Select new status:',
                    choices: ['todo', 'in_progress', 'completed', 'blocked'],
                  },
                ]);
                await apiClient.updateTask(task.id, { status: newStatus });
                formatter.success(`Task status updated to ${newStatus}`);
                break;
              case 'delete':
                const { confirm } = await inquirer.prompt([
                  {
                    type: 'confirm',
                    name: 'confirm',
                    message: `Delete task "${task.title}"?`,
                    default: false,
                  },
                ]);
                if (confirm) {
                  await apiClient.deleteTask(task.id);
                  formatter.success('Task deleted successfully');
                }
                break;
              case 'continue':
                return;
              case 'exit':
                shouldExit = true;
                break;
            }

            if (action !== 'continue') {
              shouldExit = true;
            }
          };

          const handleKeyPress = async (key: string, selectedTask: Task | null) => {
            switch (key) {
              case 'search':
                setSearchMode(true);
                const { query } = await inquirer.prompt([
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
              case 'refresh':
                try {
                  const refreshedTasks = await apiClient.getTasks(params);
                  const refreshedResponse = refreshedTasks as TaskListResponse;
                  const refreshedTaskList: Task[] = refreshedResponse.data.map((task: Task) => ({
                    id: task.id,
                    title: task.title,
                    status: task.status,
                    priority: task.priority,
                    assignee: task.assignee,
                    tags: task.tags,
                    due_date: task.due_date,
                  }));
                  setCurrentTasks(refreshedTaskList);
                  formatter.info('\n🔄 Tasks refreshed');
                } catch (error) {
                  formatter.error('\n❌ Failed to refresh tasks');
                }
                break;
              case 'help':
                formatter.info('\n📖 Task Selection Help:');
                formatter.info('  ↑/↓ or j/k: Navigate tasks');
                formatter.info('  Enter: Select task');
                formatter.info('  /: Search tasks');
                formatter.info('  r: Refresh task list');
                formatter.info('  h/l or ←/→: Filter by status');
                formatter.info('  ?: Show this help');
                formatter.info('  q: Exit');
                break;
              default:
                // Handle status filter changes
                if (key.startsWith('filter:')) {
                  const status = key.replace('filter:', '');
                  const filtered = taskList.filter(t => t.status === status);
                  setCurrentTasks(filtered);
                  setStatusFilter([status]);
                  formatter.info(`\n🔍 Filtered by status: ${status}`);
                }
                break;
            }
          };

          React.useEffect(() => {
            if (shouldExit) {
              process.exit(0);
            }
          }, [shouldExit]);

          return React.createElement(TaskList, {
            tasks: currentTasks,
            title: `Task Selection ${statusFilter.length ? `(${statusFilter.join(', ')})` : ''}${searchQuery ? ` - Search: "${searchQuery}"` : ''}`,
            onTaskSelect: handleTaskSelect,
            onKeyPress: handleKeyPress,
            showSelection: true,
            maxHeight: 15,
            showStats: true,
          });
        };

        // Show instructions
        formatter.info(`Starting interactive task selection (${taskList.length} tasks)`);
        formatter.info('Use ↑/↓ to navigate, Enter to select, ? for help, q to quit');

        // Render the interactive task selector
        render(React.createElement(InteractiveTaskSelector));
      } catch (error) {
        formatter.error(
          `Failed to start task selection: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}
