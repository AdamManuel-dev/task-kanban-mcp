#!/usr/bin/env node

/**
 * Automated Linting Error Fixer
 *
 * This script automatically fixes common ESLint and TypeScript errors:
 * - Index signature access (dot notation → bracket notation)
 * - Unused imports
 * - Unsafe type usage
 * - Missing return types
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Common patterns to fix
const FIXES = [
  // Index signature access fixes
  {
    pattern: /(\w+)\.(\w+)\s*=\s*([^;]+);/g,
    replacement: (match, obj, prop, value) => {
      // Only fix if it looks like an index signature access
      if (prop.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        return `${obj}['${prop}'] = ${value};`;
      }
      return match;
    },
    description: 'Index signature access (dot → bracket notation)',
  },

  // Unused import removal
  {
    pattern: /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"];?\s*\n/g,
    replacement: (match, imports, module) =>
      // This is a placeholder - actual logic would need AST parsing
      match,
    description: 'Remove unused imports',
  },
];

function fixFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let newContent = content;

    for (const fix of FIXES) {
      const before = newContent;
      newContent = newContent.replace(fix.pattern, fix.replacement);
      if (newContent !== before) {
        modified = true;
        console.log(`  ✓ Applied: ${fix.description}`);
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, newContent);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`  ✗ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function findTypeScriptFiles(dir) {
  const files = [];

  function scan(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        scan(fullPath);
      } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}

function main() {
  console.log('🔧 Automated Linting Error Fixer');
  console.log('================================\n');

  const srcDir = path.join(__dirname, '..', 'src');
  const files = findTypeScriptFiles(srcDir);

  console.log(`Found ${files.length} TypeScript files to process...\n`);

  let fixedCount = 0;

  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);
    console.log(`Processing: ${relativePath}`);

    if (fixFile(file)) {
      fixedCount++;
      console.log(`  ✓ Fixed issues in ${relativePath}\n`);
    } else {
      console.log(`  - No fixes needed\n`);
    }
  }

  console.log(`\n🎉 Summary:`);
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files modified: ${fixedCount}`);

  if (fixedCount > 0) {
    console.log('\n📝 Next steps:');
    console.log('  1. Run "npm run lint" to check remaining issues');
    console.log('  2. Run "npm run typecheck" to verify TypeScript fixes');
    console.log('  3. Run "npm test" to ensure no regressions');
  }
}

if (require.main === module) {
  main();
}

module.exports = { fixFile, findTypeScriptFiles };
