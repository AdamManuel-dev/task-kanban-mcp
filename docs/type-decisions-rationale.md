# TypeScript Type Decisions Rationale

## Overview
This document explains the reasoning behind key TypeScript type decisions made during the MCP Kanban project development. Understanding these decisions helps maintain consistency and provides context for future development.

## Table of Contents
1. [exactOptionalPropertyTypes Decision](#exactoptionalpropertytypes-decision)
2. [Optional Property Handling](#optional-property-handling)
3. [Zod Schema Patterns](#zod-schema-patterns)
4. [Interface vs Type Alias](#interface-vs-type-alias)
5. [Strict Configuration Choices](#strict-configuration-choices)
6. [ID Type Strategy](#id-type-strategy)
7. [Error Type Architecture](#error-type-architecture)

## exactOptionalPropertyTypes Decision

### The Challenge
When TypeScript 4.4 introduced `exactOptionalPropertyTypes`, it created a stricter type checking for optional properties. This flag ensures that:
```typescript
interface User {
  name?: string;
}

const user: User = { name: undefined }; // Error with exactOptionalPropertyTypes
```

### Our Decision
We decided to **keep `exactOptionalPropertyTypes: true`** because:

1. **Prevents Bugs**: It catches cases where `undefined` is accidentally assigned to optional properties
2. **API Clarity**: Makes the distinction between "property not present" and "property is undefined" explicit
3. **Future-Proof**: Aligns with TypeScript's direction towards stricter type checking

### Implementation Strategy
Instead of disabling the flag, we created helper utilities (`optionalWithUndefined`) to work with it properly. This approach:
- Maintains type safety
- Makes our intent explicit
- Provides reusable patterns

## Optional Property Handling

### The Problem
With `exactOptionalPropertyTypes`, this common pattern fails:
```typescript
// This causes type errors
const updateData: UpdateTaskRequest = {
  title: formData.title || undefined  // Error!
};
```

### The Solution
We explicitly type optional properties to include `undefined`:
```typescript
interface UpdateTaskRequest {
  title?: string | undefined;  // Explicit undefined
  description?: string | undefined;
}
```

### Rationale
1. **Consistency**: All optional properties follow the same pattern
2. **Zod Integration**: Works seamlessly with our validation schemas
3. **No Ambiguity**: Clear about what values are acceptable

## Zod Schema Patterns

### The Challenge
Zod's `.optional()` method doesn't play well with `exactOptionalPropertyTypes`:
```typescript
const schema = z.object({
  name: z.string().optional()  // Type issues with exactOptionalPropertyTypes
});
```

### Our Solution
We created the `optionalWithUndefined` helper:
```typescript
const schema = z.object({
  name: optionalWithUndefined(z.string())
});
```

### Benefits
1. **Type Safety**: Maintains full TypeScript type checking
2. **Validation Accuracy**: Properly handles undefined values
3. **Reusability**: Single pattern used throughout the codebase
4. **Migration Path**: Easy to update existing schemas

## Interface vs Type Alias

### Our Guidelines
We prefer **interfaces for object types** and **type aliases for unions/functions**:

```typescript
// Interfaces for objects
interface Task {
  id: string;
  title: string;
}

// Type aliases for unions and complex types
type TaskStatus = 'todo' | 'in_progress' | 'done';
type AsyncCallback<T> = (data: T) => Promise<void>;
```

### Rationale
1. **Interface Benefits**:
   - Better error messages
   - Declaration merging capability
   - Extends syntax is clearer
   - Better IDE support

2. **Type Alias Benefits**:
   - Required for unions and intersections
   - Better for function types
   - Can alias primitives

## Strict Configuration Choices

### Our tsconfig.json Settings
```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true
}
```

### Why So Strict?
1. **Catch Bugs Early**: Strict settings catch more potential issues at compile time
2. **Better IntelliSense**: Stricter types provide better IDE support
3. **Easier Refactoring**: Type safety makes large-scale changes safer
4. **Team Consistency**: Enforces consistent patterns across developers

### Trade-offs Accepted
- **More Verbose Code**: We accept writing more explicit types
- **Learning Curve**: New developers need to understand our patterns
- **Migration Effort**: Updating dependencies may require more work

## ID Type Strategy

### Current Approach
Currently using string types for IDs:
```typescript
interface Task {
  id: string;
  board_id: string;
  column_id: string;
}
```

### Future Consideration: Branded Types
We're considering branded types for better type safety:
```typescript
type TaskId = string & { __brand: 'TaskId' };
type BoardId = string & { __brand: 'BoardId' };

interface Task {
  id: TaskId;
  board_id: BoardId;
}
```

### Why Not Yet?
1. **Complexity**: Adds complexity for the current project size
2. **Serialization**: Requires careful handling in JSON serialization
3. **Third-party Integration**: May complicate integration with libraries

### When We'll Adopt
- When the codebase grows significantly
- When we've had bugs from mixed-up IDs
- When team is comfortable with advanced TypeScript

## Error Type Architecture

### Design Decision
All service errors implement the `ServiceError` interface:
```typescript
interface ServiceError extends Error {
  code: string;
  statusCode: number;
  details?: any;
}
```

### Benefits
1. **Consistent Error Handling**: All errors follow the same structure
2. **HTTP Integration**: Status codes built into error types
3. **Debugging**: Structured details for troubleshooting
4. **Type Guards**: Easy to check error types

### Implementation Pattern
```typescript
export class ValidationError extends Error implements ServiceError {
  public readonly code = 'VALIDATION_ERROR';
  public readonly statusCode = 400;
  
  constructor(message: string, public readonly details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

## Validation Architecture Decisions

### Centralized Validation
All validation logic lives in `utils/validation.ts` because:
1. **Single Source of Truth**: One place to update validation rules
2. **Reusability**: Share validation between API and services
3. **Testing**: Easier to test validation logic in isolation

### Business Rules Separation
We separate schema validation from business rules:
```typescript
// Schema validation (structure)
const schema = z.object({ title: z.string().min(1) });

// Business rules (domain logic)
BusinessRules.task.validateTitle(title);
```

This separation provides:
- Clear distinction between format and business logic
- Easier to test each concern separately
- Flexibility to change business rules without touching schemas

## Generic Type Usage

### Constraint-Based Generics
We use constraints to ensure type safety:
```typescript
function processEntity<T extends { id: string }>(entity: T): T {
  // Can safely access entity.id
}
```

### Rationale
1. **Type Safety**: Prevents passing incompatible types
2. **IntelliSense**: Better IDE support with constraints
3. **Documentation**: Constraints document expectations

## Async Type Patterns

### Consistent Promise Types
All async functions explicitly declare Promise return types:
```typescript
async function getTask(id: string): Promise<Task | null> {
  // Implementation
}
```

### Never Use `any` in Catch Blocks
With `useUnknownInCatchVariables`, we handle errors properly:
```typescript
try {
  // ...
} catch (error) {
  if (error instanceof Error) {
    logger.error(error.message);
  } else {
    logger.error('Unknown error', error);
  }
}
```

## Future Type Improvements

### Planned Enhancements
1. **Branded Types for IDs**: When complexity justifies it
2. **Template Literal Types**: For API routes and event names
3. **Const Type Parameters**: For more precise generics
4. **Discriminated Unions**: For complex state management

### Decision Framework
We'll adopt new TypeScript features when:
1. They solve a real problem we're facing
2. The team understands the feature
3. The benefits outweigh the complexity
4. tooling support is mature

## Conclusion

Our TypeScript decisions prioritize:
1. **Type Safety**: Catching errors at compile time
2. **Explicitness**: Making intent clear in code
3. **Consistency**: Using patterns uniformly across the codebase
4. **Pragmatism**: Balancing ideal types with practical development

These decisions create a robust foundation while remaining flexible for future enhancements.

---

*Last Updated: 2025-07-27*
*Decisions made during initial TypeScript migration and cleanup*