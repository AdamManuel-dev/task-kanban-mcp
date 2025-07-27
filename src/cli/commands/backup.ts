import type { Command } from 'commander';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import type {
  CliComponents,
  BackupInfo,
  BackupSchedule,
  ErrorResponse,
  AnyApiResponse,
} from '../types';

// Type guard to check if response has data property
function hasDataProperty<T>(response: any): response is { data: T } {
  return response && typeof response === 'object' && 'data' in response && !('error' in response);
}

interface CreateBackupOptions {
  compress?: boolean;
  verify?: boolean;
  description?: string;
}

interface ListBackupOptions {
  limit?: string;
  sort?: string;
  order?: string;
}

interface DeleteBackupOptions {
  force?: boolean;
}

interface ExportBackupOptions {
  format?: string;
}

interface RestoreBackupOptions {
  noVerify?: boolean;
  preserveExisting?: boolean;
  confirmed?: boolean;
  targetTime?: string;
  force?: boolean;
}

interface CreateScheduleOptions {
  cron?: string;
  type?: string;
  description?: string;
  retention?: string;
  'no-compression'?: boolean;
  'no-verification'?: boolean;
  disabled?: boolean;
}

interface ListScheduleOptions {
  enabled?: boolean;
  disabled?: boolean;
  limit?: string;
}

export function registerBackupCommands(program: Command): void {
  const backupCmd = program.command('backup').alias('bak').description('Manage database backups');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

  backupCmd
    .command('create [name]')
    .description('Create a new backup')
    .option('-c, --compress', 'compress backup file')
    .option('-v, --verify', 'verify backup after creation')
    .option('--description <desc>', 'backup description')
    .action(async (name?: string, options: CreateBackupOptions = {}) => {
      const { apiClient, formatter } = getComponents();

      try {
        const backupData: Partial<BackupInfo> = {};

        const backupName =
          name ||
          ((): string => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            return `backup-${timestamp}`;
          })();

        backupData.name = backupName;
        backupData.compress = Boolean(options.compress);
        backupData.verify = Boolean(options.verify);

        if (options.description) {
          backupData.description = String(options.description);
        }

        formatter.info(`Creating backup: ${backupName}...`);

        const backup = await apiClient.request('/api/backup/create', {
          method: 'POST',
          body: backupData,
        });

        if (!hasDataProperty<BackupInfo>(backup)) {
          throw new Error('Failed to create backup');
        }

        formatter.success(`Backup created successfully: ${backup.data.id}`);
        formatter.output(backup.data, {
          fields: ['id', 'name', 'size', 'compressed', 'verified', 'createdAt'],
          headers: ['ID', 'Name', 'Size', 'Compressed', 'Verified', 'Created'],
        });
      } catch (error) {
        formatter.error(
          `Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  backupCmd
    .command('list')
    .alias('ls')
    .description('List all backups')
    .option('-l, --limit <number>', 'limit number of results', '20')
    .option('--sort <field>', 'sort by field', 'createdAt')
    .option('--order <direction>', 'sort order (asc/desc)', 'desc')
    .action(async (options: ListBackupOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const params: Record<string, string> = {
          limit: options.limit ?? '20',
          sort: options.sort ?? 'createdAt',
          order: options.order ?? 'desc',
        };

        const backups = await apiClient.request('/api/backup/list', {
          params,
        });

        if (
          !('data' in backups) ||
          !backups.data ||
          !Array.isArray(backups.data) ||
          backups.data.length === 0
        ) {
          formatter.info('No backups found');
          return;
        }

        formatter.output(backups.data, {
          fields: ['id', 'name', 'size', 'compressed', 'verified', 'createdAt'],
          headers: ['ID', 'Name', 'Size', 'Compressed', 'Verified', 'Created'],
        });
      } catch (error) {
        formatter.error(
          `Failed to list backups: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  backupCmd
    .command('restore <id>')
    .description('Restore from a backup')
    .option('-f, --force', 'skip confirmation')
    .option('--verify', 'verify backup before restore')
    .action(async (id: string, options: RestoreBackupOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        // Get backup info
        const backup = await apiClient.request(`/api/backup/${id}`);
        if (!('data' in backup) || !backup.data) {
          formatter.error(`Backup ${id} not found`);
          process.exit(1);
        }

        if (!options.force) {
          formatter.warn('WARNING: This will replace all current data!');
          formatter.output([backup.data], {
            fields: ['id', 'name', 'size', 'createdAt'],
            headers: ['ID', 'Name', 'Size', 'Created'],
          });

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Restore from backup "${backup.data.name}"? This cannot be undone!`,
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Restore cancelled');
            return;
          }
        }

        const restoreData = { verify: !options.noVerify };

        formatter.info(`Restoring from backup: ${backup.data.name}...`);

        const result = await apiClient.request(`/api/backup/${id}/restore`, {
          method: 'POST',
          body: restoreData,
        });

        formatter.success('Database restored successfully');
        formatter.output(result);
      } catch (error) {
        formatter.error(
          `Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  backupCmd
    .command('delete <id>')
    .alias('rm')
    .description('Delete a backup')
    .option('-f, --force', 'skip confirmation')
    .action(async (id: string, options: DeleteBackupOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          const backup = await apiClient.request(`/api/backup/${id}`);
          if (!backup.data) {
            formatter.error(`Backup ${id} not found`);
            process.exit(1);
          }

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete backup "${backup.data.name}"?`,
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Delete cancelled');
            return;
          }
        }

        await apiClient.request(`/api/backup/${id}`, { method: 'DELETE' });
        formatter.success(`Backup ${id} deleted successfully`);
      } catch (error) {
        formatter.error(
          `Failed to delete backup: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  backupCmd
    .command('verify <id>')
    .description('Verify backup integrity')
    .action(async (id: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info(`Verifying backup: ${id}...`);

        const result = await apiClient.request(`/api/backup/${id}/verify`, {
          method: 'POST',
        });

        if (result.valid) {
          formatter.success('Backup verification passed');
        } else {
          formatter.error('Backup verification failed');
        }

        formatter.output(result);
      } catch (error) {
        formatter.error(
          `Failed to verify backup: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  backupCmd
    .command('export <id> [path]')
    .description('Export backup to file')
    .option('-f, --format <format>', 'export format (json|sql|csv)', 'json')
    .action(async (id: string, exportPath?: string, options: ExportBackupOptions = {}) => {
      const { apiClient, formatter } = getComponents();

      try {
        const backup = await apiClient.request(`/api/backup/${id}`);
        if (!backup.data) {
          formatter.error(`Backup ${id} not found`);
          process.exit(1);
        }

        const finalExportPath = exportPath || `${backup.data.name}.${options.format ?? 'json'}`;

        formatter.info(`Exporting backup to: ${finalExportPath}...`);

        const data = (await apiClient.request(`/api/backup/${id}/export`, {
          params: { format: options.format ?? 'json' },
        })) as unknown;

        // Ensure directory exists
        const dir = path.dirname(finalExportPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write file
        if (options.format === 'json') {
          fs.writeFileSync(finalExportPath, JSON.stringify(data, null, 2));
        } else {
          fs.writeFileSync(finalExportPath, data as string);
        }

        const stats = fs.statSync(finalExportPath);
        formatter.success(`Backup exported successfully to ${finalExportPath}`);
        formatter.info(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      } catch (error) {
        formatter.error(
          `Failed to export backup: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  backupCmd
    .command('restore-to-time [targetTime]')
    .description('Restore database to specific point in time')
    .option('--no-verify', 'skip backup verification before restoration')
    .option('--preserve-existing', 'create backup of current state before restoration')
    .action(async (targetTime?: string, options: RestoreBackupOptions = {}) => {
      const { apiClient, formatter } = getComponents();

      try {
        let restoreTime = targetTime;

        // Interactive mode if no target time provided
        if (!restoreTime) {
          const now = new Date();
          const defaultTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago

          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'targetTime',
              message: 'Target restoration time (ISO format):',
              default: defaultTime,
              validate: (input: string): string | boolean => {
                const date = new Date(input);
                if (Number.isNaN(date.getTime())) {
                  return 'Invalid date format. Use ISO format (e.g., 2025-07-26T10:30:00Z)';
                }
                if (date > now) {
                  return 'Target time cannot be in the future';
                }
                return true;
              },
            },
            {
              type: 'confirm',
              name: 'verify',
              message: 'Verify backups before restoration?',
              default: !options.noVerify,
            },
            {
              type: 'confirm',
              name: 'preserveExisting',
              message: 'Create backup of current state before restoration?',
              default: options.preserveExisting || false,
            },
            {
              type: 'confirm',
              name: 'confirmed',
              message: 'This will replace the current database. Are you sure?',
              default: false,
            },
          ]);

          if (!answers.confirmed) {
            formatter.info('Point-in-time restoration cancelled');
            return;
          }

          restoreTime = answers.targetTime;
          // Note: Can't modify options object directly due to readonly, these values are handled in the API call
        } else {
          // Validate provided time
          const targetDate = new Date(restoreTime);
          if (Number.isNaN(targetDate.getTime())) {
            formatter.error(
              'Invalid target time format. Use ISO format (e.g., 2025-07-26T10:30:00Z)'
            );
            process.exit(1);
          }

          if (targetDate > new Date()) {
            formatter.error('Target time cannot be in the future');
            process.exit(1);
          }

          // Confirmation for non-interactive mode
          const { confirmed } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmed',
              message: `Restore database to ${restoreTime}? This will replace the current database.`,
              default: false,
            },
          ]);

          if (!confirmed) {
            formatter.info('Point-in-time restoration cancelled');
            return;
          }
        }

        formatter.info(`Starting point-in-time restoration to: ${restoreTime}...`);

        const result = await apiClient.request('/api/backup/restore-to-time', {
          method: 'POST',
          body: JSON.stringify({
            targetTime: restoreTime,
            verify: !options.noVerify,
            preserveExisting: options.preserveExisting,
          }),
        });

        formatter.success('Point-in-time restoration completed successfully');
        formatter.info(`Database restored to: ${restoreTime}`);

        if (result.backupsApplied) {
          formatter.info(`Applied ${result.backupsApplied} backup(s)`);
        }
      } catch (error) {
        formatter.error('Point-in-time restoration failed');
        if (error instanceof Error) {
          formatter.error(error.message);
        }
        process.exit(1);
      }
    });

  // Schedule management commands
  backupCmd
    .command('schedule')
    .description('Manage backup schedules')
    .action((): void => {
      const { formatter } = getComponents();
      formatter.info('Available schedule commands:');
      formatter.info('  backup schedule create    - Create a new backup schedule');
      formatter.info('  backup schedule list      - List all backup schedules');
      formatter.info('  backup schedule show <id> - Show schedule details');
      formatter.info('  backup schedule update <id> - Update a schedule');
      formatter.info('  backup schedule delete <id> - Delete a schedule');
      formatter.info('  backup schedule run <id>  - Execute a schedule manually');
      formatter.info('  backup schedule start     - Start the backup scheduler');
      formatter.info('  backup schedule stop      - Stop the backup scheduler');
      formatter.info('  backup schedule cleanup   - Clean up old backups');
    });

  backupCmd
    .command('schedule create [name]')
    .description('Create a new backup schedule')
    .option('--cron <expression>', 'cron expression (e.g., "0 2 * * *" for daily at 2 AM)')
    .option('--type <type>', 'backup type (full, incremental)', 'full')
    .option('--description <desc>', 'schedule description')
    .option('--retention <days>', 'retention period in days', '30')
    .option('--no-compression', 'disable compression')
    .option('--no-verification', 'disable verification')
    .option('--disabled', 'create schedule as disabled')
    .action(async (name?: string, options: CreateScheduleOptions = {}) => {
      const { apiClient, formatter } = getComponents();

      try {
        let scheduleData: Partial<BackupSchedule> = {};

        // Interactive mode if no name provided
        if (!name || !options.cron) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: 'Schedule name:',
              default: name || `schedule-${Date.now()}`,
              validate: (input: string): string | boolean =>
                input.trim().length > 0 || 'Name is required',
            },
            {
              type: 'input',
              name: 'cronExpression',
              message: 'Cron expression (e.g., "0 2 * * *" for daily at 2 AM):',
              default: options.cron || '0 2 * * *',
              validate: (input: string): string | boolean => {
                // Basic validation - in production you'd want more thorough validation
                const parts = input.trim().split(' ');
                return parts.length === 5 || 'Invalid cron expression format (should have 5 parts)';
              },
            },
            {
              type: 'list',
              name: 'backupType',
              message: 'Backup type:',
              choices: ['full', 'incremental'],
              default: options.type || 'full',
            },
            {
              type: 'input',
              name: 'description',
              message: 'Description (optional):',
              default: options.description || '',
            },
            {
              type: 'number',
              name: 'retentionDays',
              message: 'Retention period (days):',
              default: parseInt(options.retention) || 30,
              validate: (input: number): string | boolean =>
                input > 0 || 'Retention days must be positive',
            },
            {
              type: 'confirm',
              name: 'compressionEnabled',
              message: 'Enable compression?',
              default: !options['no-compression'],
            },
            {
              type: 'confirm',
              name: 'verificationEnabled',
              message: 'Enable verification?',
              default: !options['no-verification'],
            },
            {
              type: 'confirm',
              name: 'enabled',
              message: 'Enable schedule immediately?',
              default: !options.disabled,
            },
          ]);

          scheduleData = answers;
        } else {
          scheduleData = {
            name,
            cronExpression: options.cron,
            backupType: options.type || 'full',
            description: options.description,
            retentionDays: parseInt(options.retention) || 30,
            compressionEnabled: !options['no-compression'],
            verificationEnabled: !options['no-verification'],
            enabled: !options.disabled,
          };
        }

        formatter.info(`Creating backup schedule: ${scheduleData.name}...`);

        const schedule = await apiClient.request('/api/schedule/create', {
          method: 'POST',
          body: JSON.stringify(scheduleData),
        });

        formatter.success('Backup schedule created successfully');
        formatter.output(schedule.data);
      } catch (error) {
        formatter.error('Failed to create backup schedule');
        process.exit(1);
      }
    });

  backupCmd
    .command('schedule list')
    .description('List all backup schedules')
    .option('--enabled', 'show only enabled schedules')
    .option('--disabled', 'show only disabled schedules')
    .option('--limit <count>', 'maximum number of schedules to show', '20')
    .action(async (options: ListScheduleOptions = {}) => {
      const { apiClient, formatter } = getComponents();

      try {
        const params: Record<string, string> = {};

        if (options.enabled) params.enabled = 'true';
        if (options.disabled) params.enabled = 'false';
        if (options.limit) params.limit = options.limit;

        const queryString = new URLSearchParams(params).toString();
        const url = `/api/schedule/list${queryString ? `?${queryString}` : ''}`;

        const response = await apiClient.request(url);
        const schedules = response.data;

        if (schedules.length === 0) {
          formatter.info('No backup schedules found');
          return;
        }

        formatter.success(`Found ${schedules.length} backup schedule(s)`);
        formatter.output(schedules);
      } catch (error) {
        formatter.error('Failed to list backup schedules');
        process.exit(1);
      }
    });

  backupCmd
    .command('schedule show <id>')
    .description('Show backup schedule details')
    .action(async (id: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        const response = await apiClient.request(`/api/schedule/${id}`);
        const schedule = response.data;

        formatter.output(schedule);
      } catch (error) {
        formatter.error('Failed to get backup schedule');
        process.exit(1);
      }
    });

  backupCmd
    .command('schedule run <id>')
    .description('Execute a backup schedule manually')
    .action(async (id: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info(`Executing backup schedule: ${id}...`);

        await apiClient.request(`/api/schedule/${id}/execute`, {
          method: 'POST',
        });

        formatter.success('Backup schedule executed successfully');
      } catch (error) {
        formatter.error('Failed to execute backup schedule');
        process.exit(1);
      }
    });

  backupCmd
    .command('schedule start')
    .description('Start the backup scheduler')
    .action(async () => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Starting backup scheduler...');

        await apiClient.request('/api/schedule/start', {
          method: 'POST',
        });

        formatter.success('Backup scheduler started successfully');
      } catch (error) {
        formatter.error('Failed to start backup scheduler');
        process.exit(1);
      }
    });

  backupCmd
    .command('schedule stop')
    .description('Stop the backup scheduler')
    .action(async () => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Stopping backup scheduler...');

        await apiClient.request('/api/schedule/stop', {
          method: 'POST',
        });

        formatter.success('Backup scheduler stopped successfully');
      } catch (error) {
        formatter.error('Failed to stop backup scheduler');
        process.exit(1);
      }
    });

  backupCmd
    .command('schedule cleanup')
    .description('Clean up old backups based on retention policies')
    .action(async () => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Cleaning up old backups...');

        await apiClient.request('/api/schedule/cleanup', {
          method: 'POST',
        });

        formatter.success('Backup cleanup completed successfully');
      } catch (error) {
        formatter.error('Failed to clean up old backups');
        process.exit(1);
      }
    });
}
