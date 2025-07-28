/**
 * @fileoverview Cached API client wrapper for improved performance
 * @lastmodified 2025-07-28T17:30:00Z
 *
 * Features: Intelligent caching of API responses, cache invalidation
 * Main APIs: CachedApiClient - cached wrapper for ApiClientWrapper
 * Constraints: Maintains API compatibility, configurable cache behavior
 * Patterns: Cache-aside pattern, intelligent invalidation, performance optimization
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
 * Cached API client that wraps the original API client with intelligent caching
 */
export class CachedApiClient {
  private readonly apiClient: ApiClientWrapper;

  constructor(apiClient: ApiClientWrapper) {
    this.apiClient = apiClient;
  }

  /**
   * Cached board operations
   */
  getBoards = withCaching(
    'get-boards',
    () => monitoredApiCall('getBoards', () => this.apiClient.getBoards()),
    {
      cache: apiCache,
      ttl: 2 * 60 * 1000, // 2 minutes
      keyFn: () => cacheKey('boards', 'list'),
    }
  );

  getBoard = withCaching(
    'get-board',
    (id: string) => monitoredApiCall('getBoard', () => this.apiClient.getBoard(id)),
    {
      cache: apiCache,
      ttl: 5 * 60 * 1000, // 5 minutes
      keyFn: (id: string) => cacheKey('board', id),
    }
  );

  /**
   * Board write operations with cache invalidation
   */
  async createBoard(data: CreateBoardRequest): Promise<unknown> {
    const result = await monitoredApiCall('createBoard', () => this.apiClient.createBoard(data));

    // Invalidate boards list cache
    apiCache.invalidatePattern(/^boards:list/);

    logger.debug('Board created, cache invalidated', { boardData: data });
    return result;
  }

  async updateBoard(id: string, data: UpdateBoardRequest): Promise<unknown> {
    const result = await monitoredApiCall('updateBoard', () =>
      this.apiClient.updateBoard(id, data)
    );

    // Invalidate specific board and boards list
    cacheInvalidation.invalidateBoard(id);
    apiCache.invalidatePattern(/^boards:list/);

    logger.debug('Board updated, cache invalidated', { boardId: id, updates: data });
    return result;
  }

  async deleteBoard(id: string): Promise<unknown> {
    const result = await monitoredApiCall('deleteBoard', () => this.apiClient.deleteBoard(id));

    // Invalidate board-related caches
    cacheInvalidation.invalidateBoard(id);
    apiCache.invalidatePattern(/^boards:list/);

    logger.debug('Board deleted, cache invalidated', { boardId: id });
    return result;
  }

  /**
   * Cached task operations
   */
  getTasks = withCaching(
    'get-tasks',
    (params?: Record<string, string>) =>
      monitoredApiCall('getTasks', () => this.apiClient.getTasks(params)),
    {
      cache: queryCache,
      ttl: 1 * 60 * 1000, // 1 minute (tasks change frequently)
      keyFn: (params?: Record<string, string>) =>
        cacheKey('tasks', 'list', JSON.stringify(params || {})),
    }
  );

  getTask = withCaching(
    'get-task',
    (id: string) => monitoredApiCall('getTask', () => this.apiClient.getTask(id)),
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
    const result = await monitoredApiCall('createTask', () => this.apiClient.createTask(data));

    // Invalidate task lists and board-related caches
    queryCache.invalidatePattern(/^tasks:list/);
    if (data.boardId) {
      cacheInvalidation.invalidateBoard(data.boardId);
    }

    logger.debug('Task created, cache invalidated', { taskData: data });
    return result;
  }

  async updateTask(id: string, data: UpdateTaskRequest): Promise<unknown> {
    const result = await monitoredApiCall('updateTask', () => this.apiClient.updateTask(id, data));

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
        boardId = taskData.board_id || taskData.boardId;
      }
    } catch {
      // Ignore errors, proceed with deletion
    }

    const result = await monitoredApiCall('deleteTask', () => this.apiClient.deleteTask(id));

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
  getNotes = withCaching(
    'get-notes',
    (params?: Record<string, string>) =>
      monitoredApiCall('getNotes', () => this.apiClient.getNotes(params)),
    {
      cache: queryCache,
      ttl: 2 * 60 * 1000, // 2 minutes
      keyFn: (params?: Record<string, string>) =>
        cacheKey('notes', 'list', JSON.stringify(params || {})),
    }
  );

  getNote = withCaching(
    'get-note',
    (id: string) => monitoredApiCall('getNote', () => this.apiClient.getNote(id)),
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
    const result = await monitoredApiCall('createNote', () => this.apiClient.createNote(data));

    queryCache.invalidatePattern(/^notes:list/);

    logger.debug('Note created, cache invalidated', { noteData: data });
    return result;
  }

  async updateNote(id: string, data: UpdateNoteRequest): Promise<unknown> {
    const result = await monitoredApiCall('updateNote', () => this.apiClient.updateNote(id, data));

    apiCache.delete(cacheKey('note', id));
    queryCache.invalidatePattern(/^notes:list/);

    logger.debug('Note updated, cache invalidated', { noteId: id });
    return result;
  }

  async deleteNote(id: string): Promise<unknown> {
    const result = await monitoredApiCall('deleteNote', () => this.apiClient.deleteNote(id));

    apiCache.delete(cacheKey('note', id));
    queryCache.invalidatePattern(/^notes:list/);

    logger.debug('Note deleted, cache invalidated', { noteId: id });
    return result;
  }

  /**
   * Cached tag operations
   */
  getTags = withCaching(
    'get-tags',
    () => monitoredApiCall('getTags', () => this.apiClient.getTags()),
    {
      cache: apiCache,
      ttl: 10 * 60 * 1000, // 10 minutes (tags don't change often)
      keyFn: () => cacheKey('tags', 'list'),
    }
  );

  getTag = withCaching(
    'get-tag',
    (id: string) => monitoredApiCall('getTag', () => this.apiClient.getTag(id)),
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
    const result = await monitoredApiCall('createTag', () => this.apiClient.createTag(data));

    apiCache.invalidatePattern(/^tags:list/);

    logger.debug('Tag created, cache invalidated', { tagData: data });
    return result;
  }

  async updateTag(id: string, data: UpdateTagRequest): Promise<unknown> {
    const result = await monitoredApiCall('updateTag', () => this.apiClient.updateTag(id, data));

    apiCache.delete(cacheKey('tag', id));
    apiCache.invalidatePattern(/^tags:list/);

    logger.debug('Tag updated, cache invalidated', { tagId: id });
    return result;
  }

  async deleteTag(id: string): Promise<unknown> {
    const result = await monitoredApiCall('deleteTag', () => this.apiClient.deleteTag(id));

    apiCache.delete(cacheKey('tag', id));
    apiCache.invalidatePattern(/^tags:list/);

    logger.debug('Tag deleted, cache invalidated', { tagId: id });
    return result;
  }

  /**
   * Health check (not cached - always fresh)
   */
  async getHealth(): Promise<unknown> {
    return monitoredApiCall('getHealth', () => this.apiClient.getHealth());
  }

  /**
   * Search operations (short cache for better UX)
   */
  searchTasks = withCaching(
    'search-tasks',
    (query: string, params?: Record<string, string>) =>
      monitoredApiCall('searchTasks', () => this.apiClient.searchTasks(query, params)),
    {
      cache: queryCache,
      ttl: 30 * 1000, // 30 seconds (search results change frequently)
      keyFn: (query: string, params?: Record<string, string>) =>
        cacheKey('search', 'tasks', query, JSON.stringify(params || {})),
    }
  );

  searchTags = withCaching(
    'search-tags',
    (query: string) => monitoredApiCall('searchTags', () => this.apiClient.searchTags(query)),
    {
      cache: apiCache,
      ttl: 2 * 60 * 1000, // 2 minutes
      keyFn: (query: string) => cacheKey('search', 'tags', query),
    }
  );

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

  warmCache(): Promise<void> {
    logger.info('Warming API caches...');

    return Promise.allSettled([
      this.getBoards().catch(() => {}), // Ignore errors during warming
      this.getTags().catch(() => {}),
    ]).then(() => {
      logger.info('API cache warming completed');
    });
  }
}

/**
 * Create a cached API client wrapper
 */
export function createCachedApiClient(apiClient: ApiClientWrapper): CachedApiClient {
  const cachedClient = new CachedApiClient(apiClient);

  // Delegate any missing methods to the original client
  return new Proxy(cachedClient, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }

      // Delegate to original API client
      const originalMethod = Reflect.get(apiClient, prop);
      if (typeof originalMethod === 'function') {
        return (...args: unknown[]) => originalMethod.apply(apiClient, args);
      }

      return originalMethod;
    },
  });
}
