# TypeScript TODO List

## Immediate Actions

### 1. Resolve Final 3 TypeScript Errors
- [ ] Decide on approach for `exactOptionalPropertyTypes` issue
  - Option A: Disable `exactOptionalPropertyTypes` in tsconfig.json
  - Option B: Implement custom Zod transforms for optional properties
  - Option C: Use type assertions at call sites
- [ ] Apply chosen solution to:
  - `src/routes/tags.ts:55` - CreateTagRequest color property
  - `src/routes/tags.ts:155` - UpdateTagRequest name property
  - `src/routes/tasks.ts:118` - UpdateTaskRequest title property

## Short-term Tasks (1-2 weeks)

### 2. Zod Schema Migration
- [ ] Create utility function for Zod schemas that properly handles optional properties
- [ ] Migrate all validation schemas to use the new pattern
- [ ] Test that validation still works correctly with the new approach

### 3. CI/CD Integration
- [ ] Add `npm run typecheck` to the build pipeline
- [ ] Set up pre-commit hooks to run type checking
- [ ] Configure GitHub Actions or similar to run type checks on PRs

### 4. Documentation
- [ ] Document the type patterns used in the codebase
- [ ] Create a TypeScript style guide for the project
- [ ] Add JSDoc comments to complex type definitions
- [ ] Document the rationale for type decisions made during cleanup

## Long-term Tasks (1-3 months)

### 5. Gradual TypeScript Strictness
- [ ] Plan migration to re-enable `exactOptionalPropertyTypes`
- [ ] Consider enabling additional strict flags:
  - [ ] `noImplicitAny`
  - [ ] `strictNullChecks` 
  - [ ] `strictFunctionTypes`
  - [ ] `strictBindCallApply`
- [ ] Address any new errors that arise from stricter settings

### 6. Type Coverage Improvements
- [ ] Audit remaining uses of `any` type
- [ ] Replace type assertions with proper type guards where possible
- [ ] Add explicit return types to all functions
- [ ] Implement branded types for IDs (TaskId, BoardId, etc.)

### 7. Performance Optimization
- [ ] Run `tsc --generateTrace` to identify slow type checking
- [ ] Consider using TypeScript Project References if compilation is slow
- [ ] Optimize complex type definitions that may be causing performance issues

### 8. Third-party Type Definitions
- [ ] Audit all @types packages for updates
- [ ] Create ambient type declarations for any untyped dependencies
- [ ] Consider contributing type definitions back to DefinitelyTyped

## Technical Debt Items

### 9. JWT Library
- [ ] Update jsonwebtoken to latest version for better TypeScript support
- [ ] Or consider migrating to a more TypeScript-friendly JWT library

### 10. Database Type Safety
- [ ] Consider using a query builder with better TypeScript support (e.g., Kysely)
- [ ] Add runtime validation for database query results
- [ ] Create type-safe database migration system

### 11. Validation Layer
- [ ] Evaluate alternatives to Zod that work better with strict TypeScript
- [ ] Or create wrapper functions that handle the exactOptionalPropertyTypes issue
- [ ] Ensure validation errors are properly typed throughout the app

## Future Considerations

### 12. Advanced Type Patterns
- [ ] Implement discriminated unions for better type narrowing
- [ ] Use template literal types for API routes
- [ ] Add const assertions where appropriate
- [ ] Consider using opaque types for sensitive data

### 13. Developer Experience
- [ ] Set up better TypeScript error messages with `@typescript-eslint`
- [ ] Configure VS Code settings for optimal TypeScript development
- [ ] Create code snippets for common type patterns
- [ ] Add type checking to watch mode for faster feedback

### 14. Testing
- [ ] Add type tests using `tsd` or similar
- [ ] Ensure test files are properly typed
- [ ] Add tests for type guards and type predicates
- [ ] Test that API contracts match TypeScript types

## Notes

- Current state: 105/108 errors fixed (97% reduction)
- Main blocker: Zod + exactOptionalPropertyTypes incompatibility
- Consider team discussion on strictness vs. development velocity trade-offs
- Regular type audits recommended to prevent regression