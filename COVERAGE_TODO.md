`/\*\*

- @fileoverview Test coverage improvement tracking for MCP Kanban
- @lastmodified 2025-07-27T23:45:19Z
-
- Features: Track files with <80% test coverage and improvement plans
- Main APIs: Coverage analysis, test implementation tracking
- Constraints: Based on Jest coverage reports, prioritized by importance
- Patterns: High-priority files first, systematic test improvement
  \*/

# Test Coverage Improvement TODO

This document tracks all files with less than 80% test coverage and provides implementation plans.

## Summary

- **Total files analyzed**: ~150+ source files
- **Files needing coverage**: 85+ files with <80% coverage
- **Current overall coverage**: ~25-30% (estimated)
- **Target coverage**: 80% minimum per file

## High Priority Files (0-20% Coverage)

### Core Services

- [ ] **src/services/NotificationService.ts** (0% coverage)
  - Need tests for: notification delivery, preferences, channels
  - Priority: HIGH - Core functionality

- [ ] **src/services/RealtimeService.ts** (0% coverage)
  - Need tests for: websocket connections, event broadcasting
  - Priority: HIGH - Real-time features

- [ ] **src/services/SecurityService.ts** (0% coverage)
  - Need tests for: authentication, authorization, security validations
  - Priority: CRITICAL - Security implications

### CLI Commands

- [ ] **src/cli/commands/backup.ts** (0% coverage)
  - Need tests for: backup creation, restoration, validation

- [ ] **src/cli/commands/config.ts** (0% coverage)
  - Need tests for: config management, validation, persistence

- [ ] **src/cli/commands/environment.ts** (0% coverage)
  - Need tests for: environment setup, validation

- [ ] **src/cli/commands/interactive-view.tsx** (0% coverage)
  - Need tests for: React component rendering, user interactions

- [ ] **src/cli/commands/notes.ts** (0% coverage)
  - Need tests for: note operations, CRUD functionality

### WebSocket System

- [ ] **src/websocket/auth.ts** (0% coverage)
  - Need tests for: websocket authentication, token validation

- [ ] **src/websocket/handlers.ts** (0% coverage)
  - Need tests for: message handling, event processing

- [ ] **src/websocket/server.ts** (0% coverage)
  - Need tests for: server setup, connection management

- [ ] **src/websocket/subscriptions.ts** (0% coverage)
  - Need tests for: subscription management, event routing

### Route Handlers

- [ ] **src/routes/priorities.ts** (0% coverage)
  - Need tests for: priority CRUD operations, validation

## Medium Priority Files (20-50% Coverage)

### MCP Tools

- [ ] **src/mcp/tools.ts** (9.25% coverage)
  - Current: Basic tool registration tested
  - Need: Tool execution, validation, error handling

- [ ] **src/mcp/server.ts** (20.95% coverage)
  - Current: Basic server setup tested
  - Need: Protocol compliance, message handling

### Utilities

- [ ] **src/utils/zod-helpers.ts** (9.37% coverage)
  - Current: Basic schema validation
  - Need: Complex validation scenarios, error cases

- [ ] **src/utils/typeGuards.ts** (7.59% coverage)
  - Current: Basic type checking
  - Need: Edge cases, complex type validation

- [ ] **src/websocket/rateLimit.ts** (23.4% coverage)
  - Current: Basic rate limiting
  - Need: Rate limit scenarios, error handling

### Services with Low Coverage

- [ ] **src/services/BackupService.ts** (31.14% coverage)
  - Current: Basic backup operations
  - Need: Error scenarios, validation, restoration

- [ ] **src/services/TaskHistoryService.ts** (24.13% coverage)
  - Current: Basic history tracking
  - Need: Complex queries, data integrity

## Medium-High Priority Files (50-80% Coverage)

### Database Layer

- [ ] **src/database/integrity.ts** (67.7% coverage)
  - Current: Basic integrity checks
  - Need: Edge cases, corruption scenarios

- [ ] **src/services/TaskService.ts** (69.98% coverage)
  - Current: Core CRUD operations
  - Need: Complex queries, edge cases

- [ ] **src/websocket/server.ts** (69.13% coverage)
  - Current: Basic server functionality
  - Need: Error handling, edge cases

### Route Systems

- [ ] **src/routes/tasks.ts** (71.18% coverage)
  - Current: Basic task endpoints
  - Need: Error scenarios, validation

- [ ] **src/routes/performance.ts** (64.47% coverage)
  - Current: Basic performance monitoring
  - Need: Load scenarios, metrics validation

## Files with Zero Coverage (Critical)

### Type Definitions & Improvements

- [ ] **src/types/typeImprovements.ts** (0% coverage)
- [ ] **src/utils/command-injection-prevention.ts** (0% coverage)
- [ ] **src/cli/ui/themes/dashboard-themes.ts** (0% coverage)

## Implementation Strategy

### Phase 1: Security & Core Services (Week 1)

1. SecurityService.ts - Authentication/authorization tests
2. WebSocket auth & handlers - Real-time security
3. Command injection prevention - Security validations

### Phase 2: Core Business Logic (Week 2)

1. NotificationService.ts - Core feature tests
2. RealtimeService.ts - Event system tests
3. TaskService.ts - Complete CRUD coverage

### Phase 3: CLI & User Interface (Week 3)

1. CLI commands (backup, config, environment)
2. Interactive view components
3. Dashboard themes

### Phase 4: Integration & Edge Cases (Week 4)

1. MCP protocol compliance
2. WebSocket connection management
3. Database integrity scenarios

## Test Patterns to Follow

### Service Tests

```typescript
describe('ServiceName', () => {
  beforeEach(() => {
    // Setup test data
  });

  describe('methodName', () => {
    it('should handle success case', () => {});
    it('should handle validation errors', () => {});
    it('should handle database errors', () => {});
  });
});
```

### CLI Tests

```typescript
describe('CLI Command', () => {
  it('should execute with valid inputs', () => {});
  it('should validate required parameters', () => {});
  it('should handle file system errors', () => {});
});
```

### WebSocket Tests

```typescript
describe('WebSocket Handler', () => {
  it('should handle valid messages', () => {});
  it('should reject invalid authentication', () => {});
  it('should handle connection errors', () => {});
});
```

## Coverage Goals

- **Critical files**: 95%+ coverage (Security, Core services)
- **Important files**: 90%+ coverage (Business logic, APIs)
- **Standard files**: 80%+ coverage (All other files)
- **Utility files**: 85%+ coverage (Shared utilities)

## Next Steps

1. Start with SecurityService.ts (highest priority)
2. Implement WebSocket authentication tests
3. Add MCP protocol compliance tests
4. Create CLI command test suites
5. Build comprehensive service test coverage

---

**Last Updated**: 2025-07-27T23:45:19Z
**Coverage Analysis Based On**: Jest coverage report from unit tests
**Total Estimated Work**: ~4-6 weeks for complete coverage improvement
