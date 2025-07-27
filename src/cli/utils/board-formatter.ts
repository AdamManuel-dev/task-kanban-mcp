import chalk from 'chalk';
import Table from 'cli-table3';
import { formatTaskListItem, formatBoardColumn, formatPercentage, truncate } from './formatter';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  assignee?: string;
  due_date?: string;
  tags?: string[];
}

export interface Column {
  id: string;
  name: string;
  tasks: Task[];
  order: number;
}

export interface Board {
  id: string;
  name: string;
  description?: string;
  columns: Column[];
}

/**
 * Format board output for CLI display
 */
export class BoardFormatter {
  /**
   * Format a complete board view
   */
  formatBoard(
    board: Board,
    options?: {
      maxWidth?: number;
      showDescription?: boolean;
      showStats?: boolean;
    }
  ): string {
    const { maxWidth = 120, showDescription = true, showStats = true } = options ?? {};
    const output: string[] = [];

    // Board header
    output.push(chalk.bold.cyan(`\n📋 ${String(String(board.name))}\n`));

    if (showDescription && board.description) {
      output.push(chalk.gray(board.description));
      output.push('');
    }

    // Board stats
    if (showStats) {
      const stats = this.calculateBoardStats(board);
      output.push(BoardFormatter.formatBoardStats(stats));
      output.push('');
    }

    // Create table for columns
    const table = new Table({
      head: board.columns.map(col => formatBoardColumn(col.name, col.tasks.length)),
      style: { head: ['cyan'] },
      colWidths: BoardFormatter.calculateColumnWidths(board.columns.length, maxWidth),
      wordWrap: true,
    });

    // Find max tasks in any column
    const maxTasks = Math.max(...board.columns.map(col => col.tasks.length));

    // Add rows
    for (let i = 0; i < maxTasks; i += 1) {
      const row = board.columns.map(col => {
        const task = col.tasks[i];
        return task ? BoardFormatter.formatTaskCard(task) : '';
      });
      table.push(row);
    }

    output.push(table.toString());
    return output.join('\n');
  }

  /**
   * Format a single task card for board view
   */
  private static formatTaskCard(task: Task): string {
    const lines: string[] = [];

    // Task ID and title
    lines.push(chalk.bold(`[${String(String(task.id))}]`));
    lines.push(truncate(task.title, 30));

    // Priority and status
    if (task.priority) {
      lines.push(`Priority: ${String(String(task.priority))}`);
    }

    // Assignee
    if (task.assignee) {
      lines.push(chalk.cyan(`@${String(String(task.assignee))}`));
    }

    // Due date
    if (task.due_date) {
      const dueDate = new Date(task.due_date);
      const isOverdue = dueDate < new Date();
      const dateStr = dueDate.toLocaleDateString();
      lines.push(
        isOverdue ? chalk.red(`⏰ ${String(dateStr)}`) : chalk.gray(`📅 ${String(dateStr)}`)
      );
    }

    // Tags
    if (task.tags && task.tags.length > 0) {
      lines.push(task.tags.map(tag => chalk.magenta(`#${String(tag)}`)).join(' '));
    }

    return lines.join('\n');
  }

  /**
   * Format board as a simple list view
   */
  formatBoardList(board: Board): string {
    const output: string[] = [];

    output.push(chalk.bold.cyan(`\n📋 ${String(String(board.name))}\n`));

    for (const column of board.columns) {
      output.push(
        chalk.bold.underline(
          `\n${String(String(column.name))} (${String(String(column.tasks.length))})`
        )
      );

      if (column.tasks.length === 0) {
        output.push(chalk.gray('  No tasks'));
      } else {
        for (const task of column.tasks) {
          output.push(`  ${String(formatTaskListItem(task))}`);
        }
      }
    }

    return output.join('\n');
  }

  /**
   * Calculate board statistics
   */
  private static calculateBoardStats(board: Board): {
    totalTasks: number;
    tasksByColumn: Map<string, number>;
    tasksByPriority: Map<string, number>;
    overdueTasks: number;
  } {
    const stats = {
      totalTasks: 0,
      tasksByColumn: new Map<string, number>(),
      tasksByPriority: new Map<string, number>(),
      overdueTasks: 0,
    };

    for (const column of board.columns) {
      stats.tasksByColumn.set(column.name, column.tasks.length);
      stats.totalTasks += column.tasks.length;

      for (const task of column.tasks) {
        // Count by priority
        if (task.priority) {
          const count = stats.tasksByPriority.get(task.priority) || 0;
          stats.tasksByPriority.set(task.priority, count + 1);
        }

        // Count overdue
        if (task.due_date) {
          const dueDate = new Date(task.due_date);
          if (dueDate < new Date()) {
            stats.overdueTasks += 1;
          }
        }
      }
    }

    return stats;
  }

  /**
   * Format board statistics
   */
  private static formatBoardStats(
    stats: ReturnType<BoardFormatter['calculateBoardStats']>
  ): string {
    const lines: string[] = [];

    lines.push(chalk.gray('─'.repeat(40)));
    lines.push(chalk.bold('Board Statistics:'));
    lines.push(`  Total Tasks: ${String(String(stats.totalTasks))}`);

    if (stats.overdueTasks > 0) {
      lines.push(chalk.red(`  Overdue Tasks: ${String(String(stats.overdueTasks))}`));
    }

    if (stats.tasksByPriority.size > 0) {
      lines.push('  By Priority:');
      for (const [priority, count] of stats.tasksByPriority) {
        const percentage = formatPercentage(count, stats.totalTasks);
        lines.push(`    ${String(priority)}: ${String(count)} (${String(percentage)})`);
      }
    }

    lines.push(chalk.gray('─'.repeat(40)));

    return lines.join('\n');
  }

  /**
   * Calculate column widths for table display
   */
  private static calculateColumnWidths(columnCount: number, maxWidth: number): number[] {
    const borderWidth = (columnCount + 1) * 3; // Account for table borders
    const availableWidth = maxWidth - borderWidth;
    const columnWidth = Math.floor(availableWidth / columnCount);

    return Array(columnCount).fill(Math.max(columnWidth, 20));
  }

  /**
   * Format board for export (CSV, JSON, etc.)
   */
  exportBoard(board: Board, format: 'csv' | 'json' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(board, null, 2);
    }

    // CSV format
    const lines: string[] = [];
    lines.push('Column,Task ID,Title,Status,Priority,Assignee,Due Date,Tags');

    for (const column of board.columns) {
      for (const task of column.tasks) {
        const row = [
          column.name,
          task.id,
          `"${String(String(task.title.replace(/"/g, '""')))}"`,
          task.status,
          task.priority ?? '',
          task.assignee ?? '',
          task.due_date ?? '',
          (task.tags ?? []).join(';'),
        ];
        lines.push(row.join(','));
      }
    }

    return lines.join('\n');
  }
}
