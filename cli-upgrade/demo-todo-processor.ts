#!/usr/bin/env tsx

/**
 * Demo script to show how the TODO processor works
 * Run with: tsx cli-upgrade/demo-todo-processor.ts
 */

import chalk from 'chalk';
import { todoProcessor } from '../src/cli/utils/todo-processor';

/* eslint-disable no-console */

async function runDemo(): Promise<void> {
  console.log(chalk.cyan('\n🚀 TODO Processor Demo\n'));

  console.log(chalk.yellow('Processing TODOs with phase grouping:\n'));

  await todoProcessor.processTodos('./cli-upgrade/TODO.md', {
    groupByPhase: true,
    concurrent: true,
    generateReport: true,
    dryRun: true, // Just simulate, don't actually modify files
  });

  console.log(
    chalk.green('\n✅ Demo complete! Check cli-upgrade/TODO-report.md for the generated report.\n')
  );
}

runDemo().catch(console.error);
