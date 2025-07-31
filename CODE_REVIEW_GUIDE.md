# Code Review Guide

## Overview

This document establishes comprehensive code review standards and processes for the MCP Kanban Server project to ensure code quality, security, and maintainability.

## Review Process

### 1. Automated Pre-Review

All pull requests trigger automated checks:

- **TypeScript Compilation**: Must pass without errors
- **ESLint Analysis**: Zero errors required, warnings should be addressed
- **Test Suite**: All tests must pass with adequate coverage
- **Security Audit**: No high/critical vulnerabilities
- **Function Length Analysis**: Functions should be ≤50 lines
- **Bundle Size Check**: Monitor for significant size increases

### 2. Manual Review Requirements

Manual review is **required** for:

- Changes to critical files (`src/database/`, `src/services/`, `src/middleware/auth/`, `src/mcp/`)
- Large PRs (>500 lines changed)
- Breaking changes (marked with `BREAKING CHANGE` or `!` in title)
- Security-related modifications
- Performance-critical changes
- New dependencies or major version updates

### 3. Review Priorities

- **High**: Security fixes, critical bugs, breaking changes
- **Medium**: New features, performance improvements, refactoring
- **Low**: Documentation, minor fixes, cosmetic changes

## Review Checklist

### Code Quality

- [ ] **Readability**: Code is self-documenting with clear naming
- [ ] **Single Responsibility**: Functions/classes have focused purpose
- [ ] **DRY Principle**: No unnecessary code duplication
- [ ] **Error Handling**: Comprehensive error handling with proper logging
- [ ] **Type Safety**: Proper TypeScript usage, no `any` types
- [ ] **Function Length**: Functions ≤50 lines (use analysis tool)
- [ ] **Complexity**: Avoid deeply nested logic, prefer early returns

### Architecture & Design

- [ ] **Separation of Concerns**: Clear boundaries between layers
- [ ] **Dependency Direction**: Dependencies flow toward stable abstractions
- [ ] **API Design**: RESTful conventions, consistent error responses
- [ ] **Database**: Proper transactions, migrations, and constraints
- [ ] **Configuration**: Environment-specific settings handled correctly

### Security

- [ ] **Input Validation**: All user inputs validated and sanitized
- [ ] **Authentication**: Proper permission checks and token handling
- [ ] **SQL Injection**: Parameterized queries, no string concatenation
- [ ] **XSS Prevention**: Output encoding where applicable
- [ ] **Secrets**: No hardcoded credentials or sensitive data
- [ ] **Dependencies**: No known vulnerabilities in new/updated packages

### Performance

- [ ] **Database Queries**: Efficient queries with proper indexes
- [ ] **N+1 Problems**: Avoided with proper eager loading or batching
- [ ] **Memory Usage**: No obvious memory leaks or excessive allocation
- [ ] **Caching**: Appropriate use of caching where beneficial
- [ ] **Bundle Size**: No unnecessary dependencies or imports

### Testing

- [ ] **Unit Tests**: New functionality has unit test coverage
- [ ] **Integration Tests**: API endpoints tested end-to-end
- [ ] **Edge Cases**: Error conditions and boundary cases tested
- [ ] **Test Quality**: Tests are clear, focused, and maintainable
- [ ] **Coverage**: Maintains or improves overall test coverage

### Documentation

- [ ] **Code Comments**: Complex logic explained with comments
- [ ] **API Documentation**: Public APIs documented with JSDoc
- [ ] **README Updates**: Documentation updated for new features
- [ ] **Migration Guide**: Breaking changes documented with migration steps

## Review Workflow

### For Authors

1. **Pre-Submit Checklist**:
   - Run `npm test` (all tests pass)
   - Run `npm run lint` (no errors)
   - Run `node fix-function-length.js` (check function lengths)
   - Test manually in development environment

2. **PR Creation**:
   - Use the PR template completely
   - Write clear, descriptive title and summary
   - Link related issues
   - Mark breaking changes clearly
   - Include screenshots for UI changes

3. **Responding to Reviews**:
   - Address all feedback promptly
   - Ask for clarification when needed
   - Re-request review after significant changes
   - Thank reviewers for their time

### For Reviewers

1. **Review Timeline**:
   - **High Priority**: Within 4 hours
   - **Medium Priority**: Within 24 hours
   - **Low Priority**: Within 48 hours

2. **Review Depth**:
   - **Small PRs (<100 lines)**: Line-by-line review
   - **Medium PRs (100-500 lines)**: Focus on logic and architecture
   - **Large PRs (>500 lines)**: High-level architecture review, request breakdown

3. **Feedback Style**:
   - Be constructive and specific
   - Explain the "why" behind suggestions
   - Distinguish between must-fix and suggestions
   - Recognize good code and improvements

## Review Tools & Automation

### Automated Checks

- **GitHub Actions**: Automated code review workflow
- **ESLint**: Code style and quality enforcement
- **TypeScript**: Type safety validation
- **Jest**: Test execution and coverage
- **npm audit**: Security vulnerability scanning
- **Function Length Analyzer**: Custom tool for complexity analysis

### Manual Review Tools

- **GitHub PR Interface**: Code diff review
- **Branch Protection**: Require reviews before merge
- **CODEOWNERS**: Automatic reviewer assignment
- **Draft PRs**: Work-in-progress collaboration

## Common Issues & Solutions

### Frequent Problems

1. **Long Functions**: Use refactoring tool, extract helper functions
2. **Missing Error Handling**: Add try-catch blocks, proper logging
3. **Type Safety**: Replace `any` with proper types
4. **Inconsistent Patterns**: Follow established conventions
5. **Missing Tests**: Add unit tests for new functionality

### Quality Gates

- **Zero ESLint Errors**: Required for merge
- **All Tests Passing**: Required for merge
- **Manual Review Approval**: Required for critical changes
- **No High/Critical Security Issues**: Required for merge
- **TypeScript Compilation**: Must succeed without errors

## Metrics & Improvement

### Tracked Metrics

- Review turnaround time
- Defect escape rate
- Function length violations
- Test coverage trends
- Security vulnerability count

### Continuous Improvement

- Monthly review process retrospectives
- Update guidelines based on common issues
- Tool improvements and automation enhancements
- Training on new patterns and practices

## Examples

### Good Review Comments

```
// Constructive feedback
"Consider extracting this validation logic into a separate function
for reusability. This pattern is used in TaskService.validateInput()."

// Security concern
"This endpoint needs authentication - missing requirePermission middleware."

// Performance suggestion
"This could cause N+1 queries. Consider using eager loading or batching."
```

### PR Approval Criteria

✅ **Ready to Merge**:

- All automated checks pass
- Manual review approved
- No outstanding conversations
- Documentation updated
- Tests added for new functionality

❌ **Not Ready**:

- Failing tests or compilation
- Unresolved security issues
- Missing required reviews
- Outstanding reviewer feedback

## Conclusion

Effective code reviews are essential for maintaining code quality, sharing knowledge, and preventing defects. This process balances thorough review with development velocity through automation and clear guidelines.

Regular adherence to these standards will result in:

- Higher code quality and maintainability
- Reduced bugs and security vulnerabilities
- Better team knowledge sharing
- More consistent codebase patterns
- Improved developer productivity
