import { Request, Response, NextFunction } from 'express';
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

export function authenticationMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Skip authentication for public endpoints
  const publicEndpoints = ['/health', '/docs', '/'];
  if (publicEndpoints.some(endpoint => req.path.startsWith(endpoint))) {
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

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!req.user.permissions.includes(permission) && !req.user.permissions.includes('admin')) {
      return next(new ForbiddenError(`Permission '${permission}' required`));
    }

    next();
  };
}

export function requirePermissions(permissions: string[], requireAll: boolean = false) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
      return next(new ForbiddenError(`Requires ${operator} of permissions: ${permissions.join(', ')}`));
    }

    next();
  };
}

function validateApiKey(apiKey: string): boolean {
  // In development, allow a default key
  if (config.server.nodeEnv === 'development' && apiKey === 'dev-key-1') {
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