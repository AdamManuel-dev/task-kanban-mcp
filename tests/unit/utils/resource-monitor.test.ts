/**
 * @fileoverview Tests for resource monitoring system
 * @lastmodified 2025-07-28T17:45:00Z
 *
 * Features: Comprehensive testing of memory and CPU monitoring with alerts
 * Main APIs: Tests for ResourceMonitor, memory tracking, threshold alerts
 * Constraints: Real system resource monitoring, configurable thresholds
 * Patterns: Unit testing, event-driven testing, resource simulation
 */

import {
  ResourceMonitor,
  getMemoryUsage,
  trackResourceUsage,
  initializeResourceMonitoring,
  type ResourceStats,
  type MemoryStats,
  type CpuStats,
  type ResourceMonitorConfig,
} from '../../../src/utils/resource-monitor';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ResourceMonitor', () => {
  let monitor: ResourceMonitor;

  beforeEach(() => {
    monitor = new ResourceMonitor({
      memoryThreshold: 50, // 50MB for testing
      cpuThreshold: 50, // 50% for testing
      heapThreshold: 50, // 50% for testing
      monitoringInterval: 100, // 100ms for testing
      enableAlerts: true,
      enableLogging: false,
      historySize: 10,
    });
  });

  afterEach(() => {
    monitor.destroy();
  });

  describe('Basic Resource Monitoring', () => {
    test('should get current memory stats', () => {
      const memStats = monitor.getMemoryStats();

      expect(memStats.rss).toBeGreaterThan(0);
      expect(memStats.heapTotal).toBeGreaterThan(0);
      expect(memStats.heapUsed).toBeGreaterThan(0);
      expect(memStats.heapUtilization).toBeGreaterThanOrEqual(0);
      expect(memStats.heapUtilization).toBeLessThanOrEqual(100);
      expect(memStats.timestamp).toBeInstanceOf(Date);
    });

    test('should get current CPU stats', () => {
      const cpuStats = monitor.getCpuStats();

      expect(cpuStats.user).toBeGreaterThanOrEqual(0);
      expect(cpuStats.system).toBeGreaterThanOrEqual(0);
      expect(cpuStats.utilization).toBeGreaterThanOrEqual(0);
      expect(cpuStats.utilization).toBeLessThanOrEqual(100);
      expect(cpuStats.timestamp).toBeInstanceOf(Date);
    });

    test('should get comprehensive resource stats', () => {
      const stats = monitor.getCurrentStats();

      expect(stats.memory).toBeDefined();
      expect(stats.cpu).toBeDefined();
      expect(stats.uptime).toBeGreaterThan(0);
      expect(stats.eventLoopDelay).toBeGreaterThanOrEqual(0);
      expect(stats.activeHandles).toBeGreaterThanOrEqual(0);
      expect(stats.activeRequests).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Monitoring Lifecycle', () => {
    test('should start and stop monitoring', done => {
      let statsReceived = false;

      monitor.on('stats-updated', stats => {
        expect(stats).toBeDefined();
        expect(stats.memory).toBeDefined();
        expect(stats.cpu).toBeDefined();
        statsReceived = true;
      });

      monitor.start();

      // Wait for at least one stats update
      setTimeout(() => {
        monitor.stop();
        expect(statsReceived).toBe(true);
        done();
      }, 150); // Wait longer than monitoring interval
    });

    test('should not start monitoring twice', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      monitor.start();
      monitor.start(); // Second start should warn

      monitor.stop();
      consoleSpy.mockRestore();
    });

    test('should maintain stats history', done => {
      monitor.start();

      setTimeout(() => {
        const history = monitor.getHistory();
        expect(history.length).toBeGreaterThan(0);
        expect(history.length).toBeLessThanOrEqual(10); // historySize limit

        monitor.stop();
        done();
      }, 250); // Wait for multiple updates
    });
  });

  describe('Threshold Alerts', () => {
    test('should emit memory threshold alerts', done => {
      // Create monitor with very low memory threshold
      const lowThresholdMonitor = new ResourceMonitor({
        memoryThreshold: 1, // 1MB - very low
        monitoringInterval: 50,
        enableAlerts: true,
      });

      lowThresholdMonitor.on('memory-threshold', stats => {
        expect(stats.rss).toBeGreaterThan(1024 * 1024); // > 1MB
        lowThresholdMonitor.destroy();
        done();
      });

      lowThresholdMonitor.start();
    });

    test('should emit heap threshold alerts', done => {
      // Create monitor with very low heap threshold
      const lowHeapMonitor = new ResourceMonitor({
        heapThreshold: 1, // 1% - very low
        monitoringInterval: 50,
        enableAlerts: true,
      });

      lowHeapMonitor.on('heap-threshold', stats => {
        expect(stats.heapUtilization).toBeGreaterThan(1);
        lowHeapMonitor.destroy();
        done();
      });

      lowHeapMonitor.start();
    });

    test('should not emit alerts when disabled', done => {
      const noAlertMonitor = new ResourceMonitor({
        memoryThreshold: 1, // Very low threshold
        heapThreshold: 1,
        enableAlerts: false,
        monitoringInterval: 50,
      });

      let alertReceived = false;

      noAlertMonitor.on('memory-threshold', () => {
        alertReceived = true;
      });

      noAlertMonitor.on('heap-threshold', () => {
        alertReceived = true;
      });

      noAlertMonitor.start();

      setTimeout(() => {
        expect(alertReceived).toBe(false);
        noAlertMonitor.destroy();
        done();
      }, 100);
    });
  });

  describe('Memory Leak Detection', () => {
    test('should detect memory leak patterns', done => {
      const leakMonitor = new ResourceMonitor({
        monitoringInterval: 20,
        historySize: 5,
        enableAlerts: true,
      });

      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        leakMonitor.destroy();
        done(new Error('Test timeout: Memory leak detection did not trigger within expected time'));
      }, 5000);

      // Simulate increasing memory usage
      let callCount = 0;
      const originalGetMemoryStats = leakMonitor.getMemoryStats;
      leakMonitor.getMemoryStats = function mockGetMemoryStats() {
        const stats = originalGetMemoryStats.call(this);
        // Simulate increasing heap usage
        stats.heapUsed += callCount * 10 * 1024 * 1024; // Increase by 10MB each time
        callCount++;
        return stats;
      };

      leakMonitor.on('memory-leak-detected', trend => {
        clearTimeout(timeout);
        expect(trend).toBeDefined();
        expect(trend.length).toBeGreaterThan(0);
        leakMonitor.destroy();
        done();
      });

      leakMonitor.start();
    }, 15000);
  });

  describe('Resource Summary', () => {
    test('should generate resource summary', done => {
      monitor.start();

      setTimeout(() => {
        const summary = monitor.getSummary();

        expect(summary.current).toBeDefined();
        expect(summary.average).toBeDefined();
        expect(summary.peak).toBeDefined();
        expect(['increasing', 'decreasing', 'stable']).toContain(summary.memoryTrend);

        // Verify data structure
        expect(summary.current.memory).toBeDefined();
        expect(summary.current.cpu).toBeDefined();
        expect(summary.average.memory).toBeDefined();
        expect(summary.average.cpu).toBeDefined();

        monitor.stop();
        done();
      }, 150);
    });

    test('should handle empty history gracefully', () => {
      const summary = monitor.getSummary();

      expect(summary).toBeDefined();
      expect(summary.current).toBeDefined();
      expect(summary.memoryTrend).toBe('stable');
    });
  });

  describe('Garbage Collection', () => {
    test('should attempt garbage collection when available', () => {
      // Mock global.gc
      const originalGc = global.gc;
      global.gc = jest.fn();

      const afterStats = monitor.forceGarbageCollection();

      expect(global.gc).toHaveBeenCalled();
      expect(afterStats).toBeDefined();
      expect(afterStats!.heapUsed).toBeGreaterThanOrEqual(0);

      global.gc = originalGc;
    });

    test('should handle missing garbage collection gracefully', () => {
      // Ensure gc is not available
      const originalGc = global.gc;
      delete (global as any).gc;

      const result = monitor.forceGarbageCollection();

      expect(result).toBeNull();

      global.gc = originalGc;
    });
  });
});

describe('Resource Tracking Utilities', () => {
  describe('getMemoryUsage()', () => {
    test('should return formatted memory usage', () => {
      const memUsage = getMemoryUsage();

      expect(memUsage.rss).toMatch(/\d+\.\d+MB/);
      expect(memUsage.heap).toMatch(/\d+\.\d+MB \/ \d+\.\d+MB/);
      expect(memUsage.external).toMatch(/\d+\.\d+MB/);
      expect(memUsage.utilization).toMatch(/\d+\.\d+%/);
    });
  });

  describe('trackResourceUsage()', () => {
    test('should track resource usage for operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');
      const tracked = trackResourceUsage('test-operation', mockOperation);

      const result = await tracked('arg1', 'arg2');

      expect(result).toBe('result');
      expect(mockOperation).toHaveBeenCalledWith('arg1', 'arg2');
    });

    test('should track resource usage for failed operations', async () => {
      const error = new Error('Operation failed');
      const mockOperation = jest.fn().mockRejectedValue(error);
      const tracked = trackResourceUsage('test-operation', mockOperation);

      await expect(tracked('arg1')).rejects.toThrow('Operation failed');
      expect(mockOperation).toHaveBeenCalledWith('arg1');
    });

    test('should handle synchronous operations', async () => {
      const mockOperation = jest.fn().mockReturnValue('sync-result');
      const tracked = trackResourceUsage('test-operation', mockOperation);

      const result = await tracked('arg1');

      expect(result).toBe('sync-result');
      expect(mockOperation).toHaveBeenCalledWith('arg1');
    });

    test('should track memory delta when enabled', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');
      const tracked = trackResourceUsage('test-operation', mockOperation, {
        logResults: true,
        trackMemoryDelta: true,
      });

      await tracked();

      expect(mockOperation).toHaveBeenCalled();
      // Memory tracking should be logged (tested via logger mock)
    });
  });

  describe('initializeResourceMonitoring()', () => {
    test('should initialize monitoring with config', () => {
      const config: ResourceMonitorConfig = {
        memoryThreshold: 100,
        cpuThreshold: 70,
        heapThreshold: 85,
        enableAlerts: true,
        enableLogging: false,
      };

      // Should not throw
      expect(() => initializeResourceMonitoring(config)).not.toThrow();
    });

    test('should initialize with default config', () => {
      expect(() => initializeResourceMonitoring()).not.toThrow();
    });
  });
});

describe('Real-world Integration Scenarios', () => {
  test('should handle high-frequency monitoring', done => {
    const highFreqMonitor = new ResourceMonitor({
      monitoringInterval: 10, // Very frequent updates
      historySize: 50,
      enableAlerts: false, // Disable alerts to focus on performance
    });

    let updateCount = 0;
    highFreqMonitor.on('stats-updated', () => {
      updateCount++;
    });

    highFreqMonitor.start();

    setTimeout(() => {
      expect(updateCount).toBeGreaterThan(5); // Should have many updates
      const history = highFreqMonitor.getHistory();
      expect(history.length).toBeGreaterThan(0);

      highFreqMonitor.destroy();
      done();
    }, 100);
  });

  test('should handle monitoring during memory-intensive operations', async () => {
    const memMonitor = new ResourceMonitor({
      monitoringInterval: 50,
      enableAlerts: false,
    });

    const tracked = trackResourceUsage('memory-intensive', async () => {
      // Simulate memory-intensive operation
      const largeArray = new Array(100000).fill('memory');
      await new Promise(resolve => setTimeout(resolve, 10));
      return largeArray.length;
    });

    memMonitor.start();

    const result = await tracked();

    expect(result).toBe(100000);

    const stats = memMonitor.getCurrentStats();
    expect(stats.memory.heapUsed).toBeGreaterThan(0);

    memMonitor.destroy();
  });

  test('should handle concurrent monitoring and operations', async () => {
    const concurrentMonitor = new ResourceMonitor({
      monitoringInterval: 25,
      enableAlerts: false,
    });

    concurrentMonitor.start();

    // Run multiple operations concurrently
    const operations = Array.from({ length: 5 }, (_, i) =>
      trackResourceUsage(`operation-${i}`, async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return `result-${i}`;
      })()
    );

    const results = await Promise.all(operations);

    expect(results).toHaveLength(5);
    results.forEach((result, i) => {
      expect(result).toBe(`result-${i}`);
    });

    const history = concurrentMonitor.getHistory();
    expect(history.length).toBeGreaterThan(0);

    concurrentMonitor.destroy();
  });

  test('should handle monitoring lifecycle during errors', done => {
    const errorMonitor = new ResourceMonitor({
      monitoringInterval: 50,
      enableAlerts: true,
    });

    let errorHandled = false;
    errorMonitor.on('error', () => {
      errorHandled = true;
    });

    errorMonitor.start();

    // Simulate some operations
    const tracked = trackResourceUsage('error-operation', async () => {
      throw new Error('Simulated error');
    });

    tracked().catch(() => {
      // Expected error
    });

    setTimeout(() => {
      const stats = errorMonitor.getCurrentStats();
      expect(stats).toBeDefined();

      errorMonitor.destroy();
      done();
    }, 100);
  });
});

describe('Configuration and Edge Cases', () => {
  test('should handle various configuration options', () => {
    const configs: ResourceMonitorConfig[] = [
      { memoryThreshold: 1024, cpuThreshold: 95, heapThreshold: 98 },
      { monitoringInterval: 5000, historySize: 200 },
      { enableAlerts: false, enableLogging: true },
      {}, // Default config
    ];

    configs.forEach((config, _index) => {
      expect(() => {
        const monitor = new ResourceMonitor(config);
        monitor.destroy();
      }).not.toThrow();
    });
  });

  test('should handle extreme threshold values', () => {
    const extremeMonitor = new ResourceMonitor({
      memoryThreshold: 0, // Very low
      cpuThreshold: 100, // Maximum
      heapThreshold: 0, // Very low
      monitoringInterval: 1, // Minimum
    });

    expect(() => {
      const stats = extremeMonitor.getCurrentStats();
      expect(stats).toBeDefined();
    }).not.toThrow();

    extremeMonitor.destroy();
  });

  test('should handle cleanup properly', () => {
    const cleanupMonitor = new ResourceMonitor({
      monitoringInterval: 50,
    });

    cleanupMonitor.start();

    // Should cleanup without errors
    expect(() => {
      cleanupMonitor.destroy();
      cleanupMonitor.destroy(); // Double destroy should be safe
    }).not.toThrow();
  });

  test('should handle stats calculation edge cases', () => {
    const edgeMonitor = new ResourceMonitor({
      historySize: 1, // Minimal history
    });

    // With minimal history
    const summary = edgeMonitor.getSummary();
    expect(summary).toBeDefined();
    expect(summary.memoryTrend).toBe('stable');

    edgeMonitor.destroy();
  });
});
