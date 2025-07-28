import type { Task } from '@/types';
import chalk from 'chalk';

interface TaskListProps {
  tasks: Task[];
  selectedIndex?: number;
  showDetails?: boolean;
  maxHeight?: number;
  sortBy?: 'priority' | 'due_date' | 'created_at' | 'updated_at' | 'title';
  filterBy?: {
    status?: Task['status'];
    assignee?: string;
    search?: string;
  };
}

interface TaskFilter {
  status?: Task['status'];
  assignee?: string;
  search?: string;
  priority?: number;
}

/**
 * Simple text-based task list formatter for CLI display
 */
export class TaskListFormatter {
  private readonly maxHeight: number;

  private readonly selectedIndex: number;

  constructor(
    private readonly tasks: Task[],
    options: {
      selectedIndex?: number;
      maxHeight?: number;
      sortBy?: TaskListProps['sortBy'];
      filterBy?: TaskFilter;
    } = {}
  ) {
    this.maxHeight = options.maxHeight || 10;
    this.selectedIndex = options.selectedIndex || 0;

    // Apply filters and sorting
    this.tasks = this.processTaskList(tasks, options.sortBy, options.filterBy);
  }

  /**
   * Process and filter task list
   */
  private processTaskList(
    tasks: TaskListProps['tasks'],
    sortBy?: TaskListProps['sortBy'],
    filterBy?: TaskFilter
  ): TaskListProps['tasks'] {
    let processed = [...tasks];
    
    // Apply filters
    if (filterBy) {
      if (filterBy.status) {
        processed = processed.filter(task => task.status === filterBy.status);
      }
      if (filterBy.priority) {
        processed = processed.filter(task => task.priority === filterBy.priority);
      }
      if (filterBy.assignee) {
        processed = processed.filter(task => task.assignee === filterBy.assignee);
      }
    }
    
    // Apply sorting
    if (sortBy) {
      processed.sort((a, b) => {
        switch (sortBy) {
          case 'priority':
            return (b.priority || 0) - (a.priority || 0);
          case 'due_date':
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          case 'created_at':
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          case 'updated_at':
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          default:
            return 0;
        }
      });
    }
    
    return processed;
  }

  /**
   * Format a single task item
   */
  private formatTaskItem(task: TaskListProps['tasks'][0], isSelected: boolean): string {
    const prefix = isSelected ? '▶ ' : '  ';
    const priorityText = task.priority ? `P${task.priority}` : 'P0';
    
    let line = `${prefix}${task.title}`;
    if (task.assignee) {
      line += ` [@${task.assignee}]`;
    }
    line += ` [${task.status}] [${priorityText}]`;
    
    return isSelected ? chalk.inverse(line) : line;
  }

  /**
   * Render task list summary
   */
  private renderSummary(): string {
    const total = this.tasks.length;
    const completed = this.tasks.filter(task => task.status === 'done').length;
    const inProgress = this.tasks.filter(task => task.status === 'in_progress').length;
    const todo = this.tasks.filter(task => task.status === 'todo').length;
    
    return `Total: ${total} | Done: ${completed} | In Progress: ${inProgress} | Todo: ${todo}`;
  }

  /**
   * Renders the entire task list as formatted text
   */
  renderTaskList(): string {
    const output: string[] = [];

    // Header
    output.push('📋 Task List');
    output.push('');

    if (this.tasks.length === 0) {
      output.push('  No tasks found');
      return output.join('\n');
    }

    // Calculate scroll window
    const startIndex = Math.max(0, this.selectedIndex - Math.floor(this.maxHeight / 2));
    const endIndex = Math.min(this.tasks.length, startIndex + this.maxHeight);
    const visibleTasks = this.tasks.slice(startIndex, endIndex);

    // Show scroll indicator if there are tasks above
    if (startIndex > 0) {
      output.push(`  ⬆ ${String(startIndex)} more above`);
      output.push('');
    }

    // Render tasks
    visibleTasks.forEach((task, index) => {
      const actualIndex = startIndex + index;
      const isSelected = actualIndex === this.selectedIndex;
      output.push(this.formatTaskItem(task, isSelected));
    });

    // Show scroll indicator if there are more tasks below
    if (endIndex < this.tasks.length) {
      output.push('');
      output.push(`  ⬇ ${String(String(this.tasks.length - endIndex))} more below`);
    }

    // Footer with summary
    output.push('');
    output.push('─'.repeat(50));
    output.push(this.renderSummary());

    // Navigation help
    output.push('');
    output.push('Controls: ↑↓ Navigate | Enter: Select | Q: Quit');

    return output.join('\n');
  }


  private static getStatusIcon(status: Task['status']): string {
    const statusMap = {
      todo: '○',
      in_progress: '◐',
      done: '●',
      blocked: '✕',
      archived: '⬚',
    };
    return statusMap[status] || '○';
  }

  private static formatPriority(priority: number): string {
    if (priority <= 0) return '';

    const stars = '★'.repeat(Math.min(priority, 5));
    return `[${String(stars)}]`;
  }

  private static formatDueDate(dueDate?: Date | string): string {
    if (!dueDate) return '';

    const date = new Date(dueDate);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return '[OVERDUE]';
    if (diffDays === 0) return '[TODAY]';
    if (diffDays === 1) return '[TOMORROW]';
    if (diffDays <= 7) return `[${String(diffDays)}d]`;

    return `[${String(String(date.toLocaleDateString()))}]`;
  }

  private static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${String(String(text.substring(0, maxLength - 3)))}...`;
  }

}

/**
 * Factory function to create a task list formatter
 */
export const createTaskList = (props: TaskListProps): string => {
  const options: {
    selectedIndex?: number;
    maxHeight?: number;
    sortBy?: TaskListProps['sortBy'];
    filterBy?: TaskFilter;
  } = {};

  if (props.selectedIndex !== undefined) {
    options.selectedIndex = props.selectedIndex;
  }
  if (props.maxHeight !== undefined) {
    options.maxHeight = props.maxHeight;
  }
  if (props.sortBy !== undefined) {
    options.sortBy = props.sortBy;
  }
  if (props.filterBy !== undefined) {
    options.filterBy = props.filterBy;
  }

  const formatter = new TaskListFormatter(props.tasks, options);
  return formatter.renderTaskList();
};

export default createTaskList;
