/**
 * @module cli/commands/context
 * @description AI context and insights commands for the CLI.
 *
 * Provides AI-powered analysis of work patterns, task relationships,
 * and productivity insights. Helps users understand their current work
 * context and get intelligent recommendations.
 *
 * @example
 * ```bash
 * # Show current work context
 * kanban context show
 *
 * # Get detailed context with all information
 * kanban context show --detailed
 *
 * # Get AI insights about work patterns
 * kanban context insights --productivity
 *
 * # Get context for specific task
 * kanban context task task123 --related
 * ```
 */

import type { Command } from 'commander';

import type { CliComponents, ContextData, TaskContextData } from '../types';

interface ShowContextOptions {
  detailed?: boolean;
  format?: string;
}

interface TaskContextOptions {
  suggestions?: boolean;
  related?: boolean;
  history?: boolean;
}

interface SummaryContextOptions {
  boards?: string;
  timeframe?: string;
  format?: string;
  includeMetrics?: boolean;
}

/**
 * Register all context-related commands with the CLI program.
 *
 * @param program - The commander program instance
 *
 * Available commands:
 * - `show` - Display current work context and recommendations
 * - `summary` (alias: `project`) - Get project-wide summary and metrics
 * - `task <id>` - Get AI context for a specific task
 * - `insights` - Analyze work patterns and identify bottlenecks
 */
export function registerContextCommands(program: Command): void {
  const contextCmd = program.command('context').alias('ctx').description('AI context and insights');

  // Get global components with proper typing
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  /**
   * Show current work context with AI-generated insights.
   *
   * @command show
   *
   * @option -d, --detailed - Show detailed context information
   * @option --format <type> - Output format: summary, detailed, raw (default: summary)
   *
   * @example
   * ```bash
   * # Show context summary
   * kanban context show
   *
   * # Show detailed context
   * kanban context show --detailed
   *
   * # Get raw JSON output
   * kanban context show --format raw
   * ```
   *
   * Summary format includes:
   * - Current work summary
   * - Key statistics
   * - AI recommendations
   *
   * Detailed format includes:
   * - Active tasks list
   * - Blocked tasks with reasons
   * - Upcoming deadlines
   * - AI insights and patterns
   */
  contextCmd
    .command('show')
    .description('Show current work context')
    .option('-d, --detailed', 'show detailed context information')
    .option('--format <type>', 'output format: summary, detailed, raw', 'summary')
    .action(async (options: ShowContextOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Generating current work context...');
        const response = await apiClient.getContext();
        const context = 'data' in response ? (response.data as ContextData) : undefined;

        if (!context) {
          formatter.info('No context available');
          return;
        }

        if (options.format === 'raw') {
          formatter.output(context);
        } else if (options.format === 'detailed' || options.detailed) {
          // Display detailed context
          formatter.success('Current Work Context');

          if (context.activeTasks) {
            formatter.info('\n--- Active Tasks ---');
            formatter.output(context.activeTasks, {
              fields: ['id', 'title', 'priority', 'status'],
              headers: ['ID', 'Title', 'Priority', 'Status'],
            });
          }

          if (context.blockedTasks) {
            formatter.info('\n--- Blocked Tasks ---');
            formatter.output(context.blockedTasks, {
              fields: ['id', 'title', 'blockedBy'],
              headers: ['ID', 'Title', 'Blocked By'],
            });
          }

          if (context.upcomingDeadlines) {
            formatter.info('\n--- Upcoming Deadlines ---');
            formatter.output(context.upcomingDeadlines, {
              fields: ['id', 'title', 'dueDate', 'daysLeft'],
              headers: ['ID', 'Title', 'Due Date', 'Days Left'],
            });
          }

          if (context.insights) {
            formatter.info('\n--- AI Insights ---');
            context.insights.forEach((insight: string) => {
              formatter.info(`• ${String(insight)}`);
            });
          }
        } else {
          // Summary format
          formatter.info('📋 Current Work Context Summary\n');

          if (context.summary) {
            formatter.info(context.summary as string);
          }

          if (context.statistics) {
            formatter.info('\n📊 Statistics:');
            Object.entries(context.statistics).forEach(([key, value]) => {
              formatter.info(`  ${String(key)}: ${String(value)}`);
            });
          }

          if (context.recommendations) {
            formatter.info('\n💡 Recommendations:');
            context.recommendations.forEach((rec: string) => {
              formatter.info(`• ${String(rec)}`);
            });
          }
        }
      } catch (error) {
        formatter.error(
          `Failed to get context: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  /**
   * Get comprehensive project summary with analytics.
   *
   * @command summary
   * @alias project
   *
   * @option --include-metrics - Include detailed performance metrics
   * @option --timeframe <days> - Analysis timeframe in days (default: 30)
   *
   * @example
   * ```bash
   * # Get 30-day project summary
   * kanban context summary
   *
   * # Get summary with performance metrics
   * kanban context summary --include-metrics
   *
   * # Analyze last 7 days
   * kanban context summary --timeframe 7
   * ```
   *
   * Summary includes:
   * - Project overview and status
   * - Progress tracking
   * - Recent activity timeline
   * - Key insights and trends
   *
   * Performance metrics (when included):
   * - Task completion rate
   * - Average task duration
   * - Team velocity
   * - Bottleneck analysis
   */
  contextCmd
    .command('summary')
    .alias('project')
    .description('Get project summary')
    .option('--include-metrics', 'include performance metrics')
    .option('--timeframe <days>', 'timeframe for analysis (days)', '30')
    .action(async (options: SummaryContextOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Generating project summary...');
        const response = await apiClient.getProjectSummary();
        const summary = 'data' in response ? (response.data as Record<string, unknown>) : undefined;

        if (!summary) {
          formatter.info('No project summary available');
          return;
        }

        formatter.info('📊 Project Summary\n');

        if (summary.overview) {
          formatter.info(summary.overview as string);
          formatter.info('');
        }

        if (summary.progress) {
          formatter.info('📈 Progress Overview:');
          Object.entries(summary.progress as Record<string, unknown>).forEach(([key, value]) => {
            formatter.info(`  ${String(key)}: ${String(value)}`);
          });
          formatter.info('');
        }

        if (summary.recentActivity) {
          formatter.info('🔄 Recent Activity:');
          (summary.recentActivity as Array<{ description: string; date: string }>).forEach(
            activity => {
              formatter.info(`• ${String(activity.description)} (${String(activity.date)})`);
            }
          );
          formatter.info('');
        }

        if (options.includeMetrics && summary.metrics) {
          formatter.info('📊 Performance Metrics:');
          formatter.output(summary.metrics);
        }

        if (summary.keyInsights) {
          formatter.info('🔍 Key Insights:');
          (summary.keyInsights as string[]).forEach((insight: string) => {
            formatter.info(`• ${String(insight)}`);
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get project summary: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  /**
   * Get AI-powered context and insights for a specific task.
   *
   * @command task <id>
   *
   * @param id - The task ID to analyze
   * @option --related - Include similar and related tasks
   * @option --history - Include task history and timeline
   *
   * @example
   * ```bash
   * # Get basic task context
   * kanban context task task123
   *
   * # Include related tasks
   * kanban context task task123 --related
   *
   * # Full analysis with history
   * kanban context task task123 --related --history
   * ```
   *
   * Context includes:
   * - Task description and current state
   * - Dependencies and blockers
   * - AI-generated insights
   * - Actionable suggestions
   *
   * Related tasks (when included):
   * - Similar tasks by content
   * - Tasks with shared tags
   * - Dependency relationships
   *
   * History (when included):
   * - Status changes
   * - Assignment history
   * - Time in each state
   */
  contextCmd
    .command('task <id>')
    .description('Get AI context for a specific task')
    .option('--related', 'include related tasks')
    .option('--history', 'include task history')
    .action(async (id: string, options: TaskContextOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info(`Generating context for task ${String(id)}...`);
        const taskContext = (await apiClient.getTaskContext(id)) as TaskContextData;

        if (!taskContext) {
          formatter.error(`No context available for task ${String(id)}`);
          process.exit(1);
        }

        formatter.info(`🎯 Task Context: ${String(taskContext.title ?? id)}\n`);

        if (taskContext.description) {
          formatter.info(taskContext.description);
          formatter.info('');
        }

        if (taskContext.dependencies && taskContext.dependencies.length > 0) {
          formatter.info('🔗 Dependencies:');
          formatter.output(taskContext.dependencies, {
            fields: ['id', 'title', 'status'],
            headers: ['ID', 'Title', 'Status'],
          });
          formatter.info('');
        }

        if (taskContext.blockers && taskContext.blockers.length > 0) {
          formatter.info('🚫 Blockers:');
          taskContext.blockers.forEach(blocker => {
            formatter.warn(`• ${String(blocker.description)}`);
          });
          formatter.info('');
        }

        if (options.related && taskContext.relatedTasks) {
          formatter.info('🔄 Related Tasks:');
          formatter.output(taskContext.relatedTasks, {
            fields: ['id', 'title', 'similarity'],
            headers: ['ID', 'Title', 'Similarity'],
          });
          formatter.info('');
        }

        if (options.history && taskContext.history) {
          formatter.info('📜 Task History:');
          taskContext.history.forEach(event => {
            formatter.info(`• ${String(event.date)}: ${String(event.description)}`);
          });
          formatter.info('');
        }

        if (taskContext.aiInsights) {
          formatter.info('🤖 AI Insights:');
          taskContext.aiInsights.forEach(insight => {
            formatter.info(`• ${String(insight)}`);
          });
        }

        if (taskContext.suggestions) {
          formatter.info('\n💡 Suggestions:');
          taskContext.suggestions.forEach(suggestion => {
            formatter.success(`• ${String(suggestion)}`);
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get task context: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  /**
   * Get AI insights about work patterns and productivity.
   *
   * @command insights
   *
   * @option --productivity - Focus on productivity patterns and recommendations
   * @option --bottlenecks - Identify workflow bottlenecks and blockers
   *
   * @example
   * ```bash
   * # Get general work insights
   * kanban context insights
   *
   * # Focus on productivity patterns
   * kanban context insights --productivity
   *
   * # Identify bottlenecks
   * kanban context insights --bottlenecks
   *
   * # Full analysis
   * kanban context insights --productivity --bottlenecks
   * ```
   *
   * General insights include:
   * - Work pattern analysis
   * - Task flow observations
   * - Time management insights
   * - Team collaboration patterns
   *
   * Productivity insights:
   * - Peak productivity times
   * - Task completion patterns
   * - Focus time analysis
   * - Efficiency recommendations
   *
   * Bottleneck analysis:
   * - Blocked task patterns
   * - Process inefficiencies
   * - Resource constraints
   * - Workflow optimization suggestions
   */
  contextCmd
    .command('insights')
    .description('Get AI insights about work patterns')
    .option('--productivity', 'focus on productivity insights')
    .option('--bottlenecks', 'identify bottlenecks')
    .action(async (options: { productivity?: boolean; bottlenecks?: boolean }) => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Analyzing work patterns...');
        const context = (await apiClient.getContext()) as ContextData;

        if (!context.insights) {
          formatter.info('No insights available');
          return;
        }

        formatter.info('🔍 AI Work Pattern Insights\n');

        if (options.productivity && context.productivityInsights) {
          formatter.info('📈 Productivity Insights:');
          context.productivityInsights.forEach((insight: string) => {
            formatter.success(`• ${String(insight)}`);
          });
          formatter.info('');
        }

        if (options.bottlenecks && context.bottlenecks) {
          formatter.info('🚧 Identified Bottlenecks:');
          context.bottlenecks.forEach(bottleneck => {
            formatter.warn(
              `• ${String(bottleneck.description)} (Impact: ${String(bottleneck.impact)})`
            );
          });
          formatter.info('');
        }

        formatter.info('💡 General Insights:');
        context.insights.forEach((insight: string) => {
          formatter.info(`• ${String(insight)}`);
        });

        if (context.actionableRecommendations) {
          formatter.info('\n🎯 Actionable Recommendations:');
          context.actionableRecommendations.forEach((rec: string) => {
            formatter.success(`• ${String(rec)}`);
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get insights: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });
}
