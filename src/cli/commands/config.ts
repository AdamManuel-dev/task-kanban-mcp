import type { Command } from 'commander';
import inquirer from 'inquirer';
import { logger } from '@/utils/logger';
import type { CliComponents } from '../types';

interface InquirerAnswers {
  overwrite?: boolean;
  serverUrl?: string;
  apiKey?: string;
  defaultBoard?: string;
  autoRefresh?: boolean;
  confirm?: boolean;
}

export function registerConfigCommands(program: Command): void {
  const configCmd = program.command('config').alias('c').description('Manage configuration');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

  configCmd
    .command('show')
    .alias('ls')
    .description('Show current configuration')
    .option('--path', 'show config file path')
    .action((options: { path?: boolean }) => {
      const { config, formatter } = getComponents();

      if (options.path) {
        logger.info(config.getConfigPath());
        return;
      }

      if (!config.exists()) {
        formatter.warn('No configuration file found');
        logger.info('Run "kanban config init" to create initial configuration');
        return;
      }

      const configData = config.getAll();
      const validation = config.validate();

      if (!validation.valid) {
        formatter.warn('Configuration has issues:');
        validation.errors.forEach(error => formatter.error(error));
        logger.info('');
      }

      formatter.output(configData);
    });

  configCmd
    .command('set <key> <value>')
    .description('Set configuration value')
    .action((key: string, value: string) => {
      const { config, formatter, apiClient } = getComponents();

      try {
        // Parse value based on type
        let parsedValue: string | number | boolean = value;

        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (/^\d+$/.test(value)) parsedValue = parseInt(value, 10);
        else if (/^\d*\.\d+$/.test(value)) parsedValue = parseFloat(value);

        config.set(key, parsedValue);
        config.save();

        // Update API client if server config changed
        if (key.startsWith('server.') || key.startsWith('auth.')) {
          apiClient.updateConfig();
        }

        formatter.success(`Set ${String(key)} = ${String(parsedValue)}`);

        // Validate after setting
        const validation = config.validate();
        if (!validation.valid) {
          formatter.warn('Configuration validation failed:');
          validation.errors.forEach(error => formatter.error(error));
        }
      } catch (error) {
        formatter.error(
          `Failed to set configuration: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  configCmd
    .command('get <key>')
    .description('Get configuration value')
    .action((key: string) => {
      const { config, formatter } = getComponents();

      if (!config.exists()) {
        formatter.error('No configuration found');
        process.exit(1);
      }

      const value = config.get(key);
      if (value === undefined) {
        formatter.error(`Configuration key "${String(key)}" not found`);
        process.exit(1);
      }

      formatter.output({ [key]: value });
    });

  configCmd
    .command('init')
    .description('Initialize configuration interactively')
    .option('--force', 'overwrite existing configuration')
    .action(async (options: { force?: boolean }) => {
      const { config, formatter, apiClient } = getComponents();

      if (config.exists() && !options.force) {
        const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'Configuration already exists. Overwrite?',
            default: false,
          },
        ]);

        if (!overwrite) {
          formatter.info('Configuration initialization cancelled');
          return;
        }
      }

      try {
        formatter.info('Initializing configuration...');

        const answers = await inquirer.prompt<InquirerAnswers>([
          {
            type: 'input',
            name: 'serverUrl',
            message: 'Server URL:',
            default: 'http://localhost:3000',
            validate: (input: string) => input.length > 0 || 'Server URL is required',
          },
          {
            type: 'input',
            name: 'apiKey',
            message: 'API Key (optional):',
            default: '',
          },
          {
            type: 'input',
            name: 'defaultBoard',
            message: 'Default board ID (optional):',
            default: '',
          },
          {
            type: 'confirm',
            name: 'autoRefresh',
            message: 'Enable auto-refresh for real-time updates?',
            default: true,
          },
        ]);

        // Set configuration values
        if (answers.serverUrl) config.set('server.url', answers.serverUrl);
        if (answers.apiKey) config.set('auth.apiKey', answers.apiKey);
        if (answers.defaultBoard) config.set('defaultBoard', answers.defaultBoard);
        if (answers.autoRefresh !== undefined) config.set('ui.autoRefresh', answers.autoRefresh);

        config.save();

        // Update API client
        apiClient.updateConfig();

        formatter.success('Configuration initialized successfully');
        formatter.info(`Config file: ${String(config.getConfigPath())}`);

        // Validate configuration
        const validation = config.validate();
        if (!validation.valid) {
          formatter.warn('Configuration validation failed:');
          validation.errors.forEach(error => formatter.error(error));
        }
      } catch (error) {
        formatter.error(
          `Failed to initialize configuration: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });

  configCmd
    .command('validate')
    .description('Validate configuration')
    .action(() => {
      const { config, formatter } = getComponents();

      if (!config.exists()) {
        formatter.error('No configuration found');
        process.exit(1);
      }

      const validation = config.validate();

      if (validation.valid) {
        formatter.success('Configuration is valid');
      } else {
        formatter.error('Configuration validation failed:');
        validation.errors.forEach(error => formatter.error(`  ${String(error)}`));
        process.exit(1);
      }
    });

  configCmd
    .command('reset')
    .description('Reset configuration to defaults')
    .option('--force', 'skip confirmation')
    .action(async (options: { force?: boolean }) => {
      const { config, formatter } = getComponents();

      if (!options.force) {
        const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to reset configuration to defaults?',
            default: false,
          },
        ]);

        if (!confirm) {
          formatter.info('Reset cancelled');
          return;
        }
      }

      try {
        config.reset();
        config.save();
        formatter.success('Configuration reset to defaults');
      } catch (error) {
        formatter.error(
          `Failed to reset configuration: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  configCmd
    .command('test')
    .description('Test connection to server')
    .action(async () => {
      const { config, formatter, apiClient } = getComponents();

      if (!config.exists()) {
        formatter.error('No configuration found. Run "kanban config init" first');
        process.exit(1);
      }

      const validation = config.validate();
      if (!validation.valid) {
        formatter.error('Configuration is invalid:');
        validation.errors.forEach(error => formatter.error(`  ${String(error)}`));
        process.exit(1);
      }

      formatter.info(`Testing connection to ${String(String(config.getServerUrl()))}...`);

      try {
        const connected = await apiClient.testConnection();

        if (connected) {
          formatter.success('✓ Connection successful');

          // Get detailed health info
          try {
            const health = await apiClient.getHealth();
            formatter.info('Server information:');
            formatter.output(health);
          } catch (error) {
            formatter.warn('Could not get detailed server information');
          }
        } else {
          formatter.error('✗ Connection failed');
          process.exit(1);
        }
      } catch (error) {
        formatter.error(
          `✗ Connection failed: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });
}
