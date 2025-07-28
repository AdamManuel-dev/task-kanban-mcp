#!/usr/bin/env node

// Load environment variables before other imports
require('dotenv').config();

console.log('Dotenv loaded, starting imports...');

import { Command } from 'commander';
import { config } from '../config';
import { dbConnection } from '../database/connection';
// import { registerTaskCommands } from './commands/tasks';
// import { registerBoardCommands } from './commands/boards/index';
// import { registerContextCommands } from './commands/context';
// import { registerTagCommands } from './commands/tags';
// import { registerNoteCommands } from './commands/notes';
// import { registerExportCommands } from './commands/export';
// import { registerBackupCommands } from './commands/backup';
// import { registerRealtimeCommands } from './commands/realtime';
// import { registerSearchCommands } from './commands/search';
// import { registerPriorityCommands } from './commands/priority';
// import { registerSubtaskCommands } from './commands/subtasks';
// import { registerDatabaseCommands } from './commands/database';
// import { registerConfigCommands } from './commands/config';
// import { createTemplatesCommand } from './commands/templates';
// import { createDependenciesCommand } from './commands/dependencies';
// import { registerNextCommands } from './commands/next';
// import { addEnvironmentCommands } from './commands/environment';
// import { registerResourceCommands } from './commands/resources';
// import { registerPerformanceCommands } from './commands/performance';
import { CLIServiceContainer } from './services/ServiceContainer';
import { ApiClientWrapper } from './api-client-wrapper';
import { logger } from '../utils/logger';
import { OutputFormatter } from './formatter';
import { SpinnerManager } from './utils/spinner';
import { ConfigManager } from './config';
import { initializeResourceMonitoring } from '../utils/resource-monitor';
import type { CliComponents } from './types';

// Global CLI components
declare global {
  // eslint-disable-next-line no-var
  var cliComponents: CliComponents;
}

const program = new Command();

program.name('kanban').description('MCP Kanban CLI').version('1.0.0');

// Initialize CLI components
const initializeComponents = async (): Promise<CliComponents> => {
  const configManager = new ConfigManager();
  const apiClient = new ApiClientWrapper(configManager, {
    spinner: { defaultTimeout: 30000, showByDefault: true },
  });
  const formatter = new OutputFormatter();

  // Initialize database connection
  await dbConnection.initialize({ skipSchema: false });

  // Initialize service container
  const serviceContainer = CLIServiceContainer.getInstance();
  const services = await serviceContainer.getServices();

  // Initialize resource monitoring
  initializeResourceMonitoring({
    memoryThreshold: 512, // 512MB
    cpuThreshold: 80, // 80%
    heapThreshold: 90, // 90%
    enableAlerts: process.env.NODE_ENV !== 'test',
    enableLogging: process.env.DEBUG === 'true',
  });

  return {
    config: configManager,
    apiClient,
    formatter,
    services,
  };
};

// Global error handler for CLI
const setupGlobalErrorHandler = (): void => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception in CLI', { error });
    // eslint-disable-next-line no-console
    console.error('\n❌ Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, rejectedPromise) => {
    logger.error('Unhandled promise rejection in CLI', { reason, promise: rejectedPromise });
    // eslint-disable-next-line no-console
    console.error('\n❌ Unhandled Rejection at:', rejectedPromise, 'reason:', reason);
    process.exit(1);
  });

  // Graceful shutdown handling (Ctrl+C)
  process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n👋 Shutting down gracefully...');
    process.exit(0);
  });
};

// Health check command
program
  .command('health')
  .description('Check system health')
  .action(async () => {
    try {
      const components = await initializeComponents();
      const spinner = new SpinnerManager();

      spinner.start('🔍 Checking system health...');

      // Check database connection
      await dbConnection.initialize({ skipSchema: false });
      spinner.succeed('Database connection: OK');

      // Check API server
      try {
        await components.apiClient.getHealth();
        spinner.succeed('API server: OK');
      } catch (error) {
        spinner.warn('API server: Not available (running in standalone mode)');
      }

      // Check config
      spinner.succeed('Configuration: OK');
      console.log(`   Database: ${config.database.path}`);
      console.log(`   Port: ${config.server.port}`);

      console.log('\n🎉 System is healthy!');
    } catch (error) {
      logger.error('System health check failed', { error });
      // eslint-disable-next-line no-console
      console.error('❌ System health check failed:', error);
      process.exit(1);
    }
  });

// Initialize components and register commands
const main = async (): Promise<void> => {
  try {
    // Setup global error handling
    setupGlobalErrorHandler();

    console.log('Starting CLI initialization...');

    // Initialize components
    global.cliComponents = await initializeComponents();
    
    console.log('Components initialized successfully');

    // Register all command modules
    // registerTaskCommands(program);
    // registerBoardCommands(program);
    // registerContextCommands(program);
    // registerTagCommands(program);
    // registerNoteCommands(program);
    // registerExportCommands(program);
    // registerBackupCommands(program);
    // registerRealtimeCommands(program);
    // registerSearchCommands(program);
    // registerPriorityCommands(program);
    // registerSubtaskCommands(program);
    // registerDatabaseCommands(program);
    // registerConfigCommands(program);
    // registerNextCommands(program);
    // addEnvironmentCommands(program);
    // registerResourceCommands(program);
    // registerPerformanceCommands(program);
    // program.addCommand(createTemplatesCommand());
    // program.addCommand(createDependenciesCommand());

    // Parse command line arguments
    program.parse(process.argv);
  } catch (error) {
    logger.error('CLI initialization failed', { error });
    // eslint-disable-next-line no-console
    console.error('❌ CLI initialization failed:', error);
    process.exit(1);
  }
};

// Run the CLI
main().catch(error => {
  logger.error('CLI execution failed', { error });
  // eslint-disable-next-line no-console
  console.error('❌ CLI execution failed:', error);
  process.exit(1);
});
