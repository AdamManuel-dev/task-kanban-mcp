/**
 * @fileoverview Tests for error reporting utilities
 */

import { 
  ErrorReporter,
  TrendAnalyzer,
  DiagnosticsCollector,
  RootCauseAnalyzer,
  generateErrorReport,
  getQuickHealthSummary
} from '../../../src/utils/error-reporting';
import type { ErrorEvent } from '../../../src/utils/error-monitoring';
import { BaseServiceError } from '../../../src/utils/errors';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../../src/utils/error-monitoring', () => ({
  errorMonitor: {
    getErrors: jest.fn(),
    getMetrics: jest.fn()
  },
  getErrorMetrics: jest.fn(),
  getSystemHealth: jest.fn()
}));

jest.mock('../../../src/utils/error-recovery', () => ({
  errorRecoveryManager: {
    getSystemHealth: jest.fn()
  }
}));

describe('TrendAnalyzer', () => {
  describe('analyzeTrend', () => {
    it('should identify increasing trend', () => {
      const values = [1, 2, 3, 8, 9, 10];
      const trend = TrendAnalyzer.analyzeTrend(values);
      expect(trend).toBe('increasing');
    });

    it('should identify decreasing trend', () => {
      const values = [10, 9, 8, 3, 2, 1];
      const trend = TrendAnalyzer.analyzeTrend(values);
      expect(trend).toBe('decreasing');
    });

    it('should identify stable trend', () => {
      const values = [5, 5, 5, 5, 5, 5];
      const trend = TrendAnalyzer.analyzeTrend(values);
      expect(trend).toBe('stable');
    });

    it('should handle small changes as stable', () => {
      const values = [10, 10, 10, 10.5, 10.5, 10.5];
      const trend = TrendAnalyzer.analyzeTrend(values);
      expect(trend).toBe('stable');
    });

    it('should handle single value', () => {
      const values = [5];
      const trend = TrendAnalyzer.analyzeTrend(values);
      expect(trend).toBe('stable');
    });

    it('should handle empty array', () => {
      const values: number[] = [];
      const trend = TrendAnalyzer.analyzeTrend(values);
      expect(trend).toBe('stable');
    });
  });

  describe('calculateSeverityDistribution', () => {
    it('should calculate severity distribution', () => {
      const events: ErrorEvent[] = [
        createMockErrorEvent('critical'),
        createMockErrorEvent('high'),
        createMockErrorEvent('high'),
        createMockErrorEvent('medium'),
        createMockErrorEvent('low')
      ];

      const distribution = TrendAnalyzer.calculateSeverityDistribution(events);

      expect(distribution).toEqual({
        low: 1,
        medium: 1,
        high: 2,
        critical: 1
      });
    });

    it('should handle empty events array', () => {
      const distribution = TrendAnalyzer.calculateSeverityDistribution([]);

      expect(distribution).toEqual({
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      });
    });
  });

  describe('identifyTopErrors', () => {
    it('should identify top errors by frequency', () => {
      const events: ErrorEvent[] = [
        createMockErrorEvent('high', 'fingerprint-1', 'Error A'),
        createMockErrorEvent('high', 'fingerprint-1', 'Error A'),
        createMockErrorEvent('high', 'fingerprint-1', 'Error A'),
        createMockErrorEvent('medium', 'fingerprint-2', 'Error B'),
        createMockErrorEvent('medium', 'fingerprint-2', 'Error B'),
        createMockErrorEvent('low', 'fingerprint-3', 'Error C')
      ];

      const topErrors = TrendAnalyzer.identifyTopErrors(events, 3);

      expect(topErrors).toHaveLength(3);
      expect(topErrors[0]).toMatchObject({
        fingerprint: 'fingerprint-1',
        message: 'Error A',
        count: 3,
        percentage: 50,
        severity: 'high'
      });
      expect(topErrors[1]).toMatchObject({
        fingerprint: 'fingerprint-2',
        count: 2,
        percentage: expect.closeTo(33.33, 1)
      });
    });

    it('should apply limit correctly', () => {
      const events: ErrorEvent[] = Array.from({ length: 15 }, (_, i) =>
        createMockErrorEvent('medium', `fingerprint-${i}`, `Error ${i}`)
      );

      const topErrors = TrendAnalyzer.identifyTopErrors(events, 5);

      expect(topErrors).toHaveLength(5);
    });

    it('should handle empty events array', () => {
      const topErrors = TrendAnalyzer.identifyTopErrors([]);

      expect(topErrors).toHaveLength(0);
    });
  });
});

describe('DiagnosticsCollector', () => {
  beforeEach(() => {
    const { errorRecoveryManager } = require('../../../src/utils/error-recovery');
    errorRecoveryManager.getSystemHealth.mockReturnValue({
      healthy: true,
      circuitBreakers: {
        'test-breaker': { state: 'CLOSED' }
      },
      bulkheads: {
        'test-bulkhead': { activeRequests: 2, maxConcurrency: 10 }
      }
    });
  });

  describe('collect', () => {
    it('should collect comprehensive diagnostic information', async () => {
      const diagnostics = await DiagnosticsCollector.collect();

      expect(diagnostics).toMatchObject({
        timestamp: expect.any(Date),
        system: {
          nodeVersion: expect.any(String),
          platform: expect.any(String),
          uptime: expect.any(Number),
          memoryUsage: expect.any(Object)
        },
        application: {
          version: expect.any(String),
          environment: expect.any(String),
          configuredFeatures: expect.any(Array)
        },
        database: {
          connected: expect.any(Boolean)
        },
        services: {
          activeServices: expect.any(Array),
          circuitBreakerStates: expect.any(Object),
          bulkheadUtilization: expect.any(Object)
        }
      });
    });

    it('should extract circuit breaker states', async () => {
      const diagnostics = await DiagnosticsCollector.collect();

      expect(diagnostics.services.circuitBreakerStates).toEqual({
        'test-breaker': 'CLOSED'
      });
    });

    it('should calculate bulkhead utilization', async () => {
      const diagnostics = await DiagnosticsCollector.collect();

      expect(diagnostics.services.bulkheadUtilization).toEqual({
        'test-bulkhead': 20 // 2/10 * 100
      });
    });

    it('should handle configured features from environment', async () => {
      process.env.ENABLE_WEBSOCKET = 'true';
      process.env.ENABLE_BACKUP = 'true';

      const diagnostics = await DiagnosticsCollector.collect();

      expect(diagnostics.application.configuredFeatures).toContain('websocket');
      expect(diagnostics.application.configuredFeatures).toContain('backup');

      delete process.env.ENABLE_WEBSOCKET;
      delete process.env.ENABLE_BACKUP;
    });
  });
});

describe('RootCauseAnalyzer', () => {
  describe('analyzeRootCauses', () => {
    it('should identify database-related issues', () => {
      const events: ErrorEvent[] = [
        createMockErrorEventWithCode('DATABASE_CONNECTION_ERROR'),
        createMockErrorEventWithCode('DATABASE_TIMEOUT'),
        createMockErrorEvent('high', 'fp1', 'database connection failed')
      ];

      const rootCauses = RootCauseAnalyzer.analyzeRootCauses(events);

      const dbCause = rootCauses.find(c => c.category === 'Database Issues');
      expect(dbCause).toBeDefined();
      expect(dbCause?.description).toContain('3 database-related errors');
      expect(dbCause?.recommendedActions).toContain('Check database connection health');
    });

    it('should identify validation issues', () => {
      const events: ErrorEvent[] = Array.from({ length: 10 }, () =>
        createMockErrorEventWithCode('VALIDATION_ERROR')
      );

      const rootCauses = RootCauseAnalyzer.analyzeRootCauses(events);

      const validationCause = rootCauses.find(c => c.category === 'Input Validation');
      expect(validationCause).toBeDefined();
      expect(validationCause?.description).toContain('data quality issues');
      expect(validationCause?.recommendedActions).toContain('Review input validation rules');
    });

    it('should identify external service issues', () => {
      const events: ErrorEvent[] = [
        createMockErrorEventWithCode('EXTERNAL_SERVICE_ERROR'),
        createMockErrorEvent('high', 'fp1', 'network timeout occurred'),
        createMockErrorEvent('medium', 'fp2', 'request timeout')
      ];

      const rootCauses = RootCauseAnalyzer.analyzeRootCauses(events);

      const networkCause = rootCauses.find(c => c.category === 'External Dependencies');
      expect(networkCause).toBeDefined();
      expect(networkCause?.description).toContain('3 external service or network errors');
      expect(networkCause?.recommendedActions).toContain('Check external service health');
    });

    it('should handle events with no clear root causes', () => {
      const events: ErrorEvent[] = [
        createMockErrorEvent('low', 'fp1', 'Generic error')
      ];

      const rootCauses = RootCauseAnalyzer.analyzeRootCauses(events);

      expect(rootCauses).toHaveLength(0);
    });

    it('should extract affected services', () => {
      const events: ErrorEvent[] = [
        createMockErrorEventWithServiceContext('DATABASE_ERROR', 'ServiceA'),
        createMockErrorEventWithServiceContext('DATABASE_ERROR', 'ServiceB')
      ];

      const rootCauses = RootCauseAnalyzer.analyzeRootCauses(events);

      const dbCause = rootCauses.find(c => c.category === 'Database Issues');
      expect(dbCause?.affectedServices).toContain('ServiceA');
      expect(dbCause?.affectedServices).toContain('ServiceB');
    });
  });
});

describe('ErrorReporter', () => {
  beforeEach(() => {
    const { errorMonitor } = require('../../../src/utils/error-monitoring');
    const { errorRecoveryManager } = require('../../../src/utils/error-recovery');

    errorMonitor.getErrors.mockReturnValue([]);
    errorMonitor.getMetrics.mockReturnValue({
      errorCount: 0,
      errorRate: 0,
      topErrors: []
    });

    errorRecoveryManager.getSystemHealth.mockReturnValue({
      healthy: true,
      circuitBreakers: {},
      bulkheads: {}
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive error report', async () => {
      const { errorMonitor } = require('../../../src/utils/error-monitoring');
      
      const mockEvents = [
        createMockErrorEvent('high', 'fp1', 'Test error 1'),
        createMockErrorEvent('medium', 'fp2', 'Test error 2')
      ];

      errorMonitor.getErrors.mockReturnValue(mockEvents);
      errorMonitor.getMetrics.mockReturnValue({
        errorCount: 2,
        errorRate: 0.5,
        topErrors: []
      });

      const timeRange = {
        start: new Date('2023-01-01T00:00:00Z'),
        end: new Date('2023-01-01T23:59:59Z')
      };

      const report = await ErrorReporter.generateReport(timeRange);

      expect(report).toMatchObject({
        id: expect.any(String),
        timestamp: expect.any(Date),
        timeRange,
        summary: {
          totalErrors: 2,
          uniqueErrors: 2,
          errorRate: 0.5,
          topErrors: expect.any(Array)
        },
        trends: {
          errorCountTrend: expect.any(String),
          errorRateTrend: expect.any(String),
          severityDistribution: expect.any(Object)
        },
        services: expect.any(Array),
        rootCauses: expect.any(Array),
        systemHealth: {
          overall: expect.any(String),
          circuitBreakers: expect.any(Object),
          bulkheads: expect.any(Object)
        },
        recommendations: expect.any(Array)
      });
    });

    it('should determine critical health status', async () => {
      const { errorMonitor } = require('../../../src/utils/error-monitoring');
      
      const criticalEvents = [
        createMockErrorEvent('critical', 'fp1', 'Critical error')
      ];

      errorMonitor.getErrors.mockReturnValue(criticalEvents);

      const timeRange = {
        start: new Date('2023-01-01T00:00:00Z'),
        end: new Date('2023-01-01T23:59:59Z')
      };

      const report = await ErrorReporter.generateReport(timeRange);

      expect(report.systemHealth.overall).toBe('critical');
    });

    it('should determine degraded health status', async () => {
      const { errorMonitor } = require('../../../src/utils/error-monitoring');
      
      // Create 15 recent errors (more than 10 threshold)
      const recentEvents = Array.from({ length: 15 }, (_, i) =>
        createMockErrorEvent('medium', `fp${i}`, `Error ${i}`, new Date())
      );

      errorMonitor.getErrors.mockReturnValue(recentEvents);

      const timeRange = {
        start: new Date('2023-01-01T00:00:00Z'),
        end: new Date('2023-01-01T23:59:59Z')
      };

      const report = await ErrorReporter.generateReport(timeRange);

      expect(report.systemHealth.overall).toBe('degraded');
    });

    it('should analyze service errors correctly', async () => {
      const { errorMonitor } = require('../../../src/utils/error-monitoring');
      
      const mockEvents = [
        createMockErrorEventWithServiceContext('TEST_ERROR', 'ServiceA', 'methodX'),
        createMockErrorEventWithServiceContext('TEST_ERROR', 'ServiceA', 'methodY'),
        createMockErrorEventWithServiceContext('TEST_ERROR', 'ServiceB', 'methodZ')
      ];

      errorMonitor.getErrors.mockReturnValue(mockEvents);

      const timeRange = {
        start: new Date('2023-01-01T00:00:00Z'),
        end: new Date('2023-01-01T23:59:59Z')
      };

      const report = await ErrorReporter.generateReport(timeRange);

      expect(report.services).toHaveLength(2);
      
      const serviceA = report.services.find(s => s.name === 'ServiceA');
      expect(serviceA).toMatchObject({
        name: 'ServiceA',
        errorCount: 2,
        errorRate: expect.any(Number),
        topMethods: expect.arrayContaining([
          { method: 'methodX', errorCount: 1 },
          { method: 'methodY', errorCount: 1 }
        ])
      });
    });

    it('should generate appropriate recommendations', async () => {
      const { errorMonitor } = require('../../../src/utils/error-monitoring');
      
      // Create many errors to trigger high volume recommendation
      const manyErrors = Array.from({ length: 150 }, (_, i) =>
        createMockErrorEvent('medium', `fp${i}`, `Error ${i}`)
      );

      errorMonitor.getErrors.mockReturnValue(manyErrors);

      const timeRange = {
        start: new Date('2023-01-01T00:00:00Z'),
        end: new Date('2023-01-01T23:59:59Z')
      };

      const report = await ErrorReporter.generateReport(timeRange);

      expect(report.recommendations).toContain(
        'High error volume detected - consider implementing rate limiting'
      );
    });
  });
});

describe('Convenience functions', () => {
  beforeEach(() => {
    const { errorMonitor } = require('../../../src/utils/error-monitoring');
    const { errorRecoveryManager } = require('../../../src/utils/error-recovery');
    const { getErrorMetrics, getSystemHealth } = require('../../../src/utils/error-monitoring');

    errorMonitor.getErrors.mockReturnValue([]);
    errorMonitor.getMetrics.mockReturnValue({
      errorCount: 0,
      errorRate: 0,
      topErrors: []
    });

    errorRecoveryManager.getSystemHealth.mockReturnValue({
      healthy: true,
      circuitBreakers: {},
      bulkheads: {}
    });

    getErrorMetrics.mockReturnValue({
      errorCount: 5,
      errorRate: 0.1
    });

    getSystemHealth.mockReturnValue({
      isHealthy: true
    });
  });

  describe('generateErrorReport', () => {
    it('should generate report for default 24 hours', async () => {
      const report = await generateErrorReport();

      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('timeRange');
      
      const timeSpan = report.timeRange.end.getTime() - report.timeRange.start.getTime();
      expect(timeSpan).toBe(24 * 60 * 60 * 1000); // 24 hours in milliseconds
    });

    it('should generate report for custom hours', async () => {
      const report = await generateErrorReport(12);

      const timeSpan = report.timeRange.end.getTime() - report.timeRange.start.getTime();
      expect(timeSpan).toBe(12 * 60 * 60 * 1000); // 12 hours in milliseconds
    });
  });

  describe('getQuickHealthSummary', () => {
    it('should return healthy status summary', () => {
      const summary = getQuickHealthSummary();

      expect(summary).toEqual({
        status: 'healthy',
        errorCount: 5,
        criticalErrors: 0,
        recommendations: ['System is operating normally']
      });
    });

    it('should return degraded status summary', () => {
      const { getSystemHealth } = require('../../../src/utils/error-monitoring');
      getSystemHealth.mockReturnValue({ isHealthy: false });

      const summary = getQuickHealthSummary();

      expect(summary).toEqual({
        status: 'degraded',
        errorCount: 5,
        criticalErrors: 0,
        recommendations: ['Check error logs', 'Review system health']
      });
    });

    it('should count critical errors correctly', () => {
      const { errorMonitor } = require('../../../src/utils/error-monitoring');
      
      const criticalEvents = [
        createMockErrorEvent('critical', 'fp1', 'Critical error 1'),
        createMockErrorEvent('critical', 'fp2', 'Critical error 2')
      ];

      errorMonitor.getErrors.mockReturnValue(criticalEvents);

      const summary = getQuickHealthSummary();

      expect(summary.criticalErrors).toBe(2);
    });
  });
});

// Helper functions for creating mock data
function createMockErrorEvent(
  severity: 'low' | 'medium' | 'high' | 'critical',
  fingerprint: string = 'default-fingerprint',
  message: string = 'Test error',
  timestamp: Date = new Date()
): ErrorEvent {
  return {
    id: `error-${Math.random().toString(36).substr(2, 9)}`,
    timestamp,
    error: new BaseServiceError('TEST_ERROR', message, 400),
    severity,
    fingerprint,
    tags: {},
    context: {
      service: 'TestService',
      method: 'testMethod'
    }
  };
}

function createMockErrorEventWithCode(code: string): ErrorEvent {
  return {
    id: `error-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    error: new BaseServiceError(code, 'Test error message', 400),
    severity: 'high',
    fingerprint: `fp-${code}`,
    tags: {},
    context: {
      service: 'TestService',
      method: 'testMethod'
    }
  };
}

function createMockErrorEventWithServiceContext(
  code: string,
  service: string,
  method: string = 'testMethod'
): ErrorEvent {
  return {
    id: `error-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    error: new BaseServiceError(code, 'Test error message', 400),
    severity: 'high',
    fingerprint: `fp-${code}`,
    tags: {},
    context: {
      service,
      method
    }
  };
}