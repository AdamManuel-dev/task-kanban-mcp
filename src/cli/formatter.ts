import * as Table from 'cli-table3';
import chalk from 'chalk';

type OutputFormat = 'table' | 'json' | 'csv';

interface FormatterOptions {
  format: OutputFormat;
  verbose: boolean;
  quiet: boolean;
  color: boolean;
}

export class OutputFormatter {
  private options: FormatterOptions = {
    format: 'table',
    verbose: false,
    quiet: false,
    color: true,
  };

  setFormat(format: OutputFormat): void {
    this.options.format = format;
  }

  setVerbose(verbose: boolean): void {
    this.options.verbose = verbose;
  }

  setQuiet(quiet: boolean): void {
    this.options.quiet = quiet;
  }

  setColor(color: boolean): void {
    this.options.color = color;
  }

  /**
   * Format and output data in the specified format
   */
  output<T = any>(data: T, options?: { headers?: string[]; fields?: string[] }): void {
    if (this.options.quiet && this.options.format !== 'json') {
      return;
    }

    switch (this.options.format) {
      case 'json':
        this.outputJson(data);
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
      console.log(this.colorize(message, 'green'));
    }
  }

  /**
   * Output error message
   */
  error(message: string): void {
    console.error(this.colorize(`Error: ${message}`, 'red'));
  }

  /**
   * Output warning message
   */
  warn(message: string): void {
    if (!this.options.quiet) {
      console.warn(this.colorize(`Warning: ${message}`, 'yellow'));
    }
  }

  /**
   * Output info message
   */
  info(message: string): void {
    if (this.options.verbose && !this.options.quiet) {
      console.log(this.colorize(message, 'cyan'));
    }
  }

  /**
   * Output debug message
   */
  debug(message: string): void {
    if (this.options.verbose && !this.options.quiet) {
      console.log(this.colorize(`Debug: ${message}`, 'gray'));
    }
  }

  /**
   * Output JSON format
   */
  private outputJson<T>(data: T): void {
    console.log(JSON.stringify(data, null, 2));
  }

  /**
   * Output CSV format
   */
  private outputCsv<T>(data: T, options?: { headers?: string[]; fields?: string[] }): void {
    if (!Array.isArray(data)) {
      data = [data] as T;
    }

    const items = data as any[];
    if (items.length === 0) {
      return;
    }

    const fields = options?.fields || Object.keys(items[0]);
    const headers = options?.headers || fields;

    // Output headers
    console.log(headers.join(','));

    // Output rows
    items.forEach(item => {
      const values = fields.map(field => {
        const value = this.getNestedValue(item, field);
        const stringValue = this.formatValue(value);
        // Escape commas and quotes in CSV
        return `"${stringValue.replace(/"/g, '""')}"`;
      });
      console.log(values.join(','));
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

    const items = data as any[];
    if (items.length === 0) {
      console.log(this.colorize('No items found', 'gray'));
      return;
    }

    const fields = options?.fields || this.getTableFields(items[0]);
    const headers = options?.headers || fields.map(field => this.formatHeader(field));

    const table = new Table({
      head: headers.map(h => this.colorize(h, 'cyan')),
      style: {
        'padding-left': 1,
        'padding-right': 1,
        head: this.options.color ? ['cyan'] : [],
      },
    });

    items.forEach(item => {
      const row = fields.map(field => {
        const value = this.getNestedValue(item, field);
        return this.formatTableValue(value, field);
      });
      table.push(row);
    });

    console.log(table.toString());
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

    Object.entries(obj as any).forEach(([key, value]) => {
      table.push([
        this.colorize(this.formatHeader(key), 'cyan'),
        this.formatTableValue(value, key),
      ]);
    });

    console.log(table.toString());
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : '';
    }, obj);
  }

  /**
   * Format value for display
   */
  private formatValue(value: any): string {
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
  private formatTableValue(value: any, field: string): string {
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
      const num = parseInt(formatted);
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
  private formatHeader(field: string): string {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Get appropriate fields for table display
   */
  private getTableFields(obj: any): string[] {
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
    return allFields.sort((a, b) => {
      const priorityA = priorities[a as keyof typeof priorities] || 6;
      const priorityB = priorities[b as keyof typeof priorities] || 6;
      
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
  progressBar(current: number, total: number, width: number = 20): string {
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
  formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Format duration
   */
  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}