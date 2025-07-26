# Development Guide

This guide covers the development environment setup, coding standards, and best practices for contributing to the MCP Kanban project.

## Table of Contents

- [Development Environment](#development-environment)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Database Development](#database-development)
- [MCP Integration](#mcp-integration)
- [Debugging](#debugging)
- [Performance Optimization](#performance-optimization)
- [Common Tasks](#common-tasks)

## Development Environment

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Git** >= 2.30.0
- **SQLite** (for database operations)
- **VS Code** (recommended IDE)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-kanban.git
cd mcp-kanban

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Initialize database
npm run migrate

# Seed development data (optional)
npm run seed

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file in the project root:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_PATH=./data/kanban.db
DATABASE_VERBOSE=true

# Development Features
DEV_SEED_DATABASE=true
DEV_ENABLE_DEBUG_ROUTES=true
DEV_WATCH_FILES=true

# Logging
LOG_LEVEL=debug
LOG_CONSOLE=true

# WebSocket
WEBSOCKET_PORT=3001

# Git Integration
GIT_AUTO_DETECT=true
```

### VS Code Setup

#### Recommended Extensions

```json
// .vscode/extensions.json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml"
  ]
}
```

#### VS Code Settings

```json
// .vscode/settings.json
{
  "typescript.preferences.includePackageJsonAutoImports": "auto",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "eslint.validate": [
    "javascript",
    "typescript"
  ],
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.git": true
  }
}
```

## Project Structure

```
mcp-kanban/
├── src/                    # Source code
│   ├── config/            # Configuration management
│   ├── database/          # Database layer
│   │   ├── migrations/    # Database migrations
│   │   └── seeds/         # Database seeds
│   ├── middleware/        # Express middleware
│   ├── mcp/              # MCP protocol implementation
│   ├── routes/           # HTTP route handlers
│   ├── services/         # Business logic layer
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   ├── websocket/        # WebSocket implementation
│   ├── index.ts          # MCP server entry point
│   └── server.ts         # HTTP server entry point
├── tests/                # Test files
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
├── docs/                 # Documentation
├── scripts/              # Build and utility scripts
└── data/                 # Database and backup files
```

### Key Directories

#### `/src/services/`
Business logic layer containing:
- `TaskService.ts` - Task CRUD and relationship management
- `BoardService.ts` - Board and column management
- `ContextService.ts` - AI context generation
- `NoteService.ts` - Task notes and comments
- `TagService.ts` - Tag management and categorization

#### `/src/database/`
Database layer containing:
- `connection.ts` - Database connection management
- `schema.ts` - Database schema definitions
- `migrations/` - Database migration files
- `seeds/` - Database seed data

#### `/src/mcp/`
MCP protocol implementation:
- `server.ts` - Main MCP server
- `tools.ts` - MCP tool definitions
- `resources.ts` - MCP resource handlers
- `prompts.ts` - MCP prompt templates

## Development Workflow

### 1. Branch Strategy

```bash
# Feature development
git checkout -b feature/task-dependencies
git checkout -b feature/websocket-notifications

# Bug fixes
git checkout -b fix/task-position-bug
git checkout -b fix/memory-leak

# Documentation
git checkout -b docs/api-reference
```

### 2. Development Cycle

1. **Create feature branch** from `main`
2. **Write tests first** (TDD approach)
3. **Implement feature** following coding standards
4. **Run quality checks** (lint, typecheck, test)
5. **Test manually** with development server
6. **Create pull request** with description
7. **Address review feedback**
8. **Merge to main** after approval

### 3. Quality Gates

Before committing, ensure all checks pass:

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Tests
npm run test

# Build verification
npm run build
```

## Coding Standards

### TypeScript Guidelines

#### 1. Type Safety

```typescript
// Good: Explicit types for public APIs
interface CreateTaskRequest {
  title: string;
  description?: string;
  board_id: string;
}

// Good: Use type guards
function isTask(obj: unknown): obj is Task {
  return typeof obj === 'object' && obj !== null && 'id' in obj;
}

// Avoid: Any types
const data: any = response.body; // ❌

// Better: Unknown with type guards
const data: unknown = response.body;
if (isTask(data)) {
  // Use data safely
}
```

#### 2. Error Handling

```typescript
// Good: Structured error handling
class TaskService {
  async createTask(data: CreateTaskRequest): Promise<Task> {
    try {
      // Implementation
      return task;
    } catch (error) {
      logger.error('Failed to create task', { error, data });
      throw this.createError('TASK_CREATE_FAILED', 'Failed to create task', error);
    }
  }

  private createError(code: string, message: string, cause?: unknown): ServiceError {
    const error = new Error(message) as ServiceError;
    error.code = code;
    error.statusCode = this.getStatusCodeForError(code);
    error.cause = cause;
    return error;
  }
}
```

#### 3. Async/Await Usage

```typescript
// Good: Proper async/await
async function processTaskBatch(tasks: Task[]): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  
  for (const task of tasks) {
    try {
      const result = await processTask(task);
      results.push(result);
    } catch (error) {
      logger.warn('Task processing failed', { taskId: task.id, error });
      results.push({ id: task.id, status: 'failed', error: error.message });
    }
  }
  
  return results;
}

// Good: Parallel processing when appropriate
async function processTasksBatch(tasks: Task[]): Promise<ProcessResult[]> {
  return Promise.allSettled(
    tasks.map(async (task) => {
      try {
        return await processTask(task);
      } catch (error) {
        return { id: task.id, status: 'failed', error: error.message };
      }
    })
  );
}
```

### Code Organization

#### 1. File Structure

```typescript
// File: TaskService.ts

// 1. Imports (external first, then internal)
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';

// 2. Types and interfaces
export interface CreateTaskRequest {
  // ...
}

// 3. Main class/function
export class TaskService {
  // ...
}

// 4. Utility functions (if any)
function validateTaskData(data: unknown): CreateTaskRequest {
  // ...
}
```

#### 2. Import Organization

```typescript
// External libraries first
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

// Internal modules (use @ alias)
import { config } from '@/config';
import { logger } from '@/utils/logger';
import type { Task } from '@/types';

// Relative imports last
import { validateInput } from './validation';
```

### ESLint Configuration

The project uses a comprehensive ESLint configuration:

```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "@typescript-eslint/recommended",
    "airbnb-base",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "prefer-const": "error",
    "no-var": "error",
    "object-shorthand": "error"
  }
}
```

## Database Development

### Migration Development

#### 1. Creating Migrations

```bash
# Create new migration
npm run migrate:create add_task_dependencies

# This creates: src/database/migrations/003_add_task_dependencies.ts
```

#### 2. Migration Structure

```typescript
// src/database/migrations/003_add_task_dependencies.ts
import type { Migration } from './types';

export const migration: Migration = {
  id: '003',
  name: 'add_task_dependencies',
  description: 'Add task dependency relationships',
  
  async up(db) {
    await db.run(`
      CREATE TABLE task_dependencies (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,
        dependency_type TEXT DEFAULT 'blocks',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        UNIQUE(task_id, depends_on_task_id)
      )
    `);

    await db.run(`
      CREATE INDEX idx_task_dependencies_task_id 
      ON task_dependencies(task_id)
    `);
  },

  async down(db) {
    await db.run('DROP TABLE task_dependencies');
  },
};
```

#### 3. Running Migrations

```bash
# Run all pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Check migration status
npm run migrate:status
```

### Seed Development

#### 1. Creating Seeds

```bash
# Create new seed
npm run seed:create sample_boards

# This creates: src/database/seeds/004_sample_boards.ts
```

#### 2. Seed Structure

```typescript
// src/database/seeds/004_sample_boards.ts
import type { Seed } from './types';

export const seed: Seed = {
  id: '004',
  name: 'sample_boards',
  description: 'Create sample boards for development',
  
  async run(db) {
    const boards = [
      {
        id: 'dev-board-1',
        name: 'Development Tasks',
        description: 'Development workflow board',
        color: '#3B82F6',
      },
      {
        id: 'personal-board-1',
        name: 'Personal Tasks',
        description: 'Personal task management',
        color: '#10B981',
      },
    ];

    for (const board of boards) {
      await db.run(
        'INSERT OR REPLACE INTO boards (id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [board.id, board.name, board.description, board.color, new Date(), new Date()]
      );
    }

    logger.info(`Seeded ${boards.length} sample boards`);
  },
};
```

### Database Testing

```typescript
// tests/integration/database/migrations.test.ts
describe('Database Migrations', () => {
  let testDb: DatabaseConnection;

  beforeEach(async () => {
    testDb = new DatabaseConnection(':memory:');
    await testDb.initialize();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it('should run all migrations successfully', async () => {
    const runner = new MigrationRunner(testDb);
    
    await runner.runPendingMigrations();
    
    const status = await runner.getStatus();
    expect(status.every(m => m.applied)).toBe(true);
  });
});
```

## MCP Integration

### Tool Development

#### 1. Creating MCP Tools

```typescript
// src/mcp/tools/TaskTools.ts
export class TaskTools {
  constructor(private taskService: TaskService) {}

  createTask = {
    name: 'create_task',
    description: 'Create a new task with the specified details',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        priority: { type: 'number', description: 'Task priority (1-10)' },
      },
      required: ['title'],
    },
    
    async handler(args: CreateTaskArgs): Promise<Task> {
      return this.taskService.createTask({
        title: args.title,
        description: args.description,
        priority: args.priority,
        board_id: await this.getDefaultBoardId(),
        column_id: 'todo',
      });
    },
  };
}
```

#### 2. Resource Development

```typescript
// src/mcp/resources/BoardResources.ts
export class BoardResources {
  constructor(private boardService: BoardService) {}

  async listResources(): Promise<Resource[]> {
    const boards = await this.boardService.getBoards();
    
    return boards.map(board => ({
      uri: `kanban://boards/${board.id}`,
      name: board.name,
      description: `Board: ${board.name}`,
      mimeType: 'application/json',
    }));
  }

  async readResource(uri: string): Promise<ResourceContent> {
    const boardId = this.extractBoardId(uri);
    const board = await this.boardService.getBoardWithStats(boardId);
    
    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(board, null, 2),
    };
  }
}
```

### Testing MCP Components

```typescript
// tests/unit/mcp/tools.test.ts
describe('MCP Tools', () => {
  let toolRegistry: MCPToolRegistry;
  let mockServices: MockServices;

  beforeEach(() => {
    mockServices = createMockServices();
    toolRegistry = new MCPToolRegistry(mockServices);
  });

  describe('create_task tool', () => {
    it('should create task with valid arguments', async () => {
      const args = {
        title: 'Test Task',
        description: 'Test Description',
      };

      const result = await toolRegistry.callTool('create_task', args);

      expect(result).toMatchObject({
        title: 'Test Task',
        description: 'Test Description',
      });
      expect(mockServices.taskService.createTask).toHaveBeenCalledWith(
        expect.objectContaining(args)
      );
    });
  });
});
```

## Debugging

### VS Code Debugging

#### 1. Launch Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug MCP Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/mcp/server.ts",
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development",
        "DATABASE_PATH": "./data/debug.db"
      },
      "console": "integratedTerminal",
      "sourceMaps": true
    },
    {
      "name": "Debug HTTP Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/server.ts",
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development",
        "PORT": "3000"
      }
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand"],
      "env": {
        "NODE_ENV": "test"
      }
    }
  ]
}
```

#### 2. Debugging Techniques

```typescript
// Add debugging breakpoints
function processTask(task: Task): ProcessResult {
  // Set breakpoint here
  debugger;
  
  // Use conditional breakpoints
  if (task.priority > 8) {
    debugger; // Only breaks for high priority tasks
  }
  
  return result;
}
```

### Logging for Development

```typescript
// Structured logging
logger.debug('Processing task', {
  taskId: task.id,
  priority: task.priority,
  status: task.status,
  boardId: task.board_id,
});

// Performance logging
const startTime = Date.now();
const result = await expensiveOperation();
logger.debug('Operation completed', {
  operation: 'expensiveOperation',
  duration: Date.now() - startTime,
  resultSize: JSON.stringify(result).length,
});
```

### Database Debugging

```typescript
// Enable SQL logging
const db = new DatabaseConnection(path, {
  verbose: true, // Logs all SQL queries
});

// Manual query debugging
const sql = 'SELECT * FROM tasks WHERE board_id = ?';
const params = [boardId];
logger.debug('Executing query', { sql, params });

const results = await db.query(sql, params);
logger.debug('Query results', { 
  sql, 
  params, 
  resultCount: results.length 
});
```

## Performance Optimization

### Database Optimization

#### 1. Query Optimization

```typescript
// Good: Use indexes effectively
async function getTasksByBoardAndStatus(boardId: string, status: string): Promise<Task[]> {
  // This query uses the composite index on (board_id, status)
  return this.db.query(`
    SELECT * FROM tasks 
    WHERE board_id = ? AND status = ?
    ORDER BY position ASC
  `, [boardId, status]);
}

// Good: Batch operations
async function updateTaskPositions(updates: PositionUpdate[]): Promise<void> {
  await this.db.transaction(async (tx) => {
    for (const update of updates) {
      await tx.run(
        'UPDATE tasks SET position = ? WHERE id = ?',
        [update.position, update.id]
      );
    }
  });
}
```

#### 2. Connection Pooling

```typescript
// Configure database connection for performance
const dbConnection = new DatabaseConnection(config.database.path, {
  walMode: true, // Enable WAL mode for better concurrency
  memoryLimit: 256 * 1024 * 1024, // 256MB memory limit
  timeout: 30000, // 30 second timeout
});
```

### Memory Optimization

```typescript
// Good: Stream large result sets
async function* getTasksStream(boardId: string): AsyncGenerator<Task, void, unknown> {
  const batchSize = 100;
  let offset = 0;
  
  while (true) {
    const tasks = await this.db.query(
      'SELECT * FROM tasks WHERE board_id = ? LIMIT ? OFFSET ?',
      [boardId, batchSize, offset]
    );
    
    if (tasks.length === 0) break;
    
    for (const task of tasks) {
      yield task;
    }
    
    offset += batchSize;
  }
}

// Usage
for await (const task of taskService.getTasksStream(boardId)) {
  await processTask(task);
}
```

### Caching Strategies

```typescript
// Simple in-memory cache with TTL
class CacheService {
  private cache = new Map<string, CacheEntry>();
  
  set(key: string, value: any, ttlMs: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }
  
  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }
}

// Usage in service
class ContextService {
  private cache = new CacheService();
  
  async getProjectContext(projectId: string): Promise<ProjectContext> {
    const cacheKey = `project-context:${projectId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    const context = await this.generateProjectContext(projectId);
    this.cache.set(cacheKey, context, 5 * 60 * 1000); // 5 minute TTL
    
    return context;
  }
}
```

## Common Tasks

### Adding a New Service

1. **Create service file**:
```typescript
// src/services/NewService.ts
export class NewService {
  constructor(private db: DatabaseConnection) {}
  
  async performOperation(): Promise<Result> {
    // Implementation
  }
}
```

2. **Add service tests**:
```typescript
// tests/unit/services/NewService.test.ts
describe('NewService', () => {
  // Tests
});
```

3. **Register in dependency injection**:
```typescript
// src/services/index.ts
export { NewService } from './NewService';

// Update server setup
const newService = new NewService(dbConnection);
```

### Adding a New API Endpoint

1. **Create route handler**:
```typescript
// src/routes/new-resource.ts
import { Router } from 'express';
import { NewService } from '@/services/NewService';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const result = await newService.performOperation(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

export { router as newResourceRouter };
```

2. **Register route**:
```typescript
// src/routes/index.ts
import { newResourceRouter } from './new-resource';

app.use('/api/new-resource', newResourceRouter);
```

3. **Add API tests**:
```typescript
// tests/integration/api/new-resource.test.ts
describe('New Resource API', () => {
  // Integration tests
});
```

### Adding a New MCP Tool

1. **Define tool**:
```typescript
// src/mcp/tools/NewTool.ts
export const newTool = {
  name: 'new_tool',
  description: 'Description of what the tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter description' },
    },
    required: ['param1'],
  },
  
  async handler(args: any): Promise<any> {
    // Implementation
  },
};
```

2. **Register tool**:
```typescript
// src/mcp/tools.ts
import { newTool } from './tools/NewTool';

export class MCPToolRegistry {
  private tools = new Map([
    ['new_tool', newTool],
    // ... other tools
  ]);
}
```

3. **Add tool tests**:
```typescript
// tests/unit/mcp/NewTool.test.ts
describe('new_tool', () => {
  // Tool tests
});
```

For additional development questions, see the [API Documentation](../API.md) or the [Contributing Guidelines](../CONTRIBUTING.md).