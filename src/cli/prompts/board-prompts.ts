import prompts from 'prompts';
import chalk from 'chalk';
import { validateBoardName, validateColumnName } from './validators';
import { spinner } from '../utils/spinner';

export interface BoardSetupInput {
  name: string;
  description?: string;
  columns: Array<{ name: string; order: number }>;
  isPublic?: boolean;
}

export interface ColumnInput {
  name: string;
  position?: 'start' | 'end' | 'after';
  afterColumn?: string;
}

/**
 * Quick board setup with prompts library
 */
export async function quickBoardSetup(
  defaults?: Partial<BoardSetupInput>
): Promise<BoardSetupInput> {
  console.log(chalk.cyan('\n🚀 Quick Board Setup\n'));

  // Board name and description
  const boardInfo = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Board name:',
      initial: defaults?.name,
      validate: value => {
        const result = validateBoardName(value);
        return result === true ? true : result;
      },
    },
    {
      type: 'text',
      name: 'description',
      message: 'Description (optional):',
      initial: defaults?.description,
    },
  ]);

  if (!boardInfo.name) {
    throw new Error('Board setup cancelled');
  }

  // Column setup
  const { useTemplate } = await prompts({
    type: 'select',
    name: 'useTemplate',
    message: 'Column setup:',
    choices: [
      { title: 'Use template', value: 'template' },
      { title: 'Custom columns', value: 'custom' },
    ],
    initial: 0,
  });

  let columns: Array<{ name: string; order: number }> = [];

  if (useTemplate === 'template') {
    const { template } = await prompts({
      type: 'select',
      name: 'template',
      message: 'Choose template:',
      choices: [
        {
          title: 'Basic Kanban (To Do, In Progress, Done)',
          value: 'basic',
          description: 'Simple 3-column board',
        },
        {
          title: 'Scrum Board (Backlog, To Do, In Progress, Review, Done)',
          value: 'scrum',
          description: 'Standard Scrum workflow',
        },
        {
          title: 'Bug Tracking (New, Confirmed, In Progress, Testing, Resolved)',
          value: 'bugs',
          description: 'Bug tracking workflow',
        },
        {
          title: 'Content Pipeline (Ideas, Writing, Editing, Review, Published)',
          value: 'content',
          description: 'Content creation workflow',
        },
      ],
      initial: 0,
    });

    // Set columns based on template
    switch (template) {
      case 'basic':
        columns = [
          { name: 'To Do', order: 0 },
          { name: 'In Progress', order: 1 },
          { name: 'Done', order: 2 },
        ];
        break;
      case 'scrum':
        columns = [
          { name: 'Backlog', order: 0 },
          { name: 'To Do', order: 1 },
          { name: 'In Progress', order: 2 },
          { name: 'Review', order: 3 },
          { name: 'Done', order: 4 },
        ];
        break;
      case 'bugs':
        columns = [
          { name: 'New', order: 0 },
          { name: 'Confirmed', order: 1 },
          { name: 'In Progress', order: 2 },
          { name: 'Testing', order: 3 },
          { name: 'Resolved', order: 4 },
        ];
        break;
      case 'content':
        columns = [
          { name: 'Ideas', order: 0 },
          { name: 'Writing', order: 1 },
          { name: 'Editing', order: 2 },
          { name: 'Review', order: 3 },
          { name: 'Published', order: 4 },
        ];
        break;
    }
  } else {
    // Custom columns
    let addingColumns = true;
    let order = 0;

    while (addingColumns) {
      const { columnName } = await prompts({
        type: 'text',
        name: 'columnName',
        message: `Column ${order + 1} name (leave empty to finish):`,
        validate: value => {
          if (!value) return true; // Allow empty to finish
          const result = validateColumnName(value);
          return result === true ? true : result;
        },
      });

      if (!columnName) {
        addingColumns = false;
      } else {
        columns.push({ name: columnName, order });
        order++;
      }
    }

    if (columns.length === 0) {
      throw new Error('Board must have at least one column');
    }
  }

  // Public/Private setting
  const { isPublic } = await prompts({
    type: 'toggle',
    name: 'isPublic',
    message: 'Make board public?',
    initial: defaults?.isPublic ?? false,
    active: 'yes',
    inactive: 'no',
  });

  // Show summary
  console.log(chalk.green('\n✅ Board Configuration:'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(`Name: ${chalk.bold(boardInfo.name)}`);
  if (boardInfo.description) {
    console.log(`Description: ${boardInfo.description}`);
  }
  console.log(`Visibility: ${isPublic ? 'Public' : 'Private'}`);
  console.log(`Columns: ${columns.map(c => c.name).join(' → ')}`);
  console.log(chalk.gray('─'.repeat(40)));

  return {
    name: boardInfo.name,
    description: boardInfo.description || undefined,
    columns,
    isPublic,
  };
}

/**
 * Confirm action utility
 */
export async function confirmAction(message: string, defaultAnswer = false): Promise<boolean> {
  const response = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message,
    initial: defaultAnswer,
  });

  return response.confirmed ?? false;
}

/**
 * Select from list utility
 */
export async function selectFromList<T extends { id: string; name: string }>(
  message: string,
  items: T[],
  options?: {
    allowMultiple?: boolean;
    showDescription?: (item: T) => string;
  }
): Promise<T | T[] | null> {
  if (items.length === 0) {
    console.log(chalk.yellow('No items available to select'));
    return null;
  }

  const choices = items.map(item => ({
    title: item.name,
    value: item.id,
    description: options?.showDescription?.(item),
  }));

  if (options?.allowMultiple) {
    const response = await prompts({
      type: 'multiselect',
      name: 'selected',
      message,
      choices,
      hint: '- Space to select. Return to submit',
    });

    if (!response.selected || response.selected.length === 0) {
      return null;
    }

    return items.filter(item => response.selected.includes(item.id));
  }
  const response = await prompts({
    type: 'select',
    name: 'selected',
    message,
    choices,
  });

  if (!response.selected) {
    return null;
  }

  return items.find(item => item.id === response.selected) || null;
}

/**
 * Add column to existing board prompt
 */
export async function addColumnPrompt(
  existingColumns: Array<{ id: string; name: string; order: number }>
): Promise<ColumnInput | null> {
  console.log(chalk.cyan('\n➕ Add New Column\n'));

  const response = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Column name:',
      validate: value => {
        const result = validateColumnName(value);
        return result === true ? true : result;
      },
    },
    {
      type: 'select',
      name: 'position',
      message: 'Position:',
      choices: [
        { title: 'At the beginning', value: 'start' },
        { title: 'At the end', value: 'end' },
        { title: 'After specific column', value: 'after' },
      ],
      initial: 1, // Default to 'end'
    },
  ]);

  if (!response.name) {
    return null;
  }

  let afterColumn: string | undefined;

  if (response.position === 'after' && existingColumns.length > 0) {
    const selected = await selectFromList('Insert after which column?', existingColumns);

    if (selected && !Array.isArray(selected)) {
      afterColumn = selected.id;
    }
  }

  return {
    name: response.name,
    position: response.position,
    afterColumn,
  };
}

/**
 * Board settings prompt
 */
export async function boardSettingsPrompt(currentSettings: {
  name: string;
  description?: string;
  isPublic: boolean;
  defaultAssignee?: string;
  autoArchiveDays?: number;
}): Promise<Partial<typeof currentSettings>> {
  console.log(chalk.cyan('\n⚙️  Board Settings\n'));

  const response = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Board name:',
      initial: currentSettings.name,
      validate: value => {
        const result = validateBoardName(value);
        return result === true ? true : result;
      },
    },
    {
      type: 'text',
      name: 'description',
      message: 'Description:',
      initial: currentSettings.description,
    },
    {
      type: 'toggle',
      name: 'isPublic',
      message: 'Public board?',
      initial: currentSettings.isPublic,
      active: 'yes',
      inactive: 'no',
    },
    {
      type: 'text',
      name: 'defaultAssignee',
      message: 'Default assignee (optional):',
      initial: currentSettings.defaultAssignee,
    },
    {
      type: 'number',
      name: 'autoArchiveDays',
      message: 'Auto-archive completed tasks after (days, 0 to disable):',
      initial: currentSettings.autoArchiveDays || 0,
      min: 0,
      max: 365,
    },
  ]);

  // Filter out unchanged values
  const changes: Partial<typeof currentSettings> = {};

  if (response.name !== currentSettings.name) {
    changes.name = response.name;
  }
  if (response.description !== currentSettings.description) {
    changes.description = response.description || undefined;
  }
  if (response.isPublic !== currentSettings.isPublic) {
    changes.isPublic = response.isPublic;
  }
  if (response.defaultAssignee !== currentSettings.defaultAssignee) {
    changes.defaultAssignee = response.defaultAssignee || undefined;
  }
  if (response.autoArchiveDays !== currentSettings.autoArchiveDays) {
    changes.autoArchiveDays = response.autoArchiveDays || undefined;
  }

  return changes;
}

/**
 * Delete confirmation with safety check
 */
export async function confirmDelete(
  itemType: string,
  itemName: string,
  options?: {
    showWarning?: string;
    requireTyping?: boolean;
  }
): Promise<boolean> {
  console.log(chalk.red(`\n⚠️  Delete ${itemType}\n`));

  if (options?.showWarning) {
    console.log(chalk.yellow(options.showWarning));
    console.log();
  }

  console.log(`You are about to delete: ${chalk.bold(itemName)}`);
  console.log(chalk.gray('This action cannot be undone.\n'));

  if (options?.requireTyping) {
    const { confirmText } = await prompts({
      type: 'text',
      name: 'confirmText',
      message: `Type "${itemName}" to confirm:`,
      validate: value => (value === itemName ? true : `Please type exactly: ${itemName}`),
    });

    if (confirmText !== itemName) {
      return false;
    }
  }

  return confirmAction(`Are you sure you want to delete this ${itemType}?`, false);
}
