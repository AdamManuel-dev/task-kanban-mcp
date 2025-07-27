import chalk from 'chalk';
import {
  format,
  isToday,
  isTomorrow,
  isYesterday,
  isThisWeek,
  isThisYear,
  formatDistanceToNow,
} from 'date-fns';

/**
 * Utility functions for formatting CLI output
 */

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${String(String(size.toFixed(1)))} ${String(units[unitIndex])}`;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${String(days)}d ${String(hours % 24)}h`;
  if (hours > 0) return `${String(hours)}h ${String(minutes % 60)}m`;
  if (minutes > 0) return `${String(minutes)}m ${String(seconds % 60)}s`;
  return `${String(seconds)}s`;
}

/**
 * Format date/time in various formats
 */
export function formatDateTime(date: Date | string, formatStr = 'yyyy-MM-dd HH:mm:ss'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, formatStr);
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${String(days)} day${String(days > 1 ? 's' : '')} ago`;
  if (hours > 0) return `${String(hours)} hour${String(hours > 1 ? 's' : '')} ago`;
  if (minutes > 0) return `${String(minutes)} minute${String(minutes > 1 ? 's' : '')} ago`;
  return 'just now';
}

/**
 * Format relative time using date-fns (more natural language)
 */
export function formatRelativeTimeNatural(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNow(dateObj, { addSuffix: true });
}

/**
 * Format date for due dates with smart context
 */
export function formatDueDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isToday(dateObj)) {
    return chalk.yellow('Due today');
  }

  if (isTomorrow(dateObj)) {
    return chalk.yellow('Due tomorrow');
  }

  if (isYesterday(dateObj)) {
    return chalk.red('Overdue (yesterday)');
  }

  const now = new Date();
  if (dateObj < now) {
    return chalk.red(`Overdue (${String(formatDistanceToNow(dateObj))} ago)`);
  }

  if (isThisWeek(dateObj)) {
    return `Due ${String(format(dateObj, 'EEEE'))}`;
  }

  if (isThisYear(dateObj)) {
    return `Due ${String(format(dateObj, 'MMM d'))}`;
  }

  return `Due ${String(format(dateObj, 'MMM d, yyyy'))}`;
}

/**
 * Format date with time if it's today, date only otherwise
 */
export function formatSmartDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isToday(dateObj)) {
    return format(dateObj, 'HH:mm');
  }

  if (isYesterday(dateObj)) {
    return `Yesterday ${String(format(dateObj, 'HH:mm'))}`;
  }

  if (isTomorrow(dateObj)) {
    return `Tomorrow ${String(format(dateObj, 'HH:mm'))}`;
  }

  if (isThisWeek(dateObj)) {
    return format(dateObj, 'EEE HH:mm');
  }

  if (isThisYear(dateObj)) {
    return format(dateObj, 'MMM d HH:mm');
  }

  return format(dateObj, 'MMM d, yyyy HH:mm');
}

/**
 * Format time range
 */
export function formatTimeRange(startDate: Date | string, endDate: Date | string): string {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  // Same day
  if (isToday(start) && isToday(end)) {
    return `Today ${String(format(start, 'HH:mm'))} - ${String(format(end, 'HH:mm'))}`;
  }

  // Same date
  if (format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) {
    return `${String(format(start, 'MMM d'))} ${String(format(start, 'HH:mm'))} - ${String(format(end, 'HH:mm'))}`;
  }

  // Different dates
  return `${String(formatSmartDateTime(start))} - ${String(formatSmartDateTime(end))}`;
}

/**
 * Format timestamp for logs and debugging
 */
export function formatTimestamp(date?: Date | string): string {
  let dateObj: Date;
  if (!date) {
    dateObj = new Date();
  } else if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }
  return format(dateObj, 'yyyy-MM-dd HH:mm:ss.SSS');
}

/**
 * Format ISO date for API calls
 */
export function formatISODate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toISOString();
}

/**
 * Format date for human display (short format)
 */
export function formatDateShort(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isToday(dateObj)) return 'Today';
  if (isYesterday(dateObj)) return 'Yesterday';
  if (isTomorrow(dateObj)) return 'Tomorrow';
  if (isThisWeek(dateObj)) return format(dateObj, 'EEEE');
  if (isThisYear(dateObj)) return format(dateObj, 'MMM d');

  return format(dateObj, 'MMM d, yyyy');
}

/**
 * Format working hours (business time)
 */
export function formatWorkingHours(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${String(minutes)}min`;
  }

  if (hours < 8) {
    return `${String(String(hours.toFixed(1)))}h`;
  }

  const days = Math.floor(hours / 8);
  const remainingHours = hours % 8;

  if (remainingHours === 0) {
    return `${String(days)}d`;
  }

  return `${String(days)}d ${String(String(remainingHours.toFixed(1)))}h`;
}

/**
 * Format task priority with color
 */
export function formatPriority(priority: string): string {
  const colors = {
    P1: chalk.red,
    P2: chalk.yellow,
    P3: chalk.blue,
    P4: chalk.green,
    P5: chalk.gray,
    CRITICAL: chalk.bgRed.white,
    HIGH: chalk.red,
    MEDIUM: chalk.yellow,
    LOW: chalk.green,
  };

  const colorFn = colors[priority as keyof typeof colors] ?? chalk.white;
  return colorFn(priority);
}

/**
 * Format task status with color and icon
 */
export function formatStatus(status: string): string {
  const statusMap = {
    todo: { icon: '○', color: chalk.gray },
    in_progress: { icon: '◐', color: chalk.yellow },
    'in-progress': { icon: '◐', color: chalk.yellow },
    done: { icon: '●', color: chalk.green },
    completed: { icon: '✓', color: chalk.green },
    blocked: { icon: '✕', color: chalk.red },
    cancelled: { icon: '⊘', color: chalk.gray },
  };

  const config = statusMap[status.toLowerCase() as keyof typeof statusMap] ?? {
    icon: '?',
    color: chalk.white,
  };

  return `${String(String(config.color(config.icon)))} ${String(String(config.color(status)))}`;
}

/**
 * Format percentage with color coding
 */
export function formatPercentage(value: number, total: number): string {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const rounded = Math.round(percentage);

  let color = chalk.green;
  if (rounded < 25) color = chalk.red;
  else if (rounded < 50) color = chalk.yellow;
  else if (rounded < 75) color = chalk.blue;

  return color(`${String(rounded)}%`);
}

/**
 * Format board column with task count
 */
export function formatBoardColumn(name: string, taskCount: number, maxWidth = 20): string {
  const truncatedName =
    name.length > maxWidth ? `${String(String(name.substring(0, maxWidth - 3)))}...` : name;

  return `${String(String(chalk.bold(truncatedName)))} (${String(taskCount)})`;
}

/**
 * Format task list item
 */
export function formatTaskListItem(task: {
  id: string;
  title: string;
  priority?: string;
  status?: string;
  assignee?: string;
}): string {
  const parts = [chalk.dim(`[${String(String(task.id))}]`), task.title];

  if (task.priority) {
    parts.push(formatPriority(task.priority));
  }

  if (task.status) {
    parts.push(formatStatus(task.status));
  }

  if (task.assignee) {
    parts.push(chalk.cyan(`@${String(String(task.assignee))}`));
  }

  return parts.join(' ');
}

/**
 * Format error message with stack trace
 */
export function formatError(error: Error | string, showStack = false): string {
  if (typeof error === 'string') {
    return chalk.red(`✖ ${String(error)}`);
  }

  const message = chalk.red(`✖ ${String(String(error.message))}`);

  if (showStack && error.stack) {
    const stack = error.stack
      .split('\n')
      .slice(1)
      .map(line => chalk.gray(`  ${String(String(line.trim()))}`))
      .join('\n');

    return `${String(message)}\n${String(stack)}`;
  }

  return message;
}

/**
 * Format success message
 */
export function formatSuccess(message: string): string {
  return chalk.green(`✓ ${String(message)}`);
}

/**
 * Format warning message
 */
export function formatWarning(message: string): string {
  return chalk.yellow(`⚠ ${String(message)}`);
}

/**
 * Format info message
 */
export function formatInfo(message: string): string {
  return chalk.blue(`ℹ ${String(message)}`);
}

/**
 * Create a progress bar string
 */
export function formatProgressBar(current: number, total: number, width = 20): string {
  const percentage = total > 0 ? current / total : 0;
  const filled = Math.round(width * percentage);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percentStr = formatPercentage(current, total);

  return `[${String(bar)}] ${String(percentStr)} (${String(current)}/${String(total)})`;
}

/**
 * Format key-value pairs for display
 */
export function formatKeyValue(key: string, value: unknown, keyWidth = 15): string {
  const paddedKey = key.padEnd(keyWidth);
  return `${String(String(chalk.gray(paddedKey)))} ${String(String(value))}`;
}

/**
 * Format a divider line
 */
export function formatDivider(char = '─', width = 60): string {
  return chalk.gray(char.repeat(width));
}

/**
 * Format a header with dividers
 */
export function formatHeader(title: string, width = 60): string {
  const padding = Math.max(0, width - title.length - 2);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;

  return [
    formatDivider('═', width),
    `${String(String(' '.repeat(leftPad)))}${String(String(chalk.bold(title)))}${String(String(' '.repeat(rightPad)))}`,
    formatDivider('═', width),
  ].join('\n');
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${String(String(text.substring(0, maxLength - 3)))}...`;
}

/**
 * Wrap text to specified width
 */
export function wrapText(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  words.forEach(word => {
    if (`${String(currentLine)} ${String(word)}`.trim().length <= width) {
      currentLine = `${String(currentLine)} ${String(word)}`.trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines;
}
