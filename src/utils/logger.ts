/**
 * Winston logger configuration for MCP Kanban Server
 * 
 * @module utils/logger
 * @description Centralized logging configuration using Winston. Provides structured
 * logging with multiple transports (file and console), log rotation, and environment-specific
 * formatting. All logs include timestamps and service metadata.
 * 
 * @example
 * ```typescript
 * import { logger } from '@/utils/logger';
 * 
 * // Basic logging
 * logger.info('Server started', { port: 3000 });
 * logger.error('Database connection failed', { error: err });
 * 
 * // Structured logging with metadata
 * logger.debug('Query executed', {
 *   sql: 'SELECT * FROM tasks',
 *   duration: 45,
 *   rowCount: 10
 * });
 * 
 * // Error logging with stack trace
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   logger.error('Operation failed', error);
 * }
 * ```
 */

import winston from 'winston';
import path from 'path';

/**
 * Log severity levels
 * @constant {Object}
 */
const logLevels = {
  error: 0,   // Critical errors requiring immediate attention
  warn: 1,    // Warning conditions that should be reviewed
  info: 2,    // Informational messages about normal operations
  debug: 3,   // Detailed debug information for troubleshooting
};

/**
 * Console color scheme for log levels
 * @constant {Object}
 */
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(logColors);

/**
 * Configured Winston logger instance
 * 
 * @constant {winston.Logger} logger
 * @description Pre-configured logger with file and console transports.
 * - Error logs: Saved to logs/error.log
 * - All logs: Saved to logs/combined.log
 * - Console: Enabled in development with colors
 * - Automatic log rotation at 10MB
 * - Includes timestamp and service metadata
 * 
 * @example
 * ```typescript
 * // Log levels
 * logger.error('Critical error', { code: 'DB_CONN_FAILED' });
 * logger.warn('Deprecation warning', { feature: 'oldAPI' });
 * logger.info('User logged in', { userId: 'user-123' });
 * logger.debug('Cache hit', { key: 'user:123', ttl: 300 });
 * 
 * // Child logger with additional context
 * const requestLogger = logger.child({ requestId: 'req-123' });
 * requestLogger.info('Processing request');
 * ```
 */
export const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'mcp-kanban',
    version: process.env.npm_package_version || '0.1.0',
  },
  transports: [
    // File transport for errors
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// Add console transport for non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
    })
  );
}

// Create logs directory if it doesn't exist
import fs from 'fs';
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}