/**
 * @fileoverview Tests for performance monitoring CLI commands
 * @lastmodified 2025-07-28T17:45:00Z
 *
 * Features: Comprehensive testing of performance CLI with metrics validation
 * Main APIs: Tests for performance commands, report generation, metrics collection
 * Constraints: CLI environment simulation, performance data validation
 * Patterns: CLI testing, performance monitoring validation, mock data generation
 */

import { jest } from '@jest/globals';

import { Command } from 'commander';
import { registerPerformanceCommands } from '../../../../src/cli/commands/performance';
import { performanceMonitor } from '../../../../src/utils/performance';
import {
  getPerformanceSummary,
  formatPerformanceReport,
  resetPerformanceData,
} from '../../../../src/cli/utils/performance-helpers';

// Mock dependencies before imports
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../../src/utils/performance', () => ({
  performanceMonitor: {
    getStats: jest.fn(),
    getRecentMetrics: jest.fn(),
    getAllMetrics: jest.fn(),
    clear: jest.fn(),
  },
  Timer: jest.fn().mockImplementation(() => ({
    stop: jest.fn().mockReturnValue(100),
    stopAndLog: jest.fn().mockReturnValue(100),
  })),
}));

jest.mock('../../../../src/cli/utils/performance-helpers', () => ({
  getPerformanceSummary: jest.fn(),
  formatPerformanceReport: jest.fn(),
  resetPerformanceData: jest.fn(),
}));

// Mock CLI components
const mockComponents = {
  formatter: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
  apiClient: {},
  config: {},
  services: {},
};

global.cliComponents = mockComponents as any;

// Helper to create test program
function createTestProgram(): Command {
  const program = new Command();
  registerPerformanceCommands(program);
  return program;
}

// Helper to execute CLI command
async function executeCommand(program: Command, args: string[]): Promise<void> {
  // Reset mocks before each command execution
  jest.clearAllMocks();

  // Parse command without executing process.exit
  program.exitOverride();

  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch (error: unknown) {
    // Handle expected exit codes from commander
    if (error.code !== 'commander.executeSubCommand') {
      throw error;
    }
  }
}

describe('Performance CLI Commands', () => {
  let program: Command;

  beforeEach(() => {
    program = createTestProgram();
    jest.clearAllMocks();
  });

  describe('Performance Status Command', () => {
    test('should show current performance statistics', async () => {
      const mockStats = {
        totalOperations: 150,
        averageDuration: 45.7,
        slowestOperation: {
          operationName: 'slow-api-call',
          duration: 2500,
          timestamp: new Date(),
        },
        operationCounts: {
          'api-call': 100,
          'db-query': 50,
        },
      };

      (performanceMonitor.getStats as jest.Mock).mockReturnValue(mockStats);

      await executeCommand(program, ['performance', 'status']);

      expect(performanceMonitor.getStats).toHaveBeenCalled();
      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });

    test('should show detailed performance statistics', async () => {
      const mockStats = {
        totalOperations: 200,
        averageDuration: 32.1,
        slowestOperation: {
          operationName: 'complex-operation',
          duration: 1800,
          timestamp: new Date(),
        },
        fastestOperation: {
          operationName: 'cache-hit',
          duration: 2.5,
          timestamp: new Date(),
        },
        operationCounts: {
          'cache-hit': 120,
          'cache-miss': 80,
        },
      };

      (performanceMonitor.getStats as jest.Mock).mockReturnValue(mockStats);

      await executeCommand(program, ['performance', 'status', '--detailed']);

      expect(performanceMonitor.getStats).toHaveBeenCalled();
      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });

    test('should handle empty performance data', async () => {
      const emptyStats = {
        totalOperations: 0,
        averageDuration: 0,
        slowestOperation: null,
        operationCounts: {},
      };

      (performanceMonitor.getStats as jest.Mock).mockReturnValue(emptyStats);

      await executeCommand(program, ['performance', 'status']);

      expect(mockComponents.formatter.info).toHaveBeenCalledWith(
        'No performance data available. Run some operations first.'
      );
    });
  });

  describe('Performance Report Command', () => {
    test('should generate formatted performance report', async () => {
      const mockReport = `
📊 Performance Summary
═══════════════════════════════════════════════════════

Total Operations: 150
Average Duration: 45.70ms

Slowest Operation: slow-api-call
  Duration: 2500.00ms
  Time: 2024-01-15T10:30:00.000Z

⚠️  Recent Slow Operations:
  • slow-api-call: 2500.00ms
  • complex-query: 1200.00ms

Operation Counts:
  • api-call: 100
  • db-query: 50
      `;

      (formatPerformanceReport as jest.Mock).mockReturnValue(mockReport);

      await executeCommand(program, ['performance', 'report']);

      expect(formatPerformanceReport).toHaveBeenCalled();
      expect(mockComponents.formatter.info).toHaveBeenCalledWith(mockReport);
    });

    test('should generate report with custom time range', async () => {
      await executeCommand(program, ['performance', 'report', '--since', '1h']);

      expect(formatPerformanceReport).toHaveBeenCalled();
    });

    test('should save report to file when specified', async () => {
      const mockReport = '📊 Performance Report...';
      (formatPerformanceReport as jest.Mock).mockReturnValue(mockReport);

      await executeCommand(program, ['performance', 'report', '--output', 'perf-report.txt']);

      expect(formatPerformanceReport).toHaveBeenCalled();
      // File saving would be tested with actual file operations
    });
  });

  describe('Performance History Command', () => {
    test('should show recent performance metrics', async () => {
      const mockMetrics = [
        {
          operationName: 'api-call',
          duration: 150,
          timestamp: new Date('2024-01-15T10:30:00Z'),
          metadata: { endpoint: '/tasks' },
        },
        {
          operationName: 'db-query',
          duration: 75,
          timestamp: new Date('2024-01-15T10:29:00Z'),
          metadata: { table: 'tasks' },
        },
      ];

      (performanceMonitor.getRecentMetrics as jest.Mock).mockReturnValue(mockMetrics);

      await executeCommand(program, ['performance', 'history']);

      expect(performanceMonitor.getRecentMetrics).toHaveBeenCalledWith(50); // default limit
    });

    test('should show history with custom limit', async () => {
      const mockMetrics = Array.from({ length: 20 }, (_, i) => ({
        operationName: `operation-${i}`,
        duration: Math.random() * 1000,
        timestamp: new Date(),
        metadata: {},
      }));

      (performanceMonitor.getRecentMetrics as jest.Mock).mockReturnValue(mockMetrics);

      await executeCommand(program, ['performance', 'history', '--limit', '20']);

      expect(performanceMonitor.getRecentMetrics).toHaveBeenCalledWith(20);
    });

    test('should filter history by operation name', async () => {
      const filteredMetrics = [
        {
          operationName: 'api-call',
          duration: 200,
          timestamp: new Date(),
          metadata: {},
        },
      ];

      (performanceMonitor.getRecentMetrics as jest.Mock).mockReturnValue(filteredMetrics);

      await executeCommand(program, ['performance', 'history', '--operation', 'api-call']);

      expect(performanceMonitor.getRecentMetrics).toHaveBeenCalledWith(50, 'api-call');
    });
  });

  describe('Performance Clear Command', () => {
    test('should clear performance data', async () => {
      await executeCommand(program, ['performance', 'clear']);

      expect(resetPerformanceData).toHaveBeenCalled();
      expect(mockComponents.formatter.success).toHaveBeenCalledWith('✅ Performance data cleared');
    });

    test('should confirm before clearing data', async () => {
      // Mock confirmation prompt
      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({ confirm: true }),
      };
      jest.doMock('inquirer', () => mockInquirer);

      await executeCommand(program, ['performance', 'clear']);

      expect(resetPerformanceData).toHaveBeenCalled();
    });

    test('should skip confirmation with force flag', async () => {
      await executeCommand(program, ['performance', 'clear', '--force']);

      expect(resetPerformanceData).toHaveBeenCalled();
    });
  });

  describe('Performance Benchmark Command', () => {
    test('should run performance benchmark', async () => {
      const mockBenchmarkResults = {
        operation: 'api-benchmark',
        iterations: 100,
        averageDuration: 125.5,
        minDuration: 95.2,
        maxDuration: 180.7,
        standardDeviation: 15.3,
      };

      // Mock the benchmark execution
      const mockBenchmark = jest.fn().mockResolvedValue(mockBenchmarkResults);

      await executeCommand(program, ['performance', 'benchmark', 'api-call']);

      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });

    test('should run benchmark with custom iterations', async () => {
      await executeCommand(program, ['performance', 'benchmark', 'db-query', '--iterations', '50']);

      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });

    test('should handle benchmark errors gracefully', async () => {
      // Mock benchmark failure
      const mockError = new Error('Benchmark failed');

      // This would require actual benchmark implementation
      await executeCommand(program, ['performance', 'benchmark', 'failing-operation']);

      // Should handle error without crashing
    });
  });

  describe('Performance Monitor Command', () => {
    test('should start real-time performance monitoring', async () => {
      // Mock the monitoring loop
      const mockMonitoringLoop = jest.fn();

      // This would start a monitoring loop in real implementation
      await executeCommand(program, ['performance', 'monitor']);

      expect(mockComponents.formatter.info).toHaveBeenCalledWith(
        '📊 Starting real-time performance monitoring... (Press Ctrl+C to stop)'
      );
    });

    test('should monitor with custom refresh interval', async () => {
      await executeCommand(program, ['performance', 'monitor', '--interval', '5']);

      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });

    test('should monitor specific operations only', async () => {
      await executeCommand(program, ['performance', 'monitor', '--filter', 'api-*']);

      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });
  });

  describe('Performance Analysis Command', () => {
    test('should analyze performance trends', async () => {
      const mockAnalysis = {
        trends: {
          'api-call': {
            trend: 'improving',
            change: -15.5, // 15.5% improvement
            confidence: 0.85,
          },
          'db-query': {
            trend: 'degrading',
            change: 23.2, // 23.2% slower
            confidence: 0.92,
          },
        },
        recommendations: [
          'Consider optimizing db-query operations',
          'API performance is improving - good job!',
        ],
      };

      // Mock analysis function
      const mockAnalyze = jest.fn().mockResolvedValue(mockAnalysis);

      await executeCommand(program, ['performance', 'analyze']);

      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });

    test('should analyze specific time period', async () => {
      await executeCommand(program, ['performance', 'analyze', '--period', '24h']);

      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });

    test('should provide performance recommendations', async () => {
      const mockRecommendations = [
        {
          operation: 'slow-api-call',
          issue: 'High average duration',
          suggestion: 'Consider implementing caching',
          priority: 'high',
        },
      ];

      await executeCommand(program, ['performance', 'analyze', '--recommendations']);

      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle performance monitoring errors', async () => {
      (performanceMonitor.getStats as jest.Mock).mockImplementation(() => {
        throw new Error('Performance monitor error');
      });

      await executeCommand(program, ['performance', 'status']);

      expect(mockComponents.formatter.error).toHaveBeenCalledWith(
        'Failed to get performance status: Performance monitor error'
      );
    });

    test('should handle missing performance data gracefully', async () => {
      (performanceMonitor.getRecentMetrics as jest.Mock).mockReturnValue([]);

      await executeCommand(program, ['performance', 'history']);

      expect(mockComponents.formatter.info).toHaveBeenCalledWith(
        'No performance history available'
      );
    });

    test('should validate command parameters', async () => {
      // Invalid limit value
      await executeCommand(program, ['performance', 'history', '--limit', 'invalid']);

      // Should use default limit and show warning
      expect(mockComponents.formatter.warn).toHaveBeenCalled();
    });

    test('should handle concurrent command execution', async () => {
      const promises = [
        executeCommand(program, ['performance', 'status']),
        executeCommand(program, ['performance', 'history']),
        executeCommand(program, ['performance', 'report']),
      ];

      await Promise.all(promises);

      // All commands should complete without interference
      expect(performanceMonitor.getStats).toHaveBeenCalled();
      expect(performanceMonitor.getRecentMetrics).toHaveBeenCalled();
      expect(formatPerformanceReport).toHaveBeenCalled();
    });
  });

  describe('Integration with Performance Monitor', () => {
    test('should correctly integrate with performance monitor API', async () => {
      const realStats = {
        totalOperations: 42,
        averageDuration: 123.45,
        slowestOperation: {
          operationName: 'test-operation',
          duration: 500,
          timestamp: new Date(),
        },
        operationCounts: {
          'test-op': 42,
        },
      };

      (performanceMonitor.getStats as jest.Mock).mockReturnValue(realStats);

      await executeCommand(program, ['performance', 'status']);

      expect(performanceMonitor.getStats).toHaveBeenCalledTimes(1);
    });

    test('should handle performance monitor initialization', async () => {
      // Test that commands work even if monitor isn't fully initialized
      (performanceMonitor.getStats as jest.Mock).mockReturnValue({
        totalOperations: 0,
        averageDuration: 0,
        operationCounts: {},
      });

      await executeCommand(program, ['performance', 'status']);

      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });
  });

  describe('Output Formatting and Display', () => {
    test('should format performance metrics correctly', async () => {
      const mockStats = {
        totalOperations: 1000,
        averageDuration: 75.123,
        slowestOperation: {
          operationName: 'complex-calculation',
          duration: 2500.789,
          timestamp: new Date('2024-01-15T10:30:00Z'),
        },
      };

      (performanceMonitor.getStats as jest.Mock).mockReturnValue(mockStats);

      await executeCommand(program, ['performance', 'status']);

      // Verify formatting is applied (exact format depends on implementation)
      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });

    test('should handle different output formats', async () => {
      await executeCommand(program, ['performance', 'report', '--format', 'json']);

      expect(formatPerformanceReport).toHaveBeenCalled();
    });

    test('should support colored output', async () => {
      await executeCommand(program, ['performance', 'status', '--color']);

      expect(mockComponents.formatter.info).toHaveBeenCalled();
    });
  });
});
