/**
 * Configuration management module
 * Loads and validates environment variables and application settings
 *
 * @module config
 * @description This module provides centralized configuration management for the MCP Kanban server.
 * It loads environment variables using dotenv, validates them using Zod schemas, and provides
 * type-safe access to all configuration values throughout the application.
 *
 * @example
 * ```typescript
 * import { config } from '@/config';
 *
 * // Access configuration values
 * const port = config.server.port;
 * const dbPath = config.database.path;
 * ```
 */

import * as dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Configuration schema validation
const configSchema = z.object({
  // Server configuration
  server: z.object({
    port: z.number().int().min(1).max(65535).default(3000),
    host: z.string().default('localhost'),
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  }),

  // Database configuration
  database: z.object({
    path: z.string().default('./data/kanban.db'),
    backupPath: z.string().default('./data/backups'),
    walMode: z.boolean().default(true),
    memoryLimit: z.number().int().positive().default(268435456), // 256MB
    timeout: z.number().int().positive().default(30000), // 30 seconds
    verbose: z.boolean().default(false),
  }),

  // API Security
  api: z.object({
    keySecret: z.string().min(16).default('dev-secret-key-change-in-production'),
    keys: z.array(z.string()).default(['dev-key-1']),
    corsOrigin: z.union([z.string(), z.array(z.string())]).default('*'),
    corsCredentials: z.boolean().default(true),
  }),

  // Rate limiting
  rateLimit: z.object({
    windowMs: z.number().int().positive().default(60000), // 1 minute
    maxRequests: z.number().int().positive().default(1000),
    skipSuccessfulRequests: z.boolean().default(false),
  }),

  // WebSocket configuration
  websocket: z.object({
    port: z.number().int().min(1).max(65535).default(3001),
    host: z.string().default('localhost'),
    path: z.string().default('/socket.io'),
    corsOrigin: z.string().default('*'),
    heartbeatInterval: z.number().int().positive().default(25000),
    heartbeatTimeout: z.number().int().positive().default(60000),
    authRequired: z.boolean().default(false),
    authTimeout: z.number().int().positive().default(30000),
    maxConnections: z.number().int().positive().default(1000),
    maxMessagesPerMinute: z.number().int().positive().default(100),
    maxSubscriptionsPerClient: z.number().int().positive().default(50),
    compression: z.boolean().default(true),
    maxPayload: z.number().int().positive().default(1048576), // 1MB
  }),

  // Git integration
  git: z.object({
    autoDetect: z.boolean().default(true),
    branchPatterns: z.array(z.string()).default(['feature/{taskId}-*', '{taskId}-*']),
    commitKeywords: z.array(z.string()).default(['fixes', 'closes', 'implements']),
    defaultBoard: z.string().default('personal-tasks'),
  }),

  // Backup configuration
  backup: z.object({
    enabled: z.boolean().default(true),
    schedule: z.string().default('0 2 * * *'), // 2 AM daily
    retentionDays: z.number().int().positive().default(30),
    compress: z.boolean().default(true),
    encrypt: z.boolean().default(false),
    encryptionKey: z.string().optional(),
    incremental: z.boolean().default(true),
    verifyIntegrity: z.boolean().default(true),
  }),

  // Logging configuration
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    file: z.string().default('./logs/kanban.log'),
    maxSize: z.number().int().positive().default(10485760), // 10MB
    maxFiles: z.number().int().positive().default(5),
    console: z.boolean().default(true),
    consoleLevel: z.enum(['error', 'warn', 'info', 'debug']).default('debug'),
  }),

  // Performance settings
  performance: z.object({
    maxRequestSize: z.string().default('10mb'),
    requestTimeout: z.number().int().positive().default(30000),
    keepAliveTimeout: z.number().int().positive().default(5000),
    maxMemoryUsage: z.number().int().positive().default(512), // MB
    memoryCheckInterval: z.number().int().positive().default(60000),
  }),

  // MCP configuration
  mcp: z.object({
    serverName: z.string().default('mcp-kanban'),
    serverVersion: z.string().default('0.1.0'),
    toolsEnabled: z.boolean().default(true),
    maxContextItems: z.number().int().positive().default(50),
    contextLookbackDays: z.number().int().positive().default(14),
    contextCacheTtl: z.number().int().positive().default(300), // 5 minutes
    maxRelatedTasks: z.number().int().positive().default(10),
  }),

  // Priority calculation
  priority: z.object({
    recalcInterval: z.number().int().positive().default(3600), // 1 hour
    staleThresholdDays: z.number().int().positive().default(7),
    factors: z.object({
      age: z.number().min(0).max(1).default(0.15),
      dependency: z.number().min(0).max(1).default(0.3),
      deadline: z.number().min(0).max(1).default(0.25),
      priority: z.number().min(0).max(1).default(0.2),
      context: z.number().min(0).max(1).default(0.1),
    }),
  }),

  // Development settings
  development: z.object({
    seedDatabase: z.boolean().default(false),
    resetOnStart: z.boolean().default(false),
    mockGitIntegration: z.boolean().default(false),
    enableDebugRoutes: z.boolean().default(false),
    watchFiles: z.boolean().default(true),
  }),
});

/**
 * Parses environment variable values to their appropriate types
 *
 * @param {string | undefined} value - The raw environment variable value
 * @param {any} defaultValue - The default value which determines the expected type
 * @returns {any} The parsed value in the appropriate type
 *
 * @example
 * ```typescript
 * parseEnvVar('true', false); // returns boolean true
 * parseEnvVar('3000', 8080); // returns number 3000
 * parseEnvVar('a,b,c', []); // returns ['a', 'b', 'c']
 * parseEnvVar('{"key":"value"}', {}); // returns {key: 'value'}
 * ```
 *
 * @private
 */
function parseEnvVar(value: string | undefined, defaultValue: any): any {
  if (value === undefined) return defaultValue;

  // Handle boolean values
  if (typeof defaultValue === 'boolean') {
    return value.toLowerCase() === 'true';
  }

  // Handle number values
  if (typeof defaultValue === 'number') {
    const parsed = Number(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  // Handle array values (comma-separated)
  if (Array.isArray(defaultValue)) {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  // Handle object values (JSON)
  if (typeof defaultValue === 'object' && defaultValue !== null) {
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }

  return value;
}

// Helper function to access environment variables with bracket notation
const getEnv = (key: string): string | undefined => {
  return process.env[key];
};

// Build configuration from environment variables
const rawConfig = {
  server: {
    port: parseEnvVar(getEnv('PORT'), 3000),
    host: parseEnvVar(getEnv('HOST'), 'localhost'),
    nodeEnv: parseEnvVar(getEnv('NODE_ENV'), 'development'),
  },
  database: {
    path: parseEnvVar(getEnv('DATABASE_PATH'), './data/kanban.db'),
    backupPath: parseEnvVar(getEnv('DATABASE_BACKUP_PATH'), './data/backups'),
    walMode: parseEnvVar(getEnv('DATABASE_WAL_MODE'), true),
    memoryLimit: parseEnvVar(getEnv('DATABASE_MEMORY_LIMIT'), 268435456),
    timeout: parseEnvVar(getEnv('DATABASE_TIMEOUT'), 30000),
    verbose: parseEnvVar(getEnv('DATABASE_VERBOSE'), false),
  },
  api: {
    keySecret: parseEnvVar(getEnv('API_KEY_SECRET'), 'dev-secret-key-change-in-production'),
    keys: parseEnvVar(getEnv('API_KEYS'), ['dev-key-1']),
    corsOrigin: parseEnvVar(getEnv('CORS_ORIGIN'), '*'),
    corsCredentials: parseEnvVar(getEnv('CORS_CREDENTIALS'), true),
  },
  rateLimit: {
    windowMs: parseEnvVar(getEnv('RATE_LIMIT_WINDOW_MS'), 60000),
    maxRequests: parseEnvVar(getEnv('RATE_LIMIT_MAX_REQUESTS'), 1000),
    skipSuccessfulRequests: parseEnvVar(getEnv('RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS'), false),
  },
  websocket: {
    port: parseEnvVar(getEnv('WEBSOCKET_PORT'), 3001),
    host: parseEnvVar(getEnv('WEBSOCKET_HOST'), 'localhost'),
    path: parseEnvVar(getEnv('WEBSOCKET_PATH'), '/socket.io'),
    corsOrigin: parseEnvVar(getEnv('WEBSOCKET_CORS_ORIGIN'), '*'),
    heartbeatInterval: parseEnvVar(getEnv('WEBSOCKET_HEARTBEAT_INTERVAL'), 25000),
    heartbeatTimeout: parseEnvVar(getEnv('WEBSOCKET_HEARTBEAT_TIMEOUT'), 60000),
    authRequired: parseEnvVar(getEnv('WEBSOCKET_AUTH_REQUIRED'), false),
    authTimeout: parseEnvVar(getEnv('WEBSOCKET_AUTH_TIMEOUT'), 30000),
    maxConnections: parseEnvVar(getEnv('WEBSOCKET_MAX_CONNECTIONS'), 1000),
    maxMessagesPerMinute: parseEnvVar(getEnv('WEBSOCKET_MAX_MESSAGES_PER_MINUTE'), 100),
    maxSubscriptionsPerClient: parseEnvVar(getEnv('WEBSOCKET_MAX_SUBSCRIPTIONS_PER_CLIENT'), 50),
    compression: parseEnvVar(getEnv('WEBSOCKET_COMPRESSION'), true),
    maxPayload: parseEnvVar(getEnv('WEBSOCKET_MAX_PAYLOAD'), 1048576),
  },
  git: {
    autoDetect: parseEnvVar(getEnv('GIT_AUTO_DETECT'), true),
    branchPatterns: parseEnvVar(getEnv('GIT_BRANCH_PATTERNS'), [
      'feature/{taskId}-*',
      '{taskId}-*',
    ]),
    commitKeywords: parseEnvVar(getEnv('GIT_COMMIT_KEYWORDS'), ['fixes', 'closes', 'implements']),
    defaultBoard: parseEnvVar(getEnv('GIT_DEFAULT_BOARD'), 'personal-tasks'),
  },
  backup: {
    enabled: parseEnvVar(getEnv('BACKUP_ENABLED'), true),
    schedule: parseEnvVar(getEnv('BACKUP_SCHEDULE'), '0 2 * * *'),
    retentionDays: parseEnvVar(getEnv('BACKUP_RETENTION_DAYS'), 30),
    compress: parseEnvVar(getEnv('BACKUP_COMPRESS'), true),
    encrypt: parseEnvVar(getEnv('BACKUP_ENCRYPT'), false),
    encryptionKey: parseEnvVar(getEnv('BACKUP_ENCRYPTION_KEY'), undefined),
    incremental: parseEnvVar(getEnv('BACKUP_INCREMENTAL'), true),
    verifyIntegrity: parseEnvVar(getEnv('BACKUP_VERIFY_INTEGRITY'), true),
  },
  logging: {
    level: parseEnvVar(getEnv('LOG_LEVEL'), 'info'),
    file: parseEnvVar(getEnv('LOG_FILE'), './logs/kanban.log'),
    maxSize: parseEnvVar(getEnv('LOG_MAX_SIZE'), 10485760),
    maxFiles: parseEnvVar(getEnv('LOG_MAX_FILES'), 5),
    console: parseEnvVar(getEnv('LOG_CONSOLE'), true),
    consoleLevel: parseEnvVar(getEnv('LOG_CONSOLE_LEVEL'), 'debug'),
  },
  performance: {
    maxRequestSize: parseEnvVar(getEnv('MAX_REQUEST_SIZE'), '10mb'),
    requestTimeout: parseEnvVar(getEnv('REQUEST_TIMEOUT'), 30000),
    keepAliveTimeout: parseEnvVar(getEnv('KEEP_ALIVE_TIMEOUT'), 5000),
    maxMemoryUsage: parseEnvVar(getEnv('MAX_MEMORY_USAGE'), 512),
    memoryCheckInterval: parseEnvVar(getEnv('MEMORY_CHECK_INTERVAL'), 60000),
  },
  mcp: {
    serverName: parseEnvVar(getEnv('MCP_SERVER_NAME'), 'mcp-kanban'),
    serverVersion: parseEnvVar(getEnv('MCP_SERVER_VERSION'), '0.1.0'),
    toolsEnabled: parseEnvVar(getEnv('MCP_TOOLS_ENABLED'), true),
    maxContextItems: parseEnvVar(getEnv('MCP_MAX_CONTEXT_ITEMS'), 50),
    contextLookbackDays: parseEnvVar(getEnv('MCP_CONTEXT_LOOKBACK_DAYS'), 14),
    contextCacheTtl: parseEnvVar(getEnv('CONTEXT_CACHE_TTL'), 300),
    maxRelatedTasks: parseEnvVar(getEnv('CONTEXT_MAX_RELATED_TASKS'), 10),
  },
  priority: {
    recalcInterval: parseEnvVar(getEnv('PRIORITY_RECALC_INTERVAL'), 3600),
    staleThresholdDays: parseEnvVar(getEnv('PRIORITY_STALE_THRESHOLD_DAYS'), 7),
    factors: parseEnvVar(getEnv('PRIORITY_FACTORS'), {
      age: 0.15,
      dependency: 0.3,
      deadline: 0.25,
      priority: 0.2,
      context: 0.1,
    }),
  },
  development: {
    seedDatabase: parseEnvVar(process.env.DEV_SEED_DATABASE, false),
    resetOnStart: parseEnvVar(process.env.DEV_RESET_ON_START, false),
    mockGitIntegration: parseEnvVar(process.env.DEV_MOCK_GIT_INTEGRATION, false),
    enableDebugRoutes: parseEnvVar(process.env.DEV_ENABLE_DEBUG_ROUTES, false),
    watchFiles: parseEnvVar(process.env.DEV_WATCH_FILES, true),
  },
};

/**
 * The validated configuration object for the MCP Kanban server
 *
 * @constant {Config}
 * @description This object contains all validated configuration values loaded from environment
 * variables and defaults. It is immutable and type-safe thanks to Zod validation.
 *
 * @throws {ZodError} If configuration validation fails
 *
 * @example
 * ```typescript
 * // Access server configuration
 * console.log(`Server running on ${config.server.host}:${config.server.port}`);
 *
 * // Access database configuration
 * const db = new Database(config.database.path);
 *
 * // Check environment
 * if (config.server.nodeEnv === 'production') {
 *   // Production-specific logic
 * }
 * ```
 */
export const config = configSchema.parse(rawConfig);

/**
 * Type definition for the complete configuration object
 *
 * @typedef {Object} Config
 * @property {Object} server - Server configuration
 * @property {number} server.port - Server port number (1-65535)
 * @property {string} server.host - Server host address
 * @property {'development'|'production'|'test'} server.nodeEnv - Environment mode
 * @property {Object} database - Database configuration
 * @property {string} database.path - SQLite database file path
 * @property {string} database.backupPath - Backup directory path
 * @property {boolean} database.walMode - Enable Write-Ahead Logging
 * @property {number} database.memoryLimit - Memory limit in bytes
 * @property {number} database.timeout - Connection timeout in milliseconds
 * @property {boolean} database.verbose - Enable verbose logging
 * @property {Object} api - API security configuration
 * @property {string} api.keySecret - Secret for API key generation (min 16 chars)
 * @property {string[]} api.keys - Array of valid API keys
 * @property {string|string[]} api.corsOrigin - CORS allowed origins
 * @property {boolean} api.corsCredentials - Allow CORS credentials
 * @property {Object} rateLimit - Rate limiting configuration
 * @property {Object} websocket - WebSocket server configuration
 * @property {Object} git - Git integration configuration
 * @property {Object} backup - Backup system configuration
 * @property {Object} logging - Logging configuration
 * @property {Object} performance - Performance settings
 * @property {Object} mcp - MCP protocol configuration
 * @property {Object} priority - Task priority calculation settings
 * @property {Object} development - Development-only settings
 */
export type Config = z.infer<typeof configSchema>;
