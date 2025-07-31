/**
 * @fileoverview Request deduplication system for batching optimization
 * @lastmodified 2025-07-28T08:50:00Z
 *
 * Features: Request deduplication, response sharing, cache management
 * Main APIs: RequestDeduplicator, DeduplicationCache, RequestKey
 * Constraints: Requires careful cache eviction, memory management
 * Patterns: Flyweight pattern for shared responses, LRU cache for efficiency
 */

import { performance } from 'perf_hooks';
import { logger } from './logger';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface DeduplicationKey {
  method: string;
  url: string;
  contentHash: string;
  headers: string;
}

export interface PendingRequest {
  id: string;
  timestamp: number;
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  clientId?: string;
}

export interface DeduplicationStats {
  totalRequests: number;
  duplicatesDetected: number;
  cacheHits: number;
  cacheMisses: number;
  averageWaitTime: number;
  memoryUsage: number;
}

export interface DeduplicationConfig {
  maxCacheSize: number;
  maxPendingTime: number; // milliseconds
  enableContentHashing: boolean;
  ignoreHeaders: string[];
  enableMemoryMonitoring: boolean;
}

// ============================================================================
// REQUEST KEY GENERATOR
// ============================================================================

export class RequestKeyGenerator {
  private readonly config: DeduplicationConfig;

  constructor(config: DeduplicationConfig) {
    this.config = config;
  }

  /**
   * Generate a deduplication key for a request
   */
  generateKey(
    method: string,
    url: string,
    headers: Record<string, string> = {},
    body?: unknown
  ): string {
    const deduplicationKey: DeduplicationKey = {
      method: method.toUpperCase(),
      url: this.normalizeUrl(url),
      contentHash: this.config.enableContentHashing ? this.hashContent(body) : '',
      headers: this.hashHeaders(headers),
    };

    return this.serializeKey(deduplicationKey);
  }

  /**
   * Normalize URL for consistent comparison
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url, 'http://localhost');

      // Sort query parameters for consistent ordering
      const searchParams = new URLSearchParams(parsed.search);
      const sortedParams = new URLSearchParams();

      Array.from(searchParams.keys())
        .sort()
        .forEach(key => {
          sortedParams.append(key, searchParams.get(key) ?? '');
        });

      parsed.search = sortedParams.toString();
      return parsed.pathname + (parsed.search ? `?${parsed.search}` : '');
    } catch {
      // Fallback for relative URLs
      return url;
    }
  }

  /**
   * Hash request content for deduplication
   */
  private hashContent(content: unknown): string {
    if (!content) return '';

    try {
      const contentString = typeof content === 'string' ? content : JSON.stringify(content);

      return this.simpleHash(contentString);
    } catch {
      return '';
    }
  }

  /**
   * Hash relevant headers for deduplication
   */
  private hashHeaders(headers: Record<string, string>): string {
    const relevantHeaders: Record<string, string> = {};

    Object.entries(headers).forEach(([key, value]) => {
      const lowercaseKey = key.toLowerCase();

      // Skip headers that shouldn't affect deduplication
      if (!this.config.ignoreHeaders.includes(lowercaseKey)) {
        relevantHeaders[lowercaseKey] = value;
      }
    });

    // Sort headers for consistent ordering
    const sortedHeaders = Object.keys(relevantHeaders)
      .sort()
      .map(key => `${key}:${relevantHeaders[key]}`)
      .join('|');

    return this.simpleHash(sortedHeaders);
  }

  /**
   * Simple hash function for string content
   */
  private simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash &= hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(16);
  }

  /**
   * Serialize deduplication key to string
   */
  private serializeKey(key: DeduplicationKey): string {
    return `${key.method}:${key.url}:${key.contentHash}:${key.headers}`;
  }

  /**
   * Check if request method is deduplicatable
   */
  isDeduplicatable(method: string): boolean {
    const deduplicatableMethods = ['GET', 'HEAD', 'OPTIONS'];
    return deduplicatableMethods.includes(method.toUpperCase());
  }
}

// ============================================================================
// DEDUPLICATION CACHE
// ============================================================================

export class DeduplicationCache {
  private readonly cache = new Map<
    string,
    {
      response: unknown;
      timestamp: number;
      accessCount: number;
      lastAccess: number;
    }
  >();

  private readonly pendingRequests = new Map<string, PendingRequest[]>();

  private readonly config: DeduplicationConfig;

  private stats: DeduplicationStats;

  constructor(config: DeduplicationConfig) {
    this.config = config;
    this.stats = {
      totalRequests: 0,
      duplicatesDetected: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageWaitTime: 0,
      memoryUsage: 0,
    };

    // Start periodic cleanup if memory monitoring is enabled
    if (config.enableMemoryMonitoring) {
      this.startMemoryMonitoring();
    }
  }

  /**
   * Check if response is cached
   */
  hasResponse(key: string): boolean {
    const cached = this.cache.get(key);
    if (cached) {
      cached.accessCount++;
      cached.lastAccess = Date.now();
      this.stats.cacheHits++;
      return true;
    }

    this.stats.cacheMisses++;
    return false;
  }

  /**
   * Get cached response
   */
  getResponse(key: string): unknown {
    const cached = this.cache.get(key);
    return cached ? cached.response : null;
  }

  /**
   * Cache a response
   */
  setResponse(key: string, response: unknown): void {
    // Evict old entries if cache is full
    if (this.cache.size >= this.config.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccess: Date.now(),
    });

    // Notify any pending requests for this key
    this.notifyPendingRequests(key, response);
  }

  /**
   * Add a pending request
   */
  addPendingRequest(key: string, request: PendingRequest): void {
    if (!this.pendingRequests.has(key)) {
      this.pendingRequests.set(key, []);
    }

    this.pendingRequests.get(key)!.push(request);
    this.stats.totalRequests++;

    // Set timeout for pending request
    setTimeout(() => {
      this.timeoutPendingRequest(key, request.id);
    }, this.config.maxPendingTime);
  }

  /**
   * Get pending requests for a key
   */
  getPendingRequests(key: string): PendingRequest[] {
    return this.pendingRequests.get(key) ?? [];
  }

  /**
   * Notify pending requests with response
   */
  private notifyPendingRequests(key: string, response: unknown): void {
    const pending = this.pendingRequests.get(key);
    if (!pending) return;

    const waitTime = Date.now();

    pending.forEach(request => {
      const requestWaitTime = waitTime - request.timestamp;
      this.updateAverageWaitTime(requestWaitTime);

      try {
        request.resolve(response);
      } catch (error) {
        logger.error('Error notifying pending request', {
          requestId: request.id,
          error: (error as Error).message,
        });
      }
    });

    this.pendingRequests.delete(key);
    this.stats.duplicatesDetected += pending.length - 1; // First request is not a duplicate
  }

  /**
   * Handle timeout for pending requests
   */
  private timeoutPendingRequest(key: string, requestId: string): void {
    const pending = this.pendingRequests.get(key);
    if (!pending) return;

    const requestIndex = pending.findIndex(req => req.id === requestId);
    if (requestIndex === -1) return;

    const request = pending[requestIndex];
    pending.splice(requestIndex, 1);

    if (pending.length === 0) {
      this.pendingRequests.delete(key);
    }

    // Reject the timed-out request
    request.reject(new Error('Request deduplication timeout'));
  }

  /**
   * Evict least recently used cache entry
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug('Evicted cache entry', { key: oldestKey });
    }
  }

  /**
   * Update average wait time statistic
   */
  private updateAverageWaitTime(waitTime: number): void {
    const { totalRequests } = this.stats;
    if (totalRequests === 1) {
      this.stats.averageWaitTime = waitTime;
    } else {
      this.stats.averageWaitTime =
        (this.stats.averageWaitTime * (totalRequests - 1) + waitTime) / totalRequests;
    }
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    setInterval(() => {
      this.updateMemoryUsage();
      this.cleanupExpiredEntries();
    }, 30000); // Every 30 seconds
  }

  /**
   * Update memory usage statistics
   */
  private updateMemoryUsage(): void {
    const memoryEstimate =
      this.cache.size * 1000 + // Rough estimate per cache entry
      this.pendingRequests.size * 500; // Rough estimate per pending request

    this.stats.memoryUsage = memoryEstimate;

    // Log warning if memory usage is high
    if (memoryEstimate > 10 * 1024 * 1024) {
      // 10MB
      logger.warn('High memory usage in deduplication cache', {
        memoryUsage: memoryEstimate,
        cacheSize: this.cache.size,
        pendingRequests: this.pendingRequests.size,
      });
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > maxAge) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get deduplication statistics
   */
  getStats(): DeduplicationStats {
    this.updateMemoryUsage();
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      duplicatesDetected: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageWaitTime: 0,
      memoryUsage: 0,
    };
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();

    // Reject all pending requests
    for (const [key, requests] of this.pendingRequests) {
      requests.forEach(request => {
        request.reject(new Error('Cache cleared'));
      });
    }

    this.pendingRequests.clear();
    this.resetStats();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Get pending requests count
   */
  getPendingCount(): number {
    let total = 0;
    for (const requests of this.pendingRequests.values()) {
      total += requests.length;
    }
    return total;
  }
}

// ============================================================================
// MAIN DEDUPLICATOR
// ============================================================================

export class RequestDeduplicator {
  private readonly keyGenerator: RequestKeyGenerator;

  private readonly cache: DeduplicationCache;

  constructor(config: Partial<DeduplicationConfig> = {}) {
    const fullConfig: DeduplicationConfig = {
      maxCacheSize: 1000,
      maxPendingTime: 5000, // 5 seconds
      enableContentHashing: true,
      ignoreHeaders: [
        'authorization',
        'cookie',
        'x-request-id',
        'x-correlation-id',
        'user-agent',
        'accept-encoding',
        'connection',
        'cache-control',
      ],
      enableMemoryMonitoring: true,
      ...config,
    };

    this.keyGenerator = new RequestKeyGenerator(fullConfig);
    this.cache = new DeduplicationCache(fullConfig);
  }

  /**
   * Process a request with deduplication
   */
  async processRequest(
    method: string,
    url: string,
    headers: Record<string, string> = {},
    body?: unknown,
    executor?: () => Promise<unknown>
  ): Promise<unknown> {
    // Check if this request type can be deduplicated
    if (!this.keyGenerator.isDeduplicatable(method)) {
      // Execute immediately for non-deduplicatable requests
      return executor ? executor() : null;
    }

    const key = this.keyGenerator.generateKey(method, url, headers, body);

    // Check if we have a cached response
    if (this.cache.hasResponse(key)) {
      return this.cache.getResponse(key);
    }

    // Check if there are pending requests for this key
    const pendingRequests = this.cache.getPendingRequests(key);

    if (pendingRequests.length > 0) {
      // Add to pending requests and wait for response
      return new Promise((resolve, reject) => {
        this.cache.addPendingRequest(key, {
          id: this.generateRequestId(),
          timestamp: Date.now(),
          resolve,
          reject,
        });
      });
    }

    // This is the first request for this key, execute it
    if (!executor) {
      throw new Error('No executor provided for first request');
    }

    // Add a placeholder pending request to prevent race conditions
    const placeholderPromise = new Promise((resolve, reject) => {
      this.cache.addPendingRequest(key, {
        id: this.generateRequestId(),
        timestamp: Date.now(),
        resolve,
        reject,
      });
    });

    try {
      const response = await executor();
      this.cache.setResponse(key, response);
      return response;
    } catch (error) {
      // Notify pending requests about the error
      const pending = this.cache.getPendingRequests(key);
      pending.forEach(request => {
        request.reject(error as Error);
      });

      throw error;
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `dedup_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get deduplication statistics
   */
  getStats(): DeduplicationStats {
    return this.cache.getStats();
  }

  /**
   * Clear deduplication cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache information
   */
  getCacheInfo(): {
    size: number;
    pendingCount: number;
    stats: DeduplicationStats;
  } {
    return {
      size: this.cache.getCacheSize(),
      pendingCount: this.cache.getPendingCount(),
      stats: this.cache.getStats(),
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const requestDeduplicator = new RequestDeduplicator({
  maxCacheSize: 500,
  maxPendingTime: 3000,
  enableContentHashing: true,
  enableMemoryMonitoring: true,
});

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Deduplicate a GET request
 */
export const deduplicateGet = async (
  url: string,
  headers: Record<string, string> = {},
  executor?: () => Promise<unknown>
): Promise<unknown> => requestDeduplicator.processRequest('GET', url, headers, undefined, executor);

/**
 * Get deduplication statistics
 */
export const getDeduplicationStats = (): DeduplicationStats => requestDeduplicator.getStats();

/**
 * Clear deduplication cache
 */
export const clearDeduplicationCache = (): void => {
  requestDeduplicator.clear();
};
