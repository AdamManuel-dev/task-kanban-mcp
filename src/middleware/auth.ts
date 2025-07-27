/**
 * @module middleware/auth
 * @description Authentication and authorization middleware for the API.
 *
 * Provides API key-based authentication and permission-based authorization
 * for all protected routes. Supports both header-based authentication methods.
 *
 * @example
 * ```typescript
 * // Using in routes
 * router.get('/protected', requirePermission('read'), handler);
 * router.post('/admin', requirePermissions(['admin', 'write'], true), handler);
 *
 * // Client authentication
 * fetch('/api/v1/tasks', {
 *   headers: {
 *     'X-API-Key': 'your-api-key'
 *     // or
 *     'Authorization': 'Bearer your-api-key'
 *   }
 * });
 * ```
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { UnauthorizedError, ForbiddenError } from '@/utils/errors';

interface AuthenticatedRequest extends Request {
  apiKey?: string;
  user?: {
    id: string;
    name: string;
    permissions: string[];
  };
}

/**
 * Main authentication middleware that validates API keys.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 *
 * Authentication methods supported:
 * - Header: `X-API-Key: your-api-key`
 * - Header: `Authorization: Bearer your-api-key`
 *
 * Public endpoints that bypass authentication:
 * - `/health` - Health check endpoint
 * - `/docs` - API documentation
 * - `/` - Root endpoint
 *
 * @example
 * ```typescript
 * // Apply to all routes
 * app.use(authenticationMiddleware);
 *
 * // Apply to specific routes
 * router.use('/api', authenticationMiddleware);
 * ```
 */
export function authenticationMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  // Skip authentication for public endpoints
  const publicEndpoints = ['/health', '/docs'];
  const fullPath = req.originalUrl || req.url;

  // Check for exact match or path that starts with endpoint followed by / or query
  const isPublicEndpoint =
    publicEndpoints.some(
      endpoint =>
        fullPath === endpoint ||
        fullPath.startsWith(`${String(endpoint)}/`) ||
        fullPath.startsWith(`${String(endpoint)}?`)
    ) || fullPath === '/'; // Allow root path exactly

  if (isPublicEndpoint) {
    return next();
  }

  const apiKey = req.get('X-API-Key') || req.get('Authorization')?.replace('Bearer ', '');

  if (!apiKey) {
    return next(new UnauthorizedError('API key required'));
  }

  // Validate API key
  const isValidKey = validateApiKey(apiKey);
  if (!isValidKey) {
    logger.warn('Invalid API key attempt', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId,
    });
    return next(new UnauthorizedError('Invalid API key'));
  }

  // Attach API key to request
  req.apiKey = apiKey;

  // For now, create a basic user object
  // In a real implementation, you'd look up the user associated with the API key
  req.user = {
    id: hashApiKey(apiKey),
    name: 'API User',
    permissions: ['read', 'write', 'admin'], // Full permissions for now
  };

  logger.debug('Request authenticated', {
    userId: req.user.id,
    requestId: req.requestId,
  });

  next();
}

/**
 * Create middleware that requires a specific permission.
 *
 * @param permission - Required permission: 'read', 'write', or 'admin'
 * @returns Express middleware function
 *
 * Permission hierarchy:
 * - `admin`: Full access to all operations
 * - `write`: Can create, update, and delete resources
 * - `read`: Can only view resources
 *
 * @example
 * ```typescript
 * // Require read permission
 * router.get('/tasks', requirePermission('read'), getTasks);
 *
 * // Require write permission
 * router.post('/tasks', requirePermission('write'), createTask);
 *
 * // Require admin permission
 * router.delete('/boards/:id', requirePermission('admin'), deleteBoard);
 * ```
 */
export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!req.user.permissions.includes(permission) && !req.user.permissions.includes('admin')) {
      return next(new ForbiddenError(`Permission '${String(permission)}' required`));
    }

    next();
  };
}

/**
 * Create middleware that requires multiple permissions.
 *
 * @param permissions - Array of required permissions
 * @param requireAll - If true, user must have ALL permissions. If false, ANY permission is sufficient (default: false)
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * // Require either read OR write permission
 * router.patch('/tasks/:id', requirePermissions(['read', 'write']), updateTask);
 *
 * // Require both admin AND write permissions
 * router.delete('/users/:id', requirePermissions(['admin', 'write'], true), deleteUser);
 * ```
 */
export function requirePermissions(permissions: string[], requireAll: boolean = false) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (req.user.permissions.includes('admin')) {
      return next();
    }

    const hasPermissions = requireAll
      ? permissions.every(perm => req.user!.permissions.includes(perm))
      : permissions.some(perm => req.user!.permissions.includes(perm));

    if (!hasPermissions) {
      const operator = requireAll ? 'all' : 'any';
      return next(
        new ForbiddenError(
          `Requires ${String(operator)} of permissions: ${String(String(permissions.join(', ')))}`
        )
      );
    }

    next();
  };
}

/**
 * Validate an API key against configured keys.
 *
 * @param apiKey - The API key to validate
 * @returns True if valid, false otherwise
 *
 * Special keys for development/testing:
 * - `dev-key-1`: Allowed in development environment
 * - `test-key-1`: Allowed in test environment
 *
 * Production keys must be configured in environment variables.
 */
function validateApiKey(apiKey: string): boolean {
  // In development and test, allow default keys
  if (
    (config.server.nodeEnv === 'development' || config.server.nodeEnv === 'test') &&
    (apiKey === 'dev-key-1' || apiKey === 'test-key-1')
  ) {
    return true;
  }

  // Check against configured API keys
  return config.api.keys.includes(apiKey);
}

function hashApiKey(apiKey: string): string {
  return crypto
    .createHash('sha256')
    .update(apiKey + config.api.keySecret)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Generate a new secure API key.
 *
 * @returns A 64-character hexadecimal API key
 *
 * @example
 * ```typescript
 * const newApiKey = generateApiKey();
 * logger.log(newApiKey); // "a3f4b2c1d5e6..." (64 chars)
 * ```
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function revokeApiKey(apiKey: string): boolean {
  // In a real implementation, you'd mark the key as revoked in the database
  // For now, just remove it from the config (which won't persist)
  const index = config.api.keys.indexOf(apiKey);
  if (index > -1) {
    config.api.keys.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Middleware specifically for API key authentication.
 *
 * Unlike the main authentication middleware, this immediately returns
 * a JSON error response on authentication failure rather than passing
 * to error handlers.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 *
 * @example
 * ```typescript
 * // Use for specific API endpoints
 * router.use('/api/v1', authenticateApiKey);
 * ```
 *
 * Error responses:
 * - 401 with code 'MISSING_API_KEY' if no key provided
 * - 401 with code 'INVALID_API_KEY' if key is invalid
 */
export function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.get('X-API-Key') || req.get('Authorization')?.replace('Bearer ', '');

  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: {
        code: 'MISSING_API_KEY',
        message: 'API key required',
      },
    });
    return;
  }

  // Validate API key
  const isValidKey = validateApiKey(apiKey);
  if (!isValidKey) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      },
    });
    return;
  }

  req.apiKey = apiKey;
  next();
}
