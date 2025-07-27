import chalk from 'chalk';
import { format } from 'date-fns';

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
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
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

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
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

  const colorFn = colors[priority as keyof typeof colors] || chalk.white;
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

  const config = statusMap[status.toLowerCase() as keyof typeof statusMap] || {
    icon: '?',
    color: chalk.white,
  };

  return `${config.color(config.icon)} ${config.color(status)}`;
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

  return color(`${rounded}%`);
}

/**
 * Format board column with task count
 */
export function formatBoardColumn(name: string, taskCount: number, maxWidth = 20): string {
  const truncatedName = name.length > maxWidth ? `${name.substring(0, maxWidth - 3)}...` : name;

  return `${chalk.bold(truncatedName)} (${taskCount})`;
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
  const parts = [chalk.dim(`[${task.id}]`), task.title];

  if (task.priority) {
    parts.push(formatPriority(task.priority));
  }

  if (task.status) {
    parts.push(formatStatus(task.status));
  }

  if (task.assignee) {
    parts.push(chalk.cyan(`@${task.assignee}`));
  }

  return parts.join(' ');
}

/**
 * Format error message with stack trace
 */
export function formatError(error: Error | string, showStack = false): string {
  if (typeof error === 'string') {
    return chalk.red(`✖ ${error}`);
  }

  const message = chalk.red(`✖ ${error.message}`);

  if (showStack && error.stack) {
    const stack = error.stack
      .split('\n')
      .slice(1)
      .map(line => chalk.gray(`  ${line.trim()}`))
      .join('\n');

    return `${message}\n${stack}`;
  }

  return message;
}

/**
 * Format success message
 */
export function formatSuccess(message: string): string {
  return chalk.green(`✓ ${message}`);
}

/**
 * Format warning message
 */
export function formatWarning(message: string): string {
  return chalk.yellow(`⚠ ${message}`);
}

/**
 * Format info message
 */
export function formatInfo(message: string): string {
  return chalk.blue(`ℹ ${message}`);
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

  return `[${bar}] ${percentStr} (${current}/${total})`;
}

/**
 * Format key-value pairs for display
 */
export function formatKeyValue(key: string, value: any, keyWidth = 15): string {
  const paddedKey = key.padEnd(keyWidth);
  return `${chalk.gray(paddedKey)} ${value}`;
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
    `${' '.repeat(leftPad)}${chalk.bold(title)}${' '.repeat(rightPad)}`,
    formatDivider('═', width),
  ].join('\n');
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 3)}...`;
}

/**
 * Wrap text to specified width
 */
export function wrapText(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (`${currentLine} ${word}`.trim().length <= width) {
      currentLine = `${currentLine} ${word}`.trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}
