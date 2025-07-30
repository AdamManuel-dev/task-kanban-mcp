/**
 * @fileoverview Error monitoring and alerting system
 * @lastmodified 2025-07-28T08:30:00Z
 *
 * Features: Error tracking, alerting, metrics collection, trend analysis
 * Main APIs: ErrorMonitor, AlertManager, ErrorAnalytics
 * Constraints: Requires persistent storage for error history
 * Patterns: Observer pattern for alerts, aggregation for metrics
 */

import { logger } from './logger';
import { serializeError } from './errors';
import type { ErrorContext, BaseServiceError } from './errors';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface ErrorMetrics {
  errorCount: number;
  errorRate: number;
  averageResponseTime: number;
  failureRate: number;
  p99ResponseTime: number;
  p95ResponseTime: number;
  topErrors: Array<{
    error: string;
    count: number;
    percentage: number;
  }>;
}

export interface ErrorEvent {
  id: string;
  timestamp: Date;
  error: BaseServiceError;
  context?: ErrorContext;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fingerprint: string;
  tags: Record<string, string>;
}

export interface AlertRule {
  name: string;
  condition: (metrics: ErrorMetrics, events: ErrorEvent[]) => boolean;
  severity: 'warning' | 'error' | 'critical';
  cooldown: number; // Minutes before same alert can fire again
  channels: string[];
  enabled: boolean;
}

export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
}

export interface EmailConfig {
  to: string;
  from?: string;
  subject?: string;
}

export interface SlackConfig {
  channel: string;
  token?: string;
  webhook?: string;
}

export interface ErrorFilters {
  since?: Date;
  severity?: string[];
  fingerprint?: string;
  service?: string;
  limit?: number;
}

export interface AlertChannel {
  name: string;
  type: 'log' | 'webhook' | 'email' | 'slack';
  config: Record<string, unknown>;
  enabled: boolean;
}

// ============================================================================
// ERROR FINGERPRINTING
// ============================================================================

export class ErrorFingerprinter {
  static generateFingerprint(error: BaseServiceError, context?: ErrorContext): string {
    const components = [
      error.code,
      error.name,
      this.normalizeMessage(error.message),
      context?.service || 'unknown',
      context?.method || 'unknown',
    ];

    // Create a simple hash
    return this.hashString(components.join('|'));
  }

  private static normalizeMessage(message: string): string {
    // Remove dynamic parts like IDs, timestamps, etc.
    return message
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'TIMESTAMP')
      .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/g, 'UUID')
      .replace(/\b\d+\b/g, 'NUMBER')
      .toLowerCase();
  }

  private static hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash &= hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// ============================================================================
// ERROR STORAGE
// ============================================================================

export class ErrorStorage {
  private errors: ErrorEvent[] = [];

  private readonly maxEvents = 10000;

  addError(event: ErrorEvent): void {
    this.errors.push(event);

    // Keep only recent errors to prevent memory bloat
    if (this.errors.length > this.maxEvents) {
      this.errors = this.errors.slice(-this.maxEvents);
    }
  }

  getErrors(filters?: {
    since?: Date;
    severity?: string[];
    fingerprint?: string;
    service?: string;
    limit?: number;
  }): ErrorEvent[] {
    let filtered = this.errors;

    if (filters?.since) {
      filtered = filtered.filter(e => e.timestamp >= filters.since!);
    }

    if (filters?.severity) {
      filtered = filtered.filter(e => filters.severity!.includes(e.severity));
    }

    if (filters?.fingerprint) {
      filtered = filtered.filter(e => e.fingerprint === filters.fingerprint);
    }

    if (filters?.service) {
      filtered = filtered.filter(e => e.context?.service === filters.service);
    }

    if (filters?.limit) {
      filtered = filtered.slice(-filters.limit);
    }

    return filtered;
  }

  getMetrics(timeWindow = 3600000): ErrorMetrics {
    // Default 1 hour
    const since = new Date(Date.now() - timeWindow);
    const recentErrors = this.getErrors({ since });

    if (recentErrors.length === 0) {
      return {
        errorCount: 0,
        errorRate: 0,
        averageResponseTime: 0,
        failureRate: 0,
        p99ResponseTime: 0,
        p95ResponseTime: 0,
        topErrors: [],
      };
    }

    // Count errors by fingerprint
    const errorCounts = new Map<string, number>();
    recentErrors.forEach(event => {
      const count = errorCounts.get(event.fingerprint) ?? 0;
      errorCounts.set(event.fingerprint, count + 1);
    });

    // Get top errors
    const topErrors = Array.from(errorCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([fingerprint, count]) => {
        const sample = recentErrors.find(e => e.fingerprint === fingerprint);
        return {
          error: sample?.error.message ?? 'Unknown error',
          count,
          percentage: (count / recentErrors.length) * 100,
        };
      });

    return {
      errorCount: recentErrors.length,
      errorRate: recentErrors.length / (timeWindow / 1000 / 60), // errors per minute
      averageResponseTime: 0, // Would need response time tracking
      failureRate: 100, // Would need success rate tracking
      p99ResponseTime: 0,
      p95ResponseTime: 0,
      topErrors,
    };
  }

  clear(): void {
    this.errors = [];
  }
}

// ============================================================================
// ALERT MANAGER
// ============================================================================

export class AlertManager {
  private readonly rules: AlertRule[] = [];

  private readonly channels: AlertChannel[] = [];

  private readonly lastAlerts = new Map<string, Date>();

  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  addChannel(channel: AlertChannel): void {
    this.channels.push(channel);
  }

  async checkAlerts(metrics: ErrorMetrics, events: ErrorEvent[]): Promise<void> {
    for (const rule of this.rules.filter(r => r.enabled)) {
      try {
        if (rule.condition(metrics, events)) {
          await this.triggerAlert(rule, metrics, events);
        }
      } catch (error) {
        logger.error('Error checking alert rule', {
          rule: rule.name,
          error: serializeError(error),
        });
      }
    }
  }

  private async triggerAlert(
    rule: AlertRule,
    metrics: ErrorMetrics,
    events: ErrorEvent[]
  ): Promise<void> {
    const now = new Date();
    const lastAlert = this.lastAlerts.get(rule.name);

    // Check cooldown
    if (lastAlert && now.getTime() - lastAlert.getTime() < rule.cooldown * 60 * 1000) {
      return;
    }

    this.lastAlerts.set(rule.name, now);

    const alert = {
      rule: rule.name,
      severity: rule.severity,
      timestamp: now,
      metrics,
      recentEvents: events.slice(-5), // Include recent events
    };

    logger.warn('Alert triggered', alert);

    // Send to configured channels
    for (const channelName of rule.channels) {
      const channel = this.channels.find(c => c.name === channelName && c.enabled);
      if (channel) {
        await this.sendAlert(channel, alert);
      }
    }
  }

  private async sendAlert(channel: AlertChannel, alert: unknown): Promise<void> {
    try {
      switch (channel.type) {
        case 'log':
          logger.error('ALERT', alert);
          break;
        case 'webhook':
          await this.sendWebhookAlert(channel.config as WebhookConfig, alert as ErrorEvent);
          break;
        case 'email':
          await this.sendEmailAlert(channel.config as EmailConfig, alert as ErrorEvent);
          break;
        case 'slack':
          await this.sendSlackAlert(channel.config as SlackConfig, alert as ErrorEvent);
          break;
      }
    } catch (error) {
      logger.error('Failed to send alert', {
        channel: channel.name,
        error: serializeError(error),
      });
    }
  }

  private async sendWebhookAlert(config: WebhookConfig, alert: ErrorEvent): Promise<void> {
    // Implementation would depend on HTTP client availability
    logger.info('Webhook alert would be sent', { url: config.url, alert });
  }

  private async sendEmailAlert(config: EmailConfig, alert: ErrorEvent): Promise<void> {
    // Implementation would depend on email service
    logger.info('Email alert would be sent', { to: config.to, alert });
  }

  private async sendSlackAlert(config: SlackConfig, alert: ErrorEvent): Promise<void> {
    // Implementation would depend on Slack SDK
    logger.info('Slack alert would be sent', { channel: config.channel, alert });
  }
}

// ============================================================================
// ERROR MONITOR
// ============================================================================

export class ErrorMonitor {
  private readonly storage = new ErrorStorage();

  private readonly alertManager = new AlertManager();

  private monitoringInterval?: NodeJS.Timeout;

  constructor() {
    this.setupDefaultAlerts();
  }

  private setupDefaultAlerts(): void {
    // High error rate alert
    this.alertManager.addRule({
      name: 'high-error-rate',
      condition: metrics => metrics.errorRate > 10, // More than 10 errors per minute
      severity: 'error',
      cooldown: 15,
      channels: ['log'],
      enabled: true,
    });

    // Critical error alert
    this.alertManager.addRule({
      name: 'critical-errors',
      condition: (_, events) => events.some(e => e.severity === 'critical'),
      severity: 'critical',
      cooldown: 5,
      channels: ['log'],
      enabled: true,
    });

    // Error spike alert
    this.alertManager.addRule({
      name: 'error-spike',
      condition: metrics => metrics.errorCount > 50, // More than 50 errors in window
      severity: 'warning',
      cooldown: 30,
      channels: ['log'],
      enabled: true,
    });

    // Add default log channel
    this.alertManager.addChannel({
      name: 'log',
      type: 'log',
      config: {},
      enabled: true,
    });
  }

  recordError(error: BaseServiceError, context?: ErrorContext): void {
    const event: ErrorEvent = {
      id: this.generateId(),
      timestamp: new Date(),
      error,
      context,
      severity: this.calculateSeverity(error),
      fingerprint: ErrorFingerprinter.generateFingerprint(error, context),
      tags: this.extractTags(error, context),
    };

    this.storage.addError(event);

    logger.debug('Error recorded', {
      id: event.id,
      fingerprint: event.fingerprint,
      severity: event.severity,
    });
  }

  private calculateSeverity(error: BaseServiceError): 'low' | 'medium' | 'high' | 'critical' {
    if (error.statusCode >= 500) return 'critical';
    if (error.statusCode >= 400) return 'high';
    if (error.code.includes('VALIDATION')) return 'medium';
    return 'low';
  }

  private extractTags(error: BaseServiceError, context?: ErrorContext): Record<string, string> {
    return {
      code: error.code,
      service: context?.service || 'unknown',
      method: context?.method || 'unknown',
      statusCode: error.statusCode.toString(),
    };
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  getMetrics(timeWindow?: number): ErrorMetrics {
    return this.storage.getMetrics(timeWindow);
  }

  getErrors(filters?: ErrorFilters): ErrorEvent[] {
    return this.storage.getErrors(filters);
  }

  addAlertRule(rule: AlertRule): void {
    this.alertManager.addRule(rule);
  }

  addAlertChannel(channel: AlertChannel): void {
    this.alertManager.addChannel(channel);
  }

  startMonitoring(interval = 60000): void {
    // Check every minute
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = this.getMetrics();
        const recentEvents = this.getErrors({
          since: new Date(Date.now() - 300000), // Last 5 minutes
          limit: 100,
        });

        await this.alertManager.checkAlerts(metrics, recentEvents);
      } catch (error) {
        logger.error('Error in monitoring loop', {
          error: serializeError(error),
        });
      }
    }, interval);

    logger.info('Error monitoring started', { interval });
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    logger.info('Error monitoring stopped');
  }

  getHealthReport(): {
    isHealthy: boolean;
    summary: string;
    metrics: ErrorMetrics;
    recentCriticalErrors: ErrorEvent[];
  } {
    const metrics = this.getMetrics(300000); // Last 5 minutes
    const criticalErrors = this.getErrors({
      since: new Date(Date.now() - 300000),
      severity: ['critical'],
    });

    const isHealthy = metrics.errorRate < 5 && criticalErrors.length === 0;

    return {
      isHealthy,
      summary: isHealthy
        ? 'System is healthy'
        : `${metrics.errorCount} errors in last 5 minutes, ${criticalErrors.length} critical`,
      metrics,
      recentCriticalErrors: criticalErrors,
    };
  }

  clear(): void {
    this.storage.clear();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const errorMonitor = new ErrorMonitor();

// Start monitoring by default
errorMonitor.startMonitoring();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export const recordError = (error: BaseServiceError, context?: ErrorContext): void => {
  errorMonitor.recordError(error, context);
};

export const getErrorMetrics = (timeWindow?: number): ErrorMetrics =>
  errorMonitor.getMetrics(timeWindow);

export const getSystemHealth = () => errorMonitor.getHealthReport();
