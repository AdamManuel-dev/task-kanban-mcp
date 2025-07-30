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
import { ApiKeyService } from '../services/ApiKeyService';
import { dbConnection } from '../database/connection';

interface AuthenticatedRequest extends Request {
  apiKey?: string;
  apiKeyId?: string;
  user?: {
    id: string;
    name: string;
    permissions: string[];
  };
}

// Initialize API key service
const apiKeyService = new ApiKeyService(dbConnection);

/**
 * Authentication middleware for API key validation.
 *
 * This middleware validates API keys from the X-API-Key header or Authorization header.
 * It also handles public endpoints that don't require authentication.
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
export async function authenticationMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  // Skip authentication for public endpoints
  const publicEndpoints = ['/health', '/docs'];
  const fullPath = req.originalUrl ?? req.url;

  // Check for exact match or path that starts with endpoint followed by / or query
  const isPublicEndpoint =
    publicEndpoints.some(
      endpoint =>
        fullPath === endpoint ||
        fullPath.startsWith(`${String(endpoint)}/`) ||
        fullPath.startsWith(`${String(endpoint)}?`)
    ) || fullPath === '/'; // Allow root path exactly

  if (isPublicEndpoint) {
    next();
    return;
  }

  const apiKey = req.get('X-API-Key') ?? req.get('Authorization')?.replace('Bearer ', '');

  if (!apiKey) {
    next(new UnauthorizedError('API key required'));
    return;
  }

  try {
    // Validate API key using the service
    const validationResult = await apiKeyService.validateApiKey(apiKey);

    if (!validationResult.isValid || !validationResult.apiKey) {
      logger.warn('Invalid API key attempt', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId,
        reason: validationResult.reason,
      });
      // Don't leak specific validation failure reasons to prevent enumeration attacks
      next(new UnauthorizedError('Invalid API key'));
      return;
    }

    // Attach API key info to request (don't store raw API key)
    req.apiKeyId = validationResult.apiKey.id;

    // Create user object from API key
    req.user = {
      id: validationResult.apiKey.userId || hashApiKey(apiKey),
      name: validationResult.apiKey.name ?? 'API User',
      permissions: validationResult.apiKey.permissions || ['read'], // Default to minimal permissions
    };

    logger.debug('Request authenticated', {
      userId: req.user.id,
      apiKeyId: req.apiKeyId,
      apiKeyName: validationResult.apiKey.name,
      requestId: req.requestId,
      permissions: req.user.permissions,
      timestamp: new Date().toISOString(),
    });

    next();
  } catch (error) {
    logger.error('Authentication error', { error, requestId: req.requestId });
    next(new UnauthorizedError('Authentication failed'));
  }
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
export function requirePermission(
  permission: string
): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    // Ensure permissions array exists and is valid
    const userPermissions = req.user.permissions ?? [];
    const hasPermission = userPermissions.includes(permission) || userPermissions.includes('admin');

    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        requiredPermission: permission,
        userPermissions,
        requestId: req.requestId,
      });
      next(new ForbiddenError(`Permission '${String(permission)}' required`));
      return;
    }

    next();
  };
}

/**
 * Create middleware that requires multiple permissions.
 *
 * @param permissions - Array of required permissions
 * @param requireAll - If true, all permissions are required. If false, any permission is sufficient.
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * // Require both read and write permissions
 * router.post('/tasks', requirePermissions(['read', 'write'], true), createTask);
 *
 * // Require either read or write permission
 * router.get('/tasks', requirePermissions(['read', 'write'], false), getTasks);
 * ```
 */
export function requirePermissions(
  permissions: string[],
  requireAll = false
): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    const hasPermission = requireAll
      ? permissions.every(
          permission =>
            req.user?.permissions.includes(permission) || req.user?.permissions.includes('admin')
        )
      : permissions.some(
          permission =>
            req.user?.permissions.includes(permission) || req.user?.permissions.includes('admin')
        );

    if (!hasPermission) {
      const permissionText = requireAll ? 'all of' : 'one of';
      next(
        new ForbiddenError(
          `Permission ${permissionText} [${String(permissions.join(', '))}] required`
        )
      );
      return;
    }

    next();
  };
}

/**
 * Validate an API key.
 *
 * @param apiKey - The API key to validate
 * @returns True if the API key is valid, false otherwise
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function validateApiKey(_apiKey: string): boolean {
  // Legacy validation function - DEPRECATED
  // All API key validation should go through ApiKeyService
  logger.warn('Using deprecated validateApiKey function - migrate to ApiKeyService');
  return false; // Force migration to proper validation
}

/**
 * Hash an API key for use as a user ID.
 *
 * @param apiKey - The API key to hash
 * @returns A hash of the API key
 */
/**
 * Hash API key for secure user ID generation.
 * Uses SHA-256 with additional security measures.
 *
 * @param apiKey - Raw API key to hash
 * @returns Secure hash for user identification
 */
function hashApiKey(apiKey: string): string {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Invalid API key for hashing');
  }

  // Use SHA-256 with salt for better security
  const salt = config.api.keySecret;
  return crypto
    .createHash('sha256')
    .update(apiKey + salt)
    .digest('hex')
    .substring(0, 16); // Increased from 8 to 16 characters for better uniqueness
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
 * Authenticate an API key and return user information.
 *
 * @param req - The request object
 * @param res - The response object
 * @param next - The next function
 */
export async function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.get('X-API-Key') ?? req.get('Authorization')?.replace('Bearer ', '');

  if (!apiKey) {
    logger.warn('Authentication failed: No API key provided', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });
    res.status(401).json({ error: 'API key required' });
    return;
  }

  // Use proper ApiKeyService validation instead of deprecated function
  try {
    const apiKeyService = new ApiKeyService(req.app.get('db'));
    const validationResult = await apiKeyService.validateApiKey(apiKey);
    if (!validationResult.isValid) {
      logger.warn('Authentication failed: Invalid API key provided', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
  } catch (error) {
    logger.error('API key validation error', { error });
    res.status(500).json({ error: 'Authentication service error' });
    return;
  }

  req.apiKey = apiKey;
  req.user = {
    id: hashApiKey(apiKey),
    name: 'API User',
    permissions: ['read', 'write', 'admin'],
  };

  next();
}
