#!/usr/bin/env tsx

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface TypeContribution {
  packageName: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  estimatedEffort: string;
  currentUsage: string[];
  suggestedTypes: string;
}

const TYPE_CONTRIBUTIONS: TypeContribution[] = [
  {
    packageName: 'blessed-contrib',
    priority: 'medium',
    reason: 'Used for CLI dashboard and charts, has complex API',
    estimatedEffort: '2-3 days',
    currentUsage: ['src/cli/ui/components/BoardView.tsx', 'src/cli/commands/dashboard.ts'],
    suggestedTypes: `
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
}`,
  },
  {
    packageName: 'cli-table3',
    priority: 'low',
    reason: 'Simple table formatting, straightforward API',
    estimatedEffort: '1 day',
    currentUsage: ['src/cli/utils/formatter.ts', 'src/cli/commands/tasks.ts'],
    suggestedTypes: `
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
}`,
  },
  {
    packageName: 'listr2',
    priority: 'medium',
    reason: 'Task runner with complex renderer system',
    estimatedEffort: '2-3 days',
    currentUsage: ['src/cli/utils/task-runner.ts', 'src/cli/commands/process-todos.ts'],
    suggestedTypes: `
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
}`,
  },
];

function generateContributionGuide(): string {
  return `# TypeScript Type Definitions Contribution Guide

## Overview

This guide helps you contribute type definitions to DefinitelyTyped for packages that don't have official @types packages.

## Packages Needing Type Definitions

${TYPE_CONTRIBUTIONS.map(
  (contribution, index) => `
### ${index + 1}. ${contribution.packageName}

**Priority**: ${contribution.priority}  
**Reason**: ${contribution.reason}  
**Estimated Effort**: ${contribution.estimatedEffort}  
**Current Usage**: ${contribution.currentUsage.join(', ')}

**Suggested Type Definition**:
\`\`\`typescript
${contribution.suggestedTypes}
\`\`\`
`
).join('\n')}

## Contribution Process

### 1. Fork DefinitelyTyped Repository

\`\`\`bash
git clone https://github.com/DefinitelyTyped/DefinitelyTyped.git
cd DefinitelyTyped
\`\`\`

### 2. Create Type Definition Package

For each package, create a new directory:

\`\`\`bash
mkdir types/package-name
cd types/package-name
\`\`\`

### 3. Create Type Definition Files

Create the following files:

#### index.d.ts
\`\`\`typescript
// Type definitions for package-name
// Project: https://github.com/author/package-name
// Definitions by: Your Name <your-email@example.com>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

// Add your type definitions here
\`\`\`

#### package.json
\`\`\`json
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
\`\`\`

#### tsconfig.json
\`\`\`json
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
\`\`\`

#### package-name-tests.ts
\`\`\`typescript
// Tests for type definitions
import * as packageName from 'package-name';

// Add tests that verify your types work correctly
\`\`\`

### 4. Run Tests

\`\`\`bash
npm test
\`\`\`

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
`;
}

function generatePackageTemplate(packageName: string): string {
  return `# TypeScript Definitions for ${packageName}

## Overview

This package provides TypeScript definitions for \`${packageName}\`.

## Installation

\`\`\`bash
npm install --save-dev @types/${packageName}
\`\`\`

## Usage

\`\`\`typescript
import { SomeClass } from '${packageName}';

const instance = new SomeClass();
\`\`\`

## Contributing

To contribute to these type definitions:

1. Fork the DefinitelyTyped repository
2. Create a new branch for your changes
3. Add or update type definitions
4. Add tests to verify your types
5. Submit a pull request

## License

MIT License - see the [DefinitelyTyped license](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/LICENSE) for details.
`;
}

function main(): void {
  // eslint-disable-next-line no-console
  console.log('📝 Generating TypeScript contribution guide...\n');

  // Generate contribution guide
  const guidePath = join(process.cwd(), 'CONTRIBUTING_TYPES.md');
  const guide = generateContributionGuide();
  writeFileSync(guidePath, guide);

  // eslint-disable-next-line no-console
  console.log(`✅ Contribution guide saved to: ${guidePath}`);

  // Generate package templates
  const templatesDir = join(process.cwd(), 'type-contributions');
  if (!existsSync(templatesDir)) {
    mkdirSync(templatesDir, { recursive: true });
  }

  TYPE_CONTRIBUTIONS.forEach(contribution => {
    const templatePath = join(templatesDir, `${contribution.packageName}-template.md`);
    const template = generatePackageTemplate(contribution.packageName);
    writeFileSync(templatePath, template);

    // eslint-disable-next-line no-console
    console.log(`✅ Template for ${contribution.packageName} saved to: ${templatePath}`);
  });

  // eslint-disable-next-line no-console
  console.log('\n📋 Summary:');
  // eslint-disable-next-line no-console
  console.log(`- Generated contribution guide with ${TYPE_CONTRIBUTIONS.length} packages`);
  // eslint-disable-next-line no-console
  console.log('- Created package templates for each package');
  // eslint-disable-next-line no-console
  console.log('- Ready to start contributing to DefinitelyTyped');

  // eslint-disable-next-line no-console
  console.log('\n🚀 Next Steps:');
  // eslint-disable-next-line no-console
  console.log('1. Review the contribution guide in CONTRIBUTING_TYPES.md');
  // eslint-disable-next-line no-console
  console.log('2. Choose a package to start with (recommended: blessed-contrib)');
  // eslint-disable-next-line no-console
  console.log('3. Fork DefinitelyTyped repository');
  // eslint-disable-next-line no-console
  console.log('4. Create type definitions following the guide');
  // eslint-disable-next-line no-console
  console.log('5. Submit pull request');
}

if (require.main === module) {
  main();
}
