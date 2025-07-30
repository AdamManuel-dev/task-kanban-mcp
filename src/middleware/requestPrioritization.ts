/**
 * @fileoverview Request prioritization and scheduling middleware
 * @lastmodified 2025-07-28T13:00:00Z
 *
 * Features: Request priority levels, queue management, load balancing, resource allocation
 * Main APIs: priorityMiddleware(), scheduleRequest(), PriorityQueue class
 * Constraints: Requires memory management, fair scheduling, performance monitoring
 * Patterns: Priority queue, round-robin scheduling, resource throttling, backpressure handling
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export enum RequestPriority {
  CRITICAL = 0, // System health, security alerts
  HIGH = 1, // User actions, real-time updates
  NORMAL = 2, // Standard API requests
  LOW = 3, // Background tasks, analytics
  BACKGROUND = 4, // Cleanup, maintenance
}

export interface PriorityRequest {
  id: string;
  priority: RequestPriority;
  timestamp: number;
  req: Request;
  res: Response;
  next: NextFunction;
  timeoutId?: NodeJS.Timeout;
  retryCount: number;
  maxRetries: number;
}

export interface SchedulingConfig {
  maxConcurrentRequests: number;
  maxQueueSize: number;
  requestTimeoutMs: number;
  priorityWeights: Record<RequestPriority, number>;
  enableBackpressure: boolean;
  fairSchedulingEnabled: boolean;
}

export interface SchedulingStats {
  totalRequests: number;
  processedRequests: number;
  queuedRequests: number;
  droppedRequests: number;
  averageWaitTime: number;
  averageProcessingTime: number;
  priorityDistribution: Record<RequestPriority, number>;
}

export class PriorityQueue {
  private readonly queues: Map<RequestPriority, PriorityRequest[]> = new Map();

  private readonly processing: Set<string> = new Set();

  private stats: SchedulingStats;

  private readonly config: SchedulingConfig;

  private readonly fairnessCounters: Map<RequestPriority, number> = new Map();

  constructor(config: Partial<SchedulingConfig> = {}) {
    this.config = {
      maxConcurrentRequests: 50,
      maxQueueSize: 200,
      requestTimeoutMs: 30000, // 30 seconds
      priorityWeights: {
        [RequestPriority.CRITICAL]: 10,
        [RequestPriority.HIGH]: 5,
        [RequestPriority.NORMAL]: 3,
        [RequestPriority.LOW]: 2,
        [RequestPriority.BACKGROUND]: 1,
      },
      enableBackpressure: true,
      fairSchedulingEnabled: true,
      ...config,
    };

    this.stats = {
      totalRequests: 0,
      processedRequests: 0,
      queuedRequests: 0,
      droppedRequests: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0,
      priorityDistribution: Object.values(RequestPriority).reduce(
        (acc, priority) => {
          if (typeof priority === 'number') acc[priority] = 0;
          return acc;
        },
        {} as Record<RequestPriority, number>
      ),
    };

    // Initialize queues
    Object.values(RequestPriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.queues.set(priority, []);
        this.fairnessCounters.set(priority, 0);
      }
    });

    logger.info('PriorityQueue initialized', { config: this.config });
  }

  /**
   * Add request to priority queue
   */
  enqueue(request: PriorityRequest): boolean {
    const queue = this.queues.get(request.priority);
    if (!queue) {
      logger.error('Invalid priority level', { priority: request.priority });
      return false;
    }

    // Check queue capacity
    const totalQueueSize = this.getTotalQueueSize();
    if (totalQueueSize >= this.config.maxQueueSize) {
      if (this.config.enableBackpressure) {
        // Drop lowest priority requests to make room
        if (!this.makeRoom(request.priority)) {
          logger.warn('Queue full, dropping request', {
            requestId: request.id,
            priority: request.priority,
          });
          this.stats.droppedRequests++;
          return false;
        }
      } else {
        logger.warn('Queue full, rejecting request', {
          requestId: request.id,
          priority: request.priority,
        });
        this.stats.droppedRequests++;
        return false;
      }
    }

    // Set timeout for request
    request.timeoutId = setTimeout(() => {
      this.timeoutRequest(request.id);
    }, this.config.requestTimeoutMs);

    // Add to appropriate priority queue
    queue.push(request);
    this.stats.totalRequests++;
    this.stats.queuedRequests++;
    this.stats.priorityDistribution[request.priority]++;

    logger.debug('Request enqueued', {
      requestId: request.id,
      priority: request.priority,
      queueSize: queue.length,
    });

    // Try to process immediately if capacity available
    setImmediate(() => this.processNext());

    return true;
  }

  /**
   * Get next request to process using weighted fair scheduling
   */
  dequeue(): PriorityRequest | null {
    if (this.processing.size >= this.config.maxConcurrentRequests) {
      return null;
    }

    let selectedRequest: PriorityRequest | null = null;
    let selectedPriority: RequestPriority | null = null;

    if (this.config.fairSchedulingEnabled) {
      // Fair scheduling with priority weights
      selectedPriority = this.selectPriorityFairly();
    } else {
      // Simple priority-based selection
      selectedPriority = this.selectPriorityByWeight();
    }

    if (selectedPriority !== null) {
      const queue = this.queues.get(selectedPriority);
      if (queue && queue.length > 0) {
        selectedRequest = queue.shift()!;
        this.fairnessCounters.set(
          selectedPriority,
          (this.fairnessCounters.get(selectedPriority) ?? 0) + 1
        );
      }
    }

    if (selectedRequest) {
      this.processing.add(selectedRequest.id);
      this.stats.queuedRequests--;

      // Clear timeout since we're processing now
      if (selectedRequest.timeoutId) {
        clearTimeout(selectedRequest.timeoutId);
        selectedRequest.timeoutId = undefined;
      }

      logger.debug('Request dequeued for processing', {
        requestId: selectedRequest.id,
        priority: selectedRequest.priority,
      });
    }

    return selectedRequest;
  }

  /**
   * Mark request as completed
   */
  complete(requestId: string, processingTime: number): void {
    this.processing.delete(requestId);
    this.stats.processedRequests++;

    // Update average processing time
    const currentAvg = this.stats.averageProcessingTime;
    const totalProcessed = this.stats.processedRequests;
    this.stats.averageProcessingTime =
      (currentAvg * (totalProcessed - 1) + processingTime) / totalProcessed;

    logger.debug('Request completed', { requestId, processingTime });

    // Process next request
    setImmediate(() => this.processNext());
  }

  /**
   * Process next available request
   */
  private processNext(): void {
    const request = this.dequeue();
    if (!request) return;

    const startTime = Date.now();
    const waitTime = startTime - request.timestamp;

    // Update average wait time
    const currentWaitAvg = this.stats.averageWaitTime;
    const totalProcessed = this.stats.processedRequests + 1;
    this.stats.averageWaitTime =
      (currentWaitAvg * (totalProcessed - 1) + waitTime) / totalProcessed;

    // Execute the request
    const originalEnd = request.res.end;
    const self = this;

    request.res.end = function (
      this: Response,
      chunk?: unknown,
      encoding?: BufferEncoding | (() => void),
      cb?: () => void
    ) {
      const processingTime = Date.now() - startTime;
      self.complete(request.id, processingTime);
      return originalEnd.call(this, chunk, encoding as BufferEncoding, cb);
    };

    // Set priority header for monitoring
    request.res.setHeader('X-Request-Priority', request.priority);
    request.res.setHeader('X-Queue-Wait-Time', waitTime);

    try {
      request.next();
    } catch (error) {
      logger.error('Error processing request', {
        requestId: request.id,
        error,
      });
      this.complete(request.id, Date.now() - startTime);
    }
  }

  /**
   * Select priority level using fair scheduling
   */
  private selectPriorityFairly(): RequestPriority | null {
    // Calculate weighted selection based on priority and fairness
    const priorities = Array.from(this.queues.keys()).filter(priority => {
      const queue = this.queues.get(priority);
      return queue && queue.length > 0;
    });

    if (priorities.length === 0) return null;

    // Sort by fairness score (weight / processed_count)
    priorities.sort((a, b) => {
      const aWeight = this.config.priorityWeights[a];
      const aProcessed = this.fairnessCounters.get(a) ?? 1;
      const aScore = aWeight / aProcessed;

      const bWeight = this.config.priorityWeights[b];
      const bProcessed = this.fairnessCounters.get(b) ?? 1;
      const bScore = bWeight / bProcessed;

      return bScore - aScore; // Higher score first
    });

    return priorities[0];
  }

  /**
   * Select priority level by weight only
   */
  private selectPriorityByWeight(): RequestPriority | null {
    const priorities = Array.from(this.queues.keys()).filter(priority => {
      const queue = this.queues.get(priority);
      return queue && queue.length > 0;
    });

    if (priorities.length === 0) return null;

    // Sort by priority (lower number = higher priority)
    priorities.sort((a, b) => a - b);
    return priorities[0];
  }

  /**
   * Make room in queue by dropping lowest priority requests
   */
  private makeRoom(newRequestPriority: RequestPriority): boolean {
    // Find lowest priority queue with requests
    const priorities = Array.from(this.queues.keys())
      .filter(priority => {
        const queue = this.queues.get(priority);
        return queue && queue.length > 0;
      })
      .sort((a, b) => b - a); // Highest number (lowest priority) first

    for (const priority of priorities) {
      if (priority > newRequestPriority) {
        const queue = this.queues.get(priority)!;
        const droppedRequest = queue.pop();
        if (droppedRequest) {
          if (droppedRequest.timeoutId) {
            clearTimeout(droppedRequest.timeoutId);
          }
          this.stats.droppedRequests++;
          this.stats.queuedRequests--;
          logger.debug('Dropped lower priority request', {
            droppedId: droppedRequest.id,
            droppedPriority: priority,
            newPriority: newRequestPriority,
          });
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Handle request timeout
   */
  private timeoutRequest(requestId: string): void {
    // Remove from all queues
    for (const [priority, queue] of this.queues) {
      const index = queue.findIndex(req => req.id === requestId);
      if (index !== -1) {
        const timedOutRequest = queue.splice(index, 1)[0];
        this.stats.queuedRequests--;
        this.stats.droppedRequests++;

        logger.warn('Request timed out in queue', {
          requestId,
          priority,
          waitTime: Date.now() - timedOutRequest.timestamp,
        });

        // Send timeout response
        if (!timedOutRequest.res.headersSent) {
          timedOutRequest.res.status(408).json({
            error: 'Request timeout',
            message: 'Request waited too long in queue',
            requestId,
          });
        }
        break;
      }
    }
  }

  /**
   * Get total queue size across all priorities
   */
  private getTotalQueueSize(): number {
    return Array.from(this.queues.values()).reduce((total, queue) => total + queue.length, 0);
  }

  /**
   * Get current statistics
   */
  getStats(): SchedulingStats {
    return { ...this.stats };
  }

  /**
   * Get detailed queue status
   */
  getQueueStatus(): Record<string, unknown> {
    const status: Record<string, unknown> = {};

    for (const [priority, queue] of this.queues) {
      status[`priority_${priority}`] = {
        queueLength: queue.length,
        oldestRequest: queue.length > 0 ? Date.now() - queue[0].timestamp : null,
        weight: this.config.priorityWeights[priority],
        processed: this.fairnessCounters.get(priority) ?? 0,
      };
    }

    status.processing = this.processing.size;
    status.totalQueued = this.getTotalQueueSize();

    return status;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      processedRequests: 0,
      queuedRequests: this.getTotalQueueSize(),
      droppedRequests: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0,
      priorityDistribution: Object.values(RequestPriority).reduce(
        (acc, priority) => {
          if (typeof priority === 'number') acc[priority] = 0;
          return acc;
        },
        {} as Record<RequestPriority, number>
      ),
    };

    this.fairnessCounters.clear();
    Object.values(RequestPriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.fairnessCounters.set(priority, 0);
      }
    });

    logger.info('Priority queue statistics reset');
  }
}

// Global priority queue instance
const globalPriorityQueue = new PriorityQueue();

/**
 * Determine request priority based on various factors
 */
function determineRequestPriority(req: Request): RequestPriority {
  // System health and security endpoints
  if (req.path.includes('/health') || req.path.includes('/security')) {
    return RequestPriority.CRITICAL;
  }

  // Real-time WebSocket upgrades
  if (req.headers.upgrade === 'websocket') {
    return RequestPriority.HIGH;
  }

  // User authentication and session management
  if (req.path.includes('/auth') || req.path.includes('/login')) {
    return RequestPriority.HIGH;
  }

  // API operations based on method
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    return RequestPriority.NORMAL;
  }

  // GET requests for data
  if (req.method === 'GET') {
    // Search and analytics can be lower priority
    if (req.path.includes('/search') || req.path.includes('/analytics')) {
      return RequestPriority.LOW;
    }
    return RequestPriority.NORMAL;
  }

  // Background operations
  if (req.path.includes('/backup') || req.path.includes('/maintenance')) {
    return RequestPriority.BACKGROUND;
  }

  return RequestPriority.NORMAL;
}

/**
 * Priority middleware for Express
 */
export function priorityMiddleware(customPriorityFn?: (req: Request) => RequestPriority) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId =
      (req.headers['x-request-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const priority = customPriorityFn ? customPriorityFn(req) : determineRequestPriority(req);

    const priorityRequest: PriorityRequest = {
      id: requestId,
      priority,
      timestamp: Date.now(),
      req,
      res,
      next,
      retryCount: 0,
      maxRetries: 3,
    };

    // Add request ID to headers
    req.headers['x-request-id'] = requestId;

    // Try to enqueue the request
    const enqueued = globalPriorityQueue.enqueue(priorityRequest);

    if (!enqueued) {
      // Queue full, return 503 Service Unavailable
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Request queue is full, please try again later',
        retryAfter: 60, // seconds
      });
    }

    // Request is queued, processing will happen asynchronously
  };
}

/**
 * Get priority queue statistics
 */
export function getPriorityStats(): SchedulingStats {
  return globalPriorityQueue.getStats();
}

/**
 * Get detailed queue status
 */
export function getQueueStatus(): Record<string, unknown> {
  return globalPriorityQueue.getQueueStatus();
}

/**
 * Reset priority queue statistics
 */
export function resetPriorityStats(): void {
  globalPriorityQueue.resetStats();
}

export { globalPriorityQueue };
