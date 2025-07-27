import type { Command } from 'commander';
import inquirer from 'inquirer';
import type { CliComponents, DatabaseOptimizationResult, DatabaseVacuumResult, DatabaseAnalysisResult, DatabaseStats, DatabaseIntegrityResult, DatabaseRepairResult, Migration, MigrationResult } from '../types';

export function registerDatabaseCommands(program: Command): void {
  const dbCmd = program.command('db').description('Database management commands');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

  dbCmd
    .command('optimize')
    .description('Optimize database performance')
    .option('-v, --verbose', 'verbose output')
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Optimizing database...');

        const result = await apiClient.request('/api/database/optimize', {
          method: 'POST',
          body: { verbose: options.verbose || false },
        }) as DatabaseOptimizationResult[];

        formatter.success('Database optimization completed');
        formatter.output(result, {
          fields: ['operation', 'duration', 'before', 'after', 'improvement'],
          headers: ['Operation', 'Duration', 'Before', 'After', 'Improvement'],
        });
      } catch (error) {
        formatter.error(
          `Failed to optimize database: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  dbCmd
    .command('vacuum')
    .description('Vacuum database to reclaim space')
    .option('-f, --force', 'skip confirmation')
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
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

        const result = await apiClient.request('/api/database/vacuum', {
          method: 'POST',
        }) as DatabaseVacuumResult;

        formatter.success('Database vacuum completed');
        formatter.output(result, {
          fields: ['sizeBefore', 'sizeAfter', 'spaceReclaimed', 'duration'],
          headers: ['Size Before', 'Size After', 'Space Reclaimed', 'Duration'],
        });
      } catch (error) {
        formatter.error(
          `Failed to vacuum database: ${error instanceof Error ? error.message : 'Unknown error'}`
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

        const result = await apiClient.request('/api/database/analyze', {
          method: 'POST',
        }) as DatabaseAnalysisResult[];

        formatter.success('Database analysis completed');
        formatter.output(result, {
          fields: ['table', 'rowCount', 'indexCount', 'avgRowSize', 'totalSize'],
          headers: ['Table', 'Rows', 'Indexes', 'Avg Row Size', 'Total Size'],
        });
      } catch (error) {
        formatter.error(
          `Failed to analyze database: ${error instanceof Error ? error.message : 'Unknown error'}`
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
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        const params: Record<string, string> = {};
        if (options.tables) params.tables = 'true';
        if (options.indexes) params.indexes = 'true';
        if (options.performance) params.performance = 'true';

        const stats = await apiClient.request('/api/database/stats', { params }) as DatabaseStats;

        formatter.info('Database Statistics:');

        // General stats
        if (stats.general) {
          formatter.output(stats.general, {
            fields: ['metric', 'value'],
            headers: ['Metric', 'Value'],
          });
        }

        // Table stats
        if (stats.tables && options.tables) {
          console.log('\n--- Table Statistics ---');
          formatter.output(stats.tables, {
            fields: ['name', 'rowCount', 'size', 'lastModified'],
            headers: ['Table', 'Rows', 'Size', 'Last Modified'],
          });
        }

        // Index stats
        if (stats.indexes && options.indexes) {
          console.log('\n--- Index Statistics ---');
          formatter.output(stats.indexes, {
            fields: ['name', 'table', 'size', 'usage'],
            headers: ['Index', 'Table', 'Size', 'Usage'],
          });
        }

        // Performance metrics
        if (stats.performance && options.performance) {
          console.log('\n--- Performance Metrics ---');
          formatter.output(stats.performance, {
            fields: ['metric', 'value', 'unit'],
            headers: ['Metric', 'Value', 'Unit'],
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get database stats: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  dbCmd
    .command('check')
    .description('Check database integrity')
    .option('--repair', 'attempt to repair corruption if found')
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        formatter.info('Checking database integrity...');

        const result = await apiClient.request('/api/database/check', {
          method: 'POST',
          body: { repair: options.repair || false },
        }) as DatabaseIntegrityResult;

        if (result.healthy) {
          formatter.success('Database integrity check passed');
        } else {
          formatter.error('Database integrity issues found');
        }

        formatter.output(result, {
          fields: ['check', 'status', 'details'],
          headers: ['Check', 'Status', 'Details'],
        });

        if (result.issues && result.issues.length > 0) {
          console.log('\n--- Issues Found ---');
          formatter.output(result.issues, {
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
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          formatter.warn('WARNING: Database repair may cause data loss!');

          const { confirm } = await inquirer.prompt([
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
          createBackup: options.backup || false,
        };

        formatter.info('Repairing database...');

        const result = await apiClient.request('/api/database/repair', {
          method: 'POST',
          body: repairData,
        }) as DatabaseRepairResult;

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
        const migrations = await apiClient.request('/api/database/migrations/status') as Migration[];

        if (!migrations || migrations.length === 0) {
          formatter.info('No migrations found');
          return;
        }

        formatter.output(migrations, {
          fields: ['name', 'version', 'status', 'appliedAt'],
          headers: ['Migration', 'Version', 'Status', 'Applied At'],
        });
      } catch (error) {
        formatter.error(
          `Failed to get migration status: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  migrateCmd
    .command('up')
    .description('Run pending migrations')
    .option('--to <version>', 'migrate to specific version')
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        const migrateData: { targetVersion?: string } = {};
        if (options.to) {
          migrateData.targetVersion = options.to;
        }

        formatter.info('Running migrations...');

        const result = await apiClient.request('/api/database/migrations/up', {
          method: 'POST',
          body: migrateData,
        }) as MigrationResult[];

        formatter.success('Migrations completed');
        formatter.output(result, {
          fields: ['migration', 'status', 'duration'],
          headers: ['Migration', 'Status', 'Duration'],
        });
      } catch (error) {
        formatter.error(
          `Failed to run migrations: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  migrateCmd
    .command('down')
    .description('Rollback migrations')
    .option('--to <version>', 'rollback to specific version')
    .option('-f, --force', 'skip confirmation')
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          formatter.warn('WARNING: Rolling back migrations may cause data loss!');

          const { confirm } = await inquirer.prompt([
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

        const result = await apiClient.request('/api/database/migrations/down', {
          method: 'POST',
          body: rollbackData,
        }) as MigrationResult[];

        formatter.success('Migration rollback completed');
        formatter.output(result, {
          fields: ['migration', 'status', 'duration'],
          headers: ['Migration', 'Status', 'Duration'],
        });
      } catch (error) {
        formatter.error(
          `Failed to rollback migrations: ${error instanceof Error ? error.message : 'Unknown error'}`
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
        const migration = await apiClient.request('/api/database/migrations/create', {
          method: 'POST',
          body: { name },
        }) as Migration;

        formatter.success(`Migration created: ${migration.filename}`);
        formatter.output(migration, {
          fields: ['name', 'version', 'filename', 'createdAt'],
          headers: ['Name', 'Version', 'Filename', 'Created At'],
        });
      } catch (error) {
        formatter.error(
          `Failed to create migration: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}
