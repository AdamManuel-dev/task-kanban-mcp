import type { Task } from '@/types';

interface TaskListProps {
  tasks: Task[];
  selectedIndex?: number;
  showDetails?: boolean;
  maxHeight?: number;
  sortBy?: 'priority' | 'due_date' | 'created_at' | 'title';
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

  private static formatTaskItem(task: Task, isSelected: boolean): string {
    const prefix = isSelected ? '→' : ' ';
    const statusIcon = this.getStatusIcon(task.status);
    const priorityText = this.formatPriority(task.priority);
    const dueDateText = this.formatDueDate(task.due_date);

    const titleLine = `${String(prefix)} ${String(statusIcon)} ${String(String(this.truncateText(task.title, 40)))} ${String(priorityText)}`;

    let output = titleLine;

    if (task.assignee || dueDateText) {
      const detailsLine = `${task.assignee ? `@${task.assignee}` : ''} ${dueDateText}`;
      output += `\n${detailsLine.trim()}`;
    }

    return output;
  }

  private static processTaskList(
    tasks: Task[],
    sortBy?: TaskListProps['sortBy'],
    filterBy?: TaskFilter
  ): Task[] {
    let processed = [...tasks];

    // Apply filters
    if (filterBy) {
      if (filterBy.status) {
        processed = processed.filter(task => task.status === filterBy.status);
      }
      if (filterBy.assignee) {
        processed = processed.filter(task => task.assignee === filterBy.assignee);
      }
      if (filterBy.search) {
        const searchLower = filterBy.search.toLowerCase();
        processed = processed.filter(
          task =>
            task.title.toLowerCase().includes(searchLower) ||
            (task.description && task.description.toLowerCase().includes(searchLower))
        );
      }
    }

    // Apply sorting
    if (sortBy) {
      processed.sort((a, b) => {
        switch (sortBy) {
          case 'priority':
            return b.priority - a.priority;
          case 'due_date':
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          case 'created_at':
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          case 'title':
            return a.title.localeCompare(b.title);
          default:
            return 0;
        }
      });
    }

    return processed;
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

  private static renderSummary(): string {
    const statusCounts = this.tasks.reduce(
      (acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      },
      {} as Record<Task['status'], number>
    );

    const total = this.tasks.length;
    const completed = statusCounts.done || 0;
    const inProgress = statusCounts.in_progress || 0;
    const blocked = statusCounts.blocked || 0;

    return `Total: ${String(total)} | Done: ${String(completed)} | In Progress: ${String(inProgress)} | Blocked: ${String(blocked)}`;
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
