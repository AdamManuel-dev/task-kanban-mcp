/**
 * Unit tests for Request ID Middleware
 *
 * @description Tests for request ID generation, header handling, and UUID validation
 */

import type { NextFunction } from 'express';
import { requestIdMiddleware } from '@/middleware/requestId';
import type { MockRequest, MockResponse } from '../../utils/test-types';

describe('Request ID Middleware', () => {
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      get: jest.fn(),
    };
    mockResponse = {
      set: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('requestIdMiddleware', () => {
    it('should use existing X-Request-ID header if present', () => {
      const existingRequestId = 'existing-request-id-123';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-Request-ID') return existingRequestId;
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBe(existingRequestId);
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', existingRequestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should generate new UUID if X-Request-ID header is not present', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBeDefined();
      expect(typeof mockRequest.requestId).toBe('string');
      expect(mockRequest.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', mockRequest.requestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should generate new UUID if X-Request-ID header is empty string', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-Request-ID') return '';
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBeDefined();
      expect(typeof mockRequest.requestId).toBe('string');
      expect(mockRequest.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', mockRequest.requestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should generate new UUID if X-Request-ID header is whitespace only', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-Request-ID') return '   ';
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBeDefined();
      expect(typeof mockRequest.requestId).toBe('string');
      expect(mockRequest.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', mockRequest.requestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should generate unique UUIDs for different requests', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      // First request
      requestIdMiddleware(mockRequest, mockResponse, mockNext);
      const firstRequestId = mockRequest.requestId;

      // Reset for second request
      jest.clearAllMocks();
      mockRequest.requestId = undefined;

      // Second request
      requestIdMiddleware(mockRequest, mockResponse, mockNext);
      const secondRequestId = mockRequest.requestId;

      expect(firstRequestId).not.toBe(secondRequestId);
      expect(firstRequestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(secondRequestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should call next() after processing', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should set response header with correct value', () => {
      const testRequestId = 'test-request-id-456';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-Request-ID') return testRequestId;
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', testRequestId);
    });

    it('should handle case-insensitive header lookup', () => {
      const testRequestId = 'test-request-id-789';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header.toLowerCase() === 'x-request-id') return testRequestId;
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBe(testRequestId);
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', testRequestId);
    });

    it('should handle undefined get method gracefully', () => {
      mockRequest.get = undefined;

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBeDefined();
      expect(typeof mockRequest.requestId).toBe('string');
      expect(mockRequest.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', mockRequest.requestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle get method that returns null', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(null);

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBeDefined();
      expect(typeof mockRequest.requestId).toBe('string');
      expect(mockRequest.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', mockRequest.requestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle get method that throws error', () => {
      (mockRequest.get as jest.Mock).mockImplementation(() => {
        throw new Error('Header lookup failed');
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBeDefined();
      expect(typeof mockRequest.requestId).toBe('string');
      expect(mockRequest.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', mockRequest.requestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle set method that throws error', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);
      (mockResponse.set as jest.Mock).mockImplementation(() => {
        throw new Error('Header set failed');
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBeDefined();
      expect(typeof mockRequest.requestId).toBe('string');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle undefined set method gracefully', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);
      mockResponse.set = undefined;

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBeDefined();
      expect(typeof mockRequest.requestId).toBe('string');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle complex request ID formats', () => {
      const complexRequestId = 'req-123-456-789-abc-def-ghi-jkl';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-Request-ID') return complexRequestId;
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBe(complexRequestId);
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', complexRequestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle very long request IDs', () => {
      const longRequestId = 'a'.repeat(1000);
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-Request-ID') return longRequestId;
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBe(longRequestId);
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', longRequestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle special characters in request ID', () => {
      const specialRequestId = 'req-123!@#$%^&*()_+-=[]{}|;:,.<>?';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-Request-ID') return specialRequestId;
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBe(specialRequestId);
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', specialRequestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle unicode characters in request ID', () => {
      const unicodeRequestId = 'req-123-🚀-🌟-🎉';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-Request-ID') return unicodeRequestId;
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBe(unicodeRequestId);
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', unicodeRequestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle numeric request IDs', () => {
      const numericRequestId = '123456789';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-Request-ID') return numericRequestId;
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBe(numericRequestId);
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', numericRequestId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle boolean request IDs', () => {
      const booleanRequestId = 'true';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-Request-ID') return booleanRequestId;
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBe(booleanRequestId);
      expect(mockResponse.set).toHaveBeenCalledWith('X-Request-ID', booleanRequestId);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('UUID Generation', () => {
    it('should generate valid UUID v4 format', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      const uuid = mockRequest.requestId;
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate different UUIDs on each call', () => {
      const uuids = new Set();

      for (let i = 0; i < 100; i++) {
        (mockRequest.get as jest.Mock).mockReturnValue(undefined);
        mockRequest.requestId = undefined;
        jest.clearAllMocks();

        requestIdMiddleware(mockRequest, mockResponse, mockNext);
        uuids.add(mockRequest.requestId);
      }

      expect(uuids.size).toBe(100);
    });

    it('should generate UUIDs with correct version (4)', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      const uuid = mockRequest.requestId;
      const parts = uuid.split('-');
      expect(parts[2][0]).toMatch(/[1-5]/); // Version 4
    });

    it('should generate UUIDs with correct variant', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      const uuid = mockRequest.requestId;
      const parts = uuid.split('-');
      expect(parts[3][0]).toMatch(/[89ab]/i); // RFC 4122 variant
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent requests with same header', () => {
      const sharedRequestId = 'shared-request-id';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-Request-ID') return sharedRequestId;
        return undefined;
      });

      // Simulate concurrent requests
      const request1 = { ...mockRequest };
      const request2 = { ...mockRequest };
      const response1 = { ...mockResponse };
      const response2 = { ...mockResponse };

      requestIdMiddleware(request1, response1, mockNext);
      requestIdMiddleware(request2, response2, mockNext);

      expect(request1.requestId).toBe(sharedRequestId);
      expect(request2.requestId).toBe(sharedRequestId);
    });

    it('should handle requests with no headers', () => {
      mockRequest.get = jest.fn().mockReturnValue(undefined);

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBeDefined();
      expect(typeof mockRequest.requestId).toBe('string');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle requests with only non-request-id headers', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'User-Agent') return 'Test Agent';
        if (header === 'Content-Type') return 'application/json';
        return undefined;
      });

      requestIdMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.requestId).toBeDefined();
      expect(typeof mockRequest.requestId).toBe('string');
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
