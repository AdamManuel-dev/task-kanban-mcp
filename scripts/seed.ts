#!/usr/bin/env tsx

/**
 * Database seeding CLI script
 *
 * Usage:
 *   npm run seed run           # Run all pending seeds
 *   npm run seed run --force   # Force re-run all seeds
 *   npm run seed status        # Show seed status
 *   npm run seed reset         # Reset all seed records
 *   npm run seed create name   # Create new seed file
 */

import { Command } from 'commander';
import path from 'path';
import { dbConnection } from '../src/database/connection';
import { SeedRunner } from '../src/database/seeds';

/* eslint-disable no-console */

const program = new Command();

program.name('seed').description('Database seed management').version('1.0.0');

program
  .command('run')
  .description('Run database seeds')
  .option('-f, --force', 'Force re-run seeds that have already been applied')
  .action(async (options: { force?: boolean }) => {
    try {
      await dbConnection.initialize({ skipSchema: true });
      const count = await dbConnection.runSeeds({ force: options.force ?? false });

      if (count === 0) {
        console.log('✅ No pending seeds');
      } else {
        console.log(`✅ Successfully ran ${count} seed(s)`);
      }
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    } finally {
      await dbConnection.close();
    }
  });

program
  .command('status')
  .description('Show seed status')
  .action(async () => {
    try {
      await dbConnection.initialize({ skipSchema: true });
      const status = await dbConnection.getSeedStatus();

      console.log('\n📊 Seed Status:');
      console.log(`   Total seeds: ${status.total}`);
      console.log(`   Applied: ${status.applied.length}`);
      console.log(`   Pending: ${status.pending.length}`);

      if (status.applied.length > 0) {
        console.log('\n✅ Applied Seeds:');
        status.applied.forEach(name => console.log(`   - ${name}`));
      }

      if (status.pending.length > 0) {
        console.log('\n⏳ Pending Seeds:');
        status.pending.forEach(name => console.log(`   - ${name}`));
      }

      console.log('');
    } catch (error) {
      console.error('❌ Failed to get seed status:', error);
      process.exit(1);
    } finally {
      await dbConnection.close();
    }
  });

program
  .command('reset')
  .description('Reset all seed records (allows seeds to be re-run)')
  .action(async () => {
    try {
      await dbConnection.initialize({ skipSchema: true });
      await dbConnection.resetSeeds();
      console.log('✅ All seed records cleared');
    } catch (error) {
      console.error('❌ Failed to reset seeds:', error);
      process.exit(1);
    } finally {
      await dbConnection.close();
    }
  });

program
  .command('create <name>')
  .description('Create a new seed file')
  .option('-d, --description <description>', 'Description of the seed', '')
  .action(async (name: string, options: { description?: string }) => {
    try {
      const seedsPath = path.join(__dirname, '..', 'src', 'database', 'seeds');
      const filename = await SeedRunner.createSeed(name, options.description ?? '', seedsPath);
      console.log(`✅ Created seed: ${filename}`);
      console.log(`📝 Edit the file at: ${path.join(seedsPath, filename)}`);
    } catch (error) {
      console.error('❌ Failed to create seed:', error);
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
