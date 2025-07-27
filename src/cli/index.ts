#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

import { ConfigManager } from './config';
import { ApiClient } from './client';
import { OutputFormatter } from './formatter';

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

const packageJson = require('../../package.json');

const program = new Command();

// Initialize global components
const config = new ConfigManager();
const apiClient = new ApiClient(config);
const formatter = new OutputFormatter();

// Make globally available to commands
(global as any).cliComponents = {
  config,
  apiClient,
  formatter,
};

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
      if (command !== 'config' && command !== 'help') {
        console.error(chalk.red('No configuration found. Run "kanban config set" first.'));
        process.exit(1);
      }
    }
  });

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

// Global error handler
program.exitOverride(err => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  if (err.code === 'commander.version') {
    process.exit(0);
  }

  console.error(chalk.red('Error:'), err.message);
  if (program.opts().verbose) {
    console.error(err.stack);
  }
  process.exit(1);
});

// Handle no command provided
if (process.argv.length <= 2) {
  program.help();
}

// Parse command line arguments
program.parse();

export { program };
