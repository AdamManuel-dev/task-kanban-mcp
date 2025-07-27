/* eslint-disable max-classes-per-file, no-param-reassign, default-param-last */
import { logger } from '@/utils/logger';
import type { ServiceError } from '@/types';
import { isError, isRecord, getErrorMessage } from './typeGuards';

/**
 * Structured error details type
 */
export type ErrorDetails =
  | string
  | number
  | boolean
  | null
  | undefined
  | { [key: string]: ErrorDetails }
  | ErrorDetails[];

export interface ErrorContext {
  service: string;
  method: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export class BaseServiceError extends Error implements ServiceError {
  public readonly code: string;

  public readonly statusCode: number;

  public readonly details?: ErrorDetails;

  public readonly context?: ErrorContext | undefined;

  public readonly timestamp: Date;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: ErrorDetails,
    context?: ErrorContext
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.context = context ?? undefined;
    this.timestamp = new Date();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

// Specific error classes remain the same...
export class ValidationError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('VALIDATION_ERROR', message, 400, details, context);
  }
}

export class NotFoundError extends BaseServiceError {
  constructor(resource: string, id?: string | number, context?: ErrorContext) {
    const identifier = id !== undefined ? id : 'unknown';
    const message =
      id !== undefined
        ? `${String(resource)} with identifier '${String(identifier)}' not found`
        : `${String(resource)} not found`;
    super('NOT_FOUND', message, 404, { resource, identifier }, context);
  }
}

export class ConflictError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('CONFLICT', message, 409, details, context);
  }
}

export class UnauthorizedError extends BaseServiceError {
  constructor(
    message: string = 'Authentication required',
    details?: ErrorDetails,
    context?: ErrorContext
  ) {
    super('UNAUTHORIZED', message, 401, details, context);
  }
}

export class ForbiddenError extends BaseServiceError {
  constructor(message: string = 'Forbidden', details?: ErrorDetails, context?: ErrorContext) {
    super('FORBIDDEN', message, 403, details, context);
  }
}

export class InternalServerError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('INTERNAL_SERVER_ERROR', message, 500, details, context);
  }
}

export class DatabaseError extends BaseServiceError {
  constructor(message: string, originalError?: Error | ErrorDetails, context?: ErrorContext) {
    const details =
      originalError instanceof Error
        ? { originalError: originalError.message }
        : (originalError ?? { originalError: undefined });
    super('DATABASE_ERROR', message, 500, details, context);
  }
}

export class DependencyError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('DEPENDENCY_ERROR', message, 400, details, context);
  }
}

export class RateLimitError extends BaseServiceError {
  constructor(
    message: string = 'Rate limit exceeded',
    details?: ErrorDetails,
    context?: ErrorContext
  ) {
    super('RATE_LIMIT_EXCEEDED', message, 429, details, context);
  }
}

export class ExternalServiceError extends BaseServiceError {
  constructor(service: string, message: string, details?: ErrorDetails, context?: ErrorContext) {
    super(
      'EXTERNAL_SERVICE_ERROR',
      `${String(service)}: ${String(message)}`,
      502,
      details,
      context
    );
  }
}

/**
 * Type-safe error factory functions
 */
type ErrorFactory<T extends unknown[]> = (...args: T) => BaseServiceError;

export const createValidationError: ErrorFactory<[string, ErrorDetails?, ErrorContext?]> = (
  message,
  details,
  context
) => new ValidationError(message, details, context);

export const createNotFoundError: ErrorFactory<[string, string | number, ErrorContext?]> = (
  resource,
  id,
  context
) => new NotFoundError(resource, id, context);

export const createDatabaseError: ErrorFactory<[string, ErrorDetails?, ErrorContext?]> = (
  message,
  details,
  context
) => new DatabaseError(message, details, context);

/**
 * Error handler manager for custom error handling
 */
export type ErrorHandler = (error: Error, context?: ErrorContext) => ServiceError;

export class ErrorHandlerManager {
  private readonly handlers: Map<string, ErrorHandler> = new Map();

  registerHandler(errorType: string, handler: ErrorHandler): void {
    this.handlers.set(errorType, handler);
  }

  handleError(error: Error, context?: ErrorContext): ServiceError {
    if (error instanceof BaseServiceError) {
      return error;
    }

    const errorType = error.constructor.name;
    const handler = this.handlers.get(errorType);

    if (handler) {
      return handler(error, context);
    }

    // Default to generic error handling
    return ErrorHandlerManager.handleGenericError(error, context);
  }

  private static handleGenericError(error: Error, context?: ErrorContext): ServiceError {
    if (error.message.includes('UNIQUE constraint failed')) {
      return new ConflictError(
        'Resource already exists',
        { originalError: error.message },
        context
      );
    }

    if (error.message.includes('FOREIGN KEY constraint failed')) {
      return new ValidationError(
        'Invalid reference to related resource',
        { originalError: error.message },
        context
      );
    }

    if (error.message.includes('NOT NULL constraint failed')) {
      return new ValidationError(
        'Required field is missing',
        { originalError: error.message },
        context
      );
    }

    if (error.message.includes('CHECK constraint failed')) {
      return new ValidationError('Invalid field value', { originalError: error.message }, context);
    }

    if (error.message.includes('database is locked')) {
      return new BaseServiceError(
        'DATABASE_BUSY',
        'Database is temporarily busy',
        503,
        { originalError: error.message },
        context
      );
    }

    if (error.message.includes('no such table')) {
      return new BaseServiceError(
        'DATABASE_SCHEMA_ERROR',
        'Database schema error',
        500,
        { originalError: error.message },
        context
      );
    }

    return new BaseServiceError(
      'INTERNAL_ERROR',
      'An internal error occurred',
      500,
      { originalError: error.message },
      context
    );
  }
}

/**
 * Global error handler with proper typing
 */
class GlobalErrorHandler {
  private readonly errorHandlers = new Map<
    string,
    (error: unknown, context: ErrorContext) => BaseServiceError
  >();

  constructor() {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    this.registerHandler('ValidationError', (error: unknown, context: ErrorContext) => {
      const message = getErrorMessage(error);
      return new ValidationError(message, undefined, context);
    });

    this.registerHandler('ZodError', (error: unknown, context: ErrorContext) => {
      const zodError = error as any;
      const messages = zodError.errors?.map(
        (err: any) => `${String(err.path.join('.'))}: ${String(err.message)}`
      ) || [getErrorMessage(error)];
      return new ValidationError(
        `Validation failed: ${String(messages.join(', '))}`,
        zodError.errors,
        context
      );
    });

    this.registerHandler('TypeError', (error: unknown, context: ErrorContext) => {
      const message = getErrorMessage(error);
      if (message.includes('Cannot read') || message.includes('undefined')) {
        return new BaseServiceError(
          'INVALID_INPUT',
          'Invalid input data structure',
          400,
          { originalError: message },
          context
        );
      }
      return new BaseServiceError(
        'TYPE_ERROR',
        'Type error occurred',
        500,
        { originalError: message },
        context
      );
    });

    // Add more default handlers...
  }

  registerHandler(
    errorName: string,
    handler: (error: unknown, context: ErrorContext) => BaseServiceError
  ): void {
    this.errorHandlers.set(errorName, handler);
  }

  handleError(error: unknown, context: ErrorContext): BaseServiceError {
    // If already a BaseServiceError, enhance with context
    if (error instanceof BaseServiceError) {
      if (!error.context) {
        // Create a new instance of the same error type with context
        if (error instanceof ValidationError) {
          return new ValidationError(error.message, error.details, context);
        }
        if (error instanceof NotFoundError) {
          return new NotFoundError(
            ((error.details as Record<string, unknown>)?.resource as string) || 'Resource',
            ((error.details as Record<string, unknown>)?.identifier as string | number) ||
              'unknown',
            context
          );
        }
        if (error instanceof ConflictError) {
          return new ConflictError(error.message, error.details, context);
        }
        if (error instanceof DatabaseError) {
          return new DatabaseError(error.message, error.details, context);
        }
        // For other error types, return as is with context
        return new BaseServiceError(
          error.code,
          error.message,
          error.statusCode,
          error.details,
          context
        );
      }
      return error;
    }

    // Handle Error instances
    if (isError(error)) {
      const handler = this.errorHandlers.get(error.name);
      if (handler) {
        return handler(error, context);
      }

      // Default error handling
      return new InternalServerError(
        error.message,
        {
          errorName: error.name,
          stack: error.stack,
          originalError: error.message,
        },
        context
      );
    }

    // Handle unknown errors
    return new InternalServerError(
      'An unexpected error occurred',
      { originalError: getErrorMessage(error) },
      context
    );
  }
}

export const globalErrorHandler = new GlobalErrorHandler();

/**
 * Type-safe service error handler decorator
 */
export function createServiceErrorHandler(serviceName: string) {
  return function handleServiceError<T extends Record<string, unknown>>(
    _target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: T, ...args: unknown[]): Promise<unknown> {
      const context: ErrorContext = {
        service: serviceName,
        method: propertyKey,
        metadata: {
          args: args.map((arg, index) => ({
            index,
            type: typeof arg,
            value: typeof arg === 'object' ? '[object]' : String(arg),
          })),
        },
      };

      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const serviceError = globalErrorHandler.handleError(error, context);

        logger.error('Service method error', {
          service: serviceName,
          method: propertyKey,
          error: serviceError.toJSON(),
        });

        throw serviceError;
      }
    };

    return descriptor;
  };
}

/**
 * Type-safe error context wrapper
 */
export function withErrorContext<TFn extends (...args: unknown[]) => unknown>(
  fn: TFn,
  context: Partial<ErrorContext>
): TFn {
  return ((...args: unknown[]) => {
    try {
      const result = fn(...args);

      if (result instanceof Promise) {
        return result.catch((error: unknown) => {
          throw globalErrorHandler.handleError(error, context as ErrorContext);
        });
      }

      return result;
    } catch (error) {
      throw globalErrorHandler.handleError(error, context as ErrorContext);
    }
  }) as TFn;
}

/**
 * Type-safe error boundary class decorator
 */
export function createErrorBoundary(serviceName: string) {
  return function <T extends new (...args: any[]) => object>(constructor: T): T {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);

        const prototype = Object.getPrototypeOf(this);
        const methodNames = Object.getOwnPropertyNames(prototype).filter(
          name => name !== 'constructor' && typeof prototype[name] === 'function'
        );

        methodNames.forEach(methodName => {
          const originalMethod = (prototype as Record<string, unknown>)[methodName];
          if (typeof originalMethod === 'function') {
            (prototype as Record<string, unknown>)[methodName] = withErrorContext(
              originalMethod.bind(this),
              {
                service: serviceName,
                method: methodName,
              }
            );
          }
        });
      }
    } as T;
  };
}

export const ErrorCodes = {
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_TYPE: 'INVALID_TYPE',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // System
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Business logic
  DEPENDENCY_ERROR: 'DEPENDENCY_ERROR',
  CIRCULAR_DEPENDENCY: 'CIRCULAR_DEPENDENCY',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Retry logic with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 5000,
    backoffFactor = 2,
    shouldRetry = error => !(error instanceof ValidationError ?? error instanceof NotFoundError),
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  // eslint-disable-next-line no-await-in-loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries ?? !shouldRetry(error)) {
        throw error;
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Retry options interface
 */
export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  jitter: boolean;
}

/**
 * Retry function with exponential backoff and jitter
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context?: ErrorContext
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    exponentialBase = 2,
    jitter = true,
  } = options;

  let lastError: Error;

  // eslint-disable-next-line no-await-in-loop
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        break;
      }

      if (error instanceof BaseServiceError && !isRetryableError(error)) {
        break;
      }

      const delay = Math.min(baseDelay * exponentialBase ** (attempt - 1), maxDelay);

      const finalDelay = jitter ? delay * (0.5 + Math.random() * 0.5) : delay;

      logger.warn('Operation failed, retrying', {
        attempt,
        maxAttempts,
        delay: finalDelay,
        error: lastError.message,
        context,
      });

      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, finalDelay));
    }
  }

  throw globalErrorHandler.handleError(
    lastError!,
    context ?? {
      service: 'retry',
      method: 'withRetry',
    }
  );
}

function isRetryableError(error: BaseServiceError): boolean {
  const retryableCodes = [
    'DATABASE_BUSY',
    'EXTERNAL_SERVICE_TIMEOUT',
    'EXTERNAL_SERVICE_UNAVAILABLE',
    'SERVICE_UNAVAILABLE',
    'TIMEOUT',
  ];

  return retryableCodes.includes(error.code) || error.statusCode >= 500;
}

/**
 * Circuit breaker implementation
 */
export function createCircuitBreaker(
  name: string,
  options: {
    threshold: number;
    timeout: number;
    resetTimeout: number;
  }
) {
  let failures = 0;
  let lastFailureTime = 0;
  let state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  return async function <T>(operation: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (state === 'OPEN') {
      if (now - lastFailureTime >= options.resetTimeout) {
        state = 'HALF_OPEN';
        logger.info('Circuit breaker half-open', { name });
      } else {
        throw new BaseServiceError(
          'CIRCUIT_BREAKER_OPEN',
          `Circuit breaker ${String(name)} is open`,
          503
        );
      }
    }

    try {
      const result = await operation();

      if (state === 'HALF_OPEN') {
        state = 'CLOSED';
        failures = 0;
        logger.info('Circuit breaker closed', { name });
      }

      return result;
    } catch (error) {
      failures++;
      lastFailureTime = now;

      if (failures >= options.threshold) {
        state = 'OPEN';
        logger.error('Circuit breaker opened', { name, failures, threshold: options.threshold });
      }

      throw error;
    }
  };
}

/**
 * Aggregate multiple errors
 */
export class AggregateError extends BaseServiceError {
  public readonly errors: BaseServiceError[];

  constructor(errors: BaseServiceError[], context?: ErrorContext) {
    const errorMessages = errors.map(e => e.message).join('; ');
    super(
      'AGGREGATE_ERROR',
      `Multiple errors occurred: ${String(errorMessages)}`,
      500,
      { errors: errors.map(e => e.toJSON()) } as ErrorDetails,
      context
    );
    this.errors = errors;
  }
}

/**
 * Safe error serialization
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof BaseServiceError) {
    return error.toJSON();
  }

  if (isError(error)) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (isRecord(error)) {
    return error;
  }

  return {
    message: getErrorMessage(error),
    type: typeof error,
  };
}
