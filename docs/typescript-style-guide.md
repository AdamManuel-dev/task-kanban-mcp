# TypeScript Style Guide

## Overview
This style guide defines the TypeScript coding standards for the MCP Kanban project. Following these guidelines ensures consistency, readability, and maintainability across the codebase.

## Table of Contents
1. [General Principles](#general-principles)
2. [Naming Conventions](#naming-conventions)
3. [Type Definitions](#type-definitions)
4. [Functions and Methods](#functions-and-methods)
5. [Classes and Interfaces](#classes-and-interfaces)
6. [Modules and Imports](#modules-and-imports)
7. [Error Handling](#error-handling)
8. [Async Programming](#async-programming)
9. [Comments and Documentation](#comments-and-documentation)
10. [Testing](#testing)

## General Principles

### 1. Strict Mode
Always use TypeScript in strict mode. Our `tsconfig.json` enforces:
- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `exactOptionalPropertyTypes: true`

### 2. Type Safety First
- Never use `any` - use `unknown` and type guards instead
- Always provide explicit return types for functions
- Use const assertions for literal types

### 3. Prefer Immutability
- Use `const` by default
- Use `readonly` for properties that shouldn't change
- Avoid mutating objects directly

## Naming Conventions

### Variables and Functions
Use camelCase for variables and functions:
```typescript
const taskCount = 10;
function calculatePriority(task: Task): number { }
```

### Constants
Use UPPER_SNAKE_CASE for constants:
```typescript
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 5000;
```

### Types and Interfaces
Use PascalCase for types and interfaces:
```typescript
interface TaskData { }
type TaskStatus = 'todo' | 'done';
```

### Enums
Use PascalCase for enum names and values:
```typescript
enum TaskPriority {
  Low = 0,
  Medium = 5,
  High = 10
}
```

### Files
Use kebab-case for file names:
```
task-service.ts
validation-helpers.ts
```

## Type Definitions

### Prefer Interfaces for Objects
```typescript
// Good
interface UserData {
  id: string;
  name: string;
  email: string;
}

// Avoid (unless needed for unions/intersections)
type UserData = {
  id: string;
  name: string;
  email: string;
};
```

### Use Type Aliases for Unions and Complex Types
```typescript
type TaskStatus = 'todo' | 'in_progress' | 'done';
type AsyncResult<T> = Promise<T | null>;
```

### Optional Properties with exactOptionalPropertyTypes
```typescript
// Correct - explicitly include undefined
interface UpdateRequest {
  title?: string | undefined;
  description?: string | undefined;
}

// For Zod schemas, use our helper
import { optionalWithUndefined } from '@/utils/zod-helpers';

const schema = z.object({
  title: optionalWithUndefined(z.string())
});
```

### Generic Type Constraints
```typescript
// Be specific with generics
function processItems<T extends { id: string }>(items: T[]): T[] {
  return items.filter(item => item.id);
}
```

## Functions and Methods

### Always Specify Return Types
```typescript
// Good
function getTaskById(id: string): Task | null {
  // ...
}

// Bad
function getTaskById(id: string) {
  // ...
}
```

### Use Arrow Functions for Callbacks
```typescript
// Good
tasks.map(task => task.id);

// Avoid (unless `this` binding is needed)
tasks.map(function(task) { return task.id; });
```

### Parameter Destructuring
```typescript
// Good - clear parameter structure
function createTask({ title, boardId }: CreateTaskData): Task {
  // ...
}

// Good - with defaults
function searchTasks({ 
  query = '', 
  limit = 10 
}: SearchOptions = {}): Task[] {
  // ...
}
```

### Avoid Long Parameter Lists
```typescript
// Bad
function createTask(
  title: string,
  description: string,
  boardId: string,
  columnId: string,
  priority: number
): Task { }

// Good - use an options object
interface CreateTaskOptions {
  title: string;
  description: string;
  boardId: string;
  columnId: string;
  priority: number;
}

function createTask(options: CreateTaskOptions): Task { }
```

## Classes and Interfaces

### Interface Segregation
Keep interfaces focused and cohesive:
```typescript
// Good - separate concerns
interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

interface Task extends Timestamped {
  id: string;
  title: string;
}

// Avoid - too many responsibilities
interface Task {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  // ... many more properties
}
```

### Class Organization
```typescript
class TaskService {
  // 1. Static properties
  static readonly MAX_TASKS = 1000;
  
  // 2. Instance properties
  private readonly db: Database;
  
  // 3. Constructor
  constructor(db: Database) {
    this.db = db;
  }
  
  // 4. Public methods
  async createTask(data: CreateTaskData): Promise<Task> {
    // ...
  }
  
  // 5. Private methods
  private validateTaskData(data: unknown): void {
    // ...
  }
}
```

## Modules and Imports

### Import Organization
Group and order imports consistently:
```typescript
// 1. External dependencies
import { z } from 'zod';
import express from 'express';

// 2. Internal modules (use aliases)
import { Database } from '@/database';
import { logger } from '@/utils/logger';
import type { Task, Board } from '@/types';

// 3. Relative imports
import { validateTask } from './validation';
import { TaskRepository } from './repositories';
```

### Barrel Exports
Use index.ts files for clean exports:
```typescript
// src/services/index.ts
export { TaskService } from './TaskService';
export { BoardService } from './BoardService';
export { NoteService } from './NoteService';
```

### Avoid Circular Dependencies
Structure modules to prevent circular imports.

## Error Handling

### Custom Error Classes
```typescript
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly code = 'VALIDATION_ERROR',
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

### Error Handling in Async Functions
```typescript
async function getTask(id: string): Promise<Task> {
  try {
    const task = await db.query('...');
    if (!task) {
      throw new NotFoundError('Task', id);
    }
    return task;
  } catch (error) {
    logger.error('Failed to get task', { id, error });
    throw error;
  }
}
```

### Never Swallow Errors
Always handle or re-throw errors appropriately.

## Async Programming

### Always Use Async/Await
```typescript
// Good
async function processTask(id: string): Promise<void> {
  const task = await getTask(id);
  await updateTask(task);
}

// Avoid
function processTask(id: string): Promise<void> {
  return getTask(id).then(task => updateTask(task));
}
```

### Concurrent Operations
```typescript
// Good - parallel execution
const [tasks, boards] = await Promise.all([
  getTasks(),
  getBoards()
]);

// Avoid - sequential when parallel is possible
const tasks = await getTasks();
const boards = await getBoards();
```

### Error Handling in Concurrent Operations
```typescript
const results = await Promise.allSettled([
  operation1(),
  operation2(),
  operation3()
]);

results.forEach((result, index) => {
  if (result.status === 'rejected') {
    logger.error(`Operation ${index} failed:`, result.reason);
  }
});
```

## Comments and Documentation

### JSDoc for Public APIs
```typescript
/**
 * Creates a new task in the specified board
 * 
 * @param data - The task creation data
 * @returns The created task
 * @throws {ValidationError} If the input data is invalid
 * @throws {NotFoundError} If the board doesn't exist
 * 
 * @example
 * ```typescript
 * const task = await taskService.createTask({
 *   title: 'New Feature',
 *   boardId: 'board-123',
 *   columnId: 'col-456'
 * });
 * ```
 */
async function createTask(data: CreateTaskData): Promise<Task> {
  // ...
}
```

### Inline Comments
Use sparingly for complex logic:
```typescript
// Calculate priority based on dependencies and due date
const priority = task.dependencies.length * 2 + 
  (isOverdue(task) ? 10 : 0);
```

### TODO Comments
```typescript
// TODO: Implement caching for better performance
// TODO: Add validation for custom fields
```

## Testing

### Test File Naming
```
TaskService.test.ts
validation.test.ts
```

### Test Structure
```typescript
describe('TaskService', () => {
  let service: TaskService;
  let db: MockDatabase;
  
  beforeEach(() => {
    db = createMockDatabase();
    service = new TaskService(db);
  });
  
  describe('createTask', () => {
    it('should create a task with valid data', async () => {
      // Arrange
      const data = { title: 'Test', boardId: '123' };
      
      // Act
      const task = await service.createTask(data);
      
      // Assert
      expect(task.title).toBe('Test');
    });
    
    it('should throw ValidationError for invalid data', async () => {
      // Test error cases
    });
  });
});
```

### Type-Safe Mocks
```typescript
const mockTask: Task = {
  id: '123',
  title: 'Test Task',
  boardId: 'board-123',
  // ... all required properties
};
```

## Code Organization Best Practices

### Single Responsibility
Each module, class, and function should have one clear purpose.

### DRY (Don't Repeat Yourself)
Extract common patterns into reusable functions.

### YAGNI (You Aren't Gonna Need It)
Don't add functionality until it's needed.

### Dependency Injection
```typescript
// Good - testable
class TaskService {
  constructor(private db: Database) {}
}

// Avoid - hard to test
class TaskService {
  private db = new Database();
}
```

## Performance Considerations

### Avoid Premature Optimization
Write clear code first, optimize when needed.

### Use Appropriate Data Structures
```typescript
// Use Set for unique values
const uniqueTags = new Set(tags);

// Use Map for key-value pairs
const taskMap = new Map<string, Task>();
```

### Lazy Evaluation
```typescript
// Good - only compute when needed
get fullName() {
  return `${this.firstName} ${this.lastName}`;
}
```

## Security Considerations

### Input Validation
Always validate external input:
```typescript
const validated = validateInput(schema, untrustedData);
```

### Avoid Dynamic Code Execution
Never use `eval()` or `new Function()`.

### Sanitize User Content
```typescript
import { sanitizeHtml } from '@/utils/sanitization';

const safe = sanitizeHtml(userInput);
```

---

*Last Updated: 2025-07-27*
*Version: 1.0*
*Enforcement: ESLint configuration in `.eslintrc.json`*