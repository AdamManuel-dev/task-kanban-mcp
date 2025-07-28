import prompts from 'prompts';
import chalk from 'chalk';
import { validateBoardName, validateColumnName } from './validators';
import { logger } from '../../utils/logger';

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
 * Note: Console.log is intentionally used here for CLI user interface display
 * alongside structured logging for debugging/monitoring
 */
export async function quickBoardSetup(
  defaults?: Partial<BoardSetupInput>
): Promise<BoardSetupInput> {
  try {
    logger.info('Starting quick board setup', { hasDefaults: !!defaults });
    // Console output is intentional for CLI user interface
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
      logger.warn('Board setup cancelled - no name provided');
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
      default:
        // Default to basic template
        columns = [
          { name: 'To Do', order: 0 },
          { name: 'In Progress', order: 1 },
          { name: 'Done', order: 2 },
        ];
        break;
    }
  } else {
    // Custom columns - sequential prompting is necessary for dynamic column creation
    let addingColumns = true;
    let order = 0;

    // Note: Sequential await in loop is intentional here - we need to collect
    // column names one by one until user decides to stop
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
      logger.error('Board setup failed - no columns configured');
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
  logger.info('Board configuration completed', {
    name: boardInfo.name,
    description: boardInfo.description,
    isPublic,
    columnCount: columns.length,
    columns: columns.map(c => c.name)
  });
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
      description: boardInfo.description ?? undefined,
      columns,
      isPublic,
    };
  } catch (error) {
    logger.error('Quick board setup failed', {
      error: error instanceof Error ? error.message : String(error),
      hasDefaults: !!defaults
    });
    throw error;
  }
}

/**
 * Confirm action utility
 */
export async function confirmAction(message: string, defaultAnswer = false): Promise<boolean> {
  try {
    logger.debug('Confirmation prompt', { message, defaultAnswer });
    const response = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message,
      initial: defaultAnswer,
    });

    const confirmed = response.confirmed ?? false;
    logger.debug('Confirmation result', { confirmed, message });
    return confirmed;
  } catch (error) {
    logger.error('Confirmation prompt failed', {
      error: error instanceof Error ? error.message : String(error),
      message
    });
    throw error;
  }
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
    logger.warn('No items available for selection', { context: message });
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
  try {
    logger.info('Starting add column prompt', { existingColumnCount: existingColumns.length });
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
      logger.info('Add column cancelled - no name provided');
      return null;
    }

  let afterColumn: string | undefined;

  if (response.position === 'after' && existingColumns.length > 0) {
    const selected = await selectFromList('Insert after which column?', existingColumns);

    if (selected && !Array.isArray(selected)) {
      afterColumn = selected.id;
    }
  }

    const result: ColumnInput = {
      name: response.name,
      position: response.position,
      ...(afterColumn !== undefined && { afterColumn }),
    };
    
    logger.info('Add column completed', { columnName: response.name, position: response.position });
    return result;
  } catch (error) {
    logger.error('Add column prompt failed', {
      error: error instanceof Error ? error.message : String(error),
      existingColumnCount: existingColumns.length
    });
    throw error;
  }
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
  try {
    logger.info('Opening board settings', { currentName: currentSettings.name });
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
        initial: currentSettings.autoArchiveDays ?? 0,
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
    changes.description = response.description ?? undefined;
  }
  if (response.isPublic !== currentSettings.isPublic) {
    changes.isPublic = response.isPublic;
  }
  if (response.defaultAssignee !== currentSettings.defaultAssignee) {
    changes.defaultAssignee = response.defaultAssignee ?? undefined;
  }
  if (response.autoArchiveDays !== currentSettings.autoArchiveDays) {
    changes.autoArchiveDays = response.autoArchiveDays ?? undefined;
  }

    logger.info('Board settings updated', {
      changeCount: Object.keys(changes).length,
      changes: Object.keys(changes)
    });
    return changes;
  } catch (error) {
    logger.error('Board settings prompt failed', {
      error: error instanceof Error ? error.message : String(error),
      boardName: currentSettings.name
    });
    throw error;
  }
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
  try {
    logger.warn('Delete confirmation requested', {
      itemType,
      itemName,
      hasWarning: !!options?.showWarning,
      requireTyping: !!options?.requireTyping
    });
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
        logger.info('Delete cancelled - confirmation text mismatch', { itemType, itemName });
        return false;
      }
    }

    const confirmed = await confirmAction(`Are you sure you want to delete this ${itemType}?`, false);
    logger.warn('Delete confirmation result', { itemType, itemName, confirmed });
    return confirmed;
  } catch (error) {
    logger.error('Delete confirmation failed', {
      error: error instanceof Error ? error.message : String(error),
      itemType,
      itemName
    });
    throw error;
  }
}
