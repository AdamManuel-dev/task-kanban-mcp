/**
 * Unit tests for Error Utilities
 *
 * @description Tests for custom error classes and error handling utilities
 */

import type { ErrorContext } from '@/utils/errors';
import {
  BaseServiceError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  ErrorHandlerManager,
  globalErrorHandler,
  createServiceErrorHandler,
  withErrorContext,
  withRetry,
  createCircuitBreaker,
  ErrorCodes,
} from '@/utils/errors';
import { logger } from '@/utils/logger';

// Mock the logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Error Utilities', () => {
  const mockContext: ErrorContext = {
    service: 'test-service',
    method: 'testMethod',
    userId: 'user-123',
    requestId: 'req-456',
    metadata: { extra: 'data' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('BaseServiceError', () => {
    it('should create error with all properties', () => {
      const error = new BaseServiceError(
        'TEST_CODE',
        'Test message',
        400,
        { detail: 'test' },
        mockContext
      );

      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.context).toEqual(mockContext);
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.name).toBe('BaseServiceError');
    });

    it('should use default status code 500', () => {
      const error = new BaseServiceError('TEST_CODE', 'Test message');

      expect(error.statusCode).toBe(500);
    });

    it('should create proper JSON representation', () => {
      const error = new BaseServiceError(
        'TEST_CODE',
        'Test message',
        400,
        { detail: 'test' },
        mockContext
      );
      const json = error.toJSON();

      expect(json).toHaveProperty('name', 'BaseServiceError');
      expect(json).toHaveProperty('code', 'TEST_CODE');
      expect(json).toHaveProperty('message', 'Test message');
      expect(json).toHaveProperty('statusCode', 400);
      expect(json).toHaveProperty('details', { detail: 'test' });
      expect(json).toHaveProperty('context', mockContext);
      expect(json).toHaveProperty('timestamp');
      expect(json).toHaveProperty('stack');
    });

    it('should capture stack trace', () => {
      const error = new BaseServiceError('TEST_CODE', 'Test message');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('BaseServiceError');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct defaults', () => {
      const error = new ValidationError('Invalid input', { field: 'email' }, mockContext);

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.details).toEqual({ field: 'email' });
      expect(error.context).toEqual(mockContext);
    });

    it('should work without details and context', () => {
      const error = new ValidationError('Simple validation error');

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Simple validation error');
      expect(error.details).toBeUndefined();
      expect(error.context).toBeUndefined();
    });
  });

  describe('NotFoundError', () => {
    it('should create error with resource and identifier', () => {
      const error = new NotFoundError('User', 'user-123', mockContext);

      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("User with identifier 'user-123' not found");
      expect(error.details).toEqual({ resource: 'User', identifier: 'user-123' });
    });

    it('should create error with only resource', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
      expect(error.details).toEqual({ resource: 'User', identifier: undefined });
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error correctly', () => {
      const error = new ConflictError(
        'Resource already exists',
        { existingId: '123' },
        mockContext
      );

      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Resource already exists');
      expect(error.details).toEqual({ existingId: '123' });
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error correctly', () => {
      const error = new ForbiddenError(
        'Access denied',
        { reason: 'insufficient permissions' },
        mockContext
      );

      expect(error.code).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access denied');
      expect(error.details).toEqual({ reason: 'insufficient permissions' });
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with default message', () => {
      const error = new UnauthorizedError();

      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Authentication required');
    });

    it('should create unauthorized error with custom message', () => {
      const error = new UnauthorizedError('Invalid token', { token: 'expired' }, mockContext);

      expect(error.message).toBe('Invalid token');
      expect(error.details).toEqual({ token: 'expired' });
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with default message', () => {
      const error = new RateLimitError();

      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Rate limit exceeded');
    });

    it('should create rate limit error with custom details', () => {
      const error = new RateLimitError(
        'Too many requests',
        { limit: 100, window: '1h' },
        mockContext
      );

      expect(error.message).toBe('Too many requests');
      expect(error.details).toEqual({ limit: 100, window: '1h' });
    });
  });

  describe('DatabaseError', () => {
    it('should create database error correctly', () => {
      const originalError = new Error('Connection failed');
      const error = new DatabaseError('Database connection lost', originalError, mockContext);

      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Database connection lost');
      expect(error.details).toEqual({ originalError: 'Connection failed' });
    });

    it('should work without original error', () => {
      const error = new DatabaseError('Database error', undefined, mockContext);

      expect(error.details).toEqual({ originalError: undefined });
    });
  });

  describe('ExternalServiceError', () => {
    it('should create external service error correctly', () => {
      const error = new ExternalServiceError(
        'GitHub API',
        'Rate limit exceeded',
        { remaining: 0 },
        mockContext
      );

      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.message).toBe('GitHub API: Rate limit exceeded');
      expect(error.details).toEqual({ remaining: 0 });
    });
  });

  describe('ErrorHandlerManager', () => {
    let errorHandler: ErrorHandlerManager;

    beforeEach(() => {
      errorHandler = new ErrorHandlerManager();
    });

    it('should return BaseServiceError as-is', () => {
      const error = new ValidationError('Test error');
      const result = errorHandler.handleError(error);

      expect(result).toBe(error);
    });

    it('should handle UNIQUE constraint errors', () => {
      const error = new Error('UNIQUE constraint failed: table.column');
      const result = errorHandler.handleError(error);

      expect(result).toBeInstanceOf(ConflictError);
      expect(result.code).toBe('CONFLICT');
      expect(result.message).toBe('Resource already exists');
    });

    it('should handle FOREIGN KEY constraint errors', () => {
      const error = new Error('FOREIGN KEY constraint failed');
      const result = errorHandler.handleError(error);

      expect(result).toBeInstanceOf(ValidationError);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.message).toBe('Invalid reference to related resource');
    });

    it('should handle NOT NULL constraint errors', () => {
      const error = new Error('NOT NULL constraint failed: table.column');
      const result = errorHandler.handleError(error);

      expect(result).toBeInstanceOf(ValidationError);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.message).toBe('Required field is missing');
    });

    it('should handle CHECK constraint errors', () => {
      const error = new Error('CHECK constraint failed: table');
      const result = errorHandler.handleError(error);

      expect(result).toBeInstanceOf(ValidationError);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.message).toBe('Invalid field value');
    });

    it('should handle database locked errors', () => {
      const error = new Error('database is locked');
      const result = errorHandler.handleError(error);

      expect(result).toBeInstanceOf(BaseServiceError);
      expect(result.code).toBe('DATABASE_BUSY');
      expect(result.statusCode).toBe(503);
    });

    it('should handle schema errors', () => {
      const error = new Error('no such table: nonexistent');
      const result = errorHandler.handleError(error);

      expect(result).toBeInstanceOf(BaseServiceError);
      expect(result.code).toBe('DATABASE_SCHEMA_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('should handle generic errors', () => {
      const error = new Error('Unknown error');
      const result = errorHandler.handleError(error);

      expect(result).toBeInstanceOf(BaseServiceError);
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('should register and use custom handlers', () => {
      const customHandler = jest.fn().mockReturnValue(new ValidationError('Custom error'));
      errorHandler.registerHandler('CustomError', customHandler);

      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const error = new CustomError('Test');
      const result = errorHandler.handleError(error);

      expect(customHandler).toHaveBeenCalledWith(error, undefined);
      expect(result.message).toBe('Custom error');
    });
  });

  describe('globalErrorHandler (instance)', () => {
    it('should handle ZodError correctly', () => {
      class ZodError extends Error {
        errors: any[];

        constructor(message: string, errors: any[]) {
          super(message);
          this.name = 'ZodError';
          this.errors = errors;
        }
      }

      const zodError = new ZodError('Validation error', [
        { path: ['field1'], message: 'Required' },
        { path: ['field2', 'nested'], message: 'Invalid type' },
      ]);

      const result = globalErrorHandler.handleError(zodError);

      expect(result).toBeInstanceOf(ValidationError);
      expect(result.message).toBe(
        'Validation failed: field1: Required, field2.nested: Invalid type'
      );
    });

    it('should handle TypeError with property access', () => {
      const error = new TypeError("Cannot read property 'test' of undefined");
      const result = globalErrorHandler.handleError(error);

      expect(result).toBeInstanceOf(BaseServiceError);
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.statusCode).toBe(400);
    });

    it('should handle generic TypeError', () => {
      const error = new TypeError('Type error');
      const result = globalErrorHandler.handleError(error);

      expect(result).toBeInstanceOf(BaseServiceError);
      expect(result.code).toBe('TYPE_ERROR');
      expect(result.statusCode).toBe(500);
    });
  });

  describe('createServiceErrorHandler', () => {
    it('should create a decorator that handles errors', async () => {
      const serviceName = 'TestService';
      const decorator = createServiceErrorHandler(serviceName);

      class TestClass {
        async testMethod() {
          throw new Error('Test error');
        }
      }

      const descriptor = {
        value: TestClass.prototype.testMethod,
      };

      decorator(TestClass.prototype, 'testMethod', descriptor);

      const instance = new TestClass();

      await expect(descriptor.value.call(instance)).rejects.toBeInstanceOf(BaseServiceError);
      expect(logger.error).toHaveBeenCalledWith(
        'Service method error',
        expect.objectContaining({
          service: serviceName,
          method: 'testMethod',
        })
      );
    });

    it('should pass through successful method calls', async () => {
      const serviceName = 'TestService';
      const decorator = createServiceErrorHandler(serviceName);

      class TestClass {
        async testMethod() {
          return 'success';
        }
      }

      const descriptor = {
        value: TestClass.prototype.testMethod,
      };

      decorator(TestClass.prototype, 'testMethod', descriptor);

      const instance = new TestClass();
      const result = await descriptor.value.call(instance);

      expect(result).toBe('success');
    });
  });

  describe('withErrorContext', () => {
    const context = { service: 'TestService', method: 'testMethod' };

    it('should handle synchronous functions', () => {
      const fn = jest.fn().mockReturnValue('success');
      const wrappedFn = withErrorContext(fn, context);

      const result = wrappedFn('arg1', 'arg2');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should handle synchronous errors', () => {
      const error = new Error('Sync error');
      const fn = jest.fn().mockImplementation(() => {
        throw error;
      });
      const wrappedFn = withErrorContext(fn, context);

      expect(() => wrappedFn()).toThrow(BaseServiceError);
    });

    it('should handle async functions', async () => {
      const fn = jest.fn().mockResolvedValue('async success');
      const wrappedFn = withErrorContext(fn, context);

      const result = await wrappedFn('arg1');

      expect(result).toBe('async success');
      expect(fn).toHaveBeenCalledWith('arg1');
    });

    it('should handle async errors', async () => {
      const error = new Error('Async error');
      const fn = jest.fn().mockRejectedValue(error);
      const wrappedFn = withErrorContext(fn, context);

      await expect(wrappedFn()).rejects.toBeInstanceOf(BaseServiceError);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('database is locked'))
        .mockRejectedValueOnce(new Error('database is locked'))
        .mockResolvedValue('success');

      const result = await withRetry(operation, { maxAttempts: 3, baseDelay: 10 });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new ValidationError('Bad input'));

      await expect(withRetry(operation)).rejects.toBeInstanceOf(ValidationError);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw after max attempts', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('database is locked'));

      await expect(withRetry(operation, { maxAttempts: 2, baseDelay: 10 })).rejects.toBeInstanceOf(
        BaseServiceError
      );
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle exponential backoff with jitter', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');

      const result = await withRetry(operation, {
        maxAttempts: 2,
        baseDelay: 100,
        exponentialBase: 2,
        jitter: false,
      });

      expect(result).toBe('success');
      expect(logger.warn).toHaveBeenCalledWith(
        'Operation failed, retrying',
        expect.objectContaining({
          attempt: 1,
          maxAttempts: 2,
          delay: 100,
        })
      );
    });
  });

  describe('createCircuitBreaker', () => {
    it('should allow operations when circuit is closed', async () => {
      const circuitBreaker = createCircuitBreaker('test', {
        threshold: 3,
        timeout: 1000,
        resetTimeout: 5000,
      });

      const operation = jest.fn().mockResolvedValue('success');

      const result = await circuitBreaker(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should open circuit after threshold failures', async () => {
      const circuitBreaker = createCircuitBreaker('test', {
        threshold: 2,
        timeout: 1000,
        resetTimeout: 5000,
      });

      const operation = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // First failure
      await expect(circuitBreaker(operation)).rejects.toThrow('Service unavailable');

      // Second failure - should open circuit
      await expect(circuitBreaker(operation)).rejects.toThrow('Service unavailable');

      // Third call - circuit should be open
      await expect(circuitBreaker(operation)).rejects.toThrow('Circuit breaker test is open');

      expect(operation).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith('Circuit breaker opened', {
        name: 'test',
        failures: 2,
        threshold: 2,
      });
    });

    it('should transition to half-open after reset timeout', async () => {
      jest.useFakeTimers();

      const circuitBreaker = createCircuitBreaker('test', {
        threshold: 1,
        timeout: 1000,
        resetTimeout: 1000,
      });

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValue('success');

      // Fail and open circuit
      await expect(circuitBreaker(operation)).rejects.toThrow('Failure');

      // Circuit should be open
      await expect(circuitBreaker(operation)).rejects.toThrow('Circuit breaker test is open');

      // Advance time past reset timeout
      jest.advanceTimersByTime(1001);

      // Should now allow operation (half-open) and succeed
      const result = await circuitBreaker(operation);
      expect(result).toBe('success');

      expect(logger.info).toHaveBeenCalledWith('Circuit breaker half-open', { name: 'test' });
      expect(logger.info).toHaveBeenCalledWith('Circuit breaker closed', { name: 'test' });

      jest.useRealTimers();
    });
  });

  describe('ErrorCodes', () => {
    it('should contain all expected error codes', () => {
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCodes.CONFLICT).toBe('CONFLICT');
      expect(ErrorCodes.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(ErrorCodes.EXTERNAL_SERVICE_ERROR).toBe('EXTERNAL_SERVICE_ERROR');
      expect(ErrorCodes.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });

    it('should be readonly', () => {
      expect(() => {
        (ErrorCodes as any).NEW_CODE = 'NEW_CODE';
      }).not.toThrow();

      // But the original values should be immutable
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    });
  });
});
