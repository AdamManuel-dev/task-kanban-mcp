import type { Command } from 'commander';
import { TaskHistoryService } from '@/services/TaskHistoryService';
import { PriorityHistoryService } from '@/services/PriorityHistoryService';
import { TaskService } from '@/services/TaskService';
import { dbConnection } from '@/database/connection';
import chalk from 'chalk';
import type { CliComponents } from '../types';

// Interfaces for priority command responses
interface TaskWithPriority {
  id: string;
  title: string;
  priority: number;
  status: string;
  dueDate?: string;
  priorityReasoning?: string;
}

// Removed unused interfaces to fix @typescript-eslint/no-unused-vars
// interface PriorityUpdateResult {
//   message?: string;
//   updated?: boolean;
// }

// interface PriorityAnalysisOptions {
//   reason?: string;
//   priority?: number;
//   limit?: string;
//   json?: boolean;
//   board?: string;
//   days?: string;
//   task?: string;
// }

// Helper functions (declared first to avoid hoisting issues)
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
  const oldNum = parseInt(oldPriority, 10) || 0;
  const newNum = parseInt(newPriority, 10) || 0;

  if (newNum > oldNum) {
    return '📈'; // Increasing priority
  }
  if (newNum < oldNum) {
    return '📉'; // Decreasing priority
  }
  return '➡️'; // Same priority
}

function getPriorityChangeColor(oldPriority: string, newPriority: string): typeof chalk.red {
  const oldNum = parseInt(oldPriority, 10) || 0;
  const newNum = parseInt(newPriority, 10) || 0;

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

function getTrendColor(trend: string): typeof chalk.red {
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

function getChangeFrequencyIcon(changeCount: number): string {
  if (changeCount >= 10) return '🔥';
  if (changeCount >= 5) return '⚡';
  if (changeCount >= 3) return '📈';
  return '📊';
}

function getPatternIcon(patternType: string): string {
  switch (patternType) {
    case 'frequent_changes':
      return '🔄';
    case 'priority_drift':
      return '📈';
    case 'emergency_bump':
      return '🚨';
    case 'gradual_decline':
      return '📉';
    default:
      return '🔍';
  }
}

function getScoreColor(score: number): typeof chalk.red {
  if (score >= 0.8) return chalk.red.bold;
  if (score >= 0.6) return chalk.yellow.bold;
  if (score >= 0.4) return chalk.blue.bold;
  return chalk.gray;
}

export function registerPriorityCommands(program: Command): void {
  const priorityCmd = program.command('priority').alias('p').description('Manage task priorities');

  // Get global components with proper typing and error handling
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  priorityCmd
    .command('next')
    .alias('n')
    .description('Get next prioritized task')
    .option('-c, --count <number>', 'number of tasks to show', '1')
    .option('--explain', 'show priority reasoning')
    .action(async (options: { count?: string; explain?: boolean }) => {
      const { apiClient, formatter } = getComponents();

      try {
        const count = parseInt(String(options.count ?? '1'), 10);

        if (count === 1) {
          const nextTask = await apiClient.getNextTask();

          if (!('data' in nextTask) || !nextTask.data) {
            formatter.info('No prioritized tasks available');
            return;
          }

          formatter.success('Next prioritized task:');
          formatter.output(nextTask);

          if (options.explain && (nextTask as TaskWithPriority).priorityReasoning) {
            formatter.info('\n--- Priority Reasoning ---');
            formatter.info(String((nextTask as TaskWithPriority).priorityReasoning));
          }
        } else {
          const priorities = await apiClient.getPriorities();

          if (!Array.isArray(priorities) || priorities.length === 0) {
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

        if (!Array.isArray(priorities) || priorities.length === 0) {
          formatter.info('No prioritized tasks available');
          return;
        }

        let filteredTasks = priorities;
        if (options.status) {
          filteredTasks = priorities.filter(
            (task: { status: string }) => task.status === options.status
          );
        }

        const limitedTasks = filteredTasks.slice(0, parseInt(String(options.limit ?? '20'), 10));

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
        if ('data' in result && result.data && typeof result.data === 'object') {
          const data = result.data as Record<string, unknown>;
          if ('message' in data && typeof data.message === 'string') {
            formatter.info(data.message);
          }
          if ('updated' in data && typeof data.updated === 'number') {
            formatter.info(`Updated ${data.updated} task priorities`);
          }
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
    .action(async (taskId: string, priority: string, options: Record<string, unknown>) => {
      const { apiClient, formatter } = getComponents();

      try {
        const priorityNum = parseInt(priority, 10);

        if (priorityNum < 1 || priorityNum > 10) {
          formatter.error('Priority must be between 1 and 10');
          process.exit(1);
        }

        const updateData: { priority: number; reason?: string } = { priority: priorityNum };
        if (options.reason) {
          updateData.reason = String(options.reason);
        }

        await apiClient.updateTaskPriority(taskId, priorityNum);
        formatter.success(`Task ${String(taskId)} priority set to ${String(priorityNum)}`);

        if (options.reason) {
          formatter.info(`Reason: ${String(options.reason)}`);
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
        const taskResponse = await apiClient.getTask(taskId);
        if (!('data' in taskResponse) || !taskResponse.data) {
          formatter.error(`Task ${taskId} not found`);
          process.exit(1);
        }

        const task = taskResponse.data as Record<string, unknown>;
        const currentPriority = typeof task.priority === 'number' ? task.priority : 5;
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
        const taskResponse = await apiClient.getTask(taskId);
        if (!('data' in taskResponse) || !taskResponse.data) {
          formatter.error(`Task ${taskId} not found`);
          process.exit(1);
        }

        const task = taskResponse.data as Record<string, unknown>;
        const currentPriority = typeof task.priority === 'number' ? task.priority : 5;
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
    .action(async (taskId: string, options: Record<string, unknown>) => {
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
        const limitNum = parseInt(String(options.limit ?? '10'), 10);
        const limitedHistory = priorityHistory.slice(0, limitNum);

        if (options.json) {
          formatter.output(limitedHistory);
          return;
        }

        // eslint-disable-next-line no-console
        console.log(chalk.blue.bold(`\n📈 Priority History for: ${task.title}\n`));
        // eslint-disable-next-line no-console
        console.log(chalk.dim(`Task ID: ${taskId}`));
        // eslint-disable-next-line no-console
        console.log(chalk.dim(`Current Priority: ${task.priority}\n`));

        if (limitedHistory.length === 0) {
          // eslint-disable-next-line no-console
          console.log(chalk.yellow('No priority changes recorded for this task.'));
          return;
        }

        limitedHistory.forEach((change, index) => {
          const isLatest = index === 0;
          const timeAgo = getTimeAgo(change.changed_at);
          const oldPriority = change.old_value ?? 'none';
          const newPriority = change.new_value ?? 'none';

          const priorityChange = getPriorityChangeIcon(oldPriority, newPriority);
          const changeColor = getPriorityChangeColor(oldPriority, newPriority);

          // eslint-disable-next-line no-console
          console.log(
            `${isLatest ? '⚡' : '📊'} ${changeColor(
              `${oldPriority} → ${newPriority} ${priorityChange}`
            )}`
          );
          // eslint-disable-next-line no-console
          console.log(`   ${chalk.dim(`Changed ${timeAgo}`)}`);

          if (change.reason) {
            // eslint-disable-next-line no-console
            console.log(`   ${chalk.dim('💭')} ${chalk.italic(change.reason)}`);
          }

          if (change.changed_by) {
            // eslint-disable-next-line no-console
            console.log(`   ${chalk.dim('👤')} Changed by: ${change.changed_by}`);
          }

          // eslint-disable-next-line no-console
          console.log();
        });

        if (priorityHistory.length > limitNum) {
          // eslint-disable-next-line no-console
          console.log(chalk.dim(`... and ${priorityHistory.length - limitNum} more changes`));
          // eslint-disable-next-line no-console
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
    .action(async (taskId: string, options: Record<string, unknown>) => {
      const { formatter } = getComponents();

      try {
        const historyService = TaskHistoryService.getInstance();
        const analytics = await historyService.getPriorityAnalytics(taskId);

        if (options.json) {
          formatter.output(analytics);
          return;
        }

        // eslint-disable-next-line no-console
        console.log(chalk.blue.bold(`\n📊 Priority Analytics: ${analytics.task_title}\n`));

        // eslint-disable-next-line no-console
        console.log(`${chalk.bold('Summary:')}`);
        // eslint-disable-next-line no-console
        console.log(`   Total Priority Changes: ${chalk.yellow(analytics.total_changes)}`);
        // eslint-disable-next-line no-console
        console.log(`   Average Priority: ${chalk.cyan(analytics.average_priority)}`);
        // eslint-disable-next-line no-console
        console.log(
          `   Priority Range: ${chalk.green(analytics.lowest_priority_ever)} - ${chalk.red(analytics.highest_priority_ever)}`
        );
        // eslint-disable-next-line no-console
        console.log(`   Most Common Priority: ${chalk.blue(analytics.most_common_priority)}`);
        // eslint-disable-next-line no-console
        console.log();

        // Trend analysis
        const trendIcon = getTrendIcon(analytics.priority_trend);
        const trendColor = getTrendColor(analytics.priority_trend);
        // eslint-disable-next-line no-console
        console.log(`${chalk.bold('Trend Analysis:')}`);
        // eslint-disable-next-line no-console
        console.log(
          `   Priority Trend: ${trendColor(`${trendIcon} ${analytics.priority_trend.toUpperCase()}`)}`
        );

        if (analytics.change_frequency_days > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `   Change Frequency: Every ${chalk.yellow(analytics.change_frequency_days.toFixed(1))} days`
          );
        }
        // eslint-disable-next-line no-console
        console.log();

        // Recent changes
        if (analytics.recent_changes.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`${chalk.bold('Recent Changes:')}`);
          analytics.recent_changes.forEach((change, index) => {
            const timeAgo = getTimeAgo(change.changed_at);
            const oldPriority = change.old_value ?? 'none';
            const newPriority = change.new_value ?? 'none';
            const changeIcon = getPriorityChangeIcon(oldPriority, newPriority);

            // eslint-disable-next-line no-console
            console.log(
              `   ${index + 1}. ${oldPriority} → ${newPriority} ${changeIcon} (${timeAgo})`
            );
            if (change.reason) {
              // eslint-disable-next-line no-console
              console.log(`      💭 ${chalk.italic(change.reason)}`);
            }
          });
          // eslint-disable-next-line no-console
          console.log();
        }

        // Change reasons
        if (analytics.change_reasons.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`${chalk.bold('Common Change Reasons:')}`);
          analytics.change_reasons.forEach((reason, index) => {
            // eslint-disable-next-line no-console
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
    .action(async (options: Record<string, unknown>) => {
      const { formatter } = getComponents();

      try {
        const historyService = TaskHistoryService.getInstance();
        const patterns = await historyService.getPriorityChangePatterns(
          String(options.board ?? '')
        );

        if (options.json) {
          formatter.output(patterns);
          return;
        }

        // eslint-disable-next-line no-console
        console.log(chalk.blue.bold('\n📈 Priority Change Patterns\n'));

        // eslint-disable-next-line no-console
        console.log(`${chalk.bold('Overview:')}`);
        // eslint-disable-next-line no-console
        console.log(`   Total Priority Changes: ${chalk.yellow(patterns.total_priority_changes)}`);
        // eslint-disable-next-line no-console
        console.log();

        // Most active tasks
        if (patterns.most_active_tasks.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`${chalk.bold('Most Active Tasks (by priority changes):')}`);
          patterns.most_active_tasks.slice(0, 5).forEach((task, index) => {
            // eslint-disable-next-line no-console
            console.log(
              `   ${index + 1}. ${chalk.cyan(task.task_title)} (${task.change_count} changes)`
            );
            // eslint-disable-next-line no-console
            console.log(`      ${chalk.dim(`ID: ${task.task_id}`)}`);
          });
          // eslint-disable-next-line no-console
          console.log();
        }

        // Common change reasons
        if (patterns.common_change_reasons.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`${chalk.bold('Most Common Change Reasons:')}`);
          patterns.common_change_reasons.slice(0, 5).forEach((reason, index) => {
            // eslint-disable-next-line no-console
            console.log(`   ${index + 1}. ${chalk.green(reason.reason)} (${reason.count} times)`);
          });
          // eslint-disable-next-line no-console
          console.log();
        }

        // Priority distribution
        if (patterns.priority_distribution.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`${chalk.bold('Priority Distribution:')}`);
          patterns.priority_distribution.forEach(dist => {
            const bar = '█'.repeat(Math.max(1, Math.floor(dist.count / 2)));
            // eslint-disable-next-line no-console
            console.log(`   Priority ${dist.priority}: ${chalk.blue(bar)} ${dist.count}`);
          });
          // eslint-disable-next-line no-console
          console.log();
        }

        // Trend analysis
        // eslint-disable-next-line no-console
        console.log(`${chalk.bold('Trend Analysis:')}`);
        // eslint-disable-next-line no-console
        console.log(
          `   Increasing Priority: ${chalk.green('↗')} ${patterns.trend_analysis.increasing_count} tasks`
        );
        // eslint-disable-next-line no-console
        console.log(
          `   Decreasing Priority: ${chalk.red('↘')} ${patterns.trend_analysis.decreasing_count} tasks`
        );
        // eslint-disable-next-line no-console
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

  // Enhanced priority tracking commands
  priorityCmd
    .command('stats')
    .description('Show priority statistics and trends')
    .option('-b, --board <boardId>', 'Filter by board ID')
    .option('--days <days>', 'Time range in days (default: 30)', '30')
    .option('--json', 'Output as JSON')
    .action(async (options: Record<string, unknown>) => {
      const { formatter } = getComponents();

      try {
        const priorityHistoryService = PriorityHistoryService.getInstance();
        const days = parseInt(String(options.days ?? '30'), 10);
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

        const stats = await priorityHistoryService.getPriorityStats(String(options.board ?? ''), {
          start: startDate,
          end: endDate,
        });

        if (options.json) {
          formatter.output(stats);
          return;
        }

        // eslint-disable-next-line no-console
        console.log(chalk.blue.bold(`\n📊 Priority Statistics (Last ${days} days)\n`));

        // Summary stats
        // eslint-disable-next-line no-console
        console.log(`${chalk.bold('Summary:')}`);
        // eslint-disable-next-line no-console
        console.log(`   Total Priority Changes: ${chalk.yellow(stats.total_changes)}`);
        // eslint-disable-next-line no-console
        console.log(`   Tasks Affected: ${chalk.cyan(stats.most_changed_tasks.length)}`);
        // eslint-disable-next-line no-console
        console.log(
          `   Avg Changes per Task: ${chalk.green(stats.avg_changes_per_task.toFixed(1))}`
        );
        // eslint-disable-next-line no-console
        console.log();

        // Priority trends
        // eslint-disable-next-line no-console
        console.log(`${chalk.bold('Priority Trends:')}`);
        const total =
          stats.priority_trends.increases +
          stats.priority_trends.decreases +
          stats.priority_trends.unchanged;
        if (total > 0) {
          const increasesPct = ((stats.priority_trends.increases / total) * 100).toFixed(1);
          const decreasesPct = ((stats.priority_trends.decreases / total) * 100).toFixed(1);
          // eslint-disable-next-line no-console
          console.log(
            `   📈 Increases: ${chalk.red(`${stats.priority_trends.increases} (${increasesPct}%)`)}`
          );
          // eslint-disable-next-line no-console
          console.log(
            `   📉 Decreases: ${chalk.green(`${stats.priority_trends.decreases} (${decreasesPct}%)`)}`
          );
        }
        // eslint-disable-next-line no-console
        console.log();

        // Most changed tasks
        if (stats.most_changed_tasks.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`${chalk.bold('Most Changed Tasks:')}`);
          stats.most_changed_tasks.slice(0, 5).forEach((item, index) => {
            const changeIcon = getChangeFrequencyIcon(item.change_count);
            // eslint-disable-next-line no-console
            console.log(
              `   ${index + 1}. ${changeIcon} ${item.task.title} (${chalk.yellow(item.change_count)} changes)`
            );
            if (item.latest_reason) {
              // eslint-disable-next-line no-console
              console.log(`      ${chalk.dim('Last reason:')} ${chalk.italic(item.latest_reason)}`);
            }
          });
          // eslint-disable-next-line no-console
          console.log();
        }

        // Common reasons
        if (stats.common_reasons.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`${chalk.bold('Common Reasons for Priority Changes:')}`);
          stats.common_reasons.forEach((reason, index) => {
            // eslint-disable-next-line no-console
            console.log(
              `   ${index + 1}. "${reason.reason}" (${chalk.yellow(reason.count)} times)`
            );
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get priority statistics: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  priorityCmd
    .command('patterns')
    .description('Analyze priority change patterns')
    .option('-t, --task <taskId>', 'Analyze patterns for specific task')
    .option('-b, --board <boardId>', 'Analyze patterns for board')
    .option('--json', 'Output as JSON')
    .action(async (options: Record<string, unknown>) => {
      const { formatter } = getComponents();

      try {
        const priorityHistoryService = PriorityHistoryService.getInstance();
        const patterns = await priorityHistoryService.analyzePriorityPatterns(
          String(options.task ?? ''),
          String(options.board ?? '')
        );

        if (options.json) {
          formatter.output(patterns);
          return;
        }

        if (patterns.length === 0) {
          // eslint-disable-next-line no-console
          console.log(chalk.yellow('No significant priority patterns detected.'));
          return;
        }

        // eslint-disable-next-line no-console
        console.log(chalk.blue.bold('\n🔍 Priority Pattern Analysis\n'));

        patterns.forEach((pattern, index) => {
          const patternIcon = getPatternIcon(pattern.pattern_type);
          const scoreColor = getScoreColor(pattern.score);

          // eslint-disable-next-line no-console
          console.log(
            `${index + 1}. ${patternIcon} ${chalk.bold(pattern.pattern_type.replace('_', ' ').toUpperCase())}`
          );
          // eslint-disable-next-line no-console
          console.log(`   Task: ${pattern.task_id}`);
          // eslint-disable-next-line no-console
          console.log(`   Score: ${scoreColor(pattern.score.toFixed(2))}`);
          // eslint-disable-next-line no-console
          console.log(`   ${chalk.dim(pattern.description)}`);
          // eslint-disable-next-line no-console
          console.log();

          if (pattern.recommendations.length > 0) {
            // eslint-disable-next-line no-console
            console.log(`   ${chalk.bold('Recommendations:')}`);
            pattern.recommendations.forEach(rec => {
              // eslint-disable-next-line no-console
              console.log(`   • ${chalk.cyan(rec)}`);
            });
            // eslint-disable-next-line no-console
            console.log();
          }
        });
      } catch (error) {
        formatter.error(
          `Failed to analyze priority patterns: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  priorityCmd
    .command('summary')
    .description('Get priority change summary for time period')
    .option('--days <days>', 'Time range in days (default: 7)', '7')
    .option('-b, --board <boardId>', 'Filter by board ID')
    .option('--json', 'Output as JSON')
    .action(async (options: Record<string, unknown>) => {
      const { formatter } = getComponents();

      try {
        const priorityHistoryService = PriorityHistoryService.getInstance();
        const days = parseInt(String(options.days ?? '7'), 10);
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

        const summary = await priorityHistoryService.getPriorityChangeSummary(
          { start: startDate, end: endDate },
          String(options.board ?? '')
        );

        if (options.json) {
          formatter.output(summary);
          return;
        }

        // eslint-disable-next-line no-console
        console.log(chalk.blue.bold(`\n📋 Priority Change Summary (Last ${days} days)\n`));

        // eslint-disable-next-line no-console
        console.log(`${chalk.bold('Activity Overview:')}`);
        // eslint-disable-next-line no-console
        console.log(`   Total Changes: ${chalk.yellow(summary.changes_count)}`);
        // eslint-disable-next-line no-console
        console.log(`   Tasks Affected: ${chalk.cyan(summary.affected_tasks)}`);
        // eslint-disable-next-line no-console
        console.log(
          `   Avg Priority Change: ${chalk.green(summary.avg_priority_change.toFixed(1))}`
        );
        // eslint-disable-next-line no-console
        console.log();

        if (summary.most_active_day.changes > 0) {
          // eslint-disable-next-line no-console
          console.log(`${chalk.bold('Peak Activity:')}`);
          // eslint-disable-next-line no-console
          console.log(
            `   Most Active Day: ${chalk.yellow(summary.most_active_day.date)} (${summary.most_active_day.changes} changes)`
          );
          // eslint-disable-next-line no-console
          console.log();
        }

        if (summary.busiest_hours.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`${chalk.bold('Busiest Hours:')}`);
          summary.busiest_hours.slice(0, 3).forEach((hour, index) => {
            const hourStr = `${hour.hour}:00`;
            // eslint-disable-next-line no-console
            console.log(`   ${index + 1}. ${chalk.cyan(hourStr)} (${hour.changes} changes)`);
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get priority summary: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}
