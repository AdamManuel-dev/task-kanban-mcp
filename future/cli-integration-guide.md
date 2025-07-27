# CLI Enhancement Integration Guide for task-kanban-mcp

This guide provides step-by-step instructions for integrating interactive CLI libraries into the task-kanban-mcp project to enhance the user experience.

## Overview

The following libraries will be integrated:
- **enquirer**: Interactive CLI prompts with validation
- **prompts**: Lightweight alternative for simple prompts
- **ink**: React-based terminal UI components
- **ora**: Terminal spinners for async operations

## Installation

First, install the required dependencies:

```bash
cd /path/to/task-kanban-mcp
npm install enquirer prompts ink react ora
```

## Integration Architecture

### 1. Project Structure Updates

Create the following directory structure for CLI enhancements:

```
task-kanban-mcp/
├── cli/
│   ├── ui/
│   │   ├── components/
│   │   │   ├── TaskList.js
│   │   │   ├── BoardView.js
│   │   │   └── StatusIndicator.js
│   │   └── themes/
│   │       └── default.js
│   ├── prompts/
│   │   ├── taskPrompts.js
│   │   ├── boardPrompts.js
│   │   └── validators.js
│   └── utils/
│       ├── spinner.js
│       └── formatter.js
```

## Implementation Guide

### 2. Spinner Integration (ora)

Create `cli/utils/spinner.js`:

```javascript
import ora from 'ora';

class SpinnerManager {
  constructor() {
    this.spinner = null;
  }

  start(text = 'Loading...') {
    this.spinner = ora({
      text,
      spinner: 'dots',
      color: 'cyan'
    }).start();
    return this.spinner;
  }

  succeed(text) {
    if (this.spinner) {
      this.spinner.succeed(text);
    }
  }

  fail(text) {
    if (this.spinner) {
      this.spinner.fail(text);
    }
  }

  info(text) {
    if (this.spinner) {
      this.spinner.info(text);
    }
  }

  stop() {
    if (this.spinner) {
      this.spinner.stop();
    }
  }
}

export default new SpinnerManager();
```

### 3. Interactive Prompts (enquirer)

Create `cli/prompts/taskPrompts.js`:

```javascript
import { prompt, Select, MultiSelect, Input, Form } from 'enquirer';
import { validateTaskTitle, validatePriority } from './validators.js';

export async function createTaskPrompt() {
  const response = await prompt([
    {
      type: 'input',
      name: 'title',
      message: 'Task title:',
      validate: validateTaskTitle
    },
    {
      type: 'input',
      name: 'description',
      message: 'Task description (optional):',
      initial: ''
    },
    {
      type: 'select',
      name: 'priority',
      message: 'Priority:',
      choices: ['low', 'medium', 'high', 'critical'],
      initial: 'medium'
    },
    {
      type: 'multiselect',
      name: 'tags',
      message: 'Tags (select multiple):',
      choices: ['backend', 'frontend', 'bug', 'feature', 'documentation', 'testing'],
      initial: []
    }
  ]);

  return response;
}

export async function moveTaskPrompt(tasks, columns) {
  const taskSelect = new Select({
    name: 'task',
    message: 'Select task to move:',
    choices: tasks.map(t => ({
      name: t.id,
      message: `${t.title} (${t.column})`,
      value: t.id
    }))
  });

  const taskId = await taskSelect.run();

  const columnSelect = new Select({
    name: 'column',
    message: 'Move to column:',
    choices: columns.map(c => ({
      name: c.id,
      message: c.name,
      value: c.id
    }))
  });

  const columnId = await columnSelect.run();

  return { taskId, columnId };
}

export async function bulkTaskActionPrompt(tasks) {
  const form = new Form({
    name: 'bulkAction',
    message: 'Bulk Task Actions',
    choices: [
      {
        name: 'action',
        message: 'Action',
        initial: 'move',
        choices: ['move', 'delete', 'archive', 'tag']
      },
      {
        name: 'tasks',
        message: 'Select tasks',
        type: 'multiselect',
        choices: tasks.map(t => ({
          name: t.id,
          message: t.title,
          value: t.id
        }))
      }
    ]
  });

  return await form.run();
}
```

### 4. Alternative Prompts (prompts)

Create `cli/prompts/boardPrompts.js` using the lighter prompts library:

```javascript
import prompts from 'prompts';

export async function quickBoardSetup() {
  const response = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Board name:',
      validate: value => value.length > 0 ? true : 'Board name required'
    },
    {
      type: 'text',
      name: 'goal',
      message: 'Project goal:',
      initial: ''
    },
    {
      type: 'confirm',
      name: 'autoDetectGit',
      message: 'Auto-detect Git repository?',
      initial: true
    }
  ]);

  return response;
}

export async function confirmAction(message) {
  const { confirmed } = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message,
    initial: false
  });

  return confirmed;
}
```

### 5. React-based Terminal UI (ink)

Create `cli/ui/components/TaskList.js`:

```javascript
import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';

const TaskList = ({ tasks, onSelect }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape) {
      exit();
    }
  });

  const items = tasks.map(task => ({
    label: `${task.title} [${task.priority}]`,
    value: task.id
  }));

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Task Management</Text>
      </Box>
      <SelectInput
        items={items}
        onSelect={item => onSelect(item.value)}
        initialIndex={selectedIndex}
      />
      <Box marginTop={1}>
        <Text dimColor>Use arrow keys to navigate, Enter to select, Esc to exit</Text>
      </Box>
    </Box>
  );
};

export default TaskList;
```

Create `cli/ui/components/BoardView.js`:

```javascript
import React from 'react';
import { Box, Text, Newline } from 'ink';

const BoardView = ({ board, tasks }) => {
  const tasksByColumn = board.columns.reduce((acc, col) => {
    acc[col.id] = tasks.filter(t => t.columnId === col.id);
    return acc;
  }, {});

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">{board.name}</Text>
        <Newline />
        <Text dimColor>{board.goal}</Text>
      </Box>
      
      <Box>
        {board.columns.map((column, index) => (
          <Box
            key={column.id}
            flexDirection="column"
            marginRight={2}
            width={30}
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
          >
            <Text bold underline>{column.name}</Text>
            <Text dimColor>({tasksByColumn[column.id].length} tasks)</Text>
            <Newline />
            
            {tasksByColumn[column.id].map(task => (
              <Box key={task.id} marginBottom={1}>
                <Text>• {task.title}</Text>
                {task.priority === 'high' && (
                  <Text color="red"> [HIGH]</Text>
                )}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default BoardView;
```

### 6. Main CLI Integration

Update your main CLI file to use these enhancements:

```javascript
import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import spinner from './cli/utils/spinner.js';
import { createTaskPrompt, moveTaskPrompt } from './cli/prompts/taskPrompts.js';
import { quickBoardSetup, confirmAction } from './cli/prompts/boardPrompts.js';
import TaskList from './cli/ui/components/TaskList.js';
import BoardView from './cli/ui/components/BoardView.js';

const program = new Command();

// Enhanced task creation command
program
  .command('task:create')
  .description('Create a new task interactively')
  .action(async () => {
    try {
      const taskData = await createTaskPrompt();
      
      spinner.start('Creating task...');
      
      // Your API call here
      const task = await api.createTask(taskData);
      
      spinner.succeed(`Task created: ${task.title}`);
    } catch (error) {
      spinner.fail(`Failed to create task: ${error.message}`);
    }
  });

// Interactive board view
program
  .command('board:view')
  .description('View board in interactive mode')
  .option('-i, --interactive', 'Interactive mode')
  .action(async (options) => {
    spinner.start('Loading board...');
    
    try {
      const board = await api.getBoard();
      const tasks = await api.getTasks();
      
      spinner.stop();
      
      if (options.interactive) {
        render(<BoardView board={board} tasks={tasks} />);
      } else {
        // Regular console output
        console.log(formatBoardOutput(board, tasks));
      }
    } catch (error) {
      spinner.fail(`Failed to load board: ${error.message}`);
    }
  });

// Interactive task selection
program
  .command('task:select')
  .description('Select and manage tasks interactively')
  .action(async () => {
    spinner.start('Loading tasks...');
    
    try {
      const tasks = await api.getTasks();
      spinner.stop();
      
      const { waitUntilExit } = render(
        <TaskList 
          tasks={tasks} 
          onSelect={async (taskId) => {
            // Handle task selection
            console.log(`Selected task: ${taskId}`);
          }}
        />
      );
      
      await waitUntilExit();
    } catch (error) {
      spinner.fail(`Failed to load tasks: ${error.message}`);
    }
  });

// Quick board setup
program
  .command('board:quick-setup')
  .description('Quick board setup wizard')
  .action(async () => {
    const boardData = await quickBoardSetup();
    
    if (boardData.autoDetectGit) {
      spinner.start('Detecting Git repository...');
      // Git detection logic
      spinner.succeed('Git repository detected');
    }
    
    const confirmed = await confirmAction(
      `Create board "${boardData.name}"?`
    );
    
    if (confirmed) {
      spinner.start('Creating board...');
      // Create board
      spinner.succeed('Board created successfully');
    }
  });

program.parse(process.argv);
```

### 7. Validators and Task Estimation

Create `cli/prompts/validators.js`:

```javascript
export function validateTaskTitle(value) {
  if (!value || value.trim().length === 0) {
    return 'Task title is required';
  }
  if (value.length > 200) {
    return 'Task title must be less than 200 characters';
  }
  return true;
}

export function validatePriority(value) {
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  if (!validPriorities.includes(value)) {
    return 'Invalid priority level';
  }
  return true;
}

export function validateTaskSize(value) {
  const validSizes = ['S', 'M', 'L', 'XL'];
  if (!validSizes.includes(value.toUpperCase())) {
    return 'Invalid task size. Use S, M, L, or XL';
  }
  return true;
}
```

### 8. Task Size Estimation

Create `cli/estimation/taskSizeEstimator.js`:

```javascript
import chalk from 'chalk';

export class TaskSizeEstimator {
  constructor() {
    // Time estimates in minutes based on historical data
    this.timeEstimates = {
      S: { min: 1.0, label: 'Small', description: 'Config updates, simple fixes, documentation' },
      M: { min: 1.4, label: 'Medium', description: 'Standard development, testing, integration' },
      L: { min: 4.0, label: 'Large', description: 'Complex features, major documentation' },
      XL: { min: 8.0, label: 'Extra Large', description: 'Architecture changes, major features' }
    };
  }

  estimateTime(tasks) {
    const grouped = this.groupTasksBySize(tasks);
    const estimates = {};
    let totalMinutes = 0;

    Object.entries(grouped).forEach(([size, taskList]) => {
      const timePerTask = this.timeEstimates[size].min;
      const totalTime = taskList.length * timePerTask;
      totalMinutes += totalTime;

      estimates[size] = {
        count: taskList.length,
        timePerTask,
        totalMinutes: totalTime,
        totalHours: (totalTime / 60).toFixed(1),
        tasks: taskList
      };
    });

    return {
      bySize: estimates,
      totalMinutes,
      totalHours: (totalMinutes / 60).toFixed(1),
      totalDays: (totalMinutes / 60 / 8).toFixed(1) // Assuming 8-hour workday
    };
  }

  groupTasksBySize(tasks) {
    return tasks.reduce((acc, task) => {
      const size = task.size || 'M'; // Default to Medium if not specified
      if (!acc[size]) acc[size] = [];
      acc[size].push(task);
      return acc;
    }, {});
  }

  displayEstimates(estimates) {
    console.log(chalk.bold.white('\n⏱️  Time Estimates by Task Size:'));
    console.log(chalk.gray('═'.repeat(60)));

    Object.entries(estimates.bySize).forEach(([size, data]) => {
      const sizeInfo = this.timeEstimates[size];
      console.log(chalk.bold(`\n${sizeInfo.label} Tasks (${size}): ${data.count} tasks`));
      console.log(`  ${chalk.yellow('●')} Estimated time: ${data.count} × ${data.timePerTask} min = ${chalk.bold(data.totalHours + ' hours')}`);
      console.log(`  ${chalk.dim(sizeInfo.description)}`);
    });

    console.log(chalk.gray('\n' + '─'.repeat(60)));
    console.log(chalk.bold('Total Estimates:'));
    console.log(`  Total Tasks: ${Object.values(estimates.bySize).reduce((sum, d) => sum + d.count, 0)}`);
    console.log(`  Total Time: ${chalk.bold.green(estimates.totalHours + ' hours')} (${estimates.totalDays} days)`);
  }

  suggestTaskSize(task) {
    // Simple heuristics for suggesting task size
    const indicators = {
      S: ['fix', 'typo', 'config', 'update', 'document', 'rename'],
      M: ['implement', 'add', 'create', 'test', 'integrate'],
      L: ['refactor', 'redesign', 'migrate', 'optimize', 'architecture'],
      XL: ['rewrite', 'overhaul', 'major', 'framework', 'infrastructure']
    };

    const title = task.title.toLowerCase();
    
    for (const [size, keywords] of Object.entries(indicators)) {
      if (keywords.some(keyword => title.includes(keyword))) {
        return size;
      }
    }

    // Default to medium if no indicators found
    return 'M';
  }
}
```

Update `cli/prompts/taskPrompts.js` to include size estimation:

```javascript
import { prompt, Select, MultiSelect, Input, Form } from 'enquirer';
import { validateTaskTitle, validatePriority, validateTaskSize } from './validators.js';
import { TaskSizeEstimator } from '../estimation/taskSizeEstimator.js';

export async function createTaskPrompt() {
  const estimator = new TaskSizeEstimator();
  
  // First get the task title
  const { title } = await prompt({
    type: 'input',
    name: 'title',
    message: 'Task title:',
    validate: validateTaskTitle
  });

  // Suggest a size based on title
  const suggestedSize = estimator.suggestTaskSize({ title });

  const response = await prompt([
    {
      type: 'input',
      name: 'description',
      message: 'Task description (optional):',
      initial: ''
    },
    {
      type: 'select',
      name: 'size',
      message: 'Task size:',
      choices: [
        { name: 'S', message: 'S - Small (≈1.0 min)' },
        { name: 'M', message: 'M - Medium (≈1.4 min)' },
        { name: 'L', message: 'L - Large (≈4.0 min)' },
        { name: 'XL', message: 'XL - Extra Large (≈8.0 min)' }
      ],
      initial: suggestedSize,
      validate: validateTaskSize
    },
    {
      type: 'select',
      name: 'priority',
      message: 'Priority:',
      choices: ['low', 'medium', 'high', 'critical'],
      initial: 'medium'
    },
    {
      type: 'multiselect',
      name: 'tags',
      message: 'Tags (select multiple):',
      choices: ['backend', 'frontend', 'bug', 'feature', 'documentation', 'testing'],
      initial: []
    }
  ]);

  return { title, ...response };
}
```

## Usage Examples

### Creating a task with interactive prompts:
```bash
kanban task:create
```

### Viewing board interactively:
```bash
kanban board:view --interactive
```

### Quick board setup:
```bash
kanban board:quick-setup
```

## Best Practices

1. **Error Handling**: Always wrap async operations with try-catch and use spinner.fail() for errors
2. **User Experience**: Provide clear feedback using spinners and success/error messages
3. **Validation**: Validate user input before making API calls
4. **Escape Routes**: Always provide ways to cancel operations (ESC key, Ctrl+C)
5. **Performance**: Use lazy loading for large datasets in interactive views

## Advanced Features

### Custom Themes
Create custom color themes for your CLI:

```javascript
// cli/ui/themes/default.js
export const theme = {
  primary: 'cyan',
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'blue',
  dim: 'gray'
};
```

### Progress Tracking
Use ora with progress updates:

```javascript
const spinner = ora('Processing tasks...').start();
let processed = 0;

for (const task of tasks) {
  await processTask(task);
  processed++;
  spinner.text = `Processing tasks... (${processed}/${tasks.length})`;
}

spinner.succeed(`Processed ${processed} tasks`);
```

### Keyboard Shortcuts
Implement global keyboard shortcuts in Ink components:

```javascript
useInput((input, key) => {
  if (key.ctrl && input === 'r') {
    // Refresh
  }
  if (key.ctrl && input === 'n') {
    // New task
  }
});
```

## Testing

Create tests for your interactive components:

```javascript
import { render } from 'ink-testing-library';
import TaskList from '../cli/ui/components/TaskList.js';

test('TaskList renders tasks correctly', () => {
  const tasks = [
    { id: 1, title: 'Test Task', priority: 'high' }
  ];
  
  const { lastFrame } = render(
    <TaskList tasks={tasks} onSelect={() => {}} />
  );
  
  expect(lastFrame()).toContain('Test Task');
  expect(lastFrame()).toContain('[high]');
});
```

## Troubleshooting

1. **Terminal Compatibility**: Ensure your terminal supports ANSI colors and Unicode
2. **Node Version**: These libraries require Node.js 14+ for ESM support
3. **Windows Support**: Test thoroughly on Windows as some features may behave differently

## Conclusion

This integration enhances the task-kanban-mcp CLI with:
- Interactive prompts for better user experience
- Visual feedback through spinners
- React-based terminal UI for complex views
- Flexible prompt options with enquirer and prompts

The modular structure allows you to use different libraries for different scenarios, providing the best user experience for each use case.