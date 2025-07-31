#!/usr/bin/env node

/**
 * @fileoverview Script to identify and fix function length violations (50+ line functions)
 * @lastmodified 2025-07-28T16:00:00Z
 *
 * Features: Function analysis, length detection, refactoring suggestions
 * Main APIs: analyzeFunctions(), findLongFunctions(), suggestRefactoring()
 * Constraints: Requires TypeScript files, follows ESLint rules
 * Patterns: AST parsing, code analysis, automated suggestions
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 **ANALYZING FUNCTION LENGTH VIOLATIONS**\n');

// Find all TypeScript files
const tsFiles = [];
function findTsFiles(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules' && item !== 'dist') {
      findTsFiles(fullPath);
    } else if (
      item.endsWith('.ts') &&
      !item.endsWith('.d.ts') &&
      !item.includes('.test.') &&
      !item.includes('.spec.')
    ) {
      tsFiles.push(fullPath);
    }
  }
}

findTsFiles('./src');

console.log(`📊 Found ${tsFiles.length} TypeScript files to analyze\n`);

// Analyze functions in each file
const longFunctions = [];
const maxLines = 50;

for (const filePath of tsFiles) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Simple regex-based function detection (not perfect but good enough)
    const functionRegex =
      /(export\s+)?(async\s+)?(function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>|(?:public|private|protected)?\s*(?:async\s+)?\w+\s*\([^)]*\)\s*[:{]|\w+\s*:\s*(?:async\s+)?\([^)]*\)\s*=>)/g;

    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;

      // Find function end by counting braces
      let braceCount = 0;
      let inString = false;
      let stringChar = '';
      let i = startIndex;
      let foundStart = false;

      while (i < content.length) {
        const char = content[i];

        if (!inString) {
          if (char === '"' || char === "'" || char === '`') {
            inString = true;
            stringChar = char;
          } else if (char === '{') {
            braceCount++;
            foundStart = true;
          } else if (char === '}') {
            braceCount--;
            if (foundStart && braceCount === 0) {
              break;
            }
          }
        } else if (char === stringChar && content[i - 1] !== '\\') {
          inString = false;
        }

        i++;
      }

      if (foundStart && braceCount === 0) {
        const endLine = content.substring(0, i).split('\n').length;
        const functionLength = endLine - startLine + 1;

        if (functionLength > maxLines) {
          const functionName = match[0].match(/\w+/)?.[0] || 'anonymous';
          longFunctions.push({
            file: path.relative(process.cwd(), filePath),
            name: functionName,
            startLine,
            endLine,
            length: functionLength,
            excerpt: lines
              .slice(startLine - 1, startLine + 2)
              .join('\n')
              .trim(),
          });
        }
      }
    }
  } catch (error) {
    console.log(`⚠️ Error analyzing ${filePath}: ${error.message}`);
  }
}

// Report findings
longFunctions.sort((a, b) => b.length - a.length);

console.log(`🎯 **FOUND ${longFunctions.length} FUNCTIONS EXCEEDING ${maxLines} LINES:**\n`);

const topViolations = longFunctions.slice(0, 10);
for (let i = 0; i < topViolations.length; i++) {
  const func = topViolations[i];
  // Output formatted for markdown report
  process.stdout.write(`${i + 1}. **${func.name}** in ${func.file}\n`);
  process.stdout.write(`   Lines: ${func.startLine}-${func.endLine} (${func.length} lines)\n`);
  process.stdout.write(`   Excerpt: ${func.excerpt.split('\n')[0]}...\n\n`);
}

if (longFunctions.length > 10) {
  console.log(`... and ${longFunctions.length - 10} more functions\n`);
}

// Provide refactoring suggestions
console.log('🔧 **REFACTORING SUGGESTIONS:**\n');

const refactoringSuggestions = [
  {
    pattern: 'Large if-else chains',
    solution: 'Extract to separate methods or use strategy pattern',
    example: 'if (condition1) { ... } else if (condition2) { ... }',
  },
  {
    pattern: 'Multiple validation steps',
    solution: 'Create validation helper functions',
    example: 'validateInput(), validatePermissions(), validateData()',
  },
  {
    pattern: 'Complex data processing',
    solution: 'Break into pipeline of smaller functions',
    example: 'transform() -> validate() -> save()',
  },
  {
    pattern: 'Large try-catch blocks',
    solution: 'Extract business logic to separate functions',
    example: 'try { processData(); } catch { handleError(); }',
  },
  {
    pattern: 'Mixed concerns',
    solution: 'Separate data access, business logic, and presentation',
    example: 'getData() -> processData() -> formatResponse()',
  },
];

for (let i = 0; i < refactoringSuggestions.length; i++) {
  const suggestion = refactoringSuggestions[i];
  console.log(`${i + 1}. **${suggestion.pattern}**`);
  console.log(`   Solution: ${suggestion.solution}`);
  console.log(`   Example: ${suggestion.example}`);
  console.log();
}

// Auto-fix suggestions for specific files
console.log('🔨 **PRIORITY REFACTORING TARGETS:**\n');

const priorityFiles = topViolations.slice(0, 5);
for (const func of priorityFiles) {
  console.log(`📄 **${func.file}:${func.startLine}** - ${func.name} (${func.length} lines)`);

  // Read the actual function to provide specific suggestions
  try {
    const content = fs.readFileSync(path.join(process.cwd(), func.file), 'utf8');
    const lines = content.split('\n');
    const functionLines = lines.slice(func.startLine - 1, func.endLine);
    const functionContent = functionLines.join('\n');

    // Simple heuristics for refactoring suggestions
    const suggestions = [];

    if (functionContent.includes('if (') && functionContent.split('if (').length > 5) {
      suggestions.push('Consider extracting conditional logic into separate functions');
    }

    if (functionContent.includes('try {') && functionContent.includes('catch')) {
      suggestions.push('Move business logic outside try-catch blocks');
    }

    if (functionContent.includes('await ') && functionContent.split('await ').length > 8) {
      suggestions.push('Break async operations into smaller, sequential functions');
    }

    if (functionContent.includes('console.log') || functionContent.includes('logger.')) {
      suggestions.push('Extract logging into dedicated functions');
    }

    if (functionContent.includes('for (') || functionContent.includes('forEach')) {
      suggestions.push('Consider extracting loop bodies into separate functions');
    }

    if (suggestions.length > 0) {
      suggestions.forEach(suggestion => console.log(`   • ${suggestion}`));
    } else {
      console.log('   • Review for logical separation opportunities');
    }
    console.log();
  } catch (error) {
    console.log(`   • Error reading function: ${error.message}`);
  }
}

// Generate refactoring plan
console.log('📋 **REFACTORING EXECUTION PLAN:**\n');

console.log('**Phase 1: Quick Wins (1-2 hours)**');
console.log('- Extract simple validation functions');
console.log('- Move logging statements to helper functions');
console.log('- Break up obvious conditional chains');
console.log();

console.log('**Phase 2: Structural Changes (2-4 hours)**');
console.log('- Refactor complex business logic functions');
console.log('- Implement strategy patterns for large if-else chains');
console.log('- Create pipeline functions for data processing');
console.log();

console.log('**Phase 3: Architecture Improvements (4-8 hours)**');
console.log('- Separate concerns in mixed-responsibility functions');
console.log('- Extract service classes for complex operations');
console.log('- Implement command pattern for complex actions');
console.log();

// Create ESLint override to track progress
const eslintOverride = {
  rules: {
    'max-lines-per-function': ['error', { max: 40, skipComments: true, skipBlankLines: true }],
  },
  overrides: longFunctions.slice(0, 5).map(func => ({
    files: [func.file],
    rules: {
      'max-lines-per-function': [
        'warn',
        { max: func.length - 5, skipComments: true, skipBlankLines: true },
      ],
    },
  })),
};

fs.writeFileSync(
  '.eslintrc.function-length.js',
  `module.exports = ${JSON.stringify(eslintOverride, null, 2)};`
);

console.log('✅ Created .eslintrc.function-length.js for gradual improvement tracking');
console.log();

console.log('🎯 **SUMMARY:**');
console.log(`• Found ${longFunctions.length} functions exceeding ${maxLines} lines`);
console.log(`• Longest function: ${longFunctions[0]?.length || 0} lines`);
console.log('• Refactoring plan created with prioritized targets');
console.log('• ESLint configuration generated for progress tracking');
console.log();

console.log('📝 **NEXT STEPS:**');
console.log('1. Review priority functions listed above');
console.log('2. Start with Phase 1 quick wins');
console.log('3. Use ESLint to track progress');
console.log('4. Run this script again after refactoring to measure improvement');
