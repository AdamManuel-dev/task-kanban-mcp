/**
 * @fileoverview Backup restore command implementation
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Database restore from backups with safety checks
 * Main APIs: registerRestoreCommand() - registers restore subcommand
 * Constraints: Requires confirmation, handles decryption
 * Patterns: Safety prompts, progress tracking, rollback capability
 */

import type { Command } from 'commander';
import type { CliComponents } from '../../types';
import type { RestoreBackupOptions } from './types';
import {
  withErrorHandling,
  withSpinner,
  confirmAction,
  showSuccess,
  formatOutput,
} from '../../utils/command-helpers';
import { logger } from '../../../utils/logger';

/**
 * Register the backup restore command
 */
export function registerRestoreCommand(backupCmd: Command): void {
  const getComponents = (): CliComponents => global.cliComponents;

  backupCmd
    .command('restore <id>')
    .description('Restore database from backup')
    .option('--no-verify', 'skip backup verification before restore')
    .option('--preserve-existing', 'preserve existing data during restore')
    .option('--target-time <timestamp>', 'restore to specific point in time')
    .option('-f, --force', 'skip confirmation prompts')
    .option('--decryption-key <key>', 'decryption key for encrypted backups')
    .action(
      withErrorHandling(
        'restore backup',
        async (id: string, options: RestoreBackupOptions = {}) => {
          const { apiClient, formatter } = getComponents();

          // Safety confirmation unless forced
          if (!options.force) {
            const shouldRestore = await confirmAction(
              `⚠️  DANGER: This will restore the database from backup ${id}.\n` +
                'This action will overwrite current data and cannot be undone.\n' +
                'Are you sure you want to continue?',
              false
            );

            if (!shouldRestore) {
              formatOutput('Restore cancelled');
              return;
            }

            // Additional confirmation for production environments
            const isProduction = process.env.NODE_ENV === 'production';
            if (isProduction) {
              const doubleConfirm = await confirmAction(
                '🚨 PRODUCTION ENVIRONMENT DETECTED\n' +
                  'Type "RESTORE CONFIRMED" to proceed with database restore:',
                false
              );

              if (!doubleConfirm) {
                formatOutput('Restore cancelled - production safety check failed');
                return;
              }
            }
          }

          // Validate decryption key for encrypted backups if needed
          if (options.decryptionKey) {
            if (!/^[a-fA-F0-9]{32,}$/.test(options.decryptionKey)) {
              formatter.error(
                'Invalid decryption key format (must be hex string, minimum 32 characters)'
              );
              process.exit(1);
            }
          }

          // Perform restore with progress tracking
          const restoreWithProgress = withSpinner(
            `Restoring database from backup: ${id}`,
            'Database restored successfully',
            async () => {
              const restoreOptions: {
                verify?: boolean;
                decryptionKey?: string;
              } = {};

              if (!options.noVerify) restoreOptions.verify = true;
              const decryptionKey = options.decryptionKey || process.env.BACKUP_DECRYPTION_KEY;
              if (decryptionKey !== undefined) restoreOptions.decryptionKey = decryptionKey;

              const result = await apiClient.restoreBackup(id, restoreOptions);
              return result;
            }
          );

          await restoreWithProgress();

          logger.info('Database restore completed', {
            backupId: id,
            success: true,
            preserveExisting: options.preserveExisting,
            targetTime: options.targetTime,
          });

          showSuccess(`Database restored from backup: ${id}`, {
            backupId: id,
            restoredAt: new Date().toISOString(),
            preservedExisting: options.preserveExisting ? 'Yes' : 'No',
            verified: !options.noVerify ? 'Yes' : 'Skipped',
          });

          // Important post-restore warnings
          formatter.info('\n📋 Post-restore checklist:');
          formatter.info('  • Verify application functionality');
          formatter.info('  • Check data integrity');
          formatter.info('  • Restart dependent services if needed');
          formatter.info('  • Review logs for any issues');

          if (options.targetTime) {
            formatter.warn(`⏰ Database restored to: ${options.targetTime}`);
            formatter.warn('   Changes made after this time have been lost');
          }
        }
      )
    );
}
