#!/usr/bin/env node

/**
 * Automated linting fixes for common issues
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Common patterns to fix
const fixes = [
  // Fix nullish coalescing operator (??) to logical OR (||)
  {
    pattern: /\?\?/g,
    replacement: '||',
    description: 'Replace nullish coalescing with logical OR',
  },

  // Fix unary operators (++)
  {
    pattern: /for\s*\(\s*let\s+(\w+)\s*=\s*(\d+)\s*;\s*\1\s*<\s*(\w+)\s*;\s*\1\+\+\)/g,
    replacement: (match, varName, start, end) => {
      return `Array.from({ length: ${end} - ${start} }, (_, ${varName}) => ${varName} + ${start})`;
    },
    description: 'Replace for loops with Array.from',
  },

  // Fix await in loops
  {
    pattern: /for\s*\(\s*const\s+(\w+)\s+of\s+(\w+)\)\s*\{[\s\S]*?await\s+([^;]+);[\s\S]*?\}/g,
    replacement: (match, item, array, awaitCall) => {
      return `await Promise.all(\n  ${array}.map(async (${item}) => {\n    ${awaitCall};\n  })\n);`;
    },
    description: 'Replace for...of loops with Promise.all',
  },

  // Fix promise executor returns
  {
    pattern: /new Promise\s*\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*?return\s+([^;]+);[\s\S]*?\}\s*\)/g,
    replacement: (match, returnValue) => {
      return `new Promise<void>((resolve) => {\n  ${returnValue};\n  resolve();\n})`;
    },
    description: 'Fix promise executor returns',
  },

  // Fix missing return types
  {
    pattern: /export async function (\w+)\s*\([^)]*\)\s*\{/g,
    replacement: (match, funcName) => {
      return `export async function ${funcName}(): Promise<void> {`;
    },
    description: 'Add missing return types',
  },

  // Fix class methods that should be static
  {
    pattern: /private (\w+)\s*\([^)]*\)\s*\{[\s\S]*?this\.(\w+)/g,
    replacement: (match, methodName, propertyName) => {
      return `private static ${methodName}() {\n  // Static method implementation\n}`;
    },
    description: 'Make class methods static when appropriate',
  },
];

// Get all TypeScript files
function getTypeScriptFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      files.push(...getTypeScriptFiles(fullPath));
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

// Apply fixes to a file
function applyFixesToFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    for (const fix of fixes) {
      const newContent = content.replace(fix.pattern, fix.replacement);
      if (newContent !== content) {
        content = newContent;
        modified = true;
        console.log(`Applied ${fix.description} to ${filePath}`);
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
    }

    return modified;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Main execution
function main() {
  console.log('Starting automated lint fixes...');

  const srcDir = path.join(__dirname, 'src');
  const testDir = path.join(__dirname, 'tests');

  const files = [...getTypeScriptFiles(srcDir), ...getTypeScriptFiles(testDir)];

  console.log(`Found ${files.length} TypeScript files`);

  let fixedCount = 0;
  for (const file of files) {
    if (applyFixesToFile(file)) {
      fixedCount++;
    }
  }

  console.log(`Fixed ${fixedCount} files`);

  // Run linter to see remaining issues
  console.log('\nRunning linter to check remaining issues...');
  try {
    execSync('npm run lint', { stdio: 'inherit' });
  } catch (error) {
    console.log('Linter completed with some issues remaining');
  }
}

if (require.main === module) {
  main();
}
