/**
 * Performance Monitoring Service
 * Tracks API performance, database metrics, system health, and provides real-time monitoring
 */

import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';
import { dbConnection } from '@/database/connection';
import type { Request, Response, NextFunction } from 'express';

export interface PerformanceMetrics {
  timestamp: number;
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
  dbQueryCount: number;
  dbQueryTime: number;
  userAgent?: string;
  userId?: string;
  error?: string;
}

export interface SystemHealthMetrics {
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  activeConnections: number;
  requestsPerMinute: number;
  errorRate: number;
  averageResponseTime: number;
  databaseHealth: {
    connectionPoolSize: number;
    activeQueries: number;
    averageQueryTime: number;
    slowQueries: number;
  };
  websocketConnections: number;
  rateLimitHits: number;
}

export interface EndpointStats {
  count: number;
  totalTime: number;
  errors: number;
}

export interface PerformanceDashboard {
  overview: {
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    uptime: number;
    healthScore: number; // 0-100
  };
  realtime: {
    requestsPerSecond: number;
    activeUsers: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  trends: {
    responseTimeTrend: Array<{ timestamp: number; value: number }>;
    errorRateTrend: Array<{ timestamp: number; value: number }>;
    throughputTrend: Array<{ timestamp: number; value: number }>;
  };
  topEndpoints: Array<{
    endpoint: string;
    requests: number;
    averageTime: number;
    errorRate: number;
  }>;
  slowQueries: Array<{
    query: string;
    averageTime: number;
    count: number;
    lastSeen: number;
  }>;
  alerts: Array<{
    type: 'warning' | 'error' | 'critical';
    message: string;
    timestamp: number;
    resolved: boolean;
  }>;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: {
    metric: string;
    operator: '>' | '<' | '=' | '>=' | '<=';
    threshold: number;
    duration: number; // seconds
  };
  severity: 'warning' | 'error' | 'critical';
  action: 'log' | 'email' | 'webhook';
  enabled: boolean;
}

export class PerformanceMonitoringService extends EventEmitter {
  private static instance: PerformanceMonitoringService;

  private metrics: PerformanceMetrics[] = [];

  private readonly alertRules: AlertRule[] = [];

  private readonly alertStates = new Map<string, { triggered: boolean; since: number }>();

  private readonly startTime = Date.now();

  private readonly requestCounts = new Map<string, number>();

  private readonly responseTimes = new Map<string, number[]>();

  private readonly errorCounts = new Map<string, number>();

  private cleanupInterval: NodeJS.Timeout | null = null;

  private readonly metricsRetentionMs = 24 * 60 * 60 * 1000; // 24 hours

  private readonly dbQueryTracker = new Map<string, { count: number; totalTime: number }>();

  public static getInstance(): PerformanceMonitoringService {
    if (!PerformanceMonitoringService.instance) {
      PerformanceMonitoringService.instance = new PerformanceMonitoringService();
    }
    return PerformanceMonitoringService.instance;
  }

  constructor() {
    super();
    this.setupDefaultAlerts();
    this.startCleanup();
    this.startSystemMonitoring();
  }

  /**
   * Express middleware for performance tracking
   */
  trackPerformance(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction): void => {
      const startTime = Date.now();
      const startCpuUsage = process.cpuUsage();
      let dbQueryCount = 0;
      let dbQueryTime = 0;

      // Track database queries
      const originalQuery = dbConnection.query.bind(dbConnection);
      dbConnection.query = async function <T = unknown>(
        sql: string,
        params?: unknown
      ): Promise<T[]> {
        const queryStart = Date.now();
        dbQueryCount++;
        try {
          const result = (await originalQuery.call(this, sql, params)) as T[];
          const queryTime = Date.now() - queryStart;
          dbQueryTime += queryTime;
          // @ts-ignore - Optional global tracking function for debugging
          globalThis.trackDbQuery?.(String(sql), queryTime);
          return result;
        } catch (error) {
          const queryTime = Date.now() - queryStart;
          dbQueryTime += queryTime;
          throw error;
        }
      };

      // Capture response
      const originalSend = res.send;
      res.send = function captureResponseMetrics(body: unknown) {
        const responseTime = Date.now() - startTime;
        const endCpuUsage = process.cpuUsage(startCpuUsage);

        // Restore original query method
        dbConnection.query = originalQuery;

        const metric: PerformanceMetrics = {
          timestamp: Date.now(),
          endpoint: `${req.method} ${req.route?.path || req.path}`,
          method: req.method,
          responseTime,
          statusCode: res.statusCode,
          memoryUsage: process.memoryUsage(),
          cpuUsage: endCpuUsage,
          dbQueryCount,
          dbQueryTime,
          userAgent: req.get('User-Agent') ?? '',
          userId: (req as unknown).user?.id || '',
          error: res.statusCode >= 400 ? String(body) : '',
        };

        PerformanceMonitoringService.getInstance().recordMetric(metric);
        return originalSend.call(this, body);
      };

      next();
    };
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    this.updateAggregates(metric);
    this.checkAlerts(metric);
    this.emit('metric', metric);

    // Log slow requests
    if (metric.responseTime > 1000) {
      logger.warn('Slow request detected', {
        endpoint: metric.endpoint,
        responseTime: metric.responseTime,
        dbQueryTime: metric.dbQueryTime,
        dbQueryCount: metric.dbQueryCount,
      });
    }

    // Log errors
    if (metric.statusCode >= 400) {
      logger.error('Request error', {
        endpoint: metric.endpoint,
        statusCode: metric.statusCode,
        error: metric.error,
        userId: metric.userId,
      });
    }
  }

  /**
   * Get current system health metrics
   */
  getSystemHealth(): SystemHealthMetrics {
    const now = Date.now();
    const recentMetrics = this.metrics.filter(m => now - m.timestamp < 60000); // Last minute
    const totalRequests = recentMetrics.length;
    const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;
    const avgResponseTime =
      totalRequests > 0
        ? recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests
        : 0;

    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return { uptime: Date.now() - this.startTime, memoryUsage, cpuUsage, activeConnections: this.getActiveConnections(), requestsPerMinute: totalRequests, errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0, averageResponseTime: avgResponseTime, databaseHealth: this.getDatabaseHealth(), websocketConnections: this.getWebSocketConnections(), rateLimitHits: this.getRateLimitHits() };
  }

  /**
   * Get performance dashboard data
   */
  getDashboard(): PerformanceDashboard {
    const now = Date.now();
    const last24h = this.metrics.filter(m => now - m.timestamp < 24 * 60 * 60 * 1000);
    const totalRequests = last24h.length;
    const errorCount = last24h.filter(m => m.statusCode >= 400).length;
    const avgResponseTime =
      totalRequests > 0 ? last24h.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests : 0;

    const healthScore = this.calculateHealthScore();

    // Calculate trends (hourly buckets for last 24 hours)
    const trends = this.calculateTrends(last24h);

    // Top endpoints analysis
    const endpointStats = this.analyzeEndpoints(last24h);
    const topEndpoints = Object.entries(endpointStats)
      .map(([endpoint, stats]: [string, unknown]) => ({
        endpoint,
        requests: stats.count,
        averageTime: stats.totalTime / stats.count,
        errorRate: (stats.errors / stats.count) * 100,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    // Slow queries
    const slowQueries = Array.from(this.dbQueryTracker.entries())
      .map(([query, stats]) => ({
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        averageTime: stats.totalTime / stats.count,
        count: stats.count,
        lastSeen: now, // Simplified for now
      }))
      .filter(q => q.averageTime > 100) // Queries slower than 100ms
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 10);

    // Active alerts
    const alerts = Array.from(this.alertStates.entries())
      .filter(([, state]) => state.triggered)
      .map(([ruleId, state]) => {
        const rule = this.alertRules.find(r => r.id === ruleId);
        return { type: rule?.severity ?? ('warning' as const), message: rule?.name ?? `Alert ${ruleId }`,
          timestamp: state.since,
          resolved: false,
        };
      });

    return { overview: {, totalRequests, averageResponseTime: avgResponseTime, errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0, uptime: Date.now() - this.startTime, healthScore },
      realtime: {
        requestsPerSecond: this.getRequestsPerSecond(),
        activeUsers: this.getActiveUsers(),
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
        cpuUsage: this.getCpuUsagePercent(),
      },
      trends,
      topEndpoints,
      slowQueries,
      alerts,
    };
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
    logger.info('Alert rule added', { ruleId: rule.id, name: rule.name });
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): boolean {
    const index = this.alertRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.alertRules.splice(index, 1);
      this.alertStates.delete(ruleId);
      logger.info('Alert rule removed', { ruleId });
      return true;
    }
    return false;
  }

  /**
   * Get performance metrics for a specific endpoint
   */
  getEndpointMetrics(endpoint: string, timeframe = 3600000): PerformanceMetrics[] {
    const now = Date.now();
    return this.metrics.filter(m => m.endpoint === endpoint && now - m.timestamp < timeframe);
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(format: 'prometheus' | 'json' = 'json'): string {
    if (format === 'prometheus') {
      return this.exportPrometheusMetrics();
    }

    const systemHealth = this.getSystemHealth();
    const dashboard = this.getDashboard();

    return JSON.stringify(
      {
        timestamp: Date.now(),
        systemHealth,
        dashboard,
        recentMetrics: this.metrics.slice(-100), // Last 100 requests
      },
      null,
      2
    );
  }

  // Private methods

  private updateAggregates(metric: PerformanceMetrics): void {
    const key = metric.endpoint;

    // Update request counts
    this.requestCounts.set(key, (this.requestCounts.get(key) ?? 0) + 1);

    // Update response times
    const times = this.responseTimes.get(key) ?? [];
    times.push(metric.responseTime);
    if (times.length > 1000) times.shift(); // Keep last 1000 measurements
    this.responseTimes.set(key, times);

    // Update error counts
    if (metric.statusCode >= 400) {
      this.errorCounts.set(key, (this.errorCounts.get(key) ?? 0) + 1);
    }
  }

  private checkAlerts(metric: PerformanceMetrics): void {
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      const shouldTrigger = this.evaluateAlertCondition(rule, metric);
      const currentState = this.alertStates.get(rule.id);

      if (shouldTrigger && !currentState?.triggered) {
        this.triggerAlert(rule);
      } else if (!shouldTrigger && currentState?.triggered) {
        this.resolveAlert(rule);
      }
    }
  }

  private evaluateAlertCondition(rule: AlertRule, metric: PerformanceMetrics): boolean {
    let value: number;

    switch (rule.condition.metric) {
      case 'responseTime':
        value = metric.responseTime;
        break;
      case 'errorRate':
        const recentMetrics = this.metrics.filter(
          m => Date.now() - m.timestamp < rule.condition.duration * 1000
        );
        const errors = recentMetrics.filter(m => m.statusCode >= 400).length;
        value = recentMetrics.length > 0 ? (errors / recentMetrics.length) * 100 : 0;
        break;
      case 'memoryUsage':
        value = metric.memoryUsage.heapUsed / 1024 / 1024; // MB
        break;
      case 'dbQueryTime':
        value = metric.dbQueryTime;
        break;
      default:
        return false;
    }

    const operators = {
      '>': (v: number, t: number) => v > t,
      '<': (v: number, t: number) => v < t,
      '>=': (v: number, t: number) => v >= t,
      '<=': (v: number, t: number) => v <= t,
      '=': (v: number, t: number) => v === t,
    };

    const compareFn = operators[rule.condition.operator];
    return compareFn ? compareFn(value, rule.condition.threshold) : false;
  }

  private triggerAlert(rule: AlertRule): void {
    this.alertStates.set(rule.id, { triggered: true, since: Date.now() });

    const alertMessage = `Alert triggered: ${rule.name}`;
    logger.warn(alertMessage, { rule });

    this.emit('alert', {
      rule,
      triggered: true,
      timestamp: Date.now(),
    });

    // Execute alert action
    switch (rule.action) {
      case 'log':
        logger.error(`ALERT: ${rule.name}`, { rule });
        break;
      case 'email':
        // Would integrate with email service
        break;
      case 'webhook':
        // Would call webhook URL
        break;
    }
  }

  private resolveAlert(rule: AlertRule): void {
    this.alertStates.set(rule.id, { triggered: false, since: Date.now() });

    logger.info(`Alert resolved: ${rule.name}`, { rule });

    this.emit('alert', {
      rule,
      triggered: false,
      timestamp: Date.now(),
    });
  }

  private trackDbQuery(query: string, time: number): void {
    const key = query.replace(/\s+/g, ' ').trim();
    const stats = this.dbQueryTracker.get(key) ?? { count: 0, totalTime: 0 };
    stats.count++;
    stats.totalTime += time;
    this.dbQueryTracker.set(key, stats);
  }

  private setupDefaultAlerts(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high_response_time',
        name: 'High Response Time',
        condition: { metric: 'responseTime', operator: '>', threshold: 2000, duration: 60 },
        severity: 'warning',
        action: 'log',
        enabled: true,
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        condition: { metric: 'errorRate', operator: '>', threshold: 10, duration: 300 },
        severity: 'error',
        action: 'log',
        enabled: true,
      },
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        condition: { metric: 'memoryUsage', operator: '>', threshold: 512, duration: 60 },
        severity: 'critical',
        action: 'log',
        enabled: true,
      },
    ];

    this.alertRules.push(...defaultRules);
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - this.metricsRetentionMs;
      this.metrics = this.metrics.filter(m => m.timestamp > cutoff);

      // Clean up aggregates for old endpoints
      const activeEndpoints = new Set(this.metrics.map(m => m.endpoint));
      for (const [endpoint] of this.requestCounts.entries()) {
        if (!activeEndpoints.has(endpoint)) {
          this.requestCounts.delete(endpoint);
          this.responseTimes.delete(endpoint);
          this.errorCounts.delete(endpoint);
        }
      }
    }, 300000); // Clean up every 5 minutes
  }

  private startSystemMonitoring(): void {
    setInterval(() => {
      const health = this.getSystemHealth();
      this.emit('systemHealth', health);

      // Log critical health issues
      if (health.errorRate > 20) {
        logger.error('High error rate detected', { errorRate: health.errorRate });
      }

      if (health.averageResponseTime > 3000) {
        logger.warn('High average response time', { responseTime: health.averageResponseTime });
      }

      if (health.memoryUsage.heapUsed > 512 * 1024 * 1024) {
        // 512MB
        logger.warn('High memory usage', {
          heapUsed: Math.round(health.memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(health.memoryUsage.heapTotal / 1024 / 1024),
        });
      }
    }, 30000); // Monitor every 30 seconds
  }

  private calculateHealthScore(): number {
    const health = this.getSystemHealth();
    let score = 100;

    // Deduct points for various issues
    if (health.errorRate > 5) score -= Math.min(30, health.errorRate * 2);
    if (health.averageResponseTime > 1000)
      score -= Math.min(25, (health.averageResponseTime - 1000) / 100);
    if (health.memoryUsage.heapUsed > 256 * 1024 * 1024) score -= 20; // 256MB threshold

    return Math.max(0, Math.round(score));
  }

  private calculateTrends(_metrics: PerformanceMetrics[]): unknown {
    // Simplified trend calculation - would implement proper time bucketing
    return { responseTimeTrend: [], errorRateTrend: [], throughputTrend: [] };
  }

  private analyzeEndpoints(metrics: PerformanceMetrics[]): Record<string, EndpointStats> {
    const stats: Record<string, EndpointStats> = {};

    for (const metric of metrics) {
      if (!stats[metric.endpoint]) {
        stats[metric.endpoint] = { count: 0, totalTime: 0, errors: 0 };
      }

      stats[metric.endpoint].count++;
      stats[metric.endpoint].totalTime += metric.responseTime;
      if (metric.statusCode >= 400) {
        stats[metric.endpoint].errors++;
      }
    }

    return stats;
  }

  private getActiveConnections(): number {
    // Would integrate with actual connection tracking
    return 0;
  }

  private getDatabaseHealth(): unknown {
    return { connectionPoolSize: 10, activeQueries: 0, averageQueryTime: 50, slowQueries: 2 };
  }

  private getWebSocketConnections(): number {
    // Would integrate with WebSocket manager
    return 0;
  }

  private getRateLimitHits(): number {
    // Would integrate with rate limiter
    return 0;
  }

  private getRequestsPerSecond(): number {
    const now = Date.now();
    const lastSecond = this.metrics.filter(m => now - m.timestamp < 1000);
    return lastSecond.length;
  }

  private getActiveUsers(): number {
    const now = Date.now();
    const lastMinute = this.metrics.filter(m => now - m.timestamp < 60000);
    const userIds = new Set(lastMinute.map(m => m.userId).filter(Boolean));
    return userIds.size;
  }

  private getCpuUsagePercent(): number {
    // Simplified CPU usage calculation
    const usage = process.cpuUsage();
    return Math.round((usage.user + usage.system) / 1000000); // Convert to percentage
  }

  private exportPrometheusMetrics(): string {
    const health = this.getSystemHealth();
    const dashboard = this.getDashboard();

    const metrics = [
      `# HELP http_requests_total Total number of HTTP requests`,
      `# TYPE http_requests_total counter`,
      `http_requests_total ${dashboard.overview.totalRequests}`,
      ``,
      `# HELP http_request_duration_seconds HTTP request duration in seconds`,
      `# TYPE http_request_duration_seconds gauge`,
      `http_request_duration_seconds ${dashboard.overview.averageResponseTime / 1000}`,
      ``,
      `# HELP http_error_rate HTTP error rate percentage`,
      `# TYPE http_error_rate gauge`,
      `http_error_rate ${dashboard.overview.errorRate}`,
      ``,
      `# HELP system_memory_usage_bytes System memory usage in bytes`,
      `# TYPE system_memory_usage_bytes gauge`,
      `system_memory_usage_bytes ${health.memoryUsage.heapUsed}`,
      ``,
      `# HELP system_uptime_seconds System uptime in seconds`,
      `# TYPE system_uptime_seconds gauge`,
      `system_uptime_seconds ${health.uptime / 1000}`,
    ];

    return metrics.join('\n');
  }

  /**
   * Stop monitoring and cleanup
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.removeAllListeners();
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitoringService.getInstance();
