/**
 * @fileoverview Memory and resource usage tracking utilities
 * @lastmodified 2025-07-28T17:45:00Z
 *
 * Features: Memory monitoring, heap analysis, resource alerts, performance tracking
 * Main APIs: ResourceMonitor, getMemoryUsage(), trackResourceUsage()
 * Constraints: Node.js process monitoring, configurable thresholds
 * Patterns: Observer pattern, threshold alerts, periodic monitoring
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { logger } from './logger';

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  rss: number; // Resident Set Size
  heapTotal: number; // Total heap size
  heapUsed: number; // Used heap size
  external: number; // External memory usage
  arrayBuffers: number; // Array buffer memory
  heapUtilization: number; // Heap utilization percentage
  timestamp: Date;
}

/**
 * CPU usage statistics
 */
export interface CpuStats {
  user: number; // User CPU time in microseconds
  system: number; // System CPU time in microseconds
  utilization: number; // CPU utilization percentage
  timestamp: Date;
}

/**
 * Resource usage statistics
 */
export interface ResourceStats {
  memory: MemoryStats;
  cpu: CpuStats;
  uptime: number; // Process uptime in seconds
  eventLoopDelay: number; // Event loop delay in milliseconds
  activeHandles: number; // Active handles count
  activeRequests: number; // Active requests count
}

/**
 * Resource monitoring configuration
 */
export interface ResourceMonitorConfig {
  memoryThreshold?: number; // Memory threshold in MB (default: 512MB)
  cpuThreshold?: number; // CPU threshold percentage (default: 80%)
  heapThreshold?: number; // Heap threshold percentage (default: 90%)
  monitoringInterval?: number; // Monitoring interval in milliseconds (default: 5000)
  enableAlerts?: boolean; // Enable threshold alerts (default: true)
  enableLogging?: boolean; // Enable periodic logging (default: false)
  historySize?: number; // Number of historical records to keep (default: 100)
}

/**
 * Resource monitor events
 */
interface ResourceMonitorEvents {
  'memory-threshold': (stats: MemoryStats) => void;
  'cpu-threshold': (stats: CpuStats) => void;
  'heap-threshold': (stats: MemoryStats) => void;
  'stats-updated': (stats: ResourceStats) => void;
  'memory-leak-detected': (trend: number[]) => void;
}

/**
 * Comprehensive resource monitor for memory, CPU, and system resources
 */
export class ResourceMonitor extends EventEmitter {
  public readonly config: Required<ResourceMonitorConfig>;

  private monitoringTimer?: NodeJS.Timeout;

  private previousCpuUsage?: NodeJS.CpuUsage;

  private statsHistory: ResourceStats[] = [];

  private lastEventLoopCheck = performance.now();

  constructor(config: ResourceMonitorConfig = {}) {
    super();

    this.config = {
      memoryThreshold: config.memoryThreshold ?? 512,
      cpuThreshold: config.cpuThreshold ?? 80,
      heapThreshold: config.heapThreshold ?? 90,
      monitoringInterval: config.monitoringInterval ?? 5000,
      enableAlerts: config.enableAlerts ?? true,
      enableLogging: config.enableLogging ?? false,
      historySize: config.historySize ?? 100,
    };
  }

  /**
   * Start resource monitoring
   */
  start(): void {
    if (this.monitoringTimer) {
      logger.warn('Resource monitor already running');
      return;
    }

    logger.info('Starting resource monitor', {
      memoryThreshold: `${this.config.memoryThreshold}MB`,
      cpuThreshold: `${this.config.cpuThreshold}%`,
      heapThreshold: `${this.config.heapThreshold}%`,
      interval: `${this.config.monitoringInterval}ms`,
    });

    // Initialize CPU usage tracking
    this.previousCpuUsage = process.cpuUsage();

    this.monitoringTimer = setInterval(() => {
      this.updateStats();
    }, this.config.monitoringInterval);

    // Initial stats collection
    this.updateStats();
  }

  /**
   * Stop resource monitoring
   */
  stop(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
      logger.info('Resource monitor stopped');
    }
  }

  /**
   * Get current resource statistics
   */
  getCurrentStats(): ResourceStats {
    return { memory: this.getMemoryStats(), cpu: this.getCpuStats(), uptime: process.uptime(), eventLoopDelay: this.getEventLoopDelay(), // @ts-ignore - Internal Node.js methods for debugging purposes, activeHandles: process._getActiveHandles?.()?.length ?? 0, // @ts-ignore - Internal Node.js methods for debugging purposes, activeRequests: process._getActiveRequests?.()?.length ?? 0 };
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();

    return { rss: memUsage.rss, heapTotal: memUsage.heapTotal, heapUsed: memUsage.heapUsed, external: memUsage.external, arrayBuffers: memUsage.arrayBuffers, heapUtilization: (memUsage.heapUsed / memUsage.heapTotal) * 100, timestamp: new Date() };
  }

  /**
   * Get CPU usage statistics
   */
  getCpuStats(): CpuStats {
    const cpuUsage = process.cpuUsage(this.previousCpuUsage);
    this.previousCpuUsage = process.cpuUsage();

    const totalUsage = cpuUsage.user + cpuUsage.system;
    const intervalMs = this.config.monitoringInterval;
    const intervalMicros = intervalMs * 1000;

    // Calculate CPU utilization as percentage
    const utilization = Math.min((totalUsage / intervalMicros) * 100, 100);

    return { user: cpuUsage.user, system: cpuUsage.system, utilization: Number.isNaN(utilization) ? 0 : utilization, timestamp: new Date() };
  }

  /**
   * Get event loop delay
   */
  private getEventLoopDelay(): number {
    const now = performance.now();
    const delay = now - this.lastEventLoopCheck - this.config.monitoringInterval;
    this.lastEventLoopCheck = now;
    return Math.max(0, delay);
  }

  /**
   * Update and analyze resource statistics
   */
  private updateStats(): void {
    const stats = this.getCurrentStats();

    // Add to history
    this.statsHistory.push(stats);
    if (this.statsHistory.length > this.config.historySize) {
      this.statsHistory.shift();
    }

    // Emit stats updated event
    this.emit('stats-updated', stats);

    // Check thresholds and emit alerts
    if (this.config.enableAlerts) {
      this.checkThresholds(stats);
    }

    // Detect memory leaks
    this.detectMemoryLeaks();

    // Log stats if enabled
    if (this.config.enableLogging) {
      this.logStats(stats);
    }
  }

  /**
   * Check resource thresholds and emit alerts
   */
  private checkThresholds(stats: ResourceStats): void {
    // Memory threshold (RSS in MB)
    const memoryMB = stats.memory.rss / 1024 / 1024;
    if (memoryMB > this.config.memoryThreshold) {
      this.emit('memory-threshold', stats.memory);
      logger.warn('Memory threshold exceeded', {
        current: `${memoryMB.toFixed(2)}MB`,
        threshold: `${this.config.memoryThreshold}MB`,
        heapUsed: `${(stats.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      });
    }

    // CPU threshold
    if (stats.cpu.utilization > this.config.cpuThreshold) {
      this.emit('cpu-threshold', stats.cpu);
      logger.warn('CPU threshold exceeded', {
        current: `${stats.cpu.utilization.toFixed(2)}%`,
        threshold: `${this.config.cpuThreshold}%`,
      });
    }

    // Heap threshold
    if (stats.memory.heapUtilization > this.config.heapThreshold) {
      this.emit('heap-threshold', stats.memory);
      logger.warn('Heap threshold exceeded', {
        current: `${stats.memory.heapUtilization.toFixed(2)}%`,
        threshold: `${this.config.heapThreshold}%`,
        heapUsed: `${(stats.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(stats.memory.heapTotal / 1024 / 1024).toFixed(2)}MB`,
      });
    }
  }

  /**
   * Detect potential memory leaks
   */
  private detectMemoryLeaks(): void {
    if (this.statsHistory.length < 10) return;

    // Get last 10 memory readings
    const recentMemory = this.statsHistory.slice(-10).map(stats => stats.memory.heapUsed);

    // Calculate trend (simple linear regression slope)
    const n = recentMemory.length;
    const sumX = (n * (n - 1)) / 2; // Sum of indices 0,1,2...n-1
    const sumY = recentMemory.reduce((a, b) => a + b, 0);
    const sumXY = recentMemory.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squares 0²+1²+2²...

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // If slope is significantly positive, we might have a memory leak
    const slopeThreshold = 1024 * 1024; // 1MB per measurement
    if (slope > slopeThreshold) {
      this.emit('memory-leak-detected', recentMemory);
      logger.warn('Potential memory leak detected', {
        trend: `+${(slope / 1024 / 1024).toFixed(2)}MB per measurement`,
        recentMemoryMB: recentMemory.map(m => (m / 1024 / 1024).toFixed(2)),
      });
    }
  }

  /**
   * Log current resource statistics
   */
  private logStats(stats: ResourceStats): void {
    logger.info('Resource usage', {
      memory: {
        rss: `${(stats.memory.rss / 1024 / 1024).toFixed(2)}MB`,
        heap: `${(stats.memory.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(stats.memory.heapTotal / 1024 / 1024).toFixed(2)}MB (${stats.memory.heapUtilization.toFixed(1)}%)`,
        external: `${(stats.memory.external / 1024 / 1024).toFixed(2)}MB`,
      },
      cpu: {
        utilization: `${stats.cpu.utilization.toFixed(2)}%`,
        user: `${(stats.cpu.user / 1000).toFixed(2)}ms`,
        system: `${(stats.cpu.system / 1000).toFixed(2)}ms`,
      },
      system: {
        uptime: `${stats.uptime.toFixed(2)}s`,
        eventLoopDelay: `${stats.eventLoopDelay.toFixed(2)}ms`,
        activeHandles: stats.activeHandles,
        activeRequests: stats.activeRequests,
      },
    });
  }

  /**
   * Get resource usage history
   */
  getHistory(): ResourceStats[] {
    return [...this.statsHistory];
  }

  /**
   * Get resource usage summary
   */
  getSummary(): {
    current: ResourceStats;
    average: Partial<ResourceStats>;
    peak: Partial<ResourceStats>;
    memoryTrend: 'increasing' | 'decreasing' | 'stable';
  } {
    if (this.statsHistory.length === 0) {
      const current = this.getCurrentStats();
      return { current, average: current, peak: current, memoryTrend: 'stable' };
    }

    const current = this.statsHistory[this.statsHistory.length - 1];

    // Calculate averages
    const memorySum = this.statsHistory.reduce(
      (sum, stat) => ({
        rss: sum.rss + stat.memory.rss,
        heapUsed: sum.heapUsed + stat.memory.heapUsed,
        heapTotal: sum.heapTotal + stat.memory.heapTotal,
      }),
      { rss: 0, heapUsed: 0, heapTotal: 0 }
    );

    const cpuSum = this.statsHistory.reduce((sum, stat) => sum + stat.cpu.utilization, 0);

    const count = this.statsHistory.length;

    // Calculate peaks
    const peakMemory = this.statsHistory.reduce(
      (peak, stat) => ({
        rss: Math.max(peak.rss, stat.memory.rss),
        heapUsed: Math.max(peak.heapUsed, stat.memory.heapUsed),
        heapTotal: Math.max(peak.heapTotal, stat.memory.heapTotal),
      }),
      { rss: 0, heapUsed: 0, heapTotal: 0 }
    );

    const peakCpu = Math.max(...this.statsHistory.map(stat => stat.cpu.utilization));

    // Determine memory trend
    const recentMemory = this.statsHistory.slice(-5).map(stat => stat.memory.heapUsed);
    const firstHalf = recentMemory.slice(0, Math.floor(recentMemory.length / 2));
    const secondHalf = recentMemory.slice(Math.floor(recentMemory.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const memoryTrend: 'increasing' | 'decreasing' | 'stable' =
      secondAvg > firstAvg * 1.1
        ? 'increasing'
        : secondAvg < firstAvg * 0.9
          ? 'decreasing'
          : 'stable';

    return { current, average: {, memory: {, rss: memorySum.rss / count, heapUsed: memorySum.heapUsed / count, heapTotal: memorySum.heapTotal / count, heapUtilization: (memorySum.heapUsed / memorySum.heapTotal) * 100, timestamp: new Date() } as MemoryStats,
        cpu: {
          utilization: cpuSum / count,
          timestamp: new Date(),
        } as CpuStats,
      },
      peak: {
        memory: {
          rss: peakMemory.rss,
          heapUsed: peakMemory.heapUsed,
          heapTotal: peakMemory.heapTotal,
          heapUtilization: (peakMemory.heapUsed / peakMemory.heapTotal) * 100,
          timestamp: new Date(),
        } as MemoryStats,
        cpu: {
          utilization: peakCpu,
          timestamp: new Date(),
        } as CpuStats,
      },
      memoryTrend,
    };
  }

  /**
   * Force garbage collection if available and log results
   */
  forceGarbageCollection(): MemoryStats | null {
    if (!global.gc) {
      logger.warn('Garbage collection not available (run with --expose-gc)');
      return null;
    }

    const beforeStats = this.getMemoryStats();
    global.gc();
    const afterStats = this.getMemoryStats();

    const freed = beforeStats.heapUsed - afterStats.heapUsed;

    logger.info('Garbage collection completed', {
      freedMemory: `${(freed / 1024 / 1024).toFixed(2)}MB`,
      beforeHeap: `${(beforeStats.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      afterHeap: `${(afterStats.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      heapReduction: `${((freed / beforeStats.heapUsed) * 100).toFixed(2)}%`,
    });

    return afterStats;
  }

  /**
   * Check if monitoring is currently active
   */
  isMonitoring(): boolean {
    return this.monitoringTimer !== undefined;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.statsHistory = [];
  }
}

/**
 * Global resource monitor instance
 */
export const resourceMonitor = new ResourceMonitor({
  enableAlerts: true,
  enableLogging: false, // Enable in debug mode only
});

/**
 * Convenience function to get current memory usage
 */
export function getMemoryUsage(): {
  rss: string;
  heap: string;
  external: string;
  utilization: string;
} {
  const stats = resourceMonitor.getMemoryStats();

  return { rss: `${(stats.rss / 1024 / 1024).toFixed(2) }MB`,
    heap: `${(stats.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(stats.heapTotal / 1024 / 1024).toFixed(2)}MB`,
    external: `${(stats.external / 1024 / 1024).toFixed(2)}MB`,
    utilization: `${stats.heapUtilization.toFixed(1)}%`,
  };
}

/**
 * Higher-order function to track resource usage for operations
 */
export function trackResourceUsage<Args extends unknown[], Return>(
  operationName: string,
  operation: (...args: Args) => Promise<Return> | Return,
  options?: {
    logResults?: boolean;
    trackMemoryDelta?: boolean;
  }
): (...args: Args) => Promise<Return> {
  return async (...args: Args): Promise<Return> => {
    const startStats = resourceMonitor.getCurrentStats();
    const startTime = performance.now();

    try {
      const result = await operation(...args);
      const endTime = performance.now();
      const endStats = resourceMonitor.getCurrentStats();

      const duration = endTime - startTime;
      const memoryDelta = endStats.memory.heapUsed - startStats.memory.heapUsed;

      if (options?.logResults) {
        logger.info(`Resource usage for ${operationName}`, {
          duration: `${duration.toFixed(2)}ms`,
          memoryBefore: `${(startStats.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          memoryAfter: `${(endStats.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          memoryDelta: `${memoryDelta >= 0 ? '+' : ''}${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
          cpuBefore: `${startStats.cpu.utilization.toFixed(2)}%`,
          cpuAfter: `${endStats.cpu.utilization.toFixed(2)}%`,
        });
      }

      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      logger.error(`Resource tracking failed for ${operationName}`, {
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  };
}

/**
 * Initialize resource monitoring with default settings
 */
export function initializeResourceMonitoring(config?: ResourceMonitorConfig): void {
  if (config) {
    resourceMonitor.stop();
    Object.assign(resourceMonitor.config, config);
  }

  // Set up alert handlers
  resourceMonitor.on('memory-threshold', stats => {
    logger.warn(`Memory usage high: ${(stats.rss / 1024 / 1024).toFixed(2)}MB`);
  });

  resourceMonitor.on('memory-leak-detected', trend => {
    logger.error('Potential memory leak detected', {
      trend: trend.map((m: number) => (m / 1024 / 1024).toFixed(2)),
    });
  });

  resourceMonitor.start();

  logger.info('Resource monitoring initialized', {
    memoryThreshold: `${resourceMonitor.config.memoryThreshold}MB`,
    cpuThreshold: `${resourceMonitor.config.cpuThreshold}%`,
    heapThreshold: `${resourceMonitor.config.heapThreshold}%`,
  });
}
