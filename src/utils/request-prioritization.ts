/* eslint-disable max-classes-per-file */
/**
 * @fileoverview Request prioritization and scheduling system for batching
 * @lastmodified 2025-07-28T08:55:00Z
 *
 * Features: Priority queues, request scheduling, load balancing, fairness algorithms
 * Main APIs: RequestScheduler, PriorityQueue, LoadBalancer, FairnessManager
 * Constraints: Requires careful priority assignment, queue management
 * Patterns: Priority queue with heap, round-robin scheduling, weighted fair queuing
 */

import { logger } from './logger';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface PriorityRequest {
  id: string;
  priority: number; // Lower number = higher priority (1 = highest, 10 = lowest)
  timestamp: number;
  estimatedProcessingTime: number;
  clientId?: string;
  requestType: string;
  weight: number;
  retryCount: number;
  maxRetries: number;
  data: unknown;
}

export interface SchedulingConfig {
  maxQueueSize: number;
  defaultPriority: number;
  enableFairness: boolean;
  fairnessWindowMs: number;
  enableLoadBalancing: boolean;
  maxProcessingTime: number;
  priorityLevels: number;
  enableStarvationPrevention: boolean;
  starvationThreshold: number; // milliseconds
}

export interface SchedulingStats {
  totalRequests: number;
  processedRequests: number;
  averageWaitTime: number;
  averageProcessingTime: number;
  priorityDistribution: Record<number, number>;
  clientFairness: Record<string, number>;
  starvationEvents: number;
  queueOverflows: number;
}

export interface ClientQuota {
  clientId: string;
  maxConcurrentRequests: number;
  currentRequests: number;
  requestsProcessed: number;
  totalWaitTime: number;
  lastRequestTime: number;
}

// ============================================================================
// PRIORITY QUEUE IMPLEMENTATION
// ============================================================================

export class PriorityQueue {
  private heap: PriorityRequest[] = [];

  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Add request to priority queue
   */
  enqueue(request: PriorityRequest): boolean {
    if (this.heap.length >= this.maxSize) {
      logger.warn('Priority queue full, rejecting request', {
        requestId: request.id,
        queueSize: this.heap.length,
      });
      return false;
    }

    this.heap.push(request);
    this.heapifyUp(this.heap.length - 1);
    return true;
  }

  /**
   * Remove and return highest priority request
   */
  dequeue(): PriorityRequest | null {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop()!;

    const root = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.heapifyDown(0);

    return root;
  }

  /**
   * Peek at highest priority request without removing
   */
  peek(): PriorityRequest | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Clear all requests
   */
  clear(): void {
    this.heap = [];
  }

  /**
   * Get all requests (for debugging)
   */
  getAll(): PriorityRequest[] {
    return [...this.heap];
  }

  /**
   * Move element up the heap to maintain priority order
   */
  private heapifyUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);

      if (this.compareRequests(this.heap[index], this.heap[parentIndex]) >= 0) {
        break;
      }

      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  /**
   * Move element down the heap to maintain priority order
   */
  private heapifyDown(index: number): void {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < this.heap.length &&
        this.compareRequests(this.heap[leftChild], this.heap[smallest]) < 0
      ) {
        smallest = leftChild;
      }

      if (
        rightChild < this.heap.length &&
        this.compareRequests(this.heap[rightChild], this.heap[smallest]) < 0
      ) {
        smallest = rightChild;
      }

      if (smallest === index) break;

      this.swap(index, smallest);
      index = smallest;
    }
  }

  /**
   * Compare two requests for priority ordering
   */
  private compareRequests(a: PriorityRequest, b: PriorityRequest): number {
    // Primary: Priority (lower number = higher priority)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    // Secondary: Age (older requests get priority to prevent starvation)
    return a.timestamp - b.timestamp;
  }

  /**
   * Swap two elements in the heap
   */
  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }
}

// ============================================================================
// FAIRNESS MANAGER
// ============================================================================

export class FairnessManager {
  private readonly clientQuotas = new Map<string, ClientQuota>();

  private readonly config: SchedulingConfig;

  private readonly stats: SchedulingStats;

  constructor(config: SchedulingConfig, stats: SchedulingStats) {
    this.config = config;
    this.stats = stats;
  }

  /**
   * Initialize client quota if not exists
   */
  initializeClientQuota(clientId: string): void {
    if (!this.clientQuotas.has(clientId)) {
      this.clientQuotas.set(clientId, {
        clientId,
        maxConcurrentRequests: 10, // Default limit
        currentRequests: 0,
        requestsProcessed: 0,
        totalWaitTime: 0,
        lastRequestTime: 0,
      });
    }
  }

  /**
   * Check if client can make a request based on fairness
   */
  canClientMakeRequest(clientId: string): boolean {
    if (!this.config.enableFairness) return true;

    this.initializeClientQuota(clientId);
    const quota = this.clientQuotas.get(clientId)!;

    // Check concurrent request limit
    if (quota.currentRequests >= quota.maxConcurrentRequests) {
      return false;
    }

    // Check if client is being rate limited for fairness
    const now = Date.now();
    const timeSinceLastRequest = now - quota.lastRequestTime;

    // Calculate dynamic rate limit based on client's recent activity
    const averageProcessingTime = this.stats.averageProcessingTime || 100;
    const minimumInterval = Math.max(averageProcessingTime * 0.1, 10);

    return timeSinceLastRequest >= minimumInterval;
  }

  /**
   * Record request start for client
   */
  recordRequestStart(clientId: string): void {
    this.initializeClientQuota(clientId);
    const quota = this.clientQuotas.get(clientId)!;

    quota.currentRequests++;
    quota.lastRequestTime = Date.now();
  }

  /**
   * Record request completion for client
   */
  recordRequestCompletion(clientId: string, waitTime: number): void {
    const quota = this.clientQuotas.get(clientId);
    if (!quota) return;

    quota.currentRequests = Math.max(0, quota.currentRequests - 1);
    quota.requestsProcessed++;
    quota.totalWaitTime += waitTime;

    // Update client fairness stats
    this.stats.clientFairness[clientId] = quota.totalWaitTime / quota.requestsProcessed;
  }

  /**
   * Adjust request priority based on fairness
   */
  adjustPriorityForFairness(request: PriorityRequest): number {
    if (!this.config.enableFairness || !request.clientId) {
      return request.priority;
    }

    this.initializeClientQuota(request.clientId);
    const quota = this.clientQuotas.get(request.clientId)!;

    // Give priority boost to clients with fewer processed requests
    const totalProcessed = this.stats.processedRequests;
    const clientShare = totalProcessed > 0 ? quota.requestsProcessed / totalProcessed : 0;
    const expectedShare = 1 / this.clientQuotas.size;

    // If client has less than expected share, boost priority
    if (clientShare < expectedShare * 0.8) {
      return Math.max(1, request.priority - 1);
    }

    // If client has more than expected share, reduce priority
    if (clientShare > expectedShare * 1.2) {
      return Math.min(10, request.priority + 1);
    }

    return request.priority;
  }

  /**
   * Get client quotas
   */
  getClientQuotas(): Map<string, ClientQuota> {
    return new Map(this.clientQuotas);
  }

  /**
   * Update client quota limits
   */
  updateClientQuota(clientId: string, maxConcurrentRequests: number): void {
    this.initializeClientQuota(clientId);
    const quota = this.clientQuotas.get(clientId)!;
    quota.maxConcurrentRequests = maxConcurrentRequests;
  }

  /**
   * Clear old client data
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [clientId, quota] of this.clientQuotas) {
      if (now - quota.lastRequestTime > maxAge && quota.currentRequests === 0) {
        this.clientQuotas.delete(clientId);
      }
    }
  }
}

// ============================================================================
// LOAD BALANCER
// ============================================================================

export class LoadBalancer {
  private readonly processingQueues: PriorityQueue[] = [];

  private currentQueueIndex = 0;

  private queueWeights: number[] = [];

  constructor(numQueues = 3) {
    for (let i = 0; i < numQueues; i++) {
      this.processingQueues.push(new PriorityQueue());
      this.queueWeights.push(1.0); // Equal weights initially
    }
  }

  /**
   * Select best queue for request based on load balancing
   */
  selectQueue(request: PriorityRequest): number {
    if (!request.clientId) {
      return this.selectByRoundRobin();
    }

    // Use consistent hashing for client stickiness
    const hash = this.hashClientId(request.clientId);
    return hash % this.processingQueues.length;
  }

  /**
   * Get queue with least load
   */
  selectLeastLoadedQueue(): number {
    let minLoad = Infinity;
    let selectedQueue = 0;

    for (let i = 0; i < this.processingQueues.length; i++) {
      const load = this.processingQueues[i].size() / this.queueWeights[i];
      if (load < minLoad) {
        minLoad = load;
        selectedQueue = i;
      }
    }

    return selectedQueue;
  }

  /**
   * Round-robin queue selection
   */
  private selectByRoundRobin(): number {
    const selected = this.currentQueueIndex;
    this.currentQueueIndex = (this.currentQueueIndex + 1) % this.processingQueues.length;
    return selected;
  }

  /**
   * Hash client ID for consistent assignment
   */
  private hashClientId(clientId: string): number {
    let hash = 0;
    for (let i = 0; i < clientId.length; i++) {
      const char = clientId.charCodeAt(i);
      hash = (hash << 5) - hash + char; // eslint-disable-line no-bitwise
      hash &= hash; // eslint-disable-line no-bitwise
    }
    return Math.abs(hash);
  }

  /**
   * Get all queues
   */
  getQueues(): PriorityQueue[] {
    return this.processingQueues;
  }

  /**
   * Update queue weights for load balancing
   */
  updateQueueWeights(weights: number[]): void {
    if (weights.length === this.queueWeights.length) {
      this.queueWeights = [...weights];
    }
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): Array<{ index: number; size: number; weight: number }> {
    return this.processingQueues.map((queue, index) => ({
      index,
      size: queue.size(),
      weight: this.queueWeights[index],
    }));
  }
}

// ============================================================================
// MAIN REQUEST SCHEDULER
// ============================================================================

export class RequestScheduler {
  private config: SchedulingConfig;

  private stats: SchedulingStats;

  private readonly fairnessManager: FairnessManager;

  private readonly loadBalancer: LoadBalancer;

  private readonly starvationPrevention: Map<string, number> = new Map();

  constructor(config: Partial<SchedulingConfig> = {}) {
    this.config = {
      maxQueueSize: 1000,
      defaultPriority: 5,
      enableFairness: true,
      fairnessWindowMs: 60000, // 1 minute
      enableLoadBalancing: true,
      maxProcessingTime: 30000, // 30 seconds
      priorityLevels: 10,
      enableStarvationPrevention: true,
      starvationThreshold: 10000, // 10 seconds
      ...config,
    };

    this.stats = {
      totalRequests: 0,
      processedRequests: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0,
      priorityDistribution: {},
      clientFairness: {},
      starvationEvents: 0,
      queueOverflows: 0,
    };

    this.fairnessManager = new FairnessManager(this.config, this.stats);
    this.loadBalancer = new LoadBalancer();

    // Start background tasks
    this.startBackgroundTasks();
  }

  /**
   * Schedule a request for processing
   */
  scheduleRequest(
    id: string,
    data: unknown,
    options: {
      priority?: number;
      clientId?: string;
      requestType?: string;
      estimatedProcessingTime?: number;
      weight?: number;
    } = {}
  ): boolean {
    const request: PriorityRequest = {
      id,
      priority: options.priority ?? this.config.defaultPriority,
      timestamp: Date.now(),
      estimatedProcessingTime: options.estimatedProcessingTime ?? 1000,
      clientId: options.clientId,
      requestType: options.requestType ?? 'unknown',
      weight: options.weight ?? 1.0,
      retryCount: 0,
      maxRetries: 3,
      data,
    };

    // Check fairness constraints
    if (request.clientId && !this.fairnessManager.canClientMakeRequest(request.clientId)) {
      logger.warn('Request rejected due to fairness constraints', {
        requestId: request.id,
        clientId: request.clientId,
      });
      return false;
    }

    // Adjust priority for fairness
    request.priority = this.fairnessManager.adjustPriorityForFairness(request);

    // Apply starvation prevention
    if (this.config.enableStarvationPrevention) {
      this.applyStarvationPrevention(request);
    }

    // Select appropriate queue
    const queueIndex = this.config.enableLoadBalancing ? this.loadBalancer.selectQueue(request) : 0;

    const queue = this.loadBalancer.getQueues()[queueIndex];
    const success = queue.enqueue(request);

    if (success) {
      this.updateStats(request, 'enqueued');

      if (request.clientId) {
        this.fairnessManager.recordRequestStart(request.clientId);
      }

      logger.debug('Request scheduled', {
        requestId: request.id,
        priority: request.priority,
        queueIndex,
        queueSize: queue.size(),
      });
    } else {
      this.stats.queueOverflows++;
      logger.warn('Failed to schedule request - queue full', {
        requestId: request.id,
        queueIndex,
      });
    }

    return success;
  }

  /**
   * Get next request to process
   */
  getNextRequest(): PriorityRequest | null {
    // Try to get request from least loaded queue
    const queueIndex = this.loadBalancer.selectLeastLoadedQueue();
    const queue = this.loadBalancer.getQueues()[queueIndex];

    const request = queue.dequeue();

    if (request) {
      this.updateStats(request, 'dequeued');

      // Record starvation prevention
      const waitTime = Date.now() - request.timestamp;
      if (waitTime > this.config.starvationThreshold) {
        this.stats.starvationEvents++;
        logger.warn('Request experienced starvation', {
          requestId: request.id,
          waitTime,
          priority: request.priority,
        });
      }
    }

    return request;
  }

  /**
   * Complete request processing
   */
  completeRequest(request: PriorityRequest, success = true): void {
    const now = Date.now();
    const waitTime = now - request.timestamp;

    this.updateStats(request, 'completed', waitTime);

    if (request.clientId) {
      this.fairnessManager.recordRequestCompletion(request.clientId, waitTime);
    }

    // Remove from starvation prevention tracking
    this.starvationPrevention.delete(request.id);

    logger.debug('Request completed', {
      requestId: request.id,
      success,
      waitTime,
      priority: request.priority,
    });
  }

  /**
   * Apply starvation prevention logic
   */
  private applyStarvationPrevention(request: PriorityRequest): void {
    this.starvationPrevention.set(request.id, request.timestamp);

    // Check for starving requests and boost their priority
    const now = Date.now();
    for (const [requestId, timestamp] of this.starvationPrevention) {
      if (now - timestamp > this.config.starvationThreshold) {
        // Find and boost priority of starving requests
        this.boostStarvingRequestPriority(requestId);
      }
    }
  }

  /**
   * Boost priority of starving requests
   */
  private boostStarvingRequestPriority(requestId: string): void {
    for (const queue of this.loadBalancer.getQueues()) {
      const requests = queue.getAll();
      const starvingRequest = requests.find(req => req.id === requestId);

      if (starvingRequest && starvingRequest.priority > 1) {
        starvingRequest.priority = Math.max(1, starvingRequest.priority - 2);
        logger.info('Boosted priority for starving request', {
          requestId,
          newPriority: starvingRequest.priority,
        });
        break;
      }
    }
  }

  /**
   * Update statistics
   */
  private updateStats(
    request: PriorityRequest,
    action: 'enqueued' | 'dequeued' | 'completed',
    waitTime?: number
  ): void {
    switch (action) {
      case 'enqueued':
        this.stats.totalRequests++;
        this.stats.priorityDistribution[request.priority] =
          (this.stats.priorityDistribution[request.priority] ?? 0) + 1;
        break;

      case 'completed':
        this.stats.processedRequests++;
        if (waitTime !== undefined) {
          // Update average wait time
          const totalProcessed = this.stats.processedRequests;
          this.stats.averageWaitTime =
            (this.stats.averageWaitTime * (totalProcessed - 1) + waitTime) / totalProcessed;
        }
        break;

      default:
        break;
    }
  }

  /**
   * Start background maintenance tasks
   */
  private startBackgroundTasks(): void {
    // Cleanup task - runs every minute
    setInterval(() => {
      this.fairnessManager.cleanup();
      this.cleanupStarvationTracking();
    }, 60000);

    // Stats reporting - runs every 5 minutes
    setInterval(() => {
      this.logQueueStats();
    }, 300000);
  }

  /**
   * Clean up old starvation tracking entries
   */
  private cleanupStarvationTracking(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [requestId, timestamp] of this.starvationPrevention) {
      if (now - timestamp > maxAge) {
        this.starvationPrevention.delete(requestId);
      }
    }
  }

  /**
   * Log queue statistics
   */
  private logQueueStats(): void {
    const queueStats = this.loadBalancer.getQueueStats();
    const totalQueueSize = queueStats.reduce((sum, stat) => sum + stat.size, 0);

    logger.info('Queue statistics', {
      totalQueueSize,
      queueStats,
      totalRequests: this.stats.totalRequests,
      processedRequests: this.stats.processedRequests,
      averageWaitTime: this.stats.averageWaitTime,
      starvationEvents: this.stats.starvationEvents,
    });
  }

  /**
   * Get current statistics
   */
  getStats(): SchedulingStats {
    return { ...this.stats };
  }

  /**
   * Get queue information
   */
  getQueueInfo(): Array<{ index: number; size: number; weight: number }> {
    return this.loadBalancer.getQueueStats();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SchedulingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Scheduler configuration updated', { config: this.config });
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      processedRequests: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0,
      priorityDistribution: {},
      clientFairness: {},
      starvationEvents: 0,
      queueOverflows: 0,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const requestScheduler = new RequestScheduler({
  maxQueueSize: 500,
  defaultPriority: 5,
  enableFairness: true,
  enableLoadBalancing: true,
  enableStarvationPrevention: true,
  starvationThreshold: 5000, // 5 seconds
});

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Schedule a high priority request
 */
export const scheduleHighPriority = (id: string, data: unknown, clientId?: string): boolean =>
  requestScheduler.scheduleRequest(id, data, {
    priority: 1,
    clientId,
    requestType: 'high-priority',
  });

/**
 * Schedule a low priority request
 */
export const scheduleLowPriority = (id: string, data: unknown, clientId?: string): boolean =>
  requestScheduler.scheduleRequest(id, data, {
    priority: 8,
    clientId,
    requestType: 'low-priority',
  });

/**
 * Get scheduling statistics
 */
export const getSchedulingStats = (): SchedulingStats => requestScheduler.getStats();
