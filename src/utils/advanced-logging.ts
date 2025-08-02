/**
 * @fileoverview Advanced logging utilities with structured logging, audit trails, and performance tracking
 * @lastmodified 2025-07-28T08:30:00Z
 *
 * Features: Structured logging, audit trails, performance tracking, log filtering, context propagation
 * Main APIs: AdvancedLogger, AuditLogger, PerformanceLogger, ContextLogger
 * Constraints: Requires Winston logger, supports multiple transports
 * Patterns: Decorator pattern for logging enhancement, context injection
 */

import winston from 'winston';
import { AsyncLocalStorage } from 'async_hooks';
import { logger } from './logger';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  operation?: string;
  component?: string;
  traceId?: string;
  spanId?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface AuditEvent {
  action: string;
  resource: string;
  resourceId?: string;
  userId?: string;
  timestamp: Date;
  outcome: 'success' | 'failure' | 'attempt';
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  timestamp: Date;
  memoryUsage?: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
  meta: {
    context?: LogContext;
    [key: string]: unknown;
  };
}

export interface LogFilter {
  level?: string[];
  component?: string[];
  userId?: string[];
  timeRange?: {
    start: Date;
    end: Date;
  };
  tags?: Record<string, string>;
}

// ============================================================================
// CONTEXT MANAGEMENT
// ============================================================================

/**
 * AsyncLocalStorage for maintaining logging context across async operations
 */
const logContextStorage = new AsyncLocalStorage<LogContext>();

/**
 * Context-aware logger that automatically includes request context
 */
export class ContextLogger {
  private readonly baseLogger: winston.Logger;

  constructor(baseLogger: winston.Logger = logger) {
    this.baseLogger = baseLogger;
  }

  /**
   * Set logging context for the current async chain
   */
  static setContext(context: LogContext): void {
    const existingContext = logContextStorage.getStore() ?? {};
    const mergedContext = { ...existingContext, ...context };

    // Run in new context
    logContextStorage.enterWith(mergedContext);
  }

  /**
   * Get current logging context
   */
  static getContext(): LogContext {
    return logContextStorage.getStore() ?? {};
  }

  /**
   * Run function with specific logging context
   */
  static runWithContext<T>(context: LogContext, fn: () => T): T {
    return logContextStorage.run(context, fn);
  }

  /**
   * Enhanced logging methods that include context
   */
  error(message: string, meta: unknown = {}): void {
    this.log('error', message, meta);
  }

  warn(message: string, meta: unknown = {}): void {
    this.log('warn', message, meta);
  }

  info(message: string, meta: unknown = {}): void {
    this.log('info', message, meta);
  }

  debug(message: string, meta: unknown = {}): void {
    this.log('debug', message, meta);
  }

  private log(level: string, message: string, meta: unknown = {}): void {
    const context = ContextLogger.getContext();
    const enhancedMeta = {
      ...(typeof meta === 'object' && meta !== null ? meta : {}),
      context: {
        requestId: context.requestId,
        userId: context.userId,
        sessionId: context.sessionId,
        operation: context.operation,
        component: context.component,
        traceId: context.traceId,
        spanId: context.spanId,
        tags: context.tags,
        ...context.metadata,
      },
    };

    this.baseLogger.log(level, message, enhancedMeta);
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): ContextLogger {
    const newLogger = new ContextLogger(this.baseLogger);
    const currentContext = ContextLogger.getContext();
    ContextLogger.setContext({ ...currentContext, ...additionalContext });
    return newLogger;
  }
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Specialized logger for audit events and compliance logging
 */
export class AuditLogger {
  private readonly auditLogger: winston.Logger;

  constructor() {
    this.auditLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      defaultMeta: {
        service: 'mcp-kanban-audit',
        type: 'audit',
      },
      transports: [
        // Dedicated audit log file
        new winston.transports.File({
          filename: 'logs/audit.log',
          maxsize: 10485760, // 10MB
          maxFiles: 10,
        }),
        // Separate critical audit events
        new winston.transports.File({
          filename: 'logs/audit-critical.log',
          level: 'warn',
          maxsize: 10485760,
          maxFiles: 10,
        }),
      ],
    });
  }

  /**
   * Log an audit event
   */
  logEvent(event: AuditEvent): void {
    const logLevel = event.outcome === 'failure' ? 'warn' : 'info';

    this.auditLogger.log(logLevel, 'Audit Event', {
      auditEvent: {
        ...event,
        timestamp: event.timestamp.toISOString(),
      },
      context: ContextLogger.getContext(),
    });
  }

  /**
   * Log user authentication events
   */
  logAuthentication(userId: string, outcome: 'success' | 'failure', details?: unknown): void {
    this.logEvent({
      action: 'authenticate',
      resource: 'user',
      resourceId: userId,
      userId,
      timestamp: new Date(),
      outcome,
      details: details as Record<string, unknown>,
    });
  }

  /**
   * Log data access events
   */
  logDataAccess(action: string, resource: string, resourceId: string, userId?: string): void {
    this.logEvent({
      action,
      resource,
      resourceId,
      userId,
      timestamp: new Date(),
      outcome: 'success',
    });
  }

  /**
   * Log administrative actions
   */
  logAdminAction(action: string, userId: string, details: unknown): void {
    this.logEvent({
      action,
      resource: 'system',
      userId,
      timestamp: new Date(),
      outcome: 'success',
      details: details as Record<string, unknown>,
    });
  }

  /**
   * Log security events
   */
  logSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: unknown
  ): void {
    const logLevel = severity === 'critical' || severity === 'high' ? 'warn' : 'info';

    this.auditLogger.log(logLevel, 'Security Event', {
      securityEvent: {
        event,
        severity,
        timestamp: new Date().toISOString(),
        details,
      },
      context: ContextLogger.getContext(),
    });
  }
}

// ============================================================================
// PERFORMANCE LOGGING
// ============================================================================

/**
 * Performance tracking and logging utilities
 */
export class PerformanceLogger {
  private readonly performanceLogger: winston.Logger;

  private readonly activeOperations = new Map<
    string,
    {
      startTime: [number, number];
      startMemory: NodeJS.MemoryUsage;
      startCpu: NodeJS.CpuUsage;
    }
  >();

  constructor() {
    this.performanceLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      defaultMeta: {
        service: 'mcp-kanban-performance',
        type: 'performance',
      },
      transports: [
        new winston.transports.File({
          filename: 'logs/performance.log',
          maxsize: 10485760,
          maxFiles: 5,
        }),
      ],
    });
  }

  /**
   * Start tracking a performance operation
   */
  startOperation(operationId: string, operation: string, metadata?: unknown): void {
    this.activeOperations.set(operationId, {
      startTime: process.hrtime(),
      startMemory: process.memoryUsage(),
      startCpu: process.cpuUsage(),
    });

    this.performanceLogger.debug('Operation started', {
      operationId,
      operation,
      metadata,
      context: ContextLogger.getContext(),
    });
  }

  /**
   * End tracking and log performance metrics
   */
  endOperation(
    operationId: string,
    operation: string,
    metadata?: unknown
  ): PerformanceMetrics | null {
    const tracking = this.activeOperations.get(operationId);
    if (!tracking) {
      this.performanceLogger.warn('Operation end called without start', {
        operationId,
        operation,
      });
      return null;
    }

    this.activeOperations.delete(operationId);

    const endTime = process.hrtime(tracking.startTime);
    const duration = endTime[0] * 1000 + endTime[1] / 1000000; // Convert to milliseconds

    const endMemory = process.memoryUsage();
    const endCpu = process.cpuUsage(tracking.startCpu);

    const metrics: PerformanceMetrics = {
      operation,
      duration,
      timestamp: new Date(),
      memoryUsage: {
        rss: endMemory.rss - tracking.startMemory.rss,
        heapTotal: endMemory.heapTotal - tracking.startMemory.heapTotal,
        heapUsed: endMemory.heapUsed - tracking.startMemory.heapUsed,
        external: endMemory.external - tracking.startMemory.external,
        arrayBuffers: endMemory.arrayBuffers - tracking.startMemory.arrayBuffers,
      },
      cpuUsage: endCpu,
      metadata: metadata as Record<string, unknown>,
    };

    // Log with appropriate level based on performance
    const logLevel = this.determineLogLevel(metrics);

    this.performanceLogger.log(logLevel, 'Operation completed', {
      operationId,
      metrics,
      context: ContextLogger.getContext(),
    });

    return metrics;
  }

  /**
   * Track function execution performance
   */
  trackFunction<T>(operationName: string, fn: () => T, metadata?: unknown): T {
    const operationId = this.generateOperationId();
    this.startOperation(operationId, operationName, metadata);

    try {
      const result = fn();

      // Handle promises
      if (result instanceof Promise) {
        return result.finally(() => {
          this.endOperation(operationId, operationName, metadata);
        }) as T;
      }

      this.endOperation(operationId, operationName, metadata);
      return result;
    } catch (error) {
      this.endOperation(operationId, operationName, {
        ...(typeof metadata === 'object' && metadata !== null ? metadata : {}),
        error: true,
      });
      throw error;
    }
  }

  /**
   * Create a performance tracking decorator
   */
  createDecorator(operationName?: string) {
    return (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value;
      const operation = operationName || `${target.constructor.name}.${propertyKey}`;

      descriptor.value = async function (this: unknown, ...args: unknown[]) {
        return performanceLogger.trackFunction(operation, () => originalMethod.apply(this, args), {
          args: args.length,
        });
      };

      return descriptor;
    };
  }

  private determineLogLevel(metrics: PerformanceMetrics): string {
    // Slow operations (> 1 second) get warned
    if (metrics.duration > 1000) return 'warn';

    // Very slow operations (> 5 seconds) get error level
    if (metrics.duration > 5000) return 'error';

    // High memory usage gets warned
    if (metrics.memoryUsage && metrics.memoryUsage.heapUsed > 50 * 1024 * 1024) return 'warn';

    return 'info';
  }

  private generateOperationId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// ============================================================================
// STRUCTURED LOGGING UTILITIES
// ============================================================================

/**
 * Utilities for structured logging with consistent formats
 */
export class StructuredLogger {
  private readonly logger: ContextLogger;

  constructor(component: string) {
    this.logger = new ContextLogger();
    ContextLogger.setContext({ component });
  }

  /**
   * Log HTTP request/response
   */
  logHttpRequest(
    req: {
      method: string;
      url: string;
      headers?: unknown;
      body?: unknown;
    },
    res?: {
      statusCode: number;
      headers?: unknown;
      duration?: number;
    }
  ): void {
    this.logger.info('HTTP Request', {
      http: {
        request: {
          method: req.method,
          url: req.url,
          headers: this.sanitizeHeaders(req.headers),
          bodySize: req.body ? JSON.stringify(req.body).length : 0,
        },
        response: res
          ? {
              statusCode: res.statusCode,
              headers: this.sanitizeHeaders(res.headers),
              duration: res.duration,
            }
          : undefined,
      },
    });
  }

  /**
   * Log database operations
   */
  logDatabaseOperation(
    operation: string,
    table: string,
    duration: number,
    rowCount?: number
  ): void {
    this.logger.info('Database Operation', {
      database: {
        operation,
        table,
        duration,
        rowCount,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Log business events
   */
  logBusinessEvent(event: string, details: unknown): void {
    this.logger.info('Business Event', {
      business: {
        event,
        details,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Log external service calls
   */
  logExternalService(service: string, operation: string, duration: number, success: boolean): void {
    const level = success ? 'info' : 'warn';

    this.logger[level]('External Service Call', {
      external: {
        service,
        operation,
        duration,
        success,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private sanitizeHeaders(headers: unknown): unknown {
    if (!headers) return undefined;

    const sanitized = { ...(typeof headers === 'object' && headers !== null ? headers : {}) };

    // Remove sensitive headers
    const sanitizedObj = sanitized as Record<string, unknown>;
    delete sanitizedObj.authorization;
    delete sanitizedObj.cookie;
    delete sanitizedObj['x-api-key'];

    return sanitized;
  }
}

// ============================================================================
// LOG ANALYTICS AND QUERYING
// ============================================================================

/**
 * Log analytics and querying utilities
 */
export class LogAnalytics {
  private logs: LogEntry[] = [];

  constructor() {
    // In a real implementation, this would connect to a log aggregation system
    // For now, we'll maintain an in-memory collection for demonstration
  }

  /**
   * Add log entry for analysis
   */
  addLogEntry(level: string, message: string, meta: unknown): void {
    this.logs.push({
      timestamp: new Date(),
      level,
      message,
      meta: meta as { [key: string]: unknown; context?: LogContext },
    });

    // Keep only recent logs to prevent memory bloat
    if (this.logs.length > 10000) {
      this.logs = this.logs.slice(-5000);
    }
  }

  /**
   * Query logs with filters
   */
  queryLogs(filter: LogFilter, limit = 100): unknown[] {
    let filtered = this.logs;

    if (filter.level) {
      filtered = filtered.filter(log => filter.level!.includes(log.level));
    }

    if (filter.component) {
      filtered = filtered.filter(
        log => log.meta.context?.component && filter.component!.includes(log.meta.context.component)
      );
    }

    if (filter.userId) {
      filtered = filtered.filter(
        log => log.meta.context?.userId && filter.userId!.includes(log.meta.context.userId)
      );
    }

    if (filter.timeRange) {
      filtered = filtered.filter(
        log => log.timestamp >= filter.timeRange!.start && log.timestamp <= filter.timeRange!.end
      );
    }

    if (filter.tags) {
      filtered = filtered.filter(log => {
        const logTags = log.meta.context?.tags || {};
        return Object.entries(filter.tags!).every(([key, value]) => logTags[key] === value);
      });
    }

    return filtered.slice(-limit);
  }

  /**
   * Get log statistics
   */
  getStatistics(timeRange?: { start: Date; end: Date }): {
    totalLogs: number;
    levelDistribution: Record<string, number>;
    topComponents: Array<{ component: string; count: number }>;
    errorRate: number;
  } {
    let { logs } = this;

    if (timeRange) {
      logs = logs.filter(log => log.timestamp >= timeRange.start && log.timestamp <= timeRange.end);
    }

    const levelDistribution: Record<string, number> = {};
    const componentCounts: Record<string, number> = {};
    let errorCount = 0;

    logs.forEach(log => {
      // Level distribution
      levelDistribution[log.level] = (levelDistribution[log.level] ?? 0) + 1;

      // Component distribution
      const component = log.meta.context?.component || 'unknown';
      componentCounts[component] = (componentCounts[component] ?? 0) + 1;

      // Error count
      if (log.level === 'error') {
        errorCount++;
      }
    });

    const topComponents = Object.entries(componentCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([component, count]) => ({ component, count }));

    return {
      totalLogs: logs.length,
      levelDistribution,
      topComponents,
      errorRate: logs.length > 0 ? (errorCount / logs.length) * 100 : 0,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

export const contextLogger = new ContextLogger();
export const auditLogger = new AuditLogger();
export const performanceLogger = new PerformanceLogger();
export const logAnalytics = new LogAnalytics();

// ============================================================================
// CONVENIENCE FUNCTIONS AND DECORATORS
// ============================================================================

/**
 * Performance tracking decorator
 */
export const TrackPerformance = (operationName?: string) =>
  performanceLogger.createDecorator(operationName);

/**
 * Audit logging decorator
 */
export const AuditAction =
  (action: string, resource: string) =>
  (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const context = ContextLogger.getContext();

      try {
        const result = await originalMethod.apply(this, args);

        auditLogger.logEvent({
          action,
          resource,
          resourceId: args[0] as string, // Assume first argument is resource ID
          userId: context.userId,
          timestamp: new Date(),
          outcome: 'success',
        });

        return result;
      } catch (error) {
        auditLogger.logEvent({
          action,
          resource,
          resourceId: args[0] as string,
          userId: context.userId,
          timestamp: new Date(),
          outcome: 'failure',
          details: { error: (error as Error).message },
        });

        throw error;
      }
    };

    return descriptor;
  };

/**
 * Enhanced logging function with context
 */
export const logWithContext = (level: string, message: string, meta: unknown = {}) => {
  contextLogger[level as keyof ContextLogger](message, meta);
};

// Hook into Winston to capture logs for analytics
const originalLog = logger.log;
// @ts-ignore - Overriding Winston logger method for analytics
logger.log = function (level: unknown, message: unknown, meta: unknown = {}) {
  logAnalytics.addLogEntry(
    typeof level === 'string' ? level : (level as { level: string }).level,
    typeof message === 'string' ? message : JSON.stringify(message),
    meta
  );

  return originalLog.call(this, level, message);
};
