#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

import { ConfigManager } from './config';
import { ApiClient } from './client';
import { OutputFormatter } from './formatter';
import type { CliComponents } from './types';
import { addSecurityMiddleware } from './utils/secure-cli-wrapper';

import { registerTaskCommands } from './commands/tasks';
import { registerBoardCommands } from './commands/boards';
import { registerNoteCommands } from './commands/notes';
import { registerTagCommands } from './commands/tags';
import { registerConfigCommands } from './commands/config';
import { registerPriorityCommands } from './commands/priority';
import { registerContextCommands } from './commands/context';
import { registerSearchCommands } from './commands/search';
import { registerSubtaskCommands } from './commands/subtasks';
import { registerBackupCommands } from './commands/backup';
import { registerDatabaseCommands } from './commands/database';
import { registerRealtimeCommands } from './commands/realtime';
import { registerExportCommands } from './commands/export';
import { processTodosCommand } from './commands/process-todos';
// import { interactiveViewCommand } from './commands/interactive-view'; // Temporarily disabled due to Ink/React ESM issues
// import { dashboardCommand } from './commands/dashboard'; // Temporarily disabled due to Ink/React ESM issues
// import { dashboardDemoCommand } from './commands/dashboard-demo'; // Temporarily disabled due to Ink/React ESM issues
import packageJson from '../../package.json';

const program = new Command();

// Initialize global components
const config = new ConfigManager();
const apiClient = new ApiClient(config);
const formatter = new OutputFormatter();

// Make globally available to commands with proper typing
global.cliComponents = {
  config,
  apiClient,
  formatter,
} as CliComponents;

// Program configuration
program
  .name('kanban')
  .description('CLI for MCP Kanban Task Management System')
  .version(packageJson.version)
  .option('-v, --verbose', 'verbose output')
  .option('-q, --quiet', 'minimal output')
  .option('--format <type>', 'output format: table, json, csv', 'table')
  .option('--no-color', 'disable colored output')
  .hook('preAction', async thisCommand => {
    const options = thisCommand.opts();

    // Set formatter options
    formatter.setFormat(options.format);
    formatter.setVerbose(options.verbose);
    formatter.setQuiet(options.quiet);
    formatter.setColor(!options.noColor);

    // Validate configuration exists
    if (!config.exists()) {
      const command = thisCommand.name();
      const parentCommand = thisCommand.parent?.name();
      const grandParentCommand = thisCommand.parent?.parent?.name();

      // Allow config commands and help
      if (
        command !== 'config' &&
        command !== 'help' &&
        parentCommand !== 'config' &&
        grandParentCommand !== 'config'
      ) {
        console.error(
          chalk.red('No configuration found. Run "kanban config init" to get started.')
        );
        process.exit(1);
      }
    }
  });

// Add security middleware to the program
addSecurityMiddleware(program);

// Register command modules
registerTaskCommands(program);
registerBoardCommands(program);
registerNoteCommands(program);
registerTagCommands(program);
registerConfigCommands(program);
registerPriorityCommands(program);
registerContextCommands(program);
registerSearchCommands(program);
registerSubtaskCommands(program);
registerBackupCommands(program);
registerDatabaseCommands(program);
registerRealtimeCommands(program);
registerExportCommands(program);

// Register development commands
program.addCommand(processTodosCommand);
// program.addCommand(interactiveViewCommand); // Temporarily disabled due to Ink/React ESM issues
// program.addCommand(dashboardCommand); // Temporarily disabled due to Ink/React ESM issues
// program.addCommand(dashboardDemoCommand); // Temporarily disabled due to Ink/React ESM issues

// Enhanced global error handler
program.exitOverride(err => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  if (err.code === 'commander.version') {
    process.exit(0);
  }

  // Handle different error types
  const errorMessage = formatError(err);
  console.error(errorMessage);

  if (program.opts().verbose) {
    console.error(chalk.gray('\nStack trace:'));
    console.error(chalk.gray(err.stack || 'No stack trace available'));
  }

  // Log error to file if possible
  logErrorToFile(err);

  process.exit(getExitCode(err));
});

/**
 * Format error message with appropriate styling
 */
function formatError(error: Error): string {
  const timestamp = new Date().toISOString();

  // Check error type and format accordingly
  if (error.name === 'PromptCancelledError') {
    return chalk.yellow('\n⚠️  Operation cancelled by user');
  }

  if (error.name === 'SpinnerError') {
    return chalk.red(`\n❌ ${error.message}`);
  }

  if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
    return (
      chalk.red('\n❌ Connection Error: Unable to connect to the server') +
      chalk.gray('\n   • Check if the server is running') +
      chalk.gray('\n   • Verify the server URL in config: kanban config show') +
      chalk.gray('\n   • Test connection: kanban config test')
    );
  }

  if (error.message.includes('401') || error.message.includes('Unauthorized')) {
    return (
      chalk.red('\n❌ Authentication Error: Invalid credentials') +
      chalk.gray('\n   • Check your API key: kanban config show') +
      chalk.gray('\n   • Update credentials: kanban config set auth.apiKey <key>')
    );
  }

  if (error.message.includes('403') || error.message.includes('Forbidden')) {
    return (
      chalk.red('\n❌ Permission Error: Access denied') +
      chalk.gray('\n   • You may not have permission for this resource') +
      chalk.gray('\n   • Contact your administrator')
    );
  }

  if (error.message.includes('404') || error.message.includes('Not Found')) {
    return (
      chalk.red('\n❌ Resource Not Found') +
      chalk.gray('\n   • Check if the resource ID is correct') +
      chalk.gray('\n   • List available resources first')
    );
  }

  if (error.message.includes('timeout')) {
    return (
      chalk.red('\n❌ Request Timeout') +
      chalk.gray('\n   • The operation took too long') +
      chalk.gray('\n   • Try again or check server status')
    );
  }

  if (error.message.includes('Security') || error.message.includes('blocked')) {
    return (
      chalk.red('\n🚫 Security Error: ') +
      error.message +
      chalk.gray('\n   • Input contained potentially dangerous content') +
      chalk.gray('\n   • Use: kanban security events (to see details)') +
      chalk.gray('\n   • Use: kanban security report (for full report)')
    );
  }

  if (error.message.includes('sanitiz') || error.message.includes('Suspicious')) {
    return (
      chalk.yellow('\n⚠️  Input Security Warning: ') +
      error.message +
      chalk.gray('\n   • Input was modified for security') +
      chalk.gray('\n   • Check: kanban security events')
    );
  }

  // Generic error formatting
  return (
    chalk.red('\n❌ Error: ') +
    error.message +
    chalk.gray(`\n   Time: ${timestamp}`) +
    chalk.gray('\n   Use --verbose for more details')
  );
}

/**
 * Get appropriate exit code based on error type
 */
function getExitCode(error: Error): number {
  if (error.name === 'PromptCancelledError') return 130; // SIGINT equivalent
  if (error.message.includes('ECONNREFUSED')) return 111; // Connection refused
  if (error.message.includes('401') || error.message.includes('Unauthorized')) return 401;
  if (error.message.includes('403') || error.message.includes('Forbidden')) return 403;
  if (error.message.includes('404') || error.message.includes('Not Found')) return 404;
  return 1; // Generic error
}

/**
 * Log error to file for debugging (optional)
 */
function logErrorToFile(error: Error): void {
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const logDir = path.join(os.homedir(), '.config', 'mcp-kanban', 'logs');
    const logFile = path.join(logDir, 'cli-errors.log');

    // Create log directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      command: process.argv.slice(2).join(' '),
      nodeVersion: process.version,
      platform: process.platform,
    };

    fs.appendFileSync(logFile, `${JSON.stringify(logEntry)}\n`);
  } catch (logError) {
    // Silently fail if logging doesn't work
  }
}

// Process-level error handlers
process.on('uncaughtException', error => {
  console.error(chalk.red('\n💥 Uncaught Exception:'));
  console.error(formatError(error));
  logErrorToFile(error);
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  console.error(chalk.red('\n💥 Unhandled Promise Rejection:'));
  console.error(formatError(error));
  logErrorToFile(error);
  process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n⚠️  Received SIGINT, shutting down gracefully...'));
  // Clean up spinners and other resources
  if (global.cliComponents?.apiClient) {
    // Cleanup any ongoing requests
  }
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n⚠️  Received SIGTERM, shutting down gracefully...'));
  process.exit(143);
});

// Handle no command provided
if (process.argv.length <= 2) {
  program.help();
}

// Parse command line arguments
program.parse();

export { program };
