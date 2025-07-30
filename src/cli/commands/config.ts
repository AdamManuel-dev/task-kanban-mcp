import type { Command } from 'commander';
import inquirer from 'inquirer';
import { logger } from '@/utils/logger';
import { BoardMappingService } from '@/services/BoardMappingService';
import { GitService } from '@/services/GitService';
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
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

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

  // Repository mapping commands
  const mapCmd = configCmd.command('map').description('Manage repository-to-board mappings');

  mapCmd
    .command('show')
    .alias('ls')
    .description('Show current repository mapping configuration')
    .action(async () => {
      const { formatter } = getComponents();

      try {
        const config = await BoardMappingService.loadConfig();

        if (!config) {
          formatter.warn('No .kanban-config.json found');
          formatter.info('Run "kanban config map init" to create configuration');
          return;
        }

        formatter.info('📋 Repository Mapping Configuration\n');

        if (config.defaultBoard) {
          formatter.output(`Default Board: ${config.defaultBoard}`);
        }

        if (config.git?.enabled) {
          formatter.output('\n🔧 Git Integration: Enabled');
          formatter.output(`Auto-detect: ${config.git.autoDetect ? 'Yes' : 'No'}`);

          if (config.git.branchPatterns) {
            formatter.output('\n🌿 Branch Patterns:');
            Object.entries(config.git.branchPatterns).forEach(([pattern, boardId]) => {
              formatter.output(`  ${pattern} → ${boardId}`);
            });
          }
        } else {
          formatter.output('\n🔧 Git Integration: Disabled');
        }

        if (config.mappings && config.mappings.length > 0) {
          formatter.output('\n🗺️ Mapping Rules:');
          config.mappings
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            .forEach((mapping, index) => {
              formatter.output(
                `  ${index + 1}. ${mapping.type}:${mapping.pattern} → ${mapping.boardId} (priority: ${mapping.priority ?? 0})`
              );
            });
        }

        if (config.boards) {
          formatter.output('\n📁 Repository Boards:');
          Object.entries(config.boards).forEach(([repo, boardId]) => {
            formatter.output(`  ${repo} → ${boardId}`);
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to show mapping config: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  mapCmd
    .command('init')
    .description('Initialize repository mapping configuration')
    .option('--force', 'overwrite existing configuration')
    .action(async (options: { force?: boolean }) => {
      const { formatter } = getComponents();

      try {
        const configPath = process.cwd();
        const existingConfig = await BoardMappingService.loadConfig(configPath);

        if (existingConfig && !options.force) {
          const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
            {
              type: 'confirm',
              name: 'overwrite',
              message: '.kanban-config.json already exists. Overwrite?',
              default: false,
            },
          ]);

          if (!overwrite) {
            formatter.info('Configuration initialization cancelled');
            return;
          }
        }

        await BoardMappingService.createDefaultConfig(configPath);
        formatter.success('.kanban-config.json created successfully');
        formatter.info('Edit the file to customize your repository mappings');
      } catch (error) {
        formatter.error(
          `Failed to initialize mapping config: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  mapCmd
    .command('current')
    .description('Show the current repository and its mapped board')
    .action(async () => {
      const { formatter } = getComponents();

      try {
        const repo = await GitService.detectRepository();

        if (!repo) {
          formatter.warn('Not in a git repository');
          formatter.info('Navigate to a git repository to see board mapping');
          return;
        }

        formatter.info('📍 Current Repository Info\n');
        formatter.output(`Repository: ${repo.name}`);
        formatter.output(`Path: ${repo.path}`);
        formatter.output(`Branch: ${repo.currentBranch ?? 'unknown'}`);
        if (repo.remoteUrl) {
          formatter.output(`Remote: ${repo.remoteUrl}`);
        }

        const boardId = await BoardMappingService.determineBoardForRepository(repo);

        if (boardId) {
          formatter.success(`\n🎯 Mapped Board: ${boardId}`);
        } else {
          formatter.warn('\n⚠️ No board mapping found');
          formatter.info('Run "kanban config map init" to set up repository mappings');
        }
      } catch (error) {
        formatter.error(
          `Failed to get current mapping: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  mapCmd
    .command('test [repository-path]')
    .description('Test board mapping for a repository path')
    .action(async (repositoryPath?: string) => {
      const { formatter } = getComponents();

      try {
        const repoPath = repositoryPath ?? process.cwd();
        const repo = await GitService.detectRepository(repoPath);

        if (!repo) {
          formatter.error(`No git repository found at: ${repoPath}`);
          process.exit(1);
        }

        formatter.info('🧪 Testing Board Mapping\n');
        formatter.output(`Repository: ${repo.name}`);
        formatter.output(`Path: ${repo.path}`);
        formatter.output(`Branch: ${repo.currentBranch ?? 'unknown'}`);
        if (repo.remoteUrl) {
          formatter.output(`Remote: ${repo.remoteUrl}`);
        }

        const boardId = await BoardMappingService.determineBoardForRepository(repo);

        if (boardId) {
          formatter.success(`\n✅ Would map to board: ${boardId}`);
        } else {
          formatter.warn('\n⚠️ No board mapping would apply');
          formatter.info('Consider adding a mapping rule in .kanban-config.json');
        }

        // Show the config that was used
        const config = await BoardMappingService.loadConfig(repo.path);
        if (config) {
          formatter.info('\n📋 Configuration used:');
          if (config.git?.enabled) {
            formatter.output('  Git integration: Enabled');
          }
          if (config.defaultBoard) {
            formatter.output(`  Default board: ${config.defaultBoard}`);
          }
        } else {
          formatter.warn('\n⚠️ No .kanban-config.json found');
        }
      } catch (error) {
        formatter.error(
          `Failed to test mapping: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  mapCmd
    .command('add <pattern> <board-id>')
    .description('Add a new repository mapping rule')
    .option('-t, --type <type>', 'Mapping type: repo, branch, or path', 'repo')
    .option('-p, --priority <number>', 'Rule priority (higher = more important)', '10')
    .action(
      async (pattern: string, boardId: string, options: { type?: string; priority?: string }) => {
        const { formatter } = getComponents();

        try {
          const configPath = process.cwd();
          const config = await BoardMappingService.loadConfig(configPath);

          if (!config) {
            formatter.error('No .kanban-config.json found');
            formatter.info('Run "kanban config map init" first');
            process.exit(1);
          }

          const mappingType = options.type ?? 'repo';
          const priority = parseInt(options.priority ?? '10', 10);

          if (!['repo', 'branch', 'path'].includes(mappingType)) {
            formatter.error('Invalid mapping type. Use: repo, branch, or path');
            process.exit(1);
          }

          // Initialize mappings array if it doesn't exist
          if (!config.mappings) {
            config.mappings = [];
          }

          // Add the new mapping
          config.mappings.push({
            pattern,
            boardId,
            type: mappingType as 'repo' | 'branch' | 'path',
            priority,
          });

          // Save the updated configuration
          const fs = await import('fs').then(m => m.promises);
          const path = await import('path');
          const configFilePath = path.join(configPath, '.kanban-config.json');
          await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));

          formatter.success(
            `Added mapping rule: ${mappingType}:${pattern} → ${boardId} (priority: ${priority})`
          );
        } catch (error) {
          formatter.error(
            `Failed to add mapping: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          process.exit(1);
        }
      }
    );
}
