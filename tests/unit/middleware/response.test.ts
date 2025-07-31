/**
 * Unit tests for Response Middleware
 *
 * @description Tests for response formatting, API response helpers, and pagination
 */

import type { NextFunction } from 'express';
import {
  responseFormattingMiddleware,
  formatSuccessResponse,
  formatErrorResponse,
} from '@/middleware/response';
import type { MockRequest, MockResponse } from '../../utils/test-types';

describe('Response Middleware', () => {
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      requestId: 'test-request-id',
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('responseFormattingMiddleware', () => {
    it('should add apiSuccess method to response', () => {
      responseFormattingMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.apiSuccess).toBeDefined();
      expect(typeof mockResponse.apiSuccess).toBe('function');
    });

    it('should add apiError method to response', () => {
      responseFormattingMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.apiError).toBeDefined();
      expect(typeof mockResponse.apiError).toBe('function');
    });

    it('should add apiPagination method to response', () => {
      responseFormattingMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.apiPagination).toBeDefined();
      expect(typeof mockResponse.apiPagination).toBe('function');
    });

    it('should call next() after setup', () => {
      responseFormattingMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('apiSuccess method', () => {
    beforeEach(() => {
      responseFormattingMiddleware(mockRequest, mockResponse, mockNext);
    });

    it('should format successful response with data', () => {
      const testData = { id: 1, name: 'Test' };
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiSuccess!(testData);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: testData,
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
        },
      });
    });

    it('should format successful response with custom meta', () => {
      const testData = { id: 1, name: 'Test' };
      const customMeta = { customField: 'value' };
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiSuccess!(testData, customMeta);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: testData,
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          customField: 'value',
        },
      });
    });

    it('should generate valid ISO timestamp', () => {
      const testData = { id: 1 };
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiSuccess!(testData);

      const response = mockJson.mock.calls[0][0];
      const timestamp = new Date(response.meta.timestamp);

      expect(timestamp.getTime()).not.toBeNaN();
      expect(response.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle null data', () => {
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiSuccess!(null);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: null,
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
        },
      });
    });

    it('should handle undefined data', () => {
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiSuccess!(undefined);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: undefined,
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
        },
      });
    });
  });

  describe('apiError method', () => {
    beforeEach(() => {
      responseFormattingMiddleware(mockRequest, mockResponse, mockNext);
    });

    it('should format error response with default status code', () => {
      const mockStatus = jest.fn().mockReturnThis();
      const mockJson = jest.fn();

      (mockResponse as any).status = mockStatus;
      (mockResponse as any).json = mockJson;

      mockResponse.apiError!('TEST_ERROR', 'Test error message');

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test error message',
        },
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
        },
      });
    });

    it('should format error response with custom status code', () => {
      const mockStatus = jest.fn().mockReturnThis();
      const mockJson = jest.fn();

      (mockResponse as any).status = mockStatus;
      (mockResponse as any).json = mockJson;

      mockResponse.apiError!('NOT_FOUND', 'Resource not found', 404);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
        },
      });
    });

    it('should format error response with details', () => {
      const mockStatus = jest.fn().mockReturnThis();
      const mockJson = jest.fn();
      const errorDetails = { field: 'email', reason: 'Invalid format' };

      (mockResponse as any).status = mockStatus;
      (mockResponse as any).json = mockJson;

      mockResponse.apiError!('VALIDATION_ERROR', 'Validation failed', 400, errorDetails);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errorDetails,
        },
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
        },
      });
    });

    it('should handle null details', () => {
      const mockStatus = jest.fn().mockReturnThis();
      const mockJson = jest.fn();

      (mockResponse as any).status = mockStatus;
      (mockResponse as any).json = mockJson;

      mockResponse.apiError!('TEST_ERROR', 'Test error message', 500, null);

      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test error message',
          details: null,
        },
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
        },
      });
    });
  });

  describe('apiPagination method', () => {
    beforeEach(() => {
      responseFormattingMiddleware(mockRequest, mockResponse, mockNext);
    });

    it('should format paginated response', () => {
      const testData = [{ id: 1 }, { id: 2 }];
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiPagination!(testData, 1, 10, 25);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: testData,
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          pagination: {
            page: 1,
            limit: 10,
            total: 25,
            hasNext: true,
            hasPrev: false,
          },
        },
      });
    });

    it('should calculate pagination correctly for first page', () => {
      const testData = [{ id: 1 }, { id: 2 }];
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiPagination!(testData, 1, 10, 25);

      const response = mockJson.mock.calls[0][0];
      expect(response.meta.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        hasNext: true,
        hasPrev: false,
      });
    });

    it('should calculate pagination correctly for middle page', () => {
      const testData = [{ id: 11 }, { id: 12 }];
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiPagination!(testData, 2, 10, 25);

      const response = mockJson.mock.calls[0][0];
      expect(response.meta.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        hasNext: true,
        hasPrev: true,
      });
    });

    it('should calculate pagination correctly for last page', () => {
      const testData = [{ id: 21 }, { id: 22 }, { id: 23 }];
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiPagination!(testData, 3, 10, 23);

      const response = mockJson.mock.calls[0][0];
      expect(response.meta.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 23,
        hasNext: false,
        hasPrev: true,
      });
    });

    it('should handle single page results', () => {
      const testData = [{ id: 1 }, { id: 2 }];
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiPagination!(testData, 1, 10, 2);

      const response = mockJson.mock.calls[0][0];
      expect(response.meta.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('should handle empty results', () => {
      const testData: unknown[] = [];
      const mockJson = jest.fn();

      (mockResponse as Record<string, unknown>).json = mockJson;

      mockResponse.apiPagination!(testData, 1, 10, 0);

      const response = mockJson.mock.calls[0][0];
      expect(response.meta.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('should include custom meta with pagination', () => {
      const testData = [{ id: 1 }];
      const customMeta = { customField: 'value' };
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiPagination!(testData, 1, 10, 1, customMeta);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: testData,
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          customField: 'value',
          pagination: {
            page: 1,
            limit: 10,
            total: 1,
            hasNext: false,
            hasPrev: false,
          },
        },
      });
    });

    it('should handle edge case with zero limit', () => {
      const testData = [{ id: 1 }];
      const mockJson = jest.fn();

      (mockResponse as any).json = mockJson;

      mockResponse.apiPagination!(testData, 1, 0, 1);

      const response = mockJson.mock.calls[0][0];
      expect(response.meta.pagination.hasNext).toBe(false);
    });
  });

  describe('formatSuccessResponse', () => {
    it('should format success response without message', () => {
      const testData = { id: 1, name: 'Test' };
      const response = formatSuccessResponse(testData);

      expect(response).toEqual({
        success: true,
        data: testData,
      });
    });

    it('should format success response with message', () => {
      const testData = { id: 1, name: 'Test' };
      const response = formatSuccessResponse(testData, 'Operation successful');

      expect(response).toEqual({
        success: true,
        data: testData,
        message: 'Operation successful',
      });
    });

    it('should handle null data', () => {
      const response = formatSuccessResponse(null);

      expect(response).toEqual({
        success: true,
        data: null,
      });
    });

    it('should handle undefined data', () => {
      const response = formatSuccessResponse(undefined);

      expect(response).toEqual({
        success: true,
        data: undefined,
      });
    });
  });

  describe('formatErrorResponse', () => {
    it('should format error response without details', () => {
      const response = formatErrorResponse('Test error message');

      expect(response).toEqual({
        success: false,
        error: {
          code: 'ERROR',
          message: 'Test error message',
        },
      });
    });

    it('should format error response with details', () => {
      const errorDetails = { field: 'email', reason: 'Invalid format' };
      const response = formatErrorResponse('Validation failed', errorDetails);

      expect(response).toEqual({
        success: false,
        error: {
          code: 'ERROR',
          message: 'Validation failed',
          details: errorDetails,
        },
      });
    });

    it('should handle null details', () => {
      const response = formatErrorResponse('Test error message', null);

      expect(response).toEqual({
        success: false,
        error: {
          code: 'ERROR',
          message: 'Test error message',
          details: null,
        },
      });
    });

    it('should handle undefined details', () => {
      const response = formatErrorResponse('Test error message', undefined);

      expect(response).toEqual({
        success: false,
        error: {
          code: 'ERROR',
          message: 'Test error message',
          details: undefined,
        },
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing requestId', () => {
      mockRequest.requestId = undefined;
      responseFormattingMiddleware(mockRequest, mockResponse, mockNext);

      const testData = { id: 1 };
      const mockJson = jest.fn();
      (mockResponse as any).json = mockJson;

      mockResponse.apiSuccess!(testData);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: testData,
        meta: {
          timestamp: expect.any(String),
          requestId: undefined,
        },
      });
    });

    it('should handle complex data structures', () => {
      responseFormattingMiddleware(mockRequest, mockResponse, mockNext);

      const complexData = {
        id: 1,
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
        },
        date: new Date('2023-01-01'),
      };
      const mockJson = jest.fn();
      (mockResponse as any).json = mockJson;

      mockResponse.apiSuccess!(complexData);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: complexData,
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
        },
      });
    });

    it('should handle large arrays in pagination', () => {
      responseFormattingMiddleware(mockRequest, mockResponse, mockNext);

      const largeArray = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
      const mockJson = jest.fn();
      (mockResponse as any).json = mockJson;

      mockResponse.apiPagination!(largeArray, 1, 100, 1000);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: largeArray,
        meta: {
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          pagination: {
            page: 1,
            limit: 100,
            total: 1000,
            hasNext: true,
            hasPrev: false,
          },
        },
      });
    });
  });
});
