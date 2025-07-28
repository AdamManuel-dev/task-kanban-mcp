/**
 * @fileoverview Task commands module - main entry point
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Central registration for all task-related CLI commands
 * Main APIs: registerTaskCommands() - registers all task subcommands
 * Constraints: Requires global.cliComponents to be initialized
 * Patterns: Modular command organization, consistent error handling
 */

import type { Command } from 'commander';
import { registerListCommand } from './list';
import { registerShowCommand } from './show';
import { registerCreateCommand } from './create';
import { registerUpdateCommand } from './update';
import { registerDeleteCommand } from './delete';
import { registerMoveCommand } from './move';
import { registerSelectCommand } from './select';
import { registerNextCommand } from './next';

/**
 * Registers all task management commands
 */
export function registerTaskCommands(program: Command): void {
  const taskCmd = program.command('task').alias('t').description('Manage tasks');

  // Register all subcommands
  registerListCommand(taskCmd);
  registerShowCommand(taskCmd);
  registerCreateCommand(taskCmd);
  registerUpdateCommand(taskCmd);
  registerDeleteCommand(taskCmd);
  registerMoveCommand(taskCmd);
  registerSelectCommand(taskCmd);
  registerNextCommand(taskCmd);
}

export * from './types';
