/**
 * @fileoverview Task next recommendation command implementation
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: AI-powered next task recommendation with context
 * Main APIs: registerNextCommand() - registers next subcommand
 * Constraints: Requires API endpoint for recommendations
 * Patterns: AI reasoning display, urgency indicators, quick actions
 */

import type { Command } from 'commander';
import type { CliComponents } from '../../types';

/**
 * Register the next command
 */
export function registerNextCommand(taskCmd: Command): void {
  const getComponents = (): CliComponents => global.cliComponents;

  taskCmd
    .command('next')
    .description('Get next recommended task to work on')
    .option('-b, --board <boardId>', 'filter by board ID')
    .option('-a, --assignee <assignee>', 'filter by assignee')
    .option('-s, --skill <skill>', 'filter by skill context')
    .option('--include-blocked', 'include blocked tasks in recommendation')
    .option('--json', 'output as JSON')
    .action(
      async (options: {
        board?: string;
        assignee?: string;
        skill?: string;
        includeBlocked?: boolean;
        json?: boolean;
      }) => {
        const { apiClient, formatter } = getComponents();

        try {
          // Build query parameters
          const params: Record<string, string> = {};
          if (options.board) params.board_id = options.board;
          if (options.assignee) params.assignee = options.assignee;
          if (options.skill) params.skill_context = options.skill;
          if (options.includeBlocked) params.exclude_blocked = 'false';

          // Call the API endpoint for next task recommendation
          const response = await apiClient.request('GET', '/api/tasks/next', undefined, params);

          if (!response || !(response as any).next_task) {
            formatter.info('No tasks available matching your criteria');
            if (options.json) {
              formatter.output({ next_task: null, reasoning: 'No available tasks found' });
            }
            return;
          }

          const { next_task: nextTask, reasoning } = response as any;

          if (options.json) {
            formatter.output({ next_task: nextTask, reasoning });
            return;
          }

          // Display the recommended task
          formatter.success('🎯 Next Recommended Task:');
          formatter.output(`📋 ${String(nextTask.title)}`);
          formatter.output(`🆔 ID: ${String(nextTask.id)}`);
          formatter.output(`📊 Priority: ${String(nextTask.priority ?? 'Not set')}`);
          formatter.output(`📅 Status: ${String(nextTask.status)}`);

          if (nextTask.due_date) {
            const dueDate = new Date(nextTask.due_date);
            const now = new Date();
            const daysUntilDue = Math.ceil(
              (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );
            const dueDateStr = dueDate.toLocaleDateString();
            let urgencyIndicator: string;
            if (daysUntilDue < 0) {
              urgencyIndicator = '🚨 OVERDUE';
            } else if (daysUntilDue <= 1) {
              urgencyIndicator = '⚠️ DUE SOON';
            } else {
              urgencyIndicator = '';
            }
            formatter.output(`📅 Due: ${dueDateStr} ${urgencyIndicator}`);
          }

          if (nextTask.description) {
            formatter.output(`📝 Description: ${String(nextTask.description)}`);
          }

          formatter.info(`\n💡 Reasoning: ${String(reasoning)}`);

          // Provide action suggestions
          formatter.info('\n🚀 Quick Actions:');
          formatter.output(`   kanban task update ${String(nextTask.id)} --status in_progress`);
          formatter.output(`   kanban task show ${String(nextTask.id)} --context`);
        } catch (error) {
          formatter.error(
            `Failed to get next task: ${String(error instanceof Error ? error.message : 'Unknown error')}`
          );
          process.exit(1);
        }
      }
    );
}
