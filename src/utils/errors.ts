/**
 * Error management utilities for the MCP Kanban system
 *
 * @module utils/errors
 * @description Provides a comprehensive error handling system with type-safe error classes,
 * global error handlers, retry mechanisms, and circuit breakers. This module ensures consistent
 * error handling across the application with proper logging and context preservation.
 *
 * @example
 * ```typescript
 * // Using specific error classes
 * throw new ValidationError('Invalid task title', { field: 'title', value: '' });
 *
 * // Using error factories
 * throw createNotFoundError('Task', taskId);
 *
 * // Using error decorators
 * @createServiceErrorHandler('TaskService')
 * async updateTask(id: string, data: UpdateTaskData) {
 *   // Method implementation
 * }
 * ```
 */

/* eslint-disable max-classes-per-file, no-param-reassign, default-param-last */
import { logger } from '@/utils/logger';
import type { ServiceError } from '@/types';
import { isError, isRecord, getErrorMessage } from './typeGuards';

/**
 * Structured error details type for providing additional context
 * @typedef {string | number | boolean | null | undefined | Object | Array} ErrorDetails
 */
export type ErrorDetails =
  | string
  | number
  | boolean
  | null
  | undefined
  | { [key: string]: ErrorDetails }
  | ErrorDetails[];

/**
 * Context information for error tracking and debugging
 *
 * @interface ErrorContext
 * @property {string} service - The service where the error occurred
 * @property {string} method - The method that threw the error
 * @property {string} [userId] - Optional user ID for user-specific errors
 * @property {string} [requestId] - Optional request ID for tracing
 * @property {Record<string, unknown>} [metadata] - Additional contextual data
 */
export interface ErrorContext {
  service: string;
  method: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Base error class for all service-level errors in the application
 *
 * @class BaseServiceError
 * @extends Error
 * @implements ServiceError
 *
 * @description Provides a consistent error structure with error codes, HTTP status codes,
 * detailed error information, and context for debugging. All custom errors should extend this class.
 *
 * @example
 * ```typescript
 * class CustomError extends BaseServiceError {
 *   constructor(message: string, details?: ErrorDetails) {
 *     super('CUSTOM_ERROR', message, 400, details);
 *   }
 * }
 * ```
 */
export class BaseServiceError extends Error implements ServiceError {
  /** Unique error code for identifying error types */
  public readonly code: string;

  /** HTTP status code for API responses */
  public readonly statusCode: number;

  /** Additional error details for debugging */
  public readonly details?: ErrorDetails;

  /** Context information about where and when the error occurred */
  public readonly context?: ErrorContext | undefined;

  /** Timestamp when the error was created */
  public readonly timestamp: Date;

  /**
   * Creates a new BaseServiceError instance
   *
   * @param {string} code - Unique error code (e.g., 'VALIDATION_ERROR')
   * @param {string} message - Human-readable error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {ErrorDetails} [details] - Additional error details
   * @param {ErrorContext} [context] - Error context information
   */
  constructor(
    code: string,
    message: string,
    statusCode = 500,
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

  /**
   * Serializes the error to a JSON-compatible object
   *
   * @returns {Record<string, unknown>} JSON representation of the error
   */
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

/**
 * Error thrown when input validation fails
 *
 * @class ValidationError
 * @extends BaseServiceError
 *
 * @example
 * ```typescript
 * throw new ValidationError('Invalid email format', {
 *   field: 'email',
 *   value: 'not-an-email',
 *   pattern: 'email'
 * });
 * ```
 */
export class ValidationError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('VALIDATION_ERROR', message, 400, details, context);
  }
}

/**
 * Error thrown when a requested resource cannot be found
 *
 * @class NotFoundError
 * @extends BaseServiceError
 *
 * @example
 * ```typescript
 * throw new NotFoundError('Task', taskId);
 * // Message: "Task with identifier 'task-123' not found"
 * ```
 */
export class NotFoundError extends BaseServiceError {
  /**
   * Creates a NotFoundError
   *
   * @param {string} resource - The type of resource that wasn't found
   * @param {string | number} [id] - The identifier of the missing resource
   * @param {ErrorContext} [context] - Additional error context
   */
  constructor(resource: string, id?: string | number, context?: ErrorContext) {
    const identifier = id ?? 'unknown';
    const message =
      id !== undefined
        ? `${String(resource)} with identifier '${String(identifier)}' not found`
        : `${String(resource)} not found`;
    super('NOT_FOUND', message, 404, { resource, identifier }, context);
  }
}

/**
 * Error thrown when there's a conflict with the current state
 *
 * @class ConflictError
 * @extends BaseServiceError
 *
 * @example
 * ```typescript
 * throw new ConflictError('Task already exists', {
 *   existingId: 'task-123',
 *   attemptedTitle: 'Duplicate Task'
 * });
 * ```
 */
export class ConflictError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('CONFLICT', message, 409, details, context);
  }
}

/**
 * Error thrown when authentication is required but not provided
 *
 * @class UnauthorizedError
 * @extends BaseServiceError
 *
 * @example
 * ```typescript
 * throw new UnauthorizedError('Invalid token', { token: 'Bearer ...' });
 * ```
 */
export class UnauthorizedError extends BaseServiceError {
  constructor(message = 'Authentication required', details?: ErrorDetails, context?: ErrorContext) {
    super('UNAUTHORIZED', message, 401, details, context);
  }
}

/**
 * Error thrown when user lacks permission for an action
 *
 * @class ForbiddenError
 * @extends BaseServiceError
 *
 * @example
 * ```typescript
 * throw new ForbiddenError('Insufficient permissions', {
 *   required: 'admin',
 *   actual: 'user'
 * });
 * ```
 */
export class ForbiddenError extends BaseServiceError {
  constructor(message = 'Forbidden', details?: ErrorDetails, context?: ErrorContext) {
    super('FORBIDDEN', message, 403, details, context);
  }
}

/**
 * Error thrown for internal server errors
 *
 * @class InternalServerError
 * @extends BaseServiceError
 *
 * @example
 * ```typescript
 * throw new InternalServerError('Database connection failed', {
 *   component: 'database',
 *   error: originalError.message
 * });
 * ```
 */
export class InternalServerError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('INTERNAL_SERVER_ERROR', message, 500, details, context);
  }
}

/**
 * Error thrown for database-related failures
 *
 * @class DatabaseError
 * @extends BaseServiceError
 *
 * @example
 * ```typescript
 * try {
 *   await db.query(sql);
 * } catch (error) {
 *   throw new DatabaseError('Query failed', error);
 * }
 * ```
 */
export class DatabaseError extends BaseServiceError {
  /**
   * Creates a DatabaseError
   *
   * @param {string} message - Error description
   * @param {Error | ErrorDetails} [originalError] - The original database error
   * @param {ErrorContext} [context] - Additional error context
   */
  constructor(message: string, originalError?: Error | ErrorDetails, context?: ErrorContext) {
    const details =
      originalError instanceof Error
        ? { originalError: originalError.message }
        : (originalError ?? { originalError: undefined });
    super('DATABASE_ERROR', message, 500, details, context);
  }
}

/**
 * Error thrown when task dependencies are invalid
 *
 * @class DependencyError
 * @extends BaseServiceError
 *
 * @example
 * ```typescript
 * throw new DependencyError('Circular dependency detected', {
 *   taskId: 'task-1',
 *   dependsOn: 'task-2',
 *   cycle: ['task-1', 'task-2', 'task-1']
 * });
 * ```
 */
export class DependencyError extends BaseServiceError {
  constructor(message: string, details?: ErrorDetails, context?: ErrorContext) {
    super('DEPENDENCY_ERROR', message, 400, details, context);
  }
}

/**
 * Error thrown when rate limits are exceeded
 *
 * @class RateLimitError
 * @extends BaseServiceError
 *
 * @example
 * ```typescript
 * throw new RateLimitError('Too many requests', {
 *   limit: 100,
 *   window: '1 hour',
 *   retryAfter: 3600
 * });
 * ```
 */
export class RateLimitError extends BaseServiceError {
  constructor(message = 'Rate limit exceeded', details?: ErrorDetails, context?: ErrorContext) {
    super('RATE_LIMIT_EXCEEDED', message, 429, details, context);
  }
}

/**
 * Error thrown when external service calls fail
 *
 * @class ExternalServiceError
 * @extends BaseServiceError
 *
 * @example
 * ```typescript
 * throw new ExternalServiceError('OpenAI', 'API timeout', {
 *   endpoint: '/v1/completions',
 *   timeout: 30000
 * });
 * ```
 */
export class ExternalServiceError extends BaseServiceError {
  /**
   * Creates an ExternalServiceError
   *
   * @param {string} service - Name of the external service
   * @param {string} message - Error description
   * @param {ErrorDetails} [details] - Additional error details
   * @param {ErrorContext} [context] - Error context
   */
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
 * Type-safe error factory functions for consistent error creation
 * @typedef {Function} ErrorFactory
 */
type ErrorFactory<T extends unknown[]> = (...args: T) => BaseServiceError;

/**
 * Creates a validation error with consistent formatting
 *
 * @function createValidationError
 * @param {string} message - Error message
 * @param {ErrorDetails} [details] - Additional details
 * @param {ErrorContext} [context] - Error context
 * @returns {ValidationError} The created validation error
 *
 * @example
 * ```typescript
 * throw createValidationError('Invalid email', { field: 'email' });
 * ```
 */
export const createValidationError: ErrorFactory<[string, ErrorDetails?, ErrorContext?]> = (
  message,
  details,
  context
) => new ValidationError(message, details, context);

/**
 * Creates a not found error with consistent formatting
 *
 * @function createNotFoundError
 * @param {string} resource - Resource type
 * @param {string | number} id - Resource identifier
 * @param {ErrorContext} [context] - Error context
 * @returns {NotFoundError} The created not found error
 *
 * @example
 * ```typescript
 * throw createNotFoundError('Task', taskId);
 * ```
 */
export const createNotFoundError: ErrorFactory<[string, string | number, ErrorContext?]> = (
  resource,
  id,
  context
) => new NotFoundError(resource, id, context);

/**
 * Creates a database error with consistent formatting
 *
 * @function createDatabaseError
 * @param {string} message - Error message
 * @param {ErrorDetails} [details] - Additional details
 * @param {ErrorContext} [context] - Error context
 * @returns {DatabaseError} The created database error
 *
 * @example
 * ```typescript
 * throw createDatabaseError('Connection failed', { host: 'localhost' });
 * ```
 */
export const createDatabaseError: ErrorFactory<[string, ErrorDetails?, ErrorContext?]> = (
  message,
  details,
  context
) => new DatabaseError(message, details, context);

/**
 * Error handler function type
 * @typedef {Function} ErrorHandler
 * @param {Error} error - The error to handle
 * @param {ErrorContext} [context] - Error context
 * @returns {ServiceError} The handled service error
 */
export type ErrorHandler = (error: Error, context?: ErrorContext) => ServiceError;

/**
 * Manages custom error handlers for different error types
 *
 * @class ErrorHandlerManager
 *
 * @example
 * ```typescript
 * const errorManager = new ErrorHandlerManager();
 * errorManager.registerHandler('TypeError', (error, context) => {
 *   return new ValidationError('Type error: ' + error.message);
 * });
 * ```
 */
export class ErrorHandlerManager {
  private readonly handlers: Map<string, ErrorHandler> = new Map();

  /**
   * Registers a custom error handler for a specific error type
   *
   * @param {string} errorType - The error constructor name to handle
   * @param {ErrorHandler} handler - The handler function
   */
  registerHandler(errorType: string, handler: ErrorHandler): void {
    this.handlers.set(errorType, handler);
  }

  /**
   * Handles an error using registered handlers or default logic
   *
   * @param {Error} error - The error to handle
   * @param {ErrorContext} [context] - Error context
   * @returns {ServiceError} The processed service error
   */
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

  /**
   * Handles generic errors with pattern matching for common database errors
   *
   * @private
   * @static
   * @param {Error} error - The error to handle
   * @param {ErrorContext} [context] - Error context
   * @returns {ServiceError} The appropriate service error
   */
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
 * Global error handler for consistent error processing across the application
 *
 * @class GlobalErrorHandler
 *
 * @description Provides centralized error handling with type-specific handlers,
 * automatic error classification, and context preservation. Handles various error
 * types including validation errors, database errors, and external service errors.
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   throw globalErrorHandler.handleError(error, {
 *     service: 'MyService',
 *     method: 'someOperation'
 *   });
 * }
 * ```
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
      const zodError = error as { errors?: Array<{ path: string[]; message: string }> };
      const messages = zodError.errors?.map(
        err => `${String(err.path.join('.'))}: ${String(err.message)}`
      ) ?? [getErrorMessage(error)];
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

  /**
   * Registers a custom error handler for a specific error type
   *
   * @param {string} errorName - The error constructor name
   * @param {Function} handler - The handler function
   *
   * @example
   * ```typescript
   * globalErrorHandler.registerHandler('CustomError', (error, context) => {
   *   return new ValidationError('Custom error: ' + error.message);
   * });
   * ```
   */
  registerHandler(
    errorName: string,
    handler: (error: unknown, context: ErrorContext) => BaseServiceError
  ): void {
    this.errorHandlers.set(errorName, handler);
  }

  /**
   * Handles any error and converts it to a BaseServiceError
   *
   * @param {unknown} error - The error to handle
   * @param {ErrorContext} context - Error context information
   * @returns {BaseServiceError} The processed service error
   *
   * @example
   * ```typescript
   * const serviceError = globalErrorHandler.handleError(error, {
   *   service: 'TaskService',
   *   method: 'createTask',
   *   userId: 'user-123'
   * });
   * ```
   */
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
            ((error.details as Record<string, unknown>).resource as string) || 'Resource',
            ((error.details as Record<string, unknown>).identifier as string | number) || 'unknown',
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

/**
 * Singleton instance of the global error handler
 * @constant {GlobalErrorHandler}
 */
export const globalErrorHandler = new GlobalErrorHandler();

// Enhanced error handling with monitoring
let errorMonitoringEnabled = false;

/**
 * Enable error monitoring integration
 */
export function enableErrorMonitoring(): void {
  if (!errorMonitoringEnabled) {
    errorMonitoringEnabled = true;
    logger.info('Error monitoring integration enabled');
  }
}

/**
 * Enhanced global error handler with monitoring integration
 */
export function handleErrorWithMonitoring(error: unknown, context: ErrorContext): BaseServiceError {
  const serviceError = globalErrorHandler.handleError(error, context);

  // Record error for monitoring if enabled
  if (errorMonitoringEnabled) {
    try {
      // Dynamically import to avoid circular dependencies
      import('./error-monitoring')
        .then(({ errorMonitor }) => {
          errorMonitor.recordError(serviceError, context);
        })
        .catch(() => {
          // Silently fail if monitoring is not available
        });
    } catch {
      // Silently fail if monitoring is not available
    }
  }

  return serviceError;
}

/**
 * Creates a method decorator for automatic error handling
 *
 * @function createServiceErrorHandler
 * @param {string} serviceName - The name of the service
 * @returns {MethodDecorator} The error handler decorator
 *
 * @description Wraps service methods with automatic error handling, logging,
 * and context preservation. Converts all errors to appropriate ServiceError types.
 *
 * @example
 * ```typescript
 * class TaskService {
 *   @createServiceErrorHandler('TaskService')
 *   async createTask(data: CreateTaskData): Promise<Task> {
 *     // Method implementation
 *   }
 * }
 * ```
 */
export function createServiceErrorHandler(
  serviceName: string
): <T extends Record<string, unknown>>(
  target: T,
  propertyKey: string,
  descriptor: PropertyDescriptor
) => PropertyDescriptor {
  return function handleServiceError<T extends Record<string, unknown>>(
    _target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function wrappedErrorHandlerMethod(
      this: T,
      ...args: unknown[]
    ): Promise<unknown> {
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
        const serviceError = handleErrorWithMonitoring(error, context);

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
 * Wraps a function with error context for better error tracking
 *
 * @function withErrorContext
 * @template TFn - The function type
 * @param {TFn} fn - The function to wrap
 * @param {Partial<ErrorContext>} context - Error context to attach
 * @returns {TFn} The wrapped function
 *
 * @example
 * ```typescript
 * const wrappedFn = withErrorContext(
 *   async (id: string) => await fetchTask(id),
 *   { service: 'TaskService', method: 'getTask' }
 * );
 * ```
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
 * Creates a class decorator that adds error handling to all methods
 *
 * @function createErrorBoundary
 * @param {string} serviceName - The name of the service
 * @returns {ClassDecorator} The error boundary decorator
 *
 * @description Automatically wraps all class methods with error handling,
 * providing consistent error processing and logging across the entire class.
 *
 * @example
 * ```typescript
 * @createErrorBoundary('TaskService')
 * export class TaskService {
 *   async createTask(data: CreateTaskData): Promise<Task> {
 *     // All methods in this class are automatically wrapped
 *   }
 * }
 * ```
 */
export function createErrorBoundary(
  serviceName: string
): <T extends new (...args: unknown[]) => object>(constructor: T) => T {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    return class extends constructor {
      constructor(...args: unknown[]) {
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

/**
 * Standard error codes used throughout the application
 *
 * @constant {Object} ErrorCodes
 * @property {string} VALIDATION_ERROR - Input validation failed
 * @property {string} NOT_FOUND - Resource not found
 * @property {string} CONFLICT - Resource conflict
 * @property {string} UNAUTHORIZED - Authentication required
 * @property {string} FORBIDDEN - Insufficient permissions
 * @property {string} INTERNAL_SERVER_ERROR - Server error
 * @property {string} DATABASE_ERROR - Database operation failed
 * @property {string} DEPENDENCY_ERROR - Task dependency error
 * @property {string} RATE_LIMIT_EXCEEDED - Too many requests
 */
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
 * Retries an operation with exponential backoff
 *
 * @function retryWithBackoff
 * @template T - The return type of the operation
 * @param {Function} operation - The async operation to retry
 * @param {Object} [options] - Retry configuration
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.initialDelay=100] - Initial delay in milliseconds
 * @param {number} [options.maxDelay=5000] - Maximum delay in milliseconds
 * @param {number} [options.backoffFactor=2] - Exponential backoff factor
 * @param {Function} [options.shouldRetry] - Function to determine if retry is appropriate
 * @returns {Promise<T>} The operation result
 *
 * @throws {Error} The last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   async () => await fetchData(),
 *   {
 *     maxRetries: 5,
 *     initialDelay: 1000,
 *     shouldRetry: (error) => error.statusCode >= 500
 *   }
 * );
 * ```
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

  // eslint-disable-next-line no-await-in-loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
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
 * Configuration options for retry operations
 *
 * @interface RetryOptions
 * @property {number} maxAttempts - Maximum number of retry attempts
 * @property {number} baseDelay - Base delay between retries in milliseconds
 * @property {number} maxDelay - Maximum delay between retries in milliseconds
 * @property {number} exponentialBase - Base for exponential backoff calculation
 * @property {boolean} jitter - Whether to add random jitter to delays
 */
export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  jitter: boolean;
}

/**
 * Retries an operation with configurable backoff and jitter
 *
 * @function withRetry
 * @template T - The return type of the operation
 * @param {Function} operation - The async operation to retry
 * @param {Partial<RetryOptions>} [options] - Retry configuration
 * @param {ErrorContext} [context] - Error context for logging
 * @returns {Promise<T>} The operation result
 *
 * @throws {BaseServiceError} The last error wrapped in appropriate error type
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => await databaseQuery(),
 *   { maxAttempts: 3, jitter: true },
 *   { service: 'Database', method: 'query' }
 * );
 * ```
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

/**
 * Determines if an error is retryable based on error code and status
 *
 * @function isRetryableError
 * @param {BaseServiceError} error - The error to check
 * @returns {boolean} True if the error is retryable
 *
 * @private
 */
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
 * Creates a circuit breaker for protecting against cascading failures
 *
 * @function createCircuitBreaker
 * @param {string} name - Circuit breaker name for logging
 * @param {Object} options - Circuit breaker configuration
 * @param {number} options.threshold - Failure threshold before opening
 * @param {number} options.timeout - Timeout for operations in milliseconds
 * @param {number} options.resetTimeout - Time before attempting reset in milliseconds
 * @returns {Function} Circuit breaker wrapper function
 *
 * @description Implements the circuit breaker pattern to prevent cascading failures.
 * The circuit has three states: CLOSED (normal), OPEN (failing), and HALF_OPEN (testing).
 *
 * @example
 * ```typescript
 * const protectedFn = createCircuitBreaker('external-api', {
 *   threshold: 5,
 *   timeout: 5000,
 *   resetTimeout: 60000
 * });
 *
 * try {
 *   const result = await protectedFn(async () => await callExternalAPI());
 * } catch (error) {
 *   // Handle circuit breaker open or operation failure
 * }
 * ```
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
 * Error class for aggregating multiple errors into a single error
 *
 * @class AggregateError
 * @extends BaseServiceError
 *
 * @description Useful for batch operations where multiple errors can occur
 * and all need to be reported together.
 *
 * @example
 * ```typescript
 * const errors: BaseServiceError[] = [];
 *
 * for (const task of tasks) {
 *   try {
 *     await processTask(task);
 *   } catch (error) {
 *     errors.push(error);
 *   }
 * }
 *
 * if (errors.length > 0) {
 *   throw new AggregateError(errors);
 * }
 * ```
 */
export class AggregateError extends BaseServiceError {
  /** Array of individual errors that occurred */
  public readonly errors: BaseServiceError[];

  /**
   * Creates an AggregateError from multiple errors
   *
   * @param {BaseServiceError[]} errors - Array of errors to aggregate
   * @param {ErrorContext} [context] - Error context
   */
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
 * Safely serializes any error to a JSON-compatible object
 *
 * @function serializeError
 * @param {unknown} error - The error to serialize
 * @returns {Record<string, unknown>} JSON-safe error representation
 *
 * @description Handles various error types including BaseServiceError,
 * standard Error objects, and unknown values, ensuring safe serialization
 * for logging and API responses.
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const serialized = serializeError(error);
 *   logger.error('Operation failed', serialized);
 *   res.status(500).json({ error: serialized });
 * }
 * ```
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
