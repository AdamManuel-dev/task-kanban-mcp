/**
 * @fileoverview CLI commands for database recovery and integrity management
 * @lastmodified 2025-07-28T10:50:00Z
 *
 * Features: Corruption detection, data repair, integrity validation, backup recovery
 * Main APIs: scanCommand, repairCommand, validateCommand, recoverCommand
 * Constraints: Requires database connection, backup system
 * Patterns: CLI command structure, error handling, user confirmation
 */

import { logger } from '@/utils/logger';

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  detectDatabaseCorruption,
  repairDatabaseCorruption,
  validateDatabaseIntegrity,
  recoverDatabaseFromBackup,
} from '../../utils/dataRecovery';

export const recoveryCommand = new Command('recovery').description(
  'Database recovery and integrity management'
);

recoveryCommand
  .command('scan')
  .description('Scan database for corruption')
  .option('-v, --verbose', 'Show detailed output')
  .action(async _options => {
    try {
      console.log(chalk.blue('🔍 Scanning database for corruption...\n'));

      const report = await detectDatabaseCorruption();

      if (!report.corrupted) {
        console.log(chalk.green('✅ No corruption detected. Database is healthy.'));
        return;
      }

      console.log(
        chalk.yellow(
          `⚠️  Found ${report.issues.length} issues (Severity: ${report.severity.toUpperCase()})\n`
        )
      );

      // Display issues
      report.issues.forEach((issue, index) => {
        const severityColor = {
          low: chalk.blue,
          medium: chalk.yellow,
          high: chalk.red,
          critical: chalk.redBright,
        }[issue.severity];

        console.log(`${index + 1}. ${severityColor(issue.severity.toUpperCase())} - ${issue.type}`);
        console.log(`   Table: ${issue.table}`);
        if (issue.column) console.log(`   Column: ${issue.column}`);
        if (issue.recordId) console.log(`   Record ID: ${issue.recordId}`);
        console.log(`   Description: ${issue.description}`);
        console.log(
          `   Can Auto-Repair: ${issue.canAutoRepair ? chalk.green('Yes') : chalk.red('No')}`
        );
        console.log(`   Repair Strategy: ${issue.repairStrategy}\n`);
      });

      // Display recommendations
      console.log(chalk.cyan('📋 Repair Recommendations:'));
      report.repairRecommendations.forEach(rec => {
        console.log(`   • ${rec}`);
      });

      console.log(chalk.yellow('\n💡 Run "kanban recovery repair" to attempt automatic repairs'));
    } catch (error) {
      console.error(chalk.red('❌ Error during corruption scan:'), (error as Error).message);
      logger.error('Recovery scan failed', { error });
      process.exit(1);
    }
  });

recoveryCommand
  .command('repair')
  .description('Attempt to repair database corruption')
  .option('--no-backup', 'Skip creating backup before repair')
  .option('--no-validation', 'Skip validation after repair')
  .option('--max-attempts <number>', 'Maximum repair attempts', '3')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options: Record<string, unknown>) => {
    try {
      console.log(chalk.blue('🔧 Starting database repair process...\n'));

      // First, scan for issues
      const report = await detectDatabaseCorruption();

      if (!report.corrupted) {
        console.log(chalk.green('✅ No corruption detected. Database is already healthy.'));
        return;
      }

      console.log(chalk.yellow(`Found ${report.issues.length} issues to repair\n`));

      // Show what will be repaired
      const repairableIssues = report.issues.filter(i => i.canAutoRepair);
      const nonRepairableIssues = report.issues.filter(i => !i.canAutoRepair);

      if (repairableIssues.length > 0) {
        console.log(chalk.green(`${repairableIssues.length} issues can be auto-repaired:`));
        repairableIssues.forEach(issue => {
          console.log(`   • ${issue.description}`);
        });
        console.log();
      }

      if (nonRepairableIssues.length > 0) {
        console.log(chalk.red(`${nonRepairableIssues.length} issues require manual attention:`));
        nonRepairableIssues.forEach(issue => {
          console.log(`   • ${issue.description}`);
        });
        console.log();
      }

      // Confirm repair
      if (!options.yes && repairableIssues.length > 0) {
        const { shouldProceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldProceed',
            message: 'Proceed with automatic repair?',
            default: true,
          },
        ]);

        if (!shouldProceed) {
          console.log(chalk.yellow('Repair cancelled by user'));
          return;
        }
      }

      // Perform repair
      if (repairableIssues.length > 0) {
        const repairOptions = {
          attemptAutoRepair: true,
          createBackupBeforeRepair: !options.noBackup,
          validateAfterRepair: !options.noValidation,
          maxRepairAttempts: parseInt(String(options.maxAttempts || '3'), 10),
        };

        console.log(chalk.blue('🔨 Repairing database...\n'));

        const result = await repairDatabaseCorruption(report, repairOptions);

        if (result.success) {
          console.log(chalk.green(`✅ Repair completed successfully!`));
          console.log(`   • Repaired: ${result.repairedIssues} issues`);
          console.log(`   • Remaining: ${result.remainingIssues.length} issues`);
        } else {
          console.log(chalk.yellow(`⚠️  Repair partially completed`));
          console.log(`   • Repaired: ${result.repairedIssues} issues`);
          console.log(`   • Remaining: ${result.remainingIssues.length} issues`);

          if (result.remainingIssues.length > 0) {
            console.log(chalk.red('\nRemaining issues require manual attention:'));
            result.remainingIssues.forEach(issue => {
              console.log(`   • ${issue.description}`);
            });
          }
        }
      } else {
        console.log(chalk.yellow('No auto-repairable issues found'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Error during repair:'), (error as Error).message);
      logger.error('Recovery repair failed', { error });
      process.exit(1);
    }
  });

recoveryCommand
  .command('validate')
  .description('Validate database integrity')
  .action(async () => {
    try {
      console.log(chalk.blue('🔍 Validating database integrity...\n'));

      const result = await validateDatabaseIntegrity();

      if (result.valid) {
        console.log(chalk.green('✅ Database integrity validation passed'));
      } else {
        console.log(chalk.red('❌ Database integrity validation failed\n'));
        console.log(chalk.yellow('Issues found:'));
        result.issues.forEach(issue => {
          console.log(`   • ${issue}`);
        });
        console.log(chalk.yellow('\n💡 Run "kanban recovery scan" for detailed analysis'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Error during validation:'), (error as Error).message);
      logger.error('Recovery validation failed', { error });
      process.exit(1);
    }
  });

recoveryCommand
  .command('recover')
  .description('Recover database from backup')
  .argument('[backup-path]', 'Path to backup file (uses latest if not specified)')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (backupPath: string | undefined, options: Record<string, unknown>) => {
    try {
      console.log(chalk.blue('🔄 Starting database recovery from backup...\n'));

      if (backupPath) {
        console.log(`Using backup: ${backupPath}`);
      } else {
        console.log('Will use latest available backup');
      }

      // Confirm recovery
      if (!options.yes) {
        console.log(chalk.yellow('⚠️  WARNING: This will replace your current database!'));
        const { shouldProceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldProceed',
            message: 'Are you sure you want to proceed with recovery?',
            default: false,
          },
        ]);

        if (!shouldProceed) {
          console.log(chalk.yellow('Recovery cancelled by user'));
          return;
        }
      }

      const result = await recoverDatabaseFromBackup(backupPath);

      if (result.success) {
        console.log(chalk.green('✅ Database recovery completed successfully!'));
        console.log(chalk.cyan('💡 Run "kanban recovery validate" to verify integrity'));
      } else {
        console.log(chalk.red('❌ Database recovery failed'));
        if (result.error) {
          console.log(`Error: ${result.error}`);
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Error during recovery:'), (error as Error).message);
      logger.error('Database recovery failed', { error });
      process.exit(1);
    }
  });

export default recoveryCommand;
