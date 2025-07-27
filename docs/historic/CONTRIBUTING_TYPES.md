# TypeScript Type Definitions Contribution Guide

## Overview

This guide helps you contribute type definitions to DefinitelyTyped for packages that don't have official @types packages.

## Packages Needing Type Definitions


### 1. blessed-contrib

**Priority**: medium  
**Reason**: Used for CLI dashboard and charts, has complex API  
**Estimated Effort**: 2-3 days  
**Current Usage**: src/cli/ui/components/BoardView.tsx, src/cli/commands/dashboard.ts

**Suggested Type Definition**:
```typescript

// Basic blessed-contrib types
declare module 'blessed-contrib' {
  import { Widgets } from 'blessed';
  
  export interface GridOptions {
    rows: number;
    cols: number;
    screen?: Widgets.Screen;
  }
  
  export interface ChartOptions {
    style?: { line?: string; text?: string };
    xLabelPadding?: number;
    showLegend?: boolean;
  }
  
  export interface Grid {
    set(row: number, col: number, rowSpan: number, colSpan: number, obj: Widgets.BlessedElement): Widgets.BlessedElement;
  }
  
  export function grid(options: GridOptions): Grid;
  export function line(options: ChartOptions): Widgets.BlessedElement;
  export function bar(options: ChartOptions): Widgets.BlessedElement;
  export function donut(options: ChartOptions): Widgets.BlessedElement;
  export function gauge(options: ChartOptions): Widgets.BlessedElement;
  export function map(options: ChartOptions): Widgets.BlessedElement;
  export function table(options: ChartOptions): Widgets.BlessedElement;
}
```


### 2. cli-table3

**Priority**: low  
**Reason**: Simple table formatting, straightforward API  
**Estimated Effort**: 1 day  
**Current Usage**: src/cli/utils/formatter.ts, src/cli/commands/tasks.ts

**Suggested Type Definition**:
```typescript

// Basic cli-table3 types
declare module 'cli-table3' {
  export interface TableOptions {
    chars?: {
      'top'?: string;
      'top-mid'?: string;
      'top-left'?: string;
      'top-right'?: string;
      'bottom'?: string;
      'bottom-mid'?: string;
      'bottom-left'?: string;
      'bottom-right'?: string;
      'left'?: string;
      'left-mid'?: string;
      'mid'?: string;
      'mid-mid'?: string;
      'right'?: string;
      'right-mid'?: string;
      'middle'?: string;
    };
    head?: string[];
    colWidths?: number[];
    colAligns?: Array<'left' | 'middle' | 'right'>;
    style?: {
      'padding-left'?: number;
      'padding-right'?: number;
      head?: string[];
      border?: string[];
    };
  }
  
  export class Table {
    constructor(options?: TableOptions);
    push(...rows: Array<string | string[]>): this;
    toString(): string;
    length: number;
  }
  
  export default Table;
}
```


### 3. listr2

**Priority**: medium  
**Reason**: Task runner with complex renderer system  
**Estimated Effort**: 2-3 days  
**Current Usage**: src/cli/utils/task-runner.ts, src/cli/commands/process-todos.ts

**Suggested Type Definition**:
```typescript

// Basic listr2 types
declare module 'listr2' {
  export interface TaskOptions {
    title?: string;
    task?: (ctx: any, task: Task) => void | Promise<void>;
    skip?: boolean | ((ctx: any) => boolean | string);
    enabled?: boolean | ((ctx: any) => boolean);
    exitOnError?: boolean;
    retry?: number | { tries: number; delay?: number };
    renderer?: 'default' | 'verbose' | 'silent' | 'test' | 'simple';
    rendererOptions?: any;
  }
  
  export interface ListrOptions {
    concurrent?: boolean | number;
    exitOnError?: boolean;
    renderer?: 'default' | 'verbose' | 'silent' | 'test' | 'simple';
    rendererOptions?: any;
    ctx?: any;
  }
  
  export class Task {
    constructor(options: TaskOptions);
    title: string;
    output: string;
    isEnabled(): boolean;
    isSkipped(): boolean;
    isCompleted(): boolean;
    isPending(): boolean;
    isFailed(): boolean;
    run(ctx?: any): Promise<void>;
  }
  
  export class Listr {
    constructor(tasks: TaskOptions[], options?: ListrOptions);
    add(tasks: TaskOptions | TaskOptions[]): this;
    run(ctx?: any): Promise<any>;
  }
  
  export default Listr;
}
```


## Contribution Process

### 1. Fork DefinitelyTyped Repository

```bash
git clone https://github.com/DefinitelyTyped/DefinitelyTyped.git
cd DefinitelyTyped
```

### 2. Create Type Definition Package

For each package, create a new directory:

```bash
mkdir types/package-name
cd types/package-name
```

### 3. Create Type Definition Files

Create the following files:

#### index.d.ts
```typescript
// Type definitions for package-name
// Project: https://github.com/author/package-name
// Definitions by: Your Name <your-email@example.com>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

// Add your type definitions here
```

#### package.json
```json
{
  "name": "@types/package-name",
  "version": "1.0.0",
  "description": "TypeScript definitions for package-name",
  "license": "MIT",
  "contributors": [
    {
      "name": "Your Name",
      "url": "https://github.com/yourusername"
    }
  ],
  "main": "",
  "types": "index.d.ts",
  "repository": {
    "type": "git",
    "url": "https://github.com/DefinitelyTyped/DefinitelyTyped.git",
    "directory": "types/package-name"
  },
  "scripts": {},
  "dependencies": {},
  "typesPublisherContentHash": "hash-here",
  "typeScriptVersion": "4.9"
}
```

#### tsconfig.json
```json
{
  "extends": "@definitelytyped/dtslint/dt.json",
  "compilerOptions": {
    "baseUrl": "../",
    "typeRoots": [
      "../"
    ],
    "target": "es2017",
    "module": "commonjs",
    "lib": [
      "es2017"
    ],
    "allowJs": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

#### package-name-tests.ts
```typescript
// Tests for type definitions
import * as packageName from 'package-name';

// Add tests that verify your types work correctly
```

### 4. Run Tests

```bash
npm test
```

### 5. Submit Pull Request

1. Commit your changes
2. Push to your fork
3. Create a pull request to DefinitelyTyped

## Best Practices

### 1. Follow Existing Patterns
- Look at similar packages in DefinitelyTyped
- Use consistent naming conventions
- Follow the same file structure

### 2. Comprehensive Coverage
- Cover all public APIs
- Include JSDoc comments for complex types
- Add tests for edge cases

### 3. Version Compatibility
- Ensure types work with the latest version
- Consider backward compatibility
- Test with different TypeScript versions

### 4. Documentation
- Include clear descriptions
- Add examples where helpful
- Document breaking changes

## Priority Order

1. **High Priority**: Packages used extensively in the codebase
2. **Medium Priority**: Packages with moderate usage
3. **Low Priority**: Simple packages or those with minimal usage

## Resources

- [DefinitelyTyped Contributing Guide](https://github.com/DefinitelyTyped/DefinitelyTyped#how-can-i-contribute)
- [TypeScript Declaration Files](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html)
- [DefinitelyTyped Style Guide](https://github.com/DefinitelyTyped/DefinitelyTyped#style-guide)

## Next Steps

1. Start with the highest priority packages
2. Create a branch for each contribution
3. Test thoroughly before submitting
4. Follow up on pull request reviews
