import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger';

type OutputFormat = 'table' | 'json' | 'csv';

interface FormatterOptions {
  format: OutputFormat;
  verbose: boolean;
  quiet: boolean;
  color: boolean;
}

export class OutputFormatter {
  private readonly options: FormatterOptions = {
    format: 'table',
    verbose: false,
    quiet: false,
    color: true,
  };

  /**
   * Set the output format for data display
   */
  setFormat(format: OutputFormat): void {
    this.options.format = format;
  }

  /**
   * Enable or disable verbose output mode
   */
  setVerbose(verbose: boolean): void {
    this.options.verbose = verbose;
  }

  /**
   * Enable or disable quiet mode (suppresses most output)
   */
  setQuiet(quiet: boolean): void {
    this.options.quiet = quiet;
  }

  /**
   * Enable or disable colored output
   */
  setColor(color: boolean): void {
    this.options.color = color;
  }

  /**
   * Format and output data in the specified format
   */
  output<T = unknown>(data: T, options?: { headers?: string[]; fields?: string[] }): void {
    if (this.options.quiet && this.options.format !== 'json') {
      return;
    }

    switch (this.options.format) {
      case 'json':
        OutputFormatter.outputJson(data);
        break;
      case 'csv':
        this.outputCsv(data, options);
        break;
      case 'table':
      default:
        this.outputTable(data, options);
        break;
    }
  }

  /**
   * Output success message
   */
  success(message: string): void {
    if (!this.options.quiet) {
      logger.info(this.colorize(message, 'green'));
    }
  }

  /**
   * Output error message
   */
  error(message: string): void {
    logger.error(this.colorize(`Error: ${String(message)}`, 'red'));
  }

  /**
   * Output warning message
   */
  warn(message: string): void {
    if (!this.options.quiet) {
      logger.warn(this.colorize(`Warning: ${String(message)}`, 'yellow'));
    }
  }

  /**
   * Output info message
   */
  info(message: string): void {
    if (this.options.verbose && !this.options.quiet) {
      logger.info(this.colorize(message, 'cyan'));
    }
  }

  /**
   * Output debug message
   */
  debug(message: string): void {
    if (this.options.verbose && !this.options.quiet) {
      logger.info(this.colorize(`Debug: ${String(message)}`, 'gray'));
    }
  }

  /**
   * Output JSON format
   */
  private static outputJson<T>(data: T): void {
    console.log(JSON.stringify(data, null, 2));
  }

  /**
   * Output CSV format
   */
  private outputCsv<T>(data: T, options?: { headers?: string[]; fields?: string[] }): void {
    let itemsToProcess: T[];
    if (!Array.isArray(data)) {
      itemsToProcess = [data];
    } else {
      itemsToProcess = data;
    }

    const normalizedItems = Array.isArray(itemsToProcess) ? itemsToProcess : [itemsToProcess];

    if (normalizedItems.length === 0) {
      return;
    }

    const fieldNames = options?.fields ?? Object.keys(normalizedItems[0] as Record<string, unknown>);
    const columnHeaders = options?.headers ?? fieldNames;

    // Output headers
    logger.info(columnHeaders.join(','));

    // Output rows
    normalizedItems.forEach((currentItem): void => {
      const rowValues = fieldNames.map((fieldName): string => {
        const fieldValue = OutputFormatter.getNestedValue(currentItem, fieldName);
        const formattedValue = this.formatValue(fieldValue);
        // Escape commas and quotes in CSV
        return `"${formattedValue.replace(/"/g, '""')}"`;
      });
      logger.info(rowValues.join(','));
    });
  }

  /**
   * Output table format
   */
  private outputTable<T>(data: T, options?: { headers?: string[]; fields?: string[] }): void {
    if (!Array.isArray(data)) {
      // Single object - display as key-value pairs
      this.outputObjectTable(data);
      return;
    }

    const tableItems = Array.isArray(data) ? data : [data];
    if (tableItems.length === 0) {
      logger.info(this.colorize('No items found', 'gray'));
      return;
    }

    const tableFields = options?.fields ?? OutputFormatter.getTableFields(tableItems[0]);
    const tableHeaders =
      options?.headers ??
      tableFields.map((fieldName: string): string => OutputFormatter.formatHeader(fieldName));

    const table = new Table({
      head: tableHeaders.map((headerText: string): string => this.colorize(headerText, 'cyan')),
      style: {
        'padding-left': 1,
        'padding-right': 1,
        head: this.options.color ? ['cyan'] : [],
      },
    });

    tableItems.forEach((currentItem): void => {
      const tableRow = tableFields.map((fieldName: string): string => {
        const fieldValue = OutputFormatter.getNestedValue(currentItem, fieldName);
        return this.formatTableValue(fieldValue, fieldName);
      });
      table.push(tableRow);
    });

    logger.info(table.toString());
  }

  /**
   * Output single object as key-value table
   */
  private outputObjectTable<T>(obj: T): void {
    const table = new Table({
      style: {
        'padding-left': 1,
        'padding-right': 1,
      },
    });

    Object.entries(obj as Record<string, unknown>).forEach(([key, value]): void => {
      table.push([
        this.colorize(OutputFormatter.formatHeader(key), 'cyan'),
        this.formatTableValue(value as unknown, key),
      ]);
    });

    logger.info(table.toString());
  }

  /**
   * Get nested value from object using dot notation
   */
  private static getNestedValue(obj: unknown, path: string): unknown {
    return path
      .split('.')
      .reduce(
        (current: unknown, key): unknown =>
          current && current[key] !== undefined ? current[key] : '',
        obj
      );
  }

  /**
   * Format value for display
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    if (value instanceof Date) {
      return value.toLocaleString();
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Format value for table display with colors
   */
  private formatTableValue(value: unknown, field: string): string {
    const formatted = this.formatValue(value);

    if (!this.options.color) {
      return formatted;
    }

    // Apply field-specific coloring
    if (field.includes('status')) {
      if (formatted.toLowerCase().includes('completed')) {
        return chalk.green(formatted);
      }
      if (formatted.toLowerCase().includes('in_progress')) {
        return chalk.yellow(formatted);
      }
      if (formatted.toLowerCase().includes('todo')) {
        return chalk.blue(formatted);
      }
    }

    if (field.includes('priority')) {
      const num = parseInt(formatted, 10);
      if (num >= 8) return chalk.red(formatted);
      if (num >= 5) return chalk.yellow(formatted);
      if (num >= 1) return chalk.green(formatted);
    }

    if (field.includes('date') || field.includes('time')) {
      return chalk.gray(formatted);
    }

    return formatted;
  }

  /**
   * Format header text
   */
  private static formatHeader(field: string): string {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str): string => str.toUpperCase())
      .trim();
  }

  /**
   * Get appropriate fields for table display
   */
  private static getTableFields(obj: Record<string, unknown>): string[] {
    const allFields = Object.keys(obj);

    // Define field priority for common objects
    const priorities = {
      id: 1,
      title: 2,
      name: 2,
      status: 3,
      priority: 4,
      description: 5,
      createdAt: 8,
      updatedAt: 9,
    };

    // Sort fields by priority, then alphabetically
    return allFields.sort((a, b): number => {
      const priorityA = priorities[a as keyof typeof priorities] ?? 6;
      const priorityB = priorities[b as keyof typeof priorities] ?? 6;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return a.localeCompare(b);
    });
  }

  /**
   * Apply color if color is enabled
   */
  private colorize(text: string, color: string): string {
    if (!this.options.color) {
      return text;
    }

    switch (color) {
      case 'red':
        return chalk.red(text);
      case 'green':
        return chalk.green(text);
      case 'yellow':
        return chalk.yellow(text);
      case 'blue':
        return chalk.blue(text);
      case 'cyan':
        return chalk.cyan(text);
      case 'gray':
        return chalk.gray(text);
      default:
        return text;
    }
  }

  /**
   * Create a progress bar
   */
  progressBar(current: number, total: number, width = 20): string {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const text = `${bar} ${percentage}% (${current}/${total})`;

    return this.options.color ? chalk.cyan(text) : text;
  }

  /**
   * Format file size
   */
  static formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Format duration
   */
  static formatDuration(ms: number): string {
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
   * Format backup schedule information
   */
  formatSchedule(schedule: unknown): string {
    const lines: string[] = [];

    // Header
    lines.push(OutputFormatter.formatHeader(`Schedule: ${schedule.name}`));
    lines.push('');

    // Basic info
    lines.push(`ID: ${schedule.id}`);
    lines.push(`Type: ${schedule.backupType?.toUpperCase() ?? 'N/A'}`);
    lines.push(
      `Status: ${schedule.enabled ? chalk.green('ENABLED') : chalk.red('DISABLED')}`
    );
    lines.push(`Cron: ${schedule.cronExpression ?? schedule.cron ?? 'N/A'}`);

    if (schedule.description) {
      lines.push(`Description: ${schedule.description}`);
    }

    // Timing info
    lines.push('');
    lines.push(OutputFormatter.formatHeader('Timing:'));
    lines.push(`Created: ${new Date(schedule.createdAt).toLocaleString()}`);
    lines.push(`Updated: ${new Date(schedule.updatedAt).toLocaleString()}`);

    if (schedule.lastRunAt) {
      lines.push(`Last Run: ${new Date(schedule.lastRunAt).toLocaleString()}`);
    }

    if (schedule.nextRunAt ?? schedule.next_run) {
      lines.push(
        `Next Run: ${new Date(schedule.nextRunAt ?? schedule.next_run).toLocaleString()}`
      );
    }

    // Statistics
    lines.push('');
    lines.push(OutputFormatter.formatHeader('Statistics:'));
    lines.push(`Total Runs: ${schedule.runCount ?? 0}`);
    lines.push(`Failures: ${schedule.failureCount ?? 0}`);

    if (schedule.runCount > 0) {
      const successRate = (
        ((schedule.runCount - (schedule.failureCount ?? 0)) / schedule.runCount) *
        100
      ).toFixed(1);
      lines.push(`Success Rate: ${successRate}%`);
    }

    // Configuration
    lines.push('');
    lines.push(OutputFormatter.formatHeader('Configuration:'));
    lines.push(`Retention: ${schedule.retentionDays ?? 30} days`);
    lines.push(
      `Compression: ${schedule.compressionEnabled ? 'Enabled' : 'Disabled'}`
    );
    lines.push(
      `Verification: ${schedule.verificationEnabled ? 'Enabled' : 'Disabled'}`
    );

    return lines.join('\n');
  }
}
