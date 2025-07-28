/**
 * @fileoverview Backup commands main entry point
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Modular backup command registration
 * Main APIs: registerBackupCommands() - centralized registration
 * Constraints: Delegates to specific command modules
 * Patterns: Command delegation, modular architecture
 */

import type { Command } from 'commander';
import { registerCreateCommand } from './create';
import { registerListCommand } from './list';
import { registerRestoreCommand } from './restore';
import { registerDeleteCommand } from './delete';
import { registerExportCommand } from './export';
import { registerScheduleCommands } from './schedule';

/**
 * Register all backup commands in a modular structure
 */
export function registerBackupCommands(program: Command): void {
  const backupCmd = program.command('backup').alias('bak').description('Manage database backups');

  // Register individual command modules
  registerCreateCommand(backupCmd);
  registerListCommand(backupCmd);
  registerRestoreCommand(backupCmd);
  registerDeleteCommand(backupCmd);
  registerExportCommand(backupCmd);
  registerScheduleCommands(backupCmd);
}
