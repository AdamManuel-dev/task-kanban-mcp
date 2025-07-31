# API Testing Guide: HTTP & MCP E2E Tests

## 🎯 Overview

This guide covers comprehensive End-to-End testing for both HTTP REST API and Model Context Protocol (MCP) API endpoints, with a focus on security, functionality, and protocol compliance.

## 🏗️ Test Architecture

### API Test Categories

1. **HTTP API Tests** (`http-api.test.ts`)
   - REST endpoint functionality
   - Authentication and authorization
   - Input sanitization and security
   - Performance and load testing
   - Error handling and resilience

2. **MCP API Tests** (`mcp-api.test.ts`)
   - Protocol compliance (JSON-RPC 2.0)
   - Tool execution and validation
   - Resource management
   - Prompt system functionality
   - Security and error handling

### Test Structure

```
tests/e2e/
├── setup.ts              # Global test utilities
├── http-api.test.ts       # HTTP REST API tests
├── mcp-api.test.ts        # Model Context Protocol tests
├── cli-security.test.ts   # CLI security tests
├── cli-interactive.test.ts # CLI interactive tests
└── cli-workflow.test.ts   # CLI workflow tests
```

## 🚀 Running API Tests

### Basic Commands

```bash
# Run all API tests
npm run test:apis

# Run HTTP API tests only
npm run test:http-api

# Run MCP API tests only
npm run test:mcp-api

# Run all E2E tests (including CLI)
npm run test:e2e

# Watch mode for development
npm run test:e2e:watch
```

### Environment Requirements

**For HTTP API Tests:**
- Express server setup
- Test database initialization
- API key configuration
- Security middleware validation

**For MCP API Tests:**
- MCP server process spawning
- JSON-RPC 2.0 protocol communication
- Tool registry validation
- Resource access testing

## 🌐 HTTP API Test Coverage

### Authentication & Security

```typescript
// API Key Authentication
it('should require API key for protected endpoints', async () => {
  await request(app).get('/api/tasks').expect(401);
});

// Input Sanitization
it('should sanitize XSS attempts', async () => {
  const maliciousPayload = {
    title: '<script>alert("xss")</script>Clean Title',
    description: '<img src=x onerror=alert(1)>',
  };

  const response = await request(app)
    .post('/api/tasks')
    .set('X-API-Key', testApiKey)
    .send(maliciousPayload)
    .expect(201);

  expect(response.body.title).not.toContain('<script>');
  expect(response.body.title).toContain('Clean Title');
});
```

### Test Coverage Areas

#### 1. Security Validation

- XSS prevention in all inputs
- SQL injection protection
- Command injection blocking
- Path traversal prevention
- API key validation
- Rate limiting enforcement

#### 2. CRUD Operations

- Task creation with validation
- Board management with templates
- Search functionality with filters
- Context and analytics endpoints
- Bulk operations and performance

#### 3. Error Handling

- Proper HTTP status codes
- Sanitized error messages
- Graceful degradation
- Timeout handling
- Concurrent request management

#### 4. Performance Testing

- Response time validation
- Concurrent request handling
- Large payload processing
- Memory usage stability
- Rate limiting effectiveness

### HTTP API Endpoints Tested

| Endpoint            | Method         | Test Focus                                 |
| ------------------- | -------------- | ------------------------------------------ |
| `/api/health`       | GET            | Status, rate limiting                      |
| `/api/tasks`        | GET/POST       | CRUD, filtering, security                  |
| `/api/tasks/:id`    | GET/PUT/DELETE | Individual operations                      |
| `/api/tasks/search` | GET            | Search functionality, injection prevention |
| `/api/boards`       | GET/POST       | Board management, templates                |
| `/api/boards/:id`   | GET/PUT/DELETE | Board operations                           |
| `/api/context`      | GET            | Analytics and summaries                    |
| `/ws`               | WebSocket      | Real-time communication                    |

## 🔗 MCP API Test Coverage

### Protocol Compliance

```typescript
// JSON-RPC 2.0 Compliance
it('should respond to initialize request', async () => {
  const initMessage = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {}, resources: {}, prompts: {} },
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  };

  const response = await sendMCPMessage(mcpProcess, initMessage);

  expect(response.jsonrpc).toBe('2.0');
  expect(response.result.capabilities).toBeDefined();
  expect(response.result.serverInfo.name).toContain('kanban');
});
```

### Test Coverage Areas

#### 1. Protocol Compliance

- JSON-RPC 2.0 message format
- Initialize handshake validation
- Method discovery and execution
- Error code standardization
- Protocol version validation

#### 2. Tool System

- Tool listing and discovery
- Argument validation and sanitization
- Execution results formatting
- Error handling and recovery
- Security input filtering

#### 3. Resource Management

- Resource URI validation
- Access permission checking
- Content type handling
- Data serialization
- Cache management

#### 4. Prompt System

- Dynamic prompt generation
- Context injection
- Argument processing
- Template rendering
- Security validation

### MCP Protocol Methods Tested

| Method           | Purpose            | Test Focus              |
| ---------------- | ------------------ | ----------------------- |
| `initialize`     | Connection setup   | Protocol compliance     |
| `tools/list`     | Tool discovery     | Registry validation     |
| `tools/call`     | Tool execution     | Security, functionality |
| `resources/list` | Resource discovery | Access control          |
| `resources/read` | Resource access    | Permissions, content    |
| `prompts/list`   | Prompt discovery   | Template availability   |
| `prompts/get`    | Prompt generation  | Context injection       |

## 🔒 Security Test Matrix

### Input Sanitization Tests

| Attack Vector       | HTTP API | MCP API | Test Status   |
| ------------------- | -------- | ------- | ------------- |
| XSS Injection       | ✅       | ✅      | Comprehensive |
| SQL Injection       | ✅       | ✅      | Comprehensive |
| Command Injection   | ✅       | ✅      | Comprehensive |
| Path Traversal      | ✅       | ❌      | HTTP Only     |
| Prototype Pollution | ✅       | ✅      | Comprehensive |
| Unicode Attacks     | ✅       | ✅      | Comprehensive |
| JSON Bombing        | ✅       | ✅      | Comprehensive |

### Authentication & Authorization

| Security Feature    | HTTP API | MCP API | Implementation |
| ------------------- | -------- | ------- | -------------- |
| API Key Validation  | ✅       | ❌      | HTTP Only      |
| Rate Limiting       | ✅       | ✅      | Both           |
| Input Validation    | ✅       | ✅      | Both           |
| Error Sanitization  | ✅       | ✅      | Both           |
| Protocol Validation | ❌       | ✅      | MCP Only       |

## 🛠️ Test Utilities and Helpers

### HTTP API Helpers

```typescript
// Available in tests/e2e/setup.ts
testUtils.createTestData.board(); // Create test board
testUtils.createTestData.task(); // Create test task
testUtils.validateSanitization(); // Check input cleaning
testUtils.execCli(); // CLI integration
```

### MCP API Helpers

```typescript
// MCP-specific utilities
async function startMCPServer(): Promise<ChildProcess>;
async function sendMCPMessage(process, message): Promise<MCPMessage>;

// Message builders
const initMessage = buildInitMessage(capabilities);
const toolCallMessage = buildToolCall(name, args);
const resourceReadMessage = buildResourceRead(uri);
```

### Test Data Management

- Automatic test environment setup
- Isolated database per test suite
- Cleanup after test completion
- Configurable test data generation
- Resource leak detection

## 📊 Performance Benchmarks

### HTTP API Performance Targets

| Operation        | Target Time | Concurrent Users | Success Rate |
| ---------------- | ----------- | ---------------- | ------------ |
| Health Check     | < 100ms     | 100              | 99.9%        |
| Task Creation    | < 500ms     | 50               | 99%          |
| Task Listing     | < 1s        | 100              | 99%          |
| Search Query     | < 2s        | 20               | 95%          |
| Board Operations | < 1s        | 30               | 99%          |

### MCP API Performance Targets

| Operation         | Target Time | Message Size | Success Rate |
| ----------------- | ----------- | ------------ | ------------ |
| Initialize        | < 1s        | 1KB          | 100%         |
| Tool List         | < 500ms     | 10KB         | 100%         |
| Tool Call         | < 2s        | 100KB        | 99%          |
| Resource Read     | < 1s        | 1MB          | 99%          |
| Prompt Generation | < 3s        | 50KB         | 99%          |

## 🐛 Debugging and Troubleshooting

### Debug Commands

```bash
# Enable verbose logging
DEBUG=* npm run test:apis

# Run specific test file
npm run test:e2e -- --testPathPattern=http-api

# Increase timeout for debugging
npm run test:e2e -- --testTimeout=300000

# Run tests with coverage
npm run test:e2e -- --coverage
```

### Common Issues

1. **Server Startup Failures**

   ```bash
   # Check if ports are available
   lsof -i :3000

   # Verify database connection
   npm run test:e2e -- --testPathPattern=setup
   ```

2. **MCP Protocol Issues**

   ```bash
   # Check MCP server build
   npm run build:security

   # Verify MCP server startup
   node dist/mcp/server.js
   ```

3. **Authentication Failures**

   ```bash
   # Check API key configuration
   echo $KANBAN_API_KEYS

   # Verify test environment setup
   npm run test:e2e -- --testPathPattern=auth
   ```

### Test Debugging

```typescript
// Enable debug output in tests
process.env.DEBUG = 'test:*';

// Add custom logging
console.log('Test state:', JSON.stringify(testState, null, 2));

// Capture network traffic
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: API E2E Tests

on: [push, pull_request]

jobs:
  api-tests:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: |
          npm run build:security
          npm run build

      - name: Run HTTP API tests
        run: npm run test:http-api
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/kanban_test
          KANBAN_API_KEYS: test-key-ci

      - name: Run MCP API tests
        run: npm run test:mcp-api

      - name: Upload test results
        uses: actions/upload-artifact@v2
        with:
          name: api-test-results
          path: coverage/e2e/
```

### Test Reporting

- JUnit XML output for CI integration
- Coverage reports for code quality
- Performance metrics tracking
- Security scan results
- Error logs and debugging info

## 📋 Test Checklist

### Pre-Test Setup

- [ ] Security components built (`npm run build:security`)
- [ ] Database initialized and migrated
- [ ] API keys configured for testing
- [ ] Network ports available (3000, 3001)
- [ ] Test data directory permissions set

### HTTP API Test Validation

- [ ] All CRUD operations tested
- [ ] Authentication flows validated
- [ ] Input sanitization verified
- [ ] Error handling confirmed
- [ ] Performance targets met
- [ ] Security scans passed

### MCP API Test Validation

- [ ] Protocol compliance verified
- [ ] Tool execution tested
- [ ] Resource access validated
- [ ] Prompt generation confirmed
- [ ] Error handling verified
- [ ] Security input filtering tested

### Security Test Coverage

- [ ] XSS prevention validated
- [ ] SQL injection blocked
- [ ] Command injection prevented
- [ ] Path traversal blocked
- [ ] Rate limiting functional
- [ ] Error message sanitization

## 🔮 Future Enhancements

### Planned Test Additions

1. **Load Testing with Artillery**
   - Realistic traffic simulation
   - Performance regression detection
   - Scalability validation

2. **Contract Testing**
   - API schema validation
   - MCP protocol compliance
   - Version compatibility testing

3. **Security Penetration Testing**
   - Automated vulnerability scanning
   - OWASP compliance validation
   - Security regression prevention

4. **Multi-Environment Testing**
   - Development, staging, production
   - Cross-platform compatibility
   - Cloud deployment validation

### Test Automation Improvements

- Dynamic test data generation
- AI-powered test case creation
- Real-time monitoring integration
- Performance benchmark tracking

## 📚 Resources

### API Testing Best Practices

- [REST API Testing Guide](https://github.com/microsoft/api-guidelines)
- [Security Testing Guidelines](https://owasp.org/www-project-web-security-testing-guide/)
- [Performance Testing Patterns](https://martinfowler.com/articles/practical-test-pyramid.html)

### MCP Protocol Resources

- [Model Context Protocol Specification](https://github.com/modelcontextprotocol/protocol)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [MCP Implementation Guide](https://docs.anthropic.com/en/api/mcp)

---

**Ready to test APIs? Run:** `npm run test:apis`

For comprehensive testing including CLI: `npm run test:all`
