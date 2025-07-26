import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigManager } from '../config';
import { ApiClient } from '../client';
import { OutputFormatter } from '../formatter';

export function registerTaskCommands(program: Command): void {
  const taskCmd = program
    .command('task')
    .alias('t')
    .description('Manage tasks');

  // Get global components
  const getComponents = () => (global as any).cliComponents as {
    config: ConfigManager;
    apiClient: ApiClient;
    formatter: OutputFormatter;
  };

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
    .action(async (options) => {
      const { config, apiClient, formatter } = getComponents();

      try {
        const params: Record<string, string> = {
          limit: options.limit,
          sort: options.sort,
          order: options.order,
        };

        if (options.board) params['board'] = options.board;
        if (options.status) params['status'] = options.status;
        if (options.tags) params['tags'] = options.tags;

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
        formatter.error(`Failed to list tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  taskCmd
    .command('show <id>')
    .description('Show task details')
    .option('--context', 'include AI context')
    .action(async (id: string, options) => {
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
            console.log('\n--- AI Context ---');
            formatter.output(context);
          } catch (error) {
            formatter.warn('Could not retrieve AI context');
          }
        }
      } catch (error) {
        formatter.error(`Failed to get task: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    .action(async (options) => {
      const { config, apiClient, formatter } = getComponents();

      let taskData: any = {};

      if (options.interactive || !options.title) {
        // Interactive mode
        const questions: any[] = [];

        if (!options.title) {
          questions.push({
            type: 'input',
            name: 'title',
            message: 'Task title:',
            validate: (input: string) => input.length > 0 || 'Title is required',
          });
        }

        if (!options.description) {
          questions.push({
            type: 'input',
            name: 'description',
            message: 'Task description (optional):',
          });
        }

        if (!options.board && !config.getDefaultBoard()) {
          questions.push({
            type: 'input',
            name: 'board',
            message: 'Board ID:',
            validate: (input: string) => input.length > 0 || 'Board ID is required',
          });
        }

        if (!options.priority) {
          questions.push({
            type: 'number',
            name: 'priority',
            message: 'Priority (1-10):',
            default: 5,
            validate: (input: number) => (input >= 1 && input <= 10) || 'Priority must be between 1 and 10',
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
              return !isNaN(date.getTime()) || 'Invalid date format';
            },
          });
        }

        if (!options.tags) {
          questions.push({
            type: 'input',
            name: 'tags',
            message: 'Tags (comma-separated, optional):',
          });
        }

        const answers = await inquirer.prompt(questions);
        taskData = { ...taskData, ...answers };
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
          formatter.error('Board ID is required. Set default board with "kanban config set defaults.board <id>"');
          process.exit(1);
        }

        const task = await apiClient.createTask(taskData);
        formatter.success(`Task created successfully: ${task.id}`);
        formatter.output(task);
      } catch (error) {
        formatter.error(`Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    .action(async (id: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        // Get current task data
        const currentTask = await apiClient.getTask(id);
        if (!currentTask) {
          formatter.error(`Task ${id} not found`);
          process.exit(1);
        }

        let updates: any = {};

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
              validate: (input: number) => (input >= 1 && input <= 10) || 'Priority must be between 1 and 10',
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
        formatter.error(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  taskCmd
    .command('delete <id>')
    .alias('rm')
    .description('Delete a task')
    .option('-f, --force', 'skip confirmation')
    .action(async (id: string, options) => {
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
        formatter.error(`Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  taskCmd
    .command('move <id> <column>')
    .description('Move task to different column')
    .option('-p, --position <number>', 'position in column')
    .action(async (id: string, columnId: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        const position = options.position ? parseInt(options.position, 10) : undefined;
        await apiClient.moveTask(id, columnId, position);
        formatter.success(`Task ${id} moved to column ${columnId}`);
      } catch (error) {
        formatter.error(`Failed to move task: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
}