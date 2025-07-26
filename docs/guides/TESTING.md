# Testing Guide

This guide covers the testing strategy, frameworks, and best practices for the MCP Kanban project.

## Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Types](#test-types)
- [Mocking Strategies](#mocking-strategies)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Testing Philosophy

Our testing approach follows the testing pyramid:

1. **Unit Tests (70%)** - Fast, isolated tests for individual functions and classes
2. **Integration Tests (20%)** - Tests for service interactions and database operations
3. **End-to-End Tests (10%)** - Complete workflow tests including MCP protocol

## Test Structure

```
tests/
├── unit/                 # Unit tests
│   ├── services/        # Service layer tests
│   ├── utils/           # Utility function tests
│   ├── database/        # Database layer tests
│   └── mcp/             # MCP protocol tests
├── integration/         # Integration tests
│   ├── api/            # REST API integration tests
│   ├── websocket/      # WebSocket integration tests
│   └── workflows/      # Multi-service workflow tests
├── e2e/                # End-to-end tests
│   ├── mcp-client/     # MCP client interaction tests
│   └── scenarios/      # Complete user scenarios
└── jest.setup.ts       # Test configuration
```

## Running Tests

### All Tests
```bash
npm test
```

### Test Types
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# End-to-end tests only
npm run test:e2e

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

### Specific Tests
```bash
# Run tests for a specific file
npm test TaskService.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="should create task"

# Run tests in a specific directory
npm test tests/unit/services/
```

## Writing Tests

### Unit Test Example

```typescript
// tests/unit/services/TaskService.test.ts
import { TaskService } from '@/services/TaskService';
import { MockDatabaseConnection } from '@/tests/mocks/MockDatabaseConnection';

describe('TaskService', () => {
  let taskService: TaskService;
  let mockDb: MockDatabaseConnection;

  beforeEach(() => {
    mockDb = new MockDatabaseConnection();
    taskService = new TaskService(mockDb);
  });

  describe('createTask', () => {
    it('should create a task with required fields', async () => {
      // Arrange
      const taskData = {
        title: 'Test Task',
        board_id: 'board-123',
        column_id: 'todo',
      };

      mockDb.mockQueryOne.mockResolvedValue({ max_position: 5 });
      mockDb.mockTransaction.mockImplementation(async (fn) => fn(mockDb));

      // Act
      const result = await taskService.createTask(taskData);

      // Assert
      expect(result).toMatchObject({
        title: 'Test Task',
        board_id: 'board-123',
        column_id: 'todo',
        position: 6,
      });
      expect(mockDb.mockRun).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tasks'),
        expect.any(Array)
      );
    });

    it('should throw error when parent task not found', async () => {
      // Arrange
      const taskData = {
        title: 'Test Task',
        board_id: 'board-123',
        column_id: 'todo',
        parent_task_id: 'non-existent',
      };

      mockDb.mockGet.mockResolvedValue(null);

      // Act & Assert
      await expect(taskService.createTask(taskData)).rejects.toThrow(
        'Parent task not found'
      );
    });
  });
});
```

### Integration Test Example

```typescript
// tests/integration/api/tasks.test.ts
import request from 'supertest';
import { app } from '@/server';
import { dbConnection } from '@/database/connection';

describe('Tasks API Integration', () => {
  beforeAll(async () => {
    await dbConnection.initialize();
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  beforeEach(async () => {
    await dbConnection.execute('DELETE FROM tasks');
    await dbConnection.execute('DELETE FROM boards');
  });

  describe('POST /api/tasks', () => {
    it('should create task through API', async () => {
      // Create test board first
      const board = await request(app)
        .post('/api/boards')
        .send({
          name: 'Test Board',
          description: 'Test Description',
        })
        .expect(201);

      // Create task
      const response = await request(app)
        .post('/api/tasks')
        .send({
          title: 'API Test Task',
          board_id: board.body.id,
          column_id: 'todo',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        title: 'API Test Task',
        board_id: board.body.id,
        column_id: 'todo',
      });
    });
  });
});
```

### End-to-End Test Example

```typescript
// tests/e2e/mcp-client/task-workflow.test.ts
import { MCPClient } from '@/tests/utils/MCPClient';

describe('MCP Task Workflow E2E', () => {
  let mcpClient: MCPClient;

  beforeAll(async () => {
    mcpClient = new MCPClient();
    await mcpClient.connect();
  });

  afterAll(async () => {
    await mcpClient.disconnect();
  });

  it('should complete full task creation workflow', async () => {
    // Get context
    const context = await mcpClient.callTool('get_context');
    expect(context.boards).toBeDefined();

    // Create task
    const task = await mcpClient.callTool('create_task', {
      title: 'E2E Test Task',
      description: 'Created via MCP',
    });
    
    expect(task).toMatchObject({
      title: 'E2E Test Task',
      description: 'Created via MCP',
    });

    // Search for created task
    const searchResults = await mcpClient.callTool('search_tasks', {
      query: 'E2E Test Task',
    });
    
    expect(searchResults.tasks).toHaveLength(1);
    expect(searchResults.tasks[0].id).toBe(task.id);
  });
});
```

## Test Types

### 1. Unit Tests

**Purpose**: Test individual functions and classes in isolation

**Characteristics**:
- Fast execution (< 10ms per test)
- No external dependencies
- Use mocks for dependencies
- High code coverage

**Example Files**:
- `TaskService.test.ts`
- `ValidationUtils.test.ts`
- `Logger.test.ts`

### 2. Integration Tests

**Purpose**: Test service interactions and data flow

**Characteristics**:
- Test real database operations
- Multiple services working together
- API endpoint testing
- WebSocket communication testing

**Example Files**:
- `task-board-integration.test.ts`
- `websocket-notifications.test.ts`
- `priority-calculation.test.ts`

### 3. End-to-End Tests

**Purpose**: Test complete user workflows

**Characteristics**:
- Test MCP protocol communication
- Full application stack
- Real user scenarios
- Performance validation

**Example Files**:
- `mcp-task-management.test.ts`
- `git-integration-workflow.test.ts`
- `ai-context-generation.test.ts`

## Mocking Strategies

### Database Mocking

```typescript
// tests/mocks/MockDatabaseConnection.ts
export class MockDatabaseConnection implements DatabaseConnection {
  mockQuery = jest.fn();
  mockQueryOne = jest.fn();
  mockExecute = jest.fn();
  mockRun = jest.fn();
  mockTransaction = jest.fn();

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    return this.mockQuery(sql, params);
  }

  // ... other mock implementations
}
```

### Service Mocking

```typescript
// Mock service dependencies
jest.mock('@/services/TaskService');
const mockTaskService = TaskService as jest.MockedClass<typeof TaskService>;

beforeEach(() => {
  mockTaskService.mockClear();
});
```

### External API Mocking

```typescript
// Mock external dependencies
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));
```

## Test Configuration

### Jest Setup

```typescript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### Test Setup File

```typescript
// tests/jest.setup.ts
import { config } from '@/config';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';

// Global test utilities
global.testTimeout = 30000;

// Setup/teardown hooks
beforeAll(async () => {
  // Global setup
});

afterAll(async () => {
  // Global cleanup
});
```

## Coverage Requirements

### Minimum Coverage Thresholds

- **Lines**: 80%
- **Functions**: 80%
- **Branches**: 80%
- **Statements**: 80%

### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/lcov-report/index.html

# View coverage in terminal
npm run test:coverage -- --verbose
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linting
        run: npm run lint
      
      - name: Run type checking
        run: npm run typecheck
      
      - name: Run tests
        run: npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## Best Practices

### 1. Test Organization

- **Group related tests** using `describe` blocks
- **Use descriptive test names** that explain the scenario
- **Follow AAA pattern**: Arrange, Act, Assert
- **One assertion per test** when possible

### 2. Test Data

- **Use factories** for creating test data
- **Avoid hard-coded values** - use constants or generators
- **Clean up test data** after each test
- **Use realistic data** that matches production scenarios

### 3. Async Testing

```typescript
// Good: Proper async/await usage
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

// Bad: Missing await
it('should handle async operations', () => {
  const result = asyncFunction(); // Returns Promise
  expect(result).toBeDefined(); // Tests the Promise, not the result
});
```

### 4. Error Testing

```typescript
// Test error scenarios
it('should throw validation error for invalid input', async () => {
  await expect(service.create(invalidData)).rejects.toThrow(ValidationError);
});

// Test error details
it('should provide detailed error information', async () => {
  try {
    await service.create(invalidData);
    fail('Expected error was not thrown');
  } catch (error) {
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.statusCode).toBe(400);
  }
});
```

## Troubleshooting

### Common Issues

#### 1. Tests Hanging
- Check for unclosed database connections
- Ensure all async operations are awaited
- Look for infinite loops or recursive calls

#### 2. Flaky Tests
- Remove dependencies on external services
- Use fixed test data instead of random values
- Ensure proper test isolation

#### 3. Memory Leaks
- Clean up event listeners
- Close database connections
- Clear timers and intervals

#### 4. Slow Tests
- Use mocks instead of real database operations
- Optimize test data setup
- Run tests in parallel when possible

### Debug Commands

```bash
# Run tests with debugging
npm test -- --verbose --detectOpenHandles

# Run specific test with debug output
npm test -- --testNamePattern="task creation" --verbose

# Debug with Node.js debugger
node --inspect-brk ./node_modules/.bin/jest --runInBand
```

### Performance Monitoring

```typescript
// Monitor test performance
describe('Performance Tests', () => {
  it('should create tasks within performance threshold', async () => {
    const startTime = Date.now();
    
    await taskService.createTask(testData);
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100); // 100ms threshold
  });
});
```

## Contributing

When adding new features:

1. **Write tests first** (TDD approach when possible)
2. **Maintain coverage** - don't reduce overall coverage
3. **Test edge cases** - null values, empty arrays, etc.
4. **Update this guide** when introducing new testing patterns
5. **Run full test suite** before submitting PR

For questions about testing practices, see the [Contributing Guidelines](../CONTRIBUTING.md) or ask in the project discussions.