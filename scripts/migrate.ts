#!/usr/bin/env tsx

/**
 * Database migration CLI script
 *
 * Usage:
 *   npm run migrate up           # Run all pending migrations
 *   npm run migrate down         # Rollback last migration
 *   npm run migrate status       # Show migration status
 *   npm run migrate create name  # Create new migration
 */

import { Command } from 'commander';
import path from 'path';
import { dbConnection } from '../src/database/connection';
import { MigrationRunner } from '../src/database/migrations';

/* eslint-disable no-console */

const program = new Command();

program.name('migrate').description('Database migration management').version('1.0.0');

program
  .command('up')
  .description('Run pending migrations')
  .option('-t, --target <migration>', 'Target migration to migrate up to')
  .action(async (options: { target?: string }) => {
    try {
      await dbConnection.initialize({ skipSchema: true });
      const count = await dbConnection.runMigrations(options.target);

      if (count === 0) {
        console.log('✅ No pending migrations');
      } else {
        console.log(`✅ Successfully ran ${count} migration(s)`);
      }
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    } finally {
      await dbConnection.close();
    }
  });

program
  .command('down')
  .description('Rollback migrations')
  .option('-t, --target <migration>', 'Target migration to rollback to')
  .action(async (options: { target?: string }) => {
    try {
      await dbConnection.initialize({ skipSchema: true });
      const count = await dbConnection.rollbackMigrations(options.target);

      if (count === 0) {
        console.log('✅ No migrations to rollback');
      } else {
        console.log(`✅ Successfully rolled back ${count} migration(s)`);
      }
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      process.exit(1);
    } finally {
      await dbConnection.close();
    }
  });

program
  .command('status')
  .description('Show migration status')
  .action(async () => {
    try {
      await dbConnection.initialize({ skipSchema: true });
      const status = await dbConnection.getMigrationStatus();

      console.log('\n📊 Migration Status:');
      console.log(`   Total migrations: ${status.total}`);
      console.log(`   Applied: ${status.applied.length}`);
      console.log(`   Pending: ${status.pending.length}`);

      if (status.applied.length > 0) {
        console.log('\n✅ Applied Migrations:');
        status.applied.forEach(id => console.log(`   - ${id}`));
      }

      if (status.pending.length > 0) {
        console.log('\n⏳ Pending Migrations:');
        status.pending.forEach(id => console.log(`   - ${id}`));
      }

      console.log('');
    } catch (error) {
      console.error('❌ Failed to get migration status:', error);
      process.exit(1);
    } finally {
      await dbConnection.close();
    }
  });

program
  .command('create <name>')
  .description('Create a new migration file')
  .action(async (name: string) => {
    try {
      const migrationsPath = path.join(__dirname, '..', 'src', 'database', 'migrations');
      const filename = await MigrationRunner.createMigration(name, migrationsPath);
      console.log(`✅ Created migration: ${filename}`);
      console.log(`📝 Edit the file at: ${path.join(migrationsPath, filename)}`);
    } catch (error) {
      console.error('❌ Failed to create migration:', error);
      process.exit(1);
    }
  });

// Handle any unknown commands
program.on('command:*', () => {
  console.error(
    '❌ Invalid command: %s\nSee --help for a list of available commands.',
    program.args.join(' ')
  );
  process.exit(1);
});

if (process.argv.length <= 2) {
  program.help();
}

program.parse(process.argv);
