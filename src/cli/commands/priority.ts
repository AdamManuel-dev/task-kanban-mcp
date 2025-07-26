import { Command } from 'commander';
import { ConfigManager } from '../config';
import { ApiClient } from '../client';
import { OutputFormatter } from '../formatter';

export function registerPriorityCommands(program: Command): void {
  const priorityCmd = program
    .command('priority')
    .alias('p')
    .description('Manage task priorities');

  // Get global components
  const getComponents = () => (global as any).cliComponents as {
    config: ConfigManager;
    apiClient: ApiClient;
    formatter: OutputFormatter;
  };

  priorityCmd
    .command('next')
    .description('Get next prioritized task')
    .option('-c, --count <number>', 'number of tasks to show', '1')
    .option('--explain', 'show priority reasoning')
    .action(async (options) => {
      const { apiClient, formatter } = getComponents();

      try {
        const count = parseInt(options.count, 10);
        
        if (count === 1) {
          const nextTask = await apiClient.getNextTask();
          
          if (!nextTask) {
            formatter.info('No prioritized tasks available');
            return;
          }

          formatter.success('Next prioritized task:');
          formatter.output(nextTask);

          if (options.explain && nextTask.priorityReasoning) {
            console.log('\n--- Priority Reasoning ---');
            console.log(nextTask.priorityReasoning);
          }
        } else {
          const priorities = await apiClient.getPriorities();
          
          if (!priorities || priorities.length === 0) {
            formatter.info('No prioritized tasks available');
            return;
          }

          const topTasks = priorities.slice(0, count);
          formatter.success(`Top ${count} prioritized tasks:`);
          formatter.output(topTasks, {
            fields: ['id', 'title', 'priority', 'status', 'dueDate'],
            headers: ['ID', 'Title', 'Priority', 'Status', 'Due Date'],
          });
        }
      } catch (error) {
        formatter.error(`Failed to get next task: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  priorityCmd
    .command('list')
    .alias('ls')
    .description('List all tasks by priority')
    .option('-l, --limit <number>', 'limit number of results', '20')
    .option('--status <status>', 'filter by status')
    .action(async (options) => {
      const { apiClient, formatter } = getComponents();

      try {
        const priorities = await apiClient.getPriorities();
        
        if (!priorities || priorities.length === 0) {
          formatter.info('No prioritized tasks available');
          return;
        }

        let filteredTasks = priorities;
        if (options.status) {
          filteredTasks = priorities.filter((task: any) => task.status === options.status);
        }

        const limitedTasks = filteredTasks.slice(0, parseInt(options.limit, 10));
        
        formatter.output(limitedTasks, {
          fields: ['id', 'title', 'priority', 'status', 'dueDate', 'dependencies'],
          headers: ['ID', 'Title', 'Priority', 'Status', 'Due Date', 'Dependencies'],
        });
      } catch (error) {
        formatter.error(`Failed to list priorities: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  priorityCmd
    .command('recalc')
    .alias('calculate')
    .description('Recalculate all task priorities')
    .action(async () => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Recalculating task priorities...');
        const result = await apiClient.recalculatePriorities();
        
        formatter.success('Priority recalculation completed');
        if (result.message) {
          formatter.info(result.message);
        }
        
        if (result.updated) {
          formatter.info(`Updated ${result.updated} task priorities`);
        }
      } catch (error) {
        formatter.error(`Failed to recalculate priorities: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  priorityCmd
    .command('set <taskId> <priority>')
    .description('Set task priority (1-10)')
    .option('--reason <reason>', 'reason for priority change')
    .action(async (taskId: string, priority: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        const priorityNum = parseInt(priority, 10);
        
        if (priorityNum < 1 || priorityNum > 10) {
          formatter.error('Priority must be between 1 and 10');
          process.exit(1);
        }

        const updateData: any = { priority: priorityNum };
        if (options.reason) {
          updateData.priorityReason = options.reason;
        }

        await apiClient.updateTaskPriority(taskId, priorityNum);
        formatter.success(`Task ${taskId} priority set to ${priorityNum}`);
        
        if (options.reason) {
          formatter.info(`Reason: ${options.reason}`);
        }
      } catch (error) {
        formatter.error(`Failed to set task priority: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  priorityCmd
    .command('boost <taskId>')
    .description('Boost task priority by 1')
    .action(async (taskId: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        const task = await apiClient.getTask(taskId);
        if (!task) {
          formatter.error(`Task ${taskId} not found`);
          process.exit(1);
        }

        const currentPriority = task.priority || 5;
        const newPriority = Math.min(currentPriority + 1, 10);
        
        await apiClient.updateTaskPriority(taskId, newPriority);
        formatter.success(`Task ${taskId} priority boosted from ${currentPriority} to ${newPriority}`);
      } catch (error) {
        formatter.error(`Failed to boost task priority: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  priorityCmd
    .command('lower <taskId>')
    .description('Lower task priority by 1')
    .action(async (taskId: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        const task = await apiClient.getTask(taskId);
        if (!task) {
          formatter.error(`Task ${taskId} not found`);
          process.exit(1);
        }

        const currentPriority = task.priority || 5;
        const newPriority = Math.max(currentPriority - 1, 1);
        
        await apiClient.updateTaskPriority(taskId, newPriority);
        formatter.success(`Task ${taskId} priority lowered from ${currentPriority} to ${newPriority}`);
      } catch (error) {
        formatter.error(`Failed to lower task priority: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
}