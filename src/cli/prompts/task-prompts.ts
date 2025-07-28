import chalk from 'chalk';
import type { Priority, TaskSize } from './validators';
import {
  validateTaskTitle,
  validateDate,
  validateTimeEstimate,
  PRIORITIES,
  TASK_SIZES,
} from './validators';
import { TaskSizeEstimator } from '../estimation/task-size-estimator';
import { logger } from '../../utils/logger';
import { safePrompt, createFormatter } from './utils';
import { withErrorHandling } from './errors';
import type { TaskInput, MoveTaskInput, BulkActionInput, TaskEstimation } from './types';

// Create formatter for task prompts
const formatter = createFormatter('task-prompts');

// Types are now imported from ./types

/**
 * Create task interactive prompt
 */
export async function createTaskPrompt(defaults?: Partial<TaskInput>): Promise<TaskInput> {
  return withErrorHandling(
    'Task creation',
    async () => {
      logger.info('Starting task creation prompt', { hasDefaults: !!defaults });
      formatter.info('\n📝 Create New Task\n');
      formatter.info(chalk.gray('Press Ctrl+C to cancel at any time\n'));

      // Create estimator instance
      const estimator = new TaskSizeEstimator();

      // Get basic info first for estimation
      const basicInfo = await safePrompt<{ title: string; description?: string }>([
        {
          type: 'input',
          name: 'title',
          message: 'Task title:',
          initial: defaults?.title,
          validate: validateTaskTitle,
        },
        {
          type: 'text',
          name: 'description',
          message: 'Description (optional):',
          initial: defaults?.description,
          multiline: true,
          hint: 'Press Ctrl+D when done',
        },
      ]);

      // Generate size estimation
      let suggestedSize: TaskSize | undefined;
      let estimation: TaskEstimation | undefined;

      if (basicInfo.title) {
        try {
          logger.debug('Generating task size estimation', { title: basicInfo.title });
          const taskForEstimation = {
            title: basicInfo.title,
            ...(basicInfo.description && { description: basicInfo.description }),
          };
          const estimateResult = estimator.estimateTime(taskForEstimation);
          estimation = {
            size: estimateResult.size,
            avgHours: estimateResult.avgHours,
            confidence: estimateResult.confidence,
            reasoning: estimateResult.reasoning,
          };
          suggestedSize = estimation.size;
          logger.debug('Size estimation completed', {
            suggestedSize,
            avgHours: estimation.avgHours,
          });

          // Show estimation
          formatter.info(chalk.cyan('\n🤖 AI Size Estimation:'));
          formatter.info(
            chalk.yellow(`  Suggested Size: ${suggestedSize} (${estimation.avgHours} hours)`)
          );
          formatter.info(chalk.gray(`  Confidence: ${Math.round(estimation.confidence * 100)}%`));
          if (estimation.reasoning?.length > 0) {
            formatter.info(chalk.gray('  Reasoning:'));
            estimation.reasoning.forEach((reason: string) => {
              formatter.info(chalk.gray(`    • ${reason}`));
            });
          }
          formatter.info('');
        } catch (error) {
          logger.warn('Size estimation failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          formatter.warn('⚠️  Size estimation unavailable\n');
        }
      }

      const additionalInfo = await safePrompt<Omit<TaskInput, 'title' | 'description'>>([
        {
          type: 'select',
          name: 'priority',
          message: 'Priority:',
          choices: [
            { name: 'P1', value: 'P1', hint: 'Critical - Must be done ASAP' },
            { name: 'P2', value: 'P2', hint: 'High - Important and urgent' },
            { name: 'P3', value: 'P3', hint: 'Medium - Important but not urgent' },
            { name: 'P4', value: 'P4', hint: 'Low - Nice to have' },
            { name: 'P5', value: 'P5', hint: 'Very Low - Backlog' },
            { name: 'Skip', value: undefined, hint: 'No priority' },
          ],
          initial: defaults?.priority ? PRIORITIES.indexOf(defaults.priority) : 2,
        },
        {
          type: 'select',
          name: 'size',
          message: suggestedSize ? `Task size (AI suggests: ${suggestedSize}):` : 'Task size:',
          choices: [
            {
              name:
                suggestedSize === 'S' ? `S ⭐ (AI suggested - ${estimation?.avgHours ?? 1}h)` : 'S',
              value: 'S',
              hint: 'Small - Less than 2 hours',
            },
            {
              name:
                suggestedSize === 'M' ? `M ⭐ (AI suggested - ${estimation?.avgHours ?? 3}h)` : 'M',
              value: 'M',
              hint: 'Medium - 2-4 hours',
            },
            {
              name:
                suggestedSize === 'L' ? `L ⭐ (AI suggested - ${estimation?.avgHours ?? 6}h)` : 'L',
              value: 'L',
              hint: 'Large - 4-8 hours',
            },
            {
              name:
                suggestedSize === 'XL'
                  ? `XL ⭐ (AI suggested - ${estimation?.avgHours ?? 12}h)`
                  : 'XL',
              value: 'XL',
              hint: 'Extra Large - More than 8 hours',
            },
            { name: 'Skip', value: undefined, hint: 'No size estimate' },
          ],
          initial: ((): number => {
            if (suggestedSize) {
              return TASK_SIZES.indexOf(suggestedSize);
            }
            if (defaults?.size) {
              return TASK_SIZES.indexOf(defaults.size);
            }
            return 1;
          })(),
        },
        {
          type: 'input',
          name: 'assignee',
          message: 'Assignee (optional):',
          initial: defaults?.assignee,
          hint: 'Username or email',
        },
        {
          type: 'input',
          name: 'dueDate',
          message: 'Due date (optional):',
          initial: defaults?.dueDate,
          hint: 'Format: YYYY-MM-DD',
          validate: validateDate,
        },
        {
          type: 'numeral',
          name: 'estimatedHours',
          message: 'Estimated hours (optional):',
          initial: defaults?.estimatedHours,
          float: true,
          validate: (value: string): string | boolean => {
            if (!value) return true;
            return validateTimeEstimate(value);
          },
        },
        {
          type: 'list',
          name: 'tags',
          message: 'Tags (comma-separated, optional):',
          initial: defaults?.tags?.join(', '),
          separator: ',',
          hint: 'e.g., frontend, bug, urgent',
        },
      ]);

      // Merge basicInfo and additionalInfo
      const response = {
        title: basicInfo.title,
        description: basicInfo.description,
        ...additionalInfo,
      };

      // Clean up the response
      const cleanedResponse: TaskInput = {
        title: response.title,
      };

      if (response.description?.trim()) {
        cleanedResponse.description = response.description.trim();
      }
      if (response.priority && typeof response.priority === 'string') {
        cleanedResponse.priority = response.priority as Priority;
      }
      if (response.size && typeof response.size === 'string') {
        cleanedResponse.size = response.size as TaskSize;
      }
      if (response.assignee?.trim()) {
        cleanedResponse.assignee = response.assignee.trim();
      }
      if (response.dueDate?.trim()) {
        cleanedResponse.dueDate = response.dueDate.trim();
      }
      if (response.estimatedHours) {
        cleanedResponse.estimatedHours = response.estimatedHours;
      }
      if (response.tags && response.tags.length > 0) {
        cleanedResponse.tags = response.tags
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag.length > 0);
      }

      logger.info('Task creation completed', {
        title: cleanedResponse.title,
        priority: cleanedResponse.priority,
        size: cleanedResponse.size,
        hasDueDate: !!cleanedResponse.dueDate,
        hasAssignee: !!cleanedResponse.assignee,
        tagCount: cleanedResponse.tags?.length ?? 0,
      });
      return cleanedResponse;
    },
    { hasDefaults: !!defaults }
  );
}

/**
 * Move task interactive prompt
 */
export async function moveTaskPrompt(
  taskId: string,
  availableColumns: Array<{ id: string; name: string; taskCount: number }>
): Promise<MoveTaskInput> {
  return withErrorHandling(
    'Move task',
    async () => {
      logger.info('Starting move task prompt', {
        taskId,
        availableColumns: availableColumns.length,
      });
      formatter.info(chalk.cyan(`\n🔄 Move Task ${taskId}\n`));
      formatter.info(chalk.gray('Press Ctrl+C to cancel at any time\n'));

      const response = await safePrompt<{
        targetColumn: string;
        position: string;
      }>([
        {
          type: 'select',
          name: 'targetColumn',
          message: 'Move to column:',
          choices: availableColumns.map(col => ({
            name: `${col.name} (${col.taskCount} tasks)`,
            value: col.id,
          })),
        },
        {
          type: 'select',
          name: 'position',
          message: 'Position in column:',
          choices: [
            { name: 'Top', value: 'top' },
            { name: 'Bottom', value: 'bottom' },
            { name: 'Specific position', value: 'specific' },
          ],
        },
      ]);

      let position: number | undefined;

      if (response.position === 'specific') {
        const targetCol = availableColumns.find(c => c.id === response.targetColumn);
        const maxPosition = targetCol?.taskCount ?? 0;

        const posResponse = await safePrompt<{ position: number }>({
          type: 'numeral',
          name: 'position',
          message: `Position (1-${maxPosition + 1}):`,
          min: 1,
          max: maxPosition + 1,
          initial: 1,
        });

        position = posResponse.position - 1; // Convert to 0-based index
      } else if (response.position === 'top') {
        position = 0;
      }
      // 'bottom' leaves position undefined, which means append

      const result: MoveTaskInput = {
        taskId,
        targetColumn: response.targetColumn,
        ...(position !== undefined && { position }),
      };
      logger.info('Move task completed', result);
      return result;
    },
    { taskId, availableColumns: availableColumns.length }
  );
}

/**
 * Bulk task action prompt
 */
export async function bulkTaskActionPrompt(
  tasks: Array<{ id: string; title: string; status: string }>
): Promise<BulkActionInput | null> {
  return withErrorHandling(
    'Bulk task action',
    async () => {
      logger.info('Starting bulk action prompt', {
        taskCount: tasks.length,
        taskIds: tasks.map(t => t.id),
      });
      formatter.info(chalk.cyan(`\n📦 Bulk Action for ${tasks.length} tasks\n`));
      formatter.info(chalk.gray('Press Ctrl+C to cancel at any time\n'));

      // Show selected tasks
      formatter.info(chalk.gray('Selected tasks:'));
      tasks.forEach((task, index) => {
        if (index < 5) {
          formatter.info(chalk.gray(`  - [${task.id}] ${task.title}`));
        }
      });
      if (tasks.length > 5) {
        formatter.info(chalk.gray(`  ... and ${tasks.length - 5} more`));
      }
      formatter.info('');

      const { action } = await safePrompt<{ action: string }>({
        type: 'select',
        name: 'action',
        message: 'Choose bulk action:',
        choices: [
          { name: 'Move to column', value: 'move' },
          { name: 'Assign to user', value: 'assign' },
          { name: 'Add tags', value: 'tag' },
          { name: 'Archive tasks', value: 'archive' },
          { name: 'Delete tasks', value: 'delete' },
          { name: 'Cancel', value: 'cancel' },
        ],
      });

      if (action === 'cancel') {
        logger.info('Bulk action cancelled by user', { taskCount: tasks.length });
        return null;
      }

      const taskIds = tasks.map(t => t.id);
      const params: Record<string, unknown> = {};

      switch (action) {
        case 'move': {
          const { column } = await safePrompt<{ column: string }>({
            type: 'input',
            name: 'column',
            message: 'Target column name:',
            validate: (value: string) => (value.trim() ? true : 'Column name required'),
          });
          params.column = column;
          break;
        }

        case 'assign': {
          const { assignee } = await safePrompt<{ assignee: string }>({
            type: 'input',
            name: 'assignee',
            message: 'Assign to (username or email):',
            validate: (value: string) => (value.trim() ? true : 'Assignee required'),
          });
          params.assignee = assignee;
          break;
        }

        case 'tag': {
          const { tags } = await safePrompt<{ tags: string[] }>({
            type: 'list',
            name: 'tags',
            message: 'Add tags (comma-separated):',
            separator: ',',
            validate: (value: string[]) => (value.length > 0 ? true : 'At least one tag required'),
          });
          params.tags = tags.map(t => t.trim()).filter(t => t.length > 0);
          break;
        }

        case 'delete': {
          const { confirm } = await safePrompt<{ confirm: boolean }>({
            type: 'confirm',
            name: 'confirm',
            message: chalk.red(`Are you sure you want to delete ${tasks.length} tasks?`),
            initial: false,
          });
          if (!confirm) {
            return null;
          }
          break;
        }

        case 'archive': {
          const { confirm } = await safePrompt<{ confirm: boolean }>({
            type: 'confirm',
            name: 'confirm',
            message: `Archive ${tasks.length} tasks?`,
            initial: true,
          });
          if (!confirm) {
            return null;
          }
          break;
        }

        default:
          // Should never reach here due to action validation, but required for ESLint
          throw new Error(`Unknown action: ${action}`);
      }

      const result: BulkActionInput = {
        taskIds,
        action: action as BulkActionInput['action'],
        ...(Object.keys(params).length > 0 && { params }),
      };
      logger.info('Bulk action completed', { action, taskCount: taskIds.length, params });
      return result;
    },
    { taskCount: tasks.length }
  );
}

/**
 * Task filter prompt
 */
export async function taskFilterPrompt(): Promise<{
  status?: string[];
  priority?: Priority[];
  assignee?: string;
  tags?: string[];
  dateRange?: { start: string; end: string };
}> {
  return withErrorHandling('Task filter configuration', async () => {
    logger.info('Starting task filter prompt');
    formatter.info(chalk.cyan('\n🔍 Filter Tasks\n'));
    formatter.info(chalk.gray('Press Ctrl+C to cancel at any time\n'));

    const response = await safePrompt<{
      filterBy: string[];
    }>({
      type: 'multiselect',
      name: 'filterBy',
      message: 'Filter by:',
      choices: [
        { name: 'Status', value: 'status' },
        { name: 'Priority', value: 'priority' },
        { name: 'Assignee', value: 'assignee' },
        { name: 'Tags', value: 'tags' },
        { name: 'Date range', value: 'dateRange' },
      ],
      hint: 'Space to select, Enter to continue',
    });

    const filters: Record<string, unknown> = {};

    if (response.filterBy.includes('status')) {
      const { status } = await safePrompt<{ status: string[] }>({
        type: 'multiselect',
        name: 'status',
        message: 'Select statuses:',
        choices: [
          { name: 'To Do', value: 'todo' },
          { name: 'In Progress', value: 'in_progress' },
          { name: 'Done', value: 'done' },
          { name: 'Blocked', value: 'blocked' },
          { name: 'Cancelled', value: 'cancelled' },
        ],
      });
      if (status.length > 0) filters.status = status;
    }

    if (response.filterBy.includes('priority')) {
      const { priority } = await safePrompt<{ priority: Priority[] }>({
        type: 'multiselect',
        name: 'priority',
        message: 'Select priorities:',
        choices: PRIORITIES.map(p => ({ name: p, value: p })),
      });
      if (priority.length > 0) filters.priority = priority;
    }

    if (response.filterBy.includes('assignee')) {
      const { assignee } = await safePrompt<{ assignee: string }>({
        type: 'input',
        name: 'assignee',
        message: 'Assignee (username or email):',
      });
      if (assignee.trim()) filters.assignee = assignee.trim();
    }

    if (response.filterBy.includes('tags')) {
      const { tags } = await safePrompt<{ tags: string[] }>({
        type: 'list',
        name: 'tags',
        message: 'Tags (comma-separated):',
        separator: ',',
      });
      if (tags.length > 0) {
        filters.tags = tags.map(t => t.trim()).filter(t => t.length > 0);
      }
    }

    if (response.filterBy.includes('dateRange')) {
      const dateRange = await safePrompt<{ start: string; end: string }>([
        {
          type: 'input',
          name: 'start',
          message: 'Start date (YYYY-MM-DD):',
          validate: validateDate,
        },
        {
          type: 'input',
          name: 'end',
          message: 'End date (YYYY-MM-DD):',
          validate: validateDate,
        },
      ]);
      if (dateRange.start && dateRange.end) {
        filters.dateRange = dateRange;
      }
    }

    logger.info('Filter configuration completed', {
      filterTypes: Object.keys(filters),
      filterCount: Object.keys(filters).length,
    });
    return filters;
  });
}
