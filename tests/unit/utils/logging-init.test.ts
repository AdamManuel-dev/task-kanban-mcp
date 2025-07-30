/**
 * @fileoverview Tests for logging initialization utilities
 */

import fs from 'fs';
import path from 'path';
import {
  initializeLogging,
  setupLogRotation,
  updateLoggingConfig,
  getCurrentLoggingConfig,
  startLoggingHealthMonitor,
  createChildLogger,
  flushLogs,
  getLoggingStats,
} from '../../../src/utils/logging-init';
import type { LoggingConfig, LogRotationConfig } from '../../../src/utils/logging-init';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock winston
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    add: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    level: 'info',
    transports: [],
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn(),
    printf: jest.fn(),
  },
  transports: {
    File: jest.fn(),
    Console: jest.fn(),
    Http: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    add: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    level: 'info',
    transports: [],
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Mock advanced logging
jest.mock('../../../src/utils/advanced-logging', () => ({
  contextLogger: { init: jest.fn() },
  auditLogger: { init: jest.fn() },
  performanceLogger: { init: jest.fn() },
  logAnalytics: { init: jest.fn() },
}));

// Mock errors
jest.mock('../../../src/utils/errors', () => ({
  enableErrorMonitoring: jest.fn(),
}));

describe('initializeLogging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => '');
  });

  it('should initialize logging with default configuration', async () => {
    await expect(initializeLogging()).resolves.not.toThrow();
  });

  it('should initialize logging with custom configuration', async () => {
    const config: Partial<LoggingConfig> = {
      level: 'debug',
      enableConsole: true,
      enableFile: true,
      enableAudit: true,
      enablePerformance: true,
      enableAnalytics: true,
      enableErrorMonitoring: true,
    };

    await expect(initializeLogging(config)).resolves.not.toThrow();
  });

  it('should handle initialization errors gracefully', async () => {
    mockFs.mkdirSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    await expect(initializeLogging()).rejects.toThrow();
  });

  it('should create required log directories', async () => {
    mockFs.existsSync.mockReturnValue(false);

    await initializeLogging();

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('logs'), {
      recursive: true,
    });
  });

  it('should enable error monitoring when configured', async () => {
    const { enableErrorMonitoring } = require('../../../src/utils/errors');

    await initializeLogging({ enableErrorMonitoring: true });

    expect(enableErrorMonitoring).toHaveBeenCalled();
  });

  it('should skip error monitoring when disabled', async () => {
    const { enableErrorMonitoring } = require('../../../src/utils/errors');

    await initializeLogging({ enableErrorMonitoring: false });

    expect(enableErrorMonitoring).not.toHaveBeenCalled();
  });
});

describe('setupLogRotation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({
      size: 5 * 1024 * 1024, // 5MB
      mtime: new Date(),
    } as any);
    mockFs.readdir.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should set up log rotation with default configuration', async () => {
    const config: LogRotationConfig = {
      frequency: 'daily',
      maxSize: '10MB',
      maxFiles: 5,
      compress: true,
    };

    await expect(setupLogRotation(config)).resolves.not.toThrow();
  });

  it('should handle log rotation for large files', async () => {
    mockFs.statSync.mockReturnValue({
      size: 15 * 1024 * 1024, // 15MB (exceeds 10MB limit)
      mtime: new Date(),
    } as any);

    const config: LogRotationConfig = {
      frequency: 'daily',
      maxSize: '10MB',
      maxFiles: 5,
      compress: true,
    };

    await setupLogRotation(config);

    // Fast-forward time to trigger rotation
    jest.advanceTimersByTime(24 * 60 * 60 * 1000); // 24 hours

    expect(mockFs.renameSync).toHaveBeenCalled();
  });

  it('should handle different rotation frequencies', async () => {
    const frequencies: Array<LogRotationConfig['frequency']> = ['daily', 'weekly', 'monthly'];

    for (const frequency of frequencies) {
      const config: LogRotationConfig = {
        frequency,
        maxSize: '10MB',
        maxFiles: 5,
        compress: true,
      };

      await expect(setupLogRotation(config)).resolves.not.toThrow();
    }
  });

  it('should create archive directory if it does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false);
    mockFs.statSync.mockReturnValue({
      size: 15 * 1024 * 1024, // Large file
      mtime: new Date(),
    } as any);

    const config: LogRotationConfig = {
      frequency: 'daily',
      maxSize: '10MB',
      maxFiles: 5,
      compress: true,
      archivePath: '/custom/archive/path',
    };

    await setupLogRotation(config);
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/custom/archive/path', { recursive: true });
  });
});

describe('updateLoggingConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update log level', () => {
    const { logger } = require('../../../src/utils/logger');
    logger.level = 'info';

    updateLoggingConfig({ level: 'debug' });

    expect(logger.level).toBe('debug');
  });

  it('should not update log level if unchanged', () => {
    const { logger } = require('../../../src/utils/logger');
    logger.level = 'info';
    logger.info = jest.fn();

    updateLoggingConfig({ level: 'info' });

    expect(logger.info).not.toHaveBeenCalledWith('Log level updated', { newLevel: 'info' });
  });

  it('should enable console logging', () => {
    const winston = require('winston');
    const { logger } = require('../../../src/utils/logger');
    logger.transports = [];

    updateLoggingConfig({ enableConsole: true });

    expect(logger.add).toHaveBeenCalledWith(expect.any(winston.transports.Console));
  });

  it('should disable console logging', () => {
    const winston = require('winston');
    const { logger } = require('../../../src/utils/logger');
    const consoleTransport = new winston.transports.Console();
    logger.transports = [consoleTransport];

    updateLoggingConfig({ enableConsole: false });

    expect(logger.remove).toHaveBeenCalledWith(consoleTransport);
  });
});

describe('getCurrentLoggingConfig', () => {
  it('should return current logging configuration', () => {
    const winston = require('winston');
    const { logger } = require('../../../src/utils/logger');

    logger.level = 'debug';
    logger.transports = [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'test.log' }),
    ];

    const config = getCurrentLoggingConfig();

    expect(config).toEqual({
      level: 'debug',
      enableConsole: true,
      enableFile: true,
    });
  });

  it('should handle empty transports', () => {
    const { logger } = require('../../../src/utils/logger');

    logger.level = 'info';
    logger.transports = [];

    const config = getCurrentLoggingConfig();

    expect(config).toEqual({
      level: 'info',
      enableConsole: false,
      enableFile: false,
    });
  });
});

describe('startLoggingHealthMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFs.accessSync.mockImplementation(() => {});
    mockFs.statSync.mockReturnValue({
      size: 1024,
      mtime: new Date(),
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should start health monitoring', () => {
    expect(() => startLoggingHealthMonitor()).not.toThrow();
  });

  it('should perform health checks at intervals', () => {
    const { logger } = require('../../../src/utils/logger');
    logger.debug = jest.fn();

    startLoggingHealthMonitor();

    // Fast-forward 5 minutes
    jest.advanceTimersByTime(5 * 60 * 1000);

    expect(logger.debug).toHaveBeenCalledWith('Logging health check passed', expect.any(Object));
  });

  it('should handle file access errors', () => {
    const { logger } = require('../../../src/utils/logger');
    logger.error = jest.fn();
    mockFs.accessSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    startLoggingHealthMonitor();
    jest.advanceTimersByTime(5 * 60 * 1000);

    expect(logger.error).toHaveBeenCalledWith('Log file not accessible', expect.any(Object));
  });

  it('should handle health check errors gracefully', () => {
    const { logger } = require('../../../src/utils/logger');
    logger.error = jest.fn();
    mockFs.statSync.mockImplementation(() => {
      throw new Error('File system error');
    });

    startLoggingHealthMonitor();
    jest.advanceTimersByTime(5 * 60 * 1000);

    expect(logger.error).toHaveBeenCalledWith('Logging health check failed', expect.any(Object));
  });
});

describe('createChildLogger', () => {
  it('should create child logger with context', () => {
    const { logger } = require('../../../src/utils/logger');
    const context = { service: 'TestService', method: 'testMethod' };

    const childLogger = createChildLogger(context);

    expect(logger.child).toHaveBeenCalledWith(context);
    expect(childLogger).toBeDefined();
  });
});

describe('flushLogs', () => {
  it('should flush all file transports', async () => {
    const winston = require('winston');
    const { logger } = require('../../../src/utils/logger');

    const fileTransport1 = new winston.transports.File({ filename: 'test1.log' });
    const fileTransport2 = new winston.transports.File({ filename: 'test2.log' });
    const consoleTransport = new winston.transports.Console();

    // Mock _flush method
    fileTransport1._flush = jest.fn(callback => callback());
    fileTransport2._flush = jest.fn(callback => callback());

    logger.transports = [fileTransport1, fileTransport2, consoleTransport];

    await expect(flushLogs()).resolves.not.toThrow();

    expect(fileTransport1._flush).toHaveBeenCalled();
    expect(fileTransport2._flush).toHaveBeenCalled();
  });

  it('should handle transports without flush method', async () => {
    const winston = require('winston');
    const { logger } = require('../../../src/utils/logger');

    const fileTransport = new winston.transports.File({ filename: 'test.log' });
    // Don't add _flush method

    logger.transports = [fileTransport];

    await expect(flushLogs()).resolves.not.toThrow();
  });

  it('should resolve immediately when no file transports', async () => {
    const winston = require('winston');
    const { logger } = require('../../../src/utils/logger');

    logger.transports = [new winston.transports.Console()];

    await expect(flushLogs()).resolves.not.toThrow();
  });
});

describe('getLoggingStats', () => {
  beforeEach(() => {
    mockFs.statSync.mockImplementation((filePath: string) => {
      if (filePath.includes('combined.log')) {
        return { size: 1024, mtime: new Date('2023-01-01') } as any;
      }
      if (filePath.includes('error.log')) {
        return { size: 512, mtime: new Date('2023-01-02') } as any;
      }
      throw new Error('File not found');
    });
  });

  it('should return logging statistics', () => {
    const winston = require('winston');
    const { logger } = require('../../../src/utils/logger');

    logger.level = 'debug';
    logger.transports = [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'test.log' }),
    ];

    const stats = getLoggingStats();

    expect(stats).toEqual({
      logLevel: 'debug',
      transports: 2,
      logFiles: expect.arrayContaining([
        expect.objectContaining({
          file: 'logs/combined.log',
          size: 1024,
          lastModified: new Date('2023-01-01'),
        }),
        expect.objectContaining({
          file: 'logs/error.log',
          size: 512,
          lastModified: new Date('2023-01-02'),
        }),
      ]),
    });
  });

  it('should handle missing log files', () => {
    const { logger } = require('../../../src/utils/logger');

    logger.level = 'info';
    logger.transports = [];

    // All files will throw errors
    mockFs.statSync.mockImplementation(() => {
      throw new Error('File not found');
    });

    const stats = getLoggingStats();

    expect(stats.logFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          size: 0,
          lastModified: new Date(0),
        }),
      ])
    );
  });
});
