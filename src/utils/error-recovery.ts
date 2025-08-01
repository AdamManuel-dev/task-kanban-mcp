/**
 * @fileoverview Advanced error recovery and resilience utilities
 * @lastmodified 2025-07-28T08:30:00Z
 *
 * Features: Circuit breakers, bulkheads, health checks, error aggregation
 * Main APIs: ErrorRecoveryManager, HealthMonitor, BulkheadIsolation
 * Constraints: Requires metrics collection, periodic health checks
 * Patterns: Circuit breaker pattern, bulkhead isolation, graceful degradation
 */

import { logger } from './logger';
import { BaseServiceError, serializeError, globalErrorHandler } from './errors';
import type { ErrorContext } from './errors';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface RecoveryOptions {
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
  circuitBreaker?: CircuitBreakerConfig;
  bulkhead?: BulkheadConfig;
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  monitoringPeriod: number;
}

export interface BulkheadConfig {
  name: string;
  maxConcurrency: number;
  queueSize: number;
  timeout: number;
}

export interface HealthCheckConfig {
  name: string;
  check: () => Promise<boolean>;
  interval: number;
  timeout: number;
  retries: number;
}

export interface ErrorPattern {
  pattern: RegExp;
  recoverable: boolean;
  skipRetry: boolean;
  customHandler?: (error: Error) => Promise<void>;
}

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  private failures = 0;

  private successes = 0;

  private lastFailureTime = 0;

  private nextAttemptTime = 0;

  constructor(private readonly config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const canExecute = this.canExecute();

    if (!canExecute) {
      throw new BaseServiceError(
        'CIRCUIT_BREAKER_OPEN',
        `Circuit breaker ${this.config.name} is open`,
        503,
        {
          state: this.state,
          failures: this.failures,
          nextAttemptTime: this.nextAttemptTime,
        }
      );
    }

    try {
      const result = (await Promise.race([operation(), this.createTimeoutPromise()])) as T;

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  private canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case 'CLOSED':
        return true;
      case 'OPEN':
        if (now >= this.nextAttemptTime) {
          this.state = 'HALF_OPEN';
          this.successes = 0;
          logger.info('Circuit breaker transitioning to HALF_OPEN', {
            name: this.config.name,
          });
          return true;
        }
        return false;
      case 'HALF_OPEN':
        return true;
      default:
        return false;
    }
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'CLOSED';
        logger.info('Circuit breaker closed', {
          name: this.config.name,
          successes: this.successes,
        });
      }
    }
  }

  private onFailure(error: Error): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.config.timeout;
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.config.timeout;

      logger.error('Circuit breaker opened', {
        name: this.config.name,
        failures: this.failures,
        threshold: this.config.failureThreshold,
        error: serializeError(error),
      });
    }
  }

  private async createTimeoutPromise<T>(): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new BaseServiceError(
            'OPERATION_TIMEOUT',
            `Operation timed out after ${this.config.timeout}ms`,
            408
          )
        );
      }, this.config.timeout);
    });
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }
}

// ============================================================================
// BULKHEAD ISOLATION
// ============================================================================

export class BulkheadIsolation {
  private activeRequests = 0;

  private readonly queue: Array<{
    operation: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
    timestamp: number;
  }> = [];

  constructor(private readonly config: BulkheadConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.activeRequests < this.config.maxConcurrency) {
        this.executeImmediate(operation, resolve as (value: T | PromiseLike<T>) => void, reject);
      } else if (this.queue.length < this.config.queueSize) {
        this.queue.push({
          operation,
          resolve: resolve as (value: unknown) => void,
          reject,
          timestamp: Date.now(),
        });
      } else {
        reject(
          new BaseServiceError(
            'BULKHEAD_OVERFLOW',
            `Bulkhead ${this.config.name} queue is full`,
            503,
            {
              activeRequests: this.activeRequests,
              queueSize: this.queue.length,
              maxConcurrency: this.config.maxConcurrency,
            }
          )
        );
      }
    });
  }

  private async executeImmediate<T>(
    operation: () => Promise<T>,
    resolve: (value: T) => void,
    reject: (error: unknown) => void
  ): Promise<void> {
    this.activeRequests++;

    try {
      const result = (await Promise.race([operation(), this.createTimeoutPromise()])) as T;
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.activeRequests < this.config.maxConcurrency) {
      const item = this.queue.shift()!;

      // Check if request has timed out while in queue
      if (Date.now() - item.timestamp > this.config.timeout) {
        item.reject(
          new BaseServiceError('QUEUE_TIMEOUT', 'Request timed out while waiting in queue', 408)
        );
        this.processQueue(); // Try next item
        return;
      }

      this.executeImmediate(item.operation, item.resolve, item.reject);
    }
  }

  private async createTimeoutPromise<T>(): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new BaseServiceError(
            'BULKHEAD_TIMEOUT',
            `Operation timed out after ${this.config.timeout}ms`,
            408
          )
        );
      }, this.config.timeout);
    });
  }

  getStats() {
    return {
      activeRequests: this.activeRequests,
      queueSize: this.queue.length,
      maxConcurrency: this.config.maxConcurrency,
      maxQueueSize: this.config.queueSize,
    };
  }
}

// ============================================================================
// HEALTH MONITORING
// ============================================================================

export class HealthMonitor {
  private readonly healthChecks = new Map<string, HealthCheckConfig>();

  private readonly healthStatus = new Map<string, boolean>();

  private readonly intervals = new Map<string, NodeJS.Timeout>();

  registerHealthCheck(config: HealthCheckConfig): void {
    this.healthChecks.set(config.name, config);
    this.healthStatus.set(config.name, true); // Assume healthy initially

    const interval = setInterval(async () => {
      await this.performHealthCheck(config);
    }, config.interval);

    this.intervals.set(config.name, interval);

    // Perform initial check
    this.performHealthCheck(config);
  }

  private async performHealthCheck(config: HealthCheckConfig): Promise<void> {
    let attempts = 0;
    let healthy = false;

    while (attempts < config.retries && !healthy) {
      try {
        const result = await Promise.race([
          config.check(),
          new Promise<boolean>((_, reject) => {
            setTimeout(() => reject(new Error('Health check timeout')), config.timeout);
          }),
        ]);

        healthy = result;
        break;
      } catch (error) {
        attempts++;
        logger.warn('Health check failed', {
          name: config.name,
          attempt: attempts,
          error: serializeError(error),
        });

        if (attempts < config.retries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    const previousStatus = this.healthStatus.get(config.name);
    this.healthStatus.set(config.name, healthy);

    if (previousStatus !== healthy) {
      logger.info('Health status changed', {
        name: config.name,
        healthy,
        previousStatus,
      });
    }
  }

  isHealthy(name?: string): boolean {
    if (name) {
      return this.healthStatus.get(name) ?? false;
    }

    // Check overall health
    return Array.from(this.healthStatus.values()).every(status => status);
  }

  getHealthStatus(): Record<string, boolean> {
    return Object.fromEntries(this.healthStatus);
  }

  shutdown(): void {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
  }
}

// ============================================================================
// ERROR RECOVERY MANAGER
// ============================================================================

export class ErrorRecoveryManager {
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();

  private readonly bulkheads = new Map<string, BulkheadIsolation>();

  private readonly errorPatterns: ErrorPattern[] = [];

  private readonly healthMonitor = new HealthMonitor();

  constructor() {
    this.registerDefaultPatterns();
  }

  private registerDefaultPatterns(): void {
    // Database connection errors - recoverable
    this.addErrorPattern({
      pattern: /database.*locked|SQLITE_BUSY|connection.*timeout/i,
      recoverable: true,
      skipRetry: false,
    });

    // Network errors - recoverable
    this.addErrorPattern({
      pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i,
      recoverable: true,
      skipRetry: false,
    });

    // Validation errors - not recoverable
    this.addErrorPattern({
      pattern: /validation.*failed|invalid.*input|bad.*request/i,
      recoverable: false,
      skipRetry: true,
    });

    // Permission errors - not recoverable
    this.addErrorPattern({
      pattern: /unauthorized|forbidden|permission.*denied/i,
      recoverable: false,
      skipRetry: true,
    });
  }

  addErrorPattern(pattern: ErrorPattern): void {
    this.errorPatterns.push(pattern);
  }

  createCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
    const breaker = new CircuitBreaker(config);
    this.circuitBreakers.set(config.name, breaker);
    return breaker;
  }

  createBulkhead(config: BulkheadConfig): BulkheadIsolation {
    const bulkhead = new BulkheadIsolation(config);
    this.bulkheads.set(config.name, bulkhead);
    return bulkhead;
  }

  registerHealthCheck(config: HealthCheckConfig): void {
    this.healthMonitor.registerHealthCheck(config);
  }

  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    options: Partial<RecoveryOptions> = {},
    context?: ErrorContext
  ): Promise<T> {
    const config = {
      maxRetries: 3,
      backoffStrategy: 'exponential' as const,
      baseDelay: 1000,
      maxDelay: 10000,
      jitter: true,
      ...options,
    };

    let lastError: Error;
    let delay = config.baseDelay;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        let wrappedOperation = operation;

        // Apply circuit breaker if configured
        if (config.circuitBreaker) {
          const breaker =
            this.circuitBreakers.get(config.circuitBreaker.name) ||
            this.createCircuitBreaker(config.circuitBreaker);
          wrappedOperation = async () => breaker.execute(operation);
        }

        // Apply bulkhead if configured
        if (config.bulkhead) {
          const bulkhead =
            this.bulkheads.get(config.bulkhead.name) || this.createBulkhead(config.bulkhead);
          const prevWrapped = wrappedOperation;
          wrappedOperation = async () => bulkhead.execute(prevWrapped);
        }

        return await wrappedOperation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === config.maxRetries) {
          break;
        }

        const pattern = this.findMatchingPattern(lastError);
        if (pattern?.skipRetry) {
          break;
        }

        if (pattern?.customHandler) {
          await pattern.customHandler(lastError);
        }

        logger.warn('Operation failed, retrying', {
          attempt: attempt + 1,
          maxRetries: config.maxRetries,
          delay,
          error: serializeError(lastError),
          context,
        });

        await this.sleep(this.calculateDelay(delay, config));
        delay = this.updateDelay(delay, config);
      }
    }

    throw globalErrorHandler.handleError(
      lastError!,
      context || {
        service: 'ErrorRecoveryManager',
        method: 'executeWithRecovery',
      }
    );
  }

  private findMatchingPattern(error: Error): ErrorPattern | undefined {
    return this.errorPatterns.find(pattern => pattern.pattern.test(error.message));
  }

  private calculateDelay(baseDelay: number, config: Partial<RecoveryOptions>): number {
    let delay = baseDelay;

    if (config.jitter) {
      delay *= 0.5 + Math.random() * 0.5;
    }

    return Math.min(delay, config.maxDelay || 10000);
  }

  private updateDelay(currentDelay: number, config: Partial<RecoveryOptions>): number {
    switch (config.backoffStrategy) {
      case 'linear':
        return currentDelay + (config.baseDelay || 1000);
      case 'exponential':
        return currentDelay * 2;
      case 'fixed':
      default:
        return currentDelay;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getSystemHealth(): {
    healthy: boolean;
    services: Record<string, boolean>;
    circuitBreakers: Record<string, unknown>;
    bulkheads: Record<string, unknown>;
  } {
    const circuitBreakerStats = Object.fromEntries(
      Array.from(this.circuitBreakers.entries()).map(([name, breaker]) => [
        name,
        breaker.getState(),
      ])
    );

    const bulkheadStats = Object.fromEntries(
      Array.from(this.bulkheads.entries()).map(([name, bulkhead]) => [name, bulkhead.getStats()])
    );

    return {
      healthy: this.healthMonitor.isHealthy(),
      services: this.healthMonitor.getHealthStatus(),
      circuitBreakers: circuitBreakerStats,
      bulkheads: bulkheadStats,
    };
  }

  shutdown(): void {
    this.healthMonitor.shutdown();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const errorRecoveryManager = new ErrorRecoveryManager();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export const withCircuitBreaker = async <T>(
  operation: () => Promise<T>,
  config: CircuitBreakerConfig
): Promise<T> =>
  errorRecoveryManager.executeWithRecovery(operation, {
    circuitBreaker: config,
  });

export const withBulkhead = async <T>(
  operation: () => Promise<T>,
  config: BulkheadConfig
): Promise<T> =>
  errorRecoveryManager.executeWithRecovery(operation, {
    bulkhead: config,
  });

export const withFullRecovery = async <T>(
  operation: () => Promise<T>,
  options: RecoveryOptions
): Promise<T> => errorRecoveryManager.executeWithRecovery(operation, options);
