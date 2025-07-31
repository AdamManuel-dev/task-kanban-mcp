#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

interface PackageInfo {
  name: string;
  version: string;
  hasTypes: boolean;
  typesPackage?: string;
  hasBuiltInTypes: boolean;
  needsTypes: boolean;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

interface AuditResult {
  totalPackages: number;
  packagesWithTypes: number;
  packagesNeedingTypes: number;
  outdatedTypes: number;
  recommendations: string[];
  packages: PackageInfo[];
}

// Packages that have built-in TypeScript definitions
const BUILT_IN_TYPES = [
  'zod',
  'chalk',
  'commander',
  'date-fns',
  'dotenv',
  'express-rate-limit',
  'helmet',
  'kysely',
  'ora',
  'prompts',
  'react',
  'socket.io',
  'winston',
  'ws',
  'uuid',
  'jsonwebtoken',
  'sqlite',
  'sqlite3',
  'better-sqlite3',
  'bcrypt',
  'dompurify',
  'jsdom',
  'compression',
  'cors',
  'express',
  'inquirer',
  'node-cron',
  'uuid',
  'ws',
];

// Packages that need @types packages
const NEEDS_TYPES_PACKAGES = [
  'blessed',
  'blessed-contrib',
  'cli-table3',
  'enquirer',
  'listr2',
  'ink',
  'ink-testing-library',
];

// Priority mapping for packages
const PRIORITY_MAPPING: Record<string, 'high' | 'medium' | 'low'> = {
  // High priority - frequently used, critical for type safety
  express: 'high',
  chalk: 'high',
  commander: 'high',
  zod: 'high',
  'date-fns': 'high',
  dotenv: 'high',
  uuid: 'high',
  jsonwebtoken: 'high',
  bcrypt: 'high',
  'better-sqlite3': 'high',
  sqlite3: 'high',
  ws: 'high',
  'socket.io': 'high',
  winston: 'high',
  helmet: 'high',
  'express-rate-limit': 'high',
  compression: 'high',
  cors: 'high',
  inquirer: 'high',
  'node-cron': 'high',
  dompurify: 'high',
  jsdom: 'high',

  // Medium priority - used but not critical
  blessed: 'medium',
  'blessed-contrib': 'medium',
  'cli-table3': 'medium',
  enquirer: 'medium',
  listr2: 'medium',
  ora: 'medium',
  prompts: 'medium',
  ink: 'medium',
  'ink-testing-library': 'medium',
  kysely: 'medium',
  react: 'medium',

  // Low priority - rarely used or already well-typed
  sqlite: 'low',
};

function getPackageList(): string[] {
  try {
    const output = execSync('npm list --depth=0 --json', { encoding: 'utf8' });
    const data = JSON.parse(output) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    const dependencies = { ...data.dependencies, ...data.devDependencies };
    return Object.keys(dependencies).filter(name => !name.startsWith('@types/'));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error getting package list:', error);
    return [];
  }
}

function getInstalledTypes(): string[] {
  try {
    const output = execSync('npm list --depth=0 | grep "@types"', { encoding: 'utf8' });
    return output
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const match = line.match(/@types\/([^@]+)/);
        return match ? match[1] : '';
      })
      .filter(Boolean);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error getting installed types:', error);
    return [];
  }
}

// eslint-disable-next-line max-lines-per-function
function checkForOutdatedTypes(): string[] {
  try {
    const output = execSync('npm outdated', { encoding: 'utf8' });
    return output
      .split('\n')
      .filter(line => line.includes('@types/'))
      .map(line => {
        const match = line.match(/@types\/([^\s]+)/);
        return match ? match[1] : '';
      })
      .filter(Boolean);
  } catch (error) {
    // npm outdated returns exit code 1 when there are outdated packages
    if (error.status === 1) {
      const errorWithStdout = error as { stdout?: Buffer | string };
      const output = errorWithStdout.stdout?.toString() ?? '';
      return output
        .split('\n')
        .filter(line => line.includes('@types/'))
        .map(line => {
          const match = line.match(/@types\/([^\s]+)/);
          return match ? match[1] : '';
        })
        .filter(Boolean);
    }
    return [];
  }
}

function analyzePackage(
  packageName: string,
  installedTypes: string[],
  outdatedTypes: string[]
): PackageInfo {
  const hasTypes = installedTypes.includes(packageName);
  const hasBuiltInTypes = BUILT_IN_TYPES.includes(packageName);
  const needsTypes = NEEDS_TYPES_PACKAGES.includes(packageName);
  const isOutdated = outdatedTypes.includes(packageName);

  let priority: 'high' | 'medium' | 'low' = 'low';
  let reason = '';

  if (hasBuiltInTypes) {
    priority = PRIORITY_MAPPING[packageName] ?? 'medium';
    reason = 'Has built-in TypeScript definitions';
  } else if (hasTypes) {
    priority = isOutdated ? 'high' : 'medium';
    reason = isOutdated ? 'Has @types package but outdated' : 'Has @types package';
  } else if (needsTypes) {
    priority = 'high';
    reason = 'Missing @types package';
  } else {
    priority = PRIORITY_MAPPING[packageName] ?? 'low';
    reason = 'No type definitions available';
  }

  return {
    name: packageName,
    version: '', // Would need to parse from npm list output, hasTypes, typesPackage: hasTypes ? `@types/${packageName }` : undefined,
    hasBuiltInTypes,
    needsTypes,
    priority,
    reason,
  };
}

function generateRecommendations(auditResult: AuditResult): string[] {
  const recommendations: string[] = [];

  // Update outdated @types packages
  const outdatedPackages = auditResult.packages.filter(p => p.hasTypes && p.priority === 'high');
  if (outdatedPackages.length > 0) {
    recommendations.push(
      `Update ${outdatedPackages.length} outdated @types packages: ${outdatedPackages.map(p => p.name).join(', ')}`
    );
  }

  // Install missing @types packages
  const missingTypes = auditResult.packages.filter(p => p.needsTypes && !p.hasTypes);
  if (missingTypes.length > 0) {
    recommendations.push(
      `Install missing @types packages: ${missingTypes.map(p => p.name).join(', ')}`
    );
  }

  // Create ambient declarations for untyped dependencies
  const untypedHighPriority = auditResult.packages.filter(
    p => !p.hasTypes && !p.hasBuiltInTypes && p.priority === 'high'
  );
  if (untypedHighPriority.length > 0) {
    recommendations.push(
      `Create ambient declarations for: ${untypedHighPriority.map(p => p.name).join(', ')}`
    );
  }

  // Update jsonwebtoken for better TypeScript support
  if (auditResult.packages.find(p => p.name === 'jsonwebtoken')) {
    recommendations.push('Consider updating jsonwebtoken for better TypeScript support');
  }

  // Contribute type definitions back to DefinitelyTyped
  const untypedMediumPriority = auditResult.packages.filter(
    p => !p.hasTypes && !p.hasBuiltInTypes && p.priority === 'medium'
  );
  if (untypedMediumPriority.length > 0) {
    recommendations.push(
      `Consider contributing type definitions to DefinitelyTyped for: ${untypedMediumPriority.map(p => p.name).join(', ')}`
    );
  }

  return recommendations;
}

// eslint-disable-next-line max-lines-per-function
function generateDetailedReport(auditResult: AuditResult): string {
  return `# Third-Party Type Definitions Audit

Generated on: ${new Date().toISOString()}

## Summary

- **Total Packages**: ${auditResult.totalPackages}
- **Packages with Types**: ${auditResult.packagesWithTypes}
- **Packages Needing Types**: ${auditResult.packagesNeedingTypes}
- **Outdated @types Packages**: ${auditResult.outdatedTypes}

## Recommendations

${auditResult.recommendations.map((rec, index) => `${index + 1}. ${rec}`).join('\n')}

## Detailed Analysis

### High Priority Packages

${auditResult.packages
  .filter(p => p.priority === 'high')
  .map(p => `- **${p.name}**: ${p.reason}`)
  .join('\n')}

### Medium Priority Packages

${auditResult.packages
  .filter(p => p.priority === 'medium')
  .map(p => `- **${p.name}**: ${p.reason}`)
  .join('\n')}

### Low Priority Packages

${auditResult.packages
  .filter(p => p.priority === 'low')
  .map(p => `- **${p.name}**: ${p.reason}`)
  .join('\n')}

## Action Items

### Immediate Actions (High Priority)

1. **Update Outdated @types Packages**
   \`\`\`bash
   npm update @types/bcrypt @types/express @types/jest @types/node @types/uuid
   \`\`\`

2. **Install Missing @types Packages**
   \`\`\`bash
   npm install --save-dev @types/blessed-contrib @types/cli-table3 @types/listr2
   \`\`\`

3. **Create Ambient Declarations**
   Create \`src/types/ambient.d.ts\` for packages without type definitions.

### Medium Priority Actions

1. **Contribute to DefinitelyTyped**
   Consider contributing type definitions for packages without @types.

2. **Update jsonwebtoken**
   \`\`\`bash
   npm update jsonwebtoken
   \`\`\`

### Long-term Actions

1. **Regular Type Audits**
   Run this audit script monthly to track type coverage.

2. **Type Definition Maintenance**
   Keep @types packages updated and monitor for new type definitions.

## Package Details

| Package | Has Types | Built-in | Needs Types | Priority | Reason |
|---------|-----------|----------|-------------|----------|--------|
${auditResult.packages
  .filter(p => p.priority === 'high' || p.needsTypes || p.hasTypes)
  .sort((a, b) => {
    if (a.priority !== b.priority) {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    }
    return a.name.localeCompare(b.name);
  })
  .map(
    p =>
      `| ${p.name} | ${p.hasTypes ? 'Yes' : 'No'} | ${p.hasBuiltInTypes ? 'Yes' : 'No'} | ${p.needsTypes ? 'Yes' : 'No'} | ${p.priority} | ${p.reason} |`
  )
  .join('\n')}

## Generated by

This report was generated by the third-party type definitions audit script.
`;
}

function main(): void {
  // eslint-disable-next-line no-console
  console.log('🔍 Auditing third-party type definitions...\n');

  const packages = getPackageList();
  const installedTypes = getInstalledTypes();
  const outdatedTypes = checkForOutdatedTypes();

  const packageInfos = packages.map(pkg => analyzePackage(pkg, installedTypes, outdatedTypes));

  const auditResult: AuditResult = {
    totalPackages: packages.length,
    packagesWithTypes: packageInfos.filter(p => p.hasTypes || p.hasBuiltInTypes).length,
    packagesNeedingTypes: packageInfos.filter(p => p.needsTypes && !p.hasTypes).length,
    outdatedTypes: outdatedTypes.length,
    recommendations: [],
    packages: packageInfos,
  };

  auditResult.recommendations = generateRecommendations(auditResult);

  // Print results
  // eslint-disable-next-line no-console
  console.log('📊 Audit Results:');
  // eslint-disable-next-line no-console
  console.log(`Total packages: ${auditResult.totalPackages}`);
  // eslint-disable-next-line no-console
  console.log(`Packages with types: ${auditResult.packagesWithTypes}`);
  // eslint-disable-next-line no-console
  console.log(`Packages needing types: ${auditResult.packagesNeedingTypes}`);
  // eslint-disable-next-line no-console
  console.log(`Outdated @types packages: ${auditResult.outdatedTypes}\n`);

  // eslint-disable-next-line no-console
  console.log('🔧 Recommendations:');
  auditResult.recommendations.forEach((rec, index) => {
    // eslint-disable-next-line no-console
    console.log(`${index + 1}. ${rec}`);
  });

  // eslint-disable-next-line no-console
  console.log('\n📋 Detailed Package Analysis:');
  // eslint-disable-next-line no-console
  console.log('Package Name | Has Types | Built-in | Needs Types | Priority | Reason');
  // eslint-disable-next-line no-console
  console.log('-------------|-----------|----------|-------------|----------|--------');

  packageInfos
    .filter(p => p.priority === 'high' || p.needsTypes || p.hasTypes)
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return a.name.localeCompare(b.name);
    })
    .forEach(pkg => {
      // eslint-disable-next-line no-console
      console.log(
        `${pkg.name.padEnd(13)} | ${pkg.hasTypes ? 'Yes' : 'No'.padEnd(9)} | ${pkg.hasBuiltInTypes ? 'Yes' : 'No'.padEnd(8)} | ${pkg.needsTypes ? 'Yes' : 'No'.padEnd(11)} | ${pkg.priority.padEnd(8)} | ${pkg.reason}`
      );
    });

  // Save detailed report
  const reportPath = join(process.cwd(), 'THIRD_PARTY_TYPES_AUDIT.md');
  const report = generateDetailedReport(auditResult);
  writeFileSync(reportPath, report);

  // eslint-disable-next-line no-console
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

if (require.main === module) {
  main();
}
