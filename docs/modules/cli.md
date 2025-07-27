# CLI Module Documentation

## Overview

The CLI module provides a comprehensive command-line interface for the MCP Kanban system. Built with Commander.js, it offers intuitive commands for task management, board operations, and system configuration with rich formatting and interactive features.

## Table of Contents

- [Architecture](#architecture)
- [Command Structure](#command-structure)
- [Core Components](#core-components)
- [Command Modules](#command-modules)
- [Interactive Features](#interactive-features)
- [Configuration](#configuration)
- [Development](#development)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     CLI Entry Point                      │
│                    (src/cli/index.ts)                   │
└────────────────────────┬────────────────────────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
┌───▼──────┐    ┌────────▼────────┐   ┌──────▼──────┐
│ Commands │    │   Formatters    │   │   Utils     │
├──────────┤    ├─────────────────┤   ├─────────────┤
│ • tasks  │    │ • table         │   │ • spinner   │
│ • boards │    │ • json          │   │ • prompts   │
│ • config │    │ • tree          │   │ • keyboard  │
│ • backup │    │ • color         │   │ • security  │
└──────────┘    └─────────────────┘   └─────────────┘
      │                  │                    │
      └──────────────────┴────────────────────┘
                         │
                ┌────────▼────────┐
                │   API Client    │
                └─────────────────┘
```

## Command Structure

### Base Command

```bash
kanban [options] <command> [subcommand] [args]
```

### Global Options

```bash
Options:
  -V, --version        Display version number
  -h, --help          Display help information
  -v, --verbose       Enable verbose output
  -q, --quiet         Suppress non-error output
  -f, --format <type> Output format: table, json, csv (default: table)
  --no-color          Disable colored output
  --api-url <url>     Override API URL
  --api-key <key>     Override API key
```

## Core Components

### API Client Wrapper

**Location**: `src/cli/api-client-wrapper.ts`

Provides a wrapper around the API client with CLI-specific features:

```typescript
class ApiClientWrapper {
  constructor(baseURL?: string, apiKey?: string);
  
  // Enhanced error handling for CLI
  async request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
  
  // Progress tracking for long operations
  async requestWithProgress<T>(
    method: string, 
    path: string, 
    options?: RequestOptions
  ): Promise<T>;
  
  // Batch operations
  async batchRequest<T>(requests: BatchRequest[]): Promise<T[]>;
}
```

### Formatter

**Location**: `src/cli/formatter.ts`

Handles output formatting for different formats:

```typescript
class Formatter {
  constructor(format: 'table' | 'json' | 'csv', options?: FormatterOptions);
  
  // Output methods
  output(data: any, options?: OutputOptions): void;
  error(message: string, error?: Error): void;
  success(message: string): void;
  warning(message: string): void;
  info(message: string): void;
  
  // Specialized formatters
  table(data: any[], options?: TableOptions): void;
  tree(data: TreeNode, options?: TreeOptions): void;
  progress(current: number, total: number, label?: string): void;
}
```

### Configuration Manager

**Location**: `src/cli/config.ts`

Manages CLI configuration and preferences:

```typescript
class Config {
  // Config file operations
  static load(): Config;
  save(): void;
  reset(): void;
  
  // Settings
  getApiUrl(): string;
  setApiUrl(url: string): void;
  getApiKey(): string | undefined;
  setApiKey(key: string): void;
  getDefaultBoard(): string | undefined;
  setDefaultBoard(boardId: string): void;
  getOutputFormat(): string;
  setOutputFormat(format: string): void;
}
```

## Command Modules

### Task Commands

**Location**: `src/cli/commands/tasks.ts`

```bash
# List tasks
kanban task list [options]
  --board <id>      Filter by board
  --status <status> Filter by status
  --assignee <user> Filter by assignee
  --tags <tags>     Filter by tags (comma-separated)
  --limit <n>       Limit results (default: 50)
  --sort <field>    Sort by field
  --order <dir>     Sort order: asc, desc

# Create task
kanban task create [options]
  --title <title>   Task title (required)
  --desc <desc>     Task description
  --board <id>      Board ID (uses default if not specified)
  --priority <n>    Priority 1-5
  --assignee <user> Assign to user
  --due <date>      Due date (ISO format or relative)
  --tags <tags>     Tags (comma-separated)
  --interactive     Interactive mode

# Update task
kanban task update <id> [options]
  --title <title>   New title
  --desc <desc>     New description
  --status <status> New status
  --priority <n>    New priority
  --progress <n>    Progress percentage

# Move task
kanban task move <id> [options]
  --column <id>     Target column
  --position <n>    Position in column
  --interactive     Choose column interactively

# Delete task
kanban task delete <id> [options]
  --force           Skip confirmation

# View task details
kanban task view <id> [options]
  --include-notes   Include notes
  --include-subtasks Include subtasks
  --tree            Show subtasks as tree
```

### Board Commands

**Location**: `src/cli/commands/boards.ts`

```bash
# List boards
kanban board list [options]
  --archived        Include archived boards
  --stats           Include statistics

# Create board
kanban board create [options]
  --name <name>     Board name (required)
  --desc <desc>     Board description
  --columns <cols>  Column names (comma-separated)
  --template <id>   Create from template

# View board
kanban board view <id> [options]
  --tasks           Include all tasks
  --columns         Show column details
  --stats           Show statistics

# Update board
kanban board update <id> [options]
  --name <name>     New name
  --desc <desc>     New description

# Archive/restore board
kanban board archive <id>
kanban board restore <id>

# Delete board
kanban board delete <id> [options]
  --force           Skip confirmation
```

### Context Commands

**Location**: `src/cli/commands/context.ts`

```bash
# Generate project context
kanban context project [options]
  --board <id>      Specific board (default: all)
  --days <n>        Days to include (default: 30)
  --format <type>   Output format

# Generate task context
kanban context task <id> [options]
  --include-related Include related tasks
  --include-history Include change history

# Project summary
kanban context summary [options]
  --board <id>      Specific board
  --include-metrics Include performance metrics
```

### Backup Commands

**Location**: `src/cli/commands/backup.ts`

```bash
# Create backup
kanban backup create [options]
  --output <path>   Output file path
  --boards <ids>    Specific boards (comma-separated)
  --include-all     Include all data

# Restore backup
kanban backup restore <file> [options]
  --boards <ids>    Restore specific boards only
  --merge           Merge with existing data

# List backups
kanban backup list [options]
  --dir <path>      Backup directory
```

## Interactive Features

### Task Selection

```typescript
// Interactive task selection
const selectedTask = await selectTask({
  board: 'board-123',
  message: 'Select a task to update:',
  allowSearch: true
});
```

### Board Navigation

```typescript
// Interactive board navigation
const board = await navigateBoards({
  includeArchived: false,
  showStats: true
});
```

### Prompt System

**Location**: `src/cli/prompts/`

```typescript
// Task prompts
const taskData = await promptTaskDetails({
  title: { required: true },
  description: { multiline: true },
  priority: { type: 'number', min: 1, max: 5 },
  due_date: { type: 'date' }
});

// Confirmation prompts
const confirmed = await confirmAction(
  'Delete this task?',
  { default: false }
);
```

## Configuration

### Configuration File

Location: `~/.config/mcp-kanban/config.json`

```json
{
  "api": {
    "url": "http://localhost:3456/api/v1",
    "key": "your-api-key"
  },
  "defaults": {
    "board": "default-board-id",
    "format": "table",
    "pageSize": 50
  },
  "ui": {
    "color": true,
    "unicode": true,
    "compactMode": false
  },
  "aliases": {
    "tl": "task list",
    "tc": "task create",
    "bl": "board list"
  }
}
```

### Environment Variables

```bash
# API Configuration
KANBAN_API_URL=http://localhost:3456/api/v1
KANBAN_API_KEY=your-api-key

# UI Configuration
KANBAN_NO_COLOR=false
KANBAN_FORMAT=table

# Default Values
KANBAN_DEFAULT_BOARD=board-id
KANBAN_PAGE_SIZE=50
```

## Development

### Adding a New Command

1. Create command file in `src/cli/commands/`:

```typescript
// src/cli/commands/mycommand.ts
import { Command } from 'commander';
import { ApiClient } from '@/cli/api-client';
import { Formatter } from '@/cli/formatter';

export function createMyCommand(apiClient: ApiClient, formatter: Formatter) {
  const command = new Command('mycommand');
  
  command
    .description('My new command')
    .option('-o, --option <value>', 'Option description')
    .action(async (options) => {
      try {
        const result = await apiClient.doSomething(options);
        formatter.output(result);
      } catch (error) {
        formatter.error('Command failed', error);
        process.exit(1);
      }
    });
    
  return command;
}
```

2. Register in main CLI:

```typescript
// src/cli/index.ts
import { createMyCommand } from './commands/mycommand';

// In main program setup
program.addCommand(createMyCommand(apiClient, formatter));
```

### Testing Commands

```typescript
import { testCLI } from '@/tests/helpers/cli';

describe('MyCommand', () => {
  it('should execute successfully', async () => {
    const { stdout, stderr, exitCode } = await testCLI([
      'mycommand',
      '--option', 'value'
    ]);
    
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Success');
  });
});
```

### Error Handling

```typescript
// Consistent error handling pattern
try {
  const result = await apiOperation();
  formatter.success('Operation completed');
} catch (error) {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      formatter.error('Resource not found');
    } else if (error.status === 401) {
      formatter.error('Authentication failed. Run "kanban login" to authenticate.');
    } else {
      formatter.error(`API error: ${error.message}`);
    }
  } else {
    formatter.error('Unexpected error', error);
  }
  process.exit(1);
}
```

### Interactive UI Components

```typescript
// Using Ink for interactive UIs
import React from 'react';
import { render, Box, Text } from 'ink';
import { TaskList } from '@/cli/ui/components/TaskList';

function InteractiveTaskSelector({ tasks }) {
  const [selected, setSelected] = useState(0);
  
  return (
    <Box flexDirection="column">
      <Text>Select a task:</Text>
      <TaskList 
        tasks={tasks}
        selected={selected}
        onSelect={setSelected}
      />
    </Box>
  );
}

// Render interactive component
const { waitUntilExit } = render(
  <InteractiveTaskSelector tasks={tasks} />
);
await waitUntilExit();
```

## Best Practices

### 1. User Experience

- Provide clear, actionable error messages
- Use colors and icons for better visibility
- Support both interactive and scriptable modes
- Provide progress indicators for long operations

### 2. Performance

- Implement pagination for large result sets
- Cache API responses when appropriate
- Use streaming for large data exports
- Minimize API calls with batch operations

### 3. Security

- Never store API keys in plain text
- Validate and sanitize all user input
- Use secure storage for sensitive configuration
- Implement command injection prevention

### 4. Scripting Support

- Support JSON output for scripting
- Provide --quiet mode for automation
- Exit with appropriate codes
- Support stdin/stdout piping

### 5. Documentation

- Include examples in help text
- Provide man pages for detailed docs
- Document all environment variables
- Include common use cases in README

## See Also

- [CLI Usage Guide](../guides/CLI_USAGE.md)
- [API Module](./api.md)
- [Configuration Module](./configuration.md)
- [Getting Started](../guides/GETTING_STARTED.md)