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
    this.context = context;
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
  constructor(resource: string, id: string | number, context?: ErrorContext) {
    super('NOT_FOUND', `${resource} with id ${id} not found`, 404, { resource, id }, context);
  }
}

export class ConflictError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('CONFLICT', message, 409, details, context);
  }
}

export class UnauthorizedError extends BaseServiceError {
  constructor(message: string = 'Unauthorized', context?: ErrorContext) {
    super('UNAUTHORIZED', message, 401, undefined, context);
  }
}

export class ForbiddenError extends BaseServiceError {
  constructor(message: string = 'Forbidden', context?: ErrorContext) {
    super('FORBIDDEN', message, 403, undefined, context);
  }
}

export class InternalServerError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('INTERNAL_SERVER_ERROR', message, 500, details, context);
  }
}

export class DatabaseError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('DATABASE_ERROR', message, 500, details, context);
  }
}

export class DependencyError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('DEPENDENCY_ERROR', message, 400, details, context);
  }
}

export class RateLimitError extends BaseServiceError {
  constructor(message: string = 'Rate limit exceeded', context?: ErrorContext) {
    super('RATE_LIMIT_EXCEEDED', message, 429, undefined, context);
  }
}

export class ExternalServiceError extends BaseServiceError {
  constructor(service: string, message: string, details?: ErrorDetails, context?: ErrorContext) {
    super(
      'EXTERNAL_SERVICE_ERROR',
      `External service error (${service}): ${message}`,
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

    this.registerHandler('TypeError', (error: unknown, context: ErrorContext) => {
      const message = getErrorMessage(error);
      if (message.includes('Cannot read') || message.includes('undefined')) {
        return new ValidationError(
          'Invalid input data structure',
          { originalError: message },
          context
        );
      }
      return new InternalServerError('Type error occurred', { originalError: message }, context);
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
            ((error.details as Record<string, unknown>)?.id as string | number) || 'unknown',
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
    shouldRetry = error => !(error instanceof ValidationError || error instanceof NotFoundError),
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }

  throw lastError;
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
      `Multiple errors occurred: ${errorMessages}`,
      500,
      { errors: errors.map(e => e.toJSON()) as ErrorDetails },
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
