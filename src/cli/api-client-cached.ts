/**
 * @fileoverview Enhanced cached API client with error handling and performance monitoring
 * @lastmodified 2025-01-28T12:00:00Z
 *
 * Features: Intelligent caching, error handling, performance monitoring, cache health checks
 * Main APIs: CachedApiClient - enhanced cached wrapper for ApiClientWrapper
 * Constraints: Maintains API compatibility, error boundaries, performance tracking
 * Patterns: Cache-aside pattern, circuit breaker, performance monitoring, graceful degradation
 */

import type { ApiClientWrapper } from './api-client-wrapper';
import type {
  CreateBoardRequest,
  UpdateBoardRequest,
  CreateTaskRequest,
  UpdateTaskRequest,
  CreateNoteRequest,
  UpdateNoteRequest,
  CreateTagRequest,
  UpdateTagRequest,
} from './types';
import { withCaching, apiCache, queryCache, cacheKey, cacheInvalidation } from '../utils/cache';
import { monitoredApiCall } from './utils/performance-helpers';
import { logger } from '../utils/logger';

/**
 * Cache performance metrics
 */
export interface CachePerformanceMetrics {
  hitRate: number;
  missRate: number;
  errorRate: number;
  avgResponseTime: number;
  cacheSize: number;
  memoryUsage: number;
}

/**
 * Cache health status
 */
export interface CacheHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: CachePerformanceMetrics;
  errors: string[];
  lastChecked: Date;
}

/**
 * Enhanced cached API client with error handling and performance monitoring
 */
export class CachedApiClient {
  private readonly apiClient: ApiClientWrapper;

  private readonly performanceMetrics: Map<string, number[]> = new Map();

  private readonly errorCounts: Map<string, number> = new Map();

  private readonly cacheErrors: string[] = [];

  private readonly maxErrorHistory = 100;

  constructor(apiClient: ApiClientWrapper) {
    this.apiClient = apiClient;
    this.setupErrorHandling();
  }

  /**
   * Setup error handling for cache operations
   */
  private setupErrorHandling(): void {
    // Cache managers don't expose error events - error handling is done at operation level
    // Error tracking is handled through try/catch blocks in cached operations
    this.cacheErrors.length = 0; // Initialize error tracking
  }

  /**
   * Record cache error with proper logging
   */
  private recordCacheError(error: string): void {
    this.cacheErrors.push(error);
    if (this.cacheErrors.length > this.maxErrorHistory) {
      this.cacheErrors.shift();
    }
    logger.error('Cache operation error', { error });
  }

  /**
   * Record performance metric
   */
  private recordPerformance(operation: string, responseTime: number): void {
    const metrics = this.performanceMetrics.get(operation) ?? [];
    metrics.push(responseTime);

    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }

    this.performanceMetrics.set(operation, metrics);
  }

  /**
   * Execute operation with error boundary and performance monitoring
   */
  private async executeWithErrorBoundary<T>(
    operation: string,
    fn: () => Promise<T>,
    fallbackFn?: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await fn();
      this.recordPerformance(operation, Date.now() - startTime);
      return result;
    } catch (error) {
      const errorCount = this.errorCounts.get(operation) ?? 0;
      this.errorCounts.set(operation, errorCount + 1);

      logger.error(`Error in cached operation: ${operation}`, { error });

      // Try fallback if available (direct API call without cache)
      if (fallbackFn) {
        logger.info(`Attempting fallback for operation: ${operation}`);
        try {
          const result = await fallbackFn();
          this.recordPerformance(`${operation}-fallback`, Date.now() - startTime);
          return result;
        } catch (fallbackError) {
          logger.error(`Fallback failed for operation: ${operation}`, { error: fallbackError });
        }
      }

      throw error;
    }
  }

  /**
   * Enhanced cached board operations with error boundaries
   */
  getBoards = async (): Promise<unknown> =>
    this.executeWithErrorBoundary(
      'getBoards',
      async () =>
        withCaching(
          'get-boards',
          async () => monitoredApiCall('getBoards', async () => this.apiClient.getBoards()),
          {
            cache: apiCache,
            ttl: 2 * 60 * 1000, // 2 minutes
            keyFn: () => cacheKey('boards', 'list'),
          }
        )(),
      async () => this.apiClient.getBoards() // Fallback without cache
    );

  getBoard = async (id: string): Promise<unknown> =>
    this.executeWithErrorBoundary(
      'getBoard',
      async () =>
        withCaching(
          'get-board',
          async (boardId: string) =>
            monitoredApiCall('getBoard', async () => this.apiClient.getBoard(boardId)),
          {
            cache: apiCache,
            ttl: 5 * 60 * 1000, // 5 minutes
            keyFn: (boardId: string) => cacheKey('board', boardId),
          }
        )(id),
      async () => this.apiClient.getBoard(id) // Fallback without cache
    );

  /**
   * Board write operations with enhanced cache invalidation and error handling
   */
  async createBoard(data: CreateBoardRequest): Promise<unknown> {
    return this.executeWithErrorBoundary('createBoard', async () => {
      const result = await monitoredApiCall('createBoard', async () =>
        this.apiClient.createBoard(data)
      );

      // Safe cache invalidation with error handling
      try {
        apiCache.invalidatePattern(/^boards:list/);
        logger.debug('Board created, cache invalidated', { boardData: data });
      } catch (cacheError) {
        this.recordCacheError(
          `Cache invalidation failed after board creation: ${String(cacheError)}`
        );
      }

      return result;
    });
  }

  async updateBoard(id: string, data: UpdateBoardRequest): Promise<unknown> {
    return this.executeWithErrorBoundary('updateBoard', async () => {
      const result = await monitoredApiCall('updateBoard', async () =>
        this.apiClient.updateBoard(id, data)
      );

      // Safe cache invalidation with error handling
      try {
        cacheInvalidation.invalidateBoard(id);
        apiCache.invalidatePattern(/^boards:list/);
        logger.debug('Board updated, cache invalidated', { boardId: id, updates: data });
      } catch (cacheError) {
        this.recordCacheError(
          `Cache invalidation failed after board update: ${String(cacheError)}`
        );
      }

      return result;
    });
  }

  async deleteBoard(id: string): Promise<unknown> {
    return this.executeWithErrorBoundary('deleteBoard', async () => {
      const result = await monitoredApiCall('deleteBoard', async () =>
        this.apiClient.deleteBoard(id)
      );

      // Safe cache invalidation with error handling
      try {
        cacheInvalidation.invalidateBoard(id);
        apiCache.invalidatePattern(/^boards:list/);
        logger.debug('Board deleted, cache invalidated', { boardId: id });
      } catch (cacheError) {
        this.recordCacheError(
          `Cache invalidation failed after board deletion: ${String(cacheError)}`
        );
      }

      return result;
    });
  }

  /**
   * Cached task operations
   */
  getTasks: (params?: Record<string, string>) => Promise<unknown> = withCaching(
    'get-tasks',
    async (params?: Record<string, string>) =>
      monitoredApiCall('getTasks', async () => this.apiClient.getTasks(params)),
    {
      cache: queryCache,
      ttl: 1 * 60 * 1000, // 1 minute (tasks change frequently)
      keyFn: (params?: Record<string, string>) =>
        cacheKey('tasks', 'list', JSON.stringify(params ?? {})),
    }
  );

  getTask: (id: string) => Promise<unknown> = withCaching(
    'get-task',
    async (id: string) => monitoredApiCall('getTask', async () => this.apiClient.getTask(id)),
    {
      cache: apiCache,
      ttl: 3 * 60 * 1000, // 3 minutes
      keyFn: (id: string) => cacheKey('task', id),
    }
  );

  /**
   * Task write operations with intelligent cache invalidation
   */
  async createTask(data: CreateTaskRequest): Promise<unknown> {
    const result = await monitoredApiCall('createTask', async () =>
      this.apiClient.createTask(data)
    );

    // Invalidate task lists and board-related caches
    queryCache.invalidatePattern(/^tasks:list/);
    if (data.boardId) {
      cacheInvalidation.invalidateBoard(data.boardId);
    }

    logger.debug('Task created, cache invalidated', { taskData: data });
    return result;
  }

  async updateTask(id: string, data: UpdateTaskRequest): Promise<unknown> {
    const result = await monitoredApiCall('updateTask', async () =>
      this.apiClient.updateTask(id, data)
    );

    // Invalidate specific task and related caches
    cacheInvalidation.invalidateTask(id);
    queryCache.invalidatePattern(/^tasks:list/);

    // UpdateTaskRequest doesn't include boardId, so we can't invalidate specific board
    // The getTask cache will be invalidated by cacheInvalidation.invalidateTask above

    logger.debug('Task updated, cache invalidated', { taskId: id, updates: data });
    return result;
  }

  async deleteTask(id: string): Promise<unknown> {
    // Get task info before deletion for cache invalidation
    let boardId: string | undefined;
    try {
      const task = await this.getTask(id);
      if (task && typeof task === 'object' && 'data' in task) {
        const taskData = task.data as { board_id?: string; boardId?: string };
        boardId = taskData.board_id ?? taskData.boardId;
      }
    } catch {
      // Ignore errors, proceed with deletion
    }

    const result = await monitoredApiCall('deleteTask', async () => this.apiClient.deleteTask(id));

    // Invalidate task-related caches
    cacheInvalidation.invalidateTask(id);
    queryCache.invalidatePattern(/^tasks:list/);

    if (boardId) {
      cacheInvalidation.invalidateBoard(boardId);
    }

    logger.debug('Task deleted, cache invalidated', { taskId: id });
    return result;
  }

  /**
   * Cached note operations
   */
  getNotes: (params?: Record<string, string>) => Promise<unknown> = withCaching(
    'get-notes',
    async (params?: Record<string, string>) =>
      monitoredApiCall('getNotes', async () => this.apiClient.getNotes(params)),
    {
      cache: queryCache,
      ttl: 2 * 60 * 1000, // 2 minutes
      keyFn: (params?: Record<string, string>) =>
        cacheKey('notes', 'list', JSON.stringify(params ?? {})),
    }
  );

  getNote: (id: string) => Promise<unknown> = withCaching(
    'get-note',
    async (id: string) => monitoredApiCall('getNote', async () => this.apiClient.getNote(id)),
    {
      cache: apiCache,
      ttl: 5 * 60 * 1000, // 5 minutes
      keyFn: (id: string) => cacheKey('note', id),
    }
  );

  /**
   * Note write operations
   */
  async createNote(data: CreateNoteRequest): Promise<unknown> {
    const result = await monitoredApiCall('createNote', async () =>
      this.apiClient.createNote(data)
    );

    queryCache.invalidatePattern(/^notes:list/);

    logger.debug('Note created, cache invalidated', { noteData: data });
    return result;
  }

  async updateNote(id: string, data: UpdateNoteRequest): Promise<unknown> {
    const result = await monitoredApiCall('updateNote', async () =>
      this.apiClient.updateNote(id, data)
    );

    apiCache.delete(cacheKey('note', id));
    queryCache.invalidatePattern(/^notes:list/);

    logger.debug('Note updated, cache invalidated', { noteId: id });
    return result;
  }

  async deleteNote(id: string): Promise<unknown> {
    const result = await monitoredApiCall('deleteNote', async () => this.apiClient.deleteNote(id));

    apiCache.delete(cacheKey('note', id));
    queryCache.invalidatePattern(/^notes:list/);

    logger.debug('Note deleted, cache invalidated', { noteId: id });
    return result;
  }

  /**
   * Cached tag operations
   */
  getTags: () => Promise<unknown> = withCaching(
    'get-tags',
    async () => monitoredApiCall('getTags', async () => this.apiClient.getTags()),
    {
      cache: apiCache,
      ttl: 10 * 60 * 1000, // 10 minutes (tags don't change often)
      keyFn: () => cacheKey('tags', 'list'),
    }
  );

  getTag: (id: string) => Promise<unknown> = withCaching(
    'get-tag',
    async (id: string) => monitoredApiCall('getTag', async () => this.apiClient.getTag(id)),
    {
      cache: apiCache,
      ttl: 15 * 60 * 1000, // 15 minutes
      keyFn: (id: string) => cacheKey('tag', id),
    }
  );

  /**
   * Tag write operations
   */
  async createTag(data: CreateTagRequest): Promise<unknown> {
    const result = await monitoredApiCall('createTag', async () => this.apiClient.createTag(data));

    apiCache.invalidatePattern(/^tags:list/);

    logger.debug('Tag created, cache invalidated', { tagData: data });
    return result;
  }

  async updateTag(id: string, data: UpdateTagRequest): Promise<unknown> {
    const result = await monitoredApiCall('updateTag', async () =>
      this.apiClient.updateTag(id, data)
    );

    apiCache.delete(cacheKey('tag', id));
    apiCache.invalidatePattern(/^tags:list/);

    logger.debug('Tag updated, cache invalidated', { tagId: id });
    return result;
  }

  async deleteTag(id: string): Promise<unknown> {
    const result = await monitoredApiCall('deleteTag', async () => this.apiClient.deleteTag(id));

    apiCache.delete(cacheKey('tag', id));
    apiCache.invalidatePattern(/^tags:list/);

    logger.debug('Tag deleted, cache invalidated', { tagId: id });
    return result;
  }

  /**
   * Health check (not cached - always fresh)
   */
  async getHealth(): Promise<unknown> {
    return monitoredApiCall('getHealth', async () => this.apiClient.getHealth());
  }

  /**
   * Search operations (short cache for better UX)
   */
  searchTasks: (query: string, params?: Record<string, string>) => Promise<unknown> = withCaching(
    'search-tasks',
    async (query: string, params?: Record<string, string>) =>
      monitoredApiCall('searchTasks', async () => this.apiClient.searchTasks(query, params)),
    {
      cache: queryCache,
      ttl: 30 * 1000, // 30 seconds (search results change frequently)
      keyFn: (query: string, params?: Record<string, string>) =>
        cacheKey('search', 'tasks', query, JSON.stringify(params ?? {})),
    }
  );

  searchTags: (query: string) => Promise<unknown> = withCaching(
    'search-tags',
    async (query: string) =>
      monitoredApiCall('searchTags', async () => this.apiClient.searchTags(query)),
    {
      cache: apiCache,
      ttl: 2 * 60 * 1000, // 2 minutes
      keyFn: (query: string) => cacheKey('search', 'tags', query),
    }
  );

  /**
   * Get cache performance metrics
   */
  public getCachePerformanceMetrics(): CachePerformanceMetrics {
    const apiStats = apiCache.getStats();
    const queryStats = queryCache.getStats();

    const totalHits = apiStats.totalHits + queryStats.totalHits;
    const totalMisses = apiStats.totalMisses + queryStats.totalMisses;
    const totalRequests = totalHits + totalMisses;

    const totalErrors = Array.from(this.errorCounts.values()).reduce(
      (sum, count) => sum + count,
      0
    );

    const allResponseTimes = Array.from(this.performanceMetrics.values()).flat();
    const avgResponseTime =
      allResponseTimes.length > 0
        ? allResponseTimes.reduce((sum, time) => sum + time, 0) / allResponseTimes.length
        : 0;

    return {
      hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
      missRate: totalRequests > 0 ? totalMisses / totalRequests : 0,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      avgResponseTime,
      cacheSize: apiStats.totalKeys + queryStats.totalKeys,
      memoryUsage: apiStats.totalSize + queryStats.totalSize,
    };
  }

  /**
   * Get cache health status
   */
  public getCacheHealthStatus(): CacheHealthStatus {
    const metrics = this.getCachePerformanceMetrics();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Determine health status based on metrics
    if (metrics.errorRate > 0.1 || metrics.hitRate < 0.3) {
      status = 'unhealthy';
    } else if (metrics.errorRate > 0.05 || metrics.hitRate < 0.5) {
      status = 'degraded';
    }

    return {
      status,
      metrics,
      errors: [...this.cacheErrors],
      lastChecked: new Date(),
    };
  }

  /**
   * Reset performance metrics (useful for testing)
   */
  public resetMetrics(): void {
    this.performanceMetrics.clear();
    this.errorCounts.clear();
    this.cacheErrors.length = 0;
  }

  /**
   * Cache management methods
   */
  static getCacheStats(): {
    apiCache: ReturnType<typeof apiCache.getStats>;
    queryCache: ReturnType<typeof queryCache.getStats>;
  } {
    return {
      apiCache: apiCache.getStats(),
      queryCache: queryCache.getStats(),
    };
  }

  static clearAllCaches(): void {
    cacheInvalidation.invalidateAll();
    logger.info('All API caches cleared');
  }

  async warmCache(): Promise<void> {
    logger.info('Warming API caches...');

    const warmupOperations = [
      async (): Promise<void> =>
        this.getBoards()
          .then(() => {})
          .catch(() => {}), // Ignore errors during warming
      async (): Promise<void> =>
        this.getTags()
          .then(() => {})
          .catch(() => {}),
    ];

    await Promise.allSettled(warmupOperations.map(async (op): Promise<void> => op()));
    logger.info('API cache warming completed');
  }
}

/**
 * Create a cached API client wrapper
 */
export function createCachedApiClient(apiClient: ApiClientWrapper): CachedApiClient {
  const cachedClient = new CachedApiClient(apiClient);

  // Delegate any missing methods to the original client
  return new Proxy(cachedClient, {
    get(target: CachedApiClient, prop: PropertyKey, receiver: unknown): unknown {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }

      // Delegate to original API client
      const originalMethod = Reflect.get(apiClient, prop) as unknown;
      if (typeof originalMethod === 'function') {
        return (...args: unknown[]): unknown =>
          (originalMethod as (...args: unknown[]) => unknown).apply(apiClient, args);
      }

      return originalMethod;
    },
  });
}
