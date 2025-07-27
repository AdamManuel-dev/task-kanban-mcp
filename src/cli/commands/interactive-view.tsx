import React, { useState, useEffect } from 'react';
import { render, useApp, useInput } from 'ink';
import { Command } from 'commander';
import chalk from 'chalk';
import TaskList, { type Task } from '../ui/components/TaskList';
import BoardView, { type Board, type Column } from '../ui/components/BoardView';
import StatusIndicator from '../ui/components/StatusIndicator';

interface InteractiveViewProps {
  mode: 'tasks' | 'board';
  data: any;
}

const InteractiveView: React.FC<InteractiveViewProps> = ({ mode, data }) => {
  const [currentView, setCurrentView] = useState<'tasks' | 'board' | 'help'>(mode);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error' | 'loading'>('info');
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === 'q' && !key.ctrl) {
      exit();
    } else if (input === '1') {
      setCurrentView('tasks');
      setStatusMessage('Switched to Task List view');
      setStatusType('info');
    } else if (input === '2') {
      setCurrentView('board');
      setStatusMessage('Switched to Board view');
      setStatusType('info');
    } else if (input === '?' || input === 'h') {
      setCurrentView('help');
      setStatusMessage('Showing help');
      setStatusType('info');
    } else if (input === 'r') {
      setStatusMessage('Refreshing data...');
      setStatusType('loading');
      // In a real app, this would fetch fresh data
      setTimeout(() => {
        setStatusMessage('Data refreshed');
        setStatusType('success');
      }, 1000);
    }
  });

  const handleTaskSelect = (task: Task) => {
    setStatusMessage(`Selected task: ${String(String(task.title))}`);
    setStatusType('success');
  };

  const handleBoardTaskSelect = (task: Task, columnId: string) => {
    setStatusMessage(`Selected task: ${String(String(task.title))} in column ${String(columnId)}`);
    setStatusType('success');
  };

  const handleColumnSelect = (column: Column) => {
    setStatusMessage(
      `Selected column: ${String(String(column.name))} (${String(String(column.tasks.length))} tasks)`
    );
    setStatusType('info');
  };

  const renderHelp = () => (
    <div>
      <h2>{chalk.cyan('🎮 Interactive View Help')}</h2>
      <br />

      <h3>{chalk.yellow('Global Controls:')}</h3>
      <p>
        • <strong>1</strong> - Switch to Task List view
      </p>
      <p>
        • <strong>2</strong> - Switch to Board view
      </p>
      <p>
        • <strong>h</strong> or <strong>?</strong> - Show this help
      </p>
      <p>
        • <strong>r</strong> - Refresh data
      </p>
      <p>
        • <strong>q</strong> - Quit
      </p>
      <br />

      <h3>{chalk.yellow('Task List Controls:')}</h3>
      <p>
        • <strong>↑/↓</strong> or <strong>j/k</strong> - Navigate tasks
      </p>
      <p>
        • <strong>Enter</strong> - Select task
      </p>
      <br />

      <h3>{chalk.yellow('Board Controls:')}</h3>
      <p>
        • <strong>←/→</strong> or <strong>h/l</strong> - Switch columns
      </p>
      <p>
        • <strong>↑/↓</strong> or <strong>j/k</strong> - Navigate tasks
      </p>
      <p>
        • <strong>Enter</strong> - Select task or column
      </p>
      <br />

      <p>{chalk.gray('Press any key to return to previous view')}</p>
    </div>
  );

  const renderCurrentView = () => {
    switch (currentView) {
      case 'tasks':
        return (
          <TaskList
            tasks={data.tasks || []}
            title="Interactive Task List"
            onTaskSelect={handleTaskSelect}
            showSelection={true}
            maxHeight={15}
            showStats={true}
          />
        );

      case 'board':
        return (
          <BoardView
            board={data.board || { id: '1', name: 'Sample Board', columns: [] }}
            onTaskSelect={handleBoardTaskSelect}
            onColumnSelect={handleColumnSelect}
            showWIPLimits={true}
            maxColumnHeight={10}
            columnWidth={25}
          />
        );

      case 'help':
        return renderHelp();

      default:
        return <div>Unknown view</div>;
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 1 }}>
        <h1>{chalk.bold.cyan('🚀 Kanban CLI Interactive Mode')}</h1>
        <p>
          {chalk.gray(
            `Current view: ${String(currentView)} | Press 'h' for help | Press 'q' to quit`
          )}
        </p>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div style={{ marginBottom: 1 }}>
          <StatusIndicator status={statusType} message={statusMessage} />
        </div>
      )}

      {/* Main content */}
      {renderCurrentView()}

      {/* Footer */}
      <div style={{ marginTop: 1 }}>
        <p>{chalk.gray('─'.repeat(80))}</p>
        <p>{chalk.gray('Interactive Kanban CLI - Press h for help, q to quit')}</p>
      </div>
    </div>
  );
};

// Sample data generator
const generateSampleData = () => {
  const sampleTasks: Task[] = [
    {
      id: 'TASK-001',
      title: 'Implement user authentication',
      status: 'in_progress',
      priority: 'P1',
      assignee: 'alice',
      tags: ['backend', 'security'],
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'TASK-002',
      title: 'Design landing page',
      status: 'todo',
      priority: 'P2',
      assignee: 'bob',
      tags: ['frontend', 'design'],
    },
    {
      id: 'TASK-003',
      title: 'Set up CI/CD pipeline',
      status: 'done',
      priority: 'P1',
      assignee: 'charlie',
      tags: ['devops', 'automation'],
    },
    {
      id: 'TASK-004',
      title: 'Write API documentation',
      status: 'blocked',
      priority: 'P3',
      assignee: 'diana',
      tags: ['documentation', 'api'],
    },
    {
      id: 'TASK-005',
      title: 'Optimize database queries',
      status: 'todo',
      priority: 'P2',
      assignee: 'eve',
      tags: ['backend', 'performance'],
    },
  ];

  const sampleBoard: Board = {
    id: 'board-1',
    name: 'Development Sprint',
    description: 'Current sprint board for the development team',
    columns: [
      {
        id: 'col-1',
        name: 'Backlog',
        tasks: sampleTasks.filter(t => t.status === 'todo'),
        limit: 5,
      },
      {
        id: 'col-2',
        name: 'In Progress',
        tasks: sampleTasks.filter(t => t.status === 'in_progress'),
        limit: 3,
      },
      {
        id: 'col-3',
        name: 'Blocked',
        tasks: sampleTasks.filter(t => t.status === 'blocked'),
        limit: 2,
      },
      {
        id: 'col-4',
        name: 'Done',
        tasks: sampleTasks.filter(t => t.status === 'done'),
      },
    ],
  };

  return {
    tasks: sampleTasks,
    board: sampleBoard,
  };
};

// CLI command implementation
export const interactiveViewCommand = new Command('interactive')
  .alias('ui')
  .description('Launch interactive UI for tasks and boards')
  .option('-m, --mode <mode>', 'Initial view mode: tasks or board', 'tasks')
  .option('--sample-data', 'Use sample data for demo', false)
  .action(async options => {
    try {
      // In a real implementation, this would fetch data from the API
      const data = options.sampleData ? generateSampleData() : await fetchRealData();

      if (options.mode !== 'tasks' && options.mode !== 'board') {
        logger.error(chalk.red('Error: Mode must be either "tasks" or "board"'));
        process.exit(1);
      }

      logger.log(chalk.cyan('\n🚀 Starting interactive mode...\n'));
      logger.log(chalk.gray('Press h for help, q to quit\n'));

      render(<InteractiveView mode={options.mode as 'tasks' | 'board'} data={data} />);
    } catch (error) {
      logger.error(chalk.red('Error starting interactive mode:'), error);
      process.exit(1);
    }
  });

// Placeholder for real data fetching
async function fetchRealData() {
  // This would connect to the actual API
  // For now, return sample data
  return generateSampleData();
}

export default interactiveViewCommand;
