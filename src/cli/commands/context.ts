import type { Command } from 'commander';
import type { ConfigManager } from '../config';
import type { ApiClient } from '../client';
import type { OutputFormatter } from '../formatter';

export function registerContextCommands(program: Command): void {
  const contextCmd = program.command('context').alias('ctx').description('AI context and insights');

  // Get global components
  const getComponents = () =>
    (global as any).cliComponents as {
      config: ConfigManager;
      apiClient: ApiClient;
      formatter: OutputFormatter;
    };

  contextCmd
    .command('show')
    .description('Show current work context')
    .option('-d, --detailed', 'show detailed context information')
    .option('--format <type>', 'output format: summary, detailed, raw', 'summary')
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Generating current work context...');
        const context = await apiClient.getContext();

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
            console.log('\n--- Active Tasks ---');
            formatter.output(context.activeTasks, {
              fields: ['id', 'title', 'priority', 'status'],
              headers: ['ID', 'Title', 'Priority', 'Status'],
            });
          }

          if (context.blockedTasks) {
            console.log('\n--- Blocked Tasks ---');
            formatter.output(context.blockedTasks, {
              fields: ['id', 'title', 'blockedBy'],
              headers: ['ID', 'Title', 'Blocked By'],
            });
          }

          if (context.upcomingDeadlines) {
            console.log('\n--- Upcoming Deadlines ---');
            formatter.output(context.upcomingDeadlines, {
              fields: ['id', 'title', 'dueDate', 'daysLeft'],
              headers: ['ID', 'Title', 'Due Date', 'Days Left'],
            });
          }

          if (context.insights) {
            console.log('\n--- AI Insights ---');
            context.insights.forEach((insight: string) => {
              formatter.info(`• ${insight}`);
            });
          }
        } else {
          // Summary format
          console.log('📋 Current Work Context Summary\n');

          if (context.summary) {
            console.log(context.summary);
          }

          if (context.statistics) {
            console.log('\n📊 Statistics:');
            Object.entries(context.statistics).forEach(([key, value]) => {
              console.log(`  ${key}: ${value}`);
            });
          }

          if (context.recommendations) {
            console.log('\n💡 Recommendations:');
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
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Generating project summary...');
        const summary = await apiClient.getProjectSummary();

        if (!summary) {
          formatter.info('No project summary available');
          return;
        }

        console.log('📊 Project Summary\n');

        if (summary.overview) {
          console.log(summary.overview);
          console.log('');
        }

        if (summary.progress) {
          console.log('📈 Progress Overview:');
          Object.entries(summary.progress).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
          });
          console.log('');
        }

        if (summary.recentActivity) {
          console.log('🔄 Recent Activity:');
          summary.recentActivity.forEach((activity: any) => {
            formatter.info(`• ${activity.description} (${activity.date})`);
          });
          console.log('');
        }

        if (options.includeMetrics && summary.metrics) {
          console.log('📊 Performance Metrics:');
          formatter.output(summary.metrics);
        }

        if (summary.keyInsights) {
          console.log('🔍 Key Insights:');
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
    .action(async (id: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info(`Generating context for task ${id}...`);
        const taskContext = await apiClient.getTaskContext(id);

        if (!taskContext) {
          formatter.error(`No context available for task ${id}`);
          process.exit(1);
        }

        console.log(`🎯 Task Context: ${taskContext.title || id}\n`);

        if (taskContext.description) {
          console.log(taskContext.description);
          console.log('');
        }

        if (taskContext.dependencies && taskContext.dependencies.length > 0) {
          console.log('🔗 Dependencies:');
          formatter.output(taskContext.dependencies, {
            fields: ['id', 'title', 'status'],
            headers: ['ID', 'Title', 'Status'],
          });
          console.log('');
        }

        if (taskContext.blockers && taskContext.blockers.length > 0) {
          console.log('🚫 Blockers:');
          taskContext.blockers.forEach((blocker: any) => {
            formatter.warn(`• ${blocker.description}`);
          });
          console.log('');
        }

        if (options.related && taskContext.relatedTasks) {
          console.log('🔄 Related Tasks:');
          formatter.output(taskContext.relatedTasks, {
            fields: ['id', 'title', 'similarity'],
            headers: ['ID', 'Title', 'Similarity'],
          });
          console.log('');
        }

        if (options.history && taskContext.history) {
          console.log('📜 Task History:');
          taskContext.history.forEach((event: any) => {
            formatter.info(`• ${event.date}: ${event.description}`);
          });
          console.log('');
        }

        if (taskContext.aiInsights) {
          console.log('🤖 AI Insights:');
          taskContext.aiInsights.forEach((insight: string) => {
            formatter.info(`• ${insight}`);
          });
        }

        if (taskContext.suggestions) {
          console.log('\n💡 Suggestions:');
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
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Analyzing work patterns...');
        const context = await apiClient.getContext();

        if (!context?.insights) {
          formatter.info('No insights available');
          return;
        }

        console.log('🔍 AI Work Pattern Insights\n');

        if (options.productivity && context.productivityInsights) {
          console.log('📈 Productivity Insights:');
          context.productivityInsights.forEach((insight: string) => {
            formatter.success(`• ${insight}`);
          });
          console.log('');
        }

        if (options.bottlenecks && context.bottlenecks) {
          console.log('🚧 Identified Bottlenecks:');
          context.bottlenecks.forEach((bottleneck: any) => {
            formatter.warn(`• ${bottleneck.description} (Impact: ${bottleneck.impact})`);
          });
          console.log('');
        }

        console.log('💡 General Insights:');
        context.insights.forEach((insight: string) => {
          formatter.info(`• ${insight}`);
        });

        if (context.actionableRecommendations) {
          console.log('\n🎯 Actionable Recommendations:');
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
