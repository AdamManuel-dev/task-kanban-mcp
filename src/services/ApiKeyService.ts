/**
 * @fileoverview API Key management service with expiration and rotation
 * @lastmodified 2025-07-28T17:00:00Z
 *
 * Features: API key creation, validation, expiration, rotation, permissions
 * Main APIs: createApiKey(), validateApiKey(), rotateApiKey(), revokeApiKey()
 * Constraints: Requires database storage, handles key lifecycle
 * Patterns: Service pattern, lifecycle management, security best practices
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import type { DatabaseConnection, QueryParameters } from '../database/connection';
import { BaseServiceError } from '../utils/errors';

export interface ApiKey {
  id: string;
  keyHash: string;
  name: string;
  description?: string;
  permissions: string[];
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
  isActive: boolean;
  rotationHistory: string[];
  usageCount: number;
  rateLimitRpm?: number;
}

export interface CreateApiKeyRequest {
  name: string;
  description?: string;
  permissions: string[];
  userId?: string;
  expiresAt?: Date;
  rateLimitRpm?: number;
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  apiKey?: ApiKey;
  reason?: string;
}

export interface RotateApiKeyResult {
  oldKeyId: string;
  newKey: string;
  newKeyId: string;
  expiresAt?: Date;
}

export class ApiKeyService {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Create a new API key
   */
  async createApiKey(request: CreateApiKeyRequest): Promise<{ apiKey: ApiKey; key: string }> {
    const id = uuidv4();
    const rawKey = this.generateSecureKey();
    const keyHash = this.hashKey(rawKey);
    const now = new Date();

    const apiKey: ApiKey = {
      id,
      keyHash,
      name: request.name,
      description: request.description,
      permissions: request.permissions,
      userId: request.userId,
      createdAt: now,
      updatedAt: now,
      expiresAt: request.expiresAt,
      isActive: true,
      rotationHistory: [],
      usageCount: 0,
      rateLimitRpm: request.rateLimitRpm,
    };

    try {
      await this.ensureApiKeyTable();

      await this.db.execute(
        `INSERT INTO api_keys (
          id, key_hash, name, description, permissions, user_id, 
          created_at, updated_at, expires_at, is_active, 
          rotation_history, usage_count, rate_limit_rpm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          apiKey.id,
          apiKey.keyHash,
          apiKey.name,
          apiKey.description ?? null,
          JSON.stringify(apiKey.permissions),
          apiKey.userId ?? null,
          apiKey.createdAt.toISOString(),
          apiKey.updatedAt.toISOString(),
          apiKey.expiresAt?.toISOString() ?? null,
          apiKey.isActive ? 1 : 0,
          JSON.stringify(apiKey.rotationHistory),
          apiKey.usageCount,
          apiKey.rateLimitRpm ?? null,
        ]
      );

      logger.info('API key created', {
        keyId: apiKey.id,
        name: apiKey.name,
        permissions: apiKey.permissions,
        expiresAt: apiKey.expiresAt?.toISOString(),
      });

      return { apiKey, key: rawKey };
    } catch (error) {
      logger.error('Failed to create API key', { error, request });
      throw new BaseServiceError('API_KEY_CREATE_FAILED', 'Failed to create API key');
    }
  }

  /**
   * Validate an API key
   */
  async validateApiKey(rawKey: string): Promise<ApiKeyValidationResult> {
    if (!rawKey || rawKey.length === 0) {
      return { isValid: false, reason: 'Empty API key' };
    }

    const keyHash = this.hashKey(rawKey);

    try {
      const row = await this.db.queryOne(
        `SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1`,
        [keyHash]
      );

      if (!row) {
        return { isValid: false, reason: 'API key not found' };
      }

      const apiKey = this.deserializeApiKey(row);

      // Check if key is expired
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        // Auto-revoke expired keys
        await this.revokeApiKey(apiKey.id, 'Expired');
        return { isValid: false, reason: 'API key expired' };
      }

      // Check if key is revoked
      if (apiKey.revokedAt) {
        return { isValid: false, reason: 'API key revoked' };
      }

      // Update last used timestamp and usage count
      await this.updateKeyUsage(apiKey.id);

      return { isValid: true, apiKey };
    } catch (error) {
      logger.error('Failed to validate API key', { error });
      return { isValid: false, reason: 'Validation error' };
    }
  }

  /**
   * Rotate an API key (generate new key, keep old one temporarily)
   */
  async rotateApiKey(keyId: string, gracePeriodMs = 3600000): Promise<RotateApiKeyResult> {
    try {
      const existingKey = await this.getApiKeyById(keyId);
      if (!existingKey) {
        throw new BaseServiceError('API_KEY_NOT_FOUND', 'API key not found');
      }

      if (!existingKey.isActive) {
        throw new BaseServiceError('API_KEY_INACTIVE', 'Cannot rotate inactive API key');
      }

      // Generate new key
      const newRawKey = this.generateSecureKey();
      const newKeyHash = this.hashKey(newRawKey);
      const newId = uuidv4();
      const now = new Date();
      const gracePeriodEnd = new Date(now.getTime() + gracePeriodMs);

      // Create new key with same permissions
      const newApiKey: ApiKey = {
        ...existingKey,
        id: newId,
        keyHash: newKeyHash,
        createdAt: now,
        updatedAt: now,
        expiresAt: existingKey.expiresAt
          ? new Date(existingKey.expiresAt.getTime() + gracePeriodMs)
          : undefined,
        lastUsedAt: undefined,
        usageCount: 0,
        rotationHistory: [existingKey.id],
      };

      // Insert new key
      await this.db.execute(
        `INSERT INTO api_keys (
          id, key_hash, name, description, permissions, user_id, 
          created_at, updated_at, expires_at, is_active, 
          rotation_history, usage_count, rate_limit_rpm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newApiKey.id,
          newApiKey.keyHash,
          `${newApiKey.name} (rotated)`,
          newApiKey.description ?? null,
          JSON.stringify(newApiKey.permissions),
          newApiKey.userId ?? null,
          newApiKey.createdAt.toISOString(),
          newApiKey.updatedAt.toISOString(),
          newApiKey.expiresAt?.toISOString() ?? null,
          newApiKey.isActive ? 1 : 0,
          JSON.stringify(newApiKey.rotationHistory),
          newApiKey.usageCount,
          newApiKey.rateLimitRpm ?? null,
        ]
      );

      // Schedule old key for expiration after grace period
      await this.db.execute(
        `UPDATE api_keys SET 
          expires_at = ?, 
          updated_at = ?,
          name = ?
        WHERE id = ?`,
        [
          gracePeriodEnd.toISOString(),
          now.toISOString(),
          `${existingKey.name} (deprecated)`,
          existingKey.id,
        ]
      );

      logger.info('API key rotated', {
        oldKeyId: existingKey.id,
        newKeyId: newApiKey.id,
        gracePeriodMs,
        gracePeriodEnd: gracePeriodEnd.toISOString(),
      });

      return {
        oldKeyId: existingKey.id,
        newKey: newRawKey,
        newKeyId: newApiKey.id,
        expiresAt: newApiKey.expiresAt,
      };
    } catch (error) {
      logger.error('Failed to rotate API key', { error, keyId });
      throw new BaseServiceError('API_KEY_ROTATION_FAILED', 'Failed to rotate API key');
    }
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId: string, reason?: string): Promise<void> {
    try {
      const now = new Date();

      await this.db.execute(
        `UPDATE api_keys SET 
          is_active = 0, 
          revoked_at = ?, 
          updated_at = ?,
          description = COALESCE(description, '') || CASE 
            WHEN description IS NOT NULL AND LENGTH(description) > 0 
            THEN ' [Revoked: ' || ? || ']'
            ELSE 'Revoked: ' || ?
          END
        WHERE id = ?`,
        [
          now.toISOString(),
          now.toISOString(),
          reason ?? 'Manual revocation',
          reason ?? 'Manual revocation',
          keyId,
        ]
      );

      logger.info('API key revoked', { keyId, reason });
    } catch (error) {
      logger.error('Failed to revoke API key', { error, keyId });
      throw new BaseServiceError('API_KEY_REVOKE_FAILED', 'Failed to revoke API key');
    }
  }

  /**
   * Get API key by ID
   */
  async getApiKeyById(keyId: string): Promise<ApiKey | null> {
    try {
      const row = await this.db.queryOne(`SELECT * FROM api_keys WHERE id = ?`, [keyId]);

      return row ? this.deserializeApiKey(row) : null;
    } catch (error) {
      logger.error('Failed to get API key by ID', { error, keyId });
      return null;
    }
  }

  /**
   * List API keys with filtering
   */
  async listApiKeys(
    options: {
      userId?: string;
      isActive?: boolean;
      includeRevoked?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<ApiKey[]> {
    try {
      let query = 'SELECT * FROM api_keys WHERE 1=1';
      const params: QueryParameters = [];

      if (options.userId) {
        query += ' AND user_id = ?';
        params.push(options.userId);
      }

      if (options.isActive !== undefined) {
        query += ' AND is_active = ?';
        params.push(options.isActive ? 1 : 0);
      }

      if (!options.includeRevoked) {
        query += ' AND revoked_at IS NULL';
      }

      query += ' ORDER BY created_at DESC';

      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);

        if (options.offset) {
          query += ' OFFSET ?';
          params.push(options.offset);
        }
      }

      const rows = await this.db.query(query, params);
      return rows.map(row => this.deserializeApiKey(row));
    } catch (error) {
      logger.error('Failed to list API keys', { error, options });
      return [];
    }
  }

  /**
   * Clean up expired API keys
   */
  async cleanupExpiredKeys(): Promise<number> {
    try {
      const now = new Date();

      // First, get count of expired keys
      const countResult = (await this.db.queryOne(
        `SELECT COUNT(*) as count FROM api_keys 
         WHERE expires_at IS NOT NULL AND expires_at < ? AND is_active = 1`,
        [now.toISOString()]
      )) as { count: number } | null;

      const expiredCount = countResult?.count || 0;

      if (expiredCount > 0) {
        // Revoke expired keys
        await this.db.execute(
          `UPDATE api_keys SET 
            is_active = 0, 
            revoked_at = ?, 
            updated_at = ?,
            description = COALESCE(description, '') || ' [Auto-expired]'
          WHERE expires_at IS NOT NULL AND expires_at < ? AND is_active = 1`,
          [now.toISOString(), now.toISOString(), now.toISOString()]
        );

        logger.info('Cleaned up expired API keys', { count: expiredCount });
      }

      return expiredCount;
    } catch (error) {
      logger.error('Failed to cleanup expired API keys', { error });
      return 0;
    }
  }

  /**
   * Get API key usage statistics
   */
  async getUsageStats(): Promise<{
    totalKeys: number;
    activeKeys: number;
    expiredKeys: number;
    revokedKeys: number;
    totalUsage: number;
    topUsedKeys: Array<{ id: string; name: string; usageCount: number }>;
  }> {
    try {
      const stats = (await this.db.queryOne(`
        SELECT 
          COUNT(*) as totalKeys,
          SUM(CASE WHEN is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now')) THEN 1 ELSE 0 END) as activeKeys,
          SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= datetime('now') THEN 1 ELSE 0 END) as expiredKeys,
          SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) as revokedKeys,
          SUM(usage_count) as totalUsage
        FROM api_keys
      `)) as {
        totalKeys: number;
        activeKeys: number;
        expiredKeys: number;
        revokedKeys: number;
        totalUsage: number;
      } | null;

      const topUsedRows = await this.db.query(`
        SELECT id, name, usage_count 
        FROM api_keys 
        WHERE usage_count > 0
        ORDER BY usage_count DESC 
        LIMIT 10
      `);

      return {
        totalKeys: stats?.totalKeys || 0,
        activeKeys: stats?.activeKeys || 0,
        expiredKeys: stats?.expiredKeys || 0,
        revokedKeys: stats?.revokedKeys || 0,
        totalUsage: stats?.totalUsage || 0,
        topUsedKeys: topUsedRows.map(row => ({
          id: row.id,
          name: row.name,
          usageCount: row.usage_count,
        })),
      };
    } catch (error) {
      logger.error('Failed to get usage stats', { error });
      return {
        totalKeys: 0,
        activeKeys: 0,
        expiredKeys: 0,
        revokedKeys: 0,
        totalUsage: 0,
        topUsedKeys: [],
      };
    }
  }

  // Private helper methods

  private generateSecureKey(): string {
    // Generate a 64-character hex key (32 bytes)
    return crypto.randomBytes(32).toString('hex');
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  private async updateKeyUsage(keyId: string): Promise<void> {
    try {
      await this.db.execute(
        `UPDATE api_keys SET 
          last_used_at = ?, 
          usage_count = usage_count + 1,
          updated_at = ?
        WHERE id = ?`,
        [new Date().toISOString(), new Date().toISOString(), keyId]
      );
    } catch (error) {
      // Log error but don't throw - usage tracking shouldn't break the request
      logger.error('Failed to update API key usage', { error, keyId });
    }
  }

  private deserializeApiKey(row: unknown): ApiKey {
    return {
      id: row.id,
      keyHash: row.key_hash,
      name: row.name,
      description: row.description,
      permissions: JSON.parse(row.permissions || '[]'),
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : undefined,
      isActive: Boolean(row.is_active),
      rotationHistory: JSON.parse(row.rotation_history || '[]'),
      usageCount: row.usage_count || 0,
      rateLimitRpm: row.rate_limit_rpm,
    };
  }

  private async ensureApiKeyTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        key_hash TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        permissions TEXT NOT NULL,
        user_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT,
        last_used_at TEXT,
        revoked_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        rotation_history TEXT NOT NULL DEFAULT '[]',
        usage_count INTEGER NOT NULL DEFAULT 0,
        rate_limit_rpm INTEGER
      )
    `);

    // Create indexes for performance
    await this.db.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`
    );
    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active)`);
    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at)`
    );
    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`);
  }
}

// Start cleanup interval for expired keys
let cleanupInterval: NodeJS.Timeout | null = null;

export function startApiKeyCleanup(intervalMs = 3600000): void {
  // 1 hour default
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  cleanupInterval = setInterval(async () => {
    try {
      // This would need a database connection - in practice, you'd inject this
      logger.info('API key cleanup scheduled - implement with service instance');
    } catch (error) {
      logger.error('API key cleanup failed', { error });
    }
  }, intervalMs);

  logger.info('Started API key cleanup interval', { intervalMs });
}

export function stopApiKeyCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Stopped API key cleanup interval');
  }
}
