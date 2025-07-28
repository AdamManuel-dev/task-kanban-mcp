/**
 * @fileoverview Backup delete command implementation
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Backup deletion with confirmation prompts
 * Main APIs: registerDeleteCommand() - registers delete subcommand
 * Constraints: Requires confirmation unless forced
 * Patterns: Safety confirmation, bulk operations, progress feedback
 */

import type { Command } from 'commander';
import type { CliComponents, BackupInfo } from '../../types';
import type { DeleteBackupOptions } from './types';
import { hasDataProperty } from './types';
import {
  withErrorHandling,
  withSpinner,
  confirmAction,
  showSuccess,
  formatOutput,
} from '../../utils/command-helpers';
import { logger } from '../../../utils/logger';

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Register the backup delete command
 */
export function registerDeleteCommand(backupCmd: Command): void {
  const getComponents = (): CliComponents => global.cliComponents;

  // Delete single backup
  backupCmd
    .command('delete <id>')
    .alias('rm')
    .description('Delete a backup')
    .option('-f, --force', 'skip confirmation prompt')
    .action(
      withErrorHandling('delete backup', async (id: string, options: DeleteBackupOptions = {}) => {
        const { apiClient, formatter } = getComponents();

        // Get backup info for confirmation
        if (!options.force) {
          const backupResponse = await apiClient.getBackup(id);

          if (!hasDataProperty<BackupInfo>(backupResponse)) {
            formatter.error(`Backup ${id} not found`);
            process.exit(1);
          }

          const backup = backupResponse.data;
          const shouldDelete = await confirmAction(
            `Delete backup "${backup.name}" (${formatFileSize(backup.size)})?\nThis action cannot be undone.`,
            false
          );

          if (!shouldDelete) {
            formatOutput('Delete cancelled');
            return;
          }
        }

        // Delete backup with progress indicator
        const deleteBackupWithProgress = withSpinner(
          `Deleting backup: ${id}`,
          'Backup deleted successfully',
          async () => {
            await apiClient.deleteBackup(id);
            return id;
          }
        );

        await deleteBackupWithProgress();

        logger.info('Backup deleted', { backupId: id });
        showSuccess(`Backup ${id} deleted successfully`);
      })
    );

  // Clean up old backups
  backupCmd
    .command('cleanup')
    .description('Clean up old backups based on retention policy')
    .option('--older-than <days>', 'delete backups older than N days', '30')
    .option('--keep-minimum <count>', 'minimum backups to keep', '5')
    .option('-f, --force', 'skip confirmation prompt')
    .option('--dry-run', 'show what would be deleted without actually deleting')
    .action(
      withErrorHandling(
        'cleanup backups',
        async (
          options: {
            olderThan?: string;
            keepMinimum?: string;
            force?: boolean;
            dryRun?: boolean;
          } = {}
        ) => {
          const { apiClient, formatter } = getComponents();

          const olderThanDays = parseInt(options.olderThan || '30', 10);
          const keepMinimum = parseInt(options.keepMinimum || '5', 10);

          // Get all backups sorted by creation date
          const response = await apiClient.getBackups({
            sort: 'createdAt',
            order: 'desc',
          });

          if (!hasDataProperty<BackupInfo[]>(response)) {
            formatOutput('No backups found');
            return;
          }

          const allBackups = response.data;
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

          // Identify backups to delete (older than cutoff, but keep minimum)
          const backupsToKeep = allBackups.slice(0, keepMinimum);
          const eligibleForDeletion = allBackups
            .slice(keepMinimum)
            .filter(backup => new Date(backup.createdAt) < cutoffDate);

          if (eligibleForDeletion.length === 0) {
            formatOutput(
              `No backups found older than ${olderThanDays} days (keeping minimum ${keepMinimum})`
            );
            return;
          }

          // Show what will be deleted
          formatter.info(`Found ${eligibleForDeletion.length} backups to delete:`);
          formatOutput(
            eligibleForDeletion.map(b => ({
              id: b.id,
              name: b.name,
              size: formatFileSize(b.size),
              created: b.createdAt,
            })),
            {
              fields: ['id', 'name', 'size', 'created'],
              headers: ['ID', 'Name', 'Size', 'Created'],
            }
          );

          if (options.dryRun) {
            formatter.info('Dry run complete - no backups were deleted');
            return;
          }

          // Confirm deletion
          if (!options.force) {
            const totalSize = eligibleForDeletion.reduce((sum, b) => sum + b.size, 0);
            const shouldDelete = await confirmAction(
              `Delete ${eligibleForDeletion.length} backups (${formatFileSize(totalSize)} total)?`,
              false
            );

            if (!shouldDelete) {
              formatOutput('Cleanup cancelled');
              return;
            }
          }

          // Delete backups
          let deletedCount = 0;
          const deleteProgress = withSpinner(
            'Cleaning up old backups...',
            'Cleanup completed',
            async () => {
              for (const backup of eligibleForDeletion) {
                try {
                  await apiClient.deleteBackup(backup.id);
                  deletedCount++;
                  logger.info('Backup deleted during cleanup', { backupId: backup.id });
                } catch (error) {
                  logger.warn('Failed to delete backup during cleanup', {
                    backupId: backup.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                  });
                }
              }
            }
          );

          await deleteProgress();
          showSuccess(`Cleanup completed: ${deletedCount} backups deleted`);
        }
      )
    );
}
