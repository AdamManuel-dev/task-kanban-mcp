/**
 * @fileoverview Cyclomatic complexity analyzer for TypeScript/JavaScript files
 * @lastmodified 2025-07-31T12:00:00Z
 * 
 * Features: Complexity calculation, function identification, refactoring suggestions
 * Main APIs: analyzeFile(), calculateComplexity(), generateReport()
 * Constraints: Requires AST parsing, targets complexity ≤3
 * Patterns: Reports function name:line:complexity format
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Calculate cyclomatic complexity of a function
 */
function calculateComplexity(code) {
  // Basic complexity calculation based on control structures
  let complexity = 1; // Base complexity
  
  // Count decision points
  const patterns = [
    /\bif\b/g,           // if statements
    /\belse\s+if\b/g,    // else if statements  
    /\bwhile\b/g,        // while loops
    /\bfor\b/g,          // for loops
    /\bswitch\b/g,       // switch statements
    /\bcase\b/g,         // case statements
    /\bcatch\b/g,        // catch blocks
    /\?\s*[^:]+:/g,      // ternary operators
    /&&/g,               // logical AND
    /\|\|/g              // logical OR
  ];
  
  patterns.forEach(pattern => {
    const matches = code.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  });
  
  return complexity;
}

/**
 * Extract functions from TypeScript/JavaScript file content
 */
function extractFunctions(content, filePath) {
  const functions = [];
  const lines = content.split('\n');
  
  // Patterns to match function declarations
  const functionPatterns = [
    /^\s*(export\s+)?(async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
    /^\s*(export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(async\s+)?\(/,
    /^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(\s*.*?\)\s*[{:]/,
    /^\s*(public|private|protected)?\s*(async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/
  ];
  
  let currentFunction = null;
  let braceCount = 0;
  let functionContent = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Check if line starts a function
    if (!currentFunction) {
      for (const pattern of functionPatterns) {
        const match = line.match(pattern);
        if (match) {
          const functionName = match[3] || match[2] || match[1];
          if (functionName && !functionName.includes('test') && !functionName.includes('describe')) {
            currentFunction = {
              name: functionName,
              startLine: lineNum,
              file: filePath
            };
            functionContent = line;
            braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
            break;
          }
        }
      }
    } else {
      // Continue collecting function content
      functionContent += '\n' + line;
      braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      
      // Function ended
      if (braceCount === 0) {
        const complexity = calculateComplexity(functionContent);
        functions.push({
          ...currentFunction,
          endLine: lineNum,
          complexity,
          content: functionContent
        });
        currentFunction = null;
        functionContent = '';
      }
    }
  }
  
  return functions;
}

/**
 * Analyze all TypeScript/JavaScript files in the src directory
 */
function analyzeCodebase() {
  const srcPath = path.join(process.cwd(), 'src');
  const results = [];
  
  function analyzeDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        analyzeDirectory(fullPath);
      } else if (entry.isFile() && /\.(ts|js|tsx|jsx)$/.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const functions = extractFunctions(content, fullPath);
          results.push(...functions);
        } catch (error) {
          console.error(`Error analyzing ${fullPath}:`, error.message);
        }
      }
    }
  }
  
  if (fs.existsSync(srcPath)) {
    analyzeDirectory(srcPath);
  }
  
  return results;
}

/**
 * Generate complexity report
 */
function generateReport() {
  const functions = analyzeCodebase();
  const complexFunctions = functions.filter(f => f.complexity > 3);
  
  console.log('=== COMPLEXITY ANALYSIS REPORT ===\n');
  console.log(`Total functions analyzed: ${functions.length}`);
  console.log(`Functions with complexity > 3: ${complexFunctions.length}\n`);
  
  if (complexFunctions.length > 0) {
    console.log('COMPLEX FUNCTIONS (complexity > 3):');
    console.log('=====================================');
    
    complexFunctions
      .sort((a, b) => b.complexity - a.complexity)
      .forEach(func => {
        const relativePath = func.file.replace(process.cwd() + '/', '');
        console.log(`${func.name} (${relativePath}:${func.startLine}) - Complexity: ${func.complexity}`);
      });
  }
  
  console.log('\nComplexity distribution:');
  const distribution = {};
  functions.forEach(f => {
    distribution[f.complexity] = (distribution[f.complexity] || 0) + 1;
  });
  
  Object.keys(distribution)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(complexity => {
      console.log(`Complexity ${complexity}: ${distribution[complexity]} functions`);
    });
  
  return { functions, complexFunctions };
}

// Run the analysis
if (require.main === module) {
  generateReport();
}

module.exports = { analyzeCodebase, generateReport, calculateComplexity };