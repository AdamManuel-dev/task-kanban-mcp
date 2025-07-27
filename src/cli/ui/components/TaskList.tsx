import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import chalk from 'chalk';

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  priority?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  assignee?: string;
  tags?: string[];
  due_date?: string;
}

export interface TaskListProps {
  tasks: Task[];
  title?: string;
  onTaskSelect?: (task: Task) => void;
  onKeyPress?: (key: string, selectedTask: Task | null) => void;
  showSelection?: boolean;
  maxHeight?: number;
  filterStatus?: string[];
  showStats?: boolean;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  title = 'Tasks',
  onTaskSelect,
  onKeyPress,
  showSelection = true,
  maxHeight = 10,
  filterStatus,
  showStats = true,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const { exit } = useApp();

  // Filter tasks based on status filter
  const filteredTasks = filterStatus
    ? tasks.filter(task => filterStatus.includes(task.status))
    : tasks;

  // Ensure selected index is within bounds
  useEffect(() => {
    if (selectedIndex >= filteredTasks.length && filteredTasks.length > 0) {
      setSelectedIndex(filteredTasks.length - 1);
    }
    if (selectedIndex < 0) {
      setSelectedIndex(0);
    }
  }, [filteredTasks.length, selectedIndex]);

  // Update scroll offset based on selection
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + maxHeight) {
      setScrollOffset(selectedIndex - maxHeight + 1);
    }
  }, [selectedIndex, maxHeight]);

  useInput((input, key) => {
    if (!showSelection) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(prev => Math.min(filteredTasks.length - 1, prev + 1));
    } else if (key.pageUp || (key.ctrl && input === 'u')) {
      // Page up - jump by maxHeight or to top
      setSelectedIndex(prev => Math.max(0, prev - maxHeight));
    } else if (key.pageDown || (key.ctrl && input === 'd')) {
      // Page down - jump by maxHeight or to bottom
      setSelectedIndex(prev => Math.min(filteredTasks.length - 1, prev + maxHeight));
    } else if (input === 'g') {
      // Go to top (Vim style)
      setSelectedIndex(0);
    } else if (input === 'G') {
      // Go to bottom (Vim style)
      setSelectedIndex(filteredTasks.length - 1);
    } else if (input === 'h' || key.leftArrow) {
      // Quick status filter - previous status
      const statusOrder = ['todo', 'in_progress', 'done', 'blocked'];
      const currentTask = filteredTasks[selectedIndex];
      if (currentTask) {
        const currentIndex = statusOrder.indexOf(currentTask.status);
        const prevStatus = statusOrder[Math.max(0, currentIndex - 1)];
        onKeyPress?.(`filter:${prevStatus}`, currentTask);
      }
    } else if (input === 'l' || key.rightArrow) {
      // Quick status filter - next status
      const statusOrder = ['todo', 'in_progress', 'done', 'blocked'];
      const currentTask = filteredTasks[selectedIndex];
      if (currentTask) {
        const currentIndex = statusOrder.indexOf(currentTask.status);
        const nextStatus = statusOrder[Math.min(statusOrder.length - 1, currentIndex + 1)];
        onKeyPress?.(`filter:${nextStatus}`, currentTask);
      }
    } else if (input === '/') {
      // Search mode trigger
      onKeyPress?.('search', filteredTasks[selectedIndex] || null);
    } else if (input === 'r') {
      // Refresh
      onKeyPress?.('refresh', filteredTasks[selectedIndex] || null);
    } else if (input === 'd') {
      // Delete/archive selected task
      if (filteredTasks[selectedIndex]) {
        onKeyPress?.('delete', filteredTasks[selectedIndex]);
      }
    } else if (input === 'e') {
      // Edit selected task
      if (filteredTasks[selectedIndex]) {
        onKeyPress?.('edit', filteredTasks[selectedIndex]);
      }
    } else if (input === 'n') {
      // Create new task
      onKeyPress?.('new', filteredTasks[selectedIndex] || null);
    } else if (input === '?') {
      // Show help
      onKeyPress?.('help', filteredTasks[selectedIndex] || null);
    } else if (key.return) {
      if (filteredTasks[selectedIndex]) {
        onTaskSelect?.(filteredTasks[selectedIndex]);
      }
    } else if (input === 'q') {
      exit();
    } else {
      onKeyPress?.(input, filteredTasks[selectedIndex] || null);
    }
  });

  const formatTaskStatus = (status: Task['status']): string => {
    const statusMap = {
      todo: chalk.gray('○'),
      in_progress: chalk.yellow('◐'),
      done: chalk.green('●'),
      blocked: chalk.red('✕'),
    };
    return statusMap[status];
  };

  const formatPriority = (priority?: Task['priority']): string => {
    if (!priority) return '';

    const priorityColors = {
      P1: chalk.red,
      P2: chalk.yellow,
      P3: chalk.blue,
      P4: chalk.green,
      P5: chalk.gray,
    };

    return priorityColors[priority](priority);
  };

  const formatTags = (tags?: string[]): string => {
    if (!tags || tags.length === 0) return '';
    return tags.map(tag => chalk.magenta(`#${tag}`)).join(' ');
  };

  const formatDueDate = (dueDate?: string): string => {
    if (!dueDate) return '';

    const date = new Date(dueDate);
    const now = new Date();
    const isOverdue = date < now;
    const dateStr = date.toLocaleDateString();

    return isOverdue ? chalk.red(`⏰ ${dateStr}`) : chalk.gray(`📅 ${dateStr}`);
  };

  const renderTaskItem = (task: Task, index: number, isSelected: boolean): React.ReactNode => {
    const statusIcon = formatTaskStatus(task.status);
    const priority = formatPriority(task.priority);
    const tags = formatTags(task.tags);
    const dueDate = formatDueDate(task.due_date);

    const titleColor = isSelected
      ? chalk.bgBlue.white
      : task.status === 'done'
        ? chalk.gray
        : chalk.white;

    const prefix = isSelected ? '▶ ' : '  ';

    return (
      <Box key={task.id} flexDirection="column">
        <Box>
          <Text>
            {prefix}
            {statusIcon} {titleColor(`[${task.id}] ${task.title}`)}
            {priority && ` ${priority}`}
          </Text>
        </Box>
        {(task.assignee || tags || dueDate) && (
          <Box marginLeft={4}>
            <Text color="gray">
              {task.assignee && chalk.cyan(`@${task.assignee}`)}
              {task.assignee && (tags || dueDate) && ' | '}
              {tags}
              {tags && dueDate && ' | '}
              {dueDate}
            </Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderStats = (): React.ReactNode => {
    if (!showStats) return null;

    const stats = {
      total: filteredTasks.length,
      todo: filteredTasks.filter(t => t.status === 'todo').length,
      inProgress: filteredTasks.filter(t => t.status === 'in_progress').length,
      done: filteredTasks.filter(t => t.status === 'done').length,
      blocked: filteredTasks.filter(t => t.status === 'blocked').length,
    };

    const completionRate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">{'─'.repeat(50)}</Text>
        <Box>
          <Text color="gray">
            Total: {stats.total} | Todo: {chalk.gray(stats.todo)} | In Progress:{' '}
            {chalk.yellow(stats.inProgress)} | Done: {chalk.green(stats.done)} | Blocked:{' '}
            {chalk.red(stats.blocked)} | Complete: {chalk.cyan(`${completionRate}%`)}
          </Text>
        </Box>
      </Box>
    );
  };

  const renderHelpText = (): React.ReactNode => {
    if (!showSelection) return null;

    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">
          Navigation: ↑/↓ j/k | Page: PgUp/PgDn Ctrl+u/d | Jump: g(top) G(bottom)
        </Text>
        <Text color="gray">
          Actions: Enter(select) n(new) e(edit) d(delete) r(refresh) /(search) ?(help) q(quit)
        </Text>
        <Text color="gray">
          Filters: ←/→ h/l (cycle status filters)
        </Text>
      </Box>
    );
  };

  // Calculate visible tasks
  const visibleTasks = filteredTasks.slice(scrollOffset, scrollOffset + maxHeight);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + maxHeight < filteredTasks.length;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📋 {title} ({filteredTasks.length})
        </Text>
      </Box>

      {/* Scroll indicator - above */}
      {hasMoreAbove && (
        <Box justifyContent="center">
          <Text color="gray">⬆ {scrollOffset} more above</Text>
        </Box>
      )}

      {/* Task list */}
      <Box flexDirection="column">
        {filteredTasks.length === 0 ? (
          <Text color="gray">No tasks found</Text>
        ) : (
          visibleTasks.map((task, visibleIndex) => {
            const actualIndex = scrollOffset + visibleIndex;
            const isSelected = showSelection && actualIndex === selectedIndex;
            return renderTaskItem(task, actualIndex, isSelected);
          })
        )}
      </Box>

      {/* Scroll indicator - below */}
      {hasMoreBelow && (
        <Box justifyContent="center">
          <Text color="gray">⬇ {filteredTasks.length - scrollOffset - maxHeight} more below</Text>
        </Box>
      )}

      {/* Stats */}
      {renderStats()}

      {/* Help text */}
      {renderHelpText()}
    </Box>
  );
};

export default TaskList;
