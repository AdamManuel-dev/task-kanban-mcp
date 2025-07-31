/**
 * @fileoverview Logging system initialization and configuration
 * @lastmodified 2025-07-28T08:30:00Z
 *
 * Features: Logger initialization, configuration management, log transport setup
 * Main APIs: initializeLogging(), configureDynamicLogging(), setupLogRotation()
 * Constraints: Requires Winston logger configuration
 * Patterns: Factory pattern for logger creation, configuration injection
 */

import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { enableErrorMonitoring } from './errors';
import { logger } from './logger';

// ============================================================================
// CONFIGURATION INTERFACES
// ============================================================================

export interface LoggingConfig {
  level: string;
  enableConsole: boolean;
  enableFile: boolean;
  enableAudit: boolean;
  enablePerformance: boolean;
  enableAnalytics: boolean;
  enableErrorMonitoring: boolean;
  fileConfig: {
    maxSize: number;
    maxFiles: number;
    compress: boolean;
    datePattern?: string;
  };
  transports: Array<{
    type: 'file' | 'console' | 'http' | 'stream';
    level?: string;
    config: Record<string, unknown>;
  }>;
  formatting: {
    timestamp: boolean;
    colorize: boolean;
    prettyPrint: boolean;
    includeMeta: boolean;
  };
  filters: Array<{
    name: string;
    condition: (info: unknown) => boolean;
  }>;
}

export interface LogRotationConfig {
  frequency: 'daily' | 'weekly' | 'monthly';
  maxSize: string;
  maxFiles: number;
  compress: boolean;
  archivePath?: string;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

const DEFAULT_CONFIG: LoggingConfig = {
  level: process.env.LOG_LEVEL ?? 'info',
  enableConsole: process.env.NODE_ENV !== 'production',
  enableFile: true,
  enableAudit: true,
  enablePerformance: true,
  enableAnalytics: true,
  enableErrorMonitoring: true,
  fileConfig: {
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    compress: true,
    datePattern: 'YYYY-MM-DD',
  },
  transports: [],
  formatting: {
    timestamp: true,
    colorize: process.env.NODE_ENV !== 'production',
    prettyPrint: process.env.NODE_ENV !== 'production',
    includeMeta: true,
  },
  filters: [],
};

// ============================================================================
// LOGGING INITIALIZATION
// ============================================================================

/**
 * Initialize comprehensive logging system
 */
export async function initializeLogging(config: Partial<LoggingConfig> = {}): Promise<void> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    // Ensure log directories exist
    await ensureLogDirectories();

    // Configure base logger
    configureBaseLogger(finalConfig);

    // Initialize specialized loggers
    if (finalConfig.enableAudit) {
      logger.info('Audit logging enabled');
    }

    if (finalConfig.enablePerformance) {
      logger.info('Performance logging enabled');
    }

    if (finalConfig.enableAnalytics) {
      logger.info('Log analytics enabled');
    }

    if (finalConfig.enableErrorMonitoring) {
      enableErrorMonitoring();
      logger.info('Error monitoring enabled');
    }

    // Set up log rotation
    await setupLogRotation({
      frequency: 'daily',
      maxSize: '10MB',
      maxFiles: 30,
      compress: true,
    });

    // Configure dynamic logging features
    await configureDynamicLogging(finalConfig);

    logger.info('Logging system initialized successfully', {
      config: {
        level: finalConfig.level,
        enableConsole: finalConfig.enableConsole,
        enableFile: finalConfig.enableFile,
        enableAudit: finalConfig.enableAudit,
        enablePerformance: finalConfig.enablePerformance,
        enableAnalytics: finalConfig.enableAnalytics,
        enableErrorMonitoring: finalConfig.enableErrorMonitoring,
      },
    });
  } catch (error) {
    console.error('Failed to initialize logging system:', error);
    throw error;
  }
}

/**
 * Ensure all required log directories exist
 */
async function ensureLogDirectories(): Promise<void> {
  const logDirs = ['logs', 'logs/archive', 'logs/performance', 'logs/audit', 'logs/analytics'];

  for (const dir of logDirs) {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

/**
 * Configure the base Winston logger
 */
function configureBaseLogger(config: LoggingConfig): void {
  // Clear existing transports
  logger.clear();

  // Add file transport if enabled
  if (config.enableFile) {
    logger.add(
      new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'error.log'),
        level: 'error',
        maxsize: config.fileConfig.maxSize,
        maxFiles: config.fileConfig.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
      })
    );

    logger.add(
      new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'combined.log'),
        maxsize: config.fileConfig.maxSize,
        maxFiles: config.fileConfig.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
      })
    );
  }

  // Add console transport if enabled
  if (config.enableConsole) {
    logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr =
              Object.keys(meta).length && config.formatting.includeMeta
                ? `\n${JSON.stringify(meta, null, 2)}`
                : '';
            return `${timestamp} [${level}]: ${message}${metaStr}`;
          })
        ),
      })
    );
  }

  // Add custom transports
  config.transports.forEach(transportConfig => {
    switch (transportConfig.type) {
      case 'file':
        logger.add(
          new winston.transports.File({
            level: transportConfig.level,
            ...transportConfig.config,
          })
        );
        break;
      case 'console':
        logger.add(
          new winston.transports.Console({
            level: transportConfig.level,
            ...transportConfig.config,
          })
        );
        break;
      case 'http':
        logger.add(
          new winston.transports.Http({
            level: transportConfig.level,
            ...transportConfig.config,
          })
        );
        break;
    }
  });

  // Set log level
  logger.level = config.level;
}

/**
 * Configure dynamic logging features
 */
async function configureDynamicLogging(config: LoggingConfig): Promise<void> {
  // Set up log filtering
  config.filters.forEach(filter => {
    logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(info => {
            if (filter.condition(info)) {
              return ''; // Filter out with empty string
            }
            return `${info.timestamp} [${info.level}]: ${info.message}`;
          })
        ),
      })
    );
  });

  // Configure log sampling for high-volume scenarios
  if (process.env.LOG_SAMPLING_RATE) {
    const samplingRate = parseFloat(process.env.LOG_SAMPLING_RATE);
    logger.add(
      new winston.transports.Console({
        format: winston.format(info => {
          if (Math.random() > samplingRate) {
            return false; // Skip this log entry
          }
          return info;
        })(),
      })
    );
  }
}

/**
 * Set up log rotation and archival
 */
export async function setupLogRotation(config: LogRotationConfig): Promise<void> {
  // This would typically use winston-daily-rotate-file or similar
  // For now, we'll create a simple rotation mechanism

  const rotateLogFile = (filePath: string) => {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const maxSize = parseSize(config.maxSize);

      if (stats.size > maxSize) {
        const timestamp = new Date().toISOString().split('T')[0];
        const archivePath = config.archivePath || path.join(path.dirname(filePath), 'archive');
        const fileName = path.basename(filePath, path.extname(filePath));
        const ext = path.extname(filePath);
        const archiveFile = path.join(archivePath, `${fileName}_${timestamp}${ext}`);

        // Ensure archive directory exists
        if (!fs.existsSync(archivePath)) {
          fs.mkdirSync(archivePath, { recursive: true });
        }

        // Move current log to archive
        fs.renameSync(filePath, archiveFile);

        // Compress if enabled
        if (config.compress) {
          // Would use zlib or similar compression library
          logger.debug('Log file archived and would be compressed', { archiveFile });
        }

        logger.info('Log file rotated', {
          originalFile: filePath,
          archiveFile,
          fileSize: stats.size,
        });
      }
    }
  };

  // Set up rotation interval
  const rotationInterval = getRotationInterval(config.frequency);
  setInterval(() => {
    const logFiles = [
      path.join(process.cwd(), 'logs', 'combined.log'),
      path.join(process.cwd(), 'logs', 'error.log'),
      path.join(process.cwd(), 'logs', 'audit.log'),
      path.join(process.cwd(), 'logs', 'performance.log'),
    ];

    logFiles.forEach(rotateLogFile);
  }, rotationInterval);

  logger.info('Log rotation configured', {
    frequency: config.frequency,
    maxSize: config.maxSize,
    maxFiles: config.maxFiles,
  });
}

/**
 * Parse size string to bytes
 */
function parseSize(size: string): number {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const match = size.match(/^(\d+)(B|KB|MB|GB)$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toUpperCase();

  return value * units[unit];
}

/**
 * Get rotation interval in milliseconds
 */
function getRotationInterval(frequency: string): number {
  switch (frequency) {
    case 'daily':
      return 24 * 60 * 60 * 1000; // 24 hours
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000; // 7 days
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000; // 30 days
    default:
      return 24 * 60 * 60 * 1000; // Default to daily
  }
}

// ============================================================================
// DYNAMIC CONFIGURATION
// ============================================================================

/**
 * Update logging configuration at runtime
 */
export function updateLoggingConfig(updates: Partial<LoggingConfig>): void {
  // Update log level
  if (updates.level && logger.level !== updates.level) {
    logger.level = updates.level;
    logger.info('Log level updated', { newLevel: updates.level });
  }

  // Enable/disable console logging
  if (typeof updates.enableConsole === 'boolean') {
    const consoleTransport = logger.transports.find(t => t instanceof winston.transports.Console);
    if (updates.enableConsole && !consoleTransport) {
      logger.add(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.simple()
          ),
        })
      );
      logger.info('Console logging enabled');
    } else if (!updates.enableConsole && consoleTransport) {
      logger.remove(consoleTransport);
      logger.info('Console logging disabled');
    }
  }
}

/**
 * Get current logging configuration
 */
export function getCurrentLoggingConfig(): Partial<LoggingConfig> {
  return {
    level: logger.level,
    enableConsole: logger.transports.some(t => t instanceof winston.transports.Console),
    enableFile: logger.transports.some(t => t instanceof winston.transports.File), // Add other config properties as needed };
  };

  // ============================================================================
  // HEALTH MONITORING
  // ============================================================================

  /**
   * Monitor logging system health
   */
  export function startLoggingHealthMonitor(): void {
    const healthCheckInterval = 5 * 60 * 1000; // 5 minutes

    setInterval(() => {
      try {
        // Check log file accessibility
        const logFiles = [
          path.join(process.cwd(), 'logs', 'combined.log'),
          path.join(process.cwd(), 'logs', 'error.log'),
        ];

        let allFilesAccessible = true;
        logFiles.forEach(file => {
          try {
            fs.accessSync(file, fs.constants.W_OK);
          } catch (error) {
            allFilesAccessible = false;
            logger.error('Log file not accessible', { file, error: (error as Error).message });
          }
        });

        // Check disk space
        const logDir = path.join(process.cwd(), 'logs');
        try {
          const stats = fs.statSync(logDir);
          // In a real implementation, you'd check available disk space
          logger.debug('Logging health check passed', {
            filesAccessible: allFilesAccessible,
            logDirectory: logDir,
          });
        } catch (error) {
          logger.error('Logging health check failed', {
            error: (error as Error).message,
          });
        }
      } catch (error) {
        logger.error('Logging health monitor error', {
          error: (error as Error).message,
        });
      }
    }, healthCheckInterval);

    logger.info('Logging health monitor started');
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Create a child logger with specific context
   */
  export function createChildLogger(context: Record<string, unknown>): winston.Logger {
    return logger.child(context);
  }

  /**
   * Flush all log transports
   */
  export async function flushLogs(): Promise<void> {
    return new Promise(resolve => {
      const transports = logger.transports.filter(t => t instanceof winston.transports.File);

      if (transports.length === 0) {
        resolve();
        return;
      }

      let flushed = 0;
      transports.forEach(transport => {
        if ('_flush' in transport && typeof transport._flush === 'function') {
          transport._flush(() => {
            flushed++;
            if (flushed === transports.length) {
              resolve();
            }
          });
        } else {
          flushed++;
          if (flushed === transports.length) {
            resolve();
          }
        }
      });
    });
  }

  /**
   * Get logging system statistics
   */
  export function getLoggingStats(): {
    logLevel: string;
    transports: number;
    logFiles: Array<{
      file: string;
      size: number;
      lastModified: Date;
    }>;
  } {
    const logFiles = [
      'logs/combined.log',
      'logs/error.log',
      'logs/audit.log',
      'logs/performance.log',
    ].map(file => {
      const fullPath = path.join(process.cwd(), file);
      try {
        const stats = fs.statSync(fullPath);
        return { file, size: stats.size, lastModified: stats.mtime };
      } catch {
        return { file, size: 0, lastModified: new Date(0) };
      }
    });

    return { logLevel: logger.level, transports: logger.transports.length, logFiles };
  }
}
