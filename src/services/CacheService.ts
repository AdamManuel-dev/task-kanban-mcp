/**
 * @fileoverview Generic caching service for performance optimization
 * @lastmodified 2025-07-28T15:45:00Z
 *
 * Features: In-memory cache, TTL support, cache eviction, statistics, LRU eviction
 * Main APIs: get(), set(), delete(), clear(), getStats(), configureTTL()
 * Constraints: Memory-based, single-instance scope, configurable size limits
 * Patterns: Generic types, TTL expiration, LRU eviction, statistics tracking
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl?: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheOptions {
  maxSize?: number;
  defaultTTL?: number; // milliseconds
  enableStats?: boolean;
  evictionPolicy?: 'lru' | 'fifo' | 'ttl';
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  memoryUsage: number;
  oldestEntry?: number;
  newestEntry?: number;
}

export class CacheService<K = string, V = unknown> extends EventEmitter {
  private readonly cache = new Map<K, CacheEntry<V>>();

  private readonly options: Required<CacheOptions>;

  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(options: CacheOptions = {}) {
    super();
    this.options = {
      maxSize: options.maxSize ?? 1000,
      defaultTTL: options.defaultTTL ?? 300000, // 5 minutes
      enableStats: options.enableStats ?? true,
      evictionPolicy: options.evictionPolicy ?? 'lru',
    };

    logger.info('CacheService initialized', {
      maxSize: this.options.maxSize,
      defaultTTL: this.options.defaultTTL,
      evictionPolicy: this.options.evictionPolicy,
    });

    // Start cleanup interval for expired entries
    setInterval(() => this.cleanupExpired(), 60000); // Cleanup every minute
  }

  /**
   * Get value from cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      if (this.options.enableStats) {
        this.stats.misses++;
      }
      this.emit('miss', key);
      return undefined;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      if (this.options.enableStats) {
        this.stats.misses++;
        this.stats.evictions++;
      }
      this.emit('expired', key, entry.value);
      return undefined;
    }

    // Update access information
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    if (this.options.enableStats) {
      this.stats.hits++;
    }

    this.emit('hit', key, entry.value);
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: K, value: V, ttl?: number): void {
    const now = Date.now();
    const finalTTL = ttl ?? this.options.defaultTTL;

    // Check if we need to evict entries
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this.evict();
    }

    const entry: CacheEntry<V> = {
      value,
      timestamp: now,
      ttl: finalTTL > 0 ? finalTTL : undefined,
      accessCount: 0,
      lastAccessed: now,
    };

    this.cache.set(key, entry);
    this.emit('set', key, value);

    logger.debug('Cache entry set', {
      key: String(key),
      ttl: finalTTL,
      cacheSize: this.cache.size,
    });
  }

  /**
   * Check if key exists in cache (without accessing)
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      if (this.options.enableStats) {
        this.stats.evictions++;
      }
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(key: K): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.emit('delete', key);
      logger.debug('Cache entry deleted', { key: String(key) });
    }
    return existed;
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    const { size } = this.cache;
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
    this.emit('clear', size);
    logger.info('Cache cleared', { entriesRemoved: size });
  }

  /**
   * Get or set pattern - compute value if not in cache
   */
  async getOrSet<T extends V>(key: K, factory: () => Promise<T> | T, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached as T;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Get multiple values from cache
   */
  getMany(keys: K[]): Map<K, V> {
    const results = new Map<K, V>();

    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        results.set(key, value);
      }
    }

    return results;
  }

  /**
   * Set multiple values in cache
   */
  setMany(entries: Map<K, V> | Array<[K, V]>, ttl?: number): void {
    const entryArray = entries instanceof Map ? Array.from(entries) : entries;

    for (const [key, value] of entryArray) {
      this.set(key, value, ttl);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const timestamps = entries.map(e => e.timestamp);

    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? this.stats.hits / (this.stats.hits + this.stats.misses)
          : 0,
      memoryUsage: this.estimateMemoryUsage(),
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : undefined,
    };
  }

  /**
   * Get all keys in cache
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values in cache
   */
  values(): V[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  /**
   * Get all entries as array
   */
  entries(): Array<[K, V]> {
    return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<V>): boolean {
    if (!entry.ttl) {
      return false;
    }
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Evict entries based on policy
   */
  private evict(): void {
    if (this.cache.size === 0) {
      return;
    }

    let keyToEvict: K | undefined;

    switch (this.options.evictionPolicy) {
      case 'lru':
        keyToEvict = this.findLRUKey();
        break;
      case 'fifo':
        keyToEvict = this.findFIFOKey();
        break;
      case 'ttl':
        keyToEvict = this.findTTLKey();
        break;
      default:
        break;
    }

    if (keyToEvict !== undefined) {
      const entry = this.cache.get(keyToEvict);
      this.cache.delete(keyToEvict);
      this.stats.evictions++;
      this.emit('evict', keyToEvict, entry?.value);

      logger.debug('Cache entry evicted', {
        key: String(keyToEvict),
        policy: this.options.evictionPolicy,
        cacheSize: this.cache.size,
      });
    }
  }

  /**
   * Find least recently used key
   */
  private findLRUKey(): K | undefined {
    let oldestKey: K | undefined;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Find first in, first out key
   */
  private findFIFOKey(): K | undefined {
    let oldestKey: K | undefined;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Find key with shortest TTL
   */
  private findTTLKey(): K | undefined {
    let shortestTTLKey: K | undefined;
    let shortestTTL = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.ttl && entry.ttl < shortestTTL) {
        shortestTTL = entry.ttl;
        shortestTTLKey = key;
      }
    }

    return shortestTTLKey ?? this.findLRUKey();
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const keysToDelete: K[] = [];

    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.emit('expired', key);
    }

    if (keysToDelete.length > 0) {
      logger.debug('Expired cache entries cleaned up', {
        count: keysToDelete.length,
        remaining: this.cache.size,
      });
    }
  }

  /**
   * Estimate memory usage (rough calculation)
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;

    for (const [key, entry] of this.cache) {
      // Rough estimation
      totalSize += this.estimateObjectSize(key);
      totalSize += this.estimateObjectSize(entry.value);
      totalSize += 64; // Overhead for entry metadata
    }

    return totalSize;
  }

  /**
   * Estimate object size in bytes (rough calculation)
   */
  private estimateObjectSize(obj: unknown): number {
    if (obj === null || obj === undefined) {
      return 8;
    }

    switch (typeof obj) {
      case 'boolean':
        return 4;
      case 'number':
        return 8;
      case 'string':
        return obj.length * 2; // Assuming UTF-16
      case 'object':
        if (Array.isArray(obj)) {
          return obj.reduce((size, item) => size + this.estimateObjectSize(item), 24); // eslint-disable-line @typescript-eslint/no-unsafe-argument
        }
        const objRecord = obj as Record<string, unknown>;
        return Object.keys(objRecord).reduce(
          (size, key) =>
            size + this.estimateObjectSize(key) + this.estimateObjectSize(objRecord[key]),
          24
        );
      default:
        return 32; // Default for functions, symbols, etc.
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 };
    this.emit('statsReset');
    logger.debug('Cache statistics reset');
  }

  /**
   * Update cache configuration
   */
  updateConfig(options: Partial<CacheOptions>): void {
    Object.assign(this.options, options);
    this.emit('configUpdated', options);
    logger.info('Cache configuration updated', options);
  }
}

// Export default cache instances for common use cases
export const defaultCache = new CacheService<string, unknown>({
  maxSize: 1000,
  defaultTTL: 300000, // 5 minutes
  enableStats: true,
  evictionPolicy: 'lru',
});

export const taskCache = new CacheService<string, unknown>({
  maxSize: 500,
  defaultTTL: 60000, // 1 minute
  enableStats: true,
  evictionPolicy: 'lru',
});

export const boardCache = new CacheService<string, unknown>({
  maxSize: 100,
  defaultTTL: 120000, // 2 minutes
  enableStats: true,
  evictionPolicy: 'lru',
});
