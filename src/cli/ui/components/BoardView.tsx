import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import chalk from 'chalk';
import type { Task } from './TaskList';

export interface Column {
  id: string;
  name: string;
  tasks: Task[];
  limit?: number;
}

export interface Board {
  id: string;
  name: string;
  description?: string;
  columns: Column[];
}

export interface BoardViewProps {
  board: Board;
  onTaskSelect?: (task: Task, columnId: string) => void;
  onColumnSelect?: (column: Column) => void;
  onKeyPress?: (
    key: string,
    context: { selectedTask: Task | null; selectedColumn: Column | null }
  ) => void;
  showWIPLimits?: boolean;
  maxColumnHeight?: number;
  columnWidth?: number;
}

export const BoardView: React.FC<BoardViewProps> = ({
  board,
  onTaskSelect,
  onColumnSelect,
  onKeyPress,
  showWIPLimits = true,
  maxColumnHeight = 8,
  columnWidth = 25,
}) => {
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [selectedTask, setSelectedTask] = useState(0);
  const [scrollOffsets, setScrollOffsets] = useState<Map<string, number>>(new Map());
  const { exit } = useApp();

  // Ensure selection is within bounds
  useEffect(() => {
    if (selectedColumn >= board.columns.length && board.columns.length > 0) {
      setSelectedColumn(board.columns.length - 1);
    }
    if (selectedColumn < 0) {
      setSelectedColumn(0);
    }
  }, [board.columns.length, selectedColumn]);

  useEffect(() => {
    const currentColumn = board.columns[selectedColumn];
    if (currentColumn && selectedTask >= currentColumn.tasks.length) {
      setSelectedTask(Math.max(0, currentColumn.tasks.length - 1));
    }
    if (selectedTask < 0) {
      setSelectedTask(0);
    }
  }, [board.columns, selectedColumn, selectedTask]);

  // Update scroll offset for current column
  useEffect(() => {
    const currentColumn = board.columns[selectedColumn];
    if (!currentColumn) return;

    const currentOffset = scrollOffsets.get(currentColumn.id) || 0;

    if (selectedTask < currentOffset) {
      setScrollOffsets(prev => new Map(prev.set(currentColumn.id, selectedTask)));
    } else if (selectedTask >= currentOffset + maxColumnHeight) {
      setScrollOffsets(
        prev => new Map(prev.set(currentColumn.id, selectedTask - maxColumnHeight + 1))
      );
    }
  }, [selectedColumn, selectedTask, maxColumnHeight, board.columns, scrollOffsets]);

  useInput((input, key) => {
    const currentColumn = board.columns[selectedColumn];
    const currentTask = currentColumn?.tasks[selectedTask];

    if (key.leftArrow || input === 'h') {
      setSelectedColumn(prev => Math.max(0, prev - 1));
      setSelectedTask(0); // Reset task selection when changing columns
    } else if (key.rightArrow || input === 'l') {
      setSelectedColumn(prev => Math.min(board.columns.length - 1, prev + 1));
      setSelectedTask(0); // Reset task selection when changing columns
    } else if (key.upArrow || input === 'k') {
      if (currentColumn) {
        setSelectedTask(prev => Math.max(0, prev - 1));
      }
    } else if (key.downArrow || input === 'j') {
      if (currentColumn) {
        setSelectedTask(prev => Math.min(currentColumn.tasks.length - 1, prev + 1));
      }
    } else if (key.return) {
      if (currentTask && currentColumn) {
        onTaskSelect?.(currentTask, currentColumn.id);
      } else if (currentColumn) {
        onColumnSelect?.(currentColumn);
      }
    } else if (input === 'q') {
      exit();
    } else {
      onKeyPress?.(input, {
        selectedTask: currentTask || null,
        selectedColumn: currentColumn || null,
      });
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

    return priorityColors[priority](`[${priority}]`);
  };

  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return `${text.substring(0, maxLength - 3)}...`;
  };

  const getWIPStatus = (column: Column): { isOverLimit: boolean; status: string } => {
    if (!column.limit) return { isOverLimit: false, status: '' };

    const taskCount = column.tasks.length;
    const isOverLimit = taskCount > column.limit;

    return {
      isOverLimit,
      status: isOverLimit
        ? chalk.red(`${taskCount}/${column.limit}`)
        : chalk.green(`${taskCount}/${column.limit}`),
    };
  };

  const renderColumnHeader = (column: Column, columnIndex: number): React.ReactNode => {
    const isSelected = columnIndex === selectedColumn;
    const wipStatus = showWIPLimits ? getWIPStatus(column) : null;

    const headerColor = isSelected ? chalk.bgCyan.black : chalk.cyan;
    const borderChar = isSelected ? '═' : '─';

    const title = truncateText(column.name, columnWidth - 4);
    const taskCount = wipStatus ? wipStatus.status : `${column.tasks.length}`;

    return (
      <Box flexDirection="column" width={columnWidth}>
        <Text>{borderChar.repeat(columnWidth)}</Text>
        <Text>{headerColor(` ${title} (${taskCount}) `)}</Text>
        <Text>{borderChar.repeat(columnWidth)}</Text>
      </Box>
    );
  };

  const renderTask = (
    task: Task,
    taskIndex: number,
    columnIndex: number,
    isTaskSelected: boolean
  ): React.ReactNode => {
    const statusIcon = formatTaskStatus(task.status);
    const priority = formatPriority(task.priority);

    const backgroundColor = isTaskSelected
      ? chalk.bgBlue.white
      : task.status === 'done'
        ? chalk.gray
        : chalk.white;

    const taskTitle = truncateText(task.title, columnWidth - 8);
    const taskId = truncateText(task.id, 8);

    return (
      <Box key={task.id} flexDirection="column" width={columnWidth}>
        <Text>
          {isTaskSelected ? '▶' : ' '} {statusIcon} {backgroundColor(`[${taskId}]`)}
        </Text>
        <Text>{backgroundColor(`  ${taskTitle}`)}</Text>
        {priority && <Text>{backgroundColor(`  ${priority}`)}</Text>}
        {task.assignee && (
          <Text color="gray">{`  @${truncateText(task.assignee, columnWidth - 4)}`}</Text>
        )}
        <Text> </Text> {/* Spacing between tasks */}
      </Box>
    );
  };

  const renderColumn = (column: Column, columnIndex: number): React.ReactNode => {
    const isColumnSelected = columnIndex === selectedColumn;
    const scrollOffset = scrollOffsets.get(column.id) || 0;
    const visibleTasks = column.tasks.slice(scrollOffset, scrollOffset + maxColumnHeight);
    const hasMoreAbove = scrollOffset > 0;
    const hasMoreBelow = scrollOffset + maxColumnHeight < column.tasks.length;

    return (
      <Box key={column.id} flexDirection="column" width={columnWidth} marginRight={1}>
        {renderColumnHeader(column, columnIndex)}

        {/* Scroll indicator - above */}
        {hasMoreAbove && (
          <Box justifyContent="center" width={columnWidth}>
            <Text color="gray">⬆ {scrollOffset} more</Text>
          </Box>
        )}

        {/* Tasks */}
        <Box flexDirection="column" minHeight={maxColumnHeight * 3}>
          {column.tasks.length === 0 ? (
            <Box marginTop={1} justifyContent="center" width={columnWidth}>
              <Text color="gray">Empty</Text>
            </Box>
          ) : (
            visibleTasks.map((task, visibleIndex) => {
              const actualTaskIndex = scrollOffset + visibleIndex;
              const isTaskSelected = isColumnSelected && actualTaskIndex === selectedTask;
              return renderTask(task, actualTaskIndex, columnIndex, isTaskSelected);
            })
          )}
        </Box>

        {/* Scroll indicator - below */}
        {hasMoreBelow && (
          <Box justifyContent="center" width={columnWidth}>
            <Text color="gray">⬇ {column.tasks.length - scrollOffset - maxColumnHeight} more</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderBoardStats = (): React.ReactNode => {
    const totalTasks = board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
    const completedTasks = board.columns.reduce(
      (sum, col) => sum + col.tasks.filter(t => t.status === 'done').length,
      0
    );
    const blockedTasks = board.columns.reduce(
      (sum, col) => sum + col.tasks.filter(t => t.status === 'blocked').length,
      0
    );

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">{'═'.repeat(80)}</Text>
        <Box>
          <Text>
            📊 Total: {totalTasks} | ✅ Complete: {chalk.green(completedTasks)} (
            {chalk.cyan(`${completionRate}%`)}) | 🚫 Blocked: {chalk.red(blockedTasks)}
          </Text>
        </Box>
      </Box>
    );
  };

  const renderHelp = (): React.ReactNode => (
    <Box marginTop={1}>
      <Text color="gray">
        ←/→ or h/l: Switch columns | ↑/↓ or j/k: Navigate tasks | Enter: Select | q: Quit
      </Text>
    </Box>
  );

  return (
    <Box flexDirection="column">
      {/* Board header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🏗️ {board.name}
        </Text>
      </Box>

      {board.description && (
        <Box marginBottom={1}>
          <Text color="gray">{board.description}</Text>
        </Box>
      )}

      {/* Board columns */}
      <Box flexDirection="row">
        {board.columns.map((column, index) => renderColumn(column, index))}
      </Box>

      {/* Board statistics */}
      {renderBoardStats()}

      {/* Help text */}
      {renderHelp()}
    </Box>
  );
};

export default BoardView;
