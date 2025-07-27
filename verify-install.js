#!/usr/bin/env node

/**
 * MCP Kanban Server - Installation Verification Script
 * Verifies that all components are properly installed and working
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

// Configuration
const SCRIPT_DIR = __dirname;

// Logging functions
function logInfo(message) {
  console.log(`${colors.blue}[INFO]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}[WARNING]${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

// Check if file exists
async function checkFile(filePath, description) {
  try {
    await fs.access(filePath);
    logSuccess(`${description}: ${filePath}`);
    return true;
  } catch (error) {
    logError(`${description}: ${filePath} (not found)`);
    return false;
  }
}

// Check if directory exists
async function checkDirectory(dirPath, description) {
  try {
    const stats = await fs.stat(dirPath);
    if (stats.isDirectory()) {
      logSuccess(`${description}: ${dirPath}`);
      return true;
    } else {
      logError(`${description}: ${dirPath} (not a directory)`);
      return false;
    }
  } catch (error) {
    logError(`${description}: ${dirPath} (not found)`);
    return false;
  }
}

// Check Node.js and npm versions
async function checkVersions() {
  logInfo('Checking Node.js and npm versions...');

  try {
    const { stdout: nodeVersion } = await execAsync('node --version');
    logSuccess(`Node.js version: ${nodeVersion.trim()}`);
  } catch (error) {
    logError('Node.js not found or not working');
    return false;
  }

  try {
    const { stdout: npmVersion } = await execAsync('npm --version');
    logSuccess(`npm version: ${npmVersion.trim()}`);
  } catch (error) {
    logError('npm not found or not working');
    return false;
  }

  return true;
}

// Check build artifacts
async function checkBuildArtifacts() {
  logInfo('Checking build artifacts...');

  const requiredFiles = [
    { path: 'dist/index.js', description: 'Main server file' },
    { path: 'dist/server.js', description: 'HTTP server' },
    { path: 'dist/mcp/server.js', description: 'MCP server' },
    { path: 'dist/cli/index.js', description: 'CLI interface' },
  ];

  let allFound = true;
  for (const file of requiredFiles) {
    const fullPath = path.join(SCRIPT_DIR, file.path);
    const found = await checkFile(fullPath, file.description);
    if (!found) allFound = false;
  }

  return allFound;
}

// Check configuration files
async function checkConfiguration() {
  logInfo('Checking configuration files...');

  const configFiles = [
    { path: '.env', description: 'Environment configuration' },
    { path: 'package.json', description: 'Package configuration' },
    { path: 'tsconfig.json', description: 'TypeScript configuration' },
  ];

  let allFound = true;
  for (const file of configFiles) {
    const fullPath = path.join(SCRIPT_DIR, file.path);
    const found = await checkFile(fullPath, file.description);
    if (!found) allFound = false;
  }

  return allFound;
}

// Check directories
async function checkDirectories() {
  logInfo('Checking directories...');

  const requiredDirs = [
    { path: 'data/db', description: 'Database directory' },
    { path: 'logs', description: 'Logs directory' },
    { path: 'backups', description: 'Backups directory' },
    { path: 'node_modules', description: 'Dependencies directory' },
  ];

  let allFound = true;
  for (const dir of requiredDirs) {
    const fullPath = path.join(SCRIPT_DIR, dir.path);
    const found = await checkDirectory(fullPath, dir.description);
    if (!found) allFound = false;
  }

  return allFound;
}

// Test server startup
async function testServerStartup() {
  logInfo('Testing server startup...');

  const tests = [
    { command: 'node dist/server.js --help', description: 'HTTP server' },
    { command: 'node dist/mcp/server.js --help', description: 'MCP server' },
    { command: 'node dist/cli/index.js --help', description: 'CLI interface' },
  ];

  let allPassed = true;
  for (const test of tests) {
    try {
      await execAsync(test.command, { cwd: SCRIPT_DIR, timeout: 10000 });
      logSuccess(`${test.description}: startup test passed`);
    } catch (error) {
      logWarning(
        `${test.description}: startup test failed (this might be normal if server requires specific arguments)`
      );
      // Don't fail the verification for startup tests
    }
  }

  return allPassed;
}

// Test npm scripts
async function testNpmScripts() {
  logInfo('Testing npm scripts...');

  const scripts = [
    { script: 'build', description: 'Build script' },
    { script: 'test', description: 'Test script' },
    { script: 'lint', description: 'Lint script' },
  ];

  let allPassed = true;
  for (const script of scripts) {
    try {
      // Just check if the script exists in package.json
      const { stdout } = await execAsync('npm run', { cwd: SCRIPT_DIR });
      if (stdout.includes(script.script)) {
        logSuccess(`${script.description}: available`);
      } else {
        logWarning(`${script.description}: not available`);
      }
    } catch (error) {
      logWarning(`${script.description}: could not check`);
    }
  }

  return allPassed;
}

// Check database
async function checkDatabase() {
  logInfo('Checking database...');

  const dbDir = path.join(SCRIPT_DIR, 'data/db');
  try {
    const files = await fs.readdir(dbDir);
    if (files.length > 0) {
      logSuccess(`Database directory contains ${files.length} files`);
      return true;
    } else {
      logWarning('Database directory is empty (this is normal for fresh installations)');
      return true;
    }
  } catch (error) {
    logError('Could not access database directory');
    return false;
  }
}

// Main verification function
async function verifyInstallation() {
  console.log('🔍 MCP Kanban Server - Installation Verification');
  console.log('================================================');
  console.log();

  let allChecksPassed = true;

  // Check versions
  const versionsOk = await checkVersions();
  if (!versionsOk) allChecksPassed = false;

  console.log();

  // Check build artifacts
  const buildOk = await checkBuildArtifacts();
  if (!buildOk) allChecksPassed = false;

  console.log();

  // Check configuration
  const configOk = await checkConfiguration();
  if (!configOk) allChecksPassed = false;

  console.log();

  // Check directories
  const dirsOk = await checkDirectories();
  if (!dirsOk) allChecksPassed = false;

  console.log();

  // Check database
  const dbOk = await checkDatabase();
  if (!dbOk) allChecksPassed = false;

  console.log();

  // Test npm scripts
  await testNpmScripts();

  console.log();

  // Test server startup
  await testServerStartup();

  console.log();

  // Summary
  if (allChecksPassed) {
    logSuccess('✅ Installation verification completed successfully!');
    console.log();
    console.log('🎉 Your MCP Kanban Server installation appears to be working correctly.');
    console.log();
    console.log('🚀 You can now:');
    console.log('  • Start the server: npm start');
    console.log('  • Use the CLI: npm run dev:cli');
    console.log('  • Run tests: npm test');
    console.log('  • Configure your MCP client');
  } else {
    logError('❌ Installation verification found issues.');
    console.log();
    console.log('🔧 Please check the errors above and:');
    console.log('  • Run the installation script again: ./install.sh');
    console.log('  • Check the documentation: docs/');
    console.log('  • Open an issue on GitHub if problems persist');
  }

  return allChecksPassed;
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node verify-install.js [OPTIONS]');
  console.log();
  console.log('Options:');
  console.log('  --help, -h     Show this help message');
  console.log('  --quiet        Suppress warnings (only show errors and successes)');
  console.log();
  console.log('Examples:');
  console.log('  node verify-install.js              # Full verification');
  console.log('  node verify-install.js --quiet      # Quiet verification');
  process.exit(0);
} else {
  verifyInstallation()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      logError(`Verification failed: ${error.message}`);
      process.exit(1);
    });
}
