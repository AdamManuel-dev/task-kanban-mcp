#!/usr/bin/env ts-node

/**
 * Type Coverage Improvements Script
 *
 * This script helps systematically improve TypeScript type coverage by:
 * 1. Auditing and replacing `any` types with proper types
 * 2. Adding explicit return types to functions
 * 3. Creating type tests for type guards
 * 4. Ensuring test files are properly typed
 */

// import { execSync } from 'child_process'; // Unused import
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

interface TypeAuditResult {
  file: string;
  anyTypes: Array<{
    line: number;
    column: number;
    context: string;
  }>;
  missingReturnTypes: Array<{
    line: number;
    functionName: string;
  }>;
}

/**
 * Find all TypeScript files in the project
 */
function findTypeScriptFiles(dir: string, files: string[] = []): string[] {
  const items = readdirSync(dir);

  items.forEach(item => {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      findTypeScriptFiles(fullPath, files);
    } else if (extname(item) === '.ts' && !item.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  });

  return files;
}

/**
 * Audit a single file for type issues
 */
function auditFile(filePath: string): TypeAuditResult {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const result: TypeAuditResult = {
    file: filePath,
    anyTypes: [],
    missingReturnTypes: [],
  };

  // Find any types
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const anyMatches = line.match(/: any/g);
    if (anyMatches) {
      result.anyTypes.push({
        line: i + 1,
        column: line.indexOf(': any') + 1,
        context: line.trim(),
      });
    }
  }

  // Find functions without explicit return types
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const functionMatch = line.match(
      /(?:async\s+)?(?:function\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{?/
    );
    if (functionMatch && !line.includes(':') && !line.includes('=>')) {
      result.missingReturnTypes.push({
        line: i + 1,
        functionName: functionMatch[1],
      });
    }
  }

  return result;
}

/**
 * Generate type replacement suggestions
 */
function generateTypeSuggestions(auditResult: TypeAuditResult): string[] {
  const suggestions: string[] = [];

  auditResult.anyTypes.forEach(anyType => {
    const { context } = anyType;

    if (context.includes('params: any[]')) {
      suggestions.push(
        `Replace 'params: any[]' with 'params: QueryParameters' in ${auditResult.file}:${anyType.line}`
      );
    } else if (context.includes('error: any')) {
      suggestions.push(
        `Replace 'error: any' with 'error: unknown' in ${auditResult.file}:${anyType.line}`
      );
    } else if (context.includes('data: any')) {
      suggestions.push(
        `Replace 'data: any' with 'data: unknown' in ${auditResult.file}:${anyType.line}`
      );
    } else if (context.includes('response: any')) {
      suggestions.push(
        `Replace 'response: any' with 'response: unknown' in ${auditResult.file}:${anyType.line}`
      );
    } else if (context.includes('result: any')) {
      suggestions.push(
        `Replace 'result: any' with 'result: unknown' in ${auditResult.file}:${anyType.line}`
      );
    } else {
      suggestions.push(
        `Review and replace 'any' type in ${auditResult.file}:${anyType.line} - ${context}`
      );
    }
  });

  return suggestions;
}

/**
 * Generate return type suggestions
 */
function generateReturnTypeSuggestions(auditResult: TypeAuditResult): string[] {
  const suggestions: string[] = [];

  auditResult.missingReturnTypes.forEach(missingReturn => {
    suggestions.push(
      `Add explicit return type to function '${missingReturn.functionName}' in ${auditResult.file}:${missingReturn.line}`
    );
  });

  return suggestions;
}

/**
 * Main audit function
 */
function runTypeAudit(): void {
  // eslint-disable-next-line no-console
  console.log('🔍 Starting TypeScript type coverage audit...\n');

  const srcDir = join(__dirname, '..', 'src');
  const testDir = join(__dirname, '..', 'tests');

  const allFiles = [...findTypeScriptFiles(srcDir), ...findTypeScriptFiles(testDir)];

  // eslint-disable-next-line no-console
  console.log(`Found ${allFiles.length} TypeScript files to audit\n`);

  const auditResults: TypeAuditResult[] = [];
  let totalAnyTypes = 0;
  let totalMissingReturnTypes = 0;

  allFiles.forEach(file => {
    const result = auditFile(file);
    if (result.anyTypes.length > 0 || result.missingReturnTypes.length > 0) {
      auditResults.push(result);
      totalAnyTypes += result.anyTypes.length;
      totalMissingReturnTypes += result.missingReturnTypes.length;
    }
  });

  // eslint-disable-next-line no-console
  console.log(`📊 Audit Results:`);
  // eslint-disable-next-line no-console
  console.log(`   Files with issues: ${auditResults.length}`);
  // eslint-disable-next-line no-console
  console.log(`   Total 'any' types: ${totalAnyTypes}`);
  // eslint-disable-next-line no-console
  console.log(`   Total missing return types: ${totalMissingReturnTypes}\n`);

  // Generate suggestions
  const typeSuggestions: string[] = [];
  const returnTypeSuggestions: string[] = [];

  auditResults.forEach(result => {
    typeSuggestions.push(...generateTypeSuggestions(result));
    returnTypeSuggestions.push(...generateReturnTypeSuggestions(result));
  });

  // eslint-disable-next-line no-console
  console.log(`🔧 Type Replacement Suggestions (${typeSuggestions.length}):`);
  typeSuggestions.slice(0, 20).forEach(suggestion => {
    // eslint-disable-next-line no-console
    console.log(`   • ${suggestion}`);
  });

  if (typeSuggestions.length > 20) {
    // eslint-disable-next-line no-console
    console.log(`   ... and ${typeSuggestions.length - 20} more`);
  }

  // eslint-disable-next-line no-console
  console.log(`\n📝 Return Type Suggestions (${returnTypeSuggestions.length}):`);
  returnTypeSuggestions.slice(0, 20).forEach(suggestion => {
    // eslint-disable-next-line no-console
    console.log(`   • ${suggestion}`);
  });

  if (returnTypeSuggestions.length > 20) {
    // eslint-disable-next-line no-console
    console.log(`   ... and ${returnTypeSuggestions.length - 20} more`);
  }

  // Generate summary report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      filesAudited: allFiles.length,
      filesWithIssues: auditResults.length,
      totalAnyTypes,
      totalMissingReturnTypes,
    },
    suggestions: {
      typeReplacements: typeSuggestions,
      returnTypes: returnTypeSuggestions,
    },
  };

  writeFileSync(join(__dirname, '..', 'TYPE_AUDIT_REPORT.json'), JSON.stringify(report, null, 2));

  // eslint-disable-next-line no-console
  console.log(`\n📄 Detailed report saved to TYPE_AUDIT_REPORT.json`);
  // eslint-disable-next-line no-console
  console.log(`\n🎯 Next Steps:`);
  // eslint-disable-next-line no-console
  console.log(`   1. Review and implement type replacement suggestions`);
  // eslint-disable-next-line no-console
  console.log(`   2. Add explicit return types to functions`);
  // eslint-disable-next-line no-console
  console.log(`   3. Create type tests for type guards`);
  // eslint-disable-next-line no-console
  console.log(`   4. Run 'npm run typecheck' to verify improvements`);
}

/**
 * Create type test templates
 */
function createTypeTestTemplates(): void {
  // eslint-disable-next-line no-console
  console.log('\n🧪 Creating type test templates...\n');

  const typeTestTemplate = `import { describe, it, expect } from '@jest/globals';
import { isString, isNumber, isBoolean, isArray, isRecord } from '../src/utils/typeGuards';

describe('Type Guards', () => {
  describe('isString', () => {
    it('should return true for string values', () => {
      expect(isString('hello')).toBe(true);
      expect(isString('')).toBe(true);
      expect(isString(String('test'))).toBe(true);
    });

    it('should return false for non-string values', () => {
      expect(isString(123)).toBe(false);
      expect(isString(true)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString([])).toBe(false);
      expect(isString({})).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isNumber(123)).toBe(true);
      expect(isNumber(0)).toBe(true);
      expect(isNumber(-1)).toBe(true);
      expect(isNumber(3.14)).toBe(true);
    });

    it('should return false for invalid numbers', () => {
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber(Infinity)).toBe(false);
      expect(isNumber(-Infinity)).toBe(false);
      expect(isNumber('123')).toBe(false);
      expect(isNumber(null)).toBe(false);
      expect(isNumber(undefined)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('should return true for boolean values', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
      expect(isBoolean(Boolean(1))).toBe(true);
    });

    it('should return false for non-boolean values', () => {
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
      expect(isBoolean(undefined)).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(['a', 'b'])).toBe(true);
      expect(isArray(new Array())).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('array')).toBe(false);
      expect(isArray(123)).toBe(false);
      expect(isArray(null)).toBe(false);
      expect(isArray(undefined)).toBe(false);
    });
  });

  describe('isRecord', () => {
    it('should return true for objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ key: 'value' })).toBe(true);
      expect(isRecord(new Object())).toBe(true);
    });

    it('should return false for non-objects', () => {
      expect(isRecord([])).toBe(false);
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord('object')).toBe(false);
      expect(isRecord(123)).toBe(false);
    });
  });
});
`;

  writeFileSync(
    join(__dirname, '..', 'tests', 'unit', 'utils', 'typeGuards.test.ts'),
    typeTestTemplate
  );

  // eslint-disable-next-line no-console
  console.log('✅ Created type test template: tests/unit/utils/typeGuards.test.ts');
}

// Run the audit if this script is executed directly
if (require.main === module) {
  runTypeAudit();
  createTypeTestTemplates();
}

export { runTypeAudit, createTypeTestTemplates, auditFile };
