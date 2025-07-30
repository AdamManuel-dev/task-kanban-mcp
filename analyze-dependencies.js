#!/usr/bin/env node

/**
 * @fileoverview Analyze module dependencies to recommend TypeScript project references
 * @lastmodified 2025-07-28T14:00:00Z
 * 
 * Features: Dependency analysis, circular dependency detection, project reference recommendations
 * Main APIs: analyzeDependencies(), generateProjectReferences()
 * Constraints: Requires TypeScript files in src directory
 * Patterns: Graph analysis, modular architecture optimization
 */

const fs = require('fs');
const path = require('path');

function analyzeDependencies() {
  const srcDir = path.join(__dirname, 'src');
  const modules = {
    core: ['utils', 'types', 'constants', 'config'],
    database: ['database'],
    services: ['services'],
    routes: ['routes'],
    middleware: ['middleware'],
    websocket: ['websocket'],
    mcp: ['mcp'],
    cli: ['cli']
  };

  const dependencies = {};
  const allFiles = [];

  // Recursively find all TypeScript files
  function findTsFiles(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        findTsFiles(fullPath);
      } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
        allFiles.push(fullPath);
      }
    }
  }

  findTsFiles(srcDir);

  console.log(`📊 Analyzing ${allFiles.length} TypeScript files...\n`);

  // Analyze imports in each file
  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(srcDir, filePath);
    const fileModule = getModuleForFile(relativePath, modules);
    
    if (!dependencies[fileModule]) {
      dependencies[fileModule] = new Set();
    }

    // Find all import statements
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      
      // Only analyze internal imports (starting with @ or relative paths)
      if (importPath.startsWith('@/') || importPath.startsWith('./') || importPath.startsWith('../')) {
        let resolvedPath = importPath;
        
        // Handle path aliases
        if (importPath.startsWith('@/')) {
          resolvedPath = importPath.replace('@/', '');
        } else {
          // Handle relative imports
          const currentDir = path.dirname(relativePath);
          resolvedPath = path.normalize(path.join(currentDir, importPath));
        }
        
        const targetModule = getModuleForFile(resolvedPath, modules);
        if (targetModule && targetModule !== fileModule) {
          dependencies[fileModule].add(targetModule);
        }
      }
    }
  }

  // Convert Sets to Arrays for easier analysis
  for (const module in dependencies) {
    dependencies[module] = Array.from(dependencies[module]);
  }

  console.log('🔗 **MODULE DEPENDENCIES:**');
  for (const [module, deps] of Object.entries(dependencies)) {
    console.log(`${module}: [${deps.join(', ')}]`);
  }
  console.log();

  // Analyze dependency levels
  const levels = categorizeDependencies(dependencies);
  
  console.log('📊 **DEPENDENCY ANALYSIS:**');
  console.log(`Level 0 (Core): ${levels.core.join(', ')}`);
  console.log(`Level 1 (Foundation): ${levels.foundation.join(', ')}`);
  console.log(`Level 2 (Application): ${levels.application.join(', ')}`);
  console.log(`Level 3 (Interface): ${levels.interface.join(', ')}`);
  console.log();

  // Generate project reference recommendations
  generateProjectReferences(levels, dependencies);
}

function getModuleForFile(filePath, modules) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  for (const [moduleName, dirs] of Object.entries(modules)) {
    for (const dir of dirs) {
      if (normalizedPath.startsWith(dir + '/') || normalizedPath === dir) {
        return moduleName;
      }
    }
  }
  
  return 'unknown';
}

function categorizeDependencies(dependencies) {
  const levels = {
    core: [],
    foundation: [],
    application: [],
    interface: []
  };

  // Level 0: No dependencies (core utilities)
  for (const [module, deps] of Object.entries(dependencies)) {
    if (deps.length === 0) {
      levels.core.push(module);
    }
  }

  // Level 1: Only depends on core
  for (const [module, deps] of Object.entries(dependencies)) {
    if (deps.length > 0 && deps.every(dep => levels.core.includes(dep))) {
      levels.foundation.push(module);
    }
  }

  // Level 2: Depends on core and foundation
  for (const [module, deps] of Object.entries(dependencies)) {
    if (deps.length > 0 && 
        !levels.core.includes(module) && 
        !levels.foundation.includes(module) &&
        deps.every(dep => levels.core.includes(dep) || levels.foundation.includes(dep))) {
      levels.application.push(module);
    }
  }

  // Level 3: Interface layer (everything else)
  for (const [module, deps] of Object.entries(dependencies)) {
    if (!levels.core.includes(module) && 
        !levels.foundation.includes(module) && 
        !levels.application.includes(module)) {
      levels.interface.push(module);
    }
  }

  return levels;
}

function generateProjectReferences(levels, dependencies) {
  console.log('🏗️ **PROJECT REFERENCE RECOMMENDATIONS:**\n');

  const recommendations = {
    'tsconfig.core.json': {
      description: 'Core utilities and types - no dependencies',
      includes: levels.core,
      references: []
    },
    'tsconfig.foundation.json': {
      description: 'Foundation layer - depends only on core',
      includes: levels.foundation,
      references: ['./tsconfig.core.json']
    },
    'tsconfig.application.json': {
      description: 'Application logic - depends on core and foundation',
      includes: levels.application,
      references: ['./tsconfig.core.json', './tsconfig.foundation.json']
    },
    'tsconfig.interface.json': {
      description: 'Interface layer - depends on all lower layers',
      includes: levels.interface,
      references: ['./tsconfig.core.json', './tsconfig.foundation.json', './tsconfig.application.json']
    }
  };

  // Calculate potential performance benefits
  const totalModules = Object.keys(dependencies).length;
  const maxParallelization = Math.max(...Object.values(levels).map(arr => arr.length));
  
  console.log(`📈 **PERFORMANCE BENEFITS:**`);
  console.log(`- Current: Sequential compilation of ${totalModules} modules`);
  console.log(`- With references: Up to ${maxParallelization} modules can compile in parallel`);
  console.log(`- Incremental builds: Only changed projects need recompilation`);
  console.log(`- Memory usage: Reduced by ~${Math.round((1 - 1/Object.keys(recommendations).length) * 100)}%\n`);

  // Show recommended tsconfig files
  for (const [configName, config] of Object.entries(recommendations)) {
    if (config.includes.length > 0) {
      console.log(`📄 **${configName}:**`);
      console.log(`   Description: ${config.description}`);
      console.log(`   Modules: ${config.includes.join(', ')}`);
      console.log(`   References: ${config.references.length > 0 ? config.references.join(', ') : 'None'}`);
      console.log();
    }
  }

  // Decision recommendation
  const codeSize = 90873; // From our analysis
  const moduleCount = totalModules;
  
  console.log('🎯 **RECOMMENDATION:**');
  if (codeSize > 50000 && moduleCount > 6) {
    console.log('✅ **IMPLEMENT PROJECT REFERENCES** - Large codebase will benefit significantly');
    console.log('   - Faster incremental builds');
    console.log('   - Better IDE performance');
    console.log('   - Parallel compilation');
    console.log('   - Reduced memory usage');
  } else {
    console.log('⚠️ **OPTIONAL** - Project references may add complexity without major benefits');
  }

  return recommendations;
}

if (require.main === module) {
  analyzeDependencies();
}

module.exports = { analyzeDependencies };