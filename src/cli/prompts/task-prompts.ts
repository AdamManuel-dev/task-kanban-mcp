import { prompt } from 'enquirer';
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

// Define the prompt options type based on enquirer's internal types
interface PromptOptions {
  name: string;
  type: string;
  message: string;
  choices?: (string | { name: string; value?: any; hint?: string })[];
  initial?: any;
  validate?: (value: any) => boolean | string;
  format?: (value: any) => any;
  multiline?: boolean;
  hint?: string;
  float?: boolean;
  separator?: boolean;
  min?: number;
  max?: number;
}

interface TaskEstimation {
  size: TaskSize;
  avgHours: number;
  confidence: string;
  reasoning: string[];
}

interface FormatterInterface {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

// Simple formatter for prompts - falls back to console if no proper formatter available
const simpleFormatter: FormatterInterface = {
  info: (message: string): void => console.log(chalk.cyan(message)),
  success: (message: string): void => console.log(chalk.green(message)),
  warn: (message: string): void => console.log(chalk.yellow(message)),
  error: (message: string): void => console.log(chalk.red(message)),
};

/**
 * Error thrown when a prompt is cancelled
 */
export class PromptCancelledError extends Error {
  constructor(message = 'Prompt was cancelled by user') {
    super(message);
    this.name = 'PromptCancelledError';
  }
}

/**
 * Wrapper for prompt that handles cancellation
 */
async function safePrompt<T>(promptConfig: any): Promise<T> {
  try {
    return await prompt<T>(promptConfig);
  } catch (error) {
    // Check if it's a cancellation (Ctrl+C, ESC, etc.)
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (
        errorMessage.includes('cancel') ||
        errorMessage.includes('abort') ||
        errorMessage.includes('interrupt') ||
        error.name === 'SIGINT'
      ) {
        throw new PromptCancelledError(`Operation cancelled: ${error.message}`);
      }
    }
    // Re-throw other errors
    throw error;
  }
}

export interface TaskInput {
  title: string;
  description?: string;
  priority?: Priority;
  size?: TaskSize;
  assignee?: string;
  due_date?: string;
  estimated_hours?: number;
  tags?: string[];
}

export interface MoveTaskInput {
  taskId: string;
  targetColumn: string;
  position?: number;
}

export interface BulkActionInput {
  taskIds: string[];
  action: 'move' | 'delete' | 'archive' | 'assign' | 'tag';
  params?: Record<string, unknown>;
}

/**
 * Create task interactive prompt
 */
export async function createTaskPrompt(defaults?: Partial<TaskInput>): Promise<TaskInput> {
  try {
    simpleFormatter.info('\n📝 Create New Task\n');
    simpleFormatter.info(chalk.gray('Press Ctrl+C to cancel at any time\n'));

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
        estimation = estimator.estimateTime({
          title: basicInfo.title,
          description: basicInfo.description,
        }) as TaskEstimation;
        suggestedSize = estimation.size;

        // Show estimation
        simpleFormatter.info(chalk.cyan('\n🤖 AI Size Estimation:'));
        simpleFormatter.info(
          chalk.yellow(`  Suggested Size: ${suggestedSize} (${estimation.avgHours} hours)`)
        );
        simpleFormatter.info(chalk.gray(`  Confidence: ${estimation.confidence}`));
        if (estimation.reasoning?.length > 0) {
          simpleFormatter.info(chalk.gray('  Reasoning:'));
          estimation.reasoning.forEach((reason: string) => {
            simpleFormatter.info(chalk.gray(`    • ${reason}`));
          });
        }
        simpleFormatter.info('');
      } catch (error) {
        simpleFormatter.warn('⚠️  Size estimation unavailable\n');
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
        name: 'due_date',
        message: 'Due date (optional):',
        initial: defaults?.due_date,
        hint: 'Format: YYYY-MM-DD',
        validate: validateDate,
      },
      {
        type: 'numeral',
        name: 'estimated_hours',
        message: 'Estimated hours (optional):',
        initial: defaults?.estimated_hours,
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
    if (response.priority && response.priority !== 'undefined') {
      cleanedResponse.priority = response.priority as Priority;
    }
    if (response.size && response.size !== 'undefined') {
      cleanedResponse.size = response.size as TaskSize;
    }
    if (response.assignee?.trim()) {
      cleanedResponse.assignee = response.assignee.trim();
    }
    if (response.due_date?.trim()) {
      cleanedResponse.due_date = response.due_date.trim();
    }
    if (response.estimated_hours) {
      cleanedResponse.estimated_hours = response.estimated_hours;
    }
    if (response.tags && response.tags.length > 0) {
      cleanedResponse.tags = response.tags
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag.length > 0);
    }

    return cleanedResponse;
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      simpleFormatter.warn('\n⚠️  Task creation cancelled\n');
      throw error;
    }
    simpleFormatter.error(
      `\n❌ Failed to create task: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Move task interactive prompt
 */
export async function moveTaskPrompt(
  taskId: string,
  availableColumns: Array<{ id: string; name: string; taskCount: number }>
): Promise<MoveTaskInput> {
  try {
    simpleFormatter.info(chalk.cyan(`\n🔄 Move Task ${taskId}\n`));
    simpleFormatter.info(chalk.gray('Press Ctrl+C to cancel at any time\n'));

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

    return {
      taskId,
      targetColumn: response.targetColumn,
      position,
    };
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      simpleFormatter.warn('\n⚠️  Move operation cancelled\n');
      throw error;
    }
    simpleFormatter.error(
      `\n❌ Failed to move task: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Bulk task action prompt
 */
export async function bulkTaskActionPrompt(
  tasks: Array<{ id: string; title: string; status: string }>
): Promise<BulkActionInput | null> {
  try {
    simpleFormatter.info(chalk.cyan(`\n📦 Bulk Action for ${tasks.length} tasks\n`));
    simpleFormatter.info(chalk.gray('Press Ctrl+C to cancel at any time\n'));

    // Show selected tasks
    simpleFormatter.info(chalk.gray('Selected tasks:'));
    tasks.forEach((task, index) => {
      if (index < 5) {
        simpleFormatter.info(chalk.gray(`  - [${task.id}] ${task.title}`));
      }
    });
    if (tasks.length > 5) {
      simpleFormatter.info(chalk.gray(`  ... and ${tasks.length - 5} more`));
    }
    simpleFormatter.info('');

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

    return {
      taskIds,
      action: action as BulkActionInput['action'],
      params: Object.keys(params).length > 0 ? params : undefined,
    };
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      simpleFormatter.warn('\n⚠️  Bulk action cancelled\n');
      return null;
    }
    simpleFormatter.error(
      `\n❌ Failed to execute bulk action: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
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
  try {
    simpleFormatter.info(chalk.cyan('\n🔍 Filter Tasks\n'));
    simpleFormatter.info(chalk.gray('Press Ctrl+C to cancel at any time\n'));

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
        choices: ['todo', 'in_progress', 'done', 'blocked', 'cancelled'],
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

    return filters;
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      simpleFormatter.warn('\n⚠️  Filter cancelled\n');
      return {};
    }
    simpleFormatter.error(
      `\n❌ Failed to apply filters: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}
