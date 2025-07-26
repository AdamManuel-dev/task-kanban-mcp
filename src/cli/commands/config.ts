import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigManager } from '../config';
import { ApiClient } from '../client';
import { OutputFormatter } from '../formatter';

export function registerConfigCommands(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage CLI configuration');

  // Get global components
  const getComponents = () => (global as any).cliComponents as {
    config: ConfigManager;
    apiClient: ApiClient;
    formatter: OutputFormatter;
  };

  configCmd
    .command('show')
    .description('Show current configuration')
    .option('--path', 'show config file path')
    .action(async (options) => {
      const { config, formatter } = getComponents();

      if (options.path) {
        console.log(config.getConfigPath());
        return;
      }

      if (!config.exists()) {
        formatter.warn('No configuration file found');
        console.log('Run "kanban config init" to create initial configuration');
        return;
      }

      const configData = config.getAll();
      const validation = config.validate();

      if (!validation.valid) {
        formatter.warn('Configuration has issues:');
        validation.errors.forEach(error => formatter.error(error));
        console.log();
      }

      formatter.output(configData);
    });

  configCmd
    .command('set <key> <value>')
    .description('Set configuration value')
    .action(async (key: string, value: string) => {
      const { config, formatter, apiClient } = getComponents();

      try {
        // Parse value based on type
        let parsedValue: any = value;
        
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

        formatter.success(`Set ${key} = ${parsedValue}`);

        // Validate after setting
        const validation = config.validate();
        if (!validation.valid) {
          formatter.warn('Configuration validation failed:');
          validation.errors.forEach(error => formatter.error(error));
        }
      } catch (error) {
        formatter.error(`Failed to set configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  configCmd
    .command('get <key>')
    .description('Get configuration value')
    .action(async (key: string) => {
      const { config, formatter } = getComponents();

      if (!config.exists()) {
        formatter.error('No configuration found');
        process.exit(1);
      }

      const value = config.get(key);
      if (value === undefined) {
        formatter.error(`Configuration key "${key}" not found`);
        process.exit(1);
      }

      formatter.output({ [key]: value });
    });

  configCmd
    .command('init')
    .description('Initialize configuration interactively')
    .option('--force', 'overwrite existing configuration')
    .action(async (options) => {
      const { config, formatter, apiClient } = getComponents();

      if (config.exists() && !options.force) {
        const { overwrite } = await inquirer.prompt([
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

      formatter.info('Initializing MCP Kanban CLI configuration...');

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'serverUrl',
          message: 'Server URL:',
          default: 'http://localhost:3000',
          validate: (input: string) => {
            try {
              new URL(input);
              return true;
            } catch {
              return 'Please enter a valid URL';
            }
          },
        },
        {
          type: 'input',
          name: 'apiKey',
          message: 'API Key (optional):',
        },
        {
          type: 'list',
          name: 'format',
          message: 'Default output format:',
          choices: ['table', 'json', 'csv'],
          default: 'table',
        },
        {
          type: 'confirm',
          name: 'verbose',
          message: 'Enable verbose output by default?',
          default: false,
        },
        {
          type: 'confirm',
          name: 'gitEnabled',
          message: 'Enable Git integration?',
          default: true,
        },
      ]);

      // Update configuration
      config.set('server.url', answers.serverUrl);
      if (answers.apiKey) {
        config.set('auth.apiKey', answers.apiKey);
      }
      config.set('defaults.format', answers.format);
      config.set('defaults.verbose', answers.verbose);
      config.set('git.enabled', answers.gitEnabled);

      try {
        config.save();
        apiClient.updateConfig();
        formatter.success('Configuration saved successfully');

        // Test connection if API key provided
        if (answers.apiKey) {
          formatter.info('Testing connection...');
          try {
            const connected = await apiClient.testConnection();
            if (connected) {
              formatter.success('Successfully connected to server');
            } else {
              formatter.warn('Could not connect to server');
            }
          } catch (error) {
            formatter.warn(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      } catch (error) {
        formatter.error(`Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  configCmd
    .command('validate')
    .description('Validate configuration')
    .action(async () => {
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
        validation.errors.forEach(error => formatter.error(`  ${error}`));
        process.exit(1);
      }
    });

  configCmd
    .command('reset')
    .description('Reset configuration to defaults')
    .option('--force', 'skip confirmation')
    .action(async (options) => {
      const { config, formatter } = getComponents();

      if (!options.force) {
        const { confirm } = await inquirer.prompt([
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
        formatter.error(`Failed to reset configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        validation.errors.forEach(error => formatter.error(`  ${error}`));
        process.exit(1);
      }

      formatter.info(`Testing connection to ${config.getServerUrl()}...`);

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
        formatter.error(`✗ Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
}