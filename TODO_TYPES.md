# TODO: Type Improvements

## Any Type Usage to Fix

### dashboard-manager.ts

1. **Line 698**: `(widget as any).destroy()`
   - **Reason**: blessed-contrib widgets don't have proper type definitions
   - **Proper type**: Should be a union of all possible widget types with destroy method
   - **Priority**: Low - works correctly, just missing types

2. **Lines 803, 826**: `(widget as any).focus()`
   - **Reason**: Widget focus method not in type definitions
   - **Proper type**: Interface with optional focus() method
   - **Priority**: Low

### integrity.ts

1. **Lines 129-130**: Helper method returns unknown cast
   - **Reason**: Database query results are untyped
   - **Proper type**: Generic query result type `QueryResult<T>`
   - **Priority**: Medium - affects many locations

## Type Assertions to Remove

### General Database Queries

- **Pattern**: `result[0] as { count: number }`
- **Files**: All database service files
- **Solution**: Add generic typing to database.query() method
- **Example**:

  ```typescript
  // Current
  const result = await db.query('SELECT COUNT(*) as count FROM tasks');
  const count = (result[0] as { count: number }).count;

  // Should be
  const result = await db.query<{ count: number }>('SELECT COUNT(*) as count FROM tasks');
  const count = result[0].count;
  ```

### Third-Party Library Types

1. **blessed-contrib**
   - Missing proper TypeScript definitions
   - Consider creating @types/blessed-contrib
   - Or create local type definitions file

2. **blessed**
   - Some properties like screen.width not properly typed
   - May need to extend existing types

## Complex Type Patterns to Simplify

### Union Types

- Many places use complex union types that could be simplified with type aliases
- Example: `string | number | undefined | null` could be `Nullable<string | number>`

### Callback Types

- Many callback functions typed as `(error: any) => void`
- Should use proper error types and Result pattern

## Next Steps

1. **Create type utilities file** with common patterns:
   - `Nullable<T> = T | null | undefined`
   - `QueryResult<T> = T[]`
   - `CountResult = { count: number }`

2. **Extend third-party types**:
   - Create `types/blessed-contrib.d.ts`
   - Add missing method definitions

3. **Database typing improvements**:
   - Make query methods generic
   - Add result type inference

4. **Progressive typing**:
   - Start with most used files
   - Add types incrementally
   - Run type coverage reports
