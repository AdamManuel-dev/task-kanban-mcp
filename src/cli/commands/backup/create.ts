/**
 * @fileoverview Backup create command implementation
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Database backup creation with compression and encryption
 * Main APIs: registerCreateCommand() - registers create subcommand
 * Constraints: Requires backup service, handles encryption keys
 * Patterns: Options validation, progress feedback, secure key handling
 */

import type { Command } from 'commander';
import type { CliComponents, BackupInfo } from '../../types';
import type { CreateBackupOptions } from './types';
import { hasDataProperty } from './types';
import { withErrorHandling, withSpinner, showSuccess } from '../../utils/command-helpers';
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
 * Register the backup create command
 */
export function registerCreateCommand(backupCmd: Command): void {
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  backupCmd
    .command('create [name]')
    .description('Create a new backup')
    .option('-c, --compress', 'compress backup file')
    .option('-v, --verify', 'verify backup after creation')
    .option('-e, --encrypt', 'encrypt backup file')
    .option(
      '--encryption-key <key>',
      'encryption key (hex format, or use BACKUP_ENCRYPTION_KEY env var)'
    )
    .option('--description <desc>', 'backup description')
    .action(
      withErrorHandling(
        'create backup',
        async (name?: string, options: CreateBackupOptions = {}) => {
          const { apiClient, formatter } = getComponents();

          // Generate backup name if not provided
          const backupName = name ?? `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;

          // Validate encryption key if encryption is requested
          if (options.encrypt) {
            const encryptionKey = options.encryptionKey ?? process.env.BACKUP_ENCRYPTION_KEY;
            if (!encryptionKey) {
              formatter.error('Encryption key required when using --encrypt option');
              formatter.info(
                'Use --encryption-key <key> or set BACKUP_ENCRYPTION_KEY environment variable'
              );
              process.exit(1);
            }
            options.encryptionKey = encryptionKey;
          }

          // Create backup with progress indicator
          const createBackupWithProgress = withSpinner(
            `Creating backup: ${backupName}`,
            'Backup created successfully',
            async () => {
              const backupOptions: {
                name: string;
                compress?: boolean;
                verify?: boolean;
                encrypt?: boolean;
                encryptionKey?: string;
                description?: string;
              } = { name: backupName };

              if (options.compress !== undefined) backupOptions.compress = options.compress;
              if (options.verify !== undefined) backupOptions.verify = options.verify;
              if (options.encrypt !== undefined) backupOptions.encrypt = options.encrypt;
              if (options.encryptionKey !== undefined)
                backupOptions.encryptionKey = options.encryptionKey;
              if (options.description !== undefined)
                backupOptions.description = options.description;

              const response = await apiClient.createBackup(backupOptions);

              if (!hasDataProperty<BackupInfo>(response)) {
                throw new Error('Invalid backup response format');
              }

              return response.data;
            }
          );

          const backup = await createBackupWithProgress();

          // Log backup details
          logger.info('Backup created', {
            id: backup.id,
            name: backup.name,
            size: backup.size,
            compressed: backup.compressed,
            verified: backup.verified,
          });

          // Display backup information
          showSuccess(`Backup created: ${backup.id}`, {
            id: backup.id,
            name: backup.name,
            size: formatFileSize(backup.size),
            compressed: backup.compressed ? 'Yes' : 'No',
            verified: backup.verified ? 'Yes' : 'No',
            description: backup.description ?? 'No description',
            createdAt: backup.createdAt,
          });

          if (options.encrypt) {
            formatter.info('⚠️  Keep your encryption key safe - it cannot be recovered if lost!');
          }
        }
      )
    );
}
