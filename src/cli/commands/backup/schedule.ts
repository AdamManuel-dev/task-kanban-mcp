/**
 * @fileoverview Backup schedule commands implementation
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Manage automated backup schedules
 * Main APIs: registerScheduleCommands() - registers schedule subcommands
 * Constraints: Requires cron expression validation
 * Patterns: Schedule management, cron validation
 */

import type { Command } from 'commander';
import type { CliComponents } from '../../types';
import type { CreateScheduleOptions, ListScheduleOptions } from './types';
import { withErrorHandling, formatOutput, showSuccess } from '../../utils/command-helpers';

export function registerScheduleCommands(backupCmd: Command): void {
  const scheduleCmd = backupCmd.command('schedule').description('Manage backup schedules');
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  // List schedules
  scheduleCmd
    .command('list')
    .alias('ls')
    .description('List backup schedules')
    .option('--enabled', 'show only enabled schedules')
    .option('--disabled', 'show only disabled schedules')
    .option('-l, --limit <number>', 'limit results', '20')
    .action(
      withErrorHandling('list backup schedules', async (options: ListScheduleOptions = {}) => {
        const { apiClient } = getComponents();
        const scheduleParams: Record<string, string> = {};
        if (options.enabled) scheduleParams.enabled = 'true';
        if (options.disabled) scheduleParams.enabled = 'false';
        if (options.limit) scheduleParams.limit = options.limit;

        const schedules = await apiClient.getBackupSchedules(scheduleParams);
        formatOutput(schedules);
      })
    );

  // Create schedule
  scheduleCmd
    .command('create <name>')
    .description('Create backup schedule')
    .option('--cron <expression>', 'cron expression')
    .option('--type <type>', 'backup type (full|incremental)', 'full')
    .option('--description <desc>', 'schedule description')
    .option('--retention <days>', 'retention period in days', '30')
    .action(
      withErrorHandling(
        'create backup schedule',
        async (name: string, options: CreateScheduleOptions = {}) => {
          const { apiClient } = getComponents();
          const scheduleOptions: {
            name: string;
            cron: string;
            enabled?: boolean;
            options?: Record<string, unknown>;
          } = {
            name,
            cron: options.cron ?? '0 2 * * *', // Default to 2 AM daily
          };

          if (options.enabled !== undefined) scheduleOptions.enabled = options.enabled;

          const backupOptions: Record<string, unknown> = {};
          if (options.compress !== undefined) backupOptions.compress = options.compress;
          if (options.encrypt !== undefined) backupOptions.encrypt = options.encrypt;
          if (Object.keys(backupOptions).length > 0) {
            scheduleOptions.options = backupOptions;
          }

          const schedule = await apiClient.createBackupSchedule(scheduleOptions);

          if ('data' in schedule && schedule.data) {
            const scheduleData = schedule.data as { id: string };
            showSuccess(`Schedule created: ${scheduleData.id}`);
          } else {
            showSuccess('Schedule created successfully');
          }
        }
      )
    );
}
