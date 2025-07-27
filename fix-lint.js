#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get all TypeScript files
function getAllTsFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      getAllTsFiles(fullPath, files);
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Quick fixes for common issues
function quickFix(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Remove unused imports by checking if they're used in the file
  const lines = content.split('\n');
  const newLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip import lines that import unused types
    if (line.includes('import type {') || line.includes('import {')) {
      const importMatch = line.match(/import\s+(?:type\s+)?{([^}]+)}/);
      if (importMatch) {
        const imports = importMatch[1].split(',').map(s => s.trim());
        const usedImports = imports.filter(imp => {
          const cleanImp = imp.replace(/\s+as\s+\w+/, '');
          return content.includes(cleanImp) && (content.indexOf(cleanImp) !== content.indexOf(line));
        });
        
        if (usedImports.length === 0) {
          changed = true;
          continue; // Skip this import line
        } else if (usedImports.length !== imports.length) {
          const newLine = line.replace(/\{[^}]+\}/, `{${usedImports.join(', ')}}`);
          newLines.push(newLine);
          changed = true;
          continue;
        }
      }
    }
    
    newLines.push(line);
  }
  
  if (changed) {
    content = newLines.join('\n');
    fs.writeFileSync(filePath, content);
    console.log(`Fixed imports in ${filePath}`);
  }
}

// Process files
const files = getAllTsFiles('./src').concat(getAllTsFiles('./tests'));
console.log(`Processing ${files.length} files...`);

files.forEach(quickFix);

console.log('Quick fixes applied. Running ESLint again...');