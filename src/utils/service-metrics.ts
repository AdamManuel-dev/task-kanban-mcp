/**
 * @fileoverview Service performance metrics and monitoring utilities
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Method performance tracking, service-level metrics, decorators, statistics
 * Main APIs: @TrackPerformance decorator, ServiceMetrics class, collectServiceMetrics()
 * Constraints: Uses reflection metadata, requires decorator support
 * Patterns: Decorator pattern, metrics collection, performance monitoring
 */

import { performance } from 'perf_hooks';
import { logger } from './logger';

export interface ServiceMethodMetrics {
  methodName: string;
  serviceName: string;
  callCount: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  errorCount: number;
  lastCalled: number;
  recentCalls: Array<{
    timestamp: number;
    duration: number;
    success: boolean;
    error?: string;
  }>;
}

export interface ServiceOverallMetrics {
  serviceName: string;
  totalCalls: number;
  totalTime: number;
  averageTime: number;
  errorRate: number;
  methodMetrics: Map<string, ServiceMethodMetrics>;
  healthScore: number;
  lastActive: number;
}

class ServiceMetricsCollector {
  private readonly metrics = new Map<string, ServiceOverallMetrics>();

  private readonly maxRecentCalls = 100;

  /**
   * Record a method call
   */
  recordMethodCall(
    serviceName: string,
    methodName: string,
    duration: number,
    success: boolean,
    error?: Error
  ): void {
    const serviceKey = serviceName;
    const methodKey = `${serviceName}.${methodName}`;

    // Initialize service metrics if not exists
    if (!this.metrics.has(serviceKey)) {
      this.metrics.set(serviceKey, {
        serviceName,
        totalCalls: 0,
        totalTime: 0,
        averageTime: 0,
        errorRate: 0,
        methodMetrics: new Map(),
        healthScore: 100,
        lastActive: Date.now(),
      });
    }

    const serviceMetrics = this.metrics.get(serviceKey)!;

    // Initialize method metrics if not exists
    if (!serviceMetrics.methodMetrics.has(methodName)) {
      serviceMetrics.methodMetrics.set(methodName, {
        methodName,
        serviceName,
        callCount: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        errorCount: 0,
        lastCalled: Date.now(),
        recentCalls: [],
      });
    }

    const methodMetrics = serviceMetrics.methodMetrics.get(methodName)!;

    // Update method metrics
    methodMetrics.callCount++;
    methodMetrics.totalTime += duration;
    methodMetrics.averageTime = methodMetrics.totalTime / methodMetrics.callCount;
    methodMetrics.minTime = Math.min(methodMetrics.minTime, duration);
    methodMetrics.maxTime = Math.max(methodMetrics.maxTime, duration);
    methodMetrics.lastCalled = Date.now();

    if (!success) {
      methodMetrics.errorCount++;
    }

    // Add to recent calls (keep only last N calls)
    methodMetrics.recentCalls.push({
      timestamp: Date.now(),
      duration,
      success,
      error: error?.message,
    });

    if (methodMetrics.recentCalls.length > this.maxRecentCalls) {
      methodMetrics.recentCalls.shift();
    }

    // Update service-level metrics
    serviceMetrics.totalCalls++;
    serviceMetrics.totalTime += duration;
    serviceMetrics.averageTime = serviceMetrics.totalTime / serviceMetrics.totalCalls;
    serviceMetrics.lastActive = Date.now();

    // Calculate error rate
    const totalErrors = Array.from(serviceMetrics.methodMetrics.values()).reduce(
      (sum, method) => sum + method.errorCount,
      0
    );
    serviceMetrics.errorRate = (totalErrors / serviceMetrics.totalCalls) * 100;

    // Calculate health score (100 - error rate - response time penalty)
    const responseTimePenalty = Math.min(serviceMetrics.averageTime / 10, 50); // Max 50 points penalty
    serviceMetrics.healthScore = Math.max(0, 100 - serviceMetrics.errorRate - responseTimePenalty);

    // Log performance issues
    if (duration > 5000) {
      // 5 seconds
      logger.warn('Slow service method detected', {
        service: serviceName,
        method: methodName,
        duration,
        averageTime: methodMetrics.averageTime,
      });
    }

    if (!success) {
      logger.warn('Service method error', {
        service: serviceName,
        method: methodName,
        error: error?.message,
        errorCount: methodMetrics.errorCount,
        errorRate: (methodMetrics.errorCount / methodMetrics.callCount) * 100,
      });
    }
  }

  /**
   * Get metrics for a specific service
   */
  getServiceMetrics(serviceName: string): ServiceOverallMetrics | undefined {
    return this.metrics.get(serviceName);
  }

  /**
   * Get all service metrics
   */
  getAllMetrics(): Map<string, ServiceOverallMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Get top performing services
   */
  getTopPerformingServices(limit = 10): ServiceOverallMetrics[] {
    return Array.from(this.metrics.values())
      .sort((a, b) => b.healthScore - a.healthScore)
      .slice(0, limit);
  }

  /**
   * Get slowest services
   */
  getSlowestServices(limit = 10): ServiceOverallMetrics[] {
    return Array.from(this.metrics.values())
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, limit);
  }

  /**
   * Get services with highest error rates
   */
  getHighestErrorRateServices(limit = 10): ServiceOverallMetrics[] {
    return Array.from(this.metrics.values())
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, limit);
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics.clear();
    logger.info('Service metrics reset');
  }

  /**
   * Generate summary report
   */
  generateSummaryReport(): {
    totalServices: number;
    totalCalls: number;
    averageHealthScore: number;
    overallErrorRate: number;
    overallAverageTime: number;
    topServices: ServiceOverallMetrics[];
    problematicServices: ServiceOverallMetrics[];
  } {
    const services = Array.from(this.metrics.values());
    const totalCalls = services.reduce((sum, s) => sum + s.totalCalls, 0);
    const totalErrors = services.reduce((sum, s) => sum + (s.totalCalls * s.errorRate) / 100, 0);
    const totalTime = services.reduce((sum, s) => sum + s.totalTime, 0);

    return {
      totalServices: services.length,
      totalCalls,
      averageHealthScore:
        services.reduce((sum, s) => sum + s.healthScore, 0) / services.length ?? 0,
      overallErrorRate: totalCalls > 0 ? (totalErrors / totalCalls) * 100 : 0,
      overallAverageTime: totalCalls > 0 ? totalTime / totalCalls : 0,
      topServices: this.getTopPerformingServices(5),
      problematicServices: services
        .filter(s => s.errorRate > 5 || s.averageTime > 2000)
        .sort((a, b) => a.healthScore - b.healthScore)
        .slice(0, 5),
    };
  }
}

// Global metrics collector instance
export const serviceMetricsCollector = new ServiceMetricsCollector();

/**
 * Decorator to track performance of service methods
 */
export function TrackPerformance(serviceName?: string) {
  return function <T>(target: T, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    if (!descriptor || !descriptor.value) {
      return descriptor;
    }
    const originalMethod = descriptor.value;
    const actualServiceName = serviceName || (target && typeof target === 'object' && target.constructor?.name) || 'Unknown';

    descriptor.value = async function (this: T, ...args: unknown[]) {
      const startTime = performance.now();
      let success = true;
      let error: Error | undefined;

      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } catch (err) {
        success = false;
        error = err instanceof Error ? err : new Error(String(err));
        throw err;
      } finally {
        const endTime = performance.now();
        const duration = endTime - startTime;

        serviceMetricsCollector.recordMethodCall(
          actualServiceName,
          propertyKey,
          duration,
          success,
          error
        );

        logger.debug('Method performance tracked', {
          service: actualServiceName,
          method: propertyKey,
          duration,
          success,
          error: error?.message,
        });
      }
    };

    return descriptor;
  };
}

/**
 * Manual performance tracking for non-decorated methods
 */
export async function trackMethodPerformance<T>(
  serviceName: string,
  methodName: string,
  operation: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();
  let success = true;
  let error: Error | undefined;

  try {
    const result = await operation();
    return result;
  } catch (err) {
    success = false;
    error = err instanceof Error ? err : new Error(String(err));
    throw err;
  } finally {
    const endTime = performance.now();
    const duration = endTime - startTime;

    serviceMetricsCollector.recordMethodCall(serviceName, methodName, duration, success, error);
  }
}

/**
 * Get formatted metrics for logging or display
 */
export function formatServiceMetrics(serviceName: string): string {
  const metrics = serviceMetricsCollector.getServiceMetrics(serviceName);
  if (!metrics) {
    return `No metrics available for service: ${serviceName}`;
  }

  const methodStats = Array.from(metrics.methodMetrics.entries())
    .map(
      ([name, stats]) =>
        `${name}: ${stats.callCount} calls, ${stats.averageTime.toFixed(2)}ms avg, ${((stats.errorCount / stats.callCount) * 100).toFixed(1)}% errors`
    )
    .join('\n  ');

  return `Service: ${serviceName}
  Health Score: ${metrics.healthScore.toFixed(1)}/100
  Total Calls: ${metrics.totalCalls}
  Average Time: ${metrics.averageTime.toFixed(2)}ms
  Error Rate: ${metrics.errorRate.toFixed(2)}%
  Methods:
  ${methodStats}`;
}

/**
 * Middleware to automatically collect HTTP request metrics
 */
export function createMetricsMiddleware(serviceName = 'HTTP') {
  return (req: unknown, res: unknown, next: unknown) => {
    const startTime = performance.now();

    // Type guard for Express request/response objects
    if (!req || typeof req !== 'object' || !res || typeof res !== 'object' || typeof next !== 'function') {
      if (typeof next === 'function') next();
      return;
    }

    const request = req as { method?: string; route?: { path?: string }; path?: string };
    const response = res as { statusCode?: number; on?: (event: string, callback: () => void) => void };

    if (typeof response.on === 'function') {
      response.on('finish', () => {
        const duration = performance.now() - startTime;
        const success = (response.statusCode || 500) < 400;
        const methodName = `${request.method || 'UNKNOWN'} ${request.route?.path || request.path || 'UNKNOWN'}`;

        serviceMetricsCollector.recordMethodCall(
          serviceName,
          methodName,
          duration,
          success,
          success ? undefined : new Error(`HTTP ${response.statusCode || 500}`)
        );
      });
    }

    next();
  };
}

/**
 * Export metrics in Prometheus format
 */
export function exportPrometheusMetrics(): string {
  const allMetrics = serviceMetricsCollector.getAllMetrics();
  const lines: string[] = [];

  // Service call count
  lines.push('# HELP service_calls_total Total number of service method calls');
  lines.push('# TYPE service_calls_total counter');

  // Service response time
  lines.push('# HELP service_response_time_seconds Service method response time');
  lines.push('# TYPE service_response_time_seconds histogram');

  // Service error rate
  lines.push('# HELP service_error_rate Service method error rate percentage');
  lines.push('# TYPE service_error_rate gauge');

  for (const [serviceName, serviceMetrics] of allMetrics) {
    for (const [methodName, methodMetrics] of serviceMetrics.methodMetrics) {
      const labels = `service="${serviceName}",method="${methodName}"`;

      lines.push(`service_calls_total{${labels}} ${methodMetrics.callCount}`);
      lines.push(`service_response_time_seconds{${labels}} ${methodMetrics.averageTime / 1000}`);
      lines.push(
        `service_error_rate{${labels}} ${(methodMetrics.errorCount / methodMetrics.callCount) * 100}`
      );
    }
  }

  return lines.join('\n');
}

// Periodic metrics reporting
let metricsReportingInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic metrics reporting
 */
export function startMetricsReporting(intervalMs = 300000): void {
  // 5 minutes default
  if (metricsReportingInterval) {
    clearInterval(metricsReportingInterval);
  }

  metricsReportingInterval = setInterval(() => {
    const summary = serviceMetricsCollector.generateSummaryReport();
    logger.info('Service metrics summary', summary);
  }, intervalMs);

  logger.info('Started periodic service metrics reporting', { intervalMs });
}

/**
 * Stop periodic metrics reporting
 */
export function stopMetricsReporting(): void {
  if (metricsReportingInterval) {
    clearInterval(metricsReportingInterval);
    metricsReportingInterval = null;
    logger.info('Stopped periodic service metrics reporting');
  }
}
