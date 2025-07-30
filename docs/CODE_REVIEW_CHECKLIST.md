# Code Review Checklist

## Overview
This document establishes systematic code review standards and processes for the MCP Kanban project to ensure code quality, security, and maintainability.

## Priority Levels

### 🚨 P0 Critical (Security & Architecture)
- [ ] Authentication and authorization mechanisms
- [ ] Cryptographic implementations
- [ ] Input validation and sanitization
- [ ] Error handling that might leak sensitive information
- [ ] Database query security (SQL injection prevention)

### 🔴 P1 High (Code Quality & Maintainability)
- [ ] File size and single responsibility principle adherence
- [ ] Function complexity and length
- [ ] Error handling patterns consistency
- [ ] Logging standards compliance
- [ ] Performance considerations

### 🟡 P2 Medium (Technical Debt)
- [ ] TODO/FIXME marker resolution
- [ ] Code documentation completeness
- [ ] Type safety improvements
- [ ] Unused imports and dead code removal

### 🟢 P3 Low (Style & Optimization)
- [ ] ESLint rule compliance
- [ ] Code formatting consistency
- [ ] Variable naming conventions
- [ ] Comment quality and relevance

## Security Review Checklist

### Authentication & Authorization
- [ ] API key validation is secure and consistent
- [ ] User permissions are properly validated
- [ ] No hardcoded credentials or secrets
- [ ] Rate limiting is implemented where appropriate

### Data Protection
- [ ] Sensitive data is properly encrypted
- [ ] Database queries use parameterized statements
- [ ] File operations validate paths and permissions
- [ ] Network requests validate SSL/TLS configuration

### Error Handling
- [ ] Error messages don't expose sensitive information
- [ ] Errors are logged securely without revealing internal structure
- [ ] Input validation failures are handled gracefully

## Code Quality Standards

### Function Guidelines
- [ ] Functions should be < 50 lines when possible
- [ ] Single responsibility principle is followed
- [ ] Cyclomatic complexity is reasonable (< 10)
- [ ] Parameters are validated appropriately

### File Organization
- [ ] Files should be < 500 lines when possible
- [ ] Related functionality is grouped logically
- [ ] Imports are organized and necessary
- [ ] Exports follow consistent patterns

### Error Handling
- [ ] All async operations have proper error handling
- [ ] Errors are logged with appropriate context
- [ ] Error types are meaningful and specific
- [ ] Recovery strategies are implemented where possible

## Review Process

### Pre-Review Checklist
- [ ] All tests pass
- [ ] Linting rules are satisfied
- [ ] TypeScript compilation succeeds
- [ ] No debug code or console.log statements remain

### Review Focus Areas

#### For New Features
- [ ] Feature is properly tested
- [ ] Documentation is updated
- [ ] API contracts are maintained
- [ ] Performance impact is considered

#### For Bug Fixes
- [ ] Root cause is identified and addressed
- [ ] Fix doesn't introduce new issues
- [ ] Edge cases are considered
- [ ] Regression tests are added

#### For Refactoring
- [ ] Behavior is preserved
- [ ] Performance is maintained or improved
- [ ] Dependencies are updated appropriately
- [ ] Migration path is considered

## Critical Files Requiring Enhanced Review

### High-Risk Security Files
1. `src/middleware/auth.ts` - Authentication logic
2. `src/services/BackupEncryption.ts` - Cryptographic operations
3. `src/database/connection.ts` - Database access patterns
4. `src/routes/*.ts` - API endpoint security

### Large Complex Files (>1000 lines)
1. `src/services/TaskService.ts` (2,788 lines)
2. `src/mcp/tools.ts` (2,304 lines)
3. `src/services/BackupService.ts` (2,186 lines)
4. `src/routes/tasks.ts` (1,800+ lines)

### Files with High Technical Debt
1. Files with multiple TODO/FIXME markers
2. Files with ESLint suppressions
3. Files mixing console.log with proper logging
4. Files with complex nested async patterns

## Automated Review Tools

### Required Checks
- [ ] ESLint analysis
- [ ] TypeScript type checking
- [ ] Jest test suite execution
- [ ] Security vulnerability scanning

### Recommended Tools
- [ ] SonarQube for code quality metrics
- [ ] CodeClimate for maintainability scores
- [ ] npm audit for dependency vulnerabilities
- [ ] Prettier for consistent formatting

## Review Standards by File Type

### Service Files (`src/services/*.ts`)
- [ ] Dependency injection patterns are consistent
- [ ] Database operations are properly abstracted
- [ ] Business logic is separated from data access
- [ ] Error boundaries are well-defined

### Route Files (`src/routes/*.ts`)
- [ ] Input validation is comprehensive
- [ ] Response schemas are consistent
- [ ] Authentication is properly enforced
- [ ] Rate limiting is appropriate

### Utility Files (`src/utils/*.ts`)
- [ ] Functions are pure when possible
- [ ] Edge cases are handled
- [ ] Performance is optimized
- [ ] Reusability is maximized

### Test Files (`tests/**/*.ts`)
- [ ] Coverage is comprehensive
- [ ] Edge cases are tested
- [ ] Mocking is appropriate
- [ ] Test data is realistic

## Documentation Requirements

### Code Comments
- [ ] Complex business logic is explained
- [ ] API contracts are documented
- [ ] Security considerations are noted
- [ ] Performance implications are described

### README Updates
- [ ] Setup instructions are current
- [ ] API documentation is complete
- [ ] Configuration options are documented
- [ ] Troubleshooting guides are helpful

## Post-Review Actions

### Immediate
- [ ] Critical security issues are addressed
- [ ] Blocking bugs are resolved
- [ ] Performance regressions are fixed

### Short-term
- [ ] Technical debt items are scheduled
- [ ] Documentation gaps are filled
- [ ] Code quality metrics are improved

### Long-term
- [ ] Architecture improvements are planned
- [ ] Tool integration is enhanced
- [ ] Process refinements are implemented

## Review Sign-off

### Reviewer Responsibilities
- [ ] Security implications are assessed
- [ ] Code quality standards are enforced
- [ ] Documentation is adequate
- [ ] Testing is comprehensive

### Author Responsibilities
- [ ] All feedback is addressed
- [ ] Tests are updated as needed
- [ ] Documentation is maintained
- [ ] Rollback plan is considered

---

**Last Updated**: 2025-07-28
**Version**: 1.0
**Owner**: Development Team