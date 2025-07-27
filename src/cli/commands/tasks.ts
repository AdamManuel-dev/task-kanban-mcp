/**
 * @module cli/commands/tasks
 * @description Task management commands for the CLI.
 *
 * Provides comprehensive task operations including creating, updating, listing,
 * moving, and deleting tasks. Supports both command-line options and interactive
 * mode for user-friendly task management.
 *
 * @example
 * ```bash
 * # List all tasks
 * kanban task list
 *
 * # List tasks with filters
 * kanban task list --board abc123 --status in_progress --limit 10
 *
 * # Create a task interactively
 * kanban task create --interactive
 *
 * # Create a task with options
 * kanban task create --title "Fix bug" --priority 8 --tags "bug,urgent"
 *
 * # Update task status
 * kanban task update task123 --status completed
 *
 * # Interactive task selection
 * kanban task select --status todo
 * ```
 */

import type { Command } from 'commander';
import inquirer from 'inquirer';

import type { CliComponents } from '../types';
import { createTaskPrompt, PromptCancelledError } from '../prompts/task-prompts';
import { spinner } from '../utils/spinner';

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

/**
 * Register all task-related commands with the CLI program.
 *
 * @param program - The commander program instance
 *
 * Available commands:
 * - `list` (alias: `ls`) - List tasks with filtering and sorting
 * - `show <id>` - Display detailed task information
 * - `create` (alias: `new`) - Create a new task
 * - `update <id>` - Update task properties
 * - `delete <id>` (alias: `rm`) - Delete a task
 * - `move <id> <column>` - Move task to different column
 * - `select` (alias: `choose`) - Interactive task selection
 */
export function registerTaskCommands(program: Command): void {
  const taskCmd = program.command('task').alias('t').description('Manage tasks');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

  /**
   * List tasks with optional filters and sorting.
   *
   * @command list
   * @alias ls
   *
   * @option -b, --board <id> - Filter by board ID
   * @option -s, --status <status> - Filter by status (todo, in_progress, completed, blocked)
   * @option -t, --tags <tags> - Filter by tags (comma-separated)
   * @option -l, --limit <number> - Limit number of results (default: 20)
   * @option --sort <field> - Sort by field: priority, created_at, updated_at, due_date (default: priority)
   * @option --order <direction> - Sort order: asc or desc (default: desc)
   *
   * @example
   * ```bash
   * # List all tasks in default board
   * kanban task list
   *
   * # List in-progress tasks with high priority
   * kanban task list --status in_progress --sort priority --order desc
   *
   * # List tasks with specific tags
   * kanban task list --tags "bug,urgent" --limit 50
   * ```
   */
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

        // eslint-disable-next-line dot-notation
        if (options['board']) params['board'] = options['board'];
        // eslint-disable-next-line dot-notation
        if (options['status']) params['status'] = options['status'];
        // eslint-disable-next-line dot-notation
        if (options['tags']) params['tags'] = options['tags'];

        // Use default board if no board specified
        // eslint-disable-next-line dot-notation
        if (!options['board'] && config.getDefaultBoard()) {
          // eslint-disable-next-line dot-notation
          params['board'] = config.getDefaultBoard()!;
        }

        const tasks = await apiClient.getTasks(params);

        if (
          !tasks ||
          !('data' in tasks) ||
          !tasks.data ||
          (Array.isArray(tasks.data) && tasks.data.length === 0)
        ) {
          formatter.info('No tasks found');
          return;
        }

        formatter.output(tasks, {
          fields: ['id', 'title', 'status', 'priority', 'dueDate', 'createdAt'],
          headers: ['ID', 'Title', 'Status', 'Priority', 'Due Date', 'Created'],
        });
      } catch (error) {
        formatter.error(
          `Failed to list tasks: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  /**
   * Show detailed information about a specific task.
   *
   * @command show <id>
   *
   * @param id - The task ID to display
   * @option --context - Include AI-generated context and insights
   *
   * @example
   * ```bash
   * # Show basic task details
   * kanban task show task123
   *
   * # Show task with AI context
   * kanban task show task123 --context
   * ```
   *
   * Output includes:
   * - Task title, description, and status
   * - Priority, assignee, and tags
   * - Creation and update timestamps
   * - Due date and completion status
   * - AI context (if requested): related tasks, insights, suggestions
   */
  taskCmd
    .command('show <id>')
    .description('Show task details')
    .option('--context', 'include AI context')
    .action(async (id: string, options: ShowTaskOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const task = await apiClient.getTask(id);

        if (!task) {
          formatter.error(`Task ${String(id)} not found`);
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
          `Failed to get task: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  /**
   * Create a new task with optional AI-powered size estimation.
   *
   * @command create
   * @alias new
   *
   * @option -t, --title <title> - Task title (required in non-interactive mode)
   * @option -d, --description <desc> - Detailed task description
   * @option -b, --board <id> - Board ID (uses default if not specified)
   * @option -c, --column <id> - Column ID to place task in
   * @option -p, --priority <number> - Priority level 1-10 (default: 5)
   * @option --due <date> - Due date in YYYY-MM-DD format
   * @option --tags <tags> - Comma-separated list of tags
   * @option -i, --interactive - Use interactive prompts with AI assistance
   *
   * @example
   * ```bash
   * # Create task with command line options
   * kanban task create --title "Implement login" --priority 8 --due 2024-12-31
   *
   * # Create task interactively (recommended)
   * kanban task create --interactive
   *
   * # Create task with tags
   * kanban task create -t "Fix memory leak" --tags "bug,performance,critical"
   * ```
   *
   * Interactive mode features:
   * - AI-powered task size estimation
   * - Smart priority suggestions
   * - Guided prompts for all fields
   * - Input validation and defaults
   */
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

      if (options.interactive ?? !options.title) {
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
            // eslint-disable-next-line dot-notation
            taskData['priority'] = priorityMap[promptResult.priority] ?? 5;
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
      // eslint-disable-next-line dot-notation
      taskData['title'] = options.title ?? taskData['title'];
      // eslint-disable-next-line dot-notation
      taskData['description'] = options.description ?? taskData['description'];
      // eslint-disable-next-line dot-notation
      taskData['boardId'] = options.board ?? taskData['board'] ?? config.getDefaultBoard();
      // eslint-disable-next-line dot-notation
      taskData['columnId'] = options.column ?? taskData['column'];
      // eslint-disable-next-line dot-notation
      taskData['priority'] = parseInt(options.priority ?? String(taskData['priority'] ?? ''), 10);

      // eslint-disable-next-line dot-notation
      if (options.due ?? taskData['dueDate']) {
        // eslint-disable-next-line dot-notation
        taskData['dueDate'] = options.due ?? taskData['dueDate'];
      }

      // eslint-disable-next-line dot-notation
      if (options.tags ?? taskData['tags']) {
        // eslint-disable-next-line dot-notation
        const tagsStr = options.tags ?? String(taskData['tags'] ?? '');
        // eslint-disable-next-line dot-notation
        taskData['tags'] = tagsStr.split(',').map((tag: string) => tag.trim());
      }

      try {
        // eslint-disable-next-line dot-notation
        if (!taskData['boardId']) {
          formatter.error(
            'Board ID is required. Set default board with "kanban config set defaults.board <id>"'
          );
          process.exit(1);
        }

        const task = await spinner.withSpinner(
          // eslint-disable-next-line dot-notation
          `Creating task: ${String(taskData['title'])}`,
          apiClient.createTask(taskData),
          {
            successText: `✅ Task created successfully`,
            failText: `❌ Failed to create task`,
          }
        );

        formatter.success(`Task ID: ${String(String(task.id ?? 'Unknown'))}`);
        // eslint-disable-next-line dot-notation
        if (taskData['size']) {
          formatter.info(
            // eslint-disable-next-line dot-notation
            `Estimated size: ${String(taskData['size'])} (${String(taskData['estimatedHours'] ?? 'Unknown')} hours)`
          );
        }
        formatter.output(task);
      } catch (error) {
        formatter.error(
          `Failed to create task: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  /**
   * Update properties of an existing task.
   *
   * @command update <id>
   *
   * @param id - The task ID to update
   * @option -t, --title <title> - New task title
   * @option -d, --description <desc> - New task description
   * @option -s, --status <status> - New status (todo, in_progress, completed, blocked)
   * @option -p, --priority <number> - New priority (1-10)
   * @option --due <date> - New due date (YYYY-MM-DD)
   * @option -i, --interactive - Use interactive mode to update multiple fields
   *
   * @example
   * ```bash
   * # Update task status
   * kanban task update task123 --status completed
   *
   * # Update multiple properties
   * kanban task update task123 --title "Updated title" --priority 9
   *
   * # Interactive update (shows current values)
   * kanban task update task123 --interactive
   * ```
   */
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
        if (
          !currentTaskResponse ??
          (!('data' in currentTaskResponse) || !currentTaskResponse.data)
        ) {
          formatter.error(`Task ${String(id)} not found`);
          process.exit(1);
        }

        const currentTask = currentTaskResponse.data as Task;

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
              default: currentTask.description ?? '',
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
              default: currentTask.priority ?? 5,
              validate: (input: number) =>
                (input >= 1 && input <= 10) || 'Priority must be between 1 and 10',
            },
          ]);
          updates = answers;
        } else {
          // Use command line options
          // eslint-disable-next-line dot-notation
          if (options.title) updates['title'] = options.title;
          // eslint-disable-next-line dot-notation
          if (options.description) updates['description'] = options.description;
          // eslint-disable-next-line dot-notation
          if (options.status) updates['status'] = options.status;
          // eslint-disable-next-line dot-notation
          if (options.priority) updates['priority'] = parseInt(options.priority, 10);
          // eslint-disable-next-line dot-notation
          if (options.due) updates['dueDate'] = options.due;
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

  /**
   * Delete a task permanently.
   *
   * @command delete <id>
   * @alias rm
   *
   * @param id - The task ID to delete
   * @option -f, --force - Skip confirmation prompt
   *
   * @example
   * ```bash
   * # Delete with confirmation
   * kanban task delete task123
   *
   * # Delete without confirmation
   * kanban task delete task123 --force
   * ```
   *
   * @warning This action cannot be undone. The task and all its associated
   * data (notes, tags, dependencies) will be permanently removed.
   */
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
            formatter.error(`Task ${String(id)} not found`);
            process.exit(1);
          }

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete task "${String(String(task.title))}"?`,
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Delete cancelled');
            return;
          }
        }

        await apiClient.deleteTask(id);
        formatter.success(`Task ${String(id)} deleted successfully`);
      } catch (error) {
        formatter.error(
          `Failed to delete task: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  /**
   * Move a task to a different column within the board.
   *
   * @command move <id> <column>
   *
   * @param id - The task ID to move
   * @param column - The target column ID
   * @option -p, --position <number> - Position within the column (0-based index)
   *
   * @example
   * ```bash
   * # Move task to "In Progress" column
   * kanban task move task123 column456
   *
   * # Move task to specific position in column
   * kanban task move task123 column456 --position 0
   * ```
   */
  taskCmd
    .command('move <id> <column>')
    .description('Move task to different column')
    .option('-p, --position <number>', 'position in column')
    .action(async (id: string, columnId: string, options: MoveTaskOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const position = options.position ? parseInt(options.position, 10) : undefined;
        await apiClient.moveTask(id, columnId, position);
        formatter.success(`Task ${String(id)} moved to column ${String(columnId)}`);
      } catch (error) {
        formatter.error(
          `Failed to move task: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  /**
   * Interactive task selection with keyboard navigation.
   *
   * @command select
   * @alias choose
   *
   * @option -b, --board <id> - Filter by board ID
   * @option -s, --status <status> - Filter by status
   * @option -t, --tags <tags> - Filter by tags (comma-separated)
   * @option --limit <number> - Maximum tasks to display (default: 50)
   * @option --sort <field> - Sort field (default: priority)
   * @option --order <direction> - Sort order: asc/desc (default: desc)
   *
   * @example
   * ```bash
   * # Select from all tasks
   * kanban task select
   *
   * # Select from filtered tasks
   * kanban task select --status todo --tags urgent
   * ```
   *
   * Keyboard shortcuts:
   * - ↑/↓ or j/k: Navigate tasks
   * - Enter: Select task for action
   * - /: Search tasks
   * - r: Refresh task list
   * - h/l or ←/→: Filter by status
   * - ?: Show help
   * - q: Exit
   *
   * Available actions after selection:
   * - View details
   * - Edit task
   * - Move to column
   * - Update status
   * - Delete task
   */
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

        // eslint-disable-next-line dot-notation
        if (options['board']) params['board'] = options['board'];
        // eslint-disable-next-line dot-notation
        if (options['status']) params['status'] = options['status'];
        // eslint-disable-next-line dot-notation
        if (options['tags']) params['tags'] = options['tags'];

        // Use default board if no board specified
        // eslint-disable-next-line dot-notation
        if (!options['board'] && config.getDefaultBoard()) {
          // eslint-disable-next-line dot-notation
          params['board'] = config.getDefaultBoard()!;
        }

        const tasks = await spinner.withSpinner('Loading tasks...', apiClient.getTasks(params), {
          successText: 'Tasks loaded successfully',
          failText: 'Failed to load tasks',
        });

        const taskResponse = tasks as TaskListResponse;
        if (!taskResponse.data ?? taskResponse.data.length === 0) {
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

        let shouldExit = false;

        const InteractiveTaskSelector = () => {
          const [currentTasks, setCurrentTasks] = React.useState(taskList);
          const [statusFilter, setStatusFilter] = React.useState<string[]>([]);
          const [, setSearchMode] = React.useState(false);
          const [searchQuery, setSearchQuery] = React.useState('');

          const handleTaskSelect = async (task: Task) => {
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
                formatter.info(
                  `\n💡 Run: kanban task update ${String(String(task.id))} --interactive`
                );
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
                formatter.success(`Task moved to column ${String(columnId)}`);
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
                formatter.success(`Task status updated to ${String(newStatus)}`);
                break;
              case 'delete':
                const { confirm } = await inquirer.prompt([
                  {
                    type: 'confirm',
                    name: 'confirm',
                    message: `Delete task "${String(String(task.title))}"?`,
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

          const handleKeyPress = async (key: string, _selectedTask: Task | null) => {
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
                  formatter.info(`\n🔍 Filtered by status: ${String(status)}`);
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
        formatter.info(
          `Starting interactive task selection (${String(String(taskList.length))} tasks)`
        );
        formatter.info('Use ↑/↓ to navigate, Enter to select, ? for help, q to quit');

        // Render the interactive task selector
        render(React.createElement(InteractiveTaskSelector));
      } catch (error) {
        formatter.error(
          `Failed to start task selection: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });
}
