# Performance Tuning Guide

This guide covers performance optimization techniques and best practices for the MCP Kanban system, including database optimization, API performance, and system monitoring.

## Table of Contents

- [Performance Overview](#performance-overview)
- [Database Performance](#database-performance)
- [API Performance](#api-performance)
- [WebSocket Performance](#websocket-performance)
- [Memory Management](#memory-management)
- [Caching Strategies](#caching-strategies)
- [Monitoring & Profiling](#monitoring--profiling)
- [Performance Testing](#performance-testing)
- [Production Optimization](#production-optimization)

## Performance Overview

### Performance Goals

- **API Response Time**: < 200ms for 95% of requests
- **Database Query Time**: < 50ms for 95% of queries
- **WebSocket Latency**: < 100ms for real-time updates
- **Memory Usage**: < 512MB for typical workloads
- **Concurrent Users**: Support 100+ simultaneous users

### Performance Metrics

```typescript
interface PerformanceMetrics {
  // API Metrics
  apiResponseTime: {
    p50: number;  // 50th percentile
    p95: number;  // 95th percentile
    p99: number;  // 99th percentile
  };
  
  // Database Metrics
  databaseQueryTime: {
    average: number;
    max: number;
    slowQueries: number;
  };
  
  // Memory Metrics
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  
  // WebSocket Metrics
  websocketLatency: {
    average: number;
    max: number;
  };
  
  // System Metrics
  cpuUsage: number;
  activeConnections: number;
  requestsPerSecond: number;
}
```

## Database Performance

### SQLite Optimization

#### 1. WAL Mode Configuration

```typescript
// src/database/connection.ts
export class DatabaseConnection {
  constructor(private path: string) {}
  
  async initialize(): Promise<void> {
    // Enable WAL mode for better concurrency
    await this.db.run('PRAGMA journal_mode = WAL');
    
    // Optimize memory usage
    await this.db.run('PRAGMA cache_size = -64000'); // 64MB cache
    await this.db.run('PRAGMA temp_store = memory');
    await this.db.run('PRAGMA mmap_size = 268435456'); // 256MB mmap
    
    // Optimize for performance
    await this.db.run('PRAGMA synchronous = NORMAL');
    await this.db.run('PRAGMA busy_timeout = 30000');
    
    // Enable foreign keys
    await this.db.run('PRAGMA foreign_keys = ON');
  }
}
```

#### 2. Index Optimization

```sql
-- Strategic indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_board_status ON tasks(board_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority_created ON tasks(priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_dependencies ON task_dependencies(task_id, depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_notes_search ON notes(title, content) WHERE content IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tags_hierarchy ON tags(parent_id, name);

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_tasks_board_status_priority ON tasks(board_id, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_user_created ON tasks(created_by, created_at DESC);
```

#### 3. Query Optimization

```typescript
// ✅ Good: Use indexes effectively
class TaskService {
  async getTasksByBoardAndStatus(boardId: string, status: string): Promise<Task[]> {
    // This query uses the composite index on (board_id, status)
    return this.db.query(`
      SELECT * FROM tasks 
      WHERE board_id = ? AND status = ?
      ORDER BY position ASC
      LIMIT 100
    `, [boardId, status]);
  }
  
  async getHighPriorityTasks(boardId: string): Promise<Task[]> {
    // Uses index on (board_id, priority DESC)
    return this.db.query(`
      SELECT * FROM tasks 
      WHERE board_id = ? AND priority >= 8
      ORDER BY priority DESC, created_at DESC
      LIMIT 50
    `, [boardId]);
  }
}

// ❌ Bad: Avoid full table scans
class BadTaskService {
  async getTasksByBoard(boardId: string): Promise<Task[]> {
    // This will scan all tasks and filter in memory
    return this.db.query(`
      SELECT * FROM tasks 
      WHERE LOWER(title) LIKE LOWER(?)
    `, [`%${boardId}%`]);
  }
}
```

#### 4. Connection Pooling

```typescript
// src/database/connectionPool.ts
export class DatabaseConnectionPool {
  private pool: DatabaseConnection[] = [];
  private maxConnections: number;
  private inUseConnections = new Set<DatabaseConnection>();
  
  constructor(private dbPath: string, maxConnections = 10) {
    this.maxConnections = maxConnections;
  }
  
  async getConnection(): Promise<DatabaseConnection> {
    // Return available connection
    const available = this.pool.find(conn => !this.inUseConnections.has(conn));
    if (available) {
      this.inUseConnections.add(available);
      return available;
    }
    
    // Create new connection if under limit
    if (this.pool.length < this.maxConnections) {
      const connection = new DatabaseConnection(this.dbPath);
      await connection.initialize();
      this.pool.push(connection);
      this.inUseConnections.add(connection);
      return connection;
    }
    
    // Wait for connection to become available
    return this.waitForConnection();
  }
  
  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    this.inUseConnections.delete(connection);
  }
  
  private async waitForConnection(): Promise<DatabaseConnection> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const available = this.pool.find(conn => !this.inUseConnections.has(conn));
        if (available) {
          clearInterval(checkInterval);
          this.inUseConnections.add(available);
          resolve(available);
        }
      }, 10);
    });
  }
}
```

### Query Performance Monitoring

```typescript
// src/utils/queryMonitor.ts
export class QueryMonitor {
  private slowQueryThreshold = 100; // 100ms
  private queryStats = new Map<string, QueryStats>();
  
  async monitorQuery<T>(
    query: string,
    params: unknown[],
    executor: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    const queryId = this.generateQueryId(query, params);
    
    try {
      const result = await executor();
      const duration = Date.now() - startTime;
      
      this.recordQuery(queryId, query, duration, true);
      
      if (duration > this.slowQueryThreshold) {
        this.logger.warn('Slow query detected', {
          query,
          params,
          duration,
          queryId,
        });
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordQuery(queryId, query, duration, false);
      throw error;
    }
  }
  
  private recordQuery(
    queryId: string,
    query: string,
    duration: number,
    success: boolean
  ): void {
    const stats = this.queryStats.get(queryId) || {
      count: 0,
      totalTime: 0,
      avgTime: 0,
      maxTime: 0,
      errors: 0,
    };
    
    stats.count++;
    stats.totalTime += duration;
    stats.avgTime = stats.totalTime / stats.count;
    stats.maxTime = Math.max(stats.maxTime, duration);
    
    if (!success) {
      stats.errors++;
    }
    
    this.queryStats.set(queryId, stats);
  }
  
  getSlowQueries(): SlowQuery[] {
    return Array.from(this.queryStats.entries())
      .filter(([_, stats]) => stats.avgTime > this.slowQueryThreshold)
      .map(([queryId, stats]) => ({
        queryId,
        avgTime: stats.avgTime,
        maxTime: stats.maxTime,
        count: stats.count,
        errors: stats.errors,
      }))
      .sort((a, b) => b.avgTime - a.avgTime);
  }
}
```

## API Performance

### Response Optimization

#### 1. Compression

```typescript
// src/middleware/compression.ts
import compression from 'compression';

export const compressionMiddleware = compression({
  filter: (req, res) => {
    // Don't compress small responses
    if (req.headers['content-length'] && parseInt(req.headers['content-length']) < 1024) {
      return false;
    }
    
    // Don't compress already compressed content
    if (req.headers['content-encoding']) {
      return false;
    }
    
    return compression.filter(req, res);
  },
  level: 6, // Balance between compression and CPU usage
  threshold: 1024, // Only compress responses > 1KB
});
```

#### 2. Response Caching

```typescript
// src/middleware/cache.ts
export class ResponseCache {
  private cache = new Map<string, CachedResponse>();
  private maxSize = 1000;
  private ttl = 5 * 60 * 1000; // 5 minutes
  
  async get(key: string): Promise<CachedResponse | null> {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return cached;
  }
  
  set(key: string, response: any, ttlMs?: number): void {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      data: response,
      expiresAt: Date.now() + (ttlMs || this.ttl),
    });
  }
  
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt < oldestTime) {
        oldestTime = value.expiresAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

// Usage in routes
export const cacheMiddleware = (ttlMs = 5 * 60 * 1000) => {
  const cache = new ResponseCache();
  
  return async (req: Request, res: Response, next: NextFunction) => {
    const cacheKey = `${req.method}:${req.path}:${JSON.stringify(req.query)}`;
    
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached.data);
    }
    
    const originalSend = res.json;
    res.json = function(data) {
      cache.set(cacheKey, data, ttlMs);
      return originalSend.call(this, data);
    };
    
    next();
  };
};
```

#### 3. Request Batching

```typescript
// src/utils/batchProcessor.ts
export class BatchProcessor<T, R> {
  private batch: BatchItem<T>[] = [];
  private processing = false;
  private batchSize: number;
  private batchTimeout: number;
  
  constructor(
    private processor: (items: T[]) => Promise<R[]>,
    batchSize = 100,
    batchTimeout = 50
  ) {
    this.batchSize = batchSize;
    this.batchTimeout = batchTimeout;
  }
  
  async add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.batch.push({ item, resolve, reject });
      
      if (this.batch.length >= this.batchSize) {
        this.processBatch();
      } else if (this.batch.length === 1) {
        // Start timeout for first item
        setTimeout(() => this.processBatch(), this.batchTimeout);
      }
    });
  }
  
  private async processBatch(): Promise<void> {
    if (this.processing || this.batch.length === 0) return;
    
    this.processing = true;
    const currentBatch = this.batch.splice(0, this.batchSize);
    
    try {
      const results = await this.processor(currentBatch.map(b => b.item));
      
      currentBatch.forEach((batchItem, index) => {
        batchItem.resolve(results[index]);
      });
    } catch (error) {
      currentBatch.forEach(batchItem => {
        batchItem.reject(error);
      });
    } finally {
      this.processing = false;
      
      // Process remaining items if any
      if (this.batch.length > 0) {
        this.processBatch();
      }
    }
  }
}

// Usage for bulk operations
const taskBatchProcessor = new BatchProcessor(
  async (tasks: CreateTaskRequest[]) => {
    return this.taskService.createTasksBatch(tasks);
  },
  50, // batch size
  100 // timeout ms
);

// API endpoint
app.post('/api/tasks/batch', async (req, res) => {
  const { tasks } = req.body;
  const results = await Promise.all(
    tasks.map(task => taskBatchProcessor.add(task))
  );
  res.json(results);
});
```

### Rate Limiting

```typescript
// src/middleware/rateLimit.ts
export class RateLimiter {
  private requests = new Map<string, RequestRecord[]>();
  private windowMs: number;
  private maxRequests: number;
  
  constructor(windowMs = 60000, maxRequests = 1000) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }
  
  isAllowed(clientId: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    let clientRequests = this.requests.get(clientId) || [];
    
    // Remove old requests outside the window
    clientRequests = clientRequests.filter(req => req.timestamp > windowStart);
    
    if (clientRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    clientRequests.push({ timestamp: now });
    this.requests.set(clientId, clientRequests);
    
    return true;
  }
  
  getRemainingRequests(clientId: string): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    const clientRequests = this.requests.get(clientId) || [];
    const validRequests = clientRequests.filter(req => req.timestamp > windowStart);
    
    return Math.max(0, this.maxRequests - validRequests.length);
  }
  
  getResetTime(clientId: string): number {
    const clientRequests = this.requests.get(clientId) || [];
    if (clientRequests.length === 0) return Date.now();
    
    const oldestRequest = Math.min(...clientRequests.map(req => req.timestamp));
    return oldestRequest + this.windowMs;
  }
}

// Rate limiting middleware
export const rateLimitMiddleware = (windowMs = 60000, maxRequests = 1000) => {
  const limiter = new RateLimiter(windowMs, maxRequests);
  
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.headers['x-api-key'] as string || req.ip;
    
    if (!limiter.isAllowed(clientId)) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((limiter.getResetTime(clientId) - Date.now()) / 1000),
      });
      return;
    }
    
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', limiter.getRemainingRequests(clientId));
    res.setHeader('X-RateLimit-Reset', limiter.getResetTime(clientId));
    
    next();
  };
};
```

## WebSocket Performance

### Connection Management

```typescript
// src/websocket/connectionManager.ts
export class WebSocketConnectionManager {
  private connections = new Map<string, WebSocketConnection>();
  private rooms = new Map<string, Set<string>>();
  private maxConnections = 1000;
  private heartbeatInterval = 30000; // 30 seconds
  
  addConnection(connectionId: string, ws: WebSocket): void {
    if (this.connections.size >= this.maxConnections) {
      ws.close(1013, 'Server at capacity');
      return;
    }
    
    const connection: WebSocketConnection = {
      id: connectionId,
      ws,
      lastHeartbeat: Date.now(),
      subscriptions: new Set(),
      isAlive: true,
    };
    
    this.connections.set(connectionId, connection);
    this.startHeartbeat(connection);
  }
  
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      // Remove from all rooms
      connection.subscriptions.forEach(roomId => {
        this.leaveRoom(connectionId, roomId);
      });
      
      this.connections.delete(connectionId);
    }
  }
  
  joinRoom(connectionId: string, roomId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    
    this.rooms.get(roomId)!.add(connectionId);
    connection.subscriptions.add(roomId);
  }
  
  leaveRoom(connectionId: string, roomId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    this.rooms.get(roomId)?.delete(connectionId);
    connection.subscriptions.delete(roomId);
    
    // Clean up empty rooms
    if (this.rooms.get(roomId)?.size === 0) {
      this.rooms.delete(roomId);
    }
  }
  
  broadcastToRoom(roomId: string, message: any): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    const messageStr = JSON.stringify(message);
    const deadConnections: string[] = [];
    
    room.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection && connection.isAlive) {
        try {
          connection.ws.send(messageStr);
        } catch (error) {
          deadConnections.push(connectionId);
        }
      } else {
        deadConnections.push(connectionId);
      }
    });
    
    // Clean up dead connections
    deadConnections.forEach(connectionId => {
      this.removeConnection(connectionId);
    });
  }
  
  private startHeartbeat(connection: WebSocketConnection): void {
    const heartbeatTimer = setInterval(() => {
      if (!connection.isAlive) {
        clearInterval(heartbeatTimer);
        this.removeConnection(connection.id);
        return;
      }
      
      connection.isAlive = false;
      connection.ws.ping();
    }, this.heartbeatInterval);
    
    connection.ws.on('pong', () => {
      connection.isAlive = true;
      connection.lastHeartbeat = Date.now();
    });
  }
}
```

### Message Batching

```typescript
// src/websocket/messageBatcher.ts
export class MessageBatcher {
  private batches = new Map<string, MessageBatch>();
  private batchSize: number;
  private batchTimeout: number;
  
  constructor(batchSize = 10, batchTimeout = 100) {
    this.batchSize = batchSize;
    this.batchTimeout = batchTimeout;
  }
  
  addMessage(roomId: string, message: any): void {
    if (!this.batches.has(roomId)) {
      this.batches.set(roomId, {
        messages: [],
        timer: setTimeout(() => this.flushBatch(roomId), this.batchTimeout),
      });
    }
    
    const batch = this.batches.get(roomId)!;
    batch.messages.push(message);
    
    if (batch.messages.length >= this.batchSize) {
      this.flushBatch(roomId);
    }
  }
  
  private flushBatch(roomId: string): void {
    const batch = this.batches.get(roomId);
    if (!batch) return;
    
    clearTimeout(batch.timer);
    
    if (batch.messages.length > 0) {
      this.broadcastBatch(roomId, batch.messages);
    }
    
    this.batches.delete(roomId);
  }
  
  private broadcastBatch(roomId: string, messages: any[]): void {
    const batchMessage = {
      type: 'batch',
      roomId,
      messages,
      timestamp: Date.now(),
    };
    
    // Send to all connections in the room
    this.connectionManager.broadcastToRoom(roomId, batchMessage);
  }
}
```

## Memory Management

### Memory Monitoring

```typescript
// src/utils/memoryMonitor.ts
export class MemoryMonitor {
  private memoryThreshold = 0.8; // 80% of heap
  private gcThreshold = 0.9; // 90% of heap
  
  startMonitoring(): void {
    setInterval(() => {
      this.checkMemoryUsage();
    }, 30000); // Check every 30 seconds
  }
  
  private checkMemoryUsage(): void {
    const usage = process.memoryUsage();
    const heapUsageRatio = usage.heapUsed / usage.heapTotal;
    
    this.logger.info('Memory usage', {
      heapUsed: this.formatBytes(usage.heapUsed),
      heapTotal: this.formatBytes(usage.heapTotal),
      heapUsageRatio: `${(heapUsageRatio * 100).toFixed(2)}%`,
      external: this.formatBytes(usage.external),
      rss: this.formatBytes(usage.rss),
    });
    
    if (heapUsageRatio > this.gcThreshold) {
      this.logger.warn('High memory usage detected, forcing garbage collection');
      if (global.gc) {
        global.gc();
      }
    } else if (heapUsageRatio > this.memoryThreshold) {
      this.logger.warn('Memory usage approaching threshold', {
        usage: heapUsageRatio,
        threshold: this.memoryThreshold,
      });
    }
  }
  
  private formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }
}
```

### Memory Leak Prevention

```typescript
// src/utils/leakDetector.ts
export class LeakDetector {
  private snapshots: MemorySnapshot[] = [];
  private maxSnapshots = 10;
  
  takeSnapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
    };
    
    this.snapshots.push(snapshot);
    
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
    
    return snapshot;
  }
  
  detectLeaks(): LeakReport | null {
    if (this.snapshots.length < 3) return null;
    
    const recent = this.snapshots.slice(-3);
    const growth = this.calculateGrowth(recent);
    
    if (growth.heapUsed > 0.1) { // 10% growth
      return {
        type: 'memory_leak',
        growth,
        recommendations: this.getRecommendations(growth),
      };
    }
    
    return null;
  }
  
  private calculateGrowth(snapshots: MemorySnapshot[]): GrowthMetrics {
    const first = snapshots[0];
    const last = snapshots[snapshots[snapshots.length - 1]];
    const timeSpan = last.timestamp - first.timestamp;
    
    return {
      heapUsed: (last.heapUsed - first.heapUsed) / first.heapUsed,
      heapTotal: (last.heapTotal - first.heapTotal) / first.heapTotal,
      external: (last.external - first.external) / first.external,
      timeSpan,
    };
  }
  
  private getRecommendations(growth: GrowthMetrics): string[] {
    const recommendations: string[] = [];
    
    if (growth.heapUsed > 0.2) {
      recommendations.push('Check for memory leaks in event listeners');
      recommendations.push('Review object lifecycle management');
    }
    
    if (growth.external > 0.2) {
      recommendations.push('Check for unclosed database connections');
      recommendations.push('Review file handle management');
    }
    
    return recommendations;
  }
}
```

## Caching Strategies

### Multi-Level Caching

```typescript
// src/utils/cacheManager.ts
export class CacheManager {
  private l1Cache = new Map<string, CacheEntry>(); // In-memory cache
  private l2Cache: RedisCache; // Redis cache
  private l1MaxSize = 1000;
  private l1Ttl = 5 * 60 * 1000; // 5 minutes
  private l2Ttl = 30 * 60 * 1000; // 30 minutes
  
  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.l2Cache = new RedisCache(redisUrl);
    }
  }
  
  async get<T>(key: string): Promise<T | null> {
    // Check L1 cache first
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry && !this.isExpired(l1Entry)) {
      return l1Entry.data as T;
    }
    
    // Check L2 cache
    if (this.l2Cache) {
      const l2Data = await this.l2Cache.get(key);
      if (l2Data) {
        // Populate L1 cache
        this.setL1(key, l2Data, this.l1Ttl);
        return l2Data as T;
      }
    }
    
    return null;
  }
  
  async set<T>(key: string, data: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs || this.l1Ttl;
    
    // Set in L1 cache
    this.setL1(key, data, ttl);
    
    // Set in L2 cache if available
    if (this.l2Cache) {
      await this.l2Cache.set(key, data, Math.min(ttl * 2, this.l2Ttl));
    }
  }
  
  private setL1<T>(key: string, data: T, ttlMs: number): void {
    if (this.l1Cache.size >= this.l1MaxSize) {
      this.evictL1();
    }
    
    this.l1Cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }
  
  private evictL1(): void {
    // Remove oldest entries
    const entries = Array.from(this.l1Cache.entries());
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    
    const toRemove = Math.floor(this.l1MaxSize * 0.2); // Remove 20%
    for (let i = 0; i < toRemove; i++) {
      this.l1Cache.delete(entries[i][0]);
    }
  }
  
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }
}
```

### Cache Invalidation

```typescript
// src/utils/cacheInvalidator.ts
export class CacheInvalidator {
  private cacheManager: CacheManager;
  private invalidationPatterns = new Map<string, string[]>();
  
  constructor(cacheManager: CacheManager) {
    this.cacheManager = cacheManager;
  }
  
  registerPattern(pattern: string, keys: string[]): void {
    this.invalidationPatterns.set(pattern, keys);
  }
  
  async invalidate(pattern: string): Promise<void> {
    const keys = this.invalidationPatterns.get(pattern) || [];
    
    await Promise.all(
      keys.map(key => this.cacheManager.delete(key))
    );
    
    this.logger.info('Cache invalidated', { pattern, keysCount: keys.length });
  }
  
  async invalidateByPrefix(prefix: string): Promise<void> {
    // This would require cache implementation to support prefix deletion
    if (this.cacheManager.deleteByPrefix) {
      await this.cacheManager.deleteByPrefix(prefix);
    }
  }
}

// Usage
const cacheInvalidator = new CacheInvalidator(cacheManager);

// Register invalidation patterns
cacheInvalidator.registerPattern('task:updated', [
  'tasks:board:{boardId}',
  'tasks:user:{userId}',
  'task:{taskId}',
]);

// Invalidate when task is updated
await cacheInvalidator.invalidate('task:updated');
```

## Monitoring & Profiling

### Performance Monitoring

```typescript
// src/utils/performanceMonitor.ts
export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    apiResponseTime: { p50: 0, p95: 0, p99: 0 },
    databaseQueryTime: { average: 0, max: 0, slowQueries: 0 },
    memoryUsage: { heapUsed: 0, heapTotal: 0, external: 0 },
    websocketLatency: { average: 0, max: 0 },
    cpuUsage: 0,
    activeConnections: 0,
    requestsPerSecond: 0,
  };
  
  private responseTimes: number[] = [];
  private queryTimes: number[] = [];
  private websocketLatencies: number[] = [];
  private requestCount = 0;
  private lastRequestCount = 0;
  private lastRequestTime = Date.now();
  
  startMonitoring(): void {
    // Update metrics every 30 seconds
    setInterval(() => {
      this.updateMetrics();
    }, 30000);
    
    // Log metrics every 5 minutes
    setInterval(() => {
      this.logMetrics();
    }, 300000);
  }
  
  recordApiResponse(duration: number): void {
    this.responseTimes.push(duration);
    this.requestCount++;
    
    // Keep only last 1000 response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes.shift();
    }
  }
  
  recordDatabaseQuery(duration: number): void {
    this.queryTimes.push(duration);
    
    if (this.queryTimes.length > 1000) {
      this.queryTimes.shift();
    }
  }
  
  recordWebSocketLatency(latency: number): void {
    this.websocketLatencies.push(latency);
    
    if (this.websocketLatencies.length > 1000) {
      this.websocketLatencies.shift();
    }
  }
  
  private updateMetrics(): void {
    // Update API response time percentiles
    if (this.responseTimes.length > 0) {
      const sorted = [...this.responseTimes].sort((a, b) => a - b);
      this.metrics.apiResponseTime.p50 = this.getPercentile(sorted, 50);
      this.metrics.apiResponseTime.p95 = this.getPercentile(sorted, 95);
      this.metrics.apiResponseTime.p99 = this.getPercentile(sorted, 99);
    }
    
    // Update database query metrics
    if (this.queryTimes.length > 0) {
      this.metrics.databaseQueryTime.average = 
        this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
      this.metrics.databaseQueryTime.max = Math.max(...this.queryTimes);
      this.metrics.databaseQueryTime.slowQueries = 
        this.queryTimes.filter(t => t > 100).length;
    }
    
    // Update WebSocket latency
    if (this.websocketLatencies.length > 0) {
      this.metrics.websocketLatency.average = 
        this.websocketLatencies.reduce((a, b) => a + b, 0) / this.websocketLatencies.length;
      this.metrics.websocketLatency.max = Math.max(...this.websocketLatencies);
    }
    
    // Update memory usage
    const usage = process.memoryUsage();
    this.metrics.memoryUsage = {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
    };
    
    // Update requests per second
    const now = Date.now();
    const timeSpan = (now - this.lastRequestTime) / 1000;
    this.metrics.requestsPerSecond = 
      (this.requestCount - this.lastRequestCount) / timeSpan;
    
    this.lastRequestCount = this.requestCount;
    this.lastRequestTime = now;
  }
  
  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }
  
  private logMetrics(): void {
    this.logger.info('Performance metrics', this.metrics);
  }
  
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
}
```

### Profiling

```typescript
// src/utils/profiler.ts
export class Profiler {
  private profiles = new Map<string, ProfileData>();
  
  startProfile(name: string): void {
    const profile: ProfileData = {
      name,
      startTime: process.hrtime.bigint(),
      measurements: [],
    };
    
    this.profiles.set(name, profile);
  }
  
  endProfile(name: string): ProfileData | null {
    const profile = this.profiles.get(name);
    if (!profile) return null;
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - profile.startTime) / 1000000; // Convert to ms
    
    profile.duration = duration;
    profile.endTime = endTime;
    
    this.profiles.delete(name);
    
    this.logger.debug('Profile completed', {
      name,
      duration: `${duration.toFixed(2)}ms`,
    });
    
    return profile;
  }
  
  measure(name: string, fn: () => Promise<any>): Promise<any> {
    this.startProfile(name);
    
    return fn().finally(() => {
      this.endProfile(name);
    });
  }
  
  async measureSync(name: string, fn: () => any): Promise<any> {
    this.startProfile(name);
    
    try {
      return fn();
    } finally {
      this.endProfile(name);
    }
  }
}

// Usage
const profiler = new Profiler();

// Profile async operations
const result = await profiler.measure('database-query', async () => {
  return await database.query('SELECT * FROM tasks');
});

// Profile sync operations
const data = profiler.measureSync('data-processing', () => {
  return processData(rawData);
});
```

## Performance Testing

### Load Testing

```typescript
// tests/performance/load.test.ts
import { createTestServer } from '../utils/testServer';
import { loadTest } from '../utils/loadTest';

describe('API Performance', () => {
  let server: TestServer;
  
  beforeAll(async () => {
    server = await createTestServer();
  });
  
  afterAll(async () => {
    await server.close();
  });
  
  it('should handle 100 concurrent users', async () => {
    const results = await loadTest({
      url: 'http://localhost:3000/api/tasks',
      method: 'GET',
      headers: { 'Authorization': 'Bearer test-token' },
      concurrency: 100,
      duration: 60000, // 1 minute
      rampUp: 10000, // 10 seconds
    });
    
    expect(results.avgResponseTime).toBeLessThan(200);
    expect(results.p95ResponseTime).toBeLessThan(500);
    expect(results.errorRate).toBeLessThan(0.01); // 1% error rate
  });
  
  it('should handle bulk task creation', async () => {
    const tasks = Array.from({ length: 100 }, (_, i) => ({
      title: `Task ${i}`,
      description: `Description for task ${i}`,
      board_id: 'test-board',
    }));
    
    const startTime = Date.now();
    const response = await server.request('POST', '/api/tasks/batch', { tasks });
    const duration = Date.now() - startTime;
    
    expect(response.status).toBe(201);
    expect(duration).toBeLessThan(5000); // 5 seconds
    expect(response.body).toHaveLength(100);
  });
});
```

### Database Performance Testing

```typescript
// tests/performance/database.test.ts
import { DatabaseConnection } from '@/database/connection';

describe('Database Performance', () => {
  let db: DatabaseConnection;
  
  beforeAll(async () => {
    db = new DatabaseConnection(':memory:');
    await db.initialize();
  });
  
  afterAll(async () => {
    await db.close();
  });
  
  it('should handle large result sets efficiently', async () => {
    // Insert test data
    const tasks = Array.from({ length: 10000 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i}`,
      board_id: 'test-board',
      status: 'todo',
    }));
    
    await db.transaction(async (tx) => {
      for (const task of tasks) {
        await tx.run(
          'INSERT INTO tasks (id, title, board_id, status) VALUES (?, ?, ?, ?)',
          [task.id, task.title, task.board_id, task.status]
        );
      }
    });
    
    // Test query performance
    const startTime = Date.now();
    const results = await db.query(
      'SELECT * FROM tasks WHERE board_id = ? ORDER BY created_at DESC LIMIT 1000',
      ['test-board']
    );
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(100); // 100ms
    expect(results).toHaveLength(1000);
  });
  
  it('should handle concurrent writes', async () => {
    const concurrency = 50;
    const tasksPerThread = 100;
    
    const startTime = Date.now();
    
    await Promise.all(
      Array.from({ length: concurrency }, async (_, threadId) => {
        for (let i = 0; i < tasksPerThread; i++) {
          await db.run(
            'INSERT INTO tasks (id, title, board_id) VALUES (?, ?, ?)',
            [`task-${threadId}-${i}`, `Task ${threadId}-${i}`, 'test-board']
          );
        }
      })
    );
    
    const duration = Date.now() - startTime;
    const totalTasks = concurrency * tasksPerThread;
    
    expect(duration).toBeLessThan(10000); // 10 seconds
    expect(duration / totalTasks).toBeLessThan(2); // 2ms per task
  });
});
```

## Production Optimization

### Node.js Optimization

```typescript
// src/config/production.ts
export const productionConfig = {
  // Enable all optimizations
  node: {
    // Increase heap size
    maxOldSpaceSize: 2048, // 2GB
    
    // Enable garbage collection optimization
    gcInterval: 100,
    
    // Optimize for performance
    optimizeForSize: false,
  },
  
  // Database optimization
  database: {
    // Use WAL mode
    journalMode: 'WAL',
    
    // Optimize cache
    cacheSize: -64000, // 64MB
    tempStore: 'memory',
    mmapSize: 268435456, // 256MB
    
    // Optimize for performance
    synchronous: 'NORMAL',
    busyTimeout: 30000,
  },
  
  // API optimization
  api: {
    // Enable compression
    compression: true,
    
    // Enable caching
    caching: true,
    
    // Rate limiting
    rateLimit: {
      windowMs: 60000,
      maxRequests: 1000,
    },
  },
  
  // WebSocket optimization
  websocket: {
    // Connection limits
    maxConnections: 1000,
    
    // Heartbeat interval
    heartbeatInterval: 30000,
    
    // Message batching
    batchSize: 10,
    batchTimeout: 100,
  },
};
```

### Monitoring Setup

```typescript
// src/monitoring/index.ts
import { PerformanceMonitor } from '@/utils/performanceMonitor';
import { MemoryMonitor } from '@/utils/memoryMonitor';
import { LeakDetector } from '@/utils/leakDetector';

export class MonitoringSystem {
  private performanceMonitor: PerformanceMonitor;
  private memoryMonitor: MemoryMonitor;
  private leakDetector: LeakDetector;
  
  constructor() {
    this.performanceMonitor = new PerformanceMonitor();
    this.memoryMonitor = new MemoryMonitor();
    this.leakDetector = new LeakDetector();
  }
  
  start(): void {
    // Start performance monitoring
    this.performanceMonitor.startMonitoring();
    
    // Start memory monitoring
    this.memoryMonitor.startMonitoring();
    
    // Start leak detection
    setInterval(() => {
      this.leakDetector.takeSnapshot();
      
      const leakReport = this.leakDetector.detectLeaks();
      if (leakReport) {
        this.logger.warn('Memory leak detected', leakReport);
      }
    }, 300000); // Every 5 minutes
    
    // Export metrics for external monitoring
    this.setupMetricsExport();
  }
  
  private setupMetricsExport(): void {
    // Expose metrics endpoint
    app.get('/metrics', (req, res) => {
      const metrics = {
        performance: this.performanceMonitor.getMetrics(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: Date.now(),
      };
      
      res.json(metrics);
    });
  }
}
```

This performance tuning guide provides comprehensive strategies for optimizing the MCP Kanban system. For specific optimization scenarios or additional guidance, refer to the [Performance Best Practices](../best-practices/performance.md) and [Monitoring Guide](../guides/monitoring.md). 