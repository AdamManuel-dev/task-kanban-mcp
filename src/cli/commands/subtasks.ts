import type { Command } from 'commander';
import inquirer from 'inquirer';
import type { CliComponents } from '../types';

export function registerSubtaskCommands(program: Command): void {
  const subtaskCmd = program
    .command('subtask')
    .alias('sub')
    .description('Manage subtasks and dependencies');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

  subtaskCmd
    .command('create <parentId>')
    .description('Create a subtask for a parent task')
    .option('-t, --title <title>', 'subtask title')
    .option('-d, --description <desc>', 'subtask description')
    .option('-p, --priority <number>', 'priority (1-10)', '5')
    .option('--due <date>', 'due date (YYYY-MM-DD)')
    .option('-i, --interactive', 'interactive mode')
    .action(async (parentId: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        // Verify parent task exists
        const parentTask = (await apiClient.getTask(parentId)) as any;
        if (!parentTask) {
          formatter.error(`Parent task ${parentId} not found`);
          process.exit(1);
        }

        let subtaskData: any = {
          parentId,
          boardId: parentTask.boardId,
          columnId: parentTask.columnId,
        };

        if (options.interactive || !options.title) {
          const questions: any[] = [];

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
                return !isNaN(date.getTime()) || 'Invalid date format';
              },
            });
          }

          const answers = await inquirer.prompt(questions);
          subtaskData = { ...subtaskData, ...answers };
        }

        // Use command line options or answers
        subtaskData.title = options.title || subtaskData.title;
        subtaskData.description = options.description || subtaskData.description;
        subtaskData.priority = parseInt(options.priority || subtaskData.priority, 10);

        if (options.due || subtaskData.dueDate) {
          subtaskData.dueDate = options.due || subtaskData.dueDate;
        }

        const subtask = (await apiClient.createTask(subtaskData)) as any;
        formatter.success(`Subtask created successfully: ${subtask.id}`);
        formatter.output(subtask);
      } catch (error) {
        formatter.error(
          `Failed to create subtask: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

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

        const subtasks = (await apiClient.getTasks(params)) as any;

        if (!subtasks || subtasks.length === 0) {
          formatter.info(`No subtasks found for task ${parentId}`);
          return;
        }

        formatter.output(subtasks, {
          fields: ['id', 'title', 'status', 'priority', 'dueDate', 'createdAt'],
          headers: ['ID', 'Title', 'Status', 'Priority', 'Due Date', 'Created'],
        });
      } catch (error) {
        formatter.error(
          `Failed to list subtasks: ${error instanceof Error ? error.message : 'Unknown error'}`
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
        await apiClient.request(`/api/tasks/${taskId}/dependencies`, {
          method: 'POST',
          body: { dependsOn: dependsOnId },
        });
        formatter.success(`Task ${taskId} now depends on task ${dependsOnId}`);
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
        await apiClient.request(`/api/tasks/${taskId}/dependencies/${dependsOnId}`, {
          method: 'DELETE',
        });
        formatter.success(
          `Removed dependency: task ${taskId} no longer depends on task ${dependsOnId}`
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
          const blockedTasks = (await apiClient.request(`/api/tasks/${taskId}/blocking`)) as any;

          if (!blockedTasks || blockedTasks.length === 0) {
            formatter.info(`No tasks are blocked by task ${taskId}`);
            return;
          }

          formatter.info(`Tasks blocked by ${taskId}:`);
          formatter.output(blockedTasks, {
            fields: ['id', 'title', 'status', 'priority'],
            headers: ['ID', 'Title', 'Status', 'Priority'],
          });
        } else {
          // Show dependencies of this task
          const dependencies = (await apiClient.request(
            `/api/tasks/${taskId}/dependencies`
          )) as any;

          if (!dependencies || dependencies.length === 0) {
            formatter.info(`Task ${taskId} has no dependencies`);
            return;
          }

          formatter.info(`Dependencies for task ${taskId}:`);
          formatter.output(dependencies, {
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
        const depth = parseInt(options.depth, 10);
        const graph = (await apiClient.request(`/api/tasks/${taskId}/dependency-graph`, {
          params: { depth: depth.toString() },
        })) as any;

        if (!graph) {
          formatter.info(`No dependency graph available for task ${taskId}`);
          return;
        }

        formatter.info(`Dependency graph for task ${taskId}:`);

        // Simple text-based visualization
        const printNode = (node: any, indent = 0) => {
          const prefix = '  '.repeat(indent) + (indent > 0 ? '└─ ' : '');
          const status = node.status === 'completed' ? '✓' : node.status === 'blocked' ? '⚠' : '○';
          console.log(`${prefix}${status} ${node.id}: ${node.title} (${node.status})`);

          if (node.dependencies && node.dependencies.length > 0) {
            node.dependencies.forEach((dep: any) => printNode(dep, indent + 1));
          }
        };

        printNode(graph);
      } catch (error) {
        formatter.error(
          `Failed to visualize dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}
