/**
 * @fileoverview Backup list command implementation
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: List backups with filtering and sorting options
 * Main APIs: registerListCommand() - registers list subcommand
 * Constraints: Requires backup service, handles pagination
 * Patterns: Sorting options, formatted output, pagination support
 */

import type { Command } from 'commander';
import type { CliComponents, BackupInfo } from '../../types';
import type { ListBackupOptions } from './types';
import { hasDataProperty } from './types';
import {
  withErrorHandling,
  parseLimit,
  parseSortParams,
  formatOutput,
} from '../../utils/command-helpers';

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
 * Format timestamp as relative time
 */
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return 'Just now';
}

/**
 * Register the backup list command
 */
export function registerListCommand(backupCmd: Command): void {
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  backupCmd
    .command('list')
    .alias('ls')
    .description('List all backups')
    .option('-l, --limit <number>', 'limit number of results', '20')
    .option('--sort <field>', 'sort by field (name, size, createdAt)', 'createdAt')
    .option('--order <order>', 'sort order (asc/desc)', 'desc')
    .action(
      withErrorHandling('list backups', async (options: ListBackupOptions = {}) => {
        const { apiClient } = getComponents();

        // Parse and validate options
        const limit = parseLimit(options.limit, 20, 100);
        const { sort, order } = parseSortParams(options.sort, options.order, 'createdAt', [
          'name',
          'size',
          'createdAt',
          'verified',
        ]);

        // Get backups with options
        const response = await apiClient.getBackups({
          limit: String(limit),
          sort,
          order,
        });

        if (!hasDataProperty<BackupInfo[]>(response)) {
          formatOutput('No backups found');
          return;
        }

        const backups = response.data;

        // Transform data for display
        const displayBackups = backups.map(backup => ({
          id: backup.id,
          name: backup.name,
          size: formatFileSize(backup.size),
          compressed: backup.compressed ? '✓' : '✗',
          verified: backup.verified ? '✓' : '✗',
          created: formatRelativeTime(backup.createdAt),
          description: backup.description ?? 'No description',
        }));

        formatOutput(displayBackups, {
          fields: ['id', 'name', 'size', 'compressed', 'verified', 'created'],
          headers: ['ID', 'Name', 'Size', 'Compressed', 'Verified', 'Created'],
          title: `📦 Backups (${backups.length} found)`,
        });
      })
    );
}
