/**
 * @fileoverview Cloud environment information and configuration management CLI command
 *
 * Note: This file uses dynamic imports and requires unsafe type assertions
 *
 * Key Dependencies:
 * - ../config/cloud-env: Cloud environment detection and configuration
 * - ../config/env-manager: Environment variable validation and management
 * - ../utils/logger: Structured logging for environment info
 *
 * Important Patterns:
 * - Displays cloud platform detection results
 * - Shows environment variable validation status
 * - Provides platform-specific optimization recommendations
 * - Generates environment documentation
 *
 * Critical Functions:
 * - showEnvironmentInfo(): Main command to display environment details
 * - validateEnvironment(): Validates all environment variables
 * - generateDocs(): Creates environment variable documentation
 *
 * Configuration:
 * - Automatically detects cloud platforms (Replit, Codespaces, GitPod, etc.)
 * - Shows platform-specific URLs and features
 * - Validates all required environment variables
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import type { Command } from 'commander';
import { cloudEnvironment } from '../../config';
import { envManager } from '../../config/env-manager';
import { generateEnvironmentDocs, validateCloudEnvironment } from '../../config/cloud-env';
import type { CliComponents } from '../types';
import type { OutputFormatter } from '../formatter';

interface EnvironmentOptions {
  format?: string;
  includeSecrets?: boolean;
  validate?: boolean;
  docs?: boolean;
}

/**
 * Gets CLI components for environment commands
 */
function getComponents(): CliComponents {
  // Import dynamically to avoid circular dependencies
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require, @typescript-eslint/no-unsafe-assignment
  const { ServiceContainer } = require('../services/ServiceContainer');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const serviceContainer = new ServiceContainer();

  return { // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, apiClient: serviceContainer.getApiClient(), // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, formatter: serviceContainer.getFormatter(), // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, config: serviceContainer.getConfig(), // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, services: serviceContainer.getServices() };
}

/**
 * Shows comprehensive environment information
 */
function showEnvironmentInfo(formatter: OutputFormatter, options: EnvironmentOptions): void {
  const { info, validation, urls, features, limits, isCloud, platform } = cloudEnvironment;

  formatter.info('🌐 Cloud Environment Information\n');

  // Basic environment info
  formatter.info(`**Platform**: ${platform}${isCloud ? ' (Cloud)' : ' (Local)'}`);
  formatter.info(`**Host**: ${info.defaultHost}:${info.defaultPort}`);

  if (urls.webapp) {
    formatter.info(`**Web App**: ${urls.webapp}`);
  }

  if (urls.websocket) {
    formatter.info(`**WebSocket**: ${urls.websocket}`);
  }

  formatter.info('');

  // Platform features
  formatter.info('🎯 **Platform Features**:');
  const featureTable = Object.entries(features).map(([feature, enabled]) => ({
    Feature: feature.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
    Status: enabled ? '✅ Enabled' : '❌ Disabled',
  }));

  if (options.format === 'json') {
    formatter.output(JSON.stringify({ platform, features, limits, urls }, null, 2));
  } else {
    formatter.output(featureTable, {
      fields: ['Feature', 'Status'],
      headers: ['Feature', 'Status'],
    });
  }

  formatter.info('');

  // Resource limits (for cloud environments)
  if (isCloud) {
    formatter.info('📊 **Resource Limits**:');
    const limitsTable = [
      { Resource: 'Memory', Limit: `${limits.memory}MB` },
      { Resource: 'CPU Cores', Limit: `${limits.cpu}` },
      { Resource: 'Storage', Limit: `${limits.storage}MB` },
      { Resource: 'Network', Limit: `${limits.networkBandwidth}Mbps` },
    ];

    formatter.output(limitsTable, {
      fields: ['Resource', 'Limit'],
      headers: ['Resource', 'Limit'],
    });
    formatter.info('');
  }

  // Environment validation
  if (options.validate) {
    formatter.info('🔍 **Environment Validation**:');
    const validationTable = [
      {
        Check: 'Environment Variables',
        Status: validation.valid ? '✅ Valid' : '❌ Invalid',
        Details: validation.valid
          ? 'All required variables present'
          : `Missing: ${validation.missing.join(', ')}`,
      },
      {
        Check: 'Cloud Configuration',
        Status: isCloud ? '✅ Valid' : '❌ Not Cloud',
        Details: isCloud ? `Platform: ${platform}` : 'Running in local mode',
      },
    ];

    formatter.output(validationTable, {
      fields: ['Check', 'Status', 'Details'],
      headers: ['Check', 'Status', 'Details'],
    });
  }

  // Show environment variable details if requested
  if (options.includeSecrets) {
    formatter.info('\n⚠️  **Environment Variables** (including sensitive):');
    const envData = envManager.getAll(true); // true = include secrets
    const envTable = Object.entries(envData).map(([key, value]) => ({
      Variable: key,
      Value: String(value),
    }));

    formatter.output(envTable, {
      fields: ['Variable', 'Value'],
      headers: ['Variable', 'Value'],
    });
  }
}

/**
 * Validates environment configuration
 */
function validateEnvironment(
  formatter: OutputFormatter,
  _options: Pick<EnvironmentOptions, 'format'>
): void {
  formatter.info('🔍 **Running Environment Validation**...\n');

  // Re-run validation
  const validation = envManager.validate();
  const cloudValidation = validateCloudEnvironment(cloudEnvironment.info);

  // Overall status
  const overallValid = validation.valid && cloudValidation.valid;
  formatter.info(`**Overall Status**: ${overallValid ? '✅ Valid' : '❌ Invalid'}`);

  // Environment variable validation
  formatter.info('\n**Environment Variables**:');
  const envResults = [
    {
      Check: 'Required Variables',
      Status:
        validation.missing.length === 0
          ? '✅ All Present'
          : `❌ Missing: ${validation.missing.join(', ')}`,
    },
    {
      Check: 'Type Validation',
      Status:
        validation.invalid.length === 0
          ? '✅ All Valid'
          : `❌ Invalid: ${validation.invalid.join(', ')}`,
    },
  ];

  formatter.output(envResults, {
    fields: ['Check', 'Status'],
    headers: ['Check', 'Status'],
  });

  // Cloud environment validation
  formatter.info('\n**Cloud Configuration**:');
  const cloudResults = [
    { Check: 'Platform Detection', Status: cloudValidation.valid ? '✅ Valid' : '❌ Invalid' },
    { Check: 'Service URLs', Status: cloudValidation.valid ? '✅ Valid' : '❌ Invalid' },
    { Check: 'Resource Limits', Status: cloudValidation.valid ? '✅ Valid' : '❌ Invalid' },
  ];

  formatter.output(cloudResults, {
    fields: ['Check', 'Status'],
    headers: ['Check', 'Status'],
  });

  if (!overallValid) {
    formatter.error('\n❌ Environment validation failed. Please check configuration.');
    process.exit(1);
  } else {
    formatter.success('\n✅ Environment validation passed.');
  }
}

/**
 * Shows detailed platform-specific information
 */
function showPlatformInfo(formatter: OutputFormatter): void {
  const { info, platform, isCloud } = cloudEnvironment;

  formatter.info(`🚀 **${platform} Platform Information**\n`);

  if (isCloud) {
    formatter.info('**Cloud Features**:');
    formatter.info(`- File Watching: ${info.features.fileWatching ? '✅ Enabled' : '❌ Disabled'}`);
    formatter.info(
      `- Process Restart: ${info.features.processRestart ? '✅ Enabled' : '❌ Disabled'}`
    );
    formatter.info(
      `- Port Forwarding: ${info.features.portForwarding ? '✅ Enabled' : '❌ Disabled'}`
    );
    formatter.info(
      `- Terminal Access: ${info.features.terminalAccess ? '✅ Enabled' : '❌ Disabled'}`
    );
    formatter.info(
      `- Git Integration: ${info.features.gitIntegration ? '✅ Enabled' : '❌ Disabled'}`
    );
    formatter.info(
      `- Environment Secrets: ${info.features.environmentSecrets ? '✅ Enabled' : '❌ Disabled'}`
    );
  } else {
    formatter.info('**Local Development Features**:');
    formatter.info('- File watching: ✅ Enabled');
    formatter.info('- Hot reload: ✅ Enabled');
    formatter.info('- Debug mode: ✅ Enabled');
  }

  formatter.info('\n**Configuration Recommendations**:');

  if (platform === 'replit') {
    formatter.info('- Use environment variables for configuration');
    formatter.info('- Enable always-on for production deployments');
    formatter.info('- Configure custom domains for production');
  } else if (platform === 'codespaces') {
    formatter.info('- Configure devcontainer.json for consistent setup');
    formatter.info('- Use GitHub Secrets for environment variables');
    formatter.info('- Enable port forwarding for external access');
  } else if (platform === 'gitpod') {
    formatter.info('- Use .gitpod.yml for workspace configuration');
    formatter.info('- Configure environment variables in settings');
    formatter.info('- Enable Heroku Postgres for database');
  } else {
    formatter.info('- Ensure proper environment variable configuration');
    formatter.info('- Configure reverse proxy if needed');
    formatter.info('- Set up monitoring and logging');
  }
}

/**
 * Generates comprehensive environment documentation
 */
async function generateEnvironmentDocumentation(
  formatter: OutputFormatter,
  options: { output?: string }
): Promise<void> {
  const docs = generateEnvironmentDocs(cloudEnvironment.info);
  const envDocs = envManager.generateDocs();

  const fullDocs = `${docs}\n\n${envDocs}`;

  if (options.output) {
    const fs = await import('fs/promises');
    await fs.writeFile(options.output, fullDocs, 'utf-8');
    formatter.success(`Documentation written to: ${options.output}`);
  } else {
    formatter.output(fullDocs);
  }
}

/**
 * Environment information command implementation
 */
export function addEnvironmentCommands(program: Command): void {
  const envCommand = program
    .command('environment')
    .alias('env')
    .description('Cloud environment detection and configuration management');

  // Main environment info command
  envCommand
    .command('info')
    .description('Show cloud environment information and configuration status')
    .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
    .option(
      '--include-secrets',
      'Include sensitive environment variables (use with caution)',
      false
    )
    .option('--validate', 'Run full environment validation', false)
    .action(async (options: EnvironmentOptions) => {
      const { formatter } = getComponents();

      try {
        showEnvironmentInfo(formatter, options);
      } catch (error) {
        formatter.error(
          `Failed to show environment info: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  // Environment validation command
  envCommand
    .command('validate')
    .description('Validate all environment variables and cloud configuration')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .action(async (options: Pick<EnvironmentOptions, 'format'>) => {
      const { formatter } = getComponents();

      try {
        validateEnvironment(formatter, options);
      } catch (error) {
        formatter.error(
          `Failed to validate environment: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  // Generate documentation command
  envCommand
    .command('docs')
    .description('Generate environment variable documentation')
    .option('-o, --output <file>', 'Output file (defaults to stdout)')
    .action(async (options: { output?: string }) => {
      const { formatter } = getComponents();

      try {
        await generateEnvironmentDocumentation(formatter, options);
      } catch (error) {
        formatter.error(
          `Failed to generate docs: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  // Cloud platform specific commands
  envCommand
    .command('platform')
    .description('Show detailed platform-specific information')
    .action(async () => {
      const { formatter } = getComponents();

      try {
        showPlatformInfo(formatter);
      } catch (error) {
        formatter.error(
          `Failed to show platform info: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}
