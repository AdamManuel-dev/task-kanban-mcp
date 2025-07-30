/**
 * @fileoverview Distributed tracing middleware for request tracking
 * @lastmodified 2025-07-28T13:15:00Z
 *
 * Features: Request tracing, span creation, correlation IDs, performance monitoring
 * Main APIs: tracingMiddleware(), createSpan(), TraceManager class
 * Constraints: Requires trace storage, performance overhead management
 * Patterns: OpenTelemetry-like tracing, correlation context, hierarchical spans
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, unknown>;
  logs: TraceLog[];
  status: 'started' | 'finished' | 'error';
  baggage: Record<string, string>;
}

export interface TraceLog {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, unknown>;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  baggage: Record<string, string>;
}

export interface TracingConfig {
  serviceName: string;
  environment: string;
  version: string;
  samplingRate: number; // 0.0 to 1.0
  maxSpansPerTrace: number;
  maxTraceDuration: number; // milliseconds
  enabledOperations: string[];
  exporters: TracingExporter[];
}

export interface TracingExporter {
  name: string;
  export: (spans: TraceSpan[]) => Promise<void>;
}

export interface TracingStats {
  totalTraces: number;
  totalSpans: number;
  activeTraces: number;
  averageTraceDuration: number;
  errorRate: number;
  samplingRate: number;
  exportedSpans: number;
  droppedSpans: number;
}

export class TraceManager {
  private readonly traces: Map<string, TraceSpan[]> = new Map();

  private readonly activeSpans: Map<string, TraceSpan> = new Map();

  private readonly config: TracingConfig;

  private readonly stats: TracingStats;

  private exportTimer?: NodeJS.Timeout;

  constructor(config: Partial<TracingConfig> = {}) {
    this.config = {
      serviceName: 'mcp-kanban',
      environment: process.env.NODE_ENV ?? 'development',
      version: process.env.npm_package_version ?? '1.0.0',
      samplingRate: 0.1, // 10% sampling by default
      maxSpansPerTrace: 100,
      maxTraceDuration: 5 * 60 * 1000, // 5 minutes
      enabledOperations: ['http', 'db', 'external'],
      exporters: [],
      ...config,
    };

    this.stats = {
      totalTraces: 0,
      totalSpans: 0,
      activeTraces: 0,
      averageTraceDuration: 0,
      errorRate: 0,
      samplingRate: this.config.samplingRate,
      exportedSpans: 0,
      droppedSpans: 0,
    };

    this.startExportTimer();

    logger.info('TraceManager initialized', {
      serviceName: this.config.serviceName,
      samplingRate: this.config.samplingRate,
    });
  }

  /**
   * Create a new trace with root span
   */
  createTrace(operationName: string, tags: Record<string, unknown> = {}): TraceSpan {
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();

    const rootSpan: TraceSpan = {
      traceId,
      spanId,
      operationName,
      startTime: Date.now(),
      tags: {
        'service.name': this.config.serviceName,
        'service.version': this.config.version,
        'service.environment': this.config.environment,
        'span.kind': 'server',
        ...tags,
      },
      logs: [],
      status: 'started',
      baggage: {},
    };

    this.traces.set(traceId, [rootSpan]);
    this.activeSpans.set(spanId, rootSpan);
    this.stats.totalTraces++;
    this.stats.totalSpans++;
    this.stats.activeTraces++;

    logger.debug('Trace created', { traceId, spanId, operationName });
    return rootSpan;
  }

  /**
   * Create a child span
   */
  createSpan(
    operationName: string,
    parentSpan: TraceSpan,
    tags: Record<string, unknown> = {}
  ): TraceSpan {
    const spans = this.traces.get(parentSpan.traceId);
    if (!spans) {
      throw new Error(`Trace not found: ${parentSpan.traceId}`);
    }

    if (spans.length >= this.config.maxSpansPerTrace) {
      logger.warn('Max spans per trace exceeded', {
        traceId: parentSpan.traceId,
        maxSpans: this.config.maxSpansPerTrace,
      });
      this.stats.droppedSpans++;
      return parentSpan; // Return parent span to continue tracing
    }

    const spanId = this.generateSpanId();
    const childSpan: TraceSpan = {
      traceId: parentSpan.traceId,
      spanId,
      parentSpanId: parentSpan.spanId,
      operationName,
      startTime: Date.now(),
      tags: {
        'service.name': this.config.serviceName,
        ...tags,
      },
      logs: [],
      status: 'started',
      baggage: { ...parentSpan.baggage },
    };

    spans.push(childSpan);
    this.activeSpans.set(spanId, childSpan);
    this.stats.totalSpans++;

    logger.debug('Child span created', {
      traceId: parentSpan.traceId,
      spanId,
      parentSpanId: parentSpan.spanId,
      operationName,
    });

    return childSpan;
  }

  /**
   * Finish a span
   */
  finishSpan(span: TraceSpan, error?: Error): void {
    const endTime = Date.now();
    const duration = endTime - span.startTime;

    span.endTime = endTime;
    span.duration = duration;
    span.status = error ? 'error' : 'finished';

    if (error) {
      span.tags.error = true;
      span.tags['error.message'] = error.message;
      span.tags['error.stack'] = error.stack;
      this.logToSpan(span, 'error', 'Span finished with error', {
        error: error.message,
      });
    }

    this.activeSpans.delete(span.spanId);

    // Check if this is the root span (no parent)
    if (!span.parentSpanId) {
      this.stats.activeTraces--;

      // Update average trace duration
      const currentAvg = this.stats.averageTraceDuration;
      const { totalTraces } = this.stats;
      this.stats.averageTraceDuration = (currentAvg * (totalTraces - 1) + duration) / totalTraces;

      // Schedule trace for export if it exceeds max duration
      if (duration > this.config.maxTraceDuration) {
        logger.warn('Long-running trace detected', {
          traceId: span.traceId,
          duration,
          maxDuration: this.config.maxTraceDuration,
        });
      }
    }

    logger.debug('Span finished', {
      traceId: span.traceId,
      spanId: span.spanId,
      operationName: span.operationName,
      duration,
      status: span.status,
    });
  }

  /**
   * Add a log entry to a span
   */
  logToSpan(
    span: TraceSpan,
    level: TraceLog['level'],
    message: string,
    fields?: Record<string, unknown>
  ): void {
    const log: TraceLog = {
      timestamp: Date.now(),
      level,
      message,
      fields,
    };

    span.logs.push(log);

    logger.debug('Log added to span', {
      traceId: span.traceId,
      spanId: span.spanId,
      level,
      message,
    });
  }

  /**
   * Add a tag to a span
   */
  setSpanTag(span: TraceSpan, key: string, value: unknown): void {
    span.tags[key] = value;
  }

  /**
   * Set baggage item (propagated to child spans)
   */
  setBaggage(span: TraceSpan, key: string, value: string): void {
    span.baggage[key] = value;
  }

  /**
   * Get baggage item
   */
  getBaggage(span: TraceSpan, key: string): string | undefined {
    return span.baggage[key];
  }

  /**
   * Extract trace context from headers
   */
  extractContext(headers: Record<string, string | string[] | undefined>): TraceContext | null {
    const traceHeader = headers['x-trace-id'];
    const spanHeader = headers['x-span-id'];
    const baggageHeader = headers['x-trace-baggage'];

    if (typeof traceHeader !== 'string' || typeof spanHeader !== 'string') {
      return null;
    }

    let baggage: Record<string, string> = {};
    if (typeof baggageHeader === 'string') {
      try {
        baggage = JSON.parse(baggageHeader);
      } catch (error) {
        logger.warn('Failed to parse baggage header', { baggageHeader, error });
      }
    }

    return {
      traceId: traceHeader,
      spanId: spanHeader,
      baggage,
    };
  }

  /**
   * Inject trace context into headers
   */
  injectContext(span: TraceSpan, headers: Record<string, string>): void {
    headers['x-trace-id'] = span.traceId;
    headers['x-span-id'] = span.spanId;

    if (Object.keys(span.baggage).length > 0) {
      headers['x-trace-baggage'] = JSON.stringify(span.baggage);
    }
  }

  /**
   * Check if operation should be traced based on sampling
   */
  shouldTrace(operationName: string): boolean {
    // Check if operation is enabled
    if (
      !this.config.enabledOperations.includes('*') &&
      !this.config.enabledOperations.some(op => operationName.includes(op))
    ) {
      return false;
    }

    // Apply sampling rate
    return Math.random() < this.config.samplingRate;
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): TraceSpan[] | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Get active span by ID
   */
  getActiveSpan(spanId: string): TraceSpan | undefined {
    return this.activeSpans.get(spanId);
  }

  /**
   * Get all traces (for debugging)
   */
  getAllTraces(): Map<string, TraceSpan[]> {
    return new Map(this.traces);
  }

  /**
   * Get tracing statistics
   */
  getStats(): TracingStats {
    // Calculate error rate
    const totalFinishedSpans = this.stats.totalSpans - this.activeSpans.size;
    const errorSpans = Array.from(this.traces.values())
      .flat()
      .filter(span => span.status === 'error').length;

    this.stats.errorRate = totalFinishedSpans > 0 ? errorSpans / totalFinishedSpans : 0;
    this.stats.activeTraces = this.traces.size;

    return { ...this.stats };
  }

  /**
   * Clear completed traces older than threshold
   */
  cleanupTraces(maxAge: number = 10 * 60 * 1000): number {
    // 10 minutes default
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;

    for (const [traceId, spans] of this.traces) {
      const rootSpan = spans.find(span => !span.parentSpanId);
      if (rootSpan?.endTime && rootSpan.endTime < cutoff) {
        this.traces.delete(traceId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up old traces', { cleaned, maxAge });
    }

    return cleaned;
  }

  /**
   * Export traces to configured exporters
   */
  private async exportTraces(): Promise<void> {
    if (this.config.exporters.length === 0) return;

    const completedSpans: TraceSpan[] = [];

    for (const spans of this.traces.values()) {
      completedSpans.push(...spans.filter(span => span.status !== 'started'));
    }

    if (completedSpans.length === 0) return;

    for (const exporter of this.config.exporters) {
      try {
        await exporter.export(completedSpans);
        this.stats.exportedSpans += completedSpans.length;
        logger.debug('Spans exported', {
          exporter: exporter.name,
          count: completedSpans.length,
        });
      } catch (error) {
        logger.error('Failed to export spans', {
          exporter: exporter.name,
          error,
        });
      }
    }
  }

  /**
   * Start periodic export timer
   */
  private startExportTimer(): void {
    this.exportTimer = setInterval(async () => {
      await this.exportTraces();
      this.cleanupTraces();
    }, 30000); // Export every 30 seconds
  }

  /**
   * Stop export timer
   */
  stop(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = undefined;
    }
  }

  /**
   * Generate unique trace ID
   */
  private generateTraceId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generate unique span ID
   */
  private generateSpanId(): string {
    return crypto.randomBytes(8).toString('hex');
  }
}

// Global trace manager instance
const globalTraceManager = new TraceManager();

/**
 * Express middleware for distributed tracing
 */
export function tracingMiddleware(config: Partial<TracingConfig> = {}) {
  const traceManager = new TraceManager(config);

  return (req: Request, res: Response, next: NextFunction): void => {
    const operationName = `${req.method} ${req.route?.path || req.path}`;

    // Check if we should trace this request
    if (!traceManager.shouldTrace(operationName)) {
      return next();
    }

    // Extract existing trace context
    const existingContext = traceManager.extractContext(req.headers);

    let rootSpan: TraceSpan;

    if (existingContext) {
      // Continue existing trace
      const parentSpan = traceManager.getActiveSpan(existingContext.spanId);
      if (parentSpan) {
        rootSpan = traceManager.createSpan(operationName, parentSpan, {
          'http.method': req.method,
          'http.url': req.url,
          'http.path': req.path,
          'http.query': JSON.stringify(req.query),
          'user.agent': req.headers['user-agent'],
        });
      } else {
        // Parent span not found, create new trace
        rootSpan = traceManager.createTrace(operationName, {
          'http.method': req.method,
          'http.url': req.url,
          'http.path': req.path,
          'http.query': JSON.stringify(req.query),
          'user.agent': req.headers['user-agent'],
        });
      }
    } else {
      // Create new trace
      rootSpan = traceManager.createTrace(operationName, {
        'http.method': req.method,
        'http.url': req.url,
        'http.path': req.path,
        'http.query': JSON.stringify(req.query),
        'user.agent': req.headers['user-agent'],
      });
    }

    // Attach span to request for use in handlers
    (req as unknown).traceSpan = rootSpan;
    (req as unknown).traceManager = traceManager;

    // Inject trace context into response headers
    traceManager.injectContext(rootSpan, res.getHeaders() as Record<string, string>);

    // Hook into response to finish span
    const originalSend = res.send;
    res.send = function (body: unknown) {
      traceManager.setSpanTag(rootSpan, 'http.status_code', res.statusCode);
      traceManager.setSpanTag(rootSpan, 'http.response_size', Buffer.byteLength(body || ''));

      if (res.statusCode >= 400) {
        const error = new Error(`HTTP ${res.statusCode}`);
        traceManager.finishSpan(rootSpan, error);
      } else {
        traceManager.finishSpan(rootSpan);
      }

      return originalSend.call(this, body);
    };

    next();
  };
}

/**
 * Get current trace span from request
 */
export function getCurrentSpan(req: Request): TraceSpan | undefined {
  return (req as unknown).traceSpan;
}

/**
 * Get trace manager from request
 */
export function getTraceManager(req: Request): TraceManager | undefined {
  return (req as unknown).traceManager || globalTraceManager;
}

/**
 * Create a custom span for database operations
 */
export function createDatabaseSpan(
  parentSpan: TraceSpan,
  operation: string,
  table: string,
  query?: string
): TraceSpan {
  return globalTraceManager.createSpan(`db.${operation}`, parentSpan, {
    'db.type': 'sqlite',
    'db.table': table,
    'db.statement': query,
    'span.kind': 'client',
  });
}

/**
 * Create a custom span for external API calls
 */
export function createExternalSpan(
  parentSpan: TraceSpan,
  service: string,
  endpoint: string,
  method = 'GET'
): TraceSpan {
  return globalTraceManager.createSpan(`external.${service}`, parentSpan, {
    'http.method': method,
    'http.url': endpoint,
    'service.name': service,
    'span.kind': 'client',
  });
}

/**
 * Console exporter for development
 */
export class ConsoleTraceExporter implements TracingExporter {
  name = 'console';

  async export(spans: TraceSpan[]): Promise<void> {
    for (const span of spans) {
      logger.debug('📊 Trace Span:', {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        operationName: span.operationName,
        duration: span.duration,
        status: span.status,
        tags: span.tags,
        logs: span.logs.length,
      });
    }
  }
}

export { globalTraceManager };
