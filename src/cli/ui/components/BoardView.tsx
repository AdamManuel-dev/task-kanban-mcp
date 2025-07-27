import React from 'react';
import { Box, Text } from 'ink';
import type { Board, Column, Task } from '@/types';

interface BoardViewProps {
  board: Board;
  columns: Column[];
  tasks: Task[];
  selectedTaskId?: string;
  showDetails?: boolean;
}

interface TaskWithColumn extends Task {
  column?: Column;
}

interface ColumnWithTasks extends Column {
  tasks: TaskWithColumn[];
}

/**
 * Truncates text to a specified maximum length with ellipsis
 */
const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 3)}...`;
};

/**
 * Gets the appropriate color for a task based on its priority
 */
const getPriorityColor = (priority: number): string => {
  if (priority >= 8) return 'red';
  if (priority >= 5) return 'yellow';
  if (priority >= 2) return 'blue';
  return 'gray';
};

/**
 * Gets the appropriate background color function for a task
 */
const getBackgroundColor = (priority: number): ((text: string) => string) => {
  const color = getPriorityColor(priority);
  return (text: string) =>
    // Return styled text with color - using simple text formatting
    `[${color.toUpperCase()}]${text}`;
};

/**
 * Formats task priority for display
 */
const formatPriority = (priority: number): string => {
  const stars = '★'.repeat(Math.min(priority, 5));
  const empty = '☆'.repeat(Math.max(0, 5 - priority));
  return `${stars}${empty}`;
};

/**
 * Renders a single task item
 */
const renderTaskItem = (
  task: TaskWithColumn,
  columnWidth: number,
  isSelected: boolean
): React.ReactNode => {
  const taskTitle = truncateText(task.title, columnWidth - 4);
  const priority = task.priority > 0 ? formatPriority(task.priority) : null;
  const backgroundColor = getBackgroundColor(task.priority);
  const borderChar = isSelected ? '█' : '│';

  return (
    <Box key={task.id} flexDirection="column" width={columnWidth}>
      <Text>
        {borderChar} {taskTitle}
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

/**
 * Renders a single column with its tasks
 */
const renderColumn = (
  column: ColumnWithTasks,
  columnWidth: number,
  maxColumnHeight: number,
  scrollOffset: number = 0
): React.ReactNode => {
  const visibleTasks = column.tasks.slice(scrollOffset, scrollOffset + maxColumnHeight);

  return (
    <Box key={column.id} flexDirection="column" width={columnWidth} marginRight={1}>
      {/* Show scroll indicator if there are tasks above */}
      {scrollOffset > 0 && (
        <Box justifyContent="center" width={columnWidth}>
          <Text color="gray">⬆ {scrollOffset} more</Text>
        </Box>
      )}

      <Box flexDirection="column" minHeight={maxColumnHeight * 3}>
        {visibleTasks.length === 0 ? (
          <Box marginTop={1} justifyContent="center" width={columnWidth}>
            <Text color="gray">Empty</Text>
          </Box>
        ) : (
          visibleTasks.map(task => renderTaskItem(task, columnWidth, false))
        )}
      </Box>

      {/* Show scroll indicator if there are more tasks below */}
      {column.tasks.length > scrollOffset + maxColumnHeight && (
        <Box justifyContent="center" width={columnWidth}>
          <Text color="gray">⬇ {column.tasks.length - scrollOffset - maxColumnHeight} more</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Renders the board summary
 */
const renderSummary = (
  totalTasks: number,
  completedTasks: number,
  columns: ColumnWithTasks[]
): React.ReactNode => {
  const completionRate = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : '0';

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">{'═'.repeat(80)}</Text>
      <Box>
        <Text>
          Summary: {completedTasks}/{totalTasks} tasks completed ({completionRate}%) | Columns:{' '}
          {columns.length}
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Renders navigation help
 */
const renderNavigation = (): React.ReactNode => (
  <Box marginTop={1}>
    <Text color="gray">
      Navigation: ↑↓ Select Task | ← → Switch Column | Enter: Details | Q: Quit
    </Text>
  </Box>
);

/**
 * Main BoardView component
 */
const BoardView: React.FC<BoardViewProps> = ({
  board,
  columns,
  tasks,
  selectedTaskId: _selectedTaskId,
  showDetails: _showDetails = false,
}) => {
  // Group tasks by column
  const columnsWithTasks: ColumnWithTasks[] = columns.map(column => ({
    ...column,
    tasks: tasks.filter(task => task.column_id === column.id),
  }));

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(task => task.status === 'done').length;
  const maxColumnHeight = 10; // Maximum tasks to show per column
  const columnWidth = Math.floor(80 / Math.max(columns.length, 1)) - 2;

  return (
    <Box flexDirection="column">
      {/* Board Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🗂 {board.name}
        </Text>
      </Box>

      {board.description && (
        <Box marginBottom={1}>
          <Text color="gray">{board.description}</Text>
        </Box>
      )}

      {/* Columns */}
      <Box flexDirection="row">
        {columnsWithTasks.map(column => renderColumn(column, columnWidth, maxColumnHeight))}
      </Box>

      {/* Board Summary */}
      {renderSummary(totalTasks, completedTasks, columnsWithTasks)}

      {/* Navigation Help */}
      {renderNavigation()}
    </Box>
  );
};

export default BoardView;
