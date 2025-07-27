/**
 * Unit tests for Validation Middleware
 *
 * @description Tests for request validation, content type checking, and parameter validation
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requestValidationMiddleware, validateRequest } from '@/middleware/validation';
import { ValidationError } from '@/utils/errors';

describe('Validation Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      path: '/api/tasks',
      get: jest.fn(),
      query: {},
      params: {},
      body: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('requestValidationMiddleware', () => {
    it('should pass through valid GET request', () => {
      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject request with oversized content', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Length') return '11000000'; // 11MB
        return undefined;
      });

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Request too large',
        })
      );
    });

    it('should accept request with valid content length', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Length') return '1000';
        return undefined;
      });

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject POST request without JSON content type', () => {
      mockRequest.method = 'POST';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Type') return 'text/plain';
        return undefined;
      });

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Content-Type must be application/json',
        })
      );
    });

    it('should accept POST request with JSON content type', () => {
      mockRequest.method = 'POST';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Type') return 'application/json';
        return undefined;
      });

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should accept POST request with JSON content type and charset', () => {
      mockRequest.method = 'POST';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Type') return 'application/json; charset=utf-8';
        return undefined;
      });

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject PUT request without content type', () => {
      mockRequest.method = 'PUT';
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Content-Type must be application/json',
        })
      );
    });

    it('should reject PATCH request without content type', () => {
      mockRequest.method = 'PATCH';
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Content-Type must be application/json',
        })
      );
    });

    it('should validate UUID parameters in path', () => {
      mockRequest.path = '/api/tasks/:taskId';
      mockRequest.params = { taskId: 'invalid-uuid' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid UUID format for parameter: taskId',
        })
      );
    });

    it('should accept valid UUID parameters', () => {
      mockRequest.path = '/api/tasks/task-123';
      mockRequest.params = { taskId: '550e8400-e29b-41d4-a716-446655440000' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should validate limit query parameter', () => {
      mockRequest.query = { limit: 'invalid' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid limit parameter',
        })
      );
    });

    it('should reject negative limit', () => {
      mockRequest.query = { limit: '-1' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid limit parameter',
        })
      );
    });

    it('should reject zero limit', () => {
      mockRequest.query = { limit: '0' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid limit parameter',
        })
      );
    });

    it('should reject limit greater than 1000', () => {
      mockRequest.query = { limit: '1001' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid limit parameter',
        })
      );
    });

    it('should accept valid limit parameter', () => {
      mockRequest.query = { limit: '100' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should validate offset query parameter', () => {
      mockRequest.query = { offset: 'invalid' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid offset parameter',
        })
      );
    });

    it('should reject negative offset', () => {
      mockRequest.query = { offset: '-1' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid offset parameter',
        })
      );
    });

    it('should accept valid offset parameter', () => {
      mockRequest.query = { offset: '0' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should validate sortOrder query parameter', () => {
      mockRequest.query = { sortOrder: 'invalid' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Sort order must be "asc" or "desc"',
        })
      );
    });

    it('should accept valid sortOrder "asc"', () => {
      mockRequest.query = { sortOrder: 'asc' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should accept valid sortOrder "desc"', () => {
      mockRequest.query = { sortOrder: 'desc' };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle multiple query parameters', () => {
      mockRequest.query = {
        limit: '50',
        offset: '100',
        sortOrder: 'desc',
      };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle undefined content length', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('validateRequest', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      age: z.number().min(0),
      email: z.string().email().optional(),
    });

    it('should validate request data against schema', () => {
      mockRequest.body = { name: 'John', age: 25 };
      mockRequest.query = { email: 'john@example.com' };

      const middleware = validateRequest(testSchema);
      middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.body).toEqual({
        name: 'John',
        age: 25,
        email: 'john@example.com',
      });
    });

    it('should reject invalid request data', () => {
      mockRequest.body = { name: '', age: -1 };

      const middleware = validateRequest(testSchema);
      middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Validation failed',
        })
      );
    });

    it('should include validation error details', () => {
      mockRequest.body = { name: '', age: -1 };

      const middleware = validateRequest(testSchema);
      middleware(mockRequest as any, mockResponse as any, mockNext);

      const error = mockNext.mock.calls[0][0] as ValidationError;
      expect(error.details).toHaveProperty('errors');
      expect(Array.isArray(error.details?.errors)).toBe(true);
    });

    it('should merge body, query, and params', () => {
      mockRequest.body = { name: 'John' };
      mockRequest.query = { age: '25' };
      mockRequest.params = { email: 'john@example.com' };

      const middleware = validateRequest(testSchema);
      middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockRequest.body).toEqual({
        name: 'John',
        age: 25,
        email: 'john@example.com',
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle empty request data', () => {
      const middleware = validateRequest(testSchema);
      middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('should handle schema validation errors', () => {
      mockRequest.body = { name: 'John', age: 'invalid' };

      const middleware = validateRequest(testSchema);
      middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('should handle unexpected errors during validation', () => {
      const invalidSchema = z.object({
        test: z.string().transform(() => {
          throw new Error('Unexpected error');
        }),
      });

      mockRequest.body = { test: 'value' };

      const middleware = validateRequest(invalidSchema);
      middleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing content length header', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle non-numeric content length', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Length') return 'not-a-number';
        return undefined;
      });

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle path without UUID parameters', () => {
      mockRequest.path = '/api/health';

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle complex path with multiple parameters', () => {
      mockRequest.path = '/api/boards/:boardId/columns/:columnId/tasks/:taskId';
      mockRequest.params = {
        boardId: '550e8400-e29b-41d4-a716-446655440000',
        columnId: 'invalid-uuid',
        taskId: '550e8400-e29b-41d4-a716-446655440001',
      };

      requestValidationMiddleware(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid UUID format for parameter: columnId',
        })
      );
    });
  });
});
