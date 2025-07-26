import { logger } from '@/utils/logger';
import type { ServiceError } from '@/types';

export interface ErrorContext {
  service: string;
  method: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export class BaseServiceError extends Error implements ServiceError {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;
  public readonly context?: ErrorContext | undefined;
  public readonly timestamp: Date;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: any,
    context?: ErrorContext
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.context = context || undefined;
    this.timestamp = new Date();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
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

export class ValidationError extends BaseServiceError {
  constructor(message: string, details?: any, context?: ErrorContext) {
    super('VALIDATION_ERROR', message, 400, details, context);
  }
}

export class NotFoundError extends BaseServiceError {
  constructor(resource: string, identifier?: string, context?: ErrorContext) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super('NOT_FOUND', message, 404, { resource, identifier }, context);
  }
}

export class ConflictError extends BaseServiceError {
  constructor(message: string, details?: any, context?: ErrorContext) {
    super('CONFLICT', message, 409, details, context);
  }
}

export class ForbiddenError extends BaseServiceError {
  constructor(message: string, details?: any, context?: ErrorContext) {
    super('FORBIDDEN', message, 403, details, context);
  }
}

export class UnauthorizedError extends BaseServiceError {
  constructor(message: string = 'Authentication required', details?: any, context?: ErrorContext) {
    super('UNAUTHORIZED', message, 401, details, context);
  }
}

export class RateLimitError extends BaseServiceError {
  constructor(message: string = 'Rate limit exceeded', details?: any, context?: ErrorContext) {
    super('RATE_LIMIT_EXCEEDED', message, 429, details, context);
  }
}

export class DatabaseError extends BaseServiceError {
  constructor(message: string, originalError?: Error, context?: ErrorContext) {
    super('DATABASE_ERROR', message, 500, { originalError: originalError?.message }, context);
  }
}

export class ExternalServiceError extends BaseServiceError {
  constructor(service: string, message: string, details?: any, context?: ErrorContext) {
    super('EXTERNAL_SERVICE_ERROR', `${service}: ${message}`, 502, details, context);
  }
}

export type ErrorHandler = (error: Error, context?: ErrorContext) => ServiceError;

export class ErrorHandlerManager {
  private handlers: Map<string, ErrorHandler> = new Map();

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

    return this.handleGenericError(error, context);
  }

  private handleGenericError(error: Error, context?: ErrorContext): ServiceError {
    if (error.message.includes('UNIQUE constraint failed')) {
      return new ConflictError('Resource already exists', { originalError: error.message }, context);
    }

    if (error.message.includes('FOREIGN KEY constraint failed')) {
      return new ValidationError('Invalid reference to related resource', { originalError: error.message }, context);
    }

    if (error.message.includes('NOT NULL constraint failed')) {
      return new ValidationError('Required field is missing', { originalError: error.message }, context);
    }

    if (error.message.includes('CHECK constraint failed')) {
      return new ValidationError('Invalid field value', { originalError: error.message }, context);
    }

    if (error.message.includes('database is locked')) {
      return new BaseServiceError('DATABASE_BUSY', 'Database is temporarily busy', 503, { originalError: error.message }, context);
    }

    if (error.message.includes('no such table')) {
      return new BaseServiceError('DATABASE_SCHEMA_ERROR', 'Database schema error', 500, { originalError: error.message }, context);
    }

    return new BaseServiceError('INTERNAL_ERROR', 'An internal error occurred', 500, { originalError: error.message }, context);
  }
}

export const globalErrorHandler = new ErrorHandlerManager();

globalErrorHandler.registerHandler('ZodError', (error: any, context?: ErrorContext) => {
  const messages = error.errors?.map((err: any) => `${err.path.join('.')}: ${err.message}`) || [error.message];
  return new ValidationError(`Validation failed: ${messages.join(', ')}`, error.errors, context);
});

globalErrorHandler.registerHandler('TypeError', (error: Error, context?: ErrorContext) => {
  if (error.message.includes('Cannot read property')) {
    return new BaseServiceError('INVALID_INPUT', 'Invalid input data structure', 400, { originalError: error.message }, context);
  }
  return new BaseServiceError('TYPE_ERROR', 'Type error occurred', 500, { originalError: error.message }, context);
});

export function createServiceErrorHandler(serviceName: string) {
  return function handleServiceError(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const context: ErrorContext = {
        service: serviceName,
        method: propertyKey,
        metadata: { args: args.map((arg, index) => ({ index, type: typeof arg })) },
      };

      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const serviceError = globalErrorHandler.handleError(error as Error, context);
        
        logger.error('Service method error', {
          service: serviceName,
          method: propertyKey,
          error: serviceError instanceof BaseServiceError && typeof serviceError.toJSON === 'function' ? serviceError.toJSON() : serviceError,
        });

        throw serviceError;
      }
    };

    return descriptor;
  };
}

export function withErrorContext<T extends (...args: any[]) => any>(
  fn: T,
  context: Partial<ErrorContext>
): T {
  return ((...args: any[]) => {
    try {
      const result = fn(...args);
      
      if (result instanceof Promise) {
        return result.catch((error: Error) => {
          throw globalErrorHandler.handleError(error, context as ErrorContext);
        });
      }
      
      return result;
    } catch (error) {
      throw globalErrorHandler.handleError(error as Error, context as ErrorContext);
    }
  }) as T;
}

export function createErrorBoundary(serviceName: string) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        
        const methodNames = Object.getOwnPropertyNames(constructor.prototype)
          .filter(name => name !== 'constructor' && typeof (this as any)[name] === 'function');

        methodNames.forEach(methodName => {
          const originalMethod = (this as any)[methodName];
          (this as any)[methodName] = withErrorContext(originalMethod.bind(this), {
            service: serviceName,
            method: methodName,
          });
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
  
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  
  // Resource Management
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  
  // Database
  DATABASE_ERROR: 'DATABASE_ERROR',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  DATABASE_CONNECTION_FAILED: 'DATABASE_CONNECTION_FAILED',
  
  // Business Logic
  CIRCULAR_DEPENDENCY: 'CIRCULAR_DEPENDENCY',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  DEPENDENCY_NOT_SATISFIED: 'DEPENDENCY_NOT_SATISFIED',
  HIERARCHY_TOO_DEEP: 'HIERARCHY_TOO_DEEP',
  
  // External Services
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  EXTERNAL_SERVICE_TIMEOUT: 'EXTERNAL_SERVICE_TIMEOUT',
  EXTERNAL_SERVICE_UNAVAILABLE: 'EXTERNAL_SERVICE_UNAVAILABLE',
  
  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TIMEOUT: 'TIMEOUT',
  
  // File/Storage
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  STORAGE_ERROR: 'STORAGE_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  jitter: boolean;
}

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

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        break;
      }

      if (error instanceof BaseServiceError && !isRetryableError(error)) {
        break;
      }

      const delay = Math.min(
        baseDelay * Math.pow(exponentialBase, attempt - 1),
        maxDelay
      );

      const finalDelay = jitter ? delay * (0.5 + Math.random() * 0.5) : delay;

      logger.warn('Operation failed, retrying', {
        attempt,
        maxAttempts,
        delay: finalDelay,
        error: lastError.message,
        context,
      });

      await new Promise(resolve => setTimeout(resolve, finalDelay));
    }
  }

  throw globalErrorHandler.handleError(lastError!, context);
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
          `Circuit breaker ${name} is open`,
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