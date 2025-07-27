# MCP Kanban API Reference

## Overview

This document provides a comprehensive reference for the MCP Kanban API, generated from JSDoc comments in the source code. The API follows RESTful principles and uses JSON for request and response bodies.

## Table of Contents

- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Core Services](#core-services)
  - [TaskService](#taskservice)
  - [BoardService](#boardservice)
  - [NoteService](#noteservice)
  - [TagService](#tagservice)
  - [ContextService](#contextservice)
  - [BackupService](#backupservice)
  - [ExportService](#exportservice)
- [Utility Functions](#utility-functions)
  - [Error Management](#error-management)
  - [Transaction Management](#transaction-management)
  - [Validation](#validation)
  - [Type Guards](#type-guards)
- [WebSocket API](#websocket-api)
- [MCP Tools](#mcp-tools)
- [CLI Commands](#cli-commands)

## Authentication

The API uses API key authentication. Include your API key in the `x-api-key` header:

```http
GET /api/v1/tasks
x-api-key: your-api-key-here
```

## Error Handling

All errors follow a consistent format:

```typescript
interface ApiError {
  code: string;           // Error code (e.g., 'VALIDATION_ERROR')
  message: string;        // Human-readable error message
  statusCode: number;     // HTTP status code
  details?: any;          // Additional error details
  timestamp: string;      // ISO 8601 timestamp
  request_id: string;     // Unique request identifier
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `UNAUTHORIZED_ERROR` | 401 | Missing or invalid authentication |
| `FORBIDDEN_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND_ERROR` | 404 | Resource not found |
| `CONFLICT_ERROR` | 409 | Resource conflict (e.g., duplicate) |
| `RATE_LIMIT_ERROR` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `EXTERNAL_SERVICE_ERROR` | 502 | External service failure |

## Core Services

### TaskService

#### `createTask(data: CreateTaskRequest): Promise<Task>`

Creates a new task in the kanban board.

**Parameters:**
- `data` (CreateTaskRequest): Task creation data
  - `title` (string, required): Task title
  - `board_id` (string, required): Board ID
  - `description` (string, optional): Task description
  - `column_id` (string, optional): Column ID
  - `priority` (1-5, optional): Task priority
  - `assignee` (string, optional): Assignee user ID
  - `due_date` (string, optional): Due date (ISO 8601)
  - `tags` (string[], optional): Task tags
  - `parent_id` (string, optional): Parent task ID for subtasks
  - `metadata` (object, optional): Custom metadata

**Returns:** Promise<Task>

**Throws:**
- `ValidationError`: Invalid input data
- `NotFoundError`: Board or column not found
- `DatabaseError`: Database operation failed

**Example:**
```typescript
const task = await taskService.createTask({
  title: 'Implement user authentication',
  board_id: 'board-123',
  priority: 3,
  assignee: 'user-456',
  tags: ['backend', 'security']
});
```

#### `updateTask(id: string, data: UpdateTaskRequest): Promise<Task>`

Updates an existing task.

**Parameters:**
- `id` (string): Task ID
- `data` (UpdateTaskRequest): Update data (all fields optional)

**Returns:** Promise<Task>

**Throws:**
- `NotFoundError`: Task not found
- `ValidationError`: Invalid update data
- `ConflictError`: Version conflict

#### `getTask(id: string): Promise<Task>`

Retrieves a task by ID.

**Parameters:**
- `id` (string): Task ID

**Returns:** Promise<Task>

**Throws:**
- `NotFoundError`: Task not found

#### `listTasks(filters?: TaskFilters): Promise<Task[]>`

Lists tasks with optional filtering.

**Parameters:**
- `filters` (TaskFilters, optional):
  - `board_id` (string): Filter by board
  - `column_id` (string): Filter by column
  - `status` (TaskStatus): Filter by status
  - `priority` (Priority): Filter by priority
  - `assignee` (string): Filter by assignee
  - `search` (string): Search in title/description
  - `tags` (string[]): Filter by tags
  - `due_before` (Date): Tasks due before date
  - `due_after` (Date): Tasks due after date
  - `parent_id` (string): Filter by parent task
  - `archived` (boolean): Include archived tasks
  - `limit` (number): Results per page
  - `offset` (number): Pagination offset
  - `sort` (string): Sort field
  - `order` ('asc' | 'desc'): Sort order

**Returns:** Promise<Task[]>

#### `deleteTask(id: string): Promise<void>`

Deletes a task.

**Parameters:**
- `id` (string): Task ID

**Throws:**
- `NotFoundError`: Task not found
- `ConflictError`: Task has subtasks

### BoardService

#### `createBoard(data: CreateBoardRequest): Promise<Board>`

Creates a new kanban board.

**Parameters:**
- `data` (CreateBoardRequest):
  - `name` (string, required): Board name
  - `description` (string, optional): Board description
  - `columns` (Column[], optional): Initial columns
  - `visibility` ('private' | 'team' | 'public', optional): Board visibility
  - `settings` (BoardSettings, optional): Board settings

**Returns:** Promise<Board>

#### `getBoard(id: string): Promise<Board>`

Retrieves a board by ID.

**Parameters:**
- `id` (string): Board ID

**Returns:** Promise<Board>

**Throws:**
- `NotFoundError`: Board not found
- `ForbiddenError`: Insufficient permissions

#### `listBoards(filters?: BoardFilters): Promise<Board[]>`

Lists boards accessible to the user.

**Parameters:**
- `filters` (BoardFilters, optional):
  - `owner_id` (string): Filter by owner
  - `visibility` (string): Filter by visibility
  - `archived` (boolean): Include archived boards
  - `search` (string): Search in name/description

**Returns:** Promise<Board[]>

### NoteService

#### `addNote(data: AddNoteRequest): Promise<Note>`

Adds a note to a task.

**Parameters:**
- `data` (AddNoteRequest):
  - `task_id` (string, required): Task ID
  - `content` (string, required): Note content
  - `type` ('comment' | 'update' | 'system', optional): Note type
  - `metadata` (object, optional): Additional metadata

**Returns:** Promise<Note>

**Throws:**
- `NotFoundError`: Task not found
- `ValidationError`: Invalid content

#### `searchNotes(query: string, filters?: NoteFilters): Promise<Note[]>`

Searches notes by content.

**Parameters:**
- `query` (string): Search query
- `filters` (NoteFilters, optional):
  - `task_id` (string): Filter by task
  - `author_id` (string): Filter by author
  - `type` (string): Filter by note type
  - `created_after` (Date): Notes created after date
  - `created_before` (Date): Notes created before date

**Returns:** Promise<Note[]>

### TagService

#### `createTag(data: CreateTagRequest): Promise<Tag>`

Creates a new tag.

**Parameters:**
- `data` (CreateTagRequest):
  - `name` (string, required): Tag name
  - `color` (string, optional): Tag color (hex)
  - `description` (string, optional): Tag description

**Returns:** Promise<Tag>

**Throws:**
- `ConflictError`: Tag already exists
- `ValidationError`: Invalid tag name

#### `assignTag(taskId: string, tagId: string): Promise<void>`

Assigns a tag to a task.

**Parameters:**
- `taskId` (string): Task ID
- `tagId` (string): Tag ID

**Throws:**
- `NotFoundError`: Task or tag not found
- `ConflictError`: Tag already assigned

### ContextService

#### `getProjectContext(boardId: string): Promise<ProjectContext>`

Generates comprehensive project context for AI agents.

**Parameters:**
- `boardId` (string): Board ID

**Returns:** Promise<ProjectContext> containing:
- Board overview and statistics
- Task breakdown by status and priority
- Team member information
- Recent activity timeline
- Blockers and dependencies
- Progress metrics

#### `getTaskContext(taskId: string): Promise<TaskContext>`

Generates detailed context for a specific task.

**Parameters:**
- `taskId` (string): Task ID

**Returns:** Promise<TaskContext> containing:
- Task details and history
- Related tasks and dependencies
- Comments and attachments
- Activity timeline
- Assigned team members

### BackupService

#### `createBackup(options?: BackupOptions): Promise<BackupInfo>`

Creates a system backup.

**Parameters:**
- `options` (BackupOptions, optional):
  - `compress` (boolean): Compress backup
  - `encrypt` (boolean): Encrypt backup
  - `includeAttachments` (boolean): Include file attachments

**Returns:** Promise<BackupInfo>

#### `restoreBackup(backupId: string): Promise<void>`

Restores from a backup.

**Parameters:**
- `backupId` (string): Backup ID

**Throws:**
- `NotFoundError`: Backup not found
- `ValidationError`: Corrupted backup

### ExportService

#### `exportBoard(boardId: string, format: ExportFormat): Promise<Buffer>`

Exports a board in various formats.

**Parameters:**
- `boardId` (string): Board ID
- `format` (ExportFormat): 'json' | 'csv' | 'pdf' | 'markdown'

**Returns:** Promise<Buffer> - Exported data

## Utility Functions

### Error Management

#### `createServiceErrorHandler(serviceName: string)`

Creates an error handler decorator for service methods.

**Parameters:**
- `serviceName` (string): Service name for logging

**Returns:** MethodDecorator

**Example:**
```typescript
class UserService {
  @createServiceErrorHandler('UserService')
  async createUser(data: CreateUserData) {
    // Method implementation
  }
}
```

#### `retryWithBackoff<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T>`

Retries an operation with exponential backoff.

**Parameters:**
- `operation` (() => Promise<T>): Operation to retry
- `options` (RetryOptions, optional):
  - `maxAttempts` (number): Maximum retry attempts (default: 3)
  - `initialDelay` (number): Initial delay in ms (default: 100)
  - `maxDelay` (number): Maximum delay in ms (default: 10000)
  - `factor` (number): Backoff factor (default: 2)
  - `shouldRetry` ((error: Error) => boolean): Custom retry logic

**Returns:** Promise<T>

### Transaction Management

#### `TransactionManager`

Manages database transactions with ACID properties.

##### `executeTransaction<T>(operations: TransactionCallback<T>, options?: TransactionOptions): Promise<T>`

Executes operations within a transaction.

**Parameters:**
- `operations` (TransactionCallback<T>): Transaction operations
- `options` (TransactionOptions, optional):
  - `isolationLevel` (string): SQL isolation level
  - `timeout` (number): Transaction timeout in ms
  - `autoRollback` (boolean): Auto-rollback on failure

**Returns:** Promise<T>

**Example:**
```typescript
const result = await transactionManager.executeTransaction(
  async (context) => {
    const user = await createUser(userData);
    transactionManager.addRollbackAction(context, async () => {
      await deleteUser(user.id);
    });
    return user;
  },
  { isolationLevel: 'READ_COMMITTED' }
);
```

##### `@TransactionManager.transactional(options?: TransactionOptions)`

Decorator for making methods transactional.

**Example:**
```typescript
class OrderService {
  @TransactionManager.transactional({ timeout: 30000 })
  async processOrder(orderId: string) {
    // Automatically wrapped in transaction
  }
}
```

### Validation

#### `ValidationBuilder<T>`

Fluent API for building validation rules.

**Methods:**
- `required(message?: string)`: Field is required
- `min(length: number, message?: string)`: Minimum length
- `max(length: number, message?: string)`: Maximum length
- `pattern(regex: RegExp, message?: string)`: Pattern match
- `custom(fn: (value: T) => boolean | string)`: Custom validation
- `validate(value: T)`: Execute validation

**Example:**
```typescript
const validator = new ValidationBuilder<string>()
  .required()
  .min(3)
  .max(50)
  .pattern(/^[a-zA-Z0-9_]+$/, 'Only alphanumeric and underscore');

const result = validator.validate('my_username');
if (!result.valid) {
  console.error(result.errors);
}
```

### Type Guards

#### `isTask(value: unknown): value is Task`

Type guard for Task objects.

#### `isValidTaskId(value: unknown): value is TaskId`

Validates and narrows to TaskId type.

#### `isValidEmail(email: string): boolean`

Validates email format.

#### `isValidUUID(uuid: string): boolean`

Validates UUID v4 format.

## WebSocket API

The WebSocket API enables real-time collaboration features.

### Connection

```typescript
const ws = new WebSocket('wss://api.kanban.com/ws');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your-auth-token'
  }));
});
```

### Message Types

#### Task Updates
```typescript
// Subscribe to task updates
{
  type: 'subscribe',
  channel: 'task',
  filters: {
    board_id: 'board-123'
  }
}

// Receive task update
{
  type: 'task.updated',
  data: {
    task: Task,
    changes: Partial<Task>,
    user_id: string
  }
}
```

#### Presence
```typescript
// Join board
{
  type: 'presence.join',
  board_id: 'board-123'
}

// Receive presence update
{
  type: 'presence.update',
  data: {
    board_id: string,
    users: User[]
  }
}
```

#### Typing Indicators
```typescript
// Send typing indicator
{
  type: 'typing.start',
  task_id: 'task-456'
}

// Receive typing indicator
{
  type: 'typing',
  data: {
    task_id: string,
    user_id: string,
    is_typing: boolean
  }
}
```

## MCP Tools

Tools available for AI agents via Model Context Protocol.

### Task Management Tools

#### `create_task`
Creates a new task.

**Arguments:**
- `title` (string, required): Task title
- `board_id` (string, required): Board ID
- `description` (string, optional): Task description
- `priority` (number, optional): Priority 1-5
- `assignee` (string, optional): Assignee ID
- `due_date` (string, optional): Due date

#### `update_task`
Updates an existing task.

**Arguments:**
- `task_id` (string, required): Task ID
- `updates` (object, required): Update fields

#### `search_tasks`
Searches for tasks.

**Arguments:**
- `query` (string, required): Search query
- `board_id` (string, optional): Limit to board
- `filters` (object, optional): Additional filters

### Board Management Tools

#### `create_board`
Creates a new board.

**Arguments:**
- `name` (string, required): Board name
- `description` (string, optional): Description
- `columns` (array, optional): Initial columns

#### `analyze_board`
Analyzes board statistics and health.

**Arguments:**
- `board_id` (string, required): Board ID

**Returns:**
- Task distribution by status and priority
- Velocity metrics
- Bottlenecks and blockers
- Team workload analysis

### Context Tools

#### `get_project_context`
Generates comprehensive project context.

**Arguments:**
- `board_id` (string, required): Board ID

#### `get_task_context`
Generates detailed task context.

**Arguments:**
- `task_id` (string, required): Task ID

## CLI Commands

The CLI provides command-line access to all API functionality.

### Installation

```bash
npm install -g @kanban/cli
kanban configure --api-key YOUR_API_KEY
```

### Task Commands

```bash
# Create task
kanban task create "Implement feature" --board my-board --priority 3

# Update task
kanban task update task-123 --status in_progress --assignee user-456

# List tasks
kanban task list --board my-board --status todo --assignee me

# Search tasks
kanban task search "authentication" --board my-board
```

### Board Commands

```bash
# Create board
kanban board create "Project Alpha" --visibility team

# List boards
kanban board list --owned

# Show board details
kanban board show my-board
```

### Interactive Mode

```bash
# Launch interactive dashboard
kanban dashboard

# Interactive task view
kanban interactive --board my-board
```

### Export/Import

```bash
# Export board
kanban export my-board --format json --output board-backup.json

# Import board
kanban import board-backup.json

# Backup system
kanban backup create --compress --encrypt
```

## Rate Limits

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| GET endpoints | 1000/hour | 1 hour |
| POST/PUT/DELETE | 100/hour | 1 hour |
| WebSocket connections | 10/minute | 1 minute |
| Export operations | 10/hour | 1 hour |
| Backup operations | 5/day | 24 hours |

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and breaking changes.

## Support

- Documentation: https://docs.kanban.com
- API Status: https://status.kanban.com
- Support: support@kanban.com
