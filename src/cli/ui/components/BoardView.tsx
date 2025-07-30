import React from 'react';
// Temporarily disabled ink imports to fix module resolution
// TODO: Re-enable once ink module resolution is fixed
// import { Box, Text } from 'ink';
import type { Board, Column, Task } from '@/types';

// Fallback components for when ink is disabled
const Box = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
const Text = ({ children }: { children: React.ReactNode }) => <span>{children}</span>;

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
 * Gets the appropriate color function for a task based on its priority
 * Uses theme system for consistent colors and accessibility
 */
const getPriorityColorFunction = (priority: number): ((text: string) => string) => {
  // Map numeric priority to theme priority levels
  if (priority >= 8) return (text: string) => `\x1b[31m${text}\x1b[0m`; // Red
  if (priority >= 5) return (text: string) => `\x1b[33m${text}\x1b[0m`; // Yellow
  if (priority >= 2) return (text: string) => `\x1b[34m${text}\x1b[0m`; // Blue
  return (text: string) => `\x1b[90m${text}\x1b[0m`; // Gray
};

/**
 * Gets accessible color styling with proper contrast ratios
 */
const getAccessibleTaskStyle = (
  priority: number,
  isSelected: boolean
): {
  colorFn: (text: string) => string;
  bgStyle: string;
  ariaLabel: string;
} => {
  const colorFn = getPriorityColorFunction(priority);
  const bgStyle = isSelected ? '\x1b[47m\x1b[30m' : ''; // High contrast selection
  const priorityLevel =
    priority >= 8 ? 'critical' : priority >= 5 ? 'high' : priority >= 2 ? 'medium' : 'low';

  return {
    colorFn,
    bgStyle,
    ariaLabel: `Task priority: ${priorityLevel}, ${isSelected ? 'selected' : 'not selected'}`,
  };
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
 * Renders a single task item with accessibility support
 */
const renderTaskItem = (
  task: TaskWithColumn,
  columnWidth: number,
  isSelected: boolean,
  tabIndex?: number
): React.ReactNode => {
  const taskTitle = truncateText(task.title, columnWidth - 4);
  const priority = task.priority > 0 ? formatPriority(task.priority) : null;
  const style = getAccessibleTaskStyle(task.priority, isSelected);
  const borderChar = isSelected ? '█' : '│';

  return (
    <Box key={task.id}>
      <Text>
        {style.bgStyle}
        {borderChar} {style.colorFn(taskTitle)}
        {style.bgStyle ? '\x1b[0m' : ''}
      </Text>
      {priority && (
        <Text>
          {style.bgStyle} {style.colorFn(priority)}
          {style.bgStyle ? '\x1b[0m' : ''}
        </Text>
      )}
      {task.assignee && (
        <Text color="gray">{`  @${truncateText(task.assignee, columnWidth - 4)}`}</Text>
      )}
      <Text> </Text> {/* Spacing between tasks */}
    </Box>
  );
};

/**
 * Renders a single column with its tasks and accessibility features
 */
const renderColumn = (
  column: ColumnWithTasks,
  columnWidth: number,
  maxColumnHeight: number,
  scrollOffset = 0,
  selectedTaskId?: string
): React.ReactNode => {
  const visibleTasks = column.tasks.slice(scrollOffset, scrollOffset + maxColumnHeight);

  return (
    <Box key={column.id}>
      {/* Column header with accessibility */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {column.name} ({column.tasks.length})
        </Text>
      </Box>

      {/* Show scroll indicator if there are tasks above */}
      {scrollOffset > 0 && (
        <Box>
          <Text color="gray">⬆ {scrollOffset} more</Text>
        </Box>
      )}

      <Box>
        {visibleTasks.length === 0 ? (
          <Box>
            <Text color="gray">Empty column</Text>
          </Box>
        ) : (
          visibleTasks.map((task, index) =>
            renderTaskItem(task, columnWidth, task.id === selectedTaskId, scrollOffset + index)
          )
        )}
      </Box>

      {/* Show scroll indicator if there are more tasks below */}
      {column.tasks.length > scrollOffset + maxColumnHeight && (
        <Box>
          <Text
            color="gray"
          >
            ⬇ {column.tasks.length - scrollOffset - maxColumnHeight} more
          </Text>
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
 * Renders navigation help with accessibility support
 */
const renderNavigation = (): React.ReactNode => (
  <Box marginTop={1}>
    <Text color="gray">
      Navigation: ↑↓ Select Task | ← → Switch Column | Tab: Focus | Enter: Details | Q: Quit | ?:
      Help
    </Text>
    <Text color="gray">
      Screen reader users: Use Tab to navigate, Space to select, Enter to activate
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
        {columnsWithTasks.map(column =>
          renderColumn(column, columnWidth, maxColumnHeight, 0, _selectedTaskId)
        )}
      </Box>

      {/* Board Summary */}
      {renderSummary(totalTasks, completedTasks, columnsWithTasks)}

      {/* Navigation Help */}
      {renderNavigation()}
    </Box>
  );
};

export default BoardView;
