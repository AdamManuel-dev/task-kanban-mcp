# CLI End-to-End Testing Guide

This guide covers the comprehensive end-to-end testing setup for the MCP Kanban CLI application.

## Overview

The CLI E2E testing suite provides comprehensive coverage for:

- **Basic CLI Operations**: Core commands, help, version, health checks
- **Board Management**: Create, list, view, and manage boards
- **Task Management**: CRUD operations, status updates, priority management
- **Interactive Features**: Interactive command flows and user input handling
- **Advanced Features**: Templates, dependencies, analytics, bulk operations
- **Error Scenarios**: Error handling, recovery mechanisms, edge cases
- **Performance**: Load testing, resource usage, rapid operations

## Test Structure

### Test Files

```
tests/e2e/
├── cli-commands.test.ts           # Basic CLI command testing
├── cli-advanced-features.test.ts  # Advanced functionality
├── cli-error-scenarios.test.ts    # Error handling and edge cases
├── cli-interactive.test.ts        # Interactive features (existing)
├── cli-security.test.ts          # Security testing (existing)
└── cli-workflow.test.ts          # Complete workflows (existing)
```

### Test Categories

#### 1. Basic CLI Operations (`cli-commands.test.ts`)
- Help and version information
- Health checks
- Board CRUD operations
- Task CRUD operations
- Configuration management
- Search and filtering
- Export/import operations
- Output formatting

#### 2. Advanced Features (`cli-advanced-features.test.ts`)
- Template management
- Task dependencies and visualization
- Complex search queries
- Analytics and reporting
- Backup and restore
- Real-time features
- Performance monitoring
- Plugin system
- External integrations
- Bulk operations

#### 3. Error Scenarios (`cli-error-scenarios.test.ts`)
- Database connection failures
- Network and API errors
- Input validation failures
- File system errors
- Memory and resource constraints
- Interactive command interruption
- Configuration corruption and recovery
- Graceful degradation

## Running CLI E2E Tests

### Quick Commands

```bash
# Run all CLI E2E tests
npm run test:cli:all

# Run basic CLI tests
npm run test:cli

# Run advanced feature tests
npm run test:cli:advanced

# Run error scenario tests
npm run test:cli:errors

# Run with setup script
./scripts/cli-e2e-setup.sh all
```

### Individual Test Categories

```bash
# Basic operations
npm run test:cli

# Advanced features
npm run test:cli:advanced

# Error scenarios
npm run test:cli:errors

# Interactive features (existing)
npm run test:interactive

# Security tests (existing)
npm run test:security

# Workflow tests (existing)
npm run test:workflow
```

### With Custom Environment

```bash
# Custom test database
KANBAN_DB_PATH=/tmp/custom-test.db npm run test:cli

# Custom configuration directory
KANBAN_CONFIG_DIR=/tmp/custom-config npm run test:cli

# Debug mode
DEBUG=true npm run test:cli:all
```

## Test Environment Setup

### Automatic Setup

The test suite automatically creates isolated test environments:

```typescript
beforeAll(async () => {
  testConfigDir = join(tmpdir(), `kanban-cli-e2e-${Date.now()}`);
  testDbPath = join(testConfigDir, 'test.db');
  
  await fs.mkdir(testConfigDir, { recursive: true });
  
  process.env.KANBAN_CONFIG_DIR = testConfigDir;
  process.env.KANBAN_DB_PATH = testDbPath;
  process.env.NODE_ENV = 'test';
});
```

### Manual Setup

```bash
# Create test environment
export TEST_DIR="/tmp/kanban-cli-e2e-$(date +%s)"
mkdir -p "$TEST_DIR"

# Set environment variables
export KANBAN_CONFIG_DIR="$TEST_DIR/config"
export KANBAN_DB_PATH="$TEST_DIR/test.db"
export NODE_ENV="test"

# Build CLI
npm run build

# Run tests
npm run test:cli:all
```

## Configuration

### Jest Configuration

E2E tests use `jest.e2e.config.js`:

```javascript
module.exports = {
  displayName: 'E2E Tests',
  testEnvironment: 'node',
  testMatch: ['**/tests/e2e/**/*.test.ts'],
  testTimeout: 60000,
  maxWorkers: 1, // Sequential execution
  setupFilesAfterEnv: ['<rootDir>/tests/e2e/setup.ts']
};
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KANBAN_CONFIG_DIR` | Configuration directory | `~/.kanban` |
| `KANBAN_DB_PATH` | Database file path | `~/.kanban/kanban.db` |
| `KANBAN_API_URL` | API server URL | `http://localhost:3000` |
| `NODE_ENV` | Environment mode | `development` |
| `DEBUG` | Enable debug logging | `false` |

## Test Patterns

### Command Execution Testing

```typescript
test('should create a new task', () => {
  const result = execSync(
    `node ${cliPath} task create --title "Test Task" --priority P1`,
    { encoding: 'utf8' }
  );
  
  expect(result).toContain('Task created successfully');
  expect(result).toContain('Test Task');
});
```

### Interactive Command Testing

```typescript
test('should handle interactive input', async () => {
  const child = spawn('node', [cliPath, 'task', 'create', '--interactive']);
  
  child.stdin.write('Interactive Task\n');
  child.stdin.write('Task description\n');
  child.stdin.write('P2\n');
  child.stdin.end();
  
  const output = await waitForOutput(child);
  expect(output).toContain('Task created successfully');
});
```

### Error Handling Testing

```typescript
test('should handle invalid input gracefully', () => {
  expect(() => {
    execSync(`node ${cliPath} task create --title ""`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });
  }).toThrow();
});
```

### Output Format Testing

```typescript
test('should support JSON output', () => {
  const result = execSync(`node ${cliPath} task list --format json`, {
    encoding: 'utf8'
  });
  
  expect(() => JSON.parse(result)).not.toThrow();
  const parsed = JSON.parse(result);
  expect(Array.isArray(parsed.tasks)).toBe(true);
});
```

## CI/CD Integration

### GitHub Actions

The CLI E2E tests run automatically on:

- Push to `main` or `develop` branches
- Pull requests affecting CLI code
- Multiple OS environments (Ubuntu, macOS, Windows)
- Multiple Node.js versions (18.x, 20.x)

### Workflow File

`.github/workflows/cli-e2e.yml` includes:

```yaml
- name: Run CLI Basic E2E Tests
  run: npm run test:cli
  env:
    NODE_ENV: test
    CI: true

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: cli-e2e-results
    path: coverage/e2e/
```

## Test Data Management

### Isolated Test Environments

Each test suite creates isolated environments:

```typescript
const testConfigDir = join(tmpdir(), `kanban-cli-e2e-${Date.now()}`);
const testDbPath = join(testConfigDir, 'test.db');
```

### Test Data Cleanup

Automatic cleanup after tests:

```typescript
afterAll(async () => {
  try {
    await fs.rmdir(testConfigDir, { recursive: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});
```

### Shared Test Data

Some tests create reusable test data:

```typescript
beforeAll(() => {
  // Create test board
  const boardResult = execSync(
    `node ${cliPath} board create --name "Test Board"`,
    { encoding: 'utf8' }
  );
  
  boardId = extractId(boardResult);
}, 15000);
```

## Performance Considerations

### Test Timeouts

Different timeout values for different test types:

- Basic operations: 10 seconds
- Interactive commands: 15 seconds
- Bulk operations: 30 seconds
- Performance tests: 60 seconds

### Resource Management

Tests include resource usage monitoring:

```typescript
test('should handle rapid command execution', async () => {
  const startTime = Date.now();
  const commands = [];
  
  for (let i = 0; i < 10; i++) {
    commands.push(executeCommand(`task create --title "Task ${i}"`));
  }
  
  await Promise.all(commands);
  const totalTime = Date.now() - startTime;
  
  expect(totalTime).toBeLessThan(15000);
});
```

## Debugging E2E Tests

### Debug Mode

Enable debug output:

```bash
DEBUG=true npm run test:cli:all
```

### Verbose Logging

```bash
npm run test:cli -- --verbose
```

### Individual Test Execution

```bash
# Run specific test file
npx jest tests/e2e/cli-commands.test.ts

# Run specific test case
npx jest tests/e2e/cli-commands.test.ts -t "should create a new task"
```

### Test Artifacts

Failed tests generate artifacts:

- Test output logs
- Database snapshots
- Configuration files
- Error screenshots (if applicable)

## Best Practices

### 1. Test Isolation

- Each test creates its own isolated environment
- No shared state between tests
- Clean up resources after each test

### 2. Realistic Scenarios

- Test actual CLI binary, not mocked functions
- Use real subprocess execution
- Test with realistic data volumes

### 3. Error Coverage

- Test both success and failure scenarios
- Validate error messages and exit codes
- Test recovery mechanisms

### 4. Cross-Platform Compatibility

- Tests run on multiple operating systems
- Handle platform-specific differences
- Use cross-platform file paths

### 5. Performance Awareness

- Monitor test execution time
- Test resource usage patterns
- Validate performance under load

## Troubleshooting

### Common Issues

#### Test Timeouts

```bash
# Increase timeout for slow operations
jest --testTimeout=30000
```

#### Database Locks

```bash
# Ensure proper cleanup
afterEach(async () => {
  await closeAllConnections();
});
```

#### Permission Errors

```bash
# Check file permissions
ls -la /tmp/kanban-cli-e2e-*
```

### Debug Commands

```bash
# Check CLI build
ls -la dist/cli/index.js

# Test CLI directly
node dist/cli/index.js --help

# Check environment
env | grep KANBAN
```

## Contributing

### Adding New Tests

1. Choose appropriate test file based on category
2. Follow existing test patterns
3. Add proper cleanup and isolation
4. Include both positive and negative test cases
5. Update documentation

### Test Categories

- **Basic**: Core functionality that should always work
- **Advanced**: Complex features with dependencies
- **Error**: Edge cases and error conditions
- **Performance**: Load and stress testing

### Code Review Checklist

- [ ] Tests are properly isolated
- [ ] Cleanup is handled correctly
- [ ] Error scenarios are covered
- [ ] Cross-platform compatibility
- [ ] Performance considerations
- [ ] Documentation updates