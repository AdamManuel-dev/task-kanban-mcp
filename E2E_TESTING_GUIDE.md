# E2E Testing Guide: CLI Security & Interactive Features

## 🎯 Overview

This guide covers the comprehensive End-to-End (E2E) testing suite for the enhanced CLI with security features. The tests simulate real user interactions to validate functionality, security, and user experience.

## 🏗️ Test Architecture

### Test Categories

1. **Security Tests** (`cli-security.test.ts`)
   - Input sanitization validation
   - Command injection prevention
   - Error message security
   - Unicode and special character handling

2. **Interactive Tests** (`cli-interactive.test.ts`)
   - User input simulation
   - Keyboard navigation
   - Error recovery
   - Graceful interruption handling

3. **Workflow Tests** (`cli-workflow.test.ts`)
   - Complete user workflows
   - Performance testing
   - Load testing
   - Resilience testing

### Test Structure

```
tests/e2e/
├── setup.ts           # Global test setup and utilities
├── cli-security.test.ts    # Security-focused E2E tests
├── cli-interactive.test.ts # Interactive feature tests
└── cli-workflow.test.ts    # Complete workflow tests
```

## 🚀 Running Tests

### Basic Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test categories
npm run test:security      # Security tests only
npm run test:interactive   # Interactive tests only
npm run test:workflow      # Workflow tests only

# Run all tests (unit + E2E)
npm run test:all

# Watch mode for development
npm run test:e2e:watch
```

### Environment Setup

Tests automatically:

- Build the CLI security components
- Create isolated test environments
- Clean up resources after completion
- Set appropriate environment variables

## 🔒 Security Test Coverage

### Input Sanitization Tests

```typescript
// XSS Prevention
it('should sanitize XSS attempts in task titles', () => {
  const maliciousInput = '<script>alert("xss")</script>My Task';
  const result = execSync(`kanban task create --title "${maliciousInput}"`);

  expect(result).toContain('Input sanitized');
  expect(result).not.toContain('<script>');
  expect(result).toContain('My Task');
});
```

**Validates:**
- HTML tag removal
- Script injection prevention
- Unicode attack prevention
- SQL injection attempts

### Command Injection Tests

```typescript
// Command Injection Prevention
it('should prevent shell command injection', () => {
  const injectionAttempt = 'test; echo "INJECTED"; cat /etc/passwd';
  const result = execSync(`kanban task create --title "${injectionAttempt}"`);

  expect(result).not.toContain('INJECTED');
  expect(result).not.toContain('root:');
});
```

**Validates:**
- Shell command execution prevention
- Environment variable injection protection
- File path traversal prevention
- Process execution blocking

### Error Security Tests

**Validates:**
- Sensitive information hiding in errors
- Input sanitization in error messages
- Secure error logging
- Graceful degradation

## 🎮 Interactive Test Coverage

### User Input Simulation

```typescript
// Interactive Task Creation
it('should handle interactive task creation', async () => {
  const child = spawn('kanban', ['task', 'create', '--interactive']);

  // Simulate user typing
  child.stdin.write('Test Task Title\\n');
  child.stdin.write('Task description\\n');
  child.stdin.write('P1\\n');
  child.stdin.end();

  // Validate output
  expect(output).toContain('Task created successfully');
});
```

**Validates:**

- Prompt responses
- Input validation
- Real-time feedback
- Error handling

### Keyboard Navigation Tests

**Validates:**

- Arrow key navigation
- Vim-style shortcuts (j/k/h/l)
- Help system (?/q)
- Selection and confirmation

### Interruption Handling

**Validates:**

- Ctrl+C graceful exit
- Network error recovery
- Timeout handling
- State preservation

## 🔄 Workflow Test Coverage

### Complete User Journeys

1. **Project Setup Workflow**

   ```bash
   # Full project creation and management
   kanban config setup --interactive
   kanban board quick-setup --template scrum
   kanban task create --interactive
   kanban board view --interactive
   ```

2. **Security-Aware Workflow**
   - Malicious input throughout the workflow
   - Sanitization at each step
   - Security event logging

3. **Performance Testing**
   - Multiple rapid operations
   - Large input handling
   - Response time validation

### Load Testing

```typescript
// Multiple Rapid Operations
it('should handle multiple rapid operations', async () => {
  const startTime = Date.now();

  for (let i = 0; i < 10; i++) {
    execSync(`kanban task create --title "Rapid Task ${i}"`);
  }

  const totalTime = Date.now() - startTime;
  expect(totalTime).toBeLessThan(30000); // 30 seconds max
});
```

## 🛠️ Test Utilities

### Custom Matchers

```typescript
// Custom Jest matchers for CLI testing
expect(output).toContainSanitizedInput(maliciousInput, safeOutput);
expect(output).toBeValidCliOutput();
```

### Helper Functions

```typescript
// Test utilities available in setup.ts
testUtils.createTestDir(); // Temporary directories
testUtils.execCli(command); // Safe CLI execution
testUtils.validateSanitization(); // Security validation
testUtils.simulateInput(); // User input simulation
testUtils.createTestData.board(); // Test data creation
```

### Cleanup Management

- Automatic test directory cleanup
- Process termination handling
- Environment variable restoration
- Resource deallocation

## 📊 Test Reporting

### Output Formats

Tests generate reports in multiple formats:

- Console output with progress
- JUnit XML for CI integration
- Coverage reports (optional)
- Detailed error logs

### CI Integration

```yaml
# Example GitHub Actions integration
- name: Run E2E Tests
  run: |
    npm run build:security
    npm run test:e2e

- name: Upload Test Results
  uses: actions/upload-artifact@v2
  with:
    name: e2e-test-results
    path: coverage/e2e/
```

## 🐛 Debugging Tests

### Debug Mode

```bash
# Enable verbose output
DEBUG=* npm run test:e2e

# Run specific test file
npm run test:e2e -- --testPathPattern=security

# Run with increased timeout
npm run test:e2e -- --testTimeout=120000
```

### Common Issues

1. **Build Not Found**

   ```bash
   # Solution: Ensure CLI is built
   npm run build:security
   ```

2. **Timeout Errors**

   ```bash
   # Solution: Increase timeout in jest.e2e.config.js
   testTimeout: 60000 // Increase as needed
   ```

3. **Port Conflicts**
   ```bash
   # Solution: Use different test ports
   export KANBAN_TEST_API_URL=http://localhost:3001
   ```

### Test Data Inspection

```bash
# View test directories
ls /tmp/e2e-test-*

# Check test logs
cat coverage/e2e/e2e-results.xml
```

## 📋 Test Checklist

### Before Running Tests

- [ ] CLI security components built (`npm run build:security`)
- [ ] No conflicting processes on test ports
- [ ] Sufficient disk space for test data
- [ ] Network connectivity for API tests

### Test Coverage Validation

- [ ] All input sanitization scenarios
- [ ] Command injection prevention
- [ ] Interactive workflow completion
- [ ] Error handling and recovery
- [ ] Performance under load
- [ ] Security event logging

### CI/CD Integration

- [ ] Tests run in isolated environment
- [ ] Artifacts uploaded for debugging
- [ ] Test results integrated with PR checks
- [ ] Performance benchmarks tracked

## 🔮 Future Enhancements

### Planned Test Additions

1. **Visual Regression Testing**
   - Screenshot comparison for terminal output
   - Color and formatting validation

2. **Accessibility Testing**
   - Screen reader compatibility
   - Keyboard-only navigation

3. **Cross-Platform Testing**
   - Windows, macOS, Linux validation
   - Different terminal environments

4. **Performance Benchmarking**
   - Response time tracking
   - Memory usage monitoring
   - Regression detection

### Test Automation

- Automatic test generation from user recordings
- AI-powered test case creation
- Continuous security validation
- Real-time monitoring integration

## 📚 Resources

### Testing Best Practices

- [CLI Testing Patterns](https://github.com/sindresorhus/guides/blob/main/testing-cli-tools.md)
- [Security Testing Guide](https://owasp.org/www-guide/latest/4-Web_Application_Security_Testing/README)
- [Jest E2E Testing](https://jestjs.io/docs/tutorial-async)

### Security Testing Resources

- [Input Validation Testing](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/README)
- [Command Injection Testing](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/12-Testing_for_Command_Injection)

---

**Ready to test? Run:** `npm run test:e2e`

For questions or issues, check the [troubleshooting section](#-debugging-tests) or create an issue with test logs.
