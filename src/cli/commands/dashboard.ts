import { Command } from 'commander';
import chalk from 'chalk';
import { DashboardManager } from '../utils/dashboard-manager';
import { getThemeNames } from '../ui/themes/dashboard-themes';
import { logger } from '../../utils/logger';

/**
 * Dashboard command for launching terminal dashboards
 */
export const dashboardCommand = new Command('dashboard')
  .description('Launch interactive terminal dashboard')
  .option('-l, --layout <layout>', 'Initial layout: overview, velocity, or personal', 'overview')
  .option('-r, --refresh <seconds>', 'Auto-refresh interval in seconds', '30')
  .option('-t, --theme <theme>', `Dashboard theme: ${getThemeNames().join(', ')}`, 'dark')
  .option('--no-auto-refresh', 'Disable auto-refresh')
  .option('--list-themes', 'List available themes')
  .action(
    (options: {
      layout?: 'overview' | 'velocity' | 'personal';
      refresh?: string;
      theme?: string;
      autoRefresh?: boolean;
      listThemes?: boolean;
    }) => {
      try {
        // Handle list themes option
        if (options.listThemes) {
          console.log(chalk.cyan('🎨 Available Dashboard Themes:'));
          getThemeNames().forEach(theme => {
            console.log(`  ${chalk.yellow('•')} ${theme}`);
          });
          return;
        }

        // Validate theme
        const availableThemes = getThemeNames();
        if (!availableThemes.includes(options.theme ?? '')) {
          logger.warn('Invalid dashboard theme provided', {
            theme: options.theme,
            availableThemes,
          });
          console.error(chalk.red(`Invalid theme: ${options.theme}`));
          console.log(chalk.yellow('Available themes:'), availableThemes.join(', '));
          return;
        }

        console.log(chalk.cyan('🚀 Launching Kanban Dashboard...'));

        const config = {
          refreshInterval: parseInt(options.refresh ?? '30', 10) * 1000,
          theme: options.theme ?? 'dark',
          autoRefresh: options.autoRefresh !== false,
          showHelp: true,
        };

        // Get API client from global components if available
        const apiClient = global.cliComponents?.apiClient;
        const dashboard = new DashboardManager(
          config,
          apiClient ? apiClient.getApiClient() : undefined
        );

        // Set initial layout
        switch (options.layout) {
          case 'overview':
          case 'velocity':
          case 'personal':
            dashboard.switchLayout(options.layout);
            break;
          default:
            logger.warn('Unknown dashboard layout, using overview', { layout: options.layout });
            console.warn(chalk.yellow(`Unknown layout: ${options.layout}. Using overview.`));
            dashboard.switchLayout('overview');
        }

        // Start the dashboard
        dashboard.start();

        console.log(chalk.green('Dashboard started! Press "h" for help, "q" to quit.'));
      } catch (error) {
        logger.error('Failed to start dashboard', { error });
        console.error(
          chalk.red('Failed to start dashboard:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    }
  );

// Subcommands for specific dashboard types
dashboardCommand
  .command('overview')
  .description('Launch overview dashboard with task statistics')
  .action(() => {
    const apiClient = global.cliComponents?.apiClient;
    const dashboard = new DashboardManager({}, apiClient ? apiClient.getApiClient() : undefined);
    dashboard.switchLayout('overview');
    dashboard.start();
  });

dashboardCommand
  .command('velocity')
  .description('Launch velocity dashboard with team performance metrics')
  .action(() => {
    const apiClient = global.cliComponents?.apiClient;
    const dashboard = new DashboardManager({}, apiClient ? apiClient.getApiClient() : undefined);
    dashboard.switchLayout('velocity');
    dashboard.start();
  });

dashboardCommand
  .command('personal')
  .description('Launch personal productivity dashboard')
  .action(() => {
    const apiClient = global.cliComponents?.apiClient;
    const dashboard = new DashboardManager({}, apiClient ? apiClient.getApiClient() : undefined);
    dashboard.switchLayout('personal');
    dashboard.start();
  });
