# Code Quality & Readability Improvement TODO

**Created:** 2025-07-28  
**Source:** Comprehensive code readability review  
**Goal:** Transform codebase from B+ to A-grade maintainability  
**Estimated Total Effort:** 3-4 weeks (phased approach)

---

## 🎯 **PROJECT OVERVIEW**

This TODO list addresses critical code readability and maintainability issues identified in the MCP Kanban project. While the project demonstrates excellent architecture and comprehensive documentation, several patterns are impacting developer experience and long-term maintainability.

**Current Grade:** B+ → **Target Grade:** A  
**Focus Areas:** Function complexity, error handling consistency, code clarity, maintainability

---

## 📊 **QUALITY METRICS BASELINE**

- **Large Functions (300+ lines):** 8 files identified
- **Console Statements in Production:** 8 occurrences
- **Magic Numbers/Strings:** 15+ instances
- **Inconsistent Error Patterns:** 3 different approaches
- **ESLint Warnings:** ~50 remaining (non-critical)

---

# 🔴 **PHASE 1: CRITICAL ISSUES (WEEK 1)**

## **CRIT-01: Extract Magic Numbers and Strings**

**Priority:** P0 | **Effort:** 4 hours | **Impact:** High

### **Problem**

Magic numbers and strings scattered throughout codebase reduce maintainability and create bugs when values need to change.

### **Examples Found**

```typescript
// src/cli/commands/dashboard.ts
refreshInterval: parseInt(options.refresh ?? '30', 10) * 1000,

// src/cli/commands/tasks.ts
const priorityMap = { P1: 10, P2: 8, P3: 5, P4: 3, P5: 1 };

// Various files
maxRetries: 3
defaultPort: 3000
maxFileSize: 1024 * 1024
```

### **Solution**

Create centralized constants file with organized categories.

### **Implementation Steps**

1. Create `src/constants/index.ts` with the following structure:

```typescript
export const PRIORITY_MAPPING = {
  P1: 10,
  P2: 8,
  P3: 5,
  P4: 3,
  P5: 1,
} as const;

export const TIMING = {
  DEFAULT_REFRESH_INTERVAL: 30 * 1000,
  MAX_RETRY_ATTEMPTS: 3,
  REQUEST_TIMEOUT: 5000,
} as const;

export const LIMITS = {
  MAX_FILE_SIZE: 1024 * 1024,
  MAX_TITLE_LENGTH: 255,
  MAX_DESCRIPTION_LENGTH: 2000,
} as const;

export const DEFAULTS = {
  PORT: 3000,
  HOST: 'localhost',
  PAGE_SIZE: 25,
} as const;
```

2. Search and replace all magic numbers/strings with constants
3. Update imports in affected files
4. Add JSDoc comments explaining the values

### **Files to Modify**

- Create: `src/constants/index.ts`
- Update: `src/cli/commands/dashboard.ts`, `src/cli/commands/tasks.ts`, `src/services/*.ts`

### **Testing**

- Verify all functionality remains unchanged
- Run existing tests to ensure no regressions
- Add unit tests for constants if needed

---

## **CRIT-02: Standardize Error Handling**

**Priority:** P0 | **Effort:** 6 hours | **Impact:** High

### **Problem**

Three different error handling patterns create inconsistency and make debugging difficult.

### **Current Patterns**

```typescript
// Pattern 1: Verbose instanceof checking
formatter.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

// Pattern 2: Console usage (incorrect for production)
console.error(chalk.red('Failed:'), error instanceof Error ? error.message : 'Unknown error');

// Pattern 3: Custom error creation (good but inconsistent)
throw TaskService.createError('INVALID_TITLE', 'Task title is required');
```

### **Solution**

Create unified error handling utilities and establish consistent patterns.

### **Implementation Steps**

1. Create `src/utils/error-handler.ts`:

```typescript
import { logger } from './logger';
import type { OutputFormatter } from '../cli/formatter';

export interface ErrorContext {
  operation: string;
  details?: Record<string, unknown>;
  exitCode?: number;
}

export const handleCommandError = (
  formatter: OutputFormatter,
  context: ErrorContext,
  error: unknown
): never => {
  const message = error instanceof Error ? error.message : 'Unknown error';

  // Structured logging
  logger.error(`Failed to ${context.operation}`, {
    error: message,
    details: context.details,
  });

  // User-friendly output
  formatter.error(`Failed to ${context.operation}: ${message}`);

  process.exit(context.exitCode ?? 1);
};

export const logAndThrow = (message: string, details?: Record<string, unknown>): never => {
  logger.error(message, details);
  throw new Error(message);
};
```

2. Update all CLI commands to use standardized error handling
3. Replace all console.error statements with structured logging
4. Create error handling guidelines in documentation

### **Files to Modify**

- Create: `src/utils/error-handler.ts`
- Update: All files in `src/cli/commands/`
- Update: `src/services/*.ts` for consistent error throwing

### **Testing**

- Test error scenarios in CLI commands
- Verify logging output format
- Ensure error messages are user-friendly

---

## **CRIT-03: Break Down Largest Function (tasks.ts)**

**Priority:** P0 | **Effort:** 8 hours | **Impact:** Very High

### **Problem**

`registerTaskCommands` function in `src/cli/commands/tasks.ts` is 500+ lines, making it difficult to understand, test, and maintain.

### **Current Structure**

```typescript
export function registerTaskCommands(program: Command): void {
  // 500+ lines with multiple nested command definitions
  // Complex logic mixed with command registration
  // Difficult to test individual command handlers
}
```

### **Solution**

Extract each command into its own focused function with clear responsibilities.

### **Implementation Steps**

1. Create individual command registration functions:

```typescript
// New structure:
export function registerTaskCommands(program: Command): void {
  const taskCmd = program.command('task').alias('t').description('Task management');

  registerListCommand(taskCmd);
  registerCreateCommand(taskCmd);
  registerUpdateCommand(taskCmd);
  registerDeleteCommand(taskCmd);
  registerSelectCommand(taskCmd);
  registerMoveCommand(taskCmd);
  registerPriorityCommand(taskCmd);
}

function registerListCommand(taskCmd: Command): void {
  taskCmd
    .command('list')
    .description('List tasks')
    .option('-b, --board <board>', 'Filter by board')
    .option('-s, --status <status>', 'Filter by status')
    .action(async (options: ListTaskOptions) => {
      await handleListTasks(options);
    });
}

async function handleListTasks(options: ListTaskOptions): Promise<void> {
  // Focused implementation for list functionality only
}
```

2. Extract common utilities:

```typescript
// src/cli/commands/tasks/utils.ts
export const getTasksApiClient = () => {
  // Common API client setup
};

export const formatTaskOutput = (tasks: Task[], formatter: OutputFormatter) => {
  // Common formatting logic
};

export const validateTaskInput = (input: CreateTaskRequest) => {
  // Input validation
};
```

3. Move complex command handlers to separate files:

```
src/cli/commands/tasks/
├── index.ts           # Main registration
├── list.ts           # List command handler
├── create.ts         # Create command handler
├── update.ts         # Update command handler
├── select.ts         # Select command handler
└── utils.ts          # Shared utilities
```

### **Files to Modify**

- Refactor: `src/cli/commands/tasks.ts` → `src/cli/commands/tasks/index.ts`
- Create: `src/cli/commands/tasks/list.ts`, `create.ts`, `update.ts`, etc.
- Create: `src/cli/commands/tasks/utils.ts`

### **Testing**

- Create unit tests for each command handler
- Test command registration works correctly
- Verify all existing functionality is preserved

---

## **CRIT-04: Replace Console Statements with Structured Logging**

**Priority:** P0 | **Effort:** 3 hours | **Impact:** Medium

### **Problem**

8 console statements found in production code, primarily in `dashboard.ts`. These bypass logging infrastructure and don't support log levels or structured output.

### **Current Usage**

```typescript
// src/cli/commands/dashboard.ts
console.log(chalk.cyan('🎨 Available Dashboard Themes:'));
console.error(chalk.red(`Invalid theme: ${options.theme}`));
```

### **Solution**

Replace all console statements with appropriate logger calls and formatter output.

### **Implementation Steps**

1. Identify all console statements:

```bash
grep -r "console\." src/ --include="*.ts"
```

2. Replace with appropriate alternatives:

```typescript
// Before
console.log(chalk.cyan('🎨 Available Dashboard Themes:'));

// After
formatter.info('🎨 Available Dashboard Themes:');

// Before
console.error(chalk.red(`Invalid theme: ${options.theme}`));

// After
logger.error('Invalid theme provided', { theme: options.theme });
formatter.error(`Invalid theme: ${options.theme}`);
```

3. Add ESLint rule to prevent future console usage:

```json
// .eslintrc.json
{
  "rules": {
    "no-console": "error"
  }
}
```

### **Files to Modify**

- Update: `src/cli/commands/dashboard.ts`
- Update: Any other files with console statements
- Update: `.eslintrc.json`

### **Testing**

- Verify output formatting is preserved
- Test that error messages still display correctly
- Run ESLint to ensure no console statements remain

---

# ⚠️ **PHASE 2: SIGNIFICANT ISSUES (WEEK 2)**

## **SIG-01: Simplify Complex Conditional Logic**

**Priority:** P1 | **Effort:** 5 hours | **Impact:** High

### **Problem**

Complex boolean conditions reduce readability and increase bug risk.

### **Example**

```typescript
// Hard to read and understand
if (
  !tasks ||
  !('data' in tasks) ||
  !tasks.data ||
  (Array.isArray(tasks.data) && tasks.data.length === 0)
) {
  formatter.info('No tasks found');
  return;
}
```

### **Solution**

Create type guards and helper functions for complex conditions.

### **Implementation Steps**

1. Create type guards in `src/utils/type-guards.ts`:

```typescript
export const hasValidTaskData = (response: unknown): response is { data: Task[] } => {
  return (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    Array.isArray(response.data) &&
    response.data.length > 0
  );
};

export const hasValidBoardData = (response: unknown): response is { data: Board[] } => {
  return (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    Array.isArray(response.data) &&
    response.data.length > 0
  );
};
```

2. Replace complex conditions:

```typescript
// After
if (!hasValidTaskData(tasks)) {
  formatter.info('No tasks found');
  return;
}
```

### **Files to Modify**

- Create: `src/utils/type-guards.ts`
- Update: `src/cli/commands/tasks.ts`, `src/cli/commands/boards.ts`

---

## **SIG-02: Break Down boards.ts Function**

**Priority:** P1 | **Effort:** 6 hours | **Impact:** High

### **Problem**

Similar to tasks.ts, `src/cli/commands/boards.ts` contains large, complex functions.

### **Solution**

Apply same decomposition strategy as tasks.ts.

### **Implementation Steps**

1. Extract board command handlers into separate functions
2. Create `src/cli/commands/boards/` directory structure
3. Move React component handling to dedicated module

### **Files to Modify**

- Refactor: `src/cli/commands/boards.ts` → `src/cli/commands/boards/index.ts`
- Create: Board-specific command modules

---

## **SIG-03: Create Command Helper Utilities**

**Priority:** P1 | **Effort:** 4 hours | **Impact:** Medium

### **Problem**

Repeated patterns across CLI commands for API calls, validation, and formatting.

### **Solution**

Extract common functionality into reusable utilities.

### **Implementation Steps**

1. Create `src/cli/utils/command-helpers.ts`:

```typescript
export const withApiClient = <T>(handler: (client: ApiClient) => Promise<T>) => {
  return async (): Promise<T> => {
    const { apiClient } = getComponents();
    return handler(apiClient);
  };
};

export const withErrorHandling = <T extends unknown[]>(
  operation: string,
  handler: (...args: T) => Promise<void>
) => {
  return async (...args: T): Promise<void> => {
    try {
      await handler(...args);
    } catch (error) {
      handleCommandError(getComponents().formatter, { operation }, error);
    }
  };
};
```

---

## **SIG-04: Standardize Naming Conventions**

**Priority:** P1 | **Effort:** 3 hours | **Impact:** Medium

### **Problem**

Mixed naming conventions across interfaces and variables.

### **Example**

```typescript
interface CreateTaskOptions {
  title?: string; // camelCase
  column_id?: string; // snake_case
  board?: string; // inconsistent
}
```

### **Solution**

Establish and enforce consistent naming patterns.

### **Implementation Steps**

1. Document naming conventions in `CONTRIBUTING.md`
2. Update all interfaces to use consistent camelCase
3. Add ESLint rules for naming conventions

---

# 💛 **PHASE 3: ENHANCEMENTS (WEEKS 3-4)**

## **ENH-01: Reduce Function Parameter Complexity**

**Priority:** P2 | **Effort:** 6 hours | **Impact:** Medium

### **Problem**

Functions with 4+ parameters reduce readability and increase cognitive load.

### **Solution**

Use configuration objects for complex parameters.

### **Example**

```typescript
// Before
function createTask(
  title: string,
  description: string,
  boardId: string,
  columnId: string,
  priority: number,
  dueDate?: Date,
  assignee?: string
) {
  // ...
}

// After
interface CreateTaskConfig {
  title: string;
  description: string;
  boardId: string;
  columnId: string;
  priority: number;
  dueDate?: Date;
  assignee?: string;
}

function createTask(config: CreateTaskConfig) {
  // ...
}
```

---

## **ENH-02: Add Function Length ESLint Rule**

**Priority:** P2 | **Effort:** 2 hours | **Impact:** Medium

### **Problem**

No automated checking for function length to prevent future complexity.

### **Solution**

Add ESLint rule to limit function length.

### **Implementation**

```json
// .eslintrc.json
{
  "rules": {
    "max-lines-per-function": ["warn", { "max": 50, "skipComments": true }],
    "complexity": ["warn", 10]
  }
}
```

---

## **ENH-03: Create Integration Tests for Complex Functions**

**Priority:** P2 | **Effort:** 8 hours | **Impact:** High

### **Problem**

Large functions lack comprehensive testing, making refactoring risky.

### **Solution**

Add integration tests before and after refactoring complex functions.

---

## **ENH-04: Implement Result Type Pattern**

**Priority:** P2 | **Effort:** 10 hours | **Impact:** High

### **Problem**

Current error handling relies on exceptions, which can be hard to trace.

### **Solution**

Implement Result<T, E> pattern for better error handling.

### **Example**

```typescript
type Result<T, E = Error> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: E;
    };

async function getTasks(params: GetTasksParams): Promise<Result<Task[]>> {
  try {
    const tasks = await apiClient.getTasks(params);
    return { success: true, data: tasks };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}
```

---

## **ENH-05: Add Cognitive Complexity Metrics**

**Priority:** P3 | **Effort:** 4 hours | **Impact:** Low

### **Problem**

No automated way to track code complexity over time.

### **Solution**

Add complexity tracking tools and establish baselines.

---

# 📋 **IMPLEMENTATION GUIDELINES**

## **Working Approach**

1. **One task at a time** - Complete each TODO item fully before moving to the next
2. **Test after each change** - Ensure no regressions are introduced
3. **Update documentation** - Keep docs current with code changes
4. **Commit frequently** - Small, focused commits for easy rollback

## **Testing Strategy**

- Run existing test suite after each change
- Add new tests for extracted functions
- Verify CLI commands work correctly
- Test error scenarios

## **Success Metrics**

- **Function Length**: No functions > 50 lines (excluding tests)
- **Cyclomatic Complexity**: Maximum complexity of 10 per function
- **ESLint Warnings**: Reduce to < 10 total warnings
- **Test Coverage**: Maintain or improve current coverage

## **Quality Gates**

- [ ] All tests pass
- [ ] No ESLint errors
- [ ] TypeScript compiles without errors
- [ ] No regression in functionality
- [ ] Documentation is updated

---

# 🎯 **EXPECTED OUTCOMES**

## **Developer Experience Improvements**

- **50% reduction** in time to understand new code sections
- **Easier debugging** with smaller, focused functions
- **Improved testability** with better separation of concerns
- **Faster onboarding** for new team members

## **Maintainability Benefits**

- **Lower bug risk** with simplified logic
- **Easier feature additions** with consistent patterns
- **Better code reuse** with extracted utilities
- **Improved code review efficiency**

## **Code Quality Metrics**

- **Function Length**: Average < 30 lines (currently 80+ lines)
- **Complexity Score**: Average < 5 (currently 8-12)
- **Error Handling**: 100% consistent patterns
- **Test Coverage**: Maintain 90%+ on critical modules

---

**Next Action:** Start with **CRIT-01: Extract Magic Numbers and Strings** as it has the highest impact-to-effort ratio and will provide immediate benefits across the codebase.
