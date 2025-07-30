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
import sqlite3 from 'sqlite3';
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

        console.log(chalk.blue('\n📊 Migration Status\n'));
        console.log(`Current Schema Version: ${chalk.green(currentVersion)}`);
        console.log(`Total Migrations Available: ${chalk.cyan(migrations.length)}`);
        console.log(`Applied Migrations: ${chalk.green(appliedMigrations.length)}`);

        const pendingMigrations = migrations.filter(
          (m: TypeSafeMigration) =>
            !appliedMigrations.some((am: AppliedMigration) => am.id === m.id)
        );

        if (pendingMigrations.length > 0) {
          console.log(`${chalk.yellow('⚠️  Pending Migrations:')} ${pendingMigrations.length}`);
          pendingMigrations.forEach((m: TypeSafeMigration) => {
            console.log(`  - ${chalk.yellow(m.id)}: ${m.description}`);
          });
        } else {
          console.log(chalk.green('✅ All migrations applied'));
        }

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
          console.log(chalk.green('✅ No pending migrations'));
          return;
        }

        console.log(
          chalk.blue(
            `\n🚀 ${options.dryRun ? 'Would apply' : 'Applying'} ${pendingMigrations.length} migration(s)\n`
          )
        );

        if (options.dryRun) {
          pendingMigrations.forEach((migration: TypeSafeMigration) => {
            console.log(`${chalk.cyan('→')} ${migration.id}: ${migration.description}`);
            console.log(`   Schema version: ${migration.version}`);
          });
          return;
        }

        const results = await runner.runPendingMigrations();

        let successCount = 0;
        let errorCount = 0;

        for (const result of results) {
          if (result.success) {
            successCount++;
            console.log(
              `${chalk.green('✅')} ${result.migrationId} ` +
                `${chalk.gray(`(${result.executionTime}ms)`)}`
            );
          } else {
            errorCount++;
            console.log(`${chalk.red('❌')} ${result.migrationId}: ${result.error?.message}`);
          }
        }

        console.log();
        if (errorCount === 0) {
          console.log(chalk.green(`🎉 Successfully applied ${successCount} migration(s)`));
        } else {
          console.log(chalk.red(`❌ ${errorCount} migration(s) failed, ${successCount} succeeded`));
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
      if (isNaN(version)) {
        console.error(chalk.red('❌ Invalid version number'));
        process.exit(1);
      }

      await withMigrationRunner(options, async runner => {
        const currentVersion = await runner.getCurrentSchemaVersion();

        if (version >= currentVersion) {
          console.log(
            chalk.yellow(
              `⚠️  Target version ${version} is not less than current version ${currentVersion}`
            )
          );
          return;
        }

        const migrations = await runner.loadTypeSafeMigrations();
        const migrationsToRollback = migrations
          .filter((m: TypeSafeMigration) => m.version > version && m.version <= currentVersion)
          .sort((a: TypeSafeMigration, b: TypeSafeMigration) => b.version - a.version);

        if (migrationsToRollback.length === 0) {
          console.log(chalk.green('✅ No migrations to rollback'));
          return;
        }

        console.log(
          chalk.blue(
            `\n🔄 ${options.dryRun ? 'Would rollback' : 'Rolling back'} ${migrationsToRollback.length} migration(s)\n`
          )
        );

        if (options.dryRun) {
          migrationsToRollback.forEach((migration: TypeSafeMigration) => {
            console.log(`${chalk.yellow('←')} ${migration.id}: ${migration.description}`);
          });
          return;
        }

        const results = await runner.rollbackToVersion(version);

        let successCount = 0;
        let errorCount = 0;

        for (const result of results) {
          if (result.success) {
            successCount++;
            console.log(
              `${chalk.green('✅')} Rolled back ${result.migrationId} ` +
                `${chalk.gray(`(${result.executionTime}ms)`)}`
            );
          } else {
            errorCount++;
            console.log(`${chalk.red('❌')} ${result.migrationId}: ${result.error?.message}`);
          }
        }

        console.log();
        if (errorCount === 0) {
          console.log(
            chalk.green(
              `🎉 Successfully rolled back ${successCount} migration(s) to version ${version}`
            )
          );
        } else {
          console.log(chalk.red(`❌ ${errorCount} rollback(s) failed, ${successCount} succeeded`));
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
        console.log(chalk.blue('\n🔍 Validating database schema...\n'));

        const validation = await runner.validateCurrentSchema();

        if (validation.valid) {
          console.log(chalk.green('✅ Schema validation passed'));
        } else {
          console.log(chalk.red('❌ Schema validation failed:'));
          validation.errors.forEach((error: string) => {
            console.log(`  - ${chalk.red(error)}`);
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
    .action(async (name: string, options: StatusOptions) => {
      const migrations = await loadMigrationsForVersioning();
      const nextVersion = Math.max(...migrations.map((m: TypeSafeMigration) => m.version), 0) + 1;

      const filename = `ts_${String(nextVersion).padStart(3, '0')}_${name}.ts`;
      const template = generateMigrationTemplate(nextVersion, name);

      try {
        const fs = await import('fs/promises');
        const path = await import('path');

        const migrationPath = path.join(__dirname, '../../database/migrations', filename);
        await fs.writeFile(migrationPath, template);

        console.log(chalk.green(`✅ Created migration: ${filename}`));
        console.log(chalk.gray(`   Path: ${migrationPath}`));
        console.log(chalk.blue('\n📝 Next steps:'));
        console.log('   1. Edit the migration file to define your schema changes');
        console.log('   2. Run "migrate-safe up" to apply the migration');
      } catch (error) {
        console.error(chalk.red(`❌ Failed to create migration: ${error}`));
        process.exit(1);
      }
    });

  return command;
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
    console.error(chalk.red(`❌ Migration failed: ${error}`));
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
  const className = name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

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
    // await run(\`
    //   CREATE TABLE example_table (
    //     id TEXT PRIMARY KEY,
    //     name TEXT NOT NULL
    //   )
    // \`);
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
      console.error('Validation failed:', error);
      return false;
    }
  }
};

export default migration;
`;
}
