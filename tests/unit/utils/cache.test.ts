/**
 * @fileoverview Tests for caching layer implementation
 * @lastmodified 2025-07-28T17:45:00Z
 *
 * Features: Comprehensive testing of cache manager with TTL, LRU, memory management
 * Main APIs: Tests for CacheManager, withCaching(), cache invalidation
 * Constraints: Memory limits, TTL behavior, performance validation
 * Patterns: Unit testing, async operations, memory management testing
 */

import {
  CacheManager,
  cacheKey,
  withCaching,
  memoize,
  apiCache,
  queryCache,
  cacheInvalidation,
  cacheWarming,
  type CacheStats,
  type CacheOptions,
} from '../../../src/utils/cache';

// Mock performance monitor
jest.mock('../../../src/utils/performance', () => ({
  performanceMonitor: {
    record: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CacheManager', () => {
  let cache: CacheManager<string>;

  beforeEach(() => {
    cache = new CacheManager({
      maxSize: 5,
      maxMemory: 1024, // 1KB for testing
      defaultTtl: 1000, // 1 second
      enableStats: true,
      gcInterval: 100, // 100ms for testing
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('Basic Cache Operations', () => {
    test('should set and get values', () => {
      cache.set('key1', 'value1');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.has('key1')).toBe(true);
    });

    test('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
      expect(cache.has('nonexistent')).toBe(false);
    });

    test('should delete entries', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      const deleted = cache.delete('key1');
      expect(deleted).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.get('key1')).toBeUndefined();
    });

    test('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });

    test('should handle null and undefined values', () => {
      const nullCache = new CacheManager<any>();

      nullCache.set('null', null);
      nullCache.set('undefined', undefined);

      expect(nullCache.get('null')).toBeNull();
      expect(nullCache.get('undefined')).toBeUndefined();
      expect(nullCache.has('null')).toBe(true);
      expect(nullCache.has('undefined')).toBe(true);

      nullCache.destroy();
    });
  });

  describe('TTL (Time To Live)', () => {
    test('should expire entries after TTL', async () => {
      cache.set('key1', 'value1', 50); // 50ms TTL

      expect(cache.get('key1')).toBe('value1');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 60));

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.has('key1')).toBe(false);
    });

    test('should use default TTL when not specified', async () => {
      const shortTtlCache = new CacheManager({
        defaultTtl: 50, // 50ms
      });

      shortTtlCache.set('key1', 'value1');
      expect(shortTtlCache.get('key1')).toBe('value1');

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(shortTtlCache.get('key1')).toBeUndefined();

      shortTtlCache.destroy();
    });

    test('should handle custom TTL per entry', async () => {
      cache.set('short', 'value1', 30); // 30ms
      cache.set('long', 'value2', 100); // 100ms

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('value2');

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(cache.get('long')).toBeUndefined();
    });
  });

  describe('LRU (Least Recently Used) Eviction', () => {
    test('should evict oldest entries when size limit exceeded', () => {
      // Fill cache to max size (5)
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');

      // Add one more to trigger eviction
      cache.set('key6', 'value6');

      // key1 should be evicted (oldest)
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key6')).toBe('value6');
    });

    test('should update LRU order on access', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');

      // Access key1 to make it most recently used
      cache.get('key1');

      // Add new entry to trigger eviction
      cache.set('key6', 'value6');

      // key2 should be evicted (now oldest), key1 should remain
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key6')).toBe('value6');
    });
  });

  describe('Memory Management', () => {
    test('should estimate memory usage', () => {
      const memCache = new CacheManager<any>({
        maxMemory: 100, // 100 bytes
      });

      memCache.set('small', 'x'); // Small string
      memCache.set('large', 'x'.repeat(50)); // Larger string

      const stats = memCache.getStats();
      expect(stats.totalSize).toBeGreaterThan(0);

      memCache.destroy();
    });

    test('should evict entries when memory limit exceeded', () => {
      const memCache = new CacheManager<string>({
        maxMemory: 50, // Very small memory limit
        maxSize: 100, // High size limit to test memory eviction
      });

      memCache.set('key1', 'small');
      memCache.set('key2', 'x'.repeat(30)); // Large entry

      // key1 might be evicted due to memory pressure
      const stats = memCache.getStats();
      expect(stats.totalSize).toBeLessThanOrEqual(50);

      memCache.destroy();
    });
  });

  describe('Statistics', () => {
    test('should track cache statistics', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('nonexistent'); // miss

      const stats = cache.getStats();

      expect(stats.totalKeys).toBe(1);
      expect(stats.totalHits).toBe(2);
      expect(stats.totalMisses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.67, 1); // 2/3
    });

    test('should calculate correct hit rate', () => {
      // No requests yet
      let stats = cache.getStats();
      expect(stats.hitRate).toBe(0);

      cache.set('key1', 'value1');

      // All hits
      cache.get('key1');
      cache.get('key1');
      stats = cache.getStats();
      expect(stats.hitRate).toBe(1);

      // Mix of hits and misses
      cache.get('nonexistent');
      stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(0.67, 1); // 2/3
    });
  });

  describe('getOrSet Operations', () => {
    test('should return cached value if exists', async () => {
      cache.set('key1', 'cached');

      const factory = jest.fn().mockResolvedValue('new');
      const result = await cache.getOrSet('key1', factory);

      expect(result).toBe('cached');
      expect(factory).not.toHaveBeenCalled();
    });

    test('should call factory and cache result if not exists', async () => {
      const factory = jest.fn().mockResolvedValue('new');
      const result = await cache.getOrSet('key1', factory);

      expect(result).toBe('new');
      expect(factory).toHaveBeenCalledTimes(1);
      expect(cache.get('key1')).toBe('new');
    });

    test('should handle factory errors', async () => {
      const error = new Error('Factory failed');
      const factory = jest.fn().mockRejectedValue(error);

      await expect(cache.getOrSet('key1', factory)).rejects.toThrow('Factory failed');
      expect(cache.get('key1')).toBeUndefined();
    });

    test('should handle synchronous factory', async () => {
      const factory = jest.fn().mockReturnValue('sync');
      const result = await cache.getOrSet('key1', factory);

      expect(result).toBe('sync');
      expect(cache.get('key1')).toBe('sync');
    });
  });

  describe('Pattern-based Invalidation', () => {
    test('should invalidate entries matching pattern', () => {
      cache.set('user:123:profile', 'profile1');
      cache.set('user:123:settings', 'settings1');
      cache.set('user:456:profile', 'profile2');
      cache.set('other:data', 'other');

      const invalidated = cache.invalidatePattern(/^user:123:/);

      expect(invalidated).toBe(2);
      expect(cache.get('user:123:profile')).toBeUndefined();
      expect(cache.get('user:123:settings')).toBeUndefined();
      expect(cache.get('user:456:profile')).toBe('profile2');
      expect(cache.get('other:data')).toBe('other');
    });

    test('should return 0 when no patterns match', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const invalidated = cache.invalidatePattern(/^nomatch:/);

      expect(invalidated).toBe(0);
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('Garbage Collection', () => {
    test('should automatically collect expired entries', async () => {
      const gcCache = new CacheManager({
        gcInterval: 50, // 50ms GC interval
        defaultTtl: 30, // 30ms TTL
      });

      gcCache.set('key1', 'value1');
      gcCache.set('key2', 'value2');

      // Wait for expiration and GC
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = gcCache.getStats();
      expect(stats.totalKeys).toBe(0);

      gcCache.destroy();
    });
  });
});

describe('Cache Utility Functions', () => {
  describe('cacheKey()', () => {
    test('should generate keys from components', () => {
      expect(cacheKey('user', 123, 'profile')).toBe('user:123:profile');
      expect(cacheKey('task', 'abc', 'status')).toBe('task:abc:status');
    });

    test('should filter out null and undefined', () => {
      expect(cacheKey('user', null, 123, undefined, 'profile')).toBe('user:123:profile');
    });

    test('should handle boolean values', () => {
      expect(cacheKey('setting', true, 'enabled')).toBe('setting:true:enabled');
      expect(cacheKey('flag', false)).toBe('flag:false');
    });

    test('should handle empty input', () => {
      expect(cacheKey()).toBe('');
      expect(cacheKey(null, undefined)).toBe('');
    });
  });

  describe('withCaching()', () => {
    let testCache: CacheManager<string>;

    beforeEach(() => {
      testCache = new CacheManager({
        defaultTtl: 5000,
      });
    });

    afterEach(() => {
      testCache.destroy();
    });

    test('should cache function results', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');
      const cachedFn = withCaching('test-op', mockOperation, {
        cache: testCache,
      });

      const result1 = await cachedFn('arg1');
      const result2 = await cachedFn('arg1'); // Same args - should be cached

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    test('should cache different arguments separately', async () => {
      const mockOperation = jest
        .fn()
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2');

      const cachedFn = withCaching('test-op', mockOperation, {
        cache: testCache,
      });

      const result1 = await cachedFn('arg1');
      const result2 = await cachedFn('arg2');
      const result3 = await cachedFn('arg1'); // Cached

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(result3).toBe('result1');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    test('should use custom key function', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');
      const cachedFn = withCaching('test-op', mockOperation, {
        cache: testCache,
        keyFn: (arg: string) => `custom:${arg}`,
      });

      await cachedFn('test');

      expect(testCache.has('custom:test')).toBe(true);
    });

    test('should handle operation errors without caching', async () => {
      const error = new Error('Operation failed');
      const mockOperation = jest.fn().mockRejectedValue(error);
      const cachedFn = withCaching('test-op', mockOperation, {
        cache: testCache,
      });

      await expect(cachedFn('arg1')).rejects.toThrow('Operation failed');
      await expect(cachedFn('arg1')).rejects.toThrow('Operation failed');

      expect(mockOperation).toHaveBeenCalledTimes(2); // Not cached
    });
  });

  describe('memoize()', () => {
    test('should memoize function calls', async () => {
      const mockFn = jest.fn((x: number) => x * 2);
      const memoized = memoize(mockFn);

      const result1 = await memoized(5);
      const result2 = await memoized(5);
      const result3 = await memoized(10);

      expect(result1).toBe(10);
      expect(result2).toBe(10);
      expect(result3).toBe(20);
      expect(mockFn).toHaveBeenCalledTimes(2); // 5 and 10
    });

    test('should handle async functions', async () => {
      const mockFn = jest.fn(async (x: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return x * 2;
      });

      const memoized = memoize(mockFn);

      const result1 = await memoized(5);
      const result2 = await memoized(5);

      expect(result1).toBe(10);
      expect(result2).toBe(10);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should use custom key function', async () => {
      const mockFn = jest.fn((obj: { id: number; name: string }) => obj.name);
      const memoized = memoize(mockFn, {
        keyFn: obj => String(obj.id), // Only use ID for caching
      });

      const result1 = await memoized({ id: 1, name: 'Alice' });
      const result2 = await memoized({ id: 1, name: 'Bob' }); // Different name, same ID

      expect(result1).toBe('Alice');
      expect(result2).toBe('Alice'); // Cached result
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Global Cache Instances', () => {
  describe('Cache Invalidation Helpers', () => {
    beforeEach(() => {
      // Clear caches before each test
      apiCache.clear();
      queryCache.clear();
    });

    test('should invalidate user-related entries', () => {
      apiCache.set('user:123:profile', 'profile');
      apiCache.set('user:123:settings', 'settings');
      apiCache.set('user:456:profile', 'other');
      queryCache.set('user:123:tasks', 'tasks');

      cacheInvalidation.invalidateUser('123');

      expect(apiCache.get('user:123:profile')).toBeUndefined();
      expect(apiCache.get('user:123:settings')).toBeUndefined();
      expect(apiCache.get('user:456:profile')).toBe('other');
      expect(queryCache.get('user:123:tasks')).toBeUndefined();
    });

    test('should invalidate board-related entries', () => {
      apiCache.set('board:abc:tasks', 'tasks');
      queryCache.set('board:abc:list', 'list');
      apiCache.set('board:def:tasks', 'other');

      cacheInvalidation.invalidateBoard('abc');

      expect(apiCache.get('board:abc:tasks')).toBeUndefined();
      expect(queryCache.get('board:abc:list')).toBeUndefined();
      expect(apiCache.get('board:def:tasks')).toBe('other');
    });

    test('should invalidate task-related entries', () => {
      apiCache.set('task:123:details', 'details');
      queryCache.set('task:123:comments', 'comments');
      apiCache.set('task:456:details', 'other');

      cacheInvalidation.invalidateTask('123');

      expect(apiCache.get('task:123:details')).toBeUndefined();
      expect(queryCache.get('task:123:comments')).toBeUndefined();
      expect(apiCache.get('task:456:details')).toBe('other');
    });

    test('should invalidate all entries', () => {
      apiCache.set('key1', 'value1');
      queryCache.set('key2', 'value2');

      cacheInvalidation.invalidateAll();

      expect(apiCache.get('key1')).toBeUndefined();
      expect(queryCache.get('key2')).toBeUndefined();
    });
  });

  describe('Cache Warming', () => {
    test('should warm common queries', async () => {
      const mockApiClient = {
        getBoards: jest.fn().mockResolvedValue(['board1', 'board2']),
        getCurrentUser: jest.fn().mockResolvedValue({ id: 1, name: 'test' }),
      };

      await cacheWarming.warmCommonQueries(mockApiClient);

      expect(mockApiClient.getBoards).toHaveBeenCalled();
      expect(mockApiClient.getCurrentUser).toHaveBeenCalled();
    });

    test('should handle warming errors gracefully', async () => {
      const mockApiClient = {
        getBoards: jest.fn().mockRejectedValue(new Error('API error')),
        getCurrentUser: jest.fn().mockResolvedValue({ id: 1 }),
      };

      // Should not throw
      await expect(cacheWarming.warmCommonQueries(mockApiClient)).resolves.toBeUndefined();

      expect(mockApiClient.getBoards).toHaveBeenCalled();
      expect(mockApiClient.getCurrentUser).toHaveBeenCalled();
    });

    test('should handle missing methods', async () => {
      const mockApiClient = {}; // No methods

      // Should not throw
      await expect(cacheWarming.warmCommonQueries(mockApiClient)).resolves.toBeUndefined();
    });
  });
});

describe('Real-world Integration Tests', () => {
  test('should handle complex caching scenario', async () => {
    const cache = new CacheManager<any>({
      maxSize: 10,
      defaultTtl: 1000,
    });

    // Simulate API client with caching
    const mockApi = {
      getUser: jest.fn(),
      getUserTasks: jest.fn(),
    };

    const cachedGetUser = withCaching('getUser', mockApi.getUser, { cache });
    const cachedGetUserTasks = withCaching('getUserTasks', mockApi.getUserTasks, { cache });

    // Setup mock responses
    mockApi.getUser.mockResolvedValue({ id: 1, name: 'John' });
    mockApi.getUserTasks.mockResolvedValue(['task1', 'task2']);

    // First calls - should hit API
    const user1 = await cachedGetUser(1);
    const tasks1 = await cachedGetUserTasks(1);

    // Second calls - should be cached
    const user2 = await cachedGetUser(1);
    const tasks2 = await cachedGetUserTasks(1);

    expect(user1).toEqual({ id: 1, name: 'John' });
    expect(user2).toEqual({ id: 1, name: 'John' });
    expect(tasks1).toEqual(['task1', 'task2']);
    expect(tasks2).toEqual(['task1', 'task2']);

    expect(mockApi.getUser).toHaveBeenCalledTimes(1);
    expect(mockApi.getUserTasks).toHaveBeenCalledTimes(1);

    cache.destroy();
  });

  test('should handle cache eviction under memory pressure', () => {
    const cache = new CacheManager<string>({
      maxSize: 3,
      maxMemory: 100, // Small memory limit
    });

    // Add entries that might exceed memory limit
    cache.set('key1', 'small');
    cache.set('key2', 'medium'.repeat(5));
    cache.set('key3', 'large'.repeat(10));
    cache.set('key4', 'huge'.repeat(20));

    // Verify cache behavior under pressure
    const stats = cache.getStats();
    expect(stats.totalKeys).toBeLessThanOrEqual(3);
    expect(stats.totalSize).toBeLessThanOrEqual(100);

    cache.destroy();
  });
});
