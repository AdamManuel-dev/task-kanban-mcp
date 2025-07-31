#!/usr/bin/env node

/**
 * MCP Kanban Configuration Manager
 * Handles environment variables, configuration files, and validation
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

// Configuration
const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONFIG_DIR = path.join(PROJECT_ROOT, '.mcp-kanban');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Default configuration
const DEFAULT_CONFIG = {
  version: '1.0.0',
  environment: 'development',
  database: {
    path: path.join(PROJECT_ROOT, 'data/db'),
    type: 'sqlite',
  },
  server: {
    port: 3000,
    host: 'localhost',
  },
  mcp: {
    serverPath: path.join(PROJECT_ROOT, 'dist/mcp/server.js'),
    databasePath: path.join(PROJECT_ROOT, 'data/db'),
  },
  logging: {
    level: 'info',
    path: path.join(PROJECT_ROOT, 'logs'),
  },
  backup: {
    enabled: true,
    path: path.join(PROJECT_ROOT, 'backups'),
    retention: 30,
  },
};

// Logging functions
function logInfo(message) {
  console.log(`${colors.blue}[INFO]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}[WARNING]${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

// Platform detection
function detectPlatform() {
  const { platform } = process;
  switch (platform) {
    case 'linux':
      return 'linux';
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return 'unknown';
  }
}

// Get safe default paths for current platform
function getSafePaths() {
  const platform = detectPlatform();
  const config = { ...DEFAULT_CONFIG };

  // Adjust paths for Windows
  if (platform === 'windows') {
    config.database.path = config.database.path.replace(/\//g, '\\');
    config.mcp.serverPath = config.mcp.serverPath.replace(/\//g, '\\');
    config.mcp.databasePath = config.mcp.databasePath.replace(/\//g, '\\');
    config.logging.path = config.logging.path.replace(/\//g, '\\');
    config.backup.path = config.backup.path.replace(/\//g, '\\');
  }

  return config;
}

// Validate configuration
function validateConfig(config) {
  const errors = [];

  // Check required fields
  if (!config.database?.path) {
    errors.push('Database path is required');
  }

  if (!config.mcp?.serverPath) {
    errors.push('MCP server path is required');
  }

  if (!config.mcp?.databasePath) {
    errors.push('MCP database path is required');
  }

  // Check port range
  if (config.server?.port && (config.server.port < 1 || config.server.port > 65535)) {
    errors.push('Server port must be between 1 and 65535');
  }

  // Check log level
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (config.logging?.level && !validLogLevels.includes(config.logging.level)) {
    errors.push(`Log level must be one of: ${validLogLevels.join(', ')}`);
  }

  return errors;
}

// Create configuration directory
async function createConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    logSuccess(`Configuration directory created: ${CONFIG_DIR}`);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

// Load configuration
async function loadConfig() {
  try {
    const configData = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(configData);

    // Validate configuration
    const errors = validateConfig(config);
    if (errors.length > 0) {
      logWarning('Configuration validation errors:');
      errors.forEach(error => logWarning(`  - ${error}`));
    }

    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logInfo('No configuration file found, using defaults');
      return getSafePaths();
    }
    throw error;
  }
}

// Save configuration
async function saveConfig(config) {
  try {
    await createConfigDir();

    // Validate before saving
    const errors = validateConfig(config);
    if (errors.length > 0) {
      logError('Configuration validation failed:');
      errors.forEach(error => logError(`  - ${error}`));
      return false;
    }

    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    logSuccess(`Configuration saved to: ${CONFIG_FILE}`);
    return true;
  } catch (error) {
    logError(`Failed to save configuration: ${error.message}`);
    return false;
  }
}

// Initialize configuration
async function initConfig() {
  logInfo('Initializing configuration...');

  const config = getSafePaths();
  const success = await saveConfig(config);

  if (success) {
    logSuccess('Configuration initialized successfully');
    return config;
  }
  logError('Failed to initialize configuration');
  return null;
}

// Update configuration
async function updateConfig(updates) {
  logInfo('Updating configuration...');

  const config = await loadConfig();
  const updatedConfig = { ...config, ...updates };

  const success = await saveConfig(updatedConfig);

  if (success) {
    logSuccess('Configuration updated successfully');
    return updatedConfig;
  }
  logError('Failed to update configuration');
  return null;
}

// Validate database path
async function validateDatabasePath(dbPath) {
  try {
    // Check if directory exists or can be created
    await fs.mkdir(dbPath, { recursive: true });

    // Check if directory is writable
    const testFile = path.join(dbPath, '.test-write');
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);

    logSuccess(`Database path validated: ${dbPath}`);
    return true;
  } catch (error) {
    logError(`Database path validation failed: ${error.message}`);
    return false;
  }
}

// Create environment file
async function createEnvFile(config) {
  const envPath = path.join(PROJECT_ROOT, '.env');
  const envContent = `# MCP Kanban Server Configuration
NODE_ENV=${config.environment}
PORT=${config.server.port}
MCP_KANBAN_DB_FOLDER_PATH=${config.database.path}
LOG_LEVEL=${config.logging.level}
`;

  try {
    await fs.writeFile(envPath, envContent, 'utf8');
    logSuccess(`Environment file created: ${envPath}`);
    return true;
  } catch (error) {
    logError(`Failed to create environment file: ${error.message}`);
    return false;
  }
}

// Backup configuration
async function backupConfig() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(CONFIG_DIR, `config.backup.${timestamp}.json`);

  try {
    const config = await loadConfig();
    await fs.writeFile(backupPath, JSON.stringify(config, null, 2), 'utf8');
    logSuccess(`Configuration backed up to: ${backupPath}`);
    return backupPath;
  } catch (error) {
    logError(`Failed to backup configuration: ${error.message}`);
    return null;
  }
}

// Restore configuration
async function restoreConfig(backupPath) {
  try {
    const backupData = await fs.readFile(backupPath, 'utf8');
    const config = JSON.parse(backupData);

    const success = await saveConfig(config);

    if (success) {
      logSuccess(`Configuration restored from: ${backupPath}`);
      return config;
    }
    logError('Failed to restore configuration');
    return null;
  } catch (error) {
    logError(`Failed to restore configuration: ${error.message}`);
    return null;
  }
}

// Show configuration
function showConfig(config) {
  console.log('\n📋 Current Configuration:');
  console.log('========================');
  console.log(`Environment: ${config.environment}`);
  console.log(`Database Path: ${config.database.path}`);
  console.log(`Server Port: ${config.server.port}`);
  console.log(`Log Level: ${config.logging.level}`);
  console.log(`MCP Server Path: ${config.mcp.serverPath}`);
  console.log(`Backup Enabled: ${config.backup.enabled}`);
  console.log('');
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'init':
      await initConfig();
      break;

    case 'show':
      const config = await loadConfig();
      showConfig(config);
      break;

    case 'update':
      if (args.length < 3) {
        logError('Usage: node config-manager.js update <key> <value>');
        process.exit(1);
      }
      const key = args[1];
      const value = args[2];
      await updateConfig({ [key]: value });
      break;

    case 'validate':
      const configToValidate = await loadConfig();
      const errors = validateConfig(configToValidate);
      if (errors.length === 0) {
        logSuccess('Configuration is valid');
      } else {
        logError('Configuration validation errors:');
        errors.forEach(error => logError(`  - ${error}`));
      }
      break;

    case 'backup':
      await backupConfig();
      break;

    case 'restore':
      if (args.length < 2) {
        logError('Usage: node config-manager.js restore <backup-file>');
        process.exit(1);
      }
      await restoreConfig(args[1]);
      break;

    case 'env':
      const configForEnv = await loadConfig();
      await createEnvFile(configForEnv);
      break;

    case 'validate-db':
      const configForDb = await loadConfig();
      await validateDatabasePath(configForDb.database.path);
      break;

    default:
      console.log('Usage: node config-manager.js <command>');
      console.log('');
      console.log('Commands:');
      console.log('  init              Initialize configuration with defaults');
      console.log('  show              Show current configuration');
      console.log('  update <key> <value>  Update configuration value');
      console.log('  validate          Validate current configuration');
      console.log('  backup            Create configuration backup');
      console.log('  restore <file>    Restore configuration from backup');
      console.log('  env               Create .env file from configuration');
      console.log('  validate-db       Validate database path');
      break;
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    logError(`Configuration manager failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  loadConfig,
  saveConfig,
  validateConfig,
  initConfig,
  updateConfig,
  backupConfig,
  restoreConfig,
  createEnvFile,
  validateDatabasePath,
  getSafePaths,
};
