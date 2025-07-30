/**
 * @fileoverview Tests for WebSocket authentication system
 * @lastmodified 2025-07-27T23:45:19Z
 *
 * Features: JWT, API key, and credential authentication testing
 * Main APIs: WebSocketAuth authentication and authorization
 * Constraints: Mock JWT and environment variables for testing
 * Patterns: Security-focused testing with various auth scenarios
 */

import jwt from 'jsonwebtoken';
import { WebSocketAuth } from '@/websocket/auth';
import type { WebSocketUser } from '@/websocket/types';

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock JWT
jest.mock('jsonwebtoken');
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('WebSocketAuth', () => {
  let webSocketAuth: WebSocketAuth;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    webSocketAuth = new WebSocketAuth();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Initialization', () => {
    it('should initialize without API keys when none provided', () => {
      const auth = new WebSocketAuth();
      expect(auth.listApiKeys()).toHaveLength(0);
    });

    it('should initialize with API keys from environment', () => {
      process.env.DEFAULT_API_KEYS = 'key1,key2,key3';
      const auth = new WebSocketAuth();

      const apiKeys = auth.listApiKeys();
      expect(apiKeys).toHaveLength(3);
      expect(apiKeys[0].user.role).toBe('user');
    });

    it('should add development key in development environment', () => {
      process.env.NODE_ENV = 'development';
      const auth = new WebSocketAuth();

      const apiKeys = auth.listApiKeys();
      expect(apiKeys.some(k => k.user.id === 'dev_user')).toBe(true);
    });
  });

  describe('Authentication Methods', () => {
    describe('JWT Authentication', () => {
      it('should authenticate with valid JWT token', async () => {
        const mockUser = {
          userId: 'user123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user',
        };

        mockJwt.verify.mockReturnValue(mockUser as any);

        const result = await webSocketAuth.authenticate({
          token: 'valid-jwt-token',
        });

        expect(result.success).toBe(true);
        expect(result.user?.id).toBe('user123');
        expect(result.user?.email).toBe('test@example.com');
        expect(result.permissions).toBeInstanceOf(Set);
      });

      it('should reject invalid JWT token', async () => {
        mockJwt.verify.mockImplementation(() => {
          throw new Error('Invalid token');
        });

        const result = await webSocketAuth.authenticate({
          token: 'invalid-jwt-token',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid JWT token');
      });

      it('should reject JWT token without userId', async () => {
        mockJwt.verify.mockReturnValue({ email: 'test@example.com' } as any);

        const result = await webSocketAuth.authenticate({
          token: 'token-without-userid',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid token: missing user ID');
      });

      it('should use default permissions when none provided in token', async () => {
        mockJwt.verify.mockReturnValue({
          userId: 'user123',
          role: 'admin',
        } as any);

        const result = await webSocketAuth.authenticate({
          token: 'valid-jwt-token',
        });

        expect(result.success).toBe(true);
        expect(result.permissions?.has('manage:system')).toBe(true);
        expect(result.permissions?.has('read:all')).toBe(true);
      });

      it('should use custom permissions from token', async () => {
        mockJwt.verify.mockReturnValue({
          userId: 'user123',
          permissions: ['read:custom', 'write:custom'],
        } as any);

        const result = await webSocketAuth.authenticate({
          token: 'valid-jwt-token',
        });

        expect(result.success).toBe(true);
        expect(result.permissions?.has('read:custom')).toBe(true);
        expect(result.permissions?.has('write:custom')).toBe(true);
      });
    });

    describe('API Key Authentication', () => {
      beforeEach(() => {
        webSocketAuth.addApiKey('test-api-key', {
          id: 'api-user-1',
          name: 'API User',
          role: 'user',
        });
      });

      it('should authenticate with valid API key', async () => {
        const result = await webSocketAuth.authenticate({
          apiKey: 'test-api-key',
        });

        expect(result.success).toBe(true);
        expect(result.user?.id).toBe('api-user-1');
        expect(result.user?.name).toBe('API User');
        expect(result.permissions).toBeInstanceOf(Set);
      });

      it('should reject invalid API key', async () => {
        const result = await webSocketAuth.authenticate({
          apiKey: 'invalid-api-key',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid API key');
      });

      it('should provide appropriate permissions for API key user role', async () => {
        webSocketAuth.addApiKey('admin-key', {
          id: 'admin-user',
          name: 'Admin User',
          role: 'admin',
        });

        const result = await webSocketAuth.authenticate({
          apiKey: 'admin-key',
        });

        expect(result.success).toBe(true);
        expect(result.permissions?.has('manage:system')).toBe(true);
        expect(result.permissions?.has('delete:all')).toBe(true);
      });
    });

    describe('Credential Authentication', () => {
      it('should authenticate with valid credentials', async () => {
        const result = await webSocketAuth.authenticate({
          credentials: {
            username: 'test@example.com',
            password: 'password123',
          },
        });

        expect(result.success).toBe(true);
        expect(result.user?.email).toBe('test@example.com');
        expect(result.user?.name).toBe('test');
        expect(result.permissions).toBeInstanceOf(Set);
      });

      it('should reject credentials without email', async () => {
        const result = await webSocketAuth.authenticate({
          credentials: {
            username: '',
            password: 'password123',
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Email and password required');
      });

      it('should reject credentials without password', async () => {
        const result = await webSocketAuth.authenticate({
          credentials: {
            username: 'test@example.com',
            password: '',
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Email and password required');
      });
    });

    describe('Error Handling', () => {
      it('should handle missing authentication payload', async () => {
        const result = await webSocketAuth.authenticate(null as any);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Authentication payload required');
      });

      it('should handle empty authentication payload', async () => {
        const result = await webSocketAuth.authenticate({});

        expect(result.success).toBe(false);
        expect(result.error).toBe('No valid authentication method provided');
      });

      it('should handle authentication exceptions gracefully', async () => {
        // Force an error by mocking API key authentication to throw
        const spy = jest.spyOn(webSocketAuth, 'authenticate').mockImplementation(async () => {
          throw new Error('Unexpected error');
        });

        const result = await webSocketAuth.authenticate({
          apiKey: 'test-key',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Authentication failed');

        spy.mockRestore();
      });
    });
  });

  describe('Permission System', () => {
    describe('Role-based Permissions', () => {
      it('should provide admin permissions for admin role', () => {
        const permissions = WebSocketAuth.getDefaultPermissions('admin');

        expect(permissions).toContain('read:all');
        expect(permissions).toContain('write:all');
        expect(permissions).toContain('delete:all');
        expect(permissions).toContain('manage:users');
        expect(permissions).toContain('manage:system');
        expect(permissions).toContain('subscribe:all');
      });

      it('should provide manager permissions for manager role', () => {
        const permissions = WebSocketAuth.getDefaultPermissions('manager');

        expect(permissions).toContain('read:all');
        expect(permissions).toContain('write:all');
        expect(permissions).toContain('delete:own');
        expect(permissions).toContain('manage:team');
        expect(permissions).toContain('subscribe:all');
        expect(permissions).not.toContain('manage:system');
      });

      it('should provide user permissions for user role', () => {
        const permissions = WebSocketAuth.getDefaultPermissions('user');

        expect(permissions).toContain('read:assigned');
        expect(permissions).toContain('write:assigned');
        expect(permissions).toContain('delete:own');
        expect(permissions).toContain('subscribe:assigned');
        expect(permissions).not.toContain('read:all');
      });

      it('should provide minimal permissions for unknown role', () => {
        const permissions = WebSocketAuth.getDefaultPermissions('unknown');

        expect(permissions).toContain('read:public');
        expect(permissions).toContain('subscribe:public');
        expect(permissions).not.toContain('write:assigned');
      });
    });

    describe('Permission Checking', () => {
      it('should check exact permissions', () => {
        const permissions = new Set(['read:tasks', 'write:boards']);

        expect(WebSocketAuth.hasPermission(permissions, 'read:tasks')).toBe(true);
        expect(WebSocketAuth.hasPermission(permissions, 'write:boards')).toBe(true);
        expect(WebSocketAuth.hasPermission(permissions, 'delete:tasks')).toBe(false);
      });

      it('should check wildcard permissions', () => {
        const permissions = new Set(['read:all', 'write:boards']);

        expect(WebSocketAuth.hasPermission(permissions, 'read:tasks')).toBe(true);
        expect(WebSocketAuth.hasPermission(permissions, 'read:users')).toBe(true);
        expect(WebSocketAuth.hasPermission(permissions, 'write:tasks')).toBe(false);
      });

      it('should check admin permissions', () => {
        const adminPermissions = new Set(['admin:all']);
        const allPermissions = new Set(['*:all']);

        expect(WebSocketAuth.hasPermission(adminPermissions, 'read:anything')).toBe(true);
        expect(WebSocketAuth.hasPermission(adminPermissions, 'delete:anything')).toBe(true);
        expect(WebSocketAuth.hasPermission(allPermissions, 'manage:system')).toBe(true);
      });
    });

    describe('Resource Access Control', () => {
      it('should check board access permissions', () => {
        const readAllPermissions = new Set(['read:all']);
        const specificBoardPermissions = new Set(['read:board:board123']);
        const noPermissions = new Set(['write:tasks']);

        expect(WebSocketAuth.canAccessBoard(readAllPermissions, 'board123')).toBe(true);
        expect(WebSocketAuth.canAccessBoard(specificBoardPermissions, 'board123')).toBe(true);
        expect(WebSocketAuth.canAccessBoard(noPermissions, 'board123')).toBe(false);
      });

      it('should check task access permissions', () => {
        const writeAllPermissions = new Set(['write:all']);
        const specificTaskPermissions = new Set(['write:task:task456']);
        const readOnlyPermissions = new Set(['read:all']);

        expect(WebSocketAuth.canAccessTask(writeAllPermissions, 'task456', 'write')).toBe(true);
        expect(WebSocketAuth.canAccessTask(specificTaskPermissions, 'task456', 'write')).toBe(true);
        expect(WebSocketAuth.canAccessTask(readOnlyPermissions, 'task456', 'write')).toBe(false);
        expect(WebSocketAuth.canAccessTask(readOnlyPermissions, 'task456', 'read')).toBe(true);
      });

      it('should check subscription permissions', () => {
        const subscribeAllPermissions = new Set(['subscribe:all']);
        const specificChannelPermissions = new Set(['subscribe:board:updates']);
        const noSubscribePermissions = new Set(['read:all']);

        expect(WebSocketAuth.canSubscribeToChannel(subscribeAllPermissions, 'board:updates')).toBe(
          true
        );
        expect(
          WebSocketAuth.canSubscribeToChannel(specificChannelPermissions, 'board:updates')
        ).toBe(true);
        expect(WebSocketAuth.canSubscribeToChannel(noSubscribePermissions, 'board:updates')).toBe(
          false
        );
      });
    });

    describe('Operation Validation', () => {
      it('should validate operation permissions', () => {
        const permissions = new Set(['read:tasks', 'write:boards:board123']);

        expect(WebSocketAuth.validateOperation(permissions, 'read', 'tasks')).toBe(true);
        expect(WebSocketAuth.validateOperation(permissions, 'write', 'boards', 'board123')).toBe(
          true
        );
        expect(WebSocketAuth.validateOperation(permissions, 'delete', 'tasks')).toBe(false);
        expect(WebSocketAuth.validateOperation(permissions, 'write', 'boards', 'board456')).toBe(
          false
        );
      });

      it('should validate with wildcard permissions', () => {
        const permissions = new Set(['write:all']);

        expect(WebSocketAuth.validateOperation(permissions, 'write', 'tasks', 'task123')).toBe(
          true
        );
        expect(WebSocketAuth.validateOperation(permissions, 'write', 'boards')).toBe(true);
        expect(WebSocketAuth.validateOperation(permissions, 'read', 'tasks')).toBe(false);
      });
    });
  });

  describe('API Key Management', () => {
    it('should add API key', () => {
      const user: WebSocketUser = {
        id: 'user123',
        name: 'Test User',
        role: 'user',
      };

      webSocketAuth.addApiKey('new-api-key', user);

      const apiKeys = webSocketAuth.listApiKeys();
      expect(apiKeys.some(k => k.user.id === 'user123')).toBe(true);
    });

    it('should remove API key', () => {
      const user: WebSocketUser = {
        id: 'user123',
        name: 'Test User',
        role: 'user',
      };

      webSocketAuth.addApiKey('removable-key', user);
      expect(webSocketAuth.removeApiKey('removable-key')).toBe(true);
      expect(webSocketAuth.removeApiKey('non-existent-key')).toBe(false);

      const apiKeys = webSocketAuth.listApiKeys();
      expect(apiKeys.some(k => k.user.id === 'user123')).toBe(false);
    });

    it('should list API keys with masked keys', () => {
      const user: WebSocketUser = {
        id: 'user123',
        name: 'Test User',
        role: 'user',
      };

      webSocketAuth.addApiKey('very-long-api-key-12345', user);

      const apiKeys = webSocketAuth.listApiKeys();
      const addedKey = apiKeys.find(k => k.user.id === 'user123');

      expect(addedKey?.key).toBe('very-lon...');
      expect(addedKey?.user.name).toBe('Test User');
    });
  });

  describe('JWT Token Generation', () => {
    beforeEach(() => {
      mockJwt.sign.mockReturnValue('generated-jwt-token' as any);
    });

    it('should generate JWT token with user and permissions', () => {
      const user: WebSocketUser = {
        id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'user',
      };
      const permissions = ['read:tasks', 'write:tasks'];

      const token = WebSocketAuth.generateJWT(user, permissions);

      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          permissions,
          email: 'test@example.com',
          name: 'Test User',
          role: 'user',
        }),
        expect.any(String),
        { expiresIn: '24h' }
      );
      expect(token).toBe('generated-jwt-token');
    });

    it('should generate JWT token with custom expiration', () => {
      const user: WebSocketUser = {
        id: 'user123',
        name: 'Test User',
        role: 'user',
      };
      const permissions = ['read:tasks'];

      WebSocketAuth.generateJWT(user, permissions, '1h');

      expect(mockJwt.sign).toHaveBeenCalledWith(expect.any(Object), expect.any(String), {
        expiresIn: '1h',
      });
    });

    it('should only include existing user properties in JWT', () => {
      const user: WebSocketUser = {
        id: 'user123',
        name: 'Test User',
        role: 'user',
        // email not provided
      };
      const permissions = ['read:tasks'];

      WebSocketAuth.generateJWT(user, permissions);

      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          name: 'Test User',
          role: 'user',
        }),
        expect.any(String),
        expect.any(Object)
      );

      const callArgs = mockJwt.sign.mock.calls[0][0] as any;
      expect(callArgs).not.toHaveProperty('email');
    });

    it('should warn about default JWT secret in production', () => {
      process.env.JWT_SECRET = 'dev-secret-key-change-in-production';

      const user: WebSocketUser = { id: 'user123', name: 'Test', role: 'user' };
      WebSocketAuth.generateJWT(user, []);

      // Logger should have been called with warning
      expect(require('@/utils/logger').logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('JWT generation using default secret')
      );
    });
  });

  describe('Environment and Security', () => {
    it('should use custom JWT secret when provided', () => {
      process.env.JWT_SECRET = 'custom-secret-key';

      mockJwt.verify.mockReturnValue({ userId: 'user123' } as any);

      // The JWT secret should be used in verification
      webSocketAuth.authenticate({ token: 'test-token' });

      expect(mockJwt.verify).toHaveBeenCalledWith('test-token', 'custom-secret-key');
    });

    it('should handle missing JWT secret gracefully', () => {
      delete process.env.JWT_SECRET;

      mockJwt.verify.mockReturnValue({ userId: 'user123' } as any);

      webSocketAuth.authenticate({ token: 'test-token' });

      expect(mockJwt.verify).toHaveBeenCalledWith(
        'test-token',
        'dev-secret-key-change-in-production'
      );
    });

    it('should warn about default JWT secret during authentication', async () => {
      process.env.JWT_SECRET = 'dev-secret-key-change-in-production';
      mockJwt.verify.mockReturnValue({ userId: 'user123' } as any);

      await webSocketAuth.authenticate({ token: 'test-token' });

      expect(require('@/utils/logger').logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('JWT authentication using default secret')
      );
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle malformed JWT tokens', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new jwt.JsonWebTokenError('malformed jwt');
      });

      const result = await webSocketAuth.authenticate({ token: 'malformed.jwt.token' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid JWT token');
    });

    it('should handle expired JWT tokens', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
      });

      const result = await webSocketAuth.authenticate({ token: 'expired.jwt.token' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid JWT token');
    });

    it('should handle concurrent API key authentication', async () => {
      webSocketAuth.addApiKey('concurrent-key', {
        id: 'user123',
        name: 'Concurrent User',
        role: 'user',
      });

      // Run multiple authentications concurrently
      const promises = Array(5)
        .fill(null)
        .map(async () => webSocketAuth.authenticate({ apiKey: 'concurrent-key' }));

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.user?.id).toBe('user123');
      });
    });

    it('should handle empty permission sets', () => {
      const emptyPermissions = new Set<string>();

      expect(WebSocketAuth.hasPermission(emptyPermissions, 'read:tasks')).toBe(false);
      expect(WebSocketAuth.canAccessBoard(emptyPermissions, 'board123')).toBe(false);
      expect(WebSocketAuth.canAccessTask(emptyPermissions, 'task123')).toBe(false);
    });

    it('should handle complex permission hierarchies', () => {
      const permissions = new Set([
        'read:board:project1',
        'write:task:urgent',
        'subscribe:notifications:user123',
      ]);

      expect(WebSocketAuth.canAccessBoard(permissions, 'project1', 'read')).toBe(true);
      expect(WebSocketAuth.canAccessBoard(permissions, 'project2', 'read')).toBe(false);
      expect(WebSocketAuth.canAccessTask(permissions, 'urgent', 'write')).toBe(true);
      expect(WebSocketAuth.canSubscribeToChannel(permissions, 'notifications:user123')).toBe(true);
      expect(WebSocketAuth.canSubscribeToChannel(permissions, 'notifications:user456')).toBe(false);
    });
  });
});
