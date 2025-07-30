# TypeScript Watch Mode Development Guide

## Overview

The project now includes TypeScript watch mode capabilities for continuous type checking during development. This helps catch type errors immediately as you code, improving development speed and code quality.

## Available Scripts

### Type Checking Commands

```bash
# Standard type check (one-time)
npm run typecheck

# Type check in watch mode (continuous)
npm run typecheck:watch

# Type check for build configuration
npm run typecheck:build
```

### Development with Type Checking

```bash
# Development server with reminder to run type checking
npm run dev:with-types

# Tests in watch mode with type checking reminder
npm run test:watch:with-types

# Parallel development and type checking (using script)
./dev-with-types.sh
```

## Watch Mode Features

The TypeScript compiler watch mode includes the following optimizations:

- **File System Events**: Uses native file system events for better performance
- **Smart Exclusions**: Excludes `node_modules`, `dist`, `coverage`, and `build` directories
- **Dynamic Polling**: Falls back to dynamic polling when needed
- **Incremental Compilation**: Only recompiles changed files and their dependencies

## Usage Patterns

### Single Terminal Workflow

If you prefer using a single terminal, use the provided script:

```bash
./dev-with-types.sh
```

This script runs both the development server and TypeScript compiler in parallel, with proper cleanup when you stop the process.

### Multi-Terminal Workflow

For better control, run the processes in separate terminals:

**Terminal 1 - Development Server:**
```bash
npm run dev
```

**Terminal 2 - Type Checking:**
```bash
npm run typecheck:watch
```

### IDE Integration

The watch mode configuration is optimized for VS Code and other editors that support TypeScript. The `watchOptions` in `tsconfig.json` ensure:

- Fast file change detection
- Minimal resource usage
- Reliable incremental compilation

## Configuration

The watch mode is configured in `tsconfig.json` under the `watchOptions` section:

```json
{
  "watchOptions": {
    "watchFile": "useFsEvents",
    "watchDirectory": "useFsEvents", 
    "fallbackPolling": "dynamicPriority",
    "synchronousWatchDirectory": true,
    "excludeDirectories": ["**/node_modules", "**/dist", "**/coverage", "**/build"]
  }
}
```

## Benefits

1. **Immediate Feedback**: Catch type errors as soon as you save files
2. **Faster Development**: No need to run separate type check commands
3. **Better Code Quality**: Continuous validation prevents type errors from accumulating
4. **IDE Integration**: Works seamlessly with TypeScript-aware editors

## Troubleshooting

### High CPU Usage

If you experience high CPU usage:

1. Check that your IDE isn't also running TypeScript compilation
2. Consider excluding additional directories in `watchOptions.excludeDirectories`
3. Use the single-terminal script to avoid running multiple watchers

### File Change Detection Issues

If changes aren't being detected:

1. Try restarting the watch mode
2. Check file permissions
3. On some systems, you may need to increase file watcher limits

### Memory Issues

For large codebases:

1. Consider using `skipLibCheck: true` (already enabled)
2. Exclude test files from type checking (already configured)
3. Use TypeScript project references for very large projects

## Integration with Development Workflow

The type checking watch mode integrates with:

- **ESLint**: Run `npm run lint` for style and logic checks
- **Jest**: Run `npm run test:watch` for test-driven development  
- **Prettier**: Format code with `npm run format`
- **Husky**: Pre-commit hooks ensure type safety before commits

## Next Steps

Consider enabling stricter TypeScript options as the codebase matures:

- `exactOptionalPropertyTypes`
- `noUncheckedIndexedAccess`
- Additional strict checks in `compilerOptions`

These can be enabled incrementally with the watch mode helping to catch and fix issues quickly.