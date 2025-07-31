/**
 * @fileoverview Performance-enhanced command helpers
 * @lastmodified 2025-07-28T17:00:00Z
 *
 * Features: Performance monitoring integration for CLI commands
 * Main APIs: withPerformanceTracking(), monitoredApiCall()
 * Constraints: Non-intrusive performance measurement
 * Patterns: Decorator pattern, metrics collection for CLI operations
 */

import { withAsyncTiming, performanceMonitor, Timer } from '../../utils/performance';
import { trackResourceUsage } from '../../utils/resource-monitor';
import { logger } from '../../utils/logger';

/**
 * Enhanced error handling with performance tracking
 */
export function withPerformanceTracking<T extends unknown[]>(
  operation: string,
  handler: (...args: T) => Promise<void>,
  options?: { includeMemory?: boolean; logSlowOperations?: boolean }
): (...args: T) => Promise<void> {
  const trackedHandler = withAsyncTiming(operation, handler, {
    includeMemory: options?.includeMemory ?? false,
    metadata: { commandType: 'cli' },
  });

  return async (...args: T): Promise<void> => {
    const timer = new Timer(operation);

    try {
      await trackedHandler(...args);
      const duration = timer.stop();

      // Log slow CLI operations
      if (options?.logSlowOperations && duration > 2000) {
        logger.warn('Slow CLI command detected', {
          operation,
          duration: `${duration.toFixed(2)}ms`,
          args: args.length,
        });
      }
    } catch (error) {
      timer.stopAndLog('warn');
      throw error;
    }
  };
}

/**
 * Monitor API client calls with performance tracking
 */
export async function monitoredApiCall<T>(
  operationName: string,
  apiCall: () => Promise<T>,
  options?: { timeout?: number; retries?: number }
): Promise<T> {
  return withAsyncTiming(
    `api:${operationName}`,
    async () => {
      const startTime = Date.now();

      try {
        const result = await apiCall();
        const duration = Date.now() - startTime;

        // Track API response times
        if (duration > 5000) {
          logger.warn('Slow API call detected', {
            operation: operationName,
            duration: `${duration}ms`,
          });
        }

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('API call failed', {
          operation: operationName,
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    },
    {
      includeMemory: true,
      metadata: {
        type: 'api-call',
        timeout: options?.timeout,
        retries: options?.retries,
      },
    }
  )();
}

/**
 * Performance-aware database operation wrapper
 */
export async function withDatabaseTiming<T>(
  queryName: string,
  operation: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  return withAsyncTiming(`db:${queryName}`, operation, {
    includeMemory: true,
    metadata: {
      type: 'database',
      ...metadata,
    },
  })();
}

/**
 * Get performance summary for CLI commands
 */
export function getPerformanceSummary(): {
  recentOperations: Array<{
    operation: string;
    duration: string;
    timestamp: string;
  }>;
  slowOperations: Array<{
    operation: string;
    duration: string;
    timestamp: string;
  }>;
  stats: ReturnType<typeof performanceMonitor.getStats>;
} {
  const stats = performanceMonitor.getStats();
  const recentMetrics = performanceMonitor.getRecentMetrics(10);

  const recentOperations = recentMetrics.map(metric => ({
    operation: metric.operationName,
    duration: `${metric.duration.toFixed(2)}ms`,
    timestamp: metric.timestamp.toISOString(),
  }));

  const slowOperations = recentMetrics
    .filter(metric => metric.duration > 1000)
    .map(metric => ({
      operation: metric.operationName,
      duration: `${metric.duration.toFixed(2)}ms`,
      timestamp: metric.timestamp.toISOString(),
    }));

  return { recentOperations, slowOperations, stats };
}

/**
 * CLI command to show performance information
 */
export function formatPerformanceReport(): string {
  const summary = getPerformanceSummary();
  const { stats } = summary;

  let report = '📊 Performance Summary\n';
  report += `${'═'.repeat(50)}\n\n`;

  report += `Total Operations: ${stats.totalOperations}\n`;
  report += `Average Duration: ${stats.averageDuration.toFixed(2)}ms\n\n`;

  if (stats.slowestOperation) {
    report += `Slowest Operation: ${stats.slowestOperation.operationName}\n`;
    report += `  Duration: ${stats.slowestOperation.duration.toFixed(2)}ms\n`;
    report += `  Time: ${stats.slowestOperation.timestamp.toISOString()}\n\n`;
  }

  if (summary.slowOperations.length > 0) {
    report += '⚠️  Recent Slow Operations:\n';
    summary.slowOperations.forEach(op => {
      report += `  • ${op.operation}: ${op.duration}\n`;
    });
    report += '\n';
  }

  report += 'Operation Counts:\n';
  Object.entries(stats.operationCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([op, count]) => {
      report += `  • ${op}: ${count}\n`;
    });

  return report;
}

/**
 * Track CLI operation with comprehensive resource monitoring
 */
export function trackCliOperation<Args extends unknown[], Return>(
  operationName: string,
  operation: (...args: Args) => Promise<Return>,
  options?: {
    logResults?: boolean;
    trackMemory?: boolean;
  }
): (...args: Args) => Promise<Return> {
  const wrappedOperation = trackResourceUsage(operationName, operation, {
    logResults: options?.logResults ?? false,
    trackMemoryDelta: options?.trackMemory ?? true,
  });

  return withAsyncTiming(operationName, wrappedOperation, {
    includeMemory: true,
    metadata: {
      type: 'cli-operation',
      trackMemory: options?.trackMemory,
    },
  });
}

/**
 * Higher-order function for comprehensive performance tracking
 */
export function withResourceTracking<Args extends unknown[], Return>(
  operationName: string,
  operation: (...args: Args) => Promise<Return> | Return
): (...args: Args) => Promise<Return> {
  return async (...args: Args): Promise<Return> => {
    const startMetrics = {
      timestamp: new Date(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    };

    try {
      const result = await withAsyncTiming(operationName, async () => operation(...args), {
        includeMemory: true,
        metadata: { type: 'resource-tracked' },
      })();

      // Record success metrics
      const endMetrics = {
        timestamp: new Date(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(startMetrics.cpu),
      };

      const duration = endMetrics.timestamp.getTime() - startMetrics.timestamp.getTime();
      const memoryDelta = endMetrics.memory.heapUsed - startMetrics.memory.heapUsed;

      logger.debug(`Operation completed: ${operationName}`, {
        duration: `${duration}ms`,
        memoryDelta: `${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
        cpuTime: `${(endMetrics.cpu.user + endMetrics.cpu.system) / 1000}ms`,
      });

      return result;
    } catch (error) {
      logger.error(`Operation failed: ${operationName}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${Date.now() - startMetrics.timestamp.getTime()}ms`,
      });
      throw error;
    }
  };
}

/**
 * Reset performance monitoring data
 */
export function resetPerformanceData(): void {
  performanceMonitor.clear();
  logger.info('Performance monitoring data cleared');
}
