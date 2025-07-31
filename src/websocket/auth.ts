import jwt from 'jsonwebtoken';
import { logger } from '@/utils/logger';
import { envManager } from '@/config/env-manager';
import { isSecureSecret, generateApiKey, hashApiKey } from '@/config/security';
import type { AuthenticationResult, WebSocketUser } from './types';
import type { AuthPayload } from './messageTypes';

export class WebSocketAuth {
  private readonly apiKeys: Map<string, WebSocketUser> = new Map();

  constructor() {
    this.initializeApiKeys();
  }

  private initializeApiKeys(): void {
    // Initialize with API keys from environment
    const apiKeys = envManager.get<string[]>('API_KEYS', []);

    // Add valid API keys from environment
    apiKeys.forEach((key, index) => {
      if (key && isSecureSecret(key, 32)) {
        this.apiKeys.set(key, {
          id: `api_user_${String(index)}`,
          name: `API User ${String(index)}`,
          role: 'user',
        });
      } else if (process.env.NODE_ENV === 'production') {
        logger.error(`Invalid API key at index ${index} - must be at least 32 characters and secure`);
      }
    });

    // In development, generate a secure key if none provided
    if (process.env.NODE_ENV === 'development' && this.apiKeys.size === 0) {
      const devKey = generateApiKey('dev');
      logger.warn(`Development API key generated: ${devKey}`);
      this.apiKeys.set(devKey, {
        id: 'dev_user',
        name: 'Development User',
        role: 'user',
      });
    }

    if (process.env.NODE_ENV === 'production' && this.apiKeys.size === 0) {
      logger.error('No valid API keys configured for production');
    }
  }

  async authenticate(payload: AuthPayload): Promise<AuthenticationResult> {
    try {
      if (!payload) {
        return { success: false, error: 'Authentication payload required' };
      }

      // JWT Token Authentication
      if (payload.token) {
        return await WebSocketAuth.authenticateWithJWT(payload.token);
      }

      // API Key Authentication
      if (payload.apiKey) {
        return await this.authenticateWithApiKey(payload.apiKey);
      }

      // Credentials Authentication
      if (payload.credentials) {
        return await WebSocketAuth.authenticateWithCredentials({
          email: payload.credentials.username ?? '',
          password: payload.credentials.password ?? '',
        });
      }

      return { success: false, error: 'No valid authentication method provided' };
    } catch (error) {
      logger.error('WebSocket authentication error', { error });
      return { success: false, error: 'Authentication failed' };
    }
  }

  private static async authenticateWithJWT(token: string): Promise<AuthenticationResult> {
    try {
      const jwtSecret = envManager.get<string>('JWT_SECRET');
      if (!jwtSecret) {
        return { success: false, error: 'JWT authentication not configured' };
      }

      const decoded = jwt.verify(token, jwtSecret) as {
        userId: string;
        exp?: number;
        iat?: number;
        permissions?: string[];
        role?: string;
        email?: string;
        name?: string;
      };

      if (!decoded.userId) {
        return { success: false, error: 'Invalid token: missing user ID' };
      }

      // Get user permissions from token or database
      const permissions = decoded.permissions ?? WebSocketAuth.getDefaultPermissions(decoded.role);

      const user: WebSocketUser = {
        id: decoded.userId,
        name: decoded.name ?? decoded.email ?? 'Unknown User',
        role: decoded.role ?? 'user',
        ...(decoded.email && { email: decoded.email }),
      };

      return { success: true, user, permissions };
    } catch (error) {
      return { success: false, error: 'Invalid JWT token' };
    }
  }

  private async authenticateWithApiKey(apiKey: string): Promise<AuthenticationResult> {
    try {
      // Check if API key exists
      const user = this.apiKeys.get(apiKey);
      if (!user) {
        return { success: false, error: 'Invalid API key' };
      }

      // Get permissions for API key user
      const permissions = WebSocketAuth.getDefaultPermissions(user.role);

      // Validate permissions
      const permissionPromises = permissions.map(async permission => {
        // Simulate async permission validation
        await new Promise<void>(resolve => setTimeout(() => resolve(), 1));
        return permission;
      });

      const validatedPermissions = await Promise.all(permissionPromises);

      return { success: true, user, permissions: validatedPermissions };
    } catch (error) {
      logger.error('API key authentication error', { error });
      return { success: false, error: 'API key authentication failed' };
    }
  }

  private static async authenticateWithCredentials(credentials: {
    email: string;
    password: string;
  }): Promise<AuthenticationResult> {
    try {
      // Simulate credential validation
      const { email, password } = credentials;

      if (!email || !password) {
        return { success: false, error: 'Email and password required' };
      }

      // Mock user for demonstration
      const user: WebSocketUser = {
        id: `user_${email}`,
        name: email.split('@')[0],
        email,
        role: 'user',
      };

      const permissions = WebSocketAuth.getDefaultPermissions(user.role);

      return { success: true, user, permissions };
    } catch (error) {
      return { success: false, error: 'Credential authentication failed' };
    }
  }

  private static getDefaultPermissions(role?: string): string[] {
    switch (role) {
      case 'admin':
        return [
          'read:all',
          'write:all',
          'delete:all',
          'manage:users',
          'manage:system',
          'subscribe:all',
        ];
      case 'manager':
        return ['read:all', 'write:all', 'delete:own', 'manage:team', 'subscribe:all'];
      case 'user':
        return ['read:assigned', 'write:assigned', 'delete:own', 'subscribe:assigned'];
      default:
        return ['read:public', 'subscribe:public'];
    }
  }

  // API Key Management
  addApiKey(apiKey: string, user: WebSocketUser): void {
    this.apiKeys.set(apiKey, user);
    logger.info('API key added', { userId: user.id, role: user.role });
  }

  removeApiKey(apiKey: string): boolean {
    const removed = this.apiKeys.delete(apiKey);
    if (removed) {
      logger.info('API key removed', { apiKey: `${String(String(apiKey.substring(0, 8)))}...` });
    }
    return removed;
  }

  listApiKeys(): Array<{ key: string; user: WebSocketUser }> {
    return Array.from(this.apiKeys.entries()).map(([key, user]) => ({
      key: `${String(String(key.substring(0, 8)))}...`,
      user,
    }));
  }

  // Permission Checking
  static hasPermission(permissions: Set<string>, requiredPermission: string): boolean {
    // Check exact permission
    if (permissions.has(requiredPermission)) {
      return true;
    }

    // Check wildcard permissions
    const [action] = requiredPermission.split(':');
    if (permissions.has(`${String(action)}:all`)) {
      return true;
    }

    if (permissions.has('*:all') || permissions.has('admin:all')) {
      return true;
    }

    return false;
  }

  static canAccessBoard(permissions: Set<string>, boardId: string, action = 'read'): boolean {
    return (
      WebSocketAuth.hasPermission(permissions, `${String(action)}:all`) ||
      WebSocketAuth.hasPermission(permissions, `${String(action)}:board:${String(boardId)}`)
    );
  }

  static canAccessTask(permissions: Set<string>, taskId: string, action = 'read'): boolean {
    return (
      WebSocketAuth.hasPermission(permissions, `${String(action)}:all`) ||
      WebSocketAuth.hasPermission(permissions, `${String(action)}:task:${String(taskId)}`)
    );
  }

  static canSubscribeToChannel(permissions: Set<string>, channel: string): boolean {
    return (
      WebSocketAuth.hasPermission(permissions, `subscribe:${String(channel)}`) ||
      WebSocketAuth.hasPermission(permissions, 'subscribe:all')
    );
  }

  // Generate JWT tokens (for testing or client integration)
  static generateJWT(user: WebSocketUser, permissions: string[], expiresIn = '24h'): string {
    const jwtSecret = envManager.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const payload: unknown = {
      userId: user.id,
      permissions,
    };

    // Only include optional properties if they exist
    if (user.email) payload.email = user.email;
    if (user.name) payload.name = user.name;
    if (user.role) payload.role = user.role;

    return jwt.sign(payload, jwtSecret, { expiresIn } as jwt.SignOptions);
  }

  // Validate permissions for specific operations
  static validateOperation(
    permissions: Set<string>,
    operation: string,
    resource: string,
    resourceId?: string
  ): boolean {
    const fullPermission = resourceId
      ? `${String(operation)}:${String(resource)}:${String(resourceId)}`
      : `${String(operation)}:${String(resource)}`;

    return WebSocketAuth.hasPermission(permissions, fullPermission);
  }
}
