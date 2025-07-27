import { Command } from 'commander';
import chalk from 'chalk';
import { getThemeNames } from '../ui/themes/dashboard-themes';
import { logger } from '../../utils/logger';

function displayOverviewDemo(): void {
  logger.info(chalk.bold.blue('📊 Overview Dashboard\n'));

  // Task statistics
  logger.info(chalk.yellow('📋 Task Statistics:'));
  logger.info('  Total Tasks: 45');
  logger.info('  Todo: 18 | In Progress: 12 | Done: 13 | Blocked: 2');
  logger.info('  Completion Rate: 68.8%');
  logger.info('  Overdue: 3 tasks\n');

  // Priority breakdown
  logger.info(chalk.yellow('⚡ Priority Breakdown:'));
  logger.info('  P1 (Critical): 8 tasks');
  logger.info('  P2 (High): 15 tasks');
  logger.info('  P3 (Medium): 18 tasks');
  logger.info('  P4 (Low): 4 tasks\n');

  // Recent activity
  logger.info(chalk.yellow('🕒 Recent Activity:'));
  logger.info('  14:32 - Task completed: User Auth (Alice)');
  logger.info('  14:15 - New task created: Fix login bug (Bob)');
  logger.info('  13:45 - Task moved to In Progress (Charlie)');
  logger.info('  13:20 - Comment added to TASK-123 (Diana)');
  logger.info('  12:55 - Task assigned to Alice (Bob)');
}

function displayVelocityDemo(): void {
  logger.info(chalk.bold.green('📈 Velocity Dashboard\n'));

  // Team velocity
  logger.info(chalk.yellow('📊 Team Velocity (Last 8 Weeks):'));
  logger.info('  W1: 12 | W2: 15 | W3: 18 | W4: 14');
  logger.info('  W5: 20 | W6: 16 | W7: 22 | W8: 19');
  logger.info('  Average: 17 tasks/week\n');

  // Burndown
  logger.info(chalk.yellow('🔥 Sprint Burndown:'));
  logger.info('  Day 1: 45/45 | Day 2: 42/40 | Day 3: 38/35');
  logger.info('  Day 4: 35/30 | Day 5: 30/25 | Day 6: 28/20');
  logger.info('  Day 7: 25/15 | Day 8: 20/10 | Day 9: 15/5');
  logger.info('  Day 10: 12/0 (Remaining/Ideal)\n');

  // Team capacity
  logger.info(chalk.yellow('👥 Team Capacity:'));
  logger.info('  Alice: 8 tasks (85% load)');
  logger.info('  Bob: 6 tasks (70% load)');
  logger.info('  Charlie: 10 tasks (95% load)');
  logger.info('  Diana: 7 tasks (75% load)');
}

function displayPersonalDemo(): void {
  logger.info(chalk.bold.magenta('👤 Personal Dashboard\n'));

  // Personal progress
  logger.info(chalk.yellow('📈 Personal Progress:'));
  logger.info('  Sprint Completion: 85%');
  logger.info('  Tasks Completed This Week: 12');
  logger.info('  Average Daily Focus Time: 3 hours\n');

  // Current tasks
  logger.info(chalk.yellow('📝 My Current Tasks:'));
  logger.info('  [In Progress] Complete user auth (P1)');
  logger.info('  [Todo] Fix login bug (P1)');
  logger.info('  [Done] Update docs (P3)');
  logger.info('  [Todo] Code review (P2)\n');

  // Today's focus
  logger.info(chalk.yellow("🎯 Today's Focus:"));
  logger.info('  • Complete OAuth integration');
  logger.info('  • Write unit tests for auth module');
  logger.info('  • Review PR #123');
  logger.info('  • Prepare demo for stakeholders\n');

  // Time tracking
  logger.info(chalk.yellow("⏰ This Week's Hours:"));
  logger.info('  Mon: 6h | Tue: 7h | Wed: 5h | Thu: 8h | Fri: 4h');
  logger.info('  Total: 30 hours | Average: 6 hours/day');
}

/**
 * Simple dashboard demo command (without blessed-contrib dependencies)
 */
export const dashboardDemoCommand = new Command('dashboard-demo')
  .description('Demo the dashboard functionality (text-based)')
  .option('-l, --layout <layout>', 'Layout to display: overview, velocity, or personal', 'overview')
  .option('--list-themes', 'List available themes')
  .action((options: { layout?: string; listThemes?: boolean }) => {
    // Handle list themes option
    if (options.listThemes) {
      logger.info(chalk.cyan('\n🎨 Available Dashboard Themes:'));
      getThemeNames().forEach(theme => {
        logger.info(`  ${String(chalk.yellow('•'))} ${String(theme)}`);
      });
      logger.info(chalk.gray('\nUse these theme names with "kanban dashboard --theme <theme>"\n'));
      return;
    }
    logger.info(chalk.cyan('\n🚀 Kanban Dashboard Demo\n'));

    const layout: string = options.layout ?? 'overview';

    switch (layout) {
      case 'overview':
        displayOverviewDemo();
        break;
      case 'velocity':
        displayVelocityDemo();
        break;
      case 'personal':
        displayPersonalDemo();
        break;
      default:
        logger.info(
          chalk.yellow(`Unknown layout: ${String(layout)}. Available: overview, velocity, personal`)
        );
    }

    logger.info(
      chalk.gray(
        '\nNote: This is a text-based demo. Use "kanban dashboard" for full interactive experience.'
      )
    );
  });
