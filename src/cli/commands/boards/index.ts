/**
 * @fileoverview Board commands main entry point
 * @lastmodified 2025-07-28T12:30:00Z
 *
 * Features: Centralized board command registration and management
 * Main APIs: registerBoardCommands() - registers all board subcommands
 * Constraints: Maintains compatibility with existing CLI structure
 * Patterns: Modular command organization, delegation to specialized handlers
 */

import type { Command } from 'commander';
import { registerListCommands } from './list';
import { registerCreateCommand } from './create';
import { registerViewCommand } from './view';

/**
 * Register all board-related commands with the CLI program.
 *
 * @param program - The commander program instance
 *
 * Available commands:
 * - `list` (alias: `ls`) - List boards with filtering
 * - `show <id>` - Display board details and statistics
 * - `view [id]` - Interactive board visualization
 * - `create` (alias: `new`) - Create a new board
 * - `update <id>` - Update board properties
 * - `delete <id>` (alias: `rm`) - Delete a board
 * - `use <id>` - Set board as default
 * - `archive <id>` - Archive a board
 * - `unarchive <id>` - Restore archived board
 * - `quick-setup` (alias: `setup`) - Quick board setup with templates
 */
export function registerBoardCommands(program: Command): void {
  const boardCmd = program.command('board').alias('b').description('Manage boards');

  // Register modular command groups
  registerListCommands(boardCmd);
  registerCreateCommand(boardCmd);
  registerViewCommand(boardCmd);
}
