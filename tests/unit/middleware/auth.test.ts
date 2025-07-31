/**
 * Unit tests for Authentication Middleware
 *
 * @description Tests for API key authentication, permission checking, and authorization
 */

import type { NextFunction } from 'express';
import {
  authenticationMiddleware,
  requirePermission,
  requirePermissions,
  generateApiKey,
  revokeApiKey,
  authenticateApiKey,
} from '@/middleware/auth';
import { UnauthorizedError, ForbiddenError } from '@/utils/errors';
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

// Mock the config
jest.mock('@/config', () => ({
  config: {
    server: {
      nodeEnv: 'test',
    },
    api: {
      keys: ['test-api-key-1', 'test-api-key-2'],
      keySecret: 'test-secret-key',
      permissions: {
        'test-api-key-1': ['read', 'write'],
        'test-api-key-2': ['read'],
      },
    },
  },
}));

describe('Authentication Middleware', () => {
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      originalUrl: '/api/tasks',
      url: '/api/tasks',
      method: 'GET',
      get: jest.fn(),
      ip: '127.0.0.1',
      requestId: 'test-request-id',
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticationMiddleware', () => {
    it('should allow access to public endpoints without API key', () => {
      mockRequest.originalUrl = '/health';
      mockRequest.url = '/health';

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should allow access to root endpoint without API key', () => {
      mockRequest.originalUrl = '/';
      mockRequest.url = '/';

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should allow access to docs endpoint without API key', () => {
      mockRequest.originalUrl = '/docs';
      mockRequest.url = '/docs';

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should allow access to docs subpaths without API key', () => {
      mockRequest.originalUrl = '/docs/swagger.json';
      mockRequest.url = '/docs/swagger.json';

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject request without API key for protected endpoints', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'API key required',
        })
      );
    });

    it('should accept valid API key from X-API-Key header', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-API-Key') return 'test-api-key-1';
        return undefined;
      });

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.apiKey).toBe('test-api-key-1');
    });

    it('should accept valid API key from Authorization header', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Authorization') return 'Bearer test-api-key-1';
        return undefined;
      });

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.apiKey).toBe('test-api-key-1');
    });

    it('should reject invalid API key', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-API-Key') return 'invalid-api-key';
        return undefined;
      });

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(logger.warn).toHaveBeenCalledWith('Invalid API key attempt', {
        ip: '127.0.0.1',
        userAgent: undefined,
        requestId: 'test-request-id',
      });
    });

    it('should set user information for valid API key', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-API-Key') return 'test-api-key-1';
        return undefined;
      });

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockRequest.user).toEqual({
        id: 'test-api-key-1',
        name: 'API User',
        permissions: ['read', 'write'],
      });
    });
  });

  describe('requirePermission', () => {
    it('should allow access when user has required permission', () => {
      mockRequest.user = {
        id: 'test-api-key-1',
        name: 'API User',
        permissions: ['read', 'write'],
      };

      const middleware = requirePermission('read');
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should deny access when user lacks required permission', () => {
      mockRequest.user = {
        id: 'test-api-key-2',
        name: 'API User',
        permissions: ['read'],
      };

      const middleware = requirePermission('write');
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Insufficient permissions',
        })
      );
    });

    it('should deny access when user has no permissions', () => {
      mockRequest.user = {
        id: 'test-api-key-2',
        name: 'API User',
        permissions: [],
      };

      const middleware = requirePermission('read');
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('should deny access when user is not authenticated', () => {
      const middleware = requirePermission('read');
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe('requirePermissions', () => {
    it('should allow access when user has all required permissions (requireAll=true)', () => {
      mockRequest.user = {
        id: 'test-api-key-1',
        name: 'API User',
        permissions: ['read', 'write'],
      };

      const middleware = requirePermissions(['read', 'write'], true);
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should deny access when user lacks some permissions (requireAll=true)', () => {
      mockRequest.user = {
        id: 'test-api-key-2',
        name: 'API User',
        permissions: ['read'],
      };

      const middleware = requirePermissions(['read', 'write'], true);
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('should allow access when user has any required permission (requireAll=false)', () => {
      mockRequest.user = {
        id: 'test-api-key-2',
        name: 'API User',
        permissions: ['read'],
      };

      const middleware = requirePermissions(['read', 'write'], false);
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('should deny access when user has no required permissions (requireAll=false)', () => {
      mockRequest.user = {
        id: 'test-api-key-2',
        name: 'API User',
        permissions: ['admin'],
      };

      const middleware = requirePermissions(['read', 'write'], false);
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('should default to requireAll=false', () => {
      mockRequest.user = {
        id: 'test-api-key-2',
        name: 'API User',
        permissions: ['read'],
      };

      const middleware = requirePermissions(['read', 'write']);
      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).not.toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('generateApiKey', () => {
    it('should generate a valid API key', () => {
      const apiKey = generateApiKey();

      expect(apiKey).toBeDefined();
      expect(typeof apiKey).toBe('string');
      expect(apiKey.length).toBeGreaterThan(0);
    });

    it('should generate unique API keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe('revokeApiKey', () => {
    it('should return true for valid API key revocation', () => {
      const result = revokeApiKey('test-api-key-1');

      expect(result).toBe(true);
    });

    it('should return false for invalid API key', () => {
      const result = revokeApiKey('invalid-api-key');

      expect(result).toBe(false);
    });
  });

  describe('authenticateApiKey', () => {
    it('should authenticate valid API key and set user info', () => {
      mockRequest.apiKey = 'test-api-key-1';

      authenticateApiKey(mockRequest, mockResponse, mockNext);

      expect(mockRequest.user).toEqual({
        id: 'test-api-key-1',
        name: 'API User',
        permissions: ['read', 'write'],
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject invalid API key', () => {
      mockRequest.apiKey = 'invalid-api-key';

      authenticateApiKey(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(mockRequest.user).toBeUndefined();
    });

    it('should reject missing API key', () => {
      authenticateApiKey(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(mockRequest.user).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed Authorization header', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Authorization') return 'InvalidFormat test-api-key-1';
        return undefined;
      });

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('should handle empty Authorization header', () => {
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'Authorization') return 'Bearer ';
        return undefined;
      });

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('should handle undefined originalUrl', () => {
      mockRequest.originalUrl = undefined;
      mockRequest.url = '/api/tasks';
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-API-Key') return 'test-api-key-1';
        return undefined;
      });

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle undefined url', () => {
      mockRequest.originalUrl = '/api/tasks';
      mockRequest.url = undefined;
      (mockRequest.get as jest.Mock).mockImplementation((header: string) => {
        if (header === 'X-API-Key') return 'test-api-key-1';
        return undefined;
      });

      authenticationMiddleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
