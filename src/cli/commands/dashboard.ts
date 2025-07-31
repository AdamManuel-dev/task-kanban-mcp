import { Command } from 'commander';
import { DashboardManager } from '../utils/dashboard-manager';
import { getThemeNames } from '../ui/themes/dashboard-themes';
import { logger } from '../../utils/logger';
import { TIMING, UI_DEFAULTS } from '../../constants';
import { handleCommandError } from '../../utils/error-handler';
import type { CliComponents } from '../types';

function getComponents(): CliComponents {
  if (!global.cliComponents) {
    throw new Error('CLI components not initialized. Please initialize the CLI first.');
  }
  return global.cliComponents;
}

/**
 * Dashboard command for launching terminal dashboards
 */
export const dashboardCommand = new Command('dashboard')
  .description('Launch interactive terminal dashboard')
  .option(
    '-l, --layout <layout>',
    'Initial layout: overview, velocity, or personal',
    UI_DEFAULTS.DEFAULT_LAYOUT
  )
  .option(
    '-r, --refresh <seconds>',
    'Auto-refresh interval in seconds',
    String(TIMING.DEFAULT_REFRESH_INTERVAL / 1000)
  )
  .option(
    '-t, --theme <theme>',
    `Dashboard theme: ${getThemeNames().join(', ')}`,
    UI_DEFAULTS.DEFAULT_THEME
  )
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
          logger.info('🎨 Available Dashboard Themes:');
          getThemeNames().forEach(theme => {
            logger.info(`  • ${theme}`);
          });
          return;
        }

        // Validate theme
        const availableThemes = getThemeNames();
        if (options.theme && !availableThemes.includes(options.theme)) {
          logger.warn('Invalid dashboard theme provided', {
            theme: options.theme,
            availableThemes,
          });
          // eslint-disable-next-line no-console
          console.error(`Invalid theme: ${options.theme}`);
          // eslint-disable-next-line no-console
          console.log('Available themes:', availableThemes.join(', '));
          return;
        }

        logger.info('🚀 Launching Kanban Dashboard...');

        const config = {
          refreshInterval:
            parseInt(options.refresh ?? String(TIMING.DEFAULT_REFRESH_INTERVAL / 1000), 10) * 1000,
          theme: options.theme ?? 'dark',
          autoRefresh: options.autoRefresh !== false,
          showHelp: true,
        };

        // Get API client from global components if available
        const components = getComponents();
        const { apiClient } = components;
        const dashboard = new DashboardManager(config, apiClient.getApiClient());

        // Set initial layout
        switch (options.layout) {
          case 'overview':
          case 'velocity':
          case 'personal':
            dashboard.switchLayout(options.layout);
            break;
          default:
            logger.warn('Unknown dashboard layout, using overview', { layout: options.layout });
            // Warning already logged above
            dashboard.switchLayout('overview');
        }

        // Start the dashboard
        dashboard.start();

        logger.info('Dashboard started! Press "h" for help, "q" to quit.');
      } catch (error) {
        const { formatter } = getComponents();
        handleCommandError(
          formatter,
          {
            operation: 'start dashboard',
            details: { layout: options.layout, theme: options.theme },
          },
          error
        );
      }
    }
  );

// Subcommands for specific dashboard types
dashboardCommand
  .command('overview')
  .description('Launch overview dashboard with task statistics')
  .action(() => {
    const { apiClient } = getComponents();
    const dashboard = new DashboardManager({}, apiClient.getApiClient());
    dashboard.switchLayout('overview');
    dashboard.start();
  });

dashboardCommand
  .command('velocity')
  .description('Launch velocity dashboard with team performance metrics')
  .action(() => {
    const { apiClient } = getComponents();
    const dashboard = new DashboardManager({}, apiClient.getApiClient());
    dashboard.switchLayout('velocity');
    dashboard.start();
  });

dashboardCommand
  .command('personal')
  .description('Launch personal productivity dashboard')
  .action(() => {
    const { apiClient } = getComponents();
    const dashboard = new DashboardManager({}, apiClient.getApiClient());
    dashboard.switchLayout('personal');
    dashboard.start();
  });
