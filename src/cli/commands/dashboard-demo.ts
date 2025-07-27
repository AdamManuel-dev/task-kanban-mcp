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
      console.log(chalk.cyan('\n🎨 Available Dashboard Themes:'));
      getThemeNames().forEach(theme => {
        console.log(`  ${chalk.yellow('•')} ${theme}`);
      });
      console.log(chalk.gray('\nUse these theme names with "kanban dashboard --theme <theme>"\n'));
      return;
    }
    console.log(chalk.cyan('\n🚀 Kanban Dashboard Demo\n'));

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
        console.log(
          chalk.yellow(`Unknown layout: ${layout}. Available: overview, velocity, personal`)
        );
    }

    console.log(
      chalk.gray(
        '\nNote: This is a text-based demo. Use "kanban dashboard" for full interactive experience.'
      )
    );
  });

function displayOverviewDemo(): void {
  console.log(chalk.bold.blue('📊 Overview Dashboard\n'));

  // Task statistics
  console.log(chalk.yellow('📋 Task Statistics:'));
  console.log('  Total Tasks: 45');
  console.log('  Todo: 18 | In Progress: 12 | Done: 13 | Blocked: 2');
  console.log('  Completion Rate: 68.8%');
  console.log('  Overdue: 3 tasks\n');

  // Priority breakdown
  console.log(chalk.yellow('⚡ Priority Breakdown:'));
  console.log('  P1 (Critical): 8 tasks');
  console.log('  P2 (High): 15 tasks');
  console.log('  P3 (Medium): 18 tasks');
  console.log('  P4 (Low): 4 tasks\n');

  // Recent activity
  console.log(chalk.yellow('🕒 Recent Activity:'));
  console.log('  14:32 - Task completed: User Auth (Alice)');
  console.log('  14:15 - New task created: Fix login bug (Bob)');
  console.log('  13:45 - Task moved to In Progress (Charlie)');
  console.log('  13:20 - Comment added to TASK-123 (Diana)');
  console.log('  12:55 - Task assigned to Alice (Bob)');
}

function displayVelocityDemo(): void {
  console.log(chalk.bold.green('📈 Velocity Dashboard\n'));

  // Team velocity
  console.log(chalk.yellow('📊 Team Velocity (Last 8 Weeks):'));
  console.log('  W1: 12 | W2: 15 | W3: 18 | W4: 14');
  console.log('  W5: 20 | W6: 16 | W7: 22 | W8: 19');
  console.log('  Average: 17 tasks/week\n');

  // Burndown
  console.log(chalk.yellow('🔥 Sprint Burndown:'));
  console.log('  Day 1: 45/45 | Day 2: 42/40 | Day 3: 38/35');
  console.log('  Day 4: 35/30 | Day 5: 30/25 | Day 6: 28/20');
  console.log('  Day 7: 25/15 | Day 8: 20/10 | Day 9: 15/5');
  console.log('  Day 10: 12/0 (Remaining/Ideal)\n');

  // Team capacity
  console.log(chalk.yellow('👥 Team Capacity:'));
  console.log('  Alice: 8 tasks (85% load)');
  console.log('  Bob: 6 tasks (70% load)');
  console.log('  Charlie: 10 tasks (95% load)');
  console.log('  Diana: 7 tasks (75% load)');
}

function displayPersonalDemo(): void {
  console.log(chalk.bold.magenta('👤 Personal Dashboard\n'));

  // Personal progress
  console.log(chalk.yellow('📈 Personal Progress:'));
  console.log('  Sprint Completion: 85%');
  console.log('  Tasks Completed This Week: 12');
  console.log('  Average Daily Focus Time: 3 hours\n');

  // Current tasks
  console.log(chalk.yellow('📝 My Current Tasks:'));
  console.log('  [In Progress] Complete user auth (P1)');
  console.log('  [Todo] Fix login bug (P1)');
  console.log('  [Done] Update docs (P3)');
  console.log('  [Todo] Code review (P2)\n');

  // Today's focus
  console.log(chalk.yellow("🎯 Today's Focus:"));
  console.log('  • Complete OAuth integration');
  console.log('  • Write unit tests for auth module');
  console.log('  • Review PR #123');
  console.log('  • Prepare demo for stakeholders\n');

  // Time tracking
  console.log(chalk.yellow("⏰ This Week's Hours:"));
  console.log('  Mon: 8h | Tue: 7h | Wed: 9h | Thu: 6h | Fri: 8h');
}
