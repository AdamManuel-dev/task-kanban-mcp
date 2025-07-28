/**
 * @fileoverview Backup export command implementation
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Export backup files to different formats
 * Main APIs: registerExportCommand() - registers export subcommand
 * Constraints: Handles different export formats
 * Patterns: Format conversion, file operations
 */

import type { Command } from 'commander';
import type { CliComponents } from '../../types';
import type { ExportBackupOptions } from './types';
import { withErrorHandling, withSpinner, showSuccess } from '../../utils/command-helpers';

export function registerExportCommand(backupCmd: Command): void {
  const getComponents = (): CliComponents => global.cliComponents;

  backupCmd
    .command('export <id> <path>')
    .description('Export backup to file')
    .option('-f, --format <format>', 'export format (sql, json, csv)', 'sql')
    .action(
      withErrorHandling(
        'export backup',
        async (id: string, path: string, options: ExportBackupOptions = {}) => {
          const { apiClient } = getComponents();

          const exportWithProgress = withSpinner(
            `Exporting backup ${id} to ${path}`,
            'Backup exported successfully',
            async () => {
              const result = await apiClient.exportBackup(id, options.format || 'sql');
              return result;
            }
          );

          await exportWithProgress();
          showSuccess(`Backup exported to: ${path}`);
        }
      )
    );
}
