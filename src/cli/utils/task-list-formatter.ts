import chalk from 'chalk';
import Table from 'cli-table3';
import {
  formatStatus,
  formatPriority,
  formatRelativeTime,
  formatDateTime,
  truncate,
  formatProgressBar,
  formatKeyValue,
  formatDivider,
  formatHeader,
} from './formatter';

export interface TaskDetails {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  assignee?: string;
  reporter?: string;
  created_at: string;
  updated_at: string;
  due_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  tags?: string[];
  subtasks?: TaskDetails[];
  dependencies?: string[];
  comments_count?: number;
  attachments_count?: number;
  completion_percentage?: number;
}

export interface TaskListOptions {
  showDescription?: boolean;
  showDates?: boolean;
  showAssignee?: boolean;
  showTags?: boolean;
  sortBy?: 'priority' | 'due_date' | 'created' | 'updated' | 'status';
  groupBy?: 'status' | 'priority' | 'assignee' | 'none';
  maxItems?: number;
  format?: 'table' | 'list' | 'compact';
}

/**
 * Format task lists for CLI display
 */
export class TaskListFormatter {
  /**
   * Format a list of tasks as a table
   */
  formatTaskTable(tasks: TaskDetails[], options: TaskListOptions = {}): string {
    const {
      showDescription = false,
      showDates = true,
      showAssignee = true,
      showTags = false,
      sortBy = 'priority',
    } = options;

    // Sort tasks
    const sortedTasks = this.sortTasks(tasks, sortBy);

    // Build table headers
    const headers = ['ID', 'Title', 'Status', 'Priority'];
    if (showAssignee) headers.push('Assignee');
    if (showDates) headers.push('Due Date');
    if (showTags) headers.push('Tags');

    // Create table
    const table = new Table({
      head: headers,
      style: { head: ['cyan'] },
      colWidths: this.calculateTableWidths(headers, showDescription),
    });

    // Add rows
    for (const task of sortedTasks) {
      const row: string[] = [
        task.id,
        truncate(task.title, 40),
        formatStatus(task.status),
        task.priority ? formatPriority(task.priority) : '-',
      ];

      if (showAssignee) {
        row.push(task.assignee ? chalk.cyan(`@${String(String(task.assignee))}`) : '-');
      }

      if (showDates) {
        if (task.due_date) {
          const dueDate = new Date(task.due_date);
          const isOverdue = dueDate < new Date() && task.status !== 'done';
          const dateStr = formatDateTime(dueDate, 'MMM dd');
          row.push(isOverdue ? chalk.red(dateStr) : dateStr);
        } else {
          row.push('-');
        }
      }

      if (showTags) {
        row.push(task.tags ? task.tags.map(t => chalk.magenta(`#${String(t)}`)).join(' ') : '-');
      }

      table.push(row);

      // Add description row if enabled
      if (showDescription && task.description) {
        const descRow = [
          {
            colSpan: headers.length,
            content: chalk.gray(`  ${String(String(truncate(task.description, 100)))}`),
          },
        ];
        table.push(descRow);
      }
    }

    return table.toString();
  }

  /**
   * Format tasks as a detailed list
   */
  formatTaskList(tasks: TaskDetails[], options: TaskListOptions = {}): string {
    const { groupBy = 'none', maxItems } = options;
    const output: string[] = [];

    if (groupBy !== 'none') {
      const grouped = this.groupTasks(tasks, groupBy);

      for (const [group, groupTasks] of grouped) {
        output.push(
          chalk.bold.underline(`\n${String(group)} (${String(String(groupTasks.length))})`)
        );

        const tasksToShow = maxItems ? groupTasks.slice(0, maxItems) : groupTasks;
        for (const task of tasksToShow) {
          output.push(this.formatTaskListItem(task));
        }

        if (maxItems && groupTasks.length > maxItems) {
          output.push(chalk.gray(`  ... and ${String(String(groupTasks.length - maxItems))} more`));
        }
      }
    } else {
      const tasksToShow = maxItems ? tasks.slice(0, maxItems) : tasks;
      for (const task of tasksToShow) {
        output.push(this.formatTaskListItem(task));
      }

      if (maxItems && tasks.length > maxItems) {
        output.push(chalk.gray(`\n... and ${String(String(tasks.length - maxItems))} more tasks`));
      }
    }

    return output.join('\n');
  }

  /**
   * Format a single task list item
   */
  private static formatTaskListItem(task: TaskDetails): string {
    const lines: string[] = [];

    // Main task line
    const mainLine = [
      chalk.dim(`[${String(String(task.id))}]`),
      task.title,
      task.priority ? formatPriority(task.priority) : '',
      formatStatus(task.status),
    ]
      .filter(Boolean)
      .join(' ');

    lines.push(`  ${String(mainLine)}`);

    // Additional details
    const details: string[] = [];

    if (task.assignee) {
      details.push(chalk.cyan(`@${String(String(task.assignee))}`));
    }

    if (task.due_date) {
      const dueDate = new Date(task.due_date);
      const isOverdue = dueDate < new Date() && task.status !== 'done';
      details.push(
        isOverdue
          ? chalk.red(`Due: ${String(formatDateTime(dueDate, 'MMM dd'))}`)
          : chalk.gray(`Due: ${String(formatDateTime(dueDate, 'MMM dd'))}`)
      );
    }

    if (task.tags && task.tags.length > 0) {
      details.push(task.tags.map(tag => chalk.magenta(`#${String(tag)}`)).join(' '));
    }

    if (details.length > 0) {
      lines.push(`    ${String(String(details.join(' | ')))}`);
    }

    return lines.join('\n');
  }

  /**
   * Format detailed task view
   */
  formatTaskDetail(task: TaskDetails): string {
    const output: string[] = [];

    // Header
    output.push(formatHeader(`Task ${String(String(task.id))}`, 60));
    output.push('');

    // Title and status
    output.push(chalk.bold(task.title));
    output.push(formatStatus(task.status));
    output.push('');

    // Details section
    output.push(chalk.bold('Details:'));
    output.push(formatKeyValue('Priority', task.priority ? formatPriority(task.priority) : 'None'));
    output.push(formatKeyValue('Assignee', task.assignee || 'Unassigned'));
    output.push(formatKeyValue('Reporter', task.reporter || 'Unknown'));
    output.push(formatKeyValue('Created', formatRelativeTime(task.created_at)));
    output.push(formatKeyValue('Updated', formatRelativeTime(task.updated_at)));

    if (task.due_date) {
      const dueDate = new Date(task.due_date);
      const isOverdue = dueDate < new Date() && task.status !== 'done';
      const dueDateStr = formatDateTime(dueDate, 'MMM dd, yyyy');
      output.push(formatKeyValue('Due Date', isOverdue ? chalk.red(dueDateStr) : dueDateStr));
    }

    // Time tracking
    if (task.estimated_hours || task.actual_hours) {
      output.push('');
      output.push(chalk.bold('Time Tracking:'));
      if (task.estimated_hours) {
        output.push(formatKeyValue('Estimated', `${String(String(task.estimated_hours))}h`));
      }
      if (task.actual_hours) {
        output.push(formatKeyValue('Actual', `${String(String(task.actual_hours))}h`));
      }
    }

    // Description
    if (task.description) {
      output.push('');
      output.push(chalk.bold('Description:'));
      output.push(task.description);
    }

    // Progress
    if (task.completion_percentage !== undefined) {
      output.push('');
      output.push(chalk.bold('Progress:'));
      output.push(formatProgressBar(task.completion_percentage, 100, 30));
    }

    // Subtasks
    if (task.subtasks && task.subtasks.length > 0) {
      output.push('');
      output.push(chalk.bold(`Subtasks (${String(String(task.subtasks.length))}):`));
      for (const subtask of task.subtasks) {
        const icon = subtask.status === 'done' ? '✓' : '○';
        output.push(
          `  ${String(String(chalk.green(icon)))} [${String(String(subtask.id))}] ${String(String(subtask.title))}`
        );
      }
    }

    // Dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      output.push('');
      output.push(chalk.bold('Dependencies:'));
      output.push(`  ${String(String(task.dependencies.join(', ')))}`);
    }

    // Tags
    if (task.tags && task.tags.length > 0) {
      output.push('');
      output.push(chalk.bold('Tags:'));
      output.push(`  ${task.tags.map(tag => chalk.magenta(`#${tag}`)).join(' ')}`);
    }

    // Metadata
    output.push('');
    output.push(formatDivider());
    if (task.comments_count) {
      output.push(`💬 ${task.comments_count} comment${task.comments_count > 1 ? 's' : ''}`);
    }
    if (task.attachments_count) {
      output.push(
        `📎 ${task.attachments_count} attachment${task.attachments_count > 1 ? 's' : ''}`
      );
    }

    return output.join('\n');
  }

  /**
   * Sort tasks by specified field
   */
  private static sortTasks(tasks: TaskDetails[], sortBy: string): TaskDetails[] {
    return [...tasks].sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          const priorityOrder = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };
          const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 99;
          const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 99;
          return aPriority - bPriority;

        case 'due_date':
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();

        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

        case 'updated':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();

        case 'status':
          return a.status.localeCompare(b.status);

        default:
          return 0;
      }
    });
  }

  /**
   * Group tasks by specified field
   */
  private static groupTasks(tasks: TaskDetails[], groupBy: string): Map<string, TaskDetails[]> {
    const grouped = new Map<string, TaskDetails[]>();

    for (const task of tasks) {
      let key: string;

      switch (groupBy) {
        case 'status':
          key = task.status;
          break;
        case 'priority':
          key = task.priority || 'No Priority';
          break;
        case 'assignee':
          key = task.assignee || 'Unassigned';
          break;
        default:
          key = 'All Tasks';
      }

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(task);
    }

    return grouped;
  }

  /**
   * Calculate column widths for table
   */
  private static calculateTableWidths(headers: string[], showDescription: boolean): number[] {
    const baseWidths = {
      ID: 10,
      Title: showDescription ? 40 : 50,
      Status: 15,
      Priority: 10,
      Assignee: 15,
      'Due Date': 12,
      Tags: 20,
    };

    return headers.map(h => baseWidths[h as keyof typeof baseWidths] || 15);
  }
}
