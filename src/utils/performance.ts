/**
 * @fileoverview Performance monitoring and timing utilities
 * @lastmodified 2025-07-28T17:00:00Z
 *
 * Features: Performance measurement, timing utilities, memory tracking
 * Main APIs: Timer, PerformanceMonitor, withTiming(), trackMemory()
 * Constraints: Non-intrusive monitoring, configurable collection
 * Patterns: Decorator pattern, metrics collection, async operation timing
 */

import { logger } from './logger';

/**
 * High-resolution timer for performance measurements
 */
export class Timer {
  private readonly startTime: [number, number];

  private endTime?: [number, number];

  private readonly label: string;

  constructor(label = 'operation') {
    this.label = label;
    this.startTime = process.hrtime();
  }

  /**
   * Stop the timer and return elapsed time in milliseconds
   */
  stop(): number {
    this.endTime = process.hrtime(this.startTime);
    const elapsed = this.endTime[0] * 1000 + this.endTime[1] / 1000000;
    return elapsed;
  }

  /**
   * Stop the timer and log the result
   */
  stopAndLog(level: 'debug' | 'info' | 'warn' = 'debug'): number {
    const elapsed = this.stop();
    logger[level](`Timer: ${this.label}`, {
      duration: `${elapsed.toFixed(2)}ms`,
      label: this.label,
    });
    return elapsed;
  }

  /**
   * Get current elapsed time without stopping the timer
   */
  peek(): number {
    const current = process.hrtime(this.startTime);
    return current[0] * 1000 + current[1] / 1000000;
  }
}

/**
 * Performance metrics collection
 */
export interface PerformanceMetrics {
  operationName: string;
  duration: number;
  timestamp: Date;
  memoryUsage?: NodeJS.MemoryUsage;
  metadata?: Record<string, unknown>;
}

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];

  private readonly maxMetrics: number = 1000;

  private isEnabled = true;

  constructor(options?: { maxMetrics?: number; enabled?: boolean }) {
    this.maxMetrics = options?.maxMetrics ?? 1000;
    this.isEnabled = options?.enabled ?? true;
  }

  /**
   * Record a performance metric
   */
  record(metric: PerformanceMetrics): void {
    if (!this.isEnabled) return;

    this.metrics.push(metric);

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log slow operations
    if (metric.duration > 1000) {
      logger.warn('Slow operation detected', {
        operation: metric.operationName,
        duration: `${metric.duration.toFixed(2)}ms`,
        metadata: metric.metadata,
      });
    }
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    totalOperations: number;
    averageDuration: number;
    slowestOperation: PerformanceMetrics | null;
    fastestOperation: PerformanceMetrics | null;
    operationCounts: Record<string, number>;
  } {
    if (this.metrics.length === 0) {
      return {
        totalOperations: 0,
        averageDuration: 0,
        slowestOperation: null,
        fastestOperation: null,
        operationCounts: {},
      };
    }

    const durations = this.metrics.map(m => m.duration);
    const averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    const slowestOperation = this.metrics.reduce((prev, current) =>
      prev.duration > current.duration ? prev : current
    );

    const fastestOperation = this.metrics.reduce((prev, current) =>
      prev.duration < current.duration ? prev : current
    );

    const operationCounts = this.metrics.reduce(
      (counts, metric) => {
        counts[metric.operationName] = (counts[metric.operationName] ?? 0) + 1;
        return counts;
      },
      {} as Record<string, number>
    );

    return {
      totalOperations: this.metrics.length,
      averageDuration,
      slowestOperation,
      fastestOperation,
      operationCounts,
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Enable or disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(count = 10): PerformanceMetrics[] {
    return this.metrics.slice(-count);
  }
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor({
  enabled: process.env.NODE_ENV !== 'test',
  maxMetrics: parseInt(process.env.PERFORMANCE_MAX_METRICS ?? '1000', 10),
});

/**
 * Decorator for timing function execution
 */
export function withTiming<T extends unknown[], R>(
  operationName: string,
  fn: (...args: T) => R,
  options?: { includeMemory?: boolean; metadata?: Record<string, unknown> }
): (...args: T) => R {
  return (...args: T): R => {
    const timer = new Timer(operationName);
    const startMemory = options?.includeMemory ? process.memoryUsage() : undefined;

    try {
      const result = fn(...args);

      // Handle both sync and async functions
      if (result instanceof Promise) {
        return result.then(
          value => {
            const duration = timer.stop();
            performanceMonitor.record({
              operationName,
              duration,
              timestamp: new Date(),
              memoryUsage: startMemory,
              metadata: options?.metadata,
            });
            return value;
          },
          error => {
            const duration = timer.stop();
            performanceMonitor.record({
              operationName: `${operationName} (error)`,
              duration,
              timestamp: new Date(),
              memoryUsage: startMemory,
              metadata: { ...options?.metadata, error: error.message },
            });
            throw error;
          }
        ) as R;
      }
      const duration = timer.stop();
      performanceMonitor.record({
        operationName,
        duration,
        timestamp: new Date(),
        memoryUsage: startMemory,
        metadata: options?.metadata,
      });
      return result;
    } catch (error) {
      const duration = timer.stop();
      performanceMonitor.record({
        operationName: `${operationName} (error)`,
        duration,
        timestamp: new Date(),
        memoryUsage: startMemory,
        metadata: {
          ...options?.metadata,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  };
}

/**
 * Decorator for timing async function execution
 */
export function withAsyncTiming<T extends unknown[], R>(
  operationName: string,
  fn: (...args: T) => Promise<R>,
  options?: { includeMemory?: boolean; metadata?: Record<string, unknown> }
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const timer = new Timer(operationName);
    const startMemory = options?.includeMemory ? process.memoryUsage() : undefined;

    try {
      const result = await fn(...args);
      const duration = timer.stop();

      performanceMonitor.record({
        operationName,
        duration,
        timestamp: new Date(),
        memoryUsage: startMemory,
        metadata: options?.metadata,
      });

      return result;
    } catch (error) {
      const duration = timer.stop();
      performanceMonitor.record({
        operationName: `${operationName} (error)`,
        duration,
        timestamp: new Date(),
        memoryUsage: startMemory,
        metadata: {
          ...options?.metadata,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  };
}

/**
 * Track memory usage for an operation
 */
export function trackMemory(operationName: string): {
  startMemory: NodeJS.MemoryUsage;
  stop: () => { memoryDelta: NodeJS.MemoryUsage; duration: number };
} {
  const timer = new Timer(operationName);
  const startMemory = process.memoryUsage();

  return {
    startMemory,
    stop: () => {
      const duration = timer.stop();
      const endMemory = process.memoryUsage();

      const memoryDelta = {
        rss: endMemory.rss - startMemory.rss,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        external: endMemory.external - startMemory.external,
        arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
      };

      logger.debug('Memory tracking result', {
        operation: operationName,
        duration: `${duration.toFixed(2)}ms`,
        memoryDelta: {
          rss: `${(memoryDelta.rss / 1024 / 1024).toFixed(2)}MB`,
          heapUsed: `${(memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        },
      });

      return { memoryDelta, duration };
    },
  };
}

/**
 * Performance benchmark utility
 */
export class Benchmark {
  private runs: number[] = [];

  private readonly operationName: string;

  constructor(operationName: string) {
    this.operationName = operationName;
  }

  /**
   * Run a benchmark iteration
   */
  run<T>(fn: () => T): T {
    const timer = new Timer(this.operationName);
    const result = fn();
    const duration = timer.stop();
    this.runs.push(duration);
    return result;
  }

  /**
   * Run an async benchmark iteration
   */
  async runAsync<T>(fn: () => Promise<T>): Promise<T> {
    const timer = new Timer(this.operationName);
    const result = await fn();
    const duration = timer.stop();
    this.runs.push(duration);
    return result;
  }

  /**
   * Get benchmark results
   */
  getResults(): {
    runs: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
  } {
    if (this.runs.length === 0) {
      throw new Error('No benchmark runs completed');
    }

    const sorted = [...this.runs].sort((a, b) => a - b);
    const mean = this.runs.reduce((a, b) => a + b, 0) / this.runs.length;
    const median = sorted[Math.floor(sorted.length / 2)];

    const variance = this.runs.reduce((acc, val) => acc + (val - mean) ** 2, 0) / this.runs.length;
    const stdDev = Math.sqrt(variance);

    return {
      runs: this.runs.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean,
      median,
      stdDev,
    };
  }

  /**
   * Reset benchmark data
   */
  reset(): void {
    this.runs = [];
  }
}

/**
 * Quick benchmark helper
 */
export async function quickBenchmark<T>(
  operationName: string,
  fn: () => T | Promise<T>,
  iterations = 10
): Promise<{
  operationName: string;
  results: ReturnType<Benchmark['getResults']>;
}> {
  const benchmark = new Benchmark(operationName);

  for (let i = 0; i < iterations; i++) {
    const result = fn();
    if (result instanceof Promise) {
      await benchmark.runAsync(async () => result);
    } else {
      benchmark.run(() => result);
    }
  }

  return {
    operationName,
    results: benchmark.getResults(),
  };
}
