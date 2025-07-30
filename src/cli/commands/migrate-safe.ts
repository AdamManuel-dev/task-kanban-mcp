/**
 * @fileoverview Type-safe migration CLI command
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Migration management CLI, rollback support, validation
 * Main APIs: migrate-safe command with subcommands
 * Constraints: Requires database connection, CLI environment
 * Patterns: Command pattern, comprehensive error handling, logging
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { DatabaseConnection } from '../../database/connection';
import type { TypeSafeMigration } from '../../database/migrations/TypeSafeMigrationRunner';
import type { AppliedMigration } from '../../database/migrations/types';
import { TypeSafeMigrationRunner } from '../../database/migrations/TypeSafeMigrationRunner';
import { logger } from '../../utils/logger';

interface MigrateOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

interface StatusOptions {
  verbose?: boolean;
}

interface RollbackOptions {
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Execute action with migration runner setup
 */
async function withMigrationRunner(
  options: unknown,
  action: (runner: TypeSafeMigrationRunner) => Promise<void>
): Promise<void> {
  const dbConnection = DatabaseConnection.getInstance();

  try {
    await dbConnection.initialize();

    const runner = new TypeSafeMigrationRunner(dbConnection.getDatabase().getDatabaseInstance());
    await runner.initialize();

    await action(runner);
  } catch (error) {
    logger.error('Migration command failed:', error);
    // eslint-disable-next-line no-console
    console.error(chalk.red(`ERROR: Migration failed: ${error}`));
    process.exit(1);
  } finally {
    await dbConnection.close();
  }
}

/**
 * Load migrations for version calculation
 */
async function loadMigrationsForVersioning() {
  const dbConnection = DatabaseConnection.getInstance();
  await dbConnection.initialize();

  const runner = new TypeSafeMigrationRunner(dbConnection.getDatabase().getDatabaseInstance());
  await runner.initialize();

  const migrations = await runner.loadTypeSafeMigrations();
  await dbConnection.close();

  return migrations;
}

/**
 * Generate migration template
 */
function generateMigrationTemplate(version: number, name: string): string {
  // Generate migration template without unused className
  // const className = name
  //   .split('_')
  //   .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  //   .join('');

  return `/**
 * @fileoverview ${name.replace(/_/g, ' ')} migration
 * @lastmodified ${new Date().toISOString()}
 * 
 * Features: ${name.replace(/_/g, ' ')} implementation
 * Main APIs: Schema migration for ${name}
 * Constraints: Follows TypeSafeMigration interface
 * Patterns: Type-safe schema definition, validation, rollback support
 */

import type { Database } from 'sqlite3';
import { promisify } from 'util';
import type { 
  TypeSafeMigration, 
  SchemaVersion 
} from './TypeSafeMigrationRunner';

/**
 * Schema version for ${name.replace(/_/g, ' ')}
 */
const schemaV${version}: SchemaVersion = {
  version: ${version},
  description: '${name.replace(/_/g, ' ')}',
  tables: {
    // Define your table schemas here
    // example_table: {
    //   name: 'example_table',
    //   columns: {
    //     id: { type: 'TEXT', nullable: false },
    //     name: { type: 'TEXT', nullable: false }
    //   },
    //   primaryKey: 'id'
    // }
  },
  indexes: [
    // Define indexes here
    // {
    //   name: 'idx_example_table_name',
    //   table: 'example_table',
    //   columns: ['name']
    // }
  ],
  constraints: [
    // Define constraints here
    // {
    //   name: 'chk_example_table_name',
    //   table: 'example_table',
    //   type: 'CHECK',
    //   definition: "name != ''"
    // }
  ]
};

/**
 * Type-safe migration for ${name.replace(/_/g, ' ')}
 */
const migration: TypeSafeMigration = {
  id: 'ts_${String(version).padStart(3, '0')}_${name}',
  version: ${version},
  description: '${name.replace(/_/g, ' ')}',
  schema: schemaV${version},

  /**
   * Apply migration
   */
  async up(db: Database, schema: SchemaVersion): Promise<void> {
    const run = promisify(db.run.bind(db));

    // TODO: Implement your migration logic here
    // Example:
    // await run(
    //   'CREATE TABLE example_table (' +
    //   '  id TEXT PRIMARY KEY,' +
    //   '  name TEXT NOT NULL' +
    //   ')'
    // );
  },

  /**
   * Rollback migration
   */
  async down(db: Database, previousSchema?: SchemaVersion): Promise<void> {
    const run = promisify(db.run.bind(db));

    // TODO: Implement your rollback logic here
    // Example:
    // await run('DROP TABLE IF EXISTS example_table');
  },

  /**
   * Validate schema after migration
   */
  async validate(db: Database): Promise<boolean> {
    const get = promisify(db.get.bind(db));

    try {
      // TODO: Implement validation logic
      // Example:
      // const tableExists = await get(
      //   "SELECT name FROM sqlite_master WHERE type='table' AND name='example_table'"
      // );
      // return !!tableExists;
      
      return true;
    } catch (error) {
      logger.error('Migration validation failed:', error);
      return false;
    }
  }
};

export default migration;
`;
}

/**
 * Create migrate-safe command with subcommands
 */
export function createMigrateSafeCommand(): Command {
  const command = new Command('migrate-safe');

  command
    .description('Type-safe database migration management')
    .option('-v, --verbose', 'Enable verbose logging');

  // Status subcommand
  command
    .command('status')
    .description('Show migration status and schema version')
    .action(async (options: StatusOptions) => {
      await withMigrationRunner(options, async runner => {
        const currentVersion = await runner.getCurrentSchemaVersion();
        const migrations = await runner.loadTypeSafeMigrations();
        const appliedMigrations = await runner.getAppliedMigrations();

        // eslint-disable-next-line no-console
        console.log(chalk.blue('\nMigration Status\n'));
        // eslint-disable-next-line no-console
        console.log('Current Schema Version: ' + chalk.green(currentVersion));
        // eslint-disable-next-line no-console
        console.log('Total Migrations Available: ' + chalk.cyan(migrations.length));
        // eslint-disable-next-line no-console
        console.log('Applied Migrations: ' + chalk.green(appliedMigrations.length));

        const pendingMigrations = migrations.filter(
          (m: TypeSafeMigration) =>
            !appliedMigrations.some((am: AppliedMigration) => am.id === m.id)
        );

        if (pendingMigrations.length > 0) {
          // eslint-disable-next-line no-console
          console.log(chalk.yellow('Warning: Pending Migrations: ') + pendingMigrations.length);
          pendingMigrations.forEach((m: TypeSafeMigration) => {
            // eslint-disable-next-line no-console
            console.log('  - ' + chalk.yellow(m.id) + ': ' + m.description);
          });
        } else {
          // eslint-disable-next-line no-console
          console.log(chalk.green('SUCCESS: All migrations applied'));
        }

        // eslint-disable-next-line no-console
        console.log();
      });
    });

  // Up subcommand
  command
    .command('up')
    .description('Run pending migrations')
    .option('--dry-run', 'Show what migrations would be applied without executing')
    .action(async (options: MigrateOptions) => {
      await withMigrationRunner(options, async runner => {
        const migrations = await runner.loadTypeSafeMigrations();
        const appliedMigrations = await runner.getAppliedMigrations();
        const appliedIds = new Set(appliedMigrations.map((m: AppliedMigration) => m.id));

        const pendingMigrations = migrations.filter(
          (m: TypeSafeMigration) => !appliedIds.has(m.id)
        );

        if (pendingMigrations.length === 0) {
          // eslint-disable-next-line no-console
          console.log(chalk.green('SUCCESS: No pending migrations'));
          return;
        }

        // eslint-disable-next-line no-console
        console.log(
          chalk.blue(
            '\n=> ' +
              (options.dryRun ? 'Would apply' : 'Applying') +
              ' ' +
              pendingMigrations.length +
              ' migration(s)\n'
          )
        );

        if (options.dryRun) {
          pendingMigrations.forEach((migration: TypeSafeMigration) => {
            // eslint-disable-next-line no-console
            console.log(chalk.cyan('→') + ' ' + migration.id + ': ' + migration.description);
            // eslint-disable-next-line no-console
            console.log('   Schema version: ' + migration.version);
          });
          return;
        }

        const results = await runner.runPendingMigrations();

        let successCount = 0;
        let errorCount = 0;

        for (const result of results) {
          if (result.success) {
            successCount++;
            // eslint-disable-next-line no-console
            console.log(
              chalk.green('OK') +
                ' ' +
                result.migrationId +
                ' ' +
                chalk.gray('(' + result.executionTime + 'ms)')
            );
          } else {
            errorCount++;
            // eslint-disable-next-line no-console
            console.log(
              chalk.red('ERROR') +
                ' ' +
                result.migrationId +
                ': ' +
                (result.error?.message || 'Unknown error')
            );
          }
        }

        // eslint-disable-next-line no-console
        console.log();
        if (errorCount === 0) {
          // eslint-disable-next-line no-console
          console.log(chalk.green('Successfully applied ' + successCount + ' migration(s)'));
        } else {
          // eslint-disable-next-line no-console
          console.log(
            chalk.red(errorCount + ' migration(s) failed, ' + successCount + ' succeeded')
          );
          process.exit(1);
        }
      });
    });

  // Rollback subcommand
  command
    .command('rollback')
    .description('Rollback to a specific schema version')
    .argument('<version>', 'Target schema version to rollback to')
    .option('--dry-run', 'Show what would be rolled back without executing')
    .action(async (targetVersion: string, options: RollbackOptions) => {
      const version = parseInt(targetVersion, 10);
      if (Number.isNaN(version)) {
        // eslint-disable-next-line no-console
        console.error(chalk.red('ERROR: Invalid version number'));
        process.exit(1);
      }

      await withMigrationRunner(options, async runner => {
        const currentVersion = await runner.getCurrentSchemaVersion();

        if (version >= currentVersion) {
          // eslint-disable-next-line no-console
          console.log(
            chalk.yellow(
              'WARNING: Target version ' +
                version +
                ' is not less than current version ' +
                currentVersion
            )
          );
          return;
        }

        const migrations = await runner.loadTypeSafeMigrations();
        const migrationsToRollback = migrations
          .filter((m: TypeSafeMigration) => m.version > version && m.version <= currentVersion)
          .sort((a: TypeSafeMigration, b: TypeSafeMigration) => b.version - a.version);

        if (migrationsToRollback.length === 0) {
          // eslint-disable-next-line no-console
          console.log(chalk.green('SUCCESS: No migrations to rollback'));
          return;
        }

        // eslint-disable-next-line no-console
        console.log(
          chalk.blue(
            '\n<= ' +
              (options.dryRun ? 'Would rollback' : 'Rolling back') +
              ' ' +
              migrationsToRollback.length +
              ' migration(s)\n'
          )
        );

        if (options.dryRun) {
          migrationsToRollback.forEach((migration: TypeSafeMigration) => {
            // eslint-disable-next-line no-console
            console.log(chalk.yellow('<-') + ' ' + migration.id + ': ' + migration.description);
          });
          return;
        }

        const results = await runner.rollbackToVersion(version);

        let successCount = 0;
        let errorCount = 0;

        for (const result of results) {
          if (result.success) {
            successCount++;
            // eslint-disable-next-line no-console
            console.log(
              chalk.green('SUCCESS') +
                ' Rolled back ' +
                result.migrationId +
                ' ' +
                chalk.gray('(' + result.executionTime + 'ms)')
            );
          } else {
            errorCount++;
            // eslint-disable-next-line no-console
            console.log(
              chalk.red('ERROR') +
                ' ' +
                result.migrationId +
                ': ' +
                (result.error?.message || 'Unknown error')
            );
          }
        }

        // eslint-disable-next-line no-console
        console.log();
        if (errorCount === 0) {
          // eslint-disable-next-line no-console
          console.log(
            chalk.green(
              'SUCCESS: Successfully rolled back ' +
                successCount +
                ' migration(s) to version ' +
                version
            )
          );
        } else {
          // eslint-disable-next-line no-console
          console.log(
            chalk.red(errorCount + ' rollback(s) failed, ' + successCount + ' succeeded')
          );
          process.exit(1);
        }
      });
    });

  // Validate subcommand
  command
    .command('validate')
    .description('Validate current database schema')
    .action(async options => {
      await withMigrationRunner(options, async runner => {
        // eslint-disable-next-line no-console
        console.log(chalk.blue('\nValidating database schema...\n'));

        const validation = await runner.validateCurrentSchema();

        if (validation.valid) {
          // eslint-disable-next-line no-console
          console.log(chalk.green('SUCCESS: Schema validation passed'));
        } else {
          // eslint-disable-next-line no-console
          console.log(chalk.red('ERROR: Schema validation failed:'));
          validation.errors.forEach((error: string) => {
            // eslint-disable-next-line no-console
            console.log('  - ' + chalk.red(error));
          });
          process.exit(1);
        }
      });
    });

  // Create subcommand
  command
    .command('create')
    .description('Create a new type-safe migration file')
    .argument('<name>', 'Migration name (e.g., add_user_preferences)')
    .action(async (name: string, _options: StatusOptions) => {
      const migrations = await loadMigrationsForVersioning();
      const nextVersion = Math.max(...migrations.map((m: TypeSafeMigration) => m.version), 0) + 1;

      const filename = 'ts_' + String(nextVersion).padStart(3, '0') + '_' + name + '.ts';
      const template = generateMigrationTemplate(nextVersion, name);

      try {
        const fs = await import('fs/promises');
        const path = await import('path');

        const migrationPath = path.join(__dirname, '../../database/migrations', filename);
        await fs.writeFile(migrationPath, template);

        // eslint-disable-next-line no-console
        console.log(chalk.green('SUCCESS: Created migration: ' + filename));
        // eslint-disable-next-line no-console
        console.log(chalk.gray('   Path: ' + migrationPath));
        // eslint-disable-next-line no-console
        console.log(chalk.blue('\nNext steps:'));
        // eslint-disable-next-line no-console
        console.log('   1. Edit the migration file to define your schema changes');
        // eslint-disable-next-line no-console
        console.log('   2. Run "migrate-safe up" to apply the migration');
      } catch (error) {
        logger.error('Failed to create migration:', error);
        // eslint-disable-next-line no-console
        console.error(chalk.red('ERROR: Failed to create migration: ' + String(error)));
        process.exit(1);
      }
    });

  return command;
}
