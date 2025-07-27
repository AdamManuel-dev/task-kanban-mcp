import type { Command } from 'commander';
import { TaskHistoryService } from '@/services/TaskHistoryService';
import { TaskService } from '@/services/TaskService';
import { dbConnection } from '@/database/connection';
import chalk from 'chalk';
import type { CliComponents } from '../types';

export function registerPriorityCommands(program: Command): void {
  const priorityCmd = program.command('priority').alias('p').description('Manage task priorities');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

  priorityCmd
    .command('next')
    .alias('n')
    .description('Get next prioritized task')
    .option('-c, --count <number>', 'number of tasks to show', '1')
    .option('--explain', 'show priority reasoning')
    .action(async (options: { count?: string; explain?: boolean }) => {
      const { apiClient, formatter } = getComponents();

      try {
        const count = parseInt(String(options.count || '1'), 10);

        if (count === 1) {
          const nextTask = await apiClient.getNextTask();

          if (!nextTask) {
            formatter.info('No prioritized tasks available');
            return;
          }

          formatter.success('Next prioritized task:');
          formatter.output(nextTask);

          if (options.explain && (nextTask as any).priorityReasoning) {
            formatter.info('\n--- Priority Reasoning ---');
            formatter.info(String((nextTask as any).priorityReasoning));
          }
        } else {
          const priorities = await apiClient.getPriorities();

          if (!priorities || !Array.isArray(priorities) || priorities.length === 0) {
            formatter.info('No prioritized tasks available');
            return;
          }

          const topTasks = priorities.slice(0, count);
          formatter.success(`Top ${String(count)} prioritized tasks:`);
          formatter.output(topTasks, {
            fields: ['id', 'title', 'priority', 'status', 'dueDate'],
            headers: ['ID', 'Title', 'Priority', 'Status', 'Due Date'],
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get next task: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  priorityCmd
    .command('list')
    .alias('ls')
    .description('List all tasks by priority')
    .option('-l, --limit <number>', 'limit number of results', '20')
    .option('--status <status>', 'filter by status')
    .action(async (options: { limit?: string; status?: string }) => {
      const { apiClient, formatter } = getComponents();

      try {
        const priorities = await apiClient.getPriorities();

        if (!priorities || !Array.isArray(priorities) || priorities.length === 0) {
          formatter.info('No prioritized tasks available');
          return;
        }

        let filteredTasks = priorities;
        if (options.status) {
          filteredTasks = priorities.filter((task: any) => task.status === options.status);
        }

        const limitedTasks = filteredTasks.slice(0, parseInt(String(options.limit || '20'), 10));

        formatter.output(limitedTasks, {
          fields: ['id', 'title', 'priority', 'status', 'dueDate', 'dependencies'],
          headers: ['ID', 'Title', 'Priority', 'Status', 'Due Date', 'Dependencies'],
        });
      } catch (error) {
        formatter.error(
          `Failed to list priorities: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
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
        if ((result as any).message) {
          formatter.info(String((result as any).message));
        }

        if ((result as any).updated) {
          formatter.info(`Updated ${String((result as any).updated)} task priorities`);
        }
      } catch (error) {
        formatter.error(
          `Failed to recalculate priorities: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
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
        formatter.success(`Task ${String(taskId)} priority set to ${String(priorityNum)}`);

        if (options.reason) {
          formatter.info(`Reason: ${String(String(options.reason))}`);
        }
      } catch (error) {
        formatter.error(
          `Failed to set task priority: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  priorityCmd
    .command('boost <taskId>')
    .description('Boost task priority by 1')
    .action(async (taskId: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        const task = (await apiClient.getTask(taskId)) as any;
        if (!task) {
          formatter.error(`Task ${String(taskId)} not found`);
          process.exit(1);
        }

        const currentPriority = task.priority ?? 5;
        const newPriority = Math.min(currentPriority + 1, 10);

        await apiClient.updateTaskPriority(taskId, newPriority);
        formatter.success(
          `Task ${String(taskId)} priority boosted from ${String(currentPriority)} to ${String(newPriority)}`
        );
      } catch (error) {
        formatter.error(
          `Failed to boost task priority: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  priorityCmd
    .command('lower <taskId>')
    .description('Lower task priority by 1')
    .action(async (taskId: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        const task = (await apiClient.getTask(taskId)) as any;
        if (!task) {
          formatter.error(`Task ${String(taskId)} not found`);
          process.exit(1);
        }

        const currentPriority = task.priority ?? 5;
        const newPriority = Math.max(currentPriority - 1, 1);

        await apiClient.updateTaskPriority(taskId, newPriority);
        formatter.success(
          `Task ${String(taskId)} priority lowered from ${String(currentPriority)} to ${String(newPriority)}`
        );
      } catch (error) {
        formatter.error(
          `Failed to lower task priority: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  // Priority history commands
  priorityCmd
    .command('history <taskId>')
    .description('Show priority change history for a task')
    .option('--json', 'Output as JSON')
    .option('-l, --limit <number>', 'Limit number of changes to show', '10')
    .action(async (taskId: string, options) => {
      const { formatter } = getComponents();

      try {
        const historyService = TaskHistoryService.getInstance();
        const taskService = new TaskService(dbConnection);

        // Verify task exists
        const task = await taskService.getTaskById(taskId);
        if (!task) {
          formatter.error(`Task not found: ${taskId}`);
          process.exit(1);
        }

        const priorityHistory = await historyService.getPriorityHistory(taskId);
        const limitNum = parseInt(options.limit) || 10;
        const limitedHistory = priorityHistory.slice(0, limitNum);

        if (options.json) {
          formatter.output(limitedHistory);
          return;
        }

        console.log(chalk.blue.bold(`\n📈 Priority History for: ${task.title}\n`));
        console.log(chalk.dim(`Task ID: ${taskId}`));
        console.log(chalk.dim(`Current Priority: ${task.priority}\n`));

        if (limitedHistory.length === 0) {
          console.log(chalk.yellow('No priority changes recorded for this task.'));
          return;
        }

        limitedHistory.forEach((change, index) => {
          const isLatest = index === 0;
          const timeAgo = getTimeAgo(change.changed_at);
          const oldPriority = change.old_value || 'none';
          const newPriority = change.new_value || 'none';

          const priorityChange = getPriorityChangeIcon(oldPriority, newPriority);
          const changeColor = getPriorityChangeColor(oldPriority, newPriority);

          console.log(
            `${isLatest ? '⚡' : '📊'} ${changeColor(
              `${oldPriority} → ${newPriority} ${priorityChange}`
            )}`
          );
          console.log(`   ${chalk.dim(`Changed ${timeAgo}`)}`);

          if (change.reason) {
            console.log(`   ${chalk.dim('💭')} ${chalk.italic(change.reason)}`);
          }

          if (change.changed_by) {
            console.log(`   ${chalk.dim('👤')} Changed by: ${change.changed_by}`);
          }

          console.log();
        });

        if (priorityHistory.length > limitNum) {
          console.log(chalk.dim(`... and ${priorityHistory.length - limitNum} more changes`));
          console.log(chalk.dim(`Use --limit ${priorityHistory.length} to see all changes`));
        }
      } catch (error) {
        formatter.error(
          `Failed to get priority history: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  priorityCmd
    .command('analytics <taskId>')
    .description('Show priority analytics and patterns for a task')
    .option('--json', 'Output as JSON')
    .action(async (taskId: string, options) => {
      const { formatter } = getComponents();

      try {
        const historyService = TaskHistoryService.getInstance();
        const analytics = await historyService.getPriorityAnalytics(taskId);

        if (options.json) {
          formatter.output(analytics);
          return;
        }

        console.log(chalk.blue.bold(`\n📊 Priority Analytics: ${analytics.task_title}\n`));

        console.log(`${chalk.bold('Summary:')}`);
        console.log(`   Total Priority Changes: ${chalk.yellow(analytics.total_changes)}`);
        console.log(`   Average Priority: ${chalk.cyan(analytics.average_priority)}`);
        console.log(
          `   Priority Range: ${chalk.green(analytics.lowest_priority_ever)} - ${chalk.red(analytics.highest_priority_ever)}`
        );
        console.log(`   Most Common Priority: ${chalk.blue(analytics.most_common_priority)}`);
        console.log();

        // Trend analysis
        const trendIcon = getTrendIcon(analytics.priority_trend);
        const trendColor = getTrendColor(analytics.priority_trend);
        console.log(`${chalk.bold('Trend Analysis:')}`);
        console.log(
          `   Priority Trend: ${trendColor(`${trendIcon} ${analytics.priority_trend.toUpperCase()}`)}`
        );

        if (analytics.change_frequency_days > 0) {
          console.log(
            `   Change Frequency: Every ${chalk.yellow(analytics.change_frequency_days.toFixed(1))} days`
          );
        }
        console.log();

        // Recent changes
        if (analytics.recent_changes.length > 0) {
          console.log(`${chalk.bold('Recent Changes:')}`);
          analytics.recent_changes.forEach((change, index) => {
            const timeAgo = getTimeAgo(change.changed_at);
            const oldPriority = change.old_value || 'none';
            const newPriority = change.new_value || 'none';
            const changeIcon = getPriorityChangeIcon(oldPriority, newPriority);

            console.log(
              `   ${index + 1}. ${oldPriority} → ${newPriority} ${changeIcon} (${timeAgo})`
            );
            if (change.reason) {
              console.log(`      💭 ${chalk.italic(change.reason)}`);
            }
          });
          console.log();
        }

        // Change reasons
        if (analytics.change_reasons.length > 0) {
          console.log(`${chalk.bold('Common Change Reasons:')}`);
          analytics.change_reasons.forEach((reason, index) => {
            console.log(`   ${index + 1}. ${chalk.cyan(reason.reason)} (${reason.count} times)`);
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get priority analytics: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  priorityCmd
    .command('patterns')
    .description('Show priority change patterns across tasks')
    .option('-b, --board <board-id>', 'Filter by board ID')
    .option('--json', 'Output as JSON')
    .action(async options => {
      const { formatter } = getComponents();

      try {
        const historyService = TaskHistoryService.getInstance();
        const patterns = await historyService.getPriorityChangePatterns(options.board);

        if (options.json) {
          formatter.output(patterns);
          return;
        }

        console.log(chalk.blue.bold('\n📈 Priority Change Patterns\n'));

        console.log(`${chalk.bold('Overview:')}`);
        console.log(`   Total Priority Changes: ${chalk.yellow(patterns.total_priority_changes)}`);
        console.log();

        // Most active tasks
        if (patterns.most_active_tasks.length > 0) {
          console.log(`${chalk.bold('Most Active Tasks (by priority changes):')}`);
          patterns.most_active_tasks.slice(0, 5).forEach((task, index) => {
            console.log(
              `   ${index + 1}. ${chalk.cyan(task.task_title)} (${task.change_count} changes)`
            );
            console.log(`      ${chalk.dim(`ID: ${task.task_id}`)}`);
          });
          console.log();
        }

        // Common change reasons
        if (patterns.common_change_reasons.length > 0) {
          console.log(`${chalk.bold('Most Common Change Reasons:')}`);
          patterns.common_change_reasons.slice(0, 5).forEach((reason, index) => {
            console.log(`   ${index + 1}. ${chalk.green(reason.reason)} (${reason.count} times)`);
          });
          console.log();
        }

        // Priority distribution
        if (patterns.priority_distribution.length > 0) {
          console.log(`${chalk.bold('Priority Distribution:')}`);
          patterns.priority_distribution.forEach(dist => {
            const bar = '█'.repeat(Math.max(1, Math.floor(dist.count / 2)));
            console.log(`   Priority ${dist.priority}: ${chalk.blue(bar)} ${dist.count}`);
          });
          console.log();
        }

        // Trend analysis
        console.log(`${chalk.bold('Trend Analysis:')}`);
        console.log(
          `   Increasing Priority: ${chalk.green('↗')} ${patterns.trend_analysis.increasing_count} tasks`
        );
        console.log(
          `   Decreasing Priority: ${chalk.red('↘')} ${patterns.trend_analysis.decreasing_count} tasks`
        );
        console.log(
          `   Stable Priority: ${chalk.blue('→')} ${patterns.trend_analysis.stable_count} tasks`
        );
      } catch (error) {
        formatter.error(
          `Failed to get priority patterns: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}

// Helper functions
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

function getPriorityChangeIcon(oldPriority: string, newPriority: string): string {
  const oldNum = parseInt(oldPriority) || 0;
  const newNum = parseInt(newPriority) || 0;

  if (newNum > oldNum) {
    return '📈'; // Increasing priority
  }
  if (newNum < oldNum) {
    return '📉'; // Decreasing priority
  }
  return '➡️'; // Same priority
}

function getPriorityChangeColor(oldPriority: string, newPriority: string) {
  const oldNum = parseInt(oldPriority) || 0;
  const newNum = parseInt(newPriority) || 0;

  if (newNum > oldNum) {
    return chalk.red; // Increasing priority (red = urgent)
  }
  if (newNum < oldNum) {
    return chalk.green; // Decreasing priority (green = less urgent)
  }
  return chalk.blue; // Same priority
}

function getTrendIcon(trend: string): string {
  switch (trend) {
    case 'increasing':
      return '📈';
    case 'decreasing':
      return '📉';
    case 'stable':
      return '➡️';
    default:
      return '❓';
  }
}

function getTrendColor(trend: string) {
  switch (trend) {
    case 'increasing':
      return chalk.red;
    case 'decreasing':
      return chalk.green;
    case 'stable':
      return chalk.blue;
    default:
      return chalk.gray;
  }
}
