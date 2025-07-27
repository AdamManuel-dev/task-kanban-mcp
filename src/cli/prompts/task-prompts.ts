import { prompt } from 'enquirer';
import chalk from 'chalk';
import type { Priority, TaskSize } from './validators';
import {
  validateTaskTitle,
  validatePriority,
  validateTaskSize,
  validateDate,
  validateTimeEstimate,
  PRIORITIES,
  TASK_SIZES,
} from './validators';
import { spinner } from '../utils/spinner';

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
  params?: Record<string, any>;
}

/**
 * Create task interactive prompt
 */
export async function createTaskPrompt(defaults?: Partial<TaskInput>): Promise<TaskInput> {
  console.log(chalk.cyan('\n📝 Create New Task\n'));

  const response = await prompt<TaskInput>([
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
      message: 'Task size:',
      choices: [
        { name: 'S', value: 'S', hint: 'Small - Less than 2 hours' },
        { name: 'M', value: 'M', hint: 'Medium - 2-4 hours' },
        { name: 'L', value: 'L', hint: 'Large - 4-8 hours' },
        { name: 'XL', value: 'XL', hint: 'Extra Large - More than 8 hours' },
        { name: 'Skip', value: undefined, hint: 'No size estimate' },
      ],
      initial: defaults?.size ? TASK_SIZES.indexOf(defaults.size) : 1,
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
      validate: (value: string) => {
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
}

/**
 * Move task interactive prompt
 */
export async function moveTaskPrompt(
  taskId: string,
  availableColumns: Array<{ id: string; name: string; taskCount: number }>
): Promise<MoveTaskInput> {
  console.log(chalk.cyan(`\n🔄 Move Task ${taskId}\n`));

  const response = await prompt<{
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
    const maxPosition = targetCol?.taskCount || 0;

    const posResponse = await prompt<{ position: number }>({
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
}

/**
 * Bulk task action prompt
 */
export async function bulkTaskActionPrompt(
  tasks: Array<{ id: string; title: string; status: string }>
): Promise<BulkActionInput | null> {
  console.log(chalk.cyan(`\n📦 Bulk Action for ${tasks.length} tasks\n`));

  // Show selected tasks
  console.log(chalk.gray('Selected tasks:'));
  tasks.forEach((task, index) => {
    if (index < 5) {
      console.log(chalk.gray(`  - [${task.id}] ${task.title}`));
    }
  });
  if (tasks.length > 5) {
    console.log(chalk.gray(`  ... and ${tasks.length - 5} more`));
  }
  console.log();

  const { action } = await prompt<{ action: string }>({
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
  const params: Record<string, any> = {};

  switch (action) {
    case 'move': {
      const { column } = await prompt<{ column: string }>({
        type: 'input',
        name: 'column',
        message: 'Target column name:',
        validate: (value: string) => (value.trim() ? true : 'Column name required'),
      });
      params.column = column;
      break;
    }

    case 'assign': {
      const { assignee } = await prompt<{ assignee: string }>({
        type: 'input',
        name: 'assignee',
        message: 'Assign to (username or email):',
        validate: (value: string) => (value.trim() ? true : 'Assignee required'),
      });
      params.assignee = assignee;
      break;
    }

    case 'tag': {
      const { tags } = await prompt<{ tags: string[] }>({
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
      const { confirm } = await prompt<{ confirm: boolean }>({
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
      const { confirm } = await prompt<{ confirm: boolean }>({
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
  }

  return {
    taskIds,
    action: action as BulkActionInput['action'],
    params: Object.keys(params).length > 0 ? params : undefined,
  };
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
  console.log(chalk.cyan('\n🔍 Filter Tasks\n'));

  const response = await prompt<{
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

  const filters: any = {};

  if (response.filterBy.includes('status')) {
    const { status } = await prompt<{ status: string[] }>({
      type: 'multiselect',
      name: 'status',
      message: 'Select statuses:',
      choices: ['todo', 'in_progress', 'done', 'blocked', 'cancelled'],
    });
    if (status.length > 0) filters.status = status;
  }

  if (response.filterBy.includes('priority')) {
    const { priority } = await prompt<{ priority: Priority[] }>({
      type: 'multiselect',
      name: 'priority',
      message: 'Select priorities:',
      choices: PRIORITIES.map(p => ({ name: p, value: p })),
    });
    if (priority.length > 0) filters.priority = priority;
  }

  if (response.filterBy.includes('assignee')) {
    const { assignee } = await prompt<{ assignee: string }>({
      type: 'input',
      name: 'assignee',
      message: 'Assignee (username or email):',
    });
    if (assignee.trim()) filters.assignee = assignee.trim();
  }

  if (response.filterBy.includes('tags')) {
    const { tags } = await prompt<{ tags: string[] }>({
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
    const dateRange = await prompt<{ start: string; end: string }>([
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
}
