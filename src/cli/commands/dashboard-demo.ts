import { Command } from 'commander';
import chalk from 'chalk';
import { getThemeNames } from '../ui/themes/dashboard-themes';

/**
 * Simple dashboard demo command (without blessed-contrib dependencies)
 */
export const dashboardDemoCommand = new Command('dashboard-demo')
  .description('Demo the dashboard functionality (text-based)')
  .option('-l, --layout <layout>', 'Layout to display: overview, velocity, or personal', 'overview')
  .option('--list-themes', 'List available themes')
  .action(async options => {
    // Handle list themes option
    if (options.listThemes) {
      logger.log(chalk.cyan('\n🎨 Available Dashboard Themes:'));
      getThemeNames().forEach(theme => {
        logger.log(`  ${String(String(chalk.yellow('•')))} ${String(theme)}`);
      });
      logger.log(chalk.gray('\nUse these theme names with "kanban dashboard --theme <theme>"\n'));
      return;
    }
    logger.log(chalk.cyan('\n🚀 Kanban Dashboard Demo\n'));

    const layout = options.layout || 'overview';

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
        logger.log(
          chalk.yellow(`Unknown layout: ${String(layout)}. Available: overview, velocity, personal`)
        );
    }

    logger.log(
      chalk.gray(
        '\nNote: This is a text-based demo. Use "kanban dashboard" for full interactive experience.'
      )
    );
  });

function displayOverviewDemo(): void {
  logger.log(chalk.bold.blue('📊 Overview Dashboard\n'));

  // Task statistics
  logger.log(chalk.yellow('📋 Task Statistics:'));
  logger.log('  Total Tasks: 45');
  logger.log('  Todo: 18 | In Progress: 12 | Done: 13 | Blocked: 2');
  logger.log('  Completion Rate: 68.8%');
  logger.log('  Overdue: 3 tasks\n');

  // Priority breakdown
  logger.log(chalk.yellow('⚡ Priority Breakdown:'));
  logger.log('  P1 (Critical): 8 tasks');
  logger.log('  P2 (High): 15 tasks');
  logger.log('  P3 (Medium): 18 tasks');
  logger.log('  P4 (Low): 4 tasks\n');

  // Recent activity
  logger.log(chalk.yellow('🕒 Recent Activity:'));
  logger.log('  14:32 - Task completed: User Auth (Alice)');
  logger.log('  14:15 - New task created: Fix login bug (Bob)');
  logger.log('  13:45 - Task moved to In Progress (Charlie)');
  logger.log('  13:20 - Comment added to TASK-123 (Diana)');
  logger.log('  12:55 - Task assigned to Alice (Bob)');
}

function displayVelocityDemo(): void {
  logger.log(chalk.bold.green('📈 Velocity Dashboard\n'));

  // Team velocity
  logger.log(chalk.yellow('📊 Team Velocity (Last 8 Weeks):'));
  logger.log('  W1: 12 | W2: 15 | W3: 18 | W4: 14');
  logger.log('  W5: 20 | W6: 16 | W7: 22 | W8: 19');
  logger.log('  Average: 17 tasks/week\n');

  // Burndown
  logger.log(chalk.yellow('🔥 Sprint Burndown:'));
  logger.log('  Day 1: 45/45 | Day 2: 42/40 | Day 3: 38/35');
  logger.log('  Day 4: 35/30 | Day 5: 30/25 | Day 6: 28/20');
  logger.log('  Day 7: 25/15 | Day 8: 20/10 | Day 9: 15/5');
  logger.log('  Day 10: 12/0 (Remaining/Ideal)\n');

  // Team capacity
  logger.log(chalk.yellow('👥 Team Capacity:'));
  logger.log('  Alice: 8 tasks (85% load)');
  logger.log('  Bob: 6 tasks (70% load)');
  logger.log('  Charlie: 10 tasks (95% load)');
  logger.log('  Diana: 7 tasks (75% load)');
}

function displayPersonalDemo(): void {
  logger.log(chalk.bold.magenta('👤 Personal Dashboard\n'));

  // Personal progress
  logger.log(chalk.yellow('📈 Personal Progress:'));
  logger.log('  Sprint Completion: 85%');
  logger.log('  Tasks Completed This Week: 12');
  logger.log('  Average Daily Focus Time: 3 hours\n');

  // Current tasks
  logger.log(chalk.yellow('📝 My Current Tasks:'));
  logger.log('  [In Progress] Complete user auth (P1)');
  logger.log('  [Todo] Fix login bug (P1)');
  logger.log('  [Done] Update docs (P3)');
  logger.log('  [Todo] Code review (P2)\n');

  // Today's focus
  logger.log(chalk.yellow("🎯 Today's Focus:"));
  logger.log('  • Complete OAuth integration');
  logger.log('  • Write unit tests for auth module');
  logger.log('  • Review PR #123');
  logger.log('  • Prepare demo for stakeholders\n');

  // Time tracking
  logger.log(chalk.yellow("⏰ This Week's Hours:"));
  logger.log('  Mon: 8h | Tue: 7h | Wed: 9h | Thu: 6h | Fri: 8h');
}
