# Services Module Documentation

## Overview

The services module contains the core business logic for the MCP Kanban application. These services provide a clean abstraction layer between the API/CLI interfaces and the database, implementing all business rules and data operations.

## Table of Contents

- [Architecture](#architecture)
- [Core Services](#core-services)
- [Service Patterns](#service-patterns)
- [Usage Examples](#usage-examples)
- [Testing Services](#testing-services)
- [Best Practices](#best-practices)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Routes    │     │   CLI Commands  │     │   MCP Tools     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                         │
         └───────────────────────┴─────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Service Layer        │
                    │  ┌──────────────────┐  │
                    │  │   TaskService    │  │
                    │  ├──────────────────┤  │
                    │  │   BoardService   │  │
                    │  ├──────────────────┤  │
                    │  │   NoteService    │  │
                    │  ├──────────────────┤  │
                    │  │   TagService     │  │
                    │  ├──────────────────┤  │
                    │  │  ContextService  │  │
                    │  └──────────────────┘  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Database (SQLite)     │
                    └─────────────────────────┘
```

## Core Services

### TaskService

The main service for task management operations.

**Location**: `src/services/TaskService.ts`

**Key Methods**:
```typescript
class TaskService extends BaseService<TaskTable> {
  // CRUD Operations
  async createTask(data: CreateTaskData): Promise<Task>
  async getTaskById(id: string): Promise<Task | null>
  async updateTask(id: string, data: UpdateTaskData): Promise<Task>
  async deleteTask(id: string): Promise<void>
  
  // Query Operations
  async getTasks(filters: TaskFilters): Promise<Task[]>
  async getTasksByBoard(boardId: string): Promise<Task[]>
  async getTasksByColumn(columnId: string): Promise<Task[]>
  
  // Relationship Operations
  async getTaskWithSubtasks(id: string): Promise<TaskWithSubtasks>
  async getTaskWithDependencies(id: string): Promise<TaskWithDependencies>
  async addDependency(taskId: string, dependsOnId: string): Promise<void>
  
  // Specialized Queries
  async getBlockedTasks(boardId?: string): Promise<Task[]>
  async getOverdueTasks(boardId?: string): Promise<Task[]>
  async searchTasks(query: string, boardId?: string): Promise<Task[]>
}
```

**Example Usage**:
```typescript
const taskService = new TaskService(dbConnection);

// Create a task
const task = await taskService.createTask({
  title: 'Implement feature',
  board_id: 'board-123',
  priority: 4,
  status: 'todo'
});

// Get tasks with filters
const tasks = await taskService.getTasks({
  board_id: 'board-123',
  status: 'in_progress',
  assignee: 'user-456',
  sortBy: 'priority',
  sortOrder: 'desc'
});
```

### BoardService

Manages board operations and board-level analytics.

**Location**: `src/services/BoardService.ts`

**Key Methods**:
```typescript
class BoardService extends BaseService<BoardTable> {
  // CRUD Operations
  async createBoard(data: CreateBoardData): Promise<Board>
  async getBoardById(id: string): Promise<Board | null>
  async updateBoard(id: string, data: UpdateBoardData): Promise<Board>
  async deleteBoard(id: string): Promise<void>
  
  // Query Operations
  async getBoards(filters?: BoardFilters): Promise<Board[]>
  async getBoardWithColumns(id: string): Promise<BoardWithColumns>
  async getBoardWithStats(id: string): Promise<BoardWithStats>
  
  // Board Operations
  async archiveBoard(id: string): Promise<Board>
  async restoreBoard(id: string): Promise<Board>
  async duplicateBoard(id: string, newName?: string): Promise<Board>
  
  // Column Management
  async addColumn(boardId: string, data: CreateColumnData): Promise<Column>
  async updateColumn(id: string, data: UpdateColumnData): Promise<Column>
  async deleteColumn(id: string): Promise<void>
  async reorderColumns(boardId: string, columnOrder: string[]): Promise<void>
}
```

**Example Usage**:
```typescript
const boardService = new BoardService(dbConnection);

// Create a board with columns
const board = await boardService.createBoard({
  name: 'Sprint 23',
  description: 'Q4 Sprint planning',
  columns: [
    { name: 'To Do', order: 0 },
    { name: 'In Progress', order: 1, wip_limit: 5 },
    { name: 'Done', order: 2 }
  ]
});

// Get board with statistics
const stats = await boardService.getBoardWithStats('board-123');
console.log(`Total tasks: ${stats.total_tasks}`);
console.log(`Completed: ${stats.completed_tasks}`);
```

### NoteService

Handles note operations for tasks.

**Location**: `src/services/NoteService.ts`

**Key Methods**:
```typescript
class NoteService extends BaseService<NoteTable> {
  // CRUD Operations
  async createNote(data: CreateNoteData): Promise<Note>
  async getNoteById(id: string): Promise<Note | null>
  async updateNote(id: string, data: UpdateNoteData): Promise<Note>
  async deleteNote(id: string): Promise<void>
  
  // Query Operations
  async getTaskNotes(taskId: string, options?: NoteQueryOptions): Promise<Note[]>
  async searchNotes(options: SearchNotesOptions): Promise<Note[]>
  
  // Note Operations
  async pinNote(id: string): Promise<Note>
  async unpinNote(id: string): Promise<Note>
  async categorizeNote(id: string, category: NoteCategory): Promise<Note>
}
```

**Note Categories**:
- `general` - General notes and comments
- `progress` - Progress updates
- `blocker` - Blocker descriptions
- `decision` - Decision records
- `question` - Questions and clarifications

### TagService

Manages tags and task-tag relationships.

**Location**: `src/services/TagService.ts`

**Key Methods**:
```typescript
class TagService extends BaseService<TagTable> {
  // CRUD Operations
  async createTag(data: CreateTagData): Promise<Tag>
  async getTagById(id: string): Promise<Tag | null>
  async updateTag(id: string, data: UpdateTagData): Promise<Tag>
  async deleteTag(id: string): Promise<void>
  
  // Query Operations
  async getAllTags(): Promise<Tag[]>
  async getTaskTags(taskId: string): Promise<Tag[]>
  async getTagsByBoard(boardId: string): Promise<Tag[]>
  
  // Tag Operations
  async addTagToTask(taskId: string, tagId: string): Promise<void>
  async removeTagFromTask(taskId: string, tagId: string): Promise<void>
  async mergeTags(sourceId: string, targetId: string): Promise<void>
}
```

### ContextService

Provides AI-friendly context generation for tasks and projects.

**Location**: `src/services/ContextService.ts`

**Key Methods**:
```typescript
class ContextService {
  // Context Generation
  async getProjectContext(options: ContextOptions): Promise<ProjectContext>
  async getTaskContext(taskId: string, options: ContextOptions): Promise<TaskContext>
  async getBoardContext(boardId: string, options: ContextOptions): Promise<BoardContext>
  
  // Summary Generation
  async generateProjectSummary(boardId?: string): Promise<ProjectSummary>
  async generateSprintSummary(boardId: string, sprintId: string): Promise<SprintSummary>
  
  // Analytics
  async analyzeWorkflow(boardId: string): Promise<WorkflowAnalysis>
  async identifyBottlenecks(boardId: string): Promise<Bottleneck[]>
  async calculateVelocity(boardId: string, days: number): Promise<VelocityMetrics>
}
```

## Service Patterns

### Base Service Pattern

All services extend from `BaseService` which provides common functionality:

```typescript
abstract class BaseService<T extends AnyTable> {
  protected db: Kysely<Database>;
  protected tableName: keyof Database;
  
  constructor(db: Kysely<Database>, tableName: keyof Database) {
    this.db = db;
    this.tableName = tableName;
  }
  
  // Common query builders
  protected baseQuery() {
    return this.db.selectFrom(this.tableName);
  }
  
  // Audit trail
  protected async logActivity(action: string, entity: any) {
    // Implementation
  }
  
  // Error handling
  protected handleError(error: unknown): never {
    // Implementation
  }
}
```

### Transaction Support

Services support database transactions for complex operations:

```typescript
// Using transactions
await dbConnection.transaction().execute(async (trx) => {
  const taskService = new TaskService(trx);
  const noteService = new NoteService(trx);
  
  const task = await taskService.createTask(taskData);
  await noteService.createNote({
    task_id: task.id,
    content: 'Task created from template'
  });
});
```

### Error Handling

Services use custom error types for consistent error handling:

```typescript
try {
  const task = await taskService.getTaskById('invalid-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    // Handle not found
  } else if (error instanceof ValidationError) {
    // Handle validation error
  } else {
    // Handle unexpected error
  }
}
```

## Usage Examples

### Complete Task Workflow

```typescript
// Initialize services
const taskService = new TaskService(dbConnection);
const noteService = new NoteService(dbConnection);
const tagService = new TagService(dbConnection);

// Create a task
const task = await taskService.createTask({
  title: 'Implement user authentication',
  description: 'Add JWT-based auth to the API',
  board_id: 'board-123',
  column_id: 'col-todo',
  priority: 4,
  assignee: 'dev-user-1',
  due_date: new Date('2024-12-31')
});

// Add tags
const securityTag = await tagService.createTag({
  name: 'security',
  color: '#ff0000'
});
await tagService.addTagToTask(task.id, securityTag.id);

// Add a note
await noteService.createNote({
  task_id: task.id,
  content: 'Research OAuth2 vs JWT implementation',
  category: 'general'
});

// Update task progress
await taskService.updateTask(task.id, {
  status: 'in_progress',
  progress: 25
});

// Move to another column
await taskService.updateTask(task.id, {
  column_id: 'col-in-progress',
  position: 0
});
```

### Board Analytics

```typescript
const boardService = new BoardService(dbConnection);
const contextService = new ContextService(
  taskService,
  boardService,
  noteService,
  tagService
);

// Get board statistics
const stats = await boardService.getBoardWithStats('board-123');

// Analyze workflow
const analysis = await contextService.analyzeWorkflow('board-123');
console.log('Bottlenecks:', analysis.bottlenecks);
console.log('Average cycle time:', analysis.avgCycleTime);

// Generate project context for AI
const context = await contextService.getProjectContext({
  include_completed: false,
  days_back: 30,
  max_items: 100
});
```

## Testing Services

### Unit Testing

```typescript
import { TaskService } from '@/services/TaskService';
import { createTestDatabase } from '@/tests/helpers';

describe('TaskService', () => {
  let service: TaskService;
  let db: Kysely<Database>;
  
  beforeEach(async () => {
    db = await createTestDatabase();
    service = new TaskService(db);
  });
  
  afterEach(async () => {
    await db.destroy();
  });
  
  it('should create a task', async () => {
    const task = await service.createTask({
      title: 'Test task',
      board_id: 'test-board'
    });
    
    expect(task).toMatchObject({
      title: 'Test task',
      board_id: 'test-board',
      status: 'todo'
    });
  });
});
```

### Integration Testing

```typescript
describe('Task workflow integration', () => {
  it('should handle complete task lifecycle', async () => {
    // Create board
    const board = await boardService.createBoard({
      name: 'Test Board'
    });
    
    // Create task
    const task = await taskService.createTask({
      title: 'Integration test task',
      board_id: board.id
    });
    
    // Add dependencies
    const dependency = await taskService.createTask({
      title: 'Dependency task',
      board_id: board.id
    });
    
    await taskService.addDependency(task.id, dependency.id);
    
    // Verify blocked status
    const blockedTasks = await taskService.getBlockedTasks(board.id);
    expect(blockedTasks).toContainEqual(
      expect.objectContaining({ id: task.id })
    );
  });
});
```

## Best Practices

### 1. Service Initialization

Always initialize services with proper database connections:

```typescript
// Good
const taskService = new TaskService(dbConnection);

// Better - with dependency injection
class TaskController {
  constructor(private taskService: TaskService) {}
}
```

### 2. Error Handling

Always handle service errors appropriately:

```typescript
try {
  const result = await taskService.updateTask(id, data);
  return res.json({ success: true, data: result });
} catch (error) {
  if (error instanceof NotFoundError) {
    return res.status(404).json({ error: 'Task not found' });
  }
  throw error; // Let error middleware handle unexpected errors
}
```

### 3. Transaction Usage

Use transactions for operations that modify multiple entities:

```typescript
async function createTaskFromTemplate(templateId: string, boardId: string) {
  return await dbConnection.transaction().execute(async (trx) => {
    const taskService = new TaskService(trx);
    const template = await taskService.getTaskById(templateId);
    
    if (!template) {
      throw new NotFoundError('Template', templateId);
    }
    
    const newTask = await taskService.createTask({
      ...template,
      board_id: boardId,
      is_template: false
    });
    
    // Copy subtasks, notes, tags in transaction
    // ...
    
    return newTask;
  });
}
```

### 4. Query Optimization

Use appropriate query methods to minimize database calls:

```typescript
// Bad - N+1 queries
const tasks = await taskService.getTasks({ board_id });
for (const task of tasks) {
  const tags = await tagService.getTaskTags(task.id);
  // ...
}

// Good - Single query with joins
const tasksWithTags = await taskService.getTasksWithTags({ board_id });
```

### 5. Service Composition

Compose services for complex operations:

```typescript
class ProjectService {
  constructor(
    private taskService: TaskService,
    private boardService: BoardService,
    private contextService: ContextService
  ) {}
  
  async generateProjectReport(boardId: string) {
    const board = await this.boardService.getBoardWithStats(boardId);
    const context = await this.contextService.getProjectContext({
      board_id: boardId
    });
    
    return {
      board,
      context,
      generatedAt: new Date()
    };
  }
}
```

## See Also

- [Database Module](./database.md)
- [API Module](./api.md)
- [Testing Guide](../guides/TESTING.md)
- [Architecture Overview](../ARCHITECTURE.md)