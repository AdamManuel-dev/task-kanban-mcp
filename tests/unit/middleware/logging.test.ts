/**
 * Unit tests for Logging Middleware
 *
 * @description Tests for request logging, response logging, and performance monitoring
 */

import type { NextFunction } from 'express';
import { requestLoggingMiddleware } from '@/middleware/logging';
import { logger } from '@/utils/logger';
import type { MockRequest, MockResponse } from '../../utils/test-types';

// Mock the logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Logging Middleware', () => {
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let mockNext: NextFunction;
  let mockOriginalEnd: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      originalUrl: '/api/tasks',
      url: '/api/tasks',
      get: jest.fn(),
      ip: '127.0.0.1',
      requestId: 'test-request-id',
    };
    mockResponse = {
      statusCode: 200,
      get: jest.fn(),
      end: jest.fn(),
    };
    mockNext = jest.fn();
    mockOriginalEnd = jest.fn();

    // Mock the original end function
    mockResponse.end = mockOriginalEnd;

    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('requestLoggingMiddleware', () => {
    it('should log incoming request information', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'User-Agent') return 'Test User Agent';
        if (header === 'Content-Length') return '1024';
        return undefined;
      });

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      expect(logger.info).toHaveBeenCalledWith('HTTP request started', {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/tasks',
        userAgent: 'Test User Agent',
        ip: '127.0.0.1',
        contentLength: '1024',
      });
    });

    it('should call next() after logging request', () => {
      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should override res.end to log response', () => {
      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      expect(typeof mockResponse.end).toBe('function');
      expect(mockResponse.end).not.toBe(mockOriginalEnd);
    });

    it('should log response completion with timing', () => {
      (mockResponse.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Length') return '512';
        return undefined;
      });

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Advance time by 100ms
      jest.advanceTimersByTime(100);

      // Call the overridden end function
      (mockResponse.end as any)();

      expect(logger.info).toHaveBeenCalledWith('HTTP request completed', {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/tasks',
        statusCode: 200,
        duration: '100ms',
        contentLength: '512',
      });
    });

    it('should call original end function', () => {
      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Call the overridden end function
      (mockResponse.end as any)();

      expect(mockOriginalEnd).toHaveBeenCalled();
    });

    it('should log slow requests as warnings', () => {
      (mockResponse.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Length') return '512';
        return undefined;
      });

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Advance time by 1500ms (slow request)
      jest.advanceTimersByTime(1500);

      // Call the overridden end function
      (mockResponse.end as any)();

      expect(logger.warn).toHaveBeenCalledWith('Slow HTTP request detected', {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/tasks',
        duration: '1500ms',
      });
    });

    it('should not log slow request warning for fast requests', () => {
      (mockResponse.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Length') return '512';
        return undefined;
      });

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Advance time by 500ms (fast request)
      jest.advanceTimersByTime(500);

      // Call the overridden end function
      (mockResponse.end as any)();

      expect(logger.warn).not.toHaveBeenCalledWith(
        'Slow HTTP request detected',
        expect.any(Object)
      );
    });

    it('should handle missing request headers gracefully', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      expect(logger.info).toHaveBeenCalledWith('HTTP request started', {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/tasks',
        userAgent: undefined,
        ip: '127.0.0.1',
        contentLength: undefined,
      });
    });

    it('should handle missing response headers gracefully', () => {
      (mockResponse.get as jest.Mock).mockReturnValue(undefined);

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Advance time and call end
      jest.advanceTimersByTime(100);
      (mockResponse.end as any)();

      expect(logger.info).toHaveBeenCalledWith('HTTP request completed', {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/tasks',
        statusCode: 200,
        duration: '100ms',
        contentLength: undefined,
      });
    });

    it('should handle different HTTP methods', () => {
      mockRequest.method = 'POST';
      mockRequest.originalUrl = '/api/tasks';
      mockRequest.url = '/api/tasks';

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      expect(logger.info).toHaveBeenCalledWith('HTTP request started', {
        requestId: 'test-request-id',
        method: 'POST',
        url: '/api/tasks',
        userAgent: undefined,
        ip: '127.0.0.1',
        contentLength: undefined,
      });
    });

    it('should handle different status codes', () => {
      mockResponse.statusCode = 404;

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Advance time and call end
      jest.advanceTimersByTime(100);
      (mockResponse.end as any)();

      expect(logger.info).toHaveBeenCalledWith('HTTP request completed', {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/tasks',
        statusCode: 404,
        duration: '100ms',
        contentLength: undefined,
      });
    });

    it('should handle error status codes', () => {
      mockResponse.statusCode = 500;

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Advance time and call end
      jest.advanceTimersByTime(100);
      (mockResponse.end as any)();

      expect(logger.info).toHaveBeenCalledWith('HTTP request completed', {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/tasks',
        statusCode: 500,
        duration: '100ms',
        contentLength: undefined,
      });
    });

    it('should handle very slow requests', () => {
      (mockResponse.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Length') return '1024';
        return undefined;
      });

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Advance time by 10 seconds (very slow request)
      jest.advanceTimersByTime(10000);

      // Call the overridden end function
      (mockResponse.end as any)();

      expect(logger.warn).toHaveBeenCalledWith('Slow HTTP request detected', {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/tasks',
        duration: '10000ms',
      });
    });

    it('should handle edge case timing (exactly 1000ms)', () => {
      (mockResponse.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Length') return '512';
        return undefined;
      });

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Advance time by exactly 1000ms
      jest.advanceTimersByTime(1000);

      // Call the overridden end function
      (mockResponse.end as any)();

      // Should not log as slow request (threshold is > 1000ms)
      expect(logger.warn).not.toHaveBeenCalledWith(
        'Slow HTTP request detected',
        expect.any(Object)
      );
    });

    it('should handle edge case timing (1001ms - slow request)', () => {
      (mockResponse.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Content-Length') return '512';
        return undefined;
      });

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Advance time by 1001ms (just over threshold)
      jest.advanceTimersByTime(1001);

      // Call the overridden end function
      (mockResponse.end as any)();

      // Should log as slow request
      expect(logger.warn).toHaveBeenCalledWith('Slow HTTP request detected', {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/tasks',
        duration: '1001ms',
      });
    });

    it('should preserve original end function arguments', () => {
      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Call the overridden end function with arguments
      const callback = () => {};
      (mockResponse.end as any)('data', 'utf8', callback);

      expect(mockOriginalEnd).toHaveBeenCalledWith('data', 'utf8', callback);
    });

    it('should handle multiple end calls gracefully', () => {
      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      // Call end multiple times
      (mockResponse.end as any)();
      (mockResponse.end as any)();
      (mockResponse.end as any)();

      // Should log request started + request completed (only once)
      expect(logger.info).toHaveBeenCalledTimes(2);
    });

    it('should handle undefined originalUrl', () => {
      mockRequest.originalUrl = undefined;
      mockRequest.url = '/api/tasks';

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      expect(logger.info).toHaveBeenCalledWith('HTTP request started', {
        requestId: 'test-request-id',
        method: 'GET',
        url: undefined,
        userAgent: undefined,
        ip: '127.0.0.1',
        contentLength: undefined,
      });
    });

    it('should handle undefined url', () => {
      mockRequest.originalUrl = '/api/tasks';
      mockRequest.url = undefined;

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      expect(logger.info).toHaveBeenCalledWith('HTTP request started', {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/tasks',
        userAgent: undefined,
        ip: '127.0.0.1',
        contentLength: undefined,
      });
    });

    it('should handle missing requestId', () => {
      mockRequest.requestId = undefined;

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      expect(logger.info).toHaveBeenCalledWith('HTTP request started', {
        requestId: undefined,
        method: 'GET',
        url: '/api/tasks',
        userAgent: undefined,
        ip: '127.0.0.1',
        contentLength: undefined,
      });
    });

    it('should handle missing IP address', () => {
      mockRequest.ip = undefined;

      requestLoggingMiddleware(mockRequest, mockResponse, mockNext);

      expect(logger.info).toHaveBeenCalledWith('HTTP request started', {
        requestId: 'test-request-id',
        method: 'GET',
        url: '/api/tasks',
        userAgent: undefined,
        ip: undefined,
        contentLength: undefined,
      });
    });
  });
});
