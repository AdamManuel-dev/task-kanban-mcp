#!/usr/bin/env node

/**
 * @fileoverview TypeScript trace analyzer to identify performance bottlenecks
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Parse tsc trace output, identify slow operations, suggest optimizations
 * Main APIs: analyzeTrace(), generateReport()
 * Constraints: Requires trace.json from tsc --generateTrace
 * Patterns: Analyzes duration, file parsing times, type checking bottlenecks
 */

const fs = require('fs');
const path = require('path');

function analyzeTrace() {
  const traceFile = path.join(__dirname, 'trace-new', 'trace.json');

  if (!fs.existsSync(traceFile)) {
    console.error('Trace file not found. Run: npx tsc --generateTrace trace --noEmit');
    process.exit(1);
  }

  const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));

  // Analyze different types of operations
  const operations = {
    parsing: [],
    binding: [],
    checking: [],
    emit: [],
  };

  // Process trace events
  trace.forEach(event => {
    if (event.ph === 'X' || (event.ph === 'B' && event.dur)) {
      const operation = {
        name: event.name,
        duration: event.dur || 0,
        args: event.args || {},
        category: event.cat,
      };

      if (event.name.includes('parse') || event.name.includes('createSourceFile')) {
        operations.parsing.push(operation);
      } else if (event.name.includes('bind')) {
        operations.binding.push(operation);
      } else if (event.name.includes('check') || event.name.includes('Type')) {
        operations.checking.push(operation);
      } else if (event.name.includes('emit')) {
        operations.emit.push(operation);
      }
    }
  });

  // Generate report
  console.log('=== TypeScript Compilation Performance Analysis ===\n');

  // Parse operations analysis
  if (operations.parsing.length > 0) {
    const sortedParsing = operations.parsing.sort((a, b) => b.duration - a.duration);
    console.log('🔍 SLOWEST PARSING OPERATIONS:');
    sortedParsing.slice(0, 10).forEach((op, i) => {
      const durationMs = (op.duration / 1000).toFixed(2);
      const fileName = op.args.path ? path.basename(op.args.path) : op.args.fileName || 'unknown';
      console.log(`${i + 1}. ${fileName} - ${durationMs}ms`);
    });
    console.log();
  }

  // Find slowest overall operations
  const allOperations = [
    ...operations.parsing,
    ...operations.binding,
    ...operations.checking,
    ...operations.emit,
  ];
  const slowest = allOperations.sort((a, b) => b.duration - a.duration).slice(0, 15);

  console.log('⚡ SLOWEST OPERATIONS OVERALL:');
  slowest.forEach((op, i) => {
    const durationMs = (op.duration / 1000).toFixed(2);
    const fileName = op.args.path
      ? path.basename(op.args.path)
      : op.args.fileName
        ? path.basename(op.args.fileName)
        : op.name;
    console.log(`${i + 1}. ${op.name} (${fileName}) - ${durationMs}ms`);
  });
  console.log();

  // Analyze file types
  const fileTypes = {};
  operations.parsing.forEach(op => {
    if (op.args.path) {
      const ext = path.extname(op.args.path);
      if (!fileTypes[ext]) fileTypes[ext] = { count: 0, totalTime: 0 };
      fileTypes[ext].count++;
      fileTypes[ext].totalTime += op.duration;
    }
  });

  console.log('📁 FILE TYPE ANALYSIS:');
  Object.entries(fileTypes)
    .sort((a, b) => b[1].totalTime - a[1].totalTime)
    .forEach(([ext, data]) => {
      const avgTime = (data.totalTime / data.count / 1000).toFixed(2);
      const totalTime = (data.totalTime / 1000).toFixed(2);
      console.log(
        `${ext || 'no-ext'}: ${data.count} files, ${totalTime}ms total, ${avgTime}ms avg`
      );
    });
  console.log();

  // Generate recommendations
  console.log('💡 OPTIMIZATION RECOMMENDATIONS:');

  const totalParsingTime = operations.parsing.reduce((sum, op) => sum + op.duration, 0);
  const nodeModulesTime = operations.parsing
    .filter(op => op.args.path && op.args.path.includes('node_modules'))
    .reduce((sum, op) => sum + op.duration, 0);

  if (nodeModulesTime > totalParsingTime * 0.5) {
    console.log(
      '1. 🔧 Consider using TypeScript Project References to avoid re-parsing node_modules'
    );
  }

  if (operations.parsing.some(op => op.duration > 50000)) {
    console.log(
      '2. ⚡ Large files detected - consider code splitting for files taking >50ms to parse'
    );
  }

  const reactTime = operations.parsing
    .filter(op => op.args.path && op.args.path.includes('@types/react'))
    .reduce((sum, op) => sum + op.duration, 0);

  if (reactTime > 50000) {
    console.log(
      '3. ⚛️ React types are slow - consider using skipLibCheck or more specific imports'
    );
  }

  console.log('4. 🏗️ Enable incremental compilation with "incremental": true in tsconfig.json');
  console.log('5. 🎯 Use "skipLibCheck": true to skip type checking of declaration files');
  console.log('6. 📦 Consider using "typeRoots" to limit which types are loaded');
}

if (require.main === module) {
  analyzeTrace();
}

module.exports = { analyzeTrace };
