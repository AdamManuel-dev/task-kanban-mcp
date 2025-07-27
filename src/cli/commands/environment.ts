/**
 * @fileoverview Cloud environment information and configuration management CLI command
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

import type { Command } from 'commander';
import { cloudEnvironment } from '../config';
import { envManager } from '../config/env-manager';
import { generateEnvironmentDocs, validateCloudEnvironment } from '../config/cloud-env';
import type { CliComponents } from '../types';

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
  const { ServiceContainer } = require('../services/ServiceContainer');
  const serviceContainer = new ServiceContainer();

  return {
    apiClient: serviceContainer.getApiClient(),
    formatter: serviceContainer.getFormatter(),
    config: serviceContainer.getConfig(),
  };
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
        await showEnvironmentInfo(formatter, options);
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
        await validateEnvironment(formatter, options);
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
        await showPlatformInfo(formatter);
      } catch (error) {
        formatter.error(
          `Failed to show platform info: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  // URL information command
  envCommand
    .command('urls')
    .description('Show application URLs for current environment')
    .action(async () => {
      const { formatter } = getComponents();

      try {
        await showEnvironmentUrls(formatter);
      } catch (error) {
        formatter.error(
          `Failed to show URLs: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}

/**
 * Shows comprehensive environment information
 */
async function showEnvironmentInfo(formatter: any, options: EnvironmentOptions): Promise<void> {
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

  // Environment validation status
  formatter.info('✅ **Environment Validation**:');
  const validationInfo = [
    { Check: 'Overall Status', Result: validation.valid ? '✅ Valid' : '❌ Invalid' },
    { Check: 'Variables Loaded', Result: `${Object.keys(validation.values).length}` },
    { Check: 'Errors', Result: validation.errors.length.toString() },
    { Check: 'Warnings', Result: validation.warnings.length.toString() },
    { Check: 'Missing', Result: validation.missing.length.toString() },
  ];

  formatter.output(validationInfo, {
    fields: ['Check', 'Result'],
    headers: ['Check', 'Result'],
  });

  // Show errors and warnings if any
  if (validation.errors.length > 0) {
    formatter.info('');
    formatter.error('**Validation Errors**:');
    validation.errors.forEach(error => formatter.error(`• ${error}`));
  }

  if (validation.warnings.length > 0) {
    formatter.info('');
    formatter.warn('**Validation Warnings**:');
    validation.warnings.forEach(warning => formatter.warn(`• ${warning}`));
  }

  // Environment variables (if requested)
  if (options.includeSecrets || options.format === 'json') {
    formatter.info('');
    formatter.info('🔧 **Environment Variables**:');

    const envVars = envManager.getAll(options.includeSecrets || false);

    if (options.format === 'json') {
      formatter.output(JSON.stringify(envVars, null, 2));
    } else {
      const envTable = Object.entries(envVars).map(([key, value]) => ({
        Variable: key,
        Value: typeof value === 'string' ? value : JSON.stringify(value),
      }));

      formatter.output(envTable, {
        fields: ['Variable', 'Value'],
        headers: ['Variable', 'Value'],
      });
    }
  }

  // Run additional validation if requested
  if (options.validate) {
    formatter.info('');
    await validateEnvironment(formatter, { format: options.format });
  }
}

/**
 * Validates environment configuration
 */
async function validateEnvironment(
  formatter: any,
  options: Pick<EnvironmentOptions, 'format'>
): Promise<void> {
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
          : `❌ ${validation.missing.length} Missing`,
    },
    {
      Check: 'Type Validation',
      Status:
        validation.invalid.length === 0
          ? '✅ All Valid'
          : `❌ ${validation.invalid.length} Invalid`,
    },
    {
      Check: 'Security Check',
      Status:
        validation.warnings.length === 0
          ? '✅ Secure'
          : `⚠️ ${validation.warnings.length} Warnings`,
    },
  ];

  formatter.output(envResults, {
    fields: ['Check', 'Status'],
    headers: ['Check', 'Status'],
  });

  // Cloud environment validation
  if (cloudEnvironment.isCloud) {
    formatter.info('\n**Cloud Environment**:');
    const cloudResults = [
      { Check: 'Platform Detection', Status: '✅ Detected' },
      {
        Check: 'Required Features',
        Status:
          cloudValidation.errors.length === 0
            ? '✅ Available'
            : `❌ ${cloudValidation.errors.length} Missing`,
      },
      {
        Check: 'Optimization',
        Status:
          cloudValidation.warnings.length === 0
            ? '✅ Optimized'
            : `⚠️ ${cloudValidation.warnings.length} Suggestions`,
      },
    ];

    formatter.output(cloudResults, {
      fields: ['Check', 'Status'],
      headers: ['Check', 'Status'],
    });

    // Show cloud-specific issues
    if (cloudValidation.errors.length > 0) {
      formatter.info('\n**Cloud Environment Errors**:');
      cloudValidation.errors.forEach(error => formatter.error(`• ${error}`));
    }

    if (cloudValidation.warnings.length > 0) {
      formatter.info('\n**Cloud Environment Suggestions**:');
      cloudValidation.warnings.forEach(warning => formatter.warn(`• ${warning}`));
    }
  }

  // Detailed error information
  if (!validation.valid) {
    formatter.info('\n**Detailed Issues**:');

    if (validation.missing.length > 0) {
      formatter.error('Missing Required Variables:');
      validation.missing.forEach(key => formatter.error(`• ${key}`));
    }

    if (validation.invalid.length > 0) {
      formatter.error('Invalid Values:');
      validation.invalid.forEach(key => formatter.error(`• ${key}`));
    }

    if (validation.errors.length > 0) {
      formatter.error('Validation Errors:');
      validation.errors.forEach(error => formatter.error(`• ${error}`));
    }
  }

  // Exit with error code if validation failed
  if (!overallValid) {
    process.exit(1);
  }
}

/**
 * Shows platform-specific information
 */
async function showPlatformInfo(formatter: any): Promise<void> {
  const { info, platform, isCloud } = cloudEnvironment;

  formatter.info(
    `🚀 **${platform.charAt(0).toUpperCase() + platform.slice(1)} Platform Information**\n`
  );

  if (!isCloud) {
    formatter.info('Running in **local development environment**.');
    formatter.info('No cloud-specific optimizations applied.');
    return;
  }

  // Platform-specific information
  switch (platform) {
    case 'replit':
      formatter.info('**Replit Cloud Development Environment**');
      formatter.info('• Optimized for collaborative development');
      formatter.info('• Automatic port forwarding enabled');
      formatter.info('• Git integration available');
      formatter.info('• Database stored in ./data/kanban.db');
      formatter.info('• Memory limit: 512MB');
      break;

    case 'codespaces':
      formatter.info('**GitHub Codespaces Environment**');
      formatter.info('• Full development environment with VS Code');
      formatter.info('• Excellent Git integration');
      formatter.info('• Generous resource limits (8GB RAM, 4 CPU cores)');
      formatter.info('• Port forwarding with authentication');
      break;

    case 'gitpod':
      formatter.info('**GitPod Cloud IDE Environment**');
      formatter.info('• Optimized for Git workflows');
      formatter.info('• Automatic workspace snapshots');
      formatter.info('• Resource limits: 3.5GB RAM, 4 CPU cores');
      formatter.info('• Prebuilt workspace support');
      break;

    case 'stackblitz':
      formatter.info('**StackBlitz Web IDE Environment**');
      formatter.info('• Browser-based development');
      formatter.info('• Limited WebSocket support');
      formatter.info('• Reduced memory limits (256MB)');
      formatter.info('• File system limitations');
      break;

    case 'codesandbox':
      formatter.info('**CodeSandbox Environment**');
      formatter.info('• Focused on web development');
      formatter.info('• Limited terminal access');
      formatter.info('• Resource limits: 1GB RAM');
      formatter.info('• Hot reloading enabled');
      break;
  }

  formatter.info('');

  // Show optimization recommendations
  formatter.info('💡 **Platform Optimizations Applied**:');

  const optimizations = [];

  if (info.defaultHost === '0.0.0.0') {
    optimizations.push('• Host binding configured for cloud access');
  }

  if (info.limits.memory < 1024) {
    optimizations.push('• Memory usage optimized for limited resources');
  }

  if (platform === 'replit') {
    optimizations.push('• JSON logging enabled for better cloud monitoring');
    optimizations.push('• CORS configured for Replit domain');
  }

  if (platform === 'stackblitz' && !info.features.websocket) {
    optimizations.push('• WebSockets disabled due to platform limitations');
  }

  optimizations.forEach(opt => formatter.info(opt));
}

/**
 * Shows environment URLs
 */
async function showEnvironmentUrls(formatter: any): Promise<void> {
  const { urls, platform, isCloud } = cloudEnvironment;

  formatter.info('🔗 **Application URLs**\n');

  if (!isCloud) {
    formatter.info('**Local Development**:');
    formatter.info(`• Web Application: http://localhost:3000`);
    formatter.info(`• WebSocket Server: ws://localhost:3001`);
    formatter.info(`• API Health Check: http://localhost:3000/api/health`);
    return;
  }

  formatter.info(`**${platform.charAt(0).toUpperCase() + platform.slice(1)} Cloud Environment**:`);

  if (urls.webapp) {
    formatter.info(`• **Web Application**: ${urls.webapp}`);
    formatter.info(`• **API Health Check**: ${urls.webapp}/api/health`);
    formatter.info(`• **API Documentation**: ${urls.webapp}/api/docs`);
  } else {
    formatter.warn('• Web application URL not available (check platform configuration)');
  }

  if (urls.websocket) {
    formatter.info(`• **WebSocket Server**: ${urls.websocket}`);
  } else if (cloudEnvironment.features.websocket) {
    formatter.warn('• WebSocket URL not available (check platform configuration)');
  } else {
    formatter.info('• WebSocket disabled for this platform');
  }

  if (urls.preview && urls.preview !== urls.webapp) {
    formatter.info(`• **Preview URL**: ${urls.preview}`);
  }

  formatter.info('');
  formatter.info('💡 **Usage Tips**:');
  formatter.info('• Use the web application URL to access the dashboard');
  formatter.info('• Test API connectivity with the health check endpoint');
  formatter.info('• WebSocket URL is needed for real-time features');

  if (platform === 'replit') {
    formatter.info('• Replit URLs are automatically generated and may change');
  }
}

/**
 * Generates environment documentation
 */
async function generateEnvironmentDocumentation(
  formatter: any,
  options: { output?: string }
): Promise<void> {
  const docs = generateEnvironmentDocs(cloudEnvironment.info);
  const envDocs = envManager.generateDocs();

  const fullDocs = docs + '\n\n' + envDocs;

  if (options.output) {
    // Write to file
    const fs = await import('fs/promises');
    await fs.writeFile(options.output, fullDocs, 'utf8');
    formatter.success(`Documentation written to ${options.output}`);
  } else {
    // Output to console
    formatter.info(fullDocs);
  }
}
