/**
 * @fileoverview Comprehensive error reporting and diagnostics
 * @lastmodified 2025-07-28T08:30:00Z
 *
 * Features: Error reports, diagnostics, trend analysis, root cause analysis
 * Main APIs: ErrorReporter, DiagnosticsCollector, TrendAnalyzer
 * Constraints: Requires error history, system metrics
 * Patterns: Builder pattern for reports, aggregation for trends
 */

import { logger } from './logger';
import { errorMonitor, getErrorMetrics, getSystemHealth } from './error-monitoring';
import { errorRecoveryManager } from './error-recovery';
import type { ErrorEvent, ErrorMetrics } from './error-monitoring';
import type { BaseServiceError, ErrorContext } from './errors';

// Circuit breaker state interface
interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  nextAttempt?: number;
}

// Bulkhead statistics interface
interface BulkheadStats {
  activeRequests: number;
  maxConcurrency: number;
  queuedRequests?: number;
  completedRequests?: number;
}

// System health interface
interface SystemHealth {
  healthy: boolean;
  status?: string;
  checks?: Record<string, boolean>;
  uptime?: number;
}

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface ErrorReport {
  id: string;
  timestamp: Date;
  timeRange: {
    start: Date;
    end: Date;
  };
  summary: {
    totalErrors: number;
    uniqueErrors: number;
    errorRate: number;
    topErrors: Array<{
      fingerprint: string;
      message: string;
      count: number;
      percentage: number;
      severity: string;
    }>;
  };
  trends: {
    errorCountTrend: 'increasing' | 'decreasing' | 'stable';
    errorRateTrend: 'increasing' | 'decreasing' | 'stable';
    severityDistribution: Record<string, number>;
  };
  services: Array<{
    name: string;
    errorCount: number;
    errorRate: number;
    topMethods: Array<{
      method: string;
      errorCount: number;
    }>;
  }>;
  rootCauses: Array<{
    category: string;
    description: string;
    affectedServices: string[];
    recommendedActions: string[];
  }>;
  systemHealth: {
    overall: 'healthy' | 'degraded' | 'critical';
    circuitBreakers: Record<string, unknown>;
    bulkheads: Record<string, unknown>;
  };
  recommendations: string[];
}

export interface DiagnosticInfo {
  timestamp: Date;
  system: {
    nodeVersion: string;
    platform: string;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
  };
  application: {
    version: string;
    environment: string;
    configuredFeatures: string[];
  };
  database: {
    connected: boolean;
    poolSize?: number;
    activeConnections?: number;
  };
  services: {
    activeServices: string[];
    circuitBreakerStates: Record<string, string>;
    bulkheadUtilization: Record<string, number>;
  };
}

// ============================================================================
// TREND ANALYZER
// ============================================================================

export class TrendAnalyzer {
  static analyzeTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';

    const first = values.slice(0, Math.floor(values.length / 2));
    const second = values.slice(Math.floor(values.length / 2));

    const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
    const secondAvg = second.reduce((a, b) => a + b, 0) / second.length;

    const threshold = 0.1; // 10% change threshold
    const changePercentage = (secondAvg - firstAvg) / firstAvg;

    if (Math.abs(changePercentage) < threshold) return 'stable';
    return changePercentage > 0 ? 'increasing' : 'decreasing';
  }

  static calculateSeverityDistribution(events: ErrorEvent[]): Record<string, number> {
    const distribution: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    events.forEach(event => {
      distribution[event.severity]++;
    });

    return distribution;
  }

  static identifyTopErrors(
    events: ErrorEvent[],
    limit = 10
  ): Array<{
    fingerprint: string;
    message: string;
    count: number;
    percentage: number;
    severity: string;
  }> {
    const errorCounts = new Map<
      string,
      {
        count: number;
        sample: ErrorEvent;
      }
    >();

    events.forEach(event => {
      const existing = errorCounts.get(event.fingerprint);
      if (existing) {
        existing.count++;
      } else {
        errorCounts.set(event.fingerprint, { count: 1, sample: event });
      }
    });

    return Array.from(errorCounts.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, limit)
      .map(([fingerprint, data]) => ({
        fingerprint,
        message: data.sample.error.message,
        count: data.count,
        percentage: (data.count / events.length) * 100,
        severity: data.sample.severity,
      }));
  }
}

// ============================================================================
// DIAGNOSTICS COLLECTOR
// ============================================================================

export class DiagnosticsCollector {
  static async collect(): Promise<DiagnosticInfo> {
    const systemHealth = errorRecoveryManager.getSystemHealth();

    return { timestamp: new Date(), system: {, nodeVersion: process.version, platform: process.platform, uptime: process.uptime(), memoryUsage: process.memoryUsage() },
      application: {
        version: process.env.npm_package_version ?? 'unknown',
        environment: process.env.NODE_ENV ?? 'development',
        configuredFeatures: this.getConfiguredFeatures(),
      },
      database: await this.getDatabaseInfo(),
      services: {
        activeServices: this.getActiveServices(),
        circuitBreakerStates: this.extractCircuitBreakerStates(systemHealth.circuitBreakers),
        bulkheadUtilization: this.calculateBulkheadUtilization(systemHealth.bulkheads),
      },
    };
  }

  private static getConfiguredFeatures(): string[] {
    const features: string[] = [];

    if (process.env.ENABLE_WEBSOCKET === 'true') features.push('websocket');
    if (process.env.ENABLE_BACKUP === 'true') features.push('backup');
    if (process.env.ENABLE_MONITORING === 'true') features.push('monitoring');

    return features;
  }

  private static async getDatabaseInfo(): Promise<DiagnosticInfo['database']> {
    try {
      // This would normally check actual database connection
      return { connected: true, poolSize: 10, activeConnections: 2 };
    } catch {
      return { connected: false };
    }
  }

  private static getActiveServices(): string[] {
    // This would normally enumerate active services
    return ['TaskService', 'BoardService', 'NoteService', 'TagService'];
  }

  private static extractCircuitBreakerStates(
    breakers: Record<string, CircuitBreakerState>
  ): Record<string, string> {
    const states: Record<string, string> = {};

    Object.entries(breakers).forEach(([name, state]) => {
      states[name] = state.state || 'unknown';
    });

    return states;
  }

  private static calculateBulkheadUtilization(
    bulkheads: Record<string, BulkheadStats>
  ): Record<string, number> {
    const utilization: Record<string, number> = {};

    Object.entries(bulkheads).forEach(([name, stats]) => {
      const active = stats.activeRequests || 0;
      const max = stats.maxConcurrency || 1;
      utilization[name] = (active / max) * 100;
    });

    return utilization;
  }
}

// ============================================================================
// ROOT CAUSE ANALYZER
// ============================================================================

export class RootCauseAnalyzer {
  static analyzeRootCauses(events: ErrorEvent[]): Array<{
    category: string;
    description: string;
    affectedServices: string[];
    recommendedActions: string[];
  }> {
    const causes: Array<{
      category: string;
      description: string;
      affectedServices: string[];
      recommendedActions: string[];
    }> = [];

    // Analyze database-related errors
    const dbErrors = events.filter(
      e => e.error.code.includes('DATABASE') || e.error.message.toLowerCase().includes('database')
    );

    if (dbErrors.length > 0) {
      causes.push({
        category: 'Database Issues',
        description: `${dbErrors.length} database-related errors detected`,
        affectedServices: [...new Set(dbErrors.map(e => e.context?.service ?? 'unknown'))],
        recommendedActions: [
          'Check database connection health',
          'Review database pool configuration',
          'Monitor database query performance',
          'Consider database maintenance',
        ],
      });
    }

    // Analyze validation errors
    const validationErrors = events.filter(
      e =>
        e.error.code.includes('VALIDATION') || e.error.message.toLowerCase().includes('validation')
    );

    if (validationErrors.length > events.length * 0.3) {
      causes.push({
        category: 'Input Validation',
        description: 'High volume of validation errors suggests data quality issues',
        affectedServices: [...new Set(validationErrors.map(e => e.context?.service ?? 'unknown'))],
        recommendedActions: [
          'Review input validation rules',
          'Improve client-side validation',
          'Add better error messages for users',
          'Analyze common validation failures',
        ],
      });
    }

    // Analyze network/external service errors
    const networkErrors = events.filter(
      e =>
        e.error.code.includes('EXTERNAL_SERVICE') ||
        e.error.message.toLowerCase().includes('network') ||
        e.error.message.toLowerCase().includes('timeout')
    );

    if (networkErrors.length > 0) {
      causes.push({
        category: 'External Dependencies',
        description: `${networkErrors.length} external service or network errors`,
        affectedServices: [...new Set(networkErrors.map(e => e.context?.service ?? 'unknown'))],
        recommendedActions: [
          'Check external service health',
          'Review timeout configurations',
          'Implement circuit breakers for external calls',
          'Add retry mechanisms with backoff',
        ],
      });
    }

    return causes;
  }
}

// ============================================================================
// ERROR REPORTER
// ============================================================================

export class ErrorReporter {
  static async generateReport(timeRange: { start: Date; end: Date }): Promise<ErrorReport> {
    const events = errorMonitor
      .getErrors({
        since: timeRange.start,
        limit: 10000, // Large limit to get comprehensive data
      })
      .filter(e => e.timestamp <= timeRange.end);

    const metrics = errorMonitor.getMetrics(timeRange.end.getTime() - timeRange.start.getTime());

    const systemHealth = errorRecoveryManager.getSystemHealth();
    const diagnostics = await DiagnosticsCollector.collect();

    // Calculate trends (simplified for demo)
    const hourlyErrorCounts = this.calculateHourlyErrorCounts(events);

    const report: ErrorReport = {
      id: this.generateReportId(),
      timestamp: new Date(),
      timeRange,
      summary: {
        totalErrors: events.length,
        uniqueErrors: new Set(events.map(e => e.fingerprint)).size,
        errorRate: metrics.errorRate,
        topErrors: TrendAnalyzer.identifyTopErrors(events, 10),
      },
      trends: {
        errorCountTrend: TrendAnalyzer.analyzeTrend(hourlyErrorCounts),
        errorRateTrend: TrendAnalyzer.analyzeTrend(hourlyErrorCounts), // Simplified
        severityDistribution: TrendAnalyzer.calculateSeverityDistribution(events),
      },
      services: this.analyzeServiceErrors(events),
      rootCauses: RootCauseAnalyzer.analyzeRootCauses(events),
      systemHealth: {
        overall: this.determineOverallHealth(systemHealth, events),
        circuitBreakers: systemHealth.circuitBreakers,
        bulkheads: systemHealth.bulkheads,
      },
      recommendations: this.generateRecommendations(events, systemHealth),
    };

    logger.info('Error report generated', {
      reportId: report.id,
      timeRange,
      totalErrors: report.summary.totalErrors,
    });

    return report;
  }

  private static generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private static calculateHourlyErrorCounts(events: ErrorEvent[]): number[] {
    if (events.length === 0) return [];

    const earliest = events[0].timestamp.getTime();
    const latest = events[events.length - 1].timestamp.getTime();
    const hours = Math.ceil((latest - earliest) / (1000 * 60 * 60));

    const counts: number[] = new Array(Math.max(1, hours)).fill(0);

    events.forEach(event => {
      const hourIndex = Math.floor((event.timestamp.getTime() - earliest) / (1000 * 60 * 60));
      if (hourIndex >= 0 && hourIndex < counts.length) {
        counts[hourIndex]++;
      }
    });

    return counts;
  }

  private static analyzeServiceErrors(events: ErrorEvent[]): ErrorReport['services'] {
    const serviceStats = new Map<
      string,
      {
        errorCount: number;
        methods: Map<string, number>;
      }
    >();

    events.forEach(event => {
      const service = event.context?.service ?? 'unknown';
      const method = event.context?.method ?? 'unknown';

      if (!serviceStats.has(service)) {
        serviceStats.set(service, {
          errorCount: 0,
          methods: new Map(),
        });
      }

      const stats = serviceStats.get(service)!;
      stats.errorCount++;
      stats.methods.set(method, (stats.methods.get(method) ?? 0) + 1);
    });

    return Array.from(serviceStats.entries()).map(([name, stats]) => ({
      name,
      errorCount: stats.errorCount,
      errorRate: stats.errorCount / events.length,
      topMethods: Array.from(stats.methods.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([method, errorCount]) => ({
          method,
          errorCount,
        })),
    }));
  }

  private static determineOverallHealth(
    systemHealth: SystemHealth,
    events: ErrorEvent[]
  ): 'healthy' | 'degraded' | 'critical' {
    const criticalErrors = events.filter(e => e.severity === 'critical');
    const recentErrors = events.filter(
      e => e.timestamp.getTime() > Date.now() - 300000 // Last 5 minutes
    );

    if (criticalErrors.length > 0 || !systemHealth.healthy) {
      return 'critical';
    }

    if (recentErrors.length > 10) {
      return 'degraded';
    }

    return 'healthy';
  }

  private static generateRecommendations(
    events: ErrorEvent[],
    systemHealth: SystemHealth
  ): string[] {
    const recommendations: string[] = [];

    if (events.length > 100) {
      recommendations.push('High error volume detected - consider implementing rate limiting');
    }

    const criticalErrors = events.filter(e => e.severity === 'critical');
    if (criticalErrors.length > 0) {
      recommendations.push('Critical errors detected - immediate investigation required');
    }

    if (!systemHealth.healthy) {
      recommendations.push('System health degraded - check service dependencies');
    }

    const validationErrors = events.filter(e => e.error.code.includes('VALIDATION'));
    if (validationErrors.length > events.length * 0.4) {
      recommendations.push('High validation error rate - review input validation');
    }

    if (recommendations.length === 0) {
      recommendations.push('System appears stable - continue monitoring');
    }

    return recommendations;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export const generateErrorReport = async (hours = 24): Promise<ErrorReport> => {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);

  return ErrorReporter.generateReport({ start, end });
};

export const getQuickHealthSummary = (): {
  status: string;
  errorCount: number;
  criticalErrors: number;
  recommendations: string[];
} => {
  const health = getSystemHealth();
  const metrics = getErrorMetrics(300000); // Last 5 minutes
  const events = errorMonitor.getErrors({
    since: new Date(Date.now() - 300000),
    severity: ['critical'],
  });

  return { status: health.isHealthy ? 'healthy' : 'degraded', errorCount: metrics.errorCount, criticalErrors: events.length, recommendations: health.isHealthy, ? ['System is operating normally'], : ['Check error logs', 'Review system health'] };
};
