import type { Command } from 'commander';
import inquirer from 'inquirer';
import type {
  CliComponents,
  AnyApiResponse,
  ApiResponse,
  DatabaseVacuumResult,
  DatabaseHealthResponse,
  MigrationsResponse,
  MigrationResponse,
  MigrationResult,
} from '../types';
import { buildDatabaseStatsParams } from '../utils/parameter-builder';
import { logger } from '../../utils/logger';
import { isSuccessResponse } from '../api-client-wrapper';

export function registerDatabaseCommands(program: Command): void {
  const dbCmd = program.command('database').alias('db').description('Database management');

  // Get global components with proper typing
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  dbCmd
    .command('optimize')
    .description('Optimize database performance')
    .option('--verbose', 'show detailed output')
    .action(async (options: { verbose?: boolean }) => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Optimizing database...');

        const result = await apiClient.request('POST', '/api/database/optimize', {
          verbose: options.verbose ?? false,
        });

        formatter.success('Database optimization completed');
        formatter.output(result, {
          fields: ['operation', 'duration', 'before', 'after', 'improvement'],
          headers: ['Operation', 'Duration', 'Before', 'After', 'Improvement'],
        });
      } catch (error) {
        formatter.error(
          `Failed to optimize database: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  dbCmd
    .command('vacuum')
    .description('Vacuum database to reclaim space')
    .option('-f, --force', 'skip confirmation')
    .action(async (options: { force?: boolean }) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Vacuum database? This may take some time.',
              default: true,
            },
          ]);

          if (!confirm) {
            formatter.info('Vacuum cancelled');
            return;
          }
        }

        formatter.info('Vacuuming database...');

        const result = await apiClient.request<ApiResponse<DatabaseVacuumResult>>(
          'POST',
          '/api/database/vacuum'
        );

        formatter.success('Database vacuum completed');
        formatter.output(result, {
          fields: ['sizeBefore', 'sizeAfter', 'spaceReclaimed', 'duration'],
          headers: ['Size Before', 'Size After', 'Space Reclaimed', 'Duration'],
        });
      } catch (error) {
        formatter.error(
          `Failed to vacuum database: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  dbCmd
    .command('analyze')
    .description('Analyze database and update statistics')
    .action(async () => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Analyzing database...');

        const result = await apiClient.request('POST', '/api/database/analyze');

        formatter.success('Database analysis completed');
        formatter.output(result, {
          fields: ['table', 'rowCount', 'indexCount', 'avgRowSize', 'totalSize'],
          headers: ['Table', 'Rows', 'Indexes', 'Avg Row Size', 'Total Size'],
        });
      } catch (error) {
        formatter.error(
          `Failed to analyze database: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  dbCmd
    .command('stats')
    .description('Show database statistics')
    .option('--tables', 'include table statistics')
    .option('--indexes', 'include index statistics')
    .option('--performance', 'include performance metrics')
    .action(async (options: { tables?: boolean; indexes?: boolean; performance?: boolean }) => {
      const { apiClient, formatter } = getComponents();

      try {
        const params = buildDatabaseStatsParams({
          ...(options.tables && { tables: options.tables }),
          ...(options.indexes && { indexes: options.indexes }),
          ...(options.performance && { performance: options.performance }),
        });

        // Convert params to Record<string, string> format
        const queryParams: Record<string, string> = {};
        if (params.tables) queryParams.tables = params.tables;
        if (params.indexes) queryParams.indexes = params.indexes;
        if (params.performance) queryParams.performance = params.performance;

        const result = await apiClient.request(
          'GET',
          '/api/database/stats',
          undefined,
          queryParams
        );

        formatter.success('Database statistics:');
        formatter.output(result, {
          fields: ['metric', 'value', 'unit', 'description'],
          headers: ['Metric', 'Value', 'Unit', 'Description'],
        });
      } catch (error) {
        formatter.error(
          `Failed to get database stats: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  dbCmd
    .command('check')
    .description('Check database integrity')
    .option('--repair', 'attempt to repair corruption if found')
    .action(async (options: { repair?: boolean }) => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Checking database integrity...');

        const result = await apiClient.request<DatabaseHealthResponse>(
          'POST',
          '/api/database/check',
          {
            repair: options.repair ?? false,
          }
        );

        if (isSuccessResponse(result) && result.data.healthy) {
          formatter.success('Database integrity check passed');
        } else {
          formatter.error('Database integrity issues found');
        }

        formatter.output(result, {
          fields: ['check', 'status', 'details'],
          headers: ['Check', 'Status', 'Details'],
        });

        if (isSuccessResponse(result) && result.data.issues && result.data.issues.length > 0) {
          logger.info('\n--- Issues Found ---');
          formatter.output(result.data.issues, {
            fields: ['type', 'severity', 'message', 'suggestion'],
            headers: ['Type', 'Severity', 'Message', 'Suggestion'],
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to check database: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  dbCmd
    .command('repair')
    .description('Repair database corruption')
    .option('-f, --force', 'skip confirmation')
    .option('--backup', 'create backup before repair')
    .action(async (options: { force?: boolean; backup?: boolean }) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          formatter.warn('WARNING: Database repair may cause data loss!');

          const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Proceed with database repair?',
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Repair cancelled');
            return;
          }
        }

        const repairData = {
          createBackup: options.backup ?? false,
        };

        formatter.info('Repairing database...');

        const result = await apiClient.request<AnyApiResponse>(
          'POST',
          '/api/database/repair',
          repairData
        );

        formatter.success('Database repair completed');
        formatter.output(result, {
          fields: ['operation', 'status', 'recordsFixed', 'backupCreated'],
          headers: ['Operation', 'Status', 'Records Fixed', 'Backup Created'],
        });
      } catch (error) {
        formatter.error(
          `Failed to repair database: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  // Migration commands
  const migrateCmd = dbCmd.command('migrate').description('Database migration management');

  migrateCmd
    .command('status')
    .description('Show migration status')
    .action(async () => {
      const { apiClient, formatter } = getComponents();

      try {
        const migrations = await apiClient.request<MigrationsResponse>(
          'GET',
          '/api/database/migrations/status'
        );

        if (!isSuccessResponse(migrations) || migrations.data.length === 0) {
          formatter.info('No migrations found');
          return;
        }

        formatter.output(migrations.data, {
          fields: ['name', 'version', 'status', 'appliedAt'],
          headers: ['Migration', 'Version', 'Status', 'Applied At'],
        });
      } catch (error) {
        formatter.error(
          `Failed to get migration status: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  migrateCmd
    .command('up')
    .description('Run pending migrations')
    .option('--to <version>', 'migrate to specific version')
    .action(async (options: { to?: string }) => {
      const { apiClient, formatter } = getComponents();

      try {
        const migrateData: { targetVersion?: string } = {};
        if (options.to) {
          migrateData.targetVersion = options.to;
        }

        formatter.info('Running migrations...');

        const result = await apiClient.request('POST', '/api/database/migrations/up', migrateData);

        formatter.success('Migrations completed');
        formatter.output(result, {
          fields: ['migration', 'status', 'duration'],
          headers: ['Migration', 'Status', 'Duration'],
        });
      } catch (error) {
        formatter.error(
          `Failed to run migrations: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  migrateCmd
    .command('down')
    .description('Rollback migrations')
    .option('--to <version>', 'rollback to specific version')
    .option('-f, --force', 'skip confirmation')
    .action(async (options: { to?: string; force?: boolean }) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          formatter.warn('WARNING: Rolling back migrations may cause data loss!');

          const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Proceed with migration rollback?',
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Rollback cancelled');
            return;
          }
        }

        const rollbackData: { targetVersion?: string } = {};
        if (options.to) {
          rollbackData.targetVersion = options.to;
        }

        formatter.info('Rolling back migrations...');

        const result = await apiClient.request<ApiResponse<MigrationResult>>(
          'POST',
          '/api/database/migrations/down',
          rollbackData
        );

        formatter.success('Migration rollback completed');
        formatter.output(result, {
          fields: ['migration', 'status', 'duration'],
          headers: ['Migration', 'Status', 'Duration'],
        });
      } catch (error) {
        formatter.error(
          `Failed to rollback migrations: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  migrateCmd
    .command('create <name>')
    .description('Create a new migration')
    .action(async (name: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        const migration = await apiClient.request<MigrationResponse>(
          'POST',
          '/api/database/migrations/create',
          {
            name,
          }
        );

        if (isSuccessResponse(migration)) {
          formatter.success(`Migration created: ${String(migration.data.filename ?? 'Unknown')}`);
          formatter.output(migration.data, {
            fields: ['name', 'version', 'filename', 'createdAt'],
            headers: ['Name', 'Version', 'Filename', 'Created At'],
          });
        } else {
          formatter.error('Failed to create migration');
          process.exit(1);
        }
      } catch (error) {
        formatter.error(
          `Failed to create migration: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });
}
