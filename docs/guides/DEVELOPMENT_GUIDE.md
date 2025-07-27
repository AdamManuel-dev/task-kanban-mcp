# MCP Kanban Development Guide

## Table of Contents

- [Overview](#overview)
- [Development Setup](#development-setup)
- [Architecture Overview](#architecture-overview)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing Guide](#testing-guide)
- [Database Development](#database-development)
- [API Development](#api-development)
- [WebSocket Development](#websocket-development)
- [MCP Integration](#mcp-integration)
- [CLI Development](#cli-development)
- [Security Best Practices](#security-best-practices)
- [Performance Guidelines](#performance-guidelines)
- [Debugging Tips](#debugging-tips)
- [Common Patterns](#common-patterns)
- [Contributing](#contributing)

## Overview

The MCP Kanban project is a comprehensive kanban board system with real-time collaboration, AI agent integration via Model Context Protocol, and a powerful CLI. This guide helps developers understand and contribute to the codebase effectively.

### Key Technologies

- **Backend**: Node.js, TypeScript, Express
- **Database**: SQLite with Kysely ORM
- **Real-time**: WebSocket with Socket.io
- **AI Integration**: Model Context Protocol (MCP)
- **CLI**: Commander.js with Ink (React for CLI)
- **Testing**: Jest, Supertest
- **Build**: Webpack, ESLint, Prettier

## Development Setup

### Prerequisites

```bash
# Required versions
node >= 18.0.0
npm >= 9.0.0

# Optional but recommended
git >= 2.30.0
```

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/mcp-kanban.git
   cd mcp-kanban
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Database setup**
   ```bash
   npm run db:migrate
   npm run db:seed # Optional: Load sample data
   ```

5. **Verify installation**
   ```bash
   npm run test:unit
   npm run lint
   npm run typecheck
   ```

### Development Scripts

```bash
# Start development server with hot reload
npm run dev

# Run type checking
npm run typecheck

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Build for production
npm run build

# Start production server
npm start
```

## Architecture Overview

### Directory Structure

```
mcp-kanban/
├── src/
│   ├── index.ts              # Application entry point
│   ├── server.ts             # Express server setup
│   ├── routes/               # REST API routes
│   ├── services/             # Business logic layer
│   ├── database/             # Database layer
│   ├── websocket/            # WebSocket handlers
│   ├── mcp/                  # MCP integration
│   ├── cli/                  # CLI implementation
│   ├── middleware/           # Express middleware
│   ├── utils/                # Utility functions
│   └── types/                # TypeScript types
├── tests/                    # Test files
├── docs/                     # Documentation
├── scripts/                  # Build and utility scripts
└── config/                   # Configuration files
```

### Layered Architecture

```
┌─────────────────────────────────────┐
│         Presentation Layer          │
│    (Routes, WebSocket, CLI, MCP)    │
├─────────────────────────────────────┤
│         Business Logic Layer        │
│           (Services)                │
├─────────────────────────────────────┤
│         Data Access Layer           │
│    (Database, Repositories)         │
├─────────────────────────────────────┤
│         Infrastructure Layer        │
│    (Utils, Middleware, Config)      │
└─────────────────────────────────────┘
```

### Key Design Patterns

1. **Dependency Injection**: Services receive dependencies via constructor
2. **Repository Pattern**: Database access abstracted through repositories
3. **Factory Pattern**: Error and entity creation
4. **Decorator Pattern**: Error handling and transactions
5. **Observer Pattern**: WebSocket event handling
6. **Strategy Pattern**: Export formats and authentication

## Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and test
npm run dev
npm test

# Check code quality
npm run lint
npm run typecheck

# Commit with conventional commits
git commit -m "feat: add new feature"
```

### 2. Writing Code

#### Service Implementation

```typescript
// src/services/ExampleService.ts
import { BaseService } from './BaseService';
import { DatabaseConnection } from '@/database/connection';
import { ValidationError, NotFoundError } from '@/utils/errors';
import { createServiceErrorHandler } from '@/utils/errors';

export class ExampleService extends BaseService {
  constructor(db: DatabaseConnection) {
    super(db);
  }

  @createServiceErrorHandler('ExampleService')
  async createExample(data: CreateExampleData): Promise<Example> {
    // Validate input
    const validation = this.validateCreateData(data);
    if (!validation.valid) {
      throw new ValidationError('Invalid example data', validation.errors);
    }

    // Business logic
    const example = await this.db.insert('examples', {
      ...data,
      created_at: new Date(),
      updated_at: new Date()
    });

    // Return result
    return this.mapToEntity(example);
  }

  private validateCreateData(data: CreateExampleData) {
    const errors: string[] = [];
    
    if (!data.name || data.name.length < 3) {
      errors.push('Name must be at least 3 characters');
    }
    
    return { valid: errors.length === 0, errors };
  }
}
```

#### Route Implementation

```typescript
// src/routes/example.ts
import { Router } from 'express';
import { ExampleService } from '@/services/ExampleService';
import { validateRequest } from '@/middleware/validation';
import { authenticate } from '@/middleware/auth';
import { createExampleSchema } from '@/schemas/example';

export function createExampleRouter(exampleService: ExampleService): Router {
  const router = Router();

  router.post(
    '/',
    authenticate(),
    validateRequest(createExampleSchema),
    async (req, res, next) => {
      try {
        const example = await exampleService.createExample(req.body);
        res.status(201).json({
          success: true,
          data: example
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
```

### 3. Adding Types

```typescript
// src/types/example.ts

// Use branded types for IDs
export type ExampleId = Brand<string, 'ExampleId'>;

// Entity interface
export interface Example {
  id: ExampleId;
  name: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

// API request types
export interface CreateExampleRequest {
  name: string;
  description?: string;
}

// Database row type
export interface ExampleRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}
```

## Code Standards

### TypeScript Guidelines

1. **Strict Type Checking**
   ```typescript
   // Good: Explicit types
   function processTask(task: Task): Promise<void>
   
   // Bad: Implicit any
   function processTask(task): Promise<any>
   ```

2. **Use Type Guards**
   ```typescript
   // Good: Type guard
   if (isTask(data)) {
     // TypeScript knows data is Task
   }
   
   // Bad: Type assertion
   const task = data as Task;
   ```

3. **Branded Types for IDs**
   ```typescript
   // Good: Type-safe IDs
   function getTask(id: TaskId): Promise<Task>
   
   // Bad: String IDs
   function getTask(id: string): Promise<Task>
   ```

### Code Style

1. **ESLint Rules**: Follow Airbnb style guide
2. **Prettier**: Automatic formatting on save
3. **Naming Conventions**:
   - Files: kebab-case (`task-service.ts`)
   - Classes: PascalCase (`TaskService`)
   - Functions: camelCase (`createTask`)
   - Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`)

### Documentation

1. **JSDoc for Public APIs**
   ```typescript
   /**
    * Creates a new task in the specified board
    * 
    * @param data - Task creation data
    * @returns Created task with generated ID
    * @throws {ValidationError} If data is invalid
    * @throws {NotFoundError} If board doesn't exist
    */
   async createTask(data: CreateTaskData): Promise<Task>
   ```

2. **Inline Comments**: Explain "why", not "what"
3. **README Files**: Each module should have documentation

## Testing Guide

### Test Structure

```
tests/
├── unit/               # Unit tests for individual functions
├── integration/        # Integration tests for APIs
├── e2e/               # End-to-end tests
└── fixtures/          # Test data and mocks
```

### Writing Tests

#### Unit Tests

```typescript
// tests/unit/services/TaskService.test.ts
import { TaskService } from '@/services/TaskService';
import { createMockDb } from '../mocks/database';

describe('TaskService', () => {
  let service: TaskService;
  let mockDb: MockDatabase;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new TaskService(mockDb);
  });

  describe('createTask', () => {
    it('should create a task with valid data', async () => {
      const data = {
        title: 'Test Task',
        board_id: 'board-123',
        priority: 3
      };

      const task = await service.createTask(data);

      expect(task).toMatchObject({
        title: 'Test Task',
        board_id: 'board-123',
        priority: 3
      });
      expect(mockDb.insert).toHaveBeenCalledWith('tasks', expect.any(Object));
    });

    it('should throw ValidationError for invalid data', async () => {
      const data = { title: '' }; // Missing required fields

      await expect(service.createTask(data))
        .rejects.toThrow(ValidationError);
    });
  });
});
```

#### Integration Tests

```typescript
// tests/integration/api/tasks.test.ts
import request from 'supertest';
import { app } from '@/app';
import { setupTestDb, cleanupTestDb } from '../helpers/database';

describe('Tasks API', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  describe('POST /api/v1/tasks', () => {
    it('should create a task', async () => {
      const response = await request(app)
        .post('/api/v1/tasks')
        .set('x-api-key', 'test-api-key')
        .send({
          title: 'New Task',
          board_id: 'test-board',
          priority: 3
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          title: 'New Task',
          board_id: 'test-board',
          priority: 3
        }
      });
    });
  });
});
```

### Test Best Practices

1. **Test Isolation**: Each test should be independent
2. **Clear Names**: Describe what the test does
3. **AAA Pattern**: Arrange, Act, Assert
4. **Mock External Dependencies**: Database, APIs, etc.
5. **Test Edge Cases**: Null values, empty arrays, errors
6. **Use Fixtures**: Reusable test data

## Database Development

### Migration Management

```bash
# Create new migration
npm run db:migration:create -- --name add_task_dependencies

# Run migrations
npm run db:migrate

# Rollback last migration
npm run db:rollback

# Reset database
npm run db:reset
```

### Writing Migrations

```typescript
// src/database/migrations/002_add_task_dependencies.ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('task_dependencies')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('task_id', 'text', col => col.notNull())
    .addColumn('depends_on_id', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamp', col => col.notNull())
    .addForeignKeyConstraint(
      'task_id_fk',
      ['task_id'],
      'tasks',
      ['id'],
      cb => cb.onDelete('cascade')
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('task_dependencies').execute();
}
```

### Query Patterns

```typescript
// Using Kysely query builder
const tasks = await db
  .selectFrom('tasks')
  .leftJoin('users', 'tasks.assignee', 'users.id')
  .where('tasks.board_id', '=', boardId)
  .where('tasks.archived', '=', false)
  .orderBy('tasks.position', 'asc')
  .select([
    'tasks.id',
    'tasks.title',
    'users.username as assignee_name'
  ])
  .execute();

// Using transactions
await db.transaction(async trx => {
  const task = await trx
    .insertInto('tasks')
    .values(taskData)
    .returningAll()
    .executeTakeFirst();

  await trx
    .insertInto('task_history')
    .values({
      task_id: task.id,
      action: 'created',
      user_id: userId
    })
    .execute();
});
```

## API Development

### RESTful Design

1. **Resource-Based URLs**
   ```
   GET    /api/v1/tasks          # List tasks
   POST   /api/v1/tasks          # Create task
   GET    /api/v1/tasks/:id      # Get task
   PUT    /api/v1/tasks/:id      # Update task
   DELETE /api/v1/tasks/:id      # Delete task
   ```

2. **HTTP Status Codes**
   - 200 OK: Successful GET/PUT
   - 201 Created: Successful POST
   - 204 No Content: Successful DELETE
   - 400 Bad Request: Validation error
   - 401 Unauthorized: Missing auth
   - 403 Forbidden: Insufficient permissions
   - 404 Not Found: Resource not found
   - 409 Conflict: Resource conflict
   - 429 Too Many Requests: Rate limited
   - 500 Internal Server Error: Server error

3. **Response Format**
   ```typescript
   // Success response
   {
     "success": true,
     "data": { /* resource data */ },
     "meta": {
       "timestamp": "2024-01-20T10:30:00Z",
       "request_id": "req_123456"
     }
   }

   // Error response
   {
     "success": false,
     "error": {
       "code": "VALIDATION_ERROR",
       "message": "Invalid task data",
       "details": {
         "title": "Title is required"
       }
     }
   }
   ```

### Middleware Chain

```typescript
// Route with full middleware chain
router.post('/tasks',
  rateLimiter({ max: 100, window: '1h' }),     // Rate limiting
  authenticate(),                               // Authentication
  authorize('create_task'),                     // Authorization
  validateRequest(createTaskSchema),            // Validation
  async (req, res, next) => {                  // Handler
    // Implementation
  }
);
```

## WebSocket Development

### Event Handling

```typescript
// src/websocket/handlers/taskHandlers.ts
export function registerTaskHandlers(io: Server) {
  io.on('connection', (socket) => {
    // Join board room
    socket.on('board:join', async (boardId: string) => {
      const hasAccess = await checkBoardAccess(socket.userId, boardId);
      if (hasAccess) {
        socket.join(`board:${boardId}`);
        socket.emit('board:joined', { boardId });
      }
    });

    // Handle task updates
    socket.on('task:update', async (data) => {
      try {
        const task = await taskService.updateTask(data.id, data.updates);
        
        // Broadcast to all in board
        io.to(`board:${task.board_id}`).emit('task:updated', {
          task,
          userId: socket.userId
        });
      } catch (error) {
        socket.emit('error', {
          code: 'UPDATE_FAILED',
          message: error.message
        });
      }
    });
  });
}
```

### Real-time Patterns

1. **Room-Based Broadcasting**
   ```typescript
   // Join room
   socket.join(`board:${boardId}`);
   
   // Broadcast to room
   io.to(`board:${boardId}`).emit('event', data);
   ```

2. **Optimistic Updates**
   ```typescript
   // Client sends update
   socket.emit('task:update', { id, updates });
   
   // Server validates and broadcasts
   if (valid) {
     io.to(room).emit('task:updated', task);
   } else {
     socket.emit('task:update:failed', error);
   }
   ```

3. **Presence Tracking**
   ```typescript
   const presence = new Map<string, Set<string>>();
   
   socket.on('board:join', (boardId) => {
     if (!presence.has(boardId)) {
       presence.set(boardId, new Set());
     }
     presence.get(boardId).add(socket.userId);
     
     io.to(`board:${boardId}`).emit('presence:update', {
       users: Array.from(presence.get(boardId))
     });
   });
   ```

## MCP Integration

### Tool Implementation

```typescript
// src/mcp/tools/customTool.ts
export const customTool: Tool = {
  name: 'custom_tool',
  description: 'Performs custom operation',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'First parameter' },
      param2: { type: 'number', description: 'Second parameter' }
    },
    required: ['param1']
  },
  handler: async (args: CustomToolArgs): Promise<ToolResponse> => {
    try {
      // Implement tool logic
      const result = await performOperation(args);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
```

### Resource Implementation

```typescript
// src/mcp/resources/customResource.ts
export const customResource: Resource = {
  name: 'custom_resource',
  description: 'Provides custom data',
  mimeType: 'application/json',
  handler: async (uri: string): Promise<ResourceResponse> => {
    const data = await fetchResourceData(uri);
    return {
      content: JSON.stringify(data),
      mimeType: 'application/json'
    };
  }
};
```

## CLI Development

### Command Implementation

```typescript
// src/cli/commands/custom.ts
import { Command } from 'commander';
import { createSpinner } from '@/cli/utils/spinner';
import { prompt } from '@/cli/prompts';

export const customCommand = new Command('custom')
  .description('Perform custom operation')
  .option('-f, --force', 'Force operation')
  .action(async (options) => {
    const spinner = createSpinner('Processing...');
    
    try {
      // Get user input if needed
      const { confirm } = await prompt({
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure?'
      });
      
      if (!confirm && !options.force) {
        console.log('Operation cancelled');
        return;
      }
      
      spinner.start();
      const result = await performCustomOperation();
      spinner.succeed('Operation completed');
      
      console.log(result);
    } catch (error) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });
```

### Interactive UI

```typescript
// src/cli/ui/components/CustomView.tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export const CustomView: React.FC = () => {
  const [selected, setSelected] = useState(0);
  
  useInput((input, key) => {
    if (key.upArrow) {
      setSelected(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelected(prev => Math.min(items.length - 1, prev + 1));
    }
  });
  
  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Text
          key={item.id}
          color={index === selected ? 'blue' : 'white'}
        >
          {index === selected ? '>' : ' '} {item.name}
        </Text>
      ))}
    </Box>
  );
};
```

## Security Best Practices

### Input Validation

```typescript
// Always validate and sanitize input
import { body, validationResult } from 'express-validator';

const validateTask = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .escape(),
  body('priority')
    .isInt({ min: 1, max: 5 }),
  body('assignee')
    .optional()
    .isUUID()
];

// Check validation results
if (!validationResult(req).isEmpty()) {
  throw new ValidationError('Invalid input', validationResult(req).array());
}
```

### SQL Injection Prevention

```typescript
// Good: Use parameterized queries
const task = await db
  .selectFrom('tasks')
  .where('id', '=', taskId)  // Parameterized
  .executeTakeFirst();

// Bad: String concatenation
const task = await db.raw(`SELECT * FROM tasks WHERE id = '${taskId}'`);
```

### Authentication & Authorization

```typescript
// Verify permissions at service level
async updateTask(userId: string, taskId: string, data: UpdateData) {
  const task = await this.getTask(taskId);
  
  if (!this.canUserEditTask(userId, task)) {
    throw new ForbiddenError('Cannot edit this task');
  }
  
  // Proceed with update
}
```

### Secret Management

```typescript
// Use environment variables
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable is required');
}

// Never commit secrets
// .gitignore should include:
// .env
// .env.local
// config/secrets.json
```

## Performance Guidelines

### Database Optimization

1. **Use Indexes**
   ```sql
   CREATE INDEX idx_tasks_board_id ON tasks(board_id);
   CREATE INDEX idx_tasks_assignee ON tasks(assignee);
   CREATE INDEX idx_tasks_status ON tasks(status);
   ```

2. **Batch Operations**
   ```typescript
   // Good: Batch insert
   await db.insertInto('tasks')
     .values(tasks)
     .execute();
   
   // Bad: Individual inserts
   for (const task of tasks) {
     await db.insertInto('tasks').values(task).execute();
   }
   ```

3. **Eager Loading**
   ```typescript
   // Load related data in one query
   const boards = await db
     .selectFrom('boards')
     .leftJoin('users', 'boards.owner_id', 'users.id')
     .select(['boards.*', 'users.username as owner_name'])
     .execute();
   ```

### Caching Strategy

```typescript
// In-memory cache for frequently accessed data
class TaskCache {
  private cache = new Map<string, CachedTask>();
  private ttl = 5 * 60 * 1000; // 5 minutes
  
  get(id: string): Task | undefined {
    const cached = this.cache.get(id);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.task;
    }
    this.cache.delete(id);
    return undefined;
  }
  
  set(id: string, task: Task): void {
    this.cache.set(id, {
      task,
      timestamp: Date.now()
    });
  }
}
```

### Async Operations

```typescript
// Process tasks in parallel with concurrency limit
import pLimit from 'p-limit';

const limit = pLimit(5); // Max 5 concurrent operations

const results = await Promise.all(
  tasks.map(task => 
    limit(() => processTask(task))
  )
);
```

## Debugging Tips

### Logging

```typescript
import { logger } from '@/utils/logger';

// Different log levels
logger.debug('Detailed debug info', { data });
logger.info('General information');
logger.warn('Warning message');
logger.error('Error occurred', { error });

// Structured logging
logger.info('Task created', {
  taskId: task.id,
  userId: req.user.id,
  boardId: task.board_id,
  duration: Date.now() - startTime
});
```

### Debug Mode

```typescript
// Enable debug output
DEBUG=mcp-kanban:* npm run dev

// Component-specific debugging
DEBUG=mcp-kanban:websocket npm run dev
DEBUG=mcp-kanban:database npm run dev
```

### Performance Profiling

```typescript
// Measure operation time
const startTime = performance.now();
await expensiveOperation();
const duration = performance.now() - startTime;

logger.info('Operation completed', { duration });

// Memory usage
const usage = process.memoryUsage();
logger.debug('Memory usage', {
  heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
  heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`
});
```

### Database Query Logging

```typescript
// Enable query logging in development
if (process.env.NODE_ENV === 'development') {
  db.on('query', ({ query, bindings }) => {
    logger.debug('SQL Query', { query, bindings });
  });
}
```

## Common Patterns

### Error Handling Pattern

```typescript
// Consistent error handling across services
export class BaseService {
  protected async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      logger.error(`${context} failed`, { error });
      
      if (error instanceof BaseServiceError) {
        throw error;
      }
      
      throw new InternalServerError(
        `${context} failed: ${error.message}`
      );
    }
  }
}
```

### Repository Pattern

```typescript
// Abstract database access
export class TaskRepository {
  constructor(private db: DatabaseConnection) {}
  
  async findById(id: string): Promise<Task | null> {
    const row = await this.db
      .selectFrom('tasks')
      .where('id', '=', id)
      .executeTakeFirst();
      
    return row ? this.mapRowToEntity(row) : null;
  }
  
  async create(data: CreateTaskData): Promise<Task> {
    const row = await this.db
      .insertInto('tasks')
      .values(this.mapDataToRow(data))
      .returningAll()
      .executeTakeFirst();
      
    return this.mapRowToEntity(row);
  }
  
  private mapRowToEntity(row: TaskRow): Task {
    // Mapping logic
  }
}
```

### Factory Pattern

```typescript
// Entity factory for testing and creation
export class TaskFactory {
  static create(overrides: Partial<Task> = {}): Task {
    return {
      id: TaskId(generateId()),
      title: 'Default Task',
      board_id: BoardId('default-board'),
      status: TaskStatus.TODO,
      priority: 3,
      created_at: new Date(),
      updated_at: new Date(),
      archived: false,
      position: 0,
      progress: 0,
      ...overrides
    };
  }
  
  static createMany(count: number, overrides: Partial<Task> = {}): Task[] {
    return Array.from({ length: count }, (_, i) => 
      this.create({
        ...overrides,
        title: `Task ${i + 1}`,
        position: i
      })
    );
  }
}
```

## Contributing

### Pull Request Process

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/mcp-kanban.git
   cd mcp-kanban
   git remote add upstream https://github.com/original/mcp-kanban.git
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature
   ```

3. **Make Changes**
   - Write code following standards
   - Add tests for new functionality
   - Update documentation

4. **Validate Changes**
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

5. **Submit PR**
   - Clear description of changes
   - Link related issues
   - Include test results

### Code Review Checklist

- [ ] Tests pass and cover new code
- [ ] No TypeScript errors
- [ ] ESLint rules followed
- [ ] Documentation updated
- [ ] Security considerations addressed
- [ ] Performance impact considered
- [ ] Breaking changes documented

### Release Process

1. **Version Bump**
   ```bash
   npm version minor # or major/patch
   ```

2. **Update Changelog**
   - Document all changes
   - Note breaking changes
   - Credit contributors

3. **Create Release**
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```

4. **Deploy**
   ```bash
   npm run build
   npm run deploy
   ```

## Resources

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Kysely Documentation](https://kysely.dev/)
- [Model Context Protocol](https://modelcontextprotocol.com/)
- [Jest Testing](https://jestjs.io/)
- [Express.js Guide](https://expressjs.com/)
- [Socket.io Documentation](https://socket.io/docs/)