/**
 * CLI Command for Getting Next Task
 * Provides AI-powered task recommendation
 */

import type { Command } from 'commander';
import type { CliComponents } from '../types';

const getComponents = (): CliComponents => global.cliComponents;

interface NextTaskOptions {
  board?: string;
  assignee?: string;
  skill?: string;
  context?: string;
  exclude?: string[];
  priority?: number;
  explain?: boolean;
}

interface NextTaskParams {
  exclude_blocked: boolean;
  board_id?: string;
  assignee?: string;
  skill_context?: string;
  priority_min?: number;
  exclude_task_ids?: string[];
}

export function registerNextCommands(program: Command): void {
  program
    .command('next')
    .description('Get the next recommended task to work on')
    .option('-b, --board <board-id>', 'Filter by board ID')
    .option('-a, --assignee <user>', 'Filter by assignee')
    .option('-s, --skill <context>', 'Filter by skill context (keywords)')
    .option('-c, --context <context>', 'Additional context for recommendation')
    .option('-e, --exclude <task-ids...>', 'Exclude specific task IDs')
    .option('-p, --priority <min>', 'Minimum priority level (1-5)', parseInt)
    .option('--explain', 'Show reasoning for the recommendation')
    .action(async (options: NextTaskOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        // Build request parameters for MCP get_next_task tool
        const params: NextTaskParams = {
          exclude_blocked: true,
        };

        if (options.board) {
          params.board_id = options.board;
        }

        if (options.assignee) {
          params.assignee = options.assignee;
        }

        if (options.skill || options.context) {
          params.skill_context = options.skill || options.context;
        }

        if (options.priority) {
          params.priority_min = options.priority;
        }

        // Call the API to get next task recommendation
        const response = await apiClient.request('POST', '/api/mcp/tools/get_next_task', params);

        if (!response || !(response as any).data) {
          formatter.info('No suitable tasks found for current context');
          return;
        }

        const { next_task: nextTask, reasoning } = (response as any).data;

        if (!nextTask) {
          formatter.info('No tasks available that match your criteria');

          // Provide helpful suggestions
          formatter.info('\n💡 Suggestions:');
          formatter.info('  • Try removing some filters (--board, --assignee, --skill)');
          formatter.info('  • Check if there are any unblocked tasks');
          formatter.info('  • Use "kanban task list" to see all available tasks');
          return;
        }

        formatter.success('🎯 Next recommended task:');
        formatter.info('');

        // Display task details
        formatter.output({
          id: nextTask.id,
          title: nextTask.title,
          description: nextTask.description,
          status: nextTask.status,
          priority: nextTask.priority,
          board_id: nextTask.board_id,
          assignee: nextTask.assignee,
          due_date: nextTask.due_date,
        });

        // Show reasoning if requested
        if (options.explain && reasoning) {
          formatter.info('\n--- 🤔 Why this task? ---');
          formatter.info(String(reasoning));
        }

        // Show quick actions
        formatter.info('\n💡 Quick actions:');
        formatter.info(`  • Start working: kanban task update ${nextTask.id} --status in-progress`);
        formatter.info(`  • View details: kanban task show ${nextTask.id}`);
        formatter.info(`  • See dependencies: kanban deps list ${nextTask.id}`);
      } catch (error) {
        formatter.error(
          `Failed to get next task: ${error instanceof Error ? error.message : 'Unknown error'}`
        );

        // Provide fallback
        formatter.info('\n💡 Try using "kanban priority next" for basic prioritization');
        process.exit(1);
      }
    });
}
