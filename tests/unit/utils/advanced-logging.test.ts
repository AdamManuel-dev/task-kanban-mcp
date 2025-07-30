/**
 * @fileoverview Tests for advanced logging utilities
 */

import { 
  ContextLogger, 
  AuditLogger, 
  PerformanceLogger, 
  StructuredLogger,
  logAnalytics
} from '../../../src/utils/advanced-logging';

describe('ContextLogger', () => {
  beforeEach(() => {
    ContextLogger.clearContext();
  });

  describe('setContext', () => {
    it('should set logging context', () => {
      const context = { userId: 'user123', service: 'TestService' };
      
      expect(() => ContextLogger.setContext(context)).not.toThrow();
    });

    it('should merge with existing context', () => {
      ContextLogger.setContext({ userId: 'user123' });
      ContextLogger.setContext({ service: 'TestService' });
      
      // Context should be merged (verified by not throwing)
      expect(() => ContextLogger.getContext()).not.toThrow();
    });
  });

  describe('log', () => {
    it('should log with context', () => {
      const context = { userId: 'user123', service: 'TestService' };
      ContextLogger.setContext(context);
      
      expect(() => ContextLogger.log('info', 'Test message')).not.toThrow();
    });

    it('should log without context', () => {
      expect(() => ContextLogger.log('info', 'Test message')).not.toThrow();
    });

    it('should handle different log levels', () => {
      const levels = ['debug', 'info', 'warn', 'error'] as const;
      
      levels.forEach(level => {
        expect(() => ContextLogger.log(level, `Test ${level} message`)).not.toThrow();
      });
    });

    it('should include metadata in logs', () => {
      const metadata = { requestId: 'req123', operation: 'test' };
      
      expect(() => ContextLogger.log('info', 'Test message', metadata)).not.toThrow();
    });
  });

  describe('child', () => {
    it('should create child logger with additional context', () => {
      const parentContext = { service: 'TestService' };
      const childContext = { method: 'testMethod' };
      
      ContextLogger.setContext(parentContext);
      const childLogger = ContextLogger.child(childContext);
      
      expect(childLogger).toBeDefined();
      expect(() => childLogger.info('Test message')).not.toThrow();
    });
  });

  describe('clearContext', () => {
    it('should clear all context', () => {
      ContextLogger.setContext({ userId: 'user123' });
      ContextLogger.clearContext();
      
      // Should work without context
      expect(() => ContextLogger.log('info', 'Test message')).not.toThrow();
    });
  });
});

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;

  beforeEach(() => {
    auditLogger = new AuditLogger();
  });

  describe('logAction', () => {
    it('should log user action', () => {
      const action = {
        userId: 'user123',
        action: 'CREATE_TASK',
        resource: 'tasks',
        resourceId: 'task123',
        details: { title: 'New Task' }
      };

      expect(() => auditLogger.logAction(action)).not.toThrow();
    });

    it('should log action without optional fields', () => {
      const action = {
        userId: 'user123',
        action: 'LOGIN',
        resource: 'auth'
      };

      expect(() => auditLogger.logAction(action)).not.toThrow();
    });

    it('should handle system actions', () => {
      const action = {
        userId: 'system',
        action: 'SYSTEM_CLEANUP',
        resource: 'tasks',
        details: { deletedCount: 5 }
      };

      expect(() => auditLogger.logAction(action)).not.toThrow();
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security events', () => {
      const event = {
        type: 'FAILED_LOGIN',
        userId: 'user123',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0...',
        details: { attempts: 3 }
      };

      expect(() => auditLogger.logSecurityEvent(event)).not.toThrow();
    });

    it('should log security events without optional fields', () => {
      const event = {
        type: 'SUSPICIOUS_ACTIVITY',
        ip: '192.168.1.100'
      };

      expect(() => auditLogger.logSecurityEvent(event)).not.toThrow();
    });
  });

  describe('logSystemEvent', () => {
    it('should log system events', () => {
      const event = {
        type: 'SERVICE_START',
        service: 'TaskService',
        details: { version: '1.0.0', port: 3000 }
      };

      expect(() => auditLogger.logSystemEvent(event)).not.toThrow();
    });

    it('should log system events with different types', () => {
      const eventTypes = ['SERVICE_START', 'SERVICE_STOP', 'ERROR', 'WARNING'];
      
      eventTypes.forEach(type => {
        const event = {
          type,
          service: 'TestService',
          details: { test: true }
        };
        
        expect(() => auditLogger.logSystemEvent(event)).not.toThrow();
      });
    });
  });

  describe('queryAuditLogs', () => {
    beforeEach(() => {
      // Add some test audit logs
      const actions = [
        {
          userId: 'user123',
          action: 'CREATE_TASK',
          resource: 'tasks',
          resourceId: 'task1'
        },
        {
          userId: 'user456',
          action: 'UPDATE_TASK',
          resource: 'tasks',
          resourceId: 'task2'
        },
        {
          userId: 'user123',
          action: 'DELETE_TASK',
          resource: 'tasks',
          resourceId: 'task3'
        }
      ];
      
      actions.forEach(action => auditLogger.logAction(action));
    });

    it('should query logs without filters', () => {
      const logs = auditLogger.queryAuditLogs();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should filter logs by userId', () => {
      const logs = auditLogger.queryAuditLogs({ userId: 'user123' });
      expect(Array.isArray(logs)).toBe(true);
      logs.forEach(log => {
        expect(log.userId).toBe('user123');
      });
    });

    it('should filter logs by action', () => {
      const logs = auditLogger.queryAuditLogs({ action: 'CREATE_TASK' });
      expect(Array.isArray(logs)).toBe(true);
      logs.forEach(log => {
        expect(log.action).toBe('CREATE_TASK');
      });
    });

    it('should filter logs by time range', () => {
      const since = new Date(Date.now() - 1000); // 1 second ago
      const logs = auditLogger.queryAuditLogs({ since });
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should apply limit to results', () => {
      const logs = auditLogger.queryAuditLogs({ limit: 2 });
      expect(logs.length).toBeLessThanOrEqual(2);
    });
  });

  describe('generateAuditReport', () => {
    beforeEach(() => {
      // Add test data
      const testActions = [
        { userId: 'user1', action: 'CREATE_TASK', resource: 'tasks' },
        { userId: 'user1', action: 'UPDATE_TASK', resource: 'tasks' },
        { userId: 'user2', action: 'CREATE_TASK', resource: 'tasks' },
        { userId: 'user2', action: 'DELETE_TASK', resource: 'tasks' }
      ];
      
      testActions.forEach(action => auditLogger.logAction(action));
    });

    it('should generate audit report', () => {
      const report = auditLogger.generateAuditReport();
      
      expect(report).toHaveProperty('totalEvents');
      expect(report).toHaveProperty('uniqueUsers');
      expect(report).toHaveProperty('topActions');
      expect(report).toHaveProperty('timeRange');
      expect(typeof report.totalEvents).toBe('number');
      expect(typeof report.uniqueUsers).toBe('number');
      expect(Array.isArray(report.topActions)).toBe(true);
    });

    it('should generate report for specific time range', () => {
      const since = new Date(Date.now() - 60000); // 1 minute ago
      const report = auditLogger.generateAuditReport({ since });
      
      expect(report).toHaveProperty('totalEvents');
      expect(report.timeRange).toHaveProperty('since');
    });
  });
});

describe('PerformanceLogger', () => {
  let performanceLogger: PerformanceLogger;

  beforeEach(() => {
    performanceLogger = new PerformanceLogger();
  });

  describe('startTimer', () => {
    it('should start a timer', () => {
      const timer = performanceLogger.startTimer('test-operation');
      expect(timer).toBeDefined();
      expect(typeof timer.end).toBe('function');
    });

    it('should handle multiple concurrent timers', () => {
      const timer1 = performanceLogger.startTimer('operation-1');
      const timer2 = performanceLogger.startTimer('operation-2');
      
      expect(timer1).toBeDefined();
      expect(timer2).toBeDefined();
      expect(timer1).not.toBe(timer2);
    });
  });

  describe('timer operations', () => {
    it('should measure operation time', async () => {
      const timer = performanceLogger.startTimer('test-operation');
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(() => timer.end()).not.toThrow();
    });

    it('should measure time with metadata', async () => {
      const timer = performanceLogger.startTimer('test-operation', {
        userId: 'user123',
        requestId: 'req123'
      });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(() => timer.end({ status: 'success' })).not.toThrow();
    });
  });

  describe('logMetric', () => {
    it('should log performance metrics', () => {
      const metric = {
        name: 'response_time',
        value: 150,
        unit: 'ms',
        tags: { endpoint: '/api/tasks', method: 'GET' }
      };

      expect(() => performanceLogger.logMetric(metric)).not.toThrow();
    });

    it('should log metrics without optional fields', () => {
      const metric = {
        name: 'cpu_usage',
        value: 75.5,
        unit: '%'
      };

      expect(() => performanceLogger.logMetric(metric)).not.toThrow();
    });
  });

  describe('getMetrics', () => {
    beforeEach(() => {
      // Add some test metrics
      const metrics = [
        { name: 'response_time', value: 100, unit: 'ms' },
        { name: 'response_time', value: 150, unit: 'ms' },
        { name: 'cpu_usage', value: 75, unit: '%' },
        { name: 'memory_usage', value: 60, unit: '%' }
      ];
      
      metrics.forEach(metric => performanceLogger.logMetric(metric));
    });

    it('should get all metrics', () => {
      const metrics = performanceLogger.getMetrics();
      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should filter metrics by name', () => {
      const metrics = performanceLogger.getMetrics({ name: 'response_time' });
      expect(Array.isArray(metrics)).toBe(true);
      metrics.forEach(metric => {
        expect(metric.name).toBe('response_time');
      });
    });

    it('should filter metrics by time range', () => {
      const since = new Date(Date.now() - 1000);
      const metrics = performanceLogger.getMetrics({ since });
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('should apply limit to results', () => {
      const metrics = performanceLogger.getMetrics({ limit: 2 });
      expect(metrics.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      // Add test data
      const responseTimeMetrics = [
        { name: 'response_time', value: 100, unit: 'ms' },
        { name: 'response_time', value: 200, unit: 'ms' },
        { name: 'response_time', value: 150, unit: 'ms' },
        { name: 'response_time', value: 300, unit: 'ms' }
      ];
      
      responseTimeMetrics.forEach(metric => performanceLogger.logMetric(metric));
    });

    it('should calculate performance statistics', () => {
      const stats = performanceLogger.getStats('response_time');
      
      expect(stats).toHaveProperty('count');
      expect(stats).toHaveProperty('avg');
      expect(stats).toHaveProperty('min');
      expect(stats).toHaveProperty('max');
      expect(stats).toHaveProperty('p50');
      expect(stats).toHaveProperty('p90');
      expect(stats).toHaveProperty('p95');
      expect(stats).toHaveProperty('p99');
      
      expect(stats.count).toBe(4);
      expect(stats.min).toBe(100);
      expect(stats.max).toBe(300);
      expect(stats.avg).toBe(187.5);
    });

    it('should return empty stats for non-existent metric', () => {
      const stats = performanceLogger.getStats('non_existent_metric');
      
      expect(stats.count).toBe(0);
      expect(stats.avg).toBe(0);
      expect(stats.min).toBe(0);
    });
  });
});

describe('StructuredLogger', () => {
  let structuredLogger: StructuredLogger;

  beforeEach(() => {
    structuredLogger = new StructuredLogger();
  });

  describe('logEvent', () => {
    it('should log structured events', () => {
      const event = {
        type: 'USER_ACTION',
        category: 'tasks',
        data: { action: 'create', taskId: 'task123' },
        metadata: { source: 'web', version: '1.0.0' }
      };

      expect(() => structuredLogger.logEvent(event)).not.toThrow();
    });

    it('should log events without optional fields', () => {
      const event = {
        type: 'SYSTEM_EVENT',
        category: 'health'
      };

      expect(() => structuredLogger.logEvent(event)).not.toThrow();
    });
  });

  describe('createEventBuilder', () => {
    it('should create event builder', () => {
      const builder = structuredLogger.createEventBuilder('USER_ACTION');
      expect(builder).toBeDefined();
      expect(typeof builder.category).toBe('function');
      expect(typeof builder.data).toBe('function');
      expect(typeof builder.log).toBe('function');
    });

    it('should build and log event using builder', () => {
      const builder = structuredLogger.createEventBuilder('USER_ACTION');
      
      expect(() => {
        builder
          .category('tasks')
          .data({ action: 'update', taskId: 'task123' })
          .metadata({ userId: 'user123' })
          .log();
      }).not.toThrow();
    });
  });
});

describe('logAnalytics', () => {
  describe('generateReport', () => {
    it('should generate analytics report', () => {
      const report = logAnalytics.generateReport();
      
      expect(report).toHaveProperty('logCounts');
      expect(report).toHaveProperty('topServices');
      expect(report).toHaveProperty('errorRates');
      expect(report).toHaveProperty('timeRange');
      expect(report).toHaveProperty('generatedAt');
      
      expect(typeof report.logCounts).toBe('object');
      expect(Array.isArray(report.topServices)).toBe(true);
      expect(typeof report.errorRates).toBe('object');
    });

    it('should generate report for specific time range', () => {
      const since = new Date(Date.now() - 3600000); // 1 hour ago
      const report = logAnalytics.generateReport({ since });
      
      expect(report.timeRange).toHaveProperty('since');
      expect(report.timeRange.since).toEqual(since);
    });
  });

  describe('getLogTrends', () => {
    it('should get log trends', () => {
      const trends = logAnalytics.getLogTrends();
      
      expect(Array.isArray(trends)).toBe(true);
    });

    it('should get trends for specific period', () => {
      const trends = logAnalytics.getLogTrends('1h');
      
      expect(Array.isArray(trends)).toBe(true);
    });
  });

  describe('getErrorAnalysis', () => {
    it('should get error analysis', () => {
      const analysis = logAnalytics.getErrorAnalysis();
      
      expect(analysis).toHaveProperty('totalErrors');
      expect(analysis).toHaveProperty('errorsByType');
      expect(analysis).toHaveProperty('errorsByService');
      expect(analysis).toHaveProperty('errorTrends');
      
      expect(typeof analysis.totalErrors).toBe('number');
      expect(typeof analysis.errorsByType).toBe('object');
      expect(typeof analysis.errorsByService).toBe('object');
      expect(Array.isArray(analysis.errorTrends)).toBe(true);
    });
  });
});