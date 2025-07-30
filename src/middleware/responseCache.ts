/**
 * @fileoverview Response caching middleware for API optimization
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: In-memory LRU cache, ETags, cache headers, conditional requests
 * Main APIs: cache(), invalidateCache(), getCacheStats()
 * Constraints: Memory-based, configurable TTL, respects Cache-Control headers
 * Patterns: Middleware pattern, LRU eviction, ETag-based validation
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

interface CacheEntry {
  data: unknown;
  etag: string;
  timestamp: number;
  ttl: number;
  headers: Record<string, string>;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum cache entries
  keyGenerator?: (req: Request) => string;
  shouldCache?: (req: Request, res: Response) => boolean;
  varyHeaders?: string[]; // Headers to include in cache key
}

class ResponseCache {
  private readonly cache = new Map<string, CacheEntry>();

  private readonly accessOrder = new Map<string, number>();

  private accessCounter = 0;

  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  public generateKey(req: Request, varyHeaders: string[] = []): string {
    const baseKey = `${req.method}:${req.originalUrl}`;

    if (varyHeaders.length === 0) {
      return baseKey;
    }

    const varyParts = varyHeaders
      .map(header => `${header}:${req.headers[header.toLowerCase()] ?? ''}`)
      .join('|');

    return `${baseKey}|${varyParts}`;
  }

  public generateETag(data: unknown): string {
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('md5').update(content).digest('hex');
  }

  private evictLRU(): void {
    if (this.cache.size < this.maxSize) return;

    // Find least recently used entry
    let lruKey = '';
    let minAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder) {
      if (accessTime < minAccess) {
        minAccess = accessTime;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
      logger.debug(`Evicted cache entry: ${lruKey}`);
    }
  }

  private updateAccess(key: string): void {
    this.accessOrder.set(key, ++this.accessCounter);
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      logger.debug(`Cache entry expired: ${key}`);
      return null;
    }

    this.updateAccess(key);
    return entry;
  }

  set(key: string, data: unknown, ttl: number, headers: Record<string, string> = {}): void {
    this.evictLRU();

    const etag = this.generateETag(data);
    const entry: CacheEntry = {
      data,
      etag,
      timestamp: Date.now(),
      ttl,
      headers,
    };

    this.cache.set(key, entry);
    this.updateAccess(key);

    logger.debug(`Cached response: ${key} (TTL: ${ttl}ms)`);
  }

  invalidate(pattern: string | RegExp): number {
    let count = 0;

    for (const key of this.cache.keys()) {
      const shouldInvalidate =
        typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key);

      if (shouldInvalidate) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        count++;
      }
    }

    logger.info(`Invalidated ${count} cache entries matching pattern: ${pattern}`);
    return count;
  }

  clear(): void {
    const { size } = this.cache;
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
    logger.info(`Cleared cache (${size} entries)`);
  }

  getStats() {
    const now = Date.now();
    let expired = 0;

    for (const entry of this.cache.values()) {
      if (now - entry.timestamp > entry.ttl) {
        expired++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expired,
      hitRate: this.accessCounter > 0 ? this.cache.size / this.accessCounter : 0,
    };
  }
}

// Global cache instance
const globalCache = new ResponseCache(1000);

/**
 * Response caching middleware
 */
export function cache(
  options: CacheOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const {
    ttl = 300000, // 5 minutes default
    maxSize = 1000,
    keyGenerator,
    shouldCache = (req: Request, res: Response) => {
      // Only cache GET requests by default
      if (req.method !== 'GET') return false;

      // Don't cache if response has errors
      if (res.statusCode >= 400) return false;

      // Don't cache if Cache-Control says no-cache
      const cacheControl = res.get('Cache-Control');
      if (cacheControl && cacheControl.includes('no-cache')) return false;

      return true;
    },
    varyHeaders = [],
  } = options;

  // Create cache instance for this middleware
  const cacheInstance = new ResponseCache(maxSize);

  return (req: Request, res: Response, next: NextFunction) => {
    const cacheKey = keyGenerator ? keyGenerator(req) : cacheInstance.generateKey(req, varyHeaders);

    // Check if request includes If-None-Match header
    const clientETag = req.headers['if-none-match'];

    // Try to get cached response
    const cached = cacheInstance.get(cacheKey);

    if (cached) {
      // Check ETag for conditional requests
      if (clientETag && clientETag === cached.etag) {
        res.status(304).end();
        return;
      }

      // Set cache headers
      res.set('ETag', cached.etag);
      res.set(
        'Cache-Control',
        `max-age=${Math.floor((cached.ttl - (Date.now() - cached.timestamp)) / 1000)}`
      );
      res.set('X-Cache', 'HIT');

      // Set any custom headers from cache
      Object.entries(cached.headers).forEach(([key, value]) => {
        res.set(key, value);
      });

      res.json(cached.data);
      return;
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = function (data: unknown) {
      if (shouldCache(req, res)) {
        const customHeaders: Record<string, string> = {};

        // Capture custom headers to cache
        varyHeaders.forEach(header => {
          const value = res.get(header);
          if (value) customHeaders[header] = value;
        });

        cacheInstance.set(cacheKey, data, ttl, customHeaders);

        // Set cache headers
        const etag = cacheInstance.generateETag(data);
        res.set('ETag', etag);
        res.set('Cache-Control', `max-age=${Math.floor(ttl / 1000)}`);
        res.set('X-Cache', 'MISS');
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Cache invalidation middleware for write operations
 */
export function invalidateCache(
  patterns: Array<string | RegExp> = []
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (data: unknown) {
      // Only invalidate on successful write operations
      if (res.statusCode < 400 && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        patterns.forEach(pattern => {
          globalCache.invalidate(pattern);
        });

        // Invalidate related cache entries based on route
        if (req.baseUrl) {
          globalCache.invalidate(req.baseUrl);
        }
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Cache statistics endpoint middleware
 */
export function cacheStats(): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => {
    const stats = globalCache.getStats();
    res.json({
      cache: stats,
      timestamp: new Date().toISOString(),
    });
  };
}

/**
 * Cache management utilities
 */
export const cacheManager = {
  invalidate: (pattern: string | RegExp) => globalCache.invalidate(pattern),
  clear: () => globalCache.clear(),
  getStats: () => globalCache.getStats(),
};

export default cache;
