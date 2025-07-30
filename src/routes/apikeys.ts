/**
 * @fileoverview API key management endpoints
 * @lastmodified 2025-07-28T17:15:00Z
 *
 * Features: API key CRUD, rotation, expiration, usage stats
 * Main APIs: POST /apikeys, GET /apikeys, PUT /apikeys/:id/rotate, DELETE /apikeys/:id
 * Constraints: Requires admin permissions, proper validation
 * Patterns: Express router, admin-only endpoints, comprehensive management
 */

import type { Request } from 'express';
import { Router } from 'express';
import { ApiKeyService } from '../services/ApiKeyService';
import { dbConnection } from '../database/connection';
import { requirePermission } from '../middleware/auth';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError } from '../utils/errors';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    permissions: string[];
  };
  apiKeyId?: string;
}

const router = Router();
const apiKeyService = new ApiKeyService(dbConnection);

/**
 * Create a new API key
 * Requires admin permission
 */
router.post('/', requirePermission('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { name, description, permissions, expiresAt, rateLimitRpm } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Name is required and cannot be empty');
    }

    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      throw new ValidationError('Permissions array is required and cannot be empty');
    }

    // Validate permissions
    const validPermissions = ['read', 'write', 'admin'];
    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
    if (invalidPermissions.length > 0) {
      throw new ValidationError(`Invalid permissions: ${invalidPermissions.join(', ')}`);
    }

    // Parse expiration date if provided
    let expirationDate: Date | undefined;
    if (expiresAt) {
      expirationDate = new Date(expiresAt);
      if (isNaN(expirationDate.getTime())) {
        throw new ValidationError('Invalid expiration date format');
      }
      if (expirationDate <= new Date()) {
        throw new ValidationError('Expiration date must be in the future');
      }
    }

    // Validate rate limit if provided
    if (rateLimitRpm !== undefined && (typeof rateLimitRpm !== 'number' || rateLimitRpm <= 0)) {
      throw new ValidationError('Rate limit must be a positive number');
    }

    const result = await apiKeyService.createApiKey({
      name: name.trim(),
      description: description?.trim(),
      permissions,
      userId: req.user?.id,
      expiresAt: expirationDate,
      rateLimitRpm,
    });

    // Return the API key info (excluding the raw key for security)
    const response = {
      success: true,
      data: {
        apiKey: {
          ...result.apiKey,
          keyHash: undefined, // Don't expose hash
        },
        key: result.key, // Only show this once
      },
      message: 'API key created successfully. Save the key securely - it will not be shown again.',
    };

    logger.info('API key created via API', {
      keyId: result.apiKey.id,
      name: result.apiKey.name,
      createdBy: req.user?.id,
    });

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * List API keys
 * Requires admin permission
 */
router.get('/', requirePermission('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId, isActive, includeRevoked = 'false', limit = '50', offset = '0' } = req.query;

    const options = {
      userId: userId as string,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      includeRevoked: includeRevoked === 'true',
      limit: parseInt(limit as string) || 50,
      offset: parseInt(offset as string) || 0,
    };

    const apiKeys = await apiKeyService.listApiKeys(options);

    const response = {
      success: true,
      data: apiKeys.map(key => ({
        ...key,
        keyHash: undefined, // Don't expose hash
      })),
      pagination: {
        limit: options.limit,
        offset: options.offset,
        total: apiKeys.length,
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Get API key by ID
 * Requires admin permission
 */
router.get('/:id', requirePermission('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const apiKey = await apiKeyService.getApiKeyById(id);

    if (!apiKey) {
      throw new NotFoundError('API key not found');
    }

    const response = {
      success: true,
      data: {
        ...apiKey,
        keyHash: undefined, // Don't expose hash
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Rotate API key
 * Requires admin permission
 */
router.put('/:id/rotate', requirePermission('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const { gracePeriodMs = 3600000 } = req.body; // Default 1 hour

    if (typeof gracePeriodMs !== 'number' || gracePeriodMs < 0) {
      throw new ValidationError('Grace period must be a non-negative number');
    }

    const result = await apiKeyService.rotateApiKey(id, gracePeriodMs);

    const response = {
      success: true,
      data: result,
      message: 'API key rotated successfully. Update your applications to use the new key.',
    };

    logger.info('API key rotated via API', {
      oldKeyId: result.oldKeyId,
      newKeyId: result.newKeyId,
      rotatedBy: req.user?.id,
      gracePeriodMs,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Revoke API key
 * Requires admin permission
 */
router.delete('/:id', requirePermission('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await apiKeyService.revokeApiKey(id, reason);

    const response = {
      success: true,
      message: 'API key revoked successfully',
    };

    logger.info('API key revoked via API', {
      keyId: id,
      reason,
      revokedBy: req.user?.id,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Get API key usage statistics
 * Requires admin permission
 */
router.get('/stats/usage', requirePermission('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const stats = await apiKeyService.getUsageStats();

    const response = {
      success: true,
      data: stats,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Clean up expired API keys
 * Requires admin permission
 */
router.post('/cleanup/expired', requirePermission('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const cleanedCount = await apiKeyService.cleanupExpiredKeys();

    const response = {
      success: true,
      data: { cleanedCount },
      message: `Cleaned up ${cleanedCount} expired API keys`,
    };

    logger.info('Expired API keys cleaned up via API', {
      cleanedCount,
      triggeredBy: req.user?.id,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * Test current API key (self-check)
 * Requires any valid API key
 */
router.get('/test/current', async (req: AuthenticatedRequest, res, next) => {
  try {
    const response = {
      success: true,
      data: {
        valid: true,
        apiKeyId: req.apiKeyId,
        user: req.user,
        timestamp: new Date().toISOString(),
      },
      message: 'API key is valid and working',
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
