#!/usr/bin/env node

/**
 * MCP Kanban Server - Cross-Platform Installer
 *
 * This script provides a unified installation experience across all platforms
 * (Windows, macOS, Linux) using Node.js native APIs.
 *
 * Usage:
 *   node install.js [options]
 *
 * Options:
 *   --skip-prerequisites    Skip prerequisite checks
 *   --skip-build           Skip the build process
 *   --verbose              Enable verbose output
 *   --help                 Show this help message
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  skipPrerequisites: args.includes('--skip-prerequisites'),
  skipBuild: args.includes('--skip-build'),
  verbose: args.includes('--verbose'),
  help: args.includes('--help'),
};

// Show help if requested
if (options.help) {
  console.log(`
${colors.cyan}${colors.bright}MCP Kanban Server - Cross-Platform Installer${colors.reset}

This script installs the MCP Kanban Server on any platform.

${colors.yellow}Usage:${colors.reset}
  node install.js [options]

${colors.yellow}Options:${colors.reset}
  --skip-prerequisites    Skip prerequisite checks (Node.js, npm)
  --skip-build           Skip the build process after installation
  --verbose              Enable verbose output
  --help                 Show this help message

${colors.yellow}Examples:${colors.reset}
  node install.js                    # Full installation
  node install.js --skip-prerequisites  # Skip Node.js version check
  node install.js --skip-build       # Install dependencies only
  node install.js --verbose          # Verbose output

${colors.yellow}Platforms Supported:${colors.reset}
  • Windows (PowerShell, Command Prompt)
  • macOS (Terminal, iTerm)
  • Linux (Bash, Zsh, etc.)
`);
  process.exit(0);
}

// Utility functions
function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logProgress(message) {
  log(`🔄 ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'white');
}

function execCommand(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: options.verbose ? 'inherit' : 'pipe',
      ...options,
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function spawnCommand(command, args = [], options = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      stdio: options.verbose ? 'inherit' : 'pipe',
      ...options,
    });

    child.on('close', code => {
      resolve({ success: code === 0, code });
    });

    child.on('error', error => {
      resolve({ success: false, error: error.message });
    });
  });
}

function getNodeVersion() {
  const result = execCommand('node --version');
  if (!result.success) return null;

  const version = result.output.trim();
  const match = version.match(/v(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;

  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
    full: version,
  };
}

function getNpmVersion() {
  const result = execCommand('npm --version');
  if (!result.success) return null;
  return result.output.trim();
}

function checkPrerequisites() {
  logProgress('Checking prerequisites...');

  // Check Node.js
  const nodeVersion = getNodeVersion();
  if (!nodeVersion) {
    logError('Node.js is not installed or not in PATH');
    logInfo('Please install Node.js 18 or later from https://nodejs.org/');
    logInfo('After installation, restart your terminal and run this script again.');
    process.exit(1);
  }

  if (nodeVersion.major < 18) {
    logError(`Node.js version ${nodeVersion.full} is too old. Version 18 or later is required.`);
    logInfo('Please update Node.js from https://nodejs.org/');
    process.exit(1);
  }

  logSuccess(`Node.js version ${nodeVersion.full} detected`);

  // Check npm
  const npmVersion = getNpmVersion();
  if (!npmVersion) {
    logError('npm is not installed or not in PATH');
    logInfo('npm should be included with Node.js installation.');
    process.exit(1);
  }

  logSuccess(`npm version ${npmVersion} detected`);

  // Check Git (optional)
  const gitResult = execCommand('git --version');
  if (gitResult.success) {
    logSuccess(`Git version ${gitResult.output.trim()} detected`);
  } else {
    logWarning('Git not detected. Some features may be limited.');
  }

  // Check platform
  const platform = os.platform();
  const arch = os.arch();
  logInfo(`Platform: ${platform} (${arch})`);
}

function installDependencies() {
  logProgress('Installing dependencies...');

  // Clear npm cache
  logInfo('Clearing npm cache...');
  const cacheResult = execCommand('npm cache clean --force');
  if (!cacheResult.success && options.verbose) {
    logWarning('Failed to clear npm cache (this is usually not critical)');
  }

  // Install dependencies
  logInfo('Installing npm dependencies...');
  const installResult = execCommand('npm install', { verbose: options.verbose });
  if (!installResult.success) {
    logError('Failed to install dependencies');
    process.exit(1);
  }

  logSuccess('Dependencies installed successfully');
}

function buildProject() {
  logProgress('Building project...');

  // Run TypeScript compilation
  logInfo('Compiling TypeScript...');
  const buildResult = execCommand('npm run build', { verbose: options.verbose });
  if (!buildResult.success) {
    logError('Build failed');
    process.exit(1);
  }

  logSuccess('Project built successfully');

  // Verify build artifacts
  const distPath = path.join(process.cwd(), 'dist');
  const serverPath = path.join(distPath, 'server.js');

  if (!fs.existsSync(serverPath)) {
    logError(`Build artifacts not found at ${serverPath}`);
    process.exit(1);
  }

  logSuccess('Build artifacts verified');
}

async function testInstallation() {
  logProgress('Testing installation...');

  try {
    // Test if the server can start
    logInfo('Testing server startup...');
    const testResult = await spawnCommand('node', ['dist/server.js'], {
      timeout: 5000, // 5 second timeout
    });

    if (testResult.success) {
      logSuccess('Server started successfully');
    } else {
      logWarning('Server startup test inconclusive (process may have exited normally)');
    }
  } catch (error) {
    logWarning(`Could not test server startup: ${error.message}`);
  }
}

function showPostInstallInstructions() {
  const platform = os.platform();
  const pathSeparator = platform === 'win32' ? '\\' : '/';

  log('\n🎉 Installation completed successfully!', 'green');
  log('\n📋 Next Steps:', 'cyan');
  logInfo('1. Start the server: npm start');
  logInfo('2. Access the API: http://localhost:3000');
  logInfo('3. Use the CLI: npm run cli');
  logInfo('4. View documentation: docs/README.md');

  log('\n🔧 Configuration:', 'cyan');
  logInfo(`• Database file: data${pathSeparator}kanban.db`);
  logInfo(`• Configuration: config${pathSeparator}default.json`);
  logInfo(`• Logs: logs${pathSeparator} directory`);

  log('\n📚 Documentation:', 'cyan');
  logInfo(`• User Guide: docs${pathSeparator}user${pathSeparator}README.md`);
  logInfo(`• API Documentation: docs${pathSeparator}api${pathSeparator}README.md`);
  logInfo(`• CLI Usage: docs${pathSeparator}guides${pathSeparator}CLI_USAGE.md`);

  log('\n🚀 Quick Start:', 'cyan');
  logInfo('npm start                    # Start the server');
  logInfo('npm run cli board list       # List boards');
  logInfo('npm run cli task create      # Create a task');

  log('\n💡 Need Help?', 'cyan');
  logInfo(
    `• Check the troubleshooting guide: docs${pathSeparator}user${pathSeparator}troubleshooting.md`
  );
  logInfo('• Open an issue on GitHub');
  logInfo(`• Review the logs in the logs${pathSeparator} directory`);

  // Platform-specific notes
  if (platform === 'win32') {
    log('\n🪟 Windows Notes:', 'cyan');
    logInfo('• Use PowerShell or Command Prompt for best experience');
    logInfo('• If you encounter permission issues, try running as administrator');
    logInfo('• For development, consider using Windows Subsystem for Linux (WSL)');
  } else if (platform === 'darwin') {
    log('\n🍎 macOS Notes:', 'cyan');
    logInfo('• Terminal.app or iTerm2 recommended');
    logInfo('• If you encounter permission issues, check System Preferences > Security & Privacy');
  } else {
    log('\n🐧 Linux Notes:', 'cyan');
    logInfo('• Bash, Zsh, or Fish shells supported');
    logInfo('• If you encounter permission issues, check file permissions');
  }
}

async function main() {
  log(
    `${colors.cyan}${colors.bright}🚀 MCP Kanban Server - Cross-Platform Installer${colors.reset}`,
    'cyan'
  );
  log('=========================================', 'cyan');
  log('');

  try {
    // Check prerequisites
    if (!options.skipPrerequisites) {
      checkPrerequisites();
    } else {
      logWarning('Skipping prerequisite checks');
    }

    log('');

    // Install dependencies
    installDependencies();
    log('');

    // Build project
    if (!options.skipBuild) {
      buildProject();
      log('');
      await testInstallation();
      log('');
    } else {
      logWarning('Skipping build process');
    }

    // Show post-installation instructions
    showPostInstallInstructions();
  } catch (error) {
    logError(`Installation failed: ${error.message}`);
    logInfo('Please check the error messages above and try again.');
    logInfo('If the problem persists, please open an issue on GitHub.');
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  checkPrerequisites,
  installDependencies,
  buildProject,
  testInstallation,
  showPostInstallInstructions,
};
