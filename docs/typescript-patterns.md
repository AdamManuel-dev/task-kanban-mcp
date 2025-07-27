# TypeScript Patterns Guide

## Overview
This document outlines the TypeScript patterns and conventions used in the MCP Kanban codebase. These patterns ensure type safety, maintainability, and consistency across the project.

## Table of Contents
1. [Zod Schema Patterns](#zod-schema-patterns)
2. [Optional Properties with exactOptionalPropertyTypes](#optional-properties-with-exactoptionalpropertytypes)
3. [Service Layer Patterns](#service-layer-patterns)
4. [Error Handling Patterns](#error-handling-patterns)
5. [Type Guards and Assertions](#type-guards-and-assertions)

## Zod Schema Patterns

### Background
We use Zod for runtime validation of API inputs and data structures. With TypeScript's `exactOptionalPropertyTypes` enabled, optional properties must explicitly include `undefined` in their type union.

### The Problem
```typescript
// This causes TypeScript errors with exactOptionalPropertyTypes
const schema = z.object({
  name: z.string().optional() // Type is string | undefined, but assignment requires explicit undefined
});
```

### The Solution
We created helper functions in `src/utils/zod-helpers.ts` to handle this:

```typescript
import { optionalWithUndefined } from '@/utils/zod-helpers';

// Use this pattern for optional properties
const schema = z.object({
  name: optionalWithUndefined(z.string()),
  description: optionalWithUndefined(z.string().max(500))
});
```

### Helper Functions

#### optionalWithUndefined
Makes a schema optional while explicitly including undefined in the type union:
```typescript
export function optionalWithUndefined<T>(
  schema: z.ZodType<T>
): z.ZodOptional<z.ZodUnion<[z.ZodType<T>, z.ZodUndefined]>> {
  return z.union([schema, z.undefined()]).optional();
}
```

#### createOptionalSchema
Creates an object schema where all properties are optional:
```typescript
const UpdateSchema = createOptionalSchema({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  priority: z.number().int().min(0).max(10)
});
```

#### optionalString
Handles empty strings as undefined:
```typescript
const schema = z.object({
  description: optionalString(z.string().max(500))
});
```

## Optional Properties with exactOptionalPropertyTypes

### Why We Use exactOptionalPropertyTypes
This TypeScript flag ensures that optional properties are handled more strictly, preventing common bugs where `undefined` is implicitly assigned to optional properties.

### Pattern for API Request/Response Types
```typescript
// Instead of this:
interface UpdateTaskRequest {
  title?: string;
  description?: string;
}

// Use this:
interface UpdateTaskRequest {
  title?: string | undefined;
  description?: string | undefined;
}
```

### Pattern for Validation Schemas
Always use the `optionalWithUndefined` helper for optional properties in Zod schemas:

```typescript
export const TaskValidation = {
  create: z.object({
    title: z.string().min(1).max(200),
    description: optionalWithUndefined(z.string().max(2000)),
    priority: optionalWithUndefined(z.number().int().min(0).max(10))
  }),
  
  update: z.object({
    title: optionalWithUndefined(z.string().min(1).max(200)),
    description: optionalWithUndefined(z.string().max(2000)),
    priority: optionalWithUndefined(z.number().int().min(0).max(10))
  })
};
```

## Service Layer Patterns

### Consistent Method Signatures
All service methods follow a consistent pattern:

```typescript
class TaskService {
  async createTask(data: CreateTaskData): Promise<Task> {
    // Validation
    const validated = validateInput(TaskValidation.create, data);
    
    // Business logic
    BusinessRules.task.validateTitle(validated.title);
    
    // Database operation
    const task = await this.db.run(/* query */);
    
    // Return typed result
    return task;
  }
}
```

### Transaction Handling
Use the transaction utilities for multi-step operations:

```typescript
import { runInTransaction } from '@/utils/transactions';

async updateTaskWithDependencies(
  taskId: string, 
  data: UpdateTaskData
): Promise<Task> {
  return runInTransaction(this.db, async (trx) => {
    const task = await this.updateTask(taskId, data, trx);
    await this.updateDependencies(taskId, data.dependencies, trx);
    return task;
  });
}
```

## Error Handling Patterns

### Custom Error Classes
All custom errors extend from base error classes and implement the ServiceError interface:

```typescript
export class ValidationError extends Error implements ServiceError {
  public readonly code = 'VALIDATION_ERROR';
  public readonly statusCode = 400;
  public readonly details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}
```

### Error Usage Pattern
```typescript
// Throw specific errors with context
if (!task) {
  throw new NotFoundError('Task', taskId);
}

// Validate with detailed errors
try {
  const data = validateInput(schema, input);
} catch (error) {
  if (error instanceof z.ZodError) {
    throw new ValidationError('Invalid input', error.errors);
  }
  throw error;
}
```

## Type Guards and Assertions

### Type Guard Pattern
```typescript
// Define type guards for runtime checks
export function isTask(obj: unknown): obj is Task {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'title' in obj &&
    'board_id' in obj
  );
}

// Use in code
if (!isTask(data)) {
  throw new ValidationError('Invalid task data');
}
```

### Assertion Functions
```typescript
export function assertDefined<T>(
  value: T | undefined | null,
  message: string
): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
}

// Usage
assertDefined(config.apiKey, 'API key is required');
// TypeScript now knows config.apiKey is defined
```

## Best Practices

### 1. Avoid `any` Types
Never use `any`. Use `unknown` for truly unknown types and narrow with type guards.

### 2. Explicit Return Types
Always specify return types for functions:
```typescript
// Good
async function getTask(id: string): Promise<Task | null> {
  // ...
}

// Bad
async function getTask(id: string) {
  // ...
}
```

### 3. Prefer Interfaces for Object Types
```typescript
// Good
interface TaskData {
  title: string;
  description?: string | undefined;
}

// Less preferred
type TaskData = {
  title: string;
  description?: string | undefined;
};
```

### 4. Use Const Assertions
```typescript
// For literal types
const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked'] as const;
type TaskStatus = typeof TASK_STATUSES[number];
```

### 5. Branded Types for IDs
Consider using branded types for entity IDs (future improvement):
```typescript
type TaskId = string & { __brand: 'TaskId' };
type BoardId = string & { __brand: 'BoardId' };

// Prevents mixing up IDs
function moveTask(taskId: TaskId, boardId: BoardId) {
  // ...
}
```

## Migration Guide

### Converting Existing Schemas
When updating existing Zod schemas to use the new pattern:

1. Import the helper:
   ```typescript
   import { optionalWithUndefined } from '@/utils/zod-helpers';
   ```

2. Replace `.optional()` with `optionalWithUndefined()`:
   ```typescript
   // Before
   name: z.string().optional()
   
   // After
   name: optionalWithUndefined(z.string())
   ```

3. For complex validations, wrap the entire validation:
   ```typescript
   // Before
   color: z.string().regex(/^#[0-9A-F]{6}$/i).optional()
   
   // After
   color: optionalWithUndefined(z.string().regex(/^#[0-9A-F]{6}$/i))
   ```

### Testing Considerations
When testing code that uses these patterns:

1. Explicitly pass `undefined` for optional properties in tests
2. Use type assertions sparingly and document why they're needed
3. Test both defined and undefined cases for optional properties

## Future Improvements

1. **Branded Types**: Implement branded types for all entity IDs
2. **Exhaustive Type Checking**: Use discriminated unions with exhaustive checks
3. **Template Literal Types**: Use for API routes and event names
4. **Const Type Parameters**: Use for more precise generic constraints

---

*Last Updated: 2025-07-27*
*Author: MCP Kanban Team*