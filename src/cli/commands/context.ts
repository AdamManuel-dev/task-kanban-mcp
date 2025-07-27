import type { Command } from 'commander';

import type { CliComponents, ContextData } from '../types';

interface ShowContextOptions {
  detailed?: boolean;
  format?: string;
}

interface TaskContextOptions {
  suggestions?: boolean;
  related?: boolean;
}

interface SummaryContextOptions {
  boards?: string;
  timeframe?: string;
  format?: string;
}

export function registerContextCommands(program: Command): void {
  const contextCmd = program.command('context').alias('ctx').description('AI context and insights');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

  contextCmd
    .command('show')
    .description('Show current work context')
    .option('-d, --detailed', 'show detailed context information')
    .option('--format <type>', 'output format: summary, detailed, raw', 'summary')
    .action(async (options: ShowContextOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Generating current work context...');
        const context = (await apiClient.getContext()) as ContextData;

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
              formatter.info(`• ${insight}`);
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
              formatter.info(`  ${key}: ${value}`);
            });
          }

          if (context.recommendations) {
            formatter.info('\n💡 Recommendations:');
            context.recommendations.forEach((rec: string) => {
              formatter.info(`• ${rec}`);
            });
          }
        }
      } catch (error) {
        formatter.error(
          `Failed to get context: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

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
        const summary = (await apiClient.getProjectSummary()) as Record<string, unknown>;

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
            formatter.info(`  ${key}: ${value}`);
          });
          formatter.info('');
        }

        if (summary.recentActivity) {
          formatter.info('🔄 Recent Activity:');
          summary.recentActivity.forEach((activity: any) => {
            formatter.info(`• ${activity.description} (${activity.date})`);
          });
          formatter.info('');
        }

        if (options.includeMetrics && summary.metrics) {
          formatter.info('📊 Performance Metrics:');
          formatter.output(summary.metrics);
        }

        if (summary.keyInsights) {
          formatter.info('🔍 Key Insights:');
          summary.keyInsights.forEach((insight: string) => {
            formatter.info(`• ${insight}`);
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get project summary: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  contextCmd
    .command('task <id>')
    .description('Get AI context for a specific task')
    .option('--related', 'include related tasks')
    .option('--history', 'include task history')
    .action(async (id: string, options: TaskContextOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info(`Generating context for task ${id}...`);
        const taskContext = (await apiClient.getTaskContext(id)) as Record<string, unknown>;

        if (!taskContext) {
          formatter.error(`No context available for task ${id}`);
          process.exit(1);
        }

        formatter.info(`🎯 Task Context: ${(taskContext.title as string) || id}\n`);

        if (taskContext.description) {
          formatter.info(taskContext.description as string);
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
          taskContext.blockers.forEach((blocker: any) => {
            formatter.warn(`• ${blocker.description}`);
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
          taskContext.history.forEach((event: any) => {
            formatter.info(`• ${event.date}: ${event.description}`);
          });
          formatter.info('');
        }

        if (taskContext.aiInsights) {
          formatter.info('🤖 AI Insights:');
          taskContext.aiInsights.forEach((insight: string) => {
            formatter.info(`• ${insight}`);
          });
        }

        if (taskContext.suggestions) {
          formatter.info('\n💡 Suggestions:');
          taskContext.suggestions.forEach((suggestion: string) => {
            formatter.success(`• ${suggestion}`);
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get task context: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

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

        if (!context?.insights) {
          formatter.info('No insights available');
          return;
        }

        formatter.info('🔍 AI Work Pattern Insights\n');

        if (options.productivity && context.productivityInsights) {
          formatter.info('📈 Productivity Insights:');
          context.productivityInsights.forEach((insight: string) => {
            formatter.success(`• ${insight}`);
          });
          formatter.info('');
        }

        if (options.bottlenecks && context.bottlenecks) {
          formatter.info('🚧 Identified Bottlenecks:');
          context.bottlenecks.forEach((bottleneck: any) => {
            formatter.warn(`• ${bottleneck.description} (Impact: ${bottleneck.impact})`);
          });
          formatter.info('');
        }

        formatter.info('💡 General Insights:');
        context.insights.forEach((insight: string) => {
          formatter.info(`• ${insight}`);
        });

        if (context.actionableRecommendations) {
          formatter.info('\n🎯 Actionable Recommendations:');
          context.actionableRecommendations.forEach((rec: string) => {
            formatter.success(`• ${rec}`);
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get insights: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}
