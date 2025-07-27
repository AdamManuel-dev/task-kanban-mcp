# Contributing Guidelines

Thank you for your interest in contributing to the MCP Kanban project! This document provides guidelines for contributing code, documentation, and other improvements.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation Standards](#documentation-standards)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Community Guidelines](#community-guidelines)

## Code of Conduct

### Our Standards

We are committed to providing a welcoming and inspiring community for all. By participating in this project, you agree to:

- **Be respectful and inclusive** - Use welcoming and inclusive language
- **Be collaborative** - Work together toward common goals
- **Be constructive** - Provide constructive feedback and suggestions
- **Be professional** - Maintain professional behavior in all interactions

### Unacceptable Behavior

- Harassment, discrimination, or offensive behavior
- Trolling, insulting, or derogatory comments
- Publishing others' private information without permission
- Other conduct that could reasonably be considered inappropriate

### Enforcement

Violations of the Code of Conduct may result in:
- Temporary or permanent ban from the project
- Removal of contributions
- Reporting to appropriate authorities if necessary

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Git** >= 2.30.0
- **SQLite** (for database operations)
- **VS Code** (recommended IDE with extensions)

### Initial Setup

```bash
# Fork the repository on GitHub
# Clone your fork
git clone https://github.com/yourusername/mcp-kanban.git
cd mcp-kanban

# Add upstream remote
git remote add upstream https://github.com/original-owner/mcp-kanban.git

# Install dependencies
npm install

# Set up development environment
cp .env.example .env
npm run migrate
npm run seed

# Verify setup
npm run test
npm run typecheck
npm run lint
```

### Development Environment

#### VS Code Extensions

Install the recommended extensions:

```json
// .vscode/extensions.json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml",
    "ms-vscode.vscode-jest"
  ]
}
```

#### Pre-commit Hooks

The project uses Husky for pre-commit hooks. These will automatically run:

```bash
# Pre-commit checks (automatic)
npm run typecheck
npm run lint
npm run test:unit
```

## Development Workflow

### Branch Strategy

We follow a simplified Git Flow approach:

```
main (production-ready)
├── develop (integration branch)
├── feature/feature-name
├── fix/bug-description
├── docs/documentation-update
└── refactor/improvement-description
```

### Branch Naming Convention

- **Feature branches**: `feature/descriptive-name`
- **Bug fixes**: `fix/issue-description`
- **Documentation**: `docs/topic-description`
- **Refactoring**: `refactor/component-description`
- **Hotfixes**: `hotfix/critical-issue`

### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Changes to the build process or auxiliary tools

#### Examples

```bash
# Feature
git commit -m "feat(tasks): add bulk task operations endpoint"

# Bug fix
git commit -m "fix(database): resolve SQLite boolean handling issue"

# Documentation
git commit -m "docs(api): update task creation endpoint documentation"

# Refactoring
git commit -m "refactor(services): extract common validation logic"

# Breaking change
git commit -m "feat(api)!: change task priority field from string to number

BREAKING CHANGE: Task priority is now a number (1-10) instead of string"
```

### Development Cycle

1. **Create feature branch** from `develop`
2. **Write tests first** (TDD approach)
3. **Implement feature** following coding standards
4. **Run quality checks** (lint, typecheck, test)
5. **Test manually** with development server
6. **Update documentation** if needed
7. **Create pull request** with description
8. **Address review feedback**
9. **Merge to develop** after approval

## Code Standards

### TypeScript Guidelines

#### Type Safety

```typescript
// ✅ Good: Explicit types for public APIs
interface CreateTaskRequest {
  title: string;
  description?: string;
  board_id: string;
  priority?: number;
}

// ✅ Good: Use type guards
function isTask(obj: unknown): obj is Task {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'title' in obj &&
    'board_id' in obj
  );
}

// ❌ Avoid: Any types
const data: any = response.body;

// ✅ Better: Unknown with type guards
const data: unknown = response.body;
if (isTask(data)) {
  // Use data safely
}
```

#### Error Handling

```typescript
// ✅ Good: Structured error handling
class TaskService {
  async createTask(data: CreateTaskRequest): Promise<Task> {
    try {
      const validatedData = this.validateTaskData(data);
      const task = await this.db.createTask(validatedData);
      
      await this.broadcastTaskCreated(task);
      return task;
    } catch (error) {
      logger.error('Failed to create task', { error, data });
      throw this.createServiceError('TASK_CREATE_FAILED', 'Failed to create task', error);
    }
  }

  private createServiceError(code: string, message: string, cause?: unknown): ServiceError {
    const error = new Error(message) as ServiceError;
    error.code = code;
    error.statusCode = this.getStatusCodeForError(code);
    error.cause = cause;
    return error;
  }
}
```

#### Async/Await Usage

```typescript
// ✅ Good: Proper async/await with error handling
async function processTaskBatch(tasks: Task[]): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  
  for (const task of tasks) {
    try {
      const result = await processTask(task);
      results.push(result);
    } catch (error) {
      logger.warn('Task processing failed', { taskId: task.id, error });
      results.push({ 
        id: task.id, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
  
  return results;
}

// ✅ Good: Parallel processing when appropriate
async function processTasksBatch(tasks: Task[]): Promise<ProcessResult[]> {
  const promises = tasks.map(async (task) => {
    try {
      return await processTask(task);
    } catch (error) {
      return { 
        id: task.id, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });
  
  return Promise.all(promises);
}
```

### Code Organization

#### File Structure

```typescript
// File: src/services/TaskService.ts

// 1. Imports (external first, then internal)
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import type { Task, CreateTaskRequest, ServiceError } from '@/types';

// 2. Types and interfaces
export interface TaskServiceConfig {
  enableNotifications: boolean;
  maxTasksPerBoard: number;
}

// 3. Validation schemas
const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  board_id: z.string().uuid(),
  priority: z.number().min(1).max(10).optional(),
});

// 4. Main class
export class TaskService {
  constructor(
    private db: DatabaseConnection,
    private config: TaskServiceConfig = { enableNotifications: true, maxTasksPerBoard: 1000 }
  ) {}

  // Public methods first
  async createTask(data: CreateTaskRequest): Promise<Task> {
    // Implementation
  }

  async getTask(id: string): Promise<Task> {
    // Implementation
  }

  // Private methods last
  private validateTaskData(data: unknown): CreateTaskRequest {
    return createTaskSchema.parse(data);
  }

  private async broadcastTaskCreated(task: Task): Promise<void> {
    // Implementation
  }
}

// 5. Utility functions (if any)
export function isTaskService(obj: unknown): obj is TaskService {
  return obj instanceof TaskService;
}
```

#### Import Organization

```typescript
// 1. External libraries (alphabetical)
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// 2. Internal modules (use @ alias, alphabetical)
import { config } from '@/config';
import type { Task } from '@/types';
import { logger } from '@/utils/logger';

// 3. Relative imports (alphabetical)
import { validateInput } from './validation';
import type { ServiceConfig } from './types';
```

### ESLint Configuration

The project uses a comprehensive ESLint configuration. Key rules:

```json
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
    "@typescript-eslint/no-explicit-any": "error",
    "prefer-const": "error",
    "no-var": "error",
    "object-shorthand": "error",
    "prefer-template": "error"
  }
}
```

### Prettier Configuration

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false
}
```

## Testing Guidelines

### Test Structure

#### Unit Tests

```typescript
// tests/unit/services/TaskService.test.ts
import { TaskService } from '@/services/TaskService';
import { createMockDatabase } from '@/tests/mocks/database';

describe('TaskService', () => {
  let taskService: TaskService;
  let mockDb: ReturnType<typeof createMockDatabase>;

  beforeEach(() => {
    mockDb = createMockDatabase();
    taskService = new TaskService(mockDb);
  });

  describe('createTask', () => {
    it('should create a task with valid data', async () => {
      // Arrange
      const taskData = {
        title: 'Test Task',
        description: 'Test Description',
        board_id: 'board-123',
        priority: 5,
      };

      const expectedTask = {
        id: 'task-123',
        ...taskData,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.createTask.mockResolvedValue(expectedTask);

      // Act
      const result = await taskService.createTask(taskData);

      // Assert
      expect(result).toEqual(expectedTask);
      expect(mockDb.createTask).toHaveBeenCalledWith(taskData);
    });

    it('should throw error for invalid task data', async () => {
      // Arrange
      const invalidData = {
        title: '', // Invalid: empty title
        board_id: 'invalid-uuid',
      };

      // Act & Assert
      await expect(taskService.createTask(invalidData)).rejects.toThrow();
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const taskData = {
        title: 'Test Task',
        board_id: 'board-123',
      };

      mockDb.createTask.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(taskService.createTask(taskData)).rejects.toThrow('Failed to create task');
    });
  });
});
```

#### Integration Tests

```typescript
// tests/integration/api/tasks.test.ts
import request from 'supertest';
import { app } from '@/server';
import { createTestDatabase } from '@/tests/utils/database';

describe('Tasks API', () => {
  let testDb: ReturnType<typeof createTestDatabase>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    await testDb.clear();
    await testDb.seed();
  });

  describe('POST /api/tasks', () => {
    it('should create a new task', async () => {
      const taskData = {
        title: 'New Task',
        description: 'Task description',
        board_id: 'board-123',
      };

      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', 'Bearer test-api-key')
        .send(taskData)
        .expect(201);

      expect(response.body).toMatchObject({
        title: taskData.title,
        description: taskData.description,
        board_id: taskData.board_id,
      });
      expect(response.body.id).toBeDefined();
    });

    it('should return 400 for invalid data', async () => {
      const invalidData = {
        title: '', // Invalid: empty title
      };

      await request(app)
        .post('/api/tasks')
        .set('Authorization', 'Bearer test-api-key')
        .send(invalidData)
        .expect(400);
    });
  });
});
```

### Test Coverage Requirements

- **Unit tests**: Minimum 80% coverage for business logic
- **Integration tests**: All API endpoints must be tested
- **E2E tests**: Critical user workflows must be tested

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run E2E tests only
npm run test:e2e

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Documentation Standards

### Code Documentation

#### JSDoc Comments

```typescript
/**
 * Service for managing kanban tasks and their relationships.
 * 
 * Provides CRUD operations for tasks, handles task dependencies,
 * and manages task priorities and status transitions.
 */
export class TaskService {
  /**
   * Creates a new task with the specified details.
   * 
   * @param data - Task creation data
   * @returns Promise resolving to the created task
   * @throws {ServiceError} When task creation fails
   * 
   * @example
   * ```typescript
   * const task = await taskService.createTask({
   *   title: 'Implement feature',
   *   description: 'Add new functionality',
   *   board_id: 'board-123',
   *   priority: 5
   * });
   * ```
   */
  async createTask(data: CreateTaskRequest): Promise<Task> {
    // Implementation
  }

  /**
   * Retrieves a task by its unique identifier.
   * 
   * @param id - Task identifier
   * @returns Promise resolving to the task
   * @throws {ServiceError} When task is not found
   */
  async getTask(id: string): Promise<Task> {
    // Implementation
  }
}
```

#### README Files

Each major directory should have a README.md file:

```markdown
# Services Module

This directory contains the business logic layer services.

## Overview

Services implement the core business logic for the MCP Kanban system, including:
- Task management and relationships
- Board and column organization
- Note and tag management
- Priority calculation and AI context generation

## Architecture

Services follow a layered architecture:
- **Service Layer**: Business logic and validation
- **Data Access**: Database operations and caching
- **Integration**: External service communication

## Key Services

- `TaskService` - Task CRUD operations and relationships
- `BoardService` - Board and column management
- `ContextService` - AI context generation
- `NoteService` - Note management and search
- `TagService` - Tag hierarchy and operations

## Usage

```typescript
import { TaskService } from '@/services/TaskService';

const taskService = new TaskService(database);
const task = await taskService.createTask(taskData);
```

## Testing

Run service tests with:
```bash
npm run test:unit:services
```
```

### API Documentation

All API endpoints must be documented with:

- **Purpose and functionality**
- **Request/response schemas**
- **Authentication requirements**
- **Error responses**
- **Usage examples**

### Architecture Documentation

- **System overview and design decisions**
- **Component interactions**
- **Data flow diagrams**
- **Performance considerations**

## Pull Request Process

### Before Submitting

1. **Ensure tests pass**:
   ```bash
   npm run test
   npm run typecheck
   npm run lint
   ```

2. **Update documentation** if needed

3. **Add tests** for new functionality

4. **Update CHANGELOG.md** with your changes

### Pull Request Template

```markdown
## Description

Brief description of the changes made.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Documentation updated

## Checklist

- [ ] Code follows the style guidelines
- [ ] Self-review completed
- [ ] Code is commented, particularly in hard-to-understand areas
- [ ] Corresponding changes to documentation made
- [ ] No new warnings generated
- [ ] Tests added that prove fix is effective or feature works

## Related Issues

Closes #123
```

### Review Process

1. **Automated checks** must pass
2. **Code review** by at least one maintainer
3. **Documentation review** if applicable
4. **Testing verification** if needed

### Merge Criteria

- All automated checks pass
- At least one approval from maintainers
- No unresolved review comments
- Documentation updated if needed

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

1. **Create release branch** from `develop`
2. **Update version** in package.json
3. **Update CHANGELOG.md**
4. **Run full test suite**
5. **Create release PR** to `main`
6. **Merge and tag** release
7. **Deploy** to production
8. **Merge back** to `develop`

### Release Checklist

- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped
- [ ] Release notes written
- [ ] Deployment tested

## Community Guidelines

### Communication

- **Be respectful** in all interactions
- **Ask questions** when unsure
- **Provide context** when reporting issues
- **Be patient** with responses

### Issue Reporting

When reporting issues, include:

- **Clear description** of the problem
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Environment details**
- **Screenshots/logs** if applicable

### Feature Requests

When requesting features:

- **Describe the use case**
- **Explain the benefit**
- **Consider alternatives**
- **Be open to discussion**

### Getting Help

- **Check documentation** first
- **Search existing issues**
- **Ask in discussions**
- **Join community channels**

## Recognition

Contributors will be recognized in:

- **README.md** contributors section
- **Release notes**
- **Project documentation**
- **Community acknowledgments**

Thank you for contributing to the MCP Kanban project! 