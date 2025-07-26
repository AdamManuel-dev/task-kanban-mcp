import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { AuthenticationResult, WebSocketUser } from './types';

export class WebSocketAuth {
  private apiKeys: Map<string, WebSocketUser> = new Map();

  constructor() {
    this.initializeApiKeys();
  }

  private initializeApiKeys(): void {
    // Initialize with default API keys from config
    if (config.auth.defaultApiKeys) {
      config.auth.defaultApiKeys.forEach((keyConfig) => {
        this.apiKeys.set(keyConfig.key, {
          id: keyConfig.userId,
          name: keyConfig.name,
          role: keyConfig.role,
        });
      });
    }
  }

  async authenticate(payload: any): Promise<AuthenticationResult> {
    try {
      if (!payload) {
        return {
          success: false,
          error: 'Authentication payload required',
        };
      }

      // JWT Token Authentication
      if (payload.token) {
        return await this.authenticateWithJWT(payload.token);
      }

      // API Key Authentication
      if (payload.apiKey) {
        return this.authenticateWithApiKey(payload.apiKey);
      }

      // Credentials Authentication
      if (payload.credentials) {
        return await this.authenticateWithCredentials(payload.credentials);
      }

      return {
        success: false,
        error: 'No valid authentication method provided',
      };
    } catch (error) {
      logger.error('WebSocket authentication error', { error });
      return {
        success: false,
        error: 'Authentication failed',
      };
    }
  }

  private async authenticateWithJWT(token: string): Promise<AuthenticationResult> {
    try {
      if (!config.auth.jwtSecret) {
        return {
          success: false,
          error: 'JWT authentication not configured',
        };
      }

      const decoded = jwt.verify(token, config.auth.jwtSecret) as any;
      
      if (!decoded.userId) {
        return {
          success: false,
          error: 'Invalid token: missing user ID',
        };
      }

      // Get user permissions from token or database
      const permissions = decoded.permissions || this.getDefaultPermissions(decoded.role);

      return {
        success: true,
        user: {
          id: decoded.userId,
          email: decoded.email,
          name: decoded.name,
          role: decoded.role,
        },
        permissions,
      };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        return {
          success: false,
          error: 'Invalid JWT token',
        };
      }

      if (error instanceof jwt.TokenExpiredError) {
        return {
          success: false,
          error: 'JWT token expired',
        };
      }

      logger.error('JWT authentication error', { error });
      return {
        success: false,
        error: 'JWT authentication failed',
      };
    }
  }

  private authenticateWithApiKey(apiKey: string): AuthenticationResult {
    const user = this.apiKeys.get(apiKey);
    
    if (!user) {
      return {
        success: false,
        error: 'Invalid API key',
      };
    }

    const permissions = this.getDefaultPermissions(user.role);

    return {
      success: true,
      user,
      permissions,
    };
  }

  private async authenticateWithCredentials(credentials: {
    email: string;
    password: string;
  }): Promise<AuthenticationResult> {
    try {
      // In a real implementation, you would verify credentials against a database
      // For now, we'll use a simple hardcoded check
      const validCredentials = [
        { email: 'admin@example.com', password: 'admin123', role: 'admin' },
        { email: 'user@example.com', password: 'user123', role: 'user' },
      ];

      const validUser = validCredentials.find(
        (cred) => cred.email === credentials.email && cred.password === credentials.password
      );

      if (!validUser) {
        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      const permissions = this.getDefaultPermissions(validUser.role);

      return {
        success: true,
        user: {
          id: `user_${Date.now()}`,
          email: validUser.email,
          name: validUser.email.split('@')[0],
          role: validUser.role,
        },
        permissions,
      };
    } catch (error) {
      logger.error('Credentials authentication error', { error });
      return {
        success: false,
        error: 'Credentials authentication failed',
      };
    }
  }

  private getDefaultPermissions(role?: string): string[] {
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
        return [
          'read:all',
          'write:all',
          'delete:own',
          'manage:team',
          'subscribe:all',
        ];
      case 'user':
        return [
          'read:assigned',
          'write:assigned',
          'delete:own',
          'subscribe:assigned',
        ];
      default:
        return [
          'read:public',
          'subscribe:public',
        ];
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
      logger.info('API key removed', { apiKey: apiKey.substring(0, 8) + '...' });
    }
    return removed;
  }

  listApiKeys(): Array<{ key: string; user: WebSocketUser }> {
    return Array.from(this.apiKeys.entries()).map(([key, user]) => ({
      key: key.substring(0, 8) + '...',
      user,
    }));
  }

  // Permission Checking
  hasPermission(permissions: Set<string>, requiredPermission: string): boolean {
    // Check exact permission
    if (permissions.has(requiredPermission)) {
      return true;
    }

    // Check wildcard permissions
    const [action, resource] = requiredPermission.split(':');
    if (permissions.has(`${action}:all`)) {
      return true;
    }

    if (permissions.has('*:all') || permissions.has('admin:all')) {
      return true;
    }

    return false;
  }

  canAccessBoard(permissions: Set<string>, boardId: string, action: string = 'read'): boolean {
    return this.hasPermission(permissions, `${action}:all`) ||
           this.hasPermission(permissions, `${action}:board:${boardId}`);
  }

  canAccessTask(permissions: Set<string>, taskId: string, action: string = 'read'): boolean {
    return this.hasPermission(permissions, `${action}:all`) ||
           this.hasPermission(permissions, `${action}:task:${taskId}`);
  }

  canSubscribeToChannel(permissions: Set<string>, channel: string): boolean {
    return this.hasPermission(permissions, `subscribe:${channel}`) ||
           this.hasPermission(permissions, 'subscribe:all');
  }

  // Generate JWT tokens (for testing or client integration)
  generateJWT(user: WebSocketUser, permissions: string[], expiresIn: string = '24h'): string {
    if (!config.auth.jwtSecret) {
      throw new Error('JWT secret not configured');
    }

    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions,
      },
      config.auth.jwtSecret,
      { expiresIn }
    );
  }

  // Validate permissions for specific operations
  validateOperation(
    permissions: Set<string>,
    operation: string,
    resource: string,
    resourceId?: string
  ): boolean {
    const fullPermission = resourceId 
      ? `${operation}:${resource}:${resourceId}`
      : `${operation}:${resource}`;

    return this.hasPermission(permissions, fullPermission);
  }
}