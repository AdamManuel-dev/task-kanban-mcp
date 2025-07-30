/**
 * @fileoverview Intelligent caching layer for expensive operations
 * @lastmodified 2025-07-28T17:30:00Z
 *
 * Features: Multi-tier caching, TTL support, cache invalidation, performance optimization
 * Main APIs: CacheManager, withCaching(), memoize(), cacheKey()
 * Constraints: Memory-aware cache limits, configurable TTL
 * Patterns: LRU cache, cache-aside pattern, intelligent invalidation
 */

import { logger } from './logger';
import { performanceMonitor } from './performance';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
  lastAccessed: number;
  size?: number; // Estimated memory size in bytes
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalKeys: number;
  totalSize: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  oldestEntry: number;
  newestEntry: number;
  averageAge: number;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  maxSize?: number; // Maximum number of entries
  maxMemory?: number; // Maximum memory usage in bytes
  defaultTtl?: number; // Default TTL in milliseconds
  enableStats?: boolean; // Enable statistics collection
  gcInterval?: number; // Garbage collection interval in milliseconds
}

/**
 * API Client interface for cache warming
 */
interface ApiClient {
  getBoards?: () => Promise<unknown>;
  getCurrentUser?: () => Promise<unknown>;
  [key: string]: unknown;
}

/**
 * Intelligent cache manager with LRU eviction and TTL support
 */
export class CacheManager<T = unknown> {
  private readonly cache = new Map<string, CacheEntry<T>>();

  private readonly maxSize: number;

  private readonly maxMemory: number;

  private readonly defaultTtl: number;

  private readonly enableStats: boolean;

  private readonly gcTimer?: NodeJS.Timeout;

  // Statistics
  private totalHits = 0;

  private totalMisses = 0;

  private currentMemoryUsage = 0;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.maxMemory = options.maxMemory ?? 50 * 1024 * 1024; // 50MB default
    this.defaultTtl = options.defaultTtl ?? 5 * 60 * 1000; // 5 minutes default
    this.enableStats = options.enableStats ?? true;

    // Start garbage collection
    const gcInterval = options.gcInterval ?? 60 * 1000; // 1 minute
    this.gcTimer = setInterval(() => this.garbageCollect(), gcInterval);
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.totalMisses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.delete(key);
      this.totalMisses++;
      return undefined;
    }

    // Update access statistics
    entry.hits++;
    entry.lastAccessed = Date.now();
    this.totalHits++;

    // Move to end for LRU (re-insert)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const entryTtl = ttl ?? this.defaultTtl;
    const estimatedSize = this.estimateSize(value);

    // Check if we need to evict entries
    this.evictIfNecessary(estimatedSize);

    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      ttl: entryTtl,
      hits: 0,
      lastAccessed: now,
      size: estimatedSize,
    };

    // Remove old entry if exists
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      this.currentMemoryUsage -= oldEntry.size ?? 0;
    }

    this.cache.set(key, entry);
    this.currentMemoryUsage += estimatedSize;

    if (this.enableStats) {
      logger.debug('Cache entry added', {
        key,
        size: estimatedSize,
        ttl: entryTtl,
        totalEntries: this.cache.size,
        memoryUsage: `${(this.currentMemoryUsage / 1024 / 1024).toFixed(2)}MB`,
      });
    }
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentMemoryUsage -= entry.size ?? 0;
    }
    return this.cache.delete(key);
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.currentMemoryUsage = 0;
    this.totalHits = 0;
    this.totalMisses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const now = Date.now();

    const totalRequests = this.totalHits + this.totalMisses;
    const hitRate = totalRequests > 0 ? this.totalHits / totalRequests : 0;

    const ages = entries.map(entry => now - entry.timestamp);
    const averageAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

    return {
      totalKeys: this.cache.size,
      totalSize: this.currentMemoryUsage,
      hitRate,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      oldestEntry: ages.length > 0 ? Math.max(...ages) : 0,
      newestEntry: ages.length > 0 ? Math.min(...ages) : 0,
      averageAge,
    };
  }

  /**
   * Get or set with factory function
   */
  async getOrSet<U extends T>(
    key: string,
    factory: () => Promise<U> | U,
    ttl?: number
  ): Promise<U> {
    const cached = this.get(key) as U;
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value as T, ttl);
    return value;
  }

  /**
   * Invalidate entries matching pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let invalidated = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (pattern.test(key)) {
        this.delete(key);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      logger.debug('Cache entries invalidated', {
        pattern: pattern.toString(),
        count: invalidated,
      });
    }

    return invalidated;
  }

  /**
   * Estimate memory size of value
   */
  private estimateSize(value: T): number {
    try {
      if (typeof value === 'string') {
        return value.length * 2; // UTF-16 encoding
      }
      if (typeof value === 'number') {
        return 8; // 64-bit number
      }
      if (typeof value === 'boolean') {
        return 4;
      }
      if (value === null || value === undefined) {
        return 4;
      }

      // Rough estimate for objects
      const jsonString = JSON.stringify(value);
      return jsonString.length * 2;
    } catch {
      return 1024; // Default estimate
    }
  }

  /**
   * Evict entries if necessary
   */
  private evictIfNecessary(newEntrySize: number): void {
    // Check size limit
    while (this.cache.size >= this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }

    // Check memory limit
    while (this.currentMemoryUsage + newEntrySize > this.maxMemory && this.cache.size > 0) {
      this.evictLRU();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    // Map maintains insertion order, first entry is least recently used
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.delete(firstKey);
    }
  }

  /**
   * Garbage collect expired entries
   */
  private garbageCollect(): void {
    const now = Date.now();
    let collected = 0;

    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now - entry.timestamp > entry.ttl) {
        this.delete(key);
        collected++;
      }
    }

    if (collected > 0) {
      logger.debug('Cache garbage collection', {
        collected,
        remaining: this.cache.size,
        memoryUsage: `${(this.currentMemoryUsage / 1024 / 1024).toFixed(2)}MB`,
      });
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
    }
    this.clear();
  }
}

/**
 * Global cache instances
 */
export const apiCache = new CacheManager({
  maxSize: 500,
  maxMemory: 10 * 1024 * 1024, // 10MB
  defaultTtl: 2 * 60 * 1000, // 2 minutes
});

export const queryCache = new CacheManager({
  maxSize: 200,
  maxMemory: 20 * 1024 * 1024, // 20MB
  defaultTtl: 5 * 60 * 1000, // 5 minutes
});

export const configCache = new CacheManager({
  maxSize: 100,
  maxMemory: 1 * 1024 * 1024, // 1MB
  defaultTtl: 30 * 60 * 1000, // 30 minutes
});

/**
 * Generate cache key from components
 */
export function cacheKey(
  ...components: Array<string | number | boolean | undefined | null | unknown>
): string {
  return components
    .filter(c => c !== null && c !== undefined)
    .map(c => String(c))
    .join(':');
}

/**
 * Memoization decorator with caching
 */
export function memoize<Args extends unknown[], Return>(
  fn: (...args: Args) => Return | Promise<Return>,
  options?: {
    cache?: CacheManager<Return>;
    keyFn?: (...args: Args) => string;
    ttl?: number;
  }
): (...args: Args) => Promise<Return> {
  const cache = options?.cache ?? new CacheManager<Return>();
  const keyFn = options?.keyFn ?? ((...args) => JSON.stringify(args));
  const ttl = options?.ttl;

  return async (...args: Args): Promise<Return> => {
    const key = keyFn(...args);

    return cache.getOrSet(key, async () => fn(...args), ttl);
  };
}

/**
 * Higher-order function for caching expensive operations
 */
export function withCaching<Args extends unknown[], Return>(
  operationName: string,
  operation: (...args: Args) => Promise<Return>,
  options?: {
    cache?: CacheManager<Return>;
    keyFn?: (...args: Args) => string;
    ttl?: number;
    invalidatePattern?: RegExp;
  }
): (...args: Args) => Promise<Return> {
  const cache = options?.cache ?? queryCache;
  const keyFn = options?.keyFn ?? ((...args) => cacheKey(operationName, ...args));

  return async (...args: Args): Promise<Return> => {
    const key = keyFn(...args);

    // Try cache first
    const cached = cache.get(key);
    if (cached !== undefined && cached !== null) {
      performanceMonitor.record({
        operationName: `${operationName} (cached)`,
        duration: 0.1, // Minimal cache access time
        timestamp: new Date(),
        metadata: { cacheHit: true, key },
      });
      return cached as Return;
    }

    // Execute operation and cache result
    const startTime = Date.now();
    try {
      const result = await operation(...args);
      const duration = Date.now() - startTime;

      cache.set(key, result, options?.ttl);

      performanceMonitor.record({
        operationName: `${operationName} (computed)`,
        duration,
        timestamp: new Date(),
        metadata: { cacheHit: false, key, cached: true },
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      performanceMonitor.record({
        operationName: `${operationName} (error)`,
        duration,
        timestamp: new Date(),
        metadata: {
          cacheHit: false,
          key,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  };
}

/**
 * Cache invalidation helpers
 */
export const cacheInvalidation = {
  /**
   * Invalidate all user-related cache entries
   */
  invalidateUser(userId: string): void {
    const pattern = new RegExp(`user:${userId}:`);
    apiCache.invalidatePattern(pattern);
    queryCache.invalidatePattern(pattern);
  },

  /**
   * Invalidate all board-related cache entries
   */
  invalidateBoard(boardId: string): void {
    const pattern = new RegExp(`board:${boardId}:`);
    apiCache.invalidatePattern(pattern);
    queryCache.invalidatePattern(pattern);
  },

  /**
   * Invalidate all task-related cache entries
   */
  invalidateTask(taskId: string): void {
    const pattern = new RegExp(`task:${taskId}:`);
    apiCache.invalidatePattern(pattern);
    queryCache.invalidatePattern(pattern);
  },

  /**
   * Invalidate all cache entries
   */
  invalidateAll(): void {
    apiCache.clear();
    queryCache.clear();
    configCache.clear();
    logger.info('All cache entries invalidated');
  },
};

/**
 * Cache warming utilities
 */
export const cacheWarming = {
  /**
   * Pre-populate cache with commonly accessed data
   */
  async warmCommonQueries(apiClient: ApiClient): Promise<void> {
    logger.info('Starting cache warming...');

    try {
      // Warm up board list
      if (apiClient.getBoards) {
        await withCaching('warm:boards', () => apiClient.getBoards())();
      }

      // Warm up user profile if available
      if (apiClient.getCurrentUser) {
        await withCaching('warm:user', () => apiClient.getCurrentUser())();
      }

      logger.info('Cache warming completed');
    } catch (error) {
      logger.warn('Cache warming failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};
