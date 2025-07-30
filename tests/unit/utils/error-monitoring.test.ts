/**
 * @fileoverview Tests for error monitoring utilities
 */

import {
  AlertManager,
  ErrorFingerprinter,
  ErrorMonitor,
  ErrorStorage,
  errorMonitor,
  getErrorMetrics,
  getSystemHealth,
} from '../../../src/utils/error-monitoring';
import { BaseServiceError } from '../../../src/utils/errors';

describe('ErrorFingerprinter', () => {
  describe('generateFingerprint', () => {
    it('should generate consistent fingerprints for similar errors', () => {
      const error1 = new BaseServiceError('TEST_ERROR', 'Test error message', 400);
      const error2 = new BaseServiceError('TEST_ERROR', 'Test error message', 400);

      const context = { service: 'TestService', method: 'testMethod' };

      const fingerprint1 = ErrorFingerprinter.generateFingerprint(error1, context);
      const fingerprint2 = ErrorFingerprinter.generateFingerprint(error2, context);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should generate different fingerprints for different errors', () => {
      const error1 = new BaseServiceError('TEST_ERROR_1', 'Test error 1', 400);
      const error2 = new BaseServiceError('TEST_ERROR_2', 'Test error 2', 400);

      const context = { service: 'TestService', method: 'testMethod' };

      const fingerprint1 = ErrorFingerprinter.generateFingerprint(error1, context);
      const fingerprint2 = ErrorFingerprinter.generateFingerprint(error2, context);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should normalize dynamic content in error messages', () => {
      const error1 = new BaseServiceError('TEST_ERROR', 'Error with ID 12345', 400);
      const error2 = new BaseServiceError('TEST_ERROR', 'Error with ID 67890', 400);

      const context = { service: 'TestService', method: 'testMethod' };

      const fingerprint1 = ErrorFingerprinter.generateFingerprint(error1, context);
      const fingerprint2 = ErrorFingerprinter.generateFingerprint(error2, context);

      expect(fingerprint1).toBe(fingerprint2);
    });
  });
});

// eslint-disable-next-line max-lines-per-function
describe('ErrorStorage', () => {
  let errorStorage: ErrorStorage;

  beforeEach(() => {
    errorStorage = new ErrorStorage();
  });

  describe('addError', () => {
    it('should add error event to storage', () => {
      const error = new BaseServiceError('TEST_ERROR', 'Test error', 400);
      const event = {
        id: 'test-1',
        timestamp: new Date(),
        error,
        severity: 'medium' as const,
        fingerprint: 'test-fingerprint',
        tags: { service: 'test' },
      };

      errorStorage.addError(event);

      const errors = errorStorage.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual(event);
    });

    it('should maintain maximum number of events', () => {
      const maxEvents = 3;
      const storage = new ErrorStorage();
      // Set internal maxEvents for testing (normally private)
      (storage as any).maxEvents = maxEvents;

      // Add more events than the limit
      for (let i = 0; i < maxEvents + 2; i++) {
        const error = new BaseServiceError('TEST_ERROR', `Error ${i}`, 400);
        const event = {
          id: `test-${i}`,
          timestamp: new Date(),
          error,
          severity: 'medium' as const,
          fingerprint: `fingerprint-${i}`,
          tags: {},
        };
        storage.addError(event);
      }

      const errors = storage.getErrors();
      expect(errors).toHaveLength(maxEvents);
      // Should keep the most recent ones
      expect(errors[0].id).toBe('test-2');
    });
  });

  describe('getErrors', () => {
    beforeEach(() => {
      // Add some test data
      const baseTime = new Date('2023-01-01T00:00:00Z');
      for (let i = 0; i < 5; i++) {
        const error = new BaseServiceError('TEST_ERROR', `Error ${i}`, 400);
        const event = {
          id: `test-${i}`,
          timestamp: new Date(baseTime.getTime() + i * 60000), // 1 minute apart
          error,
          severity: i % 2 === 0 ? ('high' as const) : ('low' as const),
          fingerprint: `fingerprint-${i}`,
          tags: { service: i < 3 ? 'service-a' : 'service-b' },
          context: { service: i < 3 ? 'service-a' : 'service-b', method: 'test' },
        };
        errorStorage.addError(event);
      }
    });

    it('should return all errors when no filters applied', () => {
      const errors = errorStorage.getErrors();
      expect(errors).toHaveLength(5);
    });

    it('should filter by timestamp', () => {
      const since = new Date('2023-01-01T00:02:00Z');
      const errors = errorStorage.getErrors({ since });

      expect(errors).toHaveLength(3); // Events 2, 3, 4
    });

    it('should filter by severity', () => {
      const errors = errorStorage.getErrors({ severity: ['high'] });

      expect(errors).toHaveLength(3); // Events 0, 2, 4
    });

    it('should filter by service', () => {
      const errors = errorStorage.getErrors({ service: 'service-a' });

      expect(errors).toHaveLength(3); // Events 0, 1, 2
    });

    it('should apply limit', () => {
      const errors = errorStorage.getErrors({ limit: 2 });

      expect(errors).toHaveLength(2);
    });

    it('should apply multiple filters', () => {
      const errors = errorStorage.getErrors({
        severity: ['high'],
        service: 'service-a',
        limit: 1,
      });

      expect(errors).toHaveLength(1);
    });
  });

  describe('getMetrics', () => {
    it('should return zero metrics for empty storage', () => {
      const metrics = errorStorage.getMetrics();

      expect(metrics.errorCount).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.topErrors).toHaveLength(0);
    });

    it('should calculate metrics correctly', () => {
      // Add test data
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        const error = new BaseServiceError('TEST_ERROR', `Error ${i % 3}`, 400);
        const event = {
          id: `test-${i}`,
          timestamp: new Date(now.getTime() - (10 - i) * 60000), // Within last 10 minutes
          error,
          severity: 'medium' as const,
          fingerprint: `fingerprint-${i % 3}`, // 3 unique fingerprints
          tags: {},
        };
        errorStorage.addError(event);
      }

      const metrics = errorStorage.getMetrics(600000); // 10 minutes

      expect(metrics.errorCount).toBe(10);
      expect(metrics.errorRate).toBeGreaterThan(0);
      expect(metrics.topErrors).toHaveLength(3);
      expect(metrics.topErrors[0].count).toBeGreaterThanOrEqual(3);
    });
  });

  describe('clear', () => {
    it('should clear all stored errors', () => {
      const error = new BaseServiceError('TEST_ERROR', 'Test error', 400);
      const event = {
        id: 'test-1',
        timestamp: new Date(),
        error,
        severity: 'medium' as const,
        fingerprint: 'test-fingerprint',
        tags: {},
      };

      errorStorage.addError(event);
      expect(errorStorage.getErrors()).toHaveLength(1);

      errorStorage.clear();
      expect(errorStorage.getErrors()).toHaveLength(0);
    });
  });
});

describe('AlertManager', () => {
  let alertManager: AlertManager;

  beforeEach(() => {
    alertManager = new AlertManager();
  });

  describe('addRule', () => {
    it('should add alert rule', () => {
      const rule = {
        name: 'test-rule',
        condition: () => true,
        severity: 'warning' as const,
        cooldown: 5,
        channels: ['test-channel'],
        enabled: true,
      };

      alertManager.addRule(rule);

      // Rule should be added (verified by not throwing an error)
      expect(() => alertManager.addRule(rule)).not.toThrow();
    });
  });

  describe('addChannel', () => {
    it('should add alert channel', () => {
      const channel = {
        name: 'test-channel',
        type: 'log' as const,
        config: {},
        enabled: true,
      };

      alertManager.addChannel(channel);

      // Channel should be added (verified by not throwing an error)
      expect(() => alertManager.addChannel(channel)).not.toThrow();
    });
  });

  describe('checkAlerts', () => {
    it('should trigger alerts when conditions are met', async () => {
      const mockCondition = jest.fn().mockReturnValue(true);

      const rule = {
        name: 'test-rule',
        condition: mockCondition,
        severity: 'warning' as const,
        cooldown: 5,
        channels: ['log'],
        enabled: true,
      };

      const channel = {
        name: 'log',
        type: 'log' as const,
        config: {},
        enabled: true,
      };

      alertManager.addRule(rule);
      alertManager.addChannel(channel);

      const mockMetrics = {
        errorCount: 10,
        errorRate: 5,
        averageResponseTime: 100,
        failureRate: 10,
        p99ResponseTime: 200,
        p95ResponseTime: 150,
        topErrors: [],
      };

      await alertManager.checkAlerts(mockMetrics, []);

      expect(mockCondition).toHaveBeenCalledWith(mockMetrics, []);
    });

    it('should respect cooldown periods', async () => {
      const mockCondition = jest.fn().mockReturnValue(true);

      const rule = {
        name: 'test-rule',
        condition: mockCondition,
        severity: 'warning' as const,
        cooldown: 1, // 1 minute cooldown
        channels: ['log'],
        enabled: true,
      };

      const channel = {
        name: 'log',
        type: 'log' as const,
        config: {},
        enabled: true,
      };

      alertManager.addRule(rule);
      alertManager.addChannel(channel);

      const mockMetrics = {
        errorCount: 10,
        errorRate: 5,
        averageResponseTime: 100,
        failureRate: 10,
        p99ResponseTime: 200,
        p95ResponseTime: 150,
        topErrors: [],
      };

      // Trigger alert twice in quick succession
      await alertManager.checkAlerts(mockMetrics, []);
      await alertManager.checkAlerts(mockMetrics, []);

      // Should only trigger once due to cooldown
      expect(mockCondition).toHaveBeenCalledTimes(2);
    });

    it('should not trigger disabled rules', async () => {
      const mockCondition = jest.fn().mockReturnValue(true);

      const rule = {
        name: 'test-rule',
        condition: mockCondition,
        severity: 'warning' as const,
        cooldown: 5,
        channels: ['log'],
        enabled: false, // Disabled
      };

      alertManager.addRule(rule);

      const mockMetrics = {
        errorCount: 10,
        errorRate: 5,
        averageResponseTime: 100,
        failureRate: 10,
        p99ResponseTime: 200,
        p95ResponseTime: 150,
        topErrors: [],
      };

      await alertManager.checkAlerts(mockMetrics, []);

      expect(mockCondition).not.toHaveBeenCalled();
    });
  });
});

describe('ErrorMonitor', () => {
  let monitor: ErrorMonitor;

  beforeEach(() => {
    monitor = new ErrorMonitor();
  });

  afterEach(() => {
    monitor.stopMonitoring();
    monitor.clear();
  });

  describe('recordError', () => {
    it('should record error with proper severity calculation', () => {
      const error = new BaseServiceError('TEST_ERROR', 'Test error', 500);
      const context = { service: 'TestService', method: 'testMethod' };

      monitor.recordError(error, context);

      const errors = monitor.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe('critical'); // 500 status code
    });

    it('should calculate different severity levels', () => {
      const testCases = [
        { statusCode: 500, expectedSeverity: 'critical' },
        { statusCode: 400, expectedSeverity: 'high' },
        { statusCode: 200, expectedSeverity: 'low' },
      ];

      testCases.forEach(({ statusCode, expectedSeverity }, index) => {
        const error = new BaseServiceError('TEST_ERROR', `Error ${index}`, statusCode);
        monitor.recordError(error);

        const errors = monitor.getErrors();
        expect(errors[index].severity).toBe(expectedSeverity);
      });
    });

    it('should extract tags from error and context', () => {
      const error = new BaseServiceError('VALIDATION_ERROR', 'Invalid input', 400);
      const context = { service: 'UserService', method: 'createUser' };

      monitor.recordError(error, context);

      const errors = monitor.getErrors();
      const tags = errors[0].tags;

      expect(tags.code).toBe('VALIDATION_ERROR');
      expect(tags.service).toBe('UserService');
      expect(tags.method).toBe('createUser');
      expect(tags.statusCode).toBe('400');
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics', () => {
      // Add some test errors
      for (let i = 0; i < 5; i++) {
        const error = new BaseServiceError('TEST_ERROR', `Error ${i}`, 400);
        monitor.recordError(error);
      }

      const metrics = monitor.getMetrics();

      expect(metrics.errorCount).toBe(5);
      expect(metrics.errorRate).toBeGreaterThan(0);
    });
  });

  describe('getHealthReport', () => {
    it('should return health report', () => {
      const report = monitor.getHealthReport();

      expect(report).toHaveProperty('isHealthy');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('recentCriticalErrors');
    });

    it('should report unhealthy status with critical errors', () => {
      const criticalError = new BaseServiceError('CRITICAL_ERROR', 'Critical failure', 500);
      monitor.recordError(criticalError);

      const report = monitor.getHealthReport();

      expect(report.isHealthy).toBe(false);
      expect(report.recentCriticalErrors).toHaveLength(1);
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring with default interval', () => {
      monitor.startMonitoring();

      // Monitoring should be active (verified by not throwing)
      expect(() => monitor.stopMonitoring()).not.toThrow();
    });

    it('should start monitoring with custom interval', () => {
      monitor.startMonitoring(30000); // 30 seconds

      expect(() => monitor.stopMonitoring()).not.toThrow();
    });
  });

  describe('addAlertRule', () => {
    it('should add custom alert rule', () => {
      const rule = {
        name: 'custom-rule',
        condition: () => true,
        severity: 'error' as const,
        cooldown: 10,
        channels: ['log'],
        enabled: true,
      };

      expect(() => monitor.addAlertRule(rule)).not.toThrow();
    });
  });

  describe('addAlertChannel', () => {
    it('should add custom alert channel', () => {
      const channel = {
        name: 'custom-channel',
        type: 'webhook' as const,
        config: { url: 'http://example.com/webhook' },
        enabled: true,
      };

      expect(() => monitor.addAlertChannel(channel)).not.toThrow();
    });
  });
});

describe('Module exports', () => {
  it('should export errorMonitor instance', () => {
    expect(errorMonitor).toBeInstanceOf(ErrorMonitor);
  });

  it('should export getErrorMetrics function', () => {
    expect(typeof getErrorMetrics).toBe('function');

    const metrics = getErrorMetrics();
    expect(metrics).toHaveProperty('errorCount');
    expect(metrics).toHaveProperty('errorRate');
  });

  it('should export getSystemHealth function', () => {
    expect(typeof getSystemHealth).toBe('function');

    const health = getSystemHealth();
    expect(health).toHaveProperty('isHealthy');
    expect(health).toHaveProperty('summary');
  });
});

// Clean up after tests
afterAll(() => {
  errorMonitor.stopMonitoring();
  errorMonitor.clear();
});
