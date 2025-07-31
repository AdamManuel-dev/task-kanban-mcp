/**
 * @fileoverview Request batching system for improved performance
 * @lastmodified 2025-07-28T08:45:00Z
 *
 * Features: Request batching, batch processing, response merging, timeout handling
 * Main APIs: RequestBatcher, BatchProcessor, BatchRequest, BatchResponse
 * Constraints: Requires Redis for coordination, timeout configuration
 * Patterns: Batch collection, delayed execution, response correlation
 */

import { performance } from 'perf_hooks';
import { logger } from './logger';
import { BaseServiceError } from './errors';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface BatchRequest {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  timestamp: number;
  clientId?: string;
  priority?: number;
}

export interface BatchResponse {
  id: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  processingTime: number;
}

export interface BatchConfig {
  maxBatchSize: number;
  batchTimeout: number; // milliseconds
  maxWaitTime: number; // milliseconds
  enablePrioritization: boolean;
  enableDeduplication: boolean;
  parallelExecution: boolean;
  maxConcurrency: number;
}

export interface BatchStats {
  totalRequests: number;
  batchesProcessed: number;
  averageBatchSize: number;
  averageProcessingTime: number;
  duplicatesDetected: number;
  timeouts: number;
  errors: number;
}

// ============================================================================
// REQUEST DEDUPLICATION
// ============================================================================

class RequestDeduplicator {
  private readonly pendingRequests = new Map<string, BatchRequest[]>();

  /**
   * Generate a key for request deduplication
   */
  private generateRequestKey(request: BatchRequest): string {
    const keyParts = [
      request.method,
      request.url,
      JSON.stringify(request.body ?? {}),
      request.headers['content-type'] ?? '',
    ];
    return Buffer.from(keyParts.join('|')).toString('base64');
  }

  /**
   * Check if request can be deduplicated
   */
  canDeduplicate(request: BatchRequest): boolean {
    // Only deduplicate GET requests and idempotent operations
    const deduplicatableMethods = ['GET', 'HEAD', 'OPTIONS'];
    return deduplicatableMethods.includes(request.method.toUpperCase());
  }

  /**
   * Add request for deduplication tracking
   */
  addRequest(request: BatchRequest): string | null {
    if (!this.canDeduplicate(request)) {
      return null;
    }

    const key = this.generateRequestKey(request);

    if (!this.pendingRequests.has(key)) {
      this.pendingRequests.set(key, []);
    }

    this.pendingRequests.get(key)!.push(request);
    return key;
  }

  /**
   * Get all requests for a deduplication key
   */
  getRequestsForKey(key: string): BatchRequest[] {
    return this.pendingRequests.get(key) ?? [];
  }

  /**
   * Remove completed requests
   */
  removeRequests(key: string): void {
    this.pendingRequests.delete(key);
  }

  /**
   * Get pending request keys
   */
  getPendingKeys(): string[] {
    return Array.from(this.pendingRequests.keys());
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.pendingRequests.clear();
  }
}

// ============================================================================
// BATCH PROCESSOR
// ============================================================================

export class BatchProcessor {
  private config: BatchConfig;

  private stats: BatchStats;

  private readonly deduplicator: RequestDeduplicator;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = {
      maxBatchSize: 50,
      batchTimeout: 100, // 100ms
      maxWaitTime: 1000, // 1 second
      enablePrioritization: true,
      enableDeduplication: true,
      parallelExecution: true,
      maxConcurrency: 10,
      ...config,
    };

    this.stats = {
      totalRequests: 0,
      batchesProcessed: 0,
      averageBatchSize: 0,
      averageProcessingTime: 0,
      duplicatesDetected: 0,
      timeouts: 0,
      errors: 0,
    };

    this.deduplicator = new RequestDeduplicator();
  }

  /**
   * Process a batch of requests
   */
  async processBatch(requests: BatchRequest[]): Promise<BatchResponse[]> {
    const startTime = performance.now();

    logger.info('Processing request batch', {
      batchSize: requests.length,
      requestIds: requests.map(r => r.id),
    });

    try {
      // Sort by priority if enabled
      const sortedRequests = this.config.enablePrioritization
        ? this.sortByPriority(requests)
        : requests;

      // Handle deduplication
      const { uniqueRequests, duplicateMap } = this.config.enableDeduplication
        ? this.handleDeduplication(sortedRequests)
        : { uniqueRequests: sortedRequests, duplicateMap: new Map() };

      // Process requests
      const responses = this.config.parallelExecution
        ? await this.processParallel(uniqueRequests)
        : await this.processSequential(uniqueRequests);

      // Expand responses for duplicated requests
      const allResponses = this.expandDuplicatedResponses(responses, duplicateMap);

      // Update statistics
      this.updateStats(requests, performance.now() - startTime);

      return allResponses;
    } catch (error) {
      this.stats.errors++;
      logger.error('Batch processing failed', {
        error: (error as Error).message,
        batchSize: requests.length,
      });

      // Return error responses for all requests
      return requests.map(request => ({
        id: request.id,
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        error: {
          code: 'BATCH_PROCESSING_ERROR',
          message: 'Failed to process batch request',
          details: (error as Error).message,
        },
        processingTime: performance.now() - startTime,
      }));
    }
  }

  /**
   * Sort requests by priority
   */
  private sortByPriority(requests: BatchRequest[]): BatchRequest[] {
    return [...requests].sort((a, b) => {
      const priorityA = a.priority || 5;
      const priorityB = b.priority || 5;
      return priorityA - priorityB; // Lower number = higher priority
    });
  }

  /**
   * Handle request deduplication
   */
  private handleDeduplication(requests: BatchRequest[]): {
    uniqueRequests: BatchRequest[];
    duplicateMap: Map<string, BatchRequest[]>;
  } {
    const uniqueRequests: BatchRequest[] = [];
    const duplicateMap = new Map<string, BatchRequest[]>();
    const seenKeys = new Set<string>();

    for (const request of requests) {
      const deduplicationKey = this.deduplicator.addRequest(request);

      if (deduplicationKey && seenKeys.has(deduplicationKey)) {
        // This is a duplicate
        if (!duplicateMap.has(deduplicationKey)) {
          duplicateMap.set(deduplicationKey, []);
        }
        duplicateMap.get(deduplicationKey)!.push(request);
        this.stats.duplicatesDetected++;
      } else {
        // This is unique
        uniqueRequests.push(request);
        if (deduplicationKey) {
          seenKeys.add(deduplicationKey);
        }
      }
    }

    return { uniqueRequests, duplicateMap };
  }

  /**
   * Process requests in parallel
   */
  private async processParallel(requests: BatchRequest[]): Promise<BatchResponse[]> {
    const semaphore = new Semaphore(this.config.maxConcurrency);

    const promises = requests.map(async request => {
      await semaphore.acquire();
      try {
        return await this.processRequest(request);
      } finally {
        semaphore.release();
      }
    });

    return Promise.all(promises);
  }

  /**
   * Process requests sequentially
   */
  private async processSequential(requests: BatchRequest[]): Promise<BatchResponse[]> {
    const responses: BatchResponse[] = [];

    for (const request of requests) {
      const response = await this.processRequest(request);
      responses.push(response);
    }

    return responses;
  }

  /**
   * Process a single request
   */
  private async processRequest(request: BatchRequest): Promise<BatchResponse> {
    const startTime = performance.now();

    try {
      // Simulate request processing - in real implementation, this would
      // integrate with your actual API handlers
      const response = await this.executeRequest(request);

      return {
        id: request.id,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        processingTime: performance.now() - startTime,
      };
    } catch (error) {
      logger.error('Request processing failed', {
        requestId: request.id,
        url: request.url,
        method: request.method,
        error: (error as Error).message,
      });

      return {
        id: request.id,
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        error: {
          code: 'REQUEST_PROCESSING_ERROR',
          message: 'Failed to process individual request',
          details: (error as Error).message,
        },
        processingTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Execute the actual request - this should be implemented to integrate
   * with your application's routing system
   */
  private async executeRequest(request: BatchRequest): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data?: unknown;
  }> {
    // This is a mock implementation - in production, you would integrate
    // with Express.js router or your API framework

    // Simulate different response times and results
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50));

    if (request.url.includes('/error')) {
      throw new Error('Simulated request error');
    }

    return {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: {
        id: request.id,
        method: request.method,
        url: request.url,
        processed: true,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Expand responses for duplicated requests
   */
  private expandDuplicatedResponses(
    responses: BatchResponse[],
    duplicateMap: Map<string, BatchRequest[]>
  ): BatchResponse[] {
    const allResponses = [...responses];

    // For each duplicate group, replicate the response
    for (const [key, duplicates] of duplicateMap) {
      const originalRequests = this.deduplicator.getRequestsForKey(key);
      const originalRequest = originalRequests[0];

      // Find the response for the original request
      const originalResponse = responses.find(r => r.id === originalRequest.id);

      if (originalResponse) {
        // Create responses for all duplicates
        for (const duplicate of duplicates) {
          allResponses.push({
            ...originalResponse,
            id: duplicate.id, // Use the duplicate's ID
          });
        }
      }

      // Clean up deduplicator
      this.deduplicator.removeRequests(key);
    }

    return allResponses;
  }

  /**
   * Update processing statistics
   */
  private updateStats(requests: BatchRequest[], processingTime: number): void {
    this.stats.totalRequests += requests.length;
    this.stats.batchesProcessed++;

    // Update averages
    const totalBatches = this.stats.batchesProcessed;
    this.stats.averageBatchSize =
      (this.stats.averageBatchSize * (totalBatches - 1) + requests.length) / totalBatches;

    this.stats.averageProcessingTime =
      (this.stats.averageProcessingTime * (totalBatches - 1) + processingTime) / totalBatches;
  }

  /**
   * Get processing statistics
   */
  getStats(): BatchStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      batchesProcessed: 0,
      averageBatchSize: 0,
      averageProcessingTime: 0,
      duplicatesDetected: 0,
      timeouts: 0,
      errors: 0,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): BatchConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Batch processor configuration updated', { config: this.config });
  }
}

// ============================================================================
// REQUEST BATCHER
// ============================================================================

export class RequestBatcher {
  private readonly processor: BatchProcessor;

  private pendingRequests: BatchRequest[] = [];

  private batchTimer: NodeJS.Timeout | null = null;

  private readonly responsePromises = new Map<
    string,
    {
      resolve: (response: BatchResponse) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(config: Partial<BatchConfig> = {}) {
    this.processor = new BatchProcessor(config);
  }

  /**
   * Add a request to the batch
   */
  async addRequest(request: Omit<BatchRequest, 'id' | 'timestamp'>): Promise<BatchResponse> {
    const batchRequest: BatchRequest = {
      ...request,
      id: this.generateRequestId(),
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      // Store the promise resolvers
      this.responsePromises.set(batchRequest.id, { resolve, reject });

      // Add to pending requests
      this.pendingRequests.push(batchRequest);

      // Check if we should process immediately
      if (this.shouldProcessBatch()) {
        this.processPendingBatch();
      } else {
        this.scheduleBatchProcessing();
      }
    });
  }

  /**
   * Check if batch should be processed immediately
   */
  private shouldProcessBatch(): boolean {
    const config = this.processor.getConfig();
    return this.pendingRequests.length >= config.maxBatchSize;
  }

  /**
   * Schedule batch processing
   */
  private scheduleBatchProcessing(): void {
    if (this.batchTimer) {
      return; // Timer already scheduled
    }

    const config = this.processor.getConfig();
    this.batchTimer = setTimeout(() => {
      this.processPendingBatch();
    }, config.batchTimeout);
  }

  /**
   * Process the current batch of pending requests
   */
  private async processPendingBatch(): Promise<void> {
    if (this.pendingRequests.length === 0) {
      return;
    }

    // Clear the timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Extract pending requests
    const requestsToProcess = [...this.pendingRequests];
    this.pendingRequests = [];

    try {
      // Process the batch
      const responses = await this.processor.processBatch(requestsToProcess);

      // Resolve all promises
      for (const response of responses) {
        const promiseHandlers = this.responsePromises.get(response.id);
        if (promiseHandlers) {
          if (response.error) {
            promiseHandlers.reject(
              new BaseServiceError(
                response.error.code,
                response.error.message,
                response.status,
                response.error.details
              )
            );
          } else {
            promiseHandlers.resolve(response);
          }
          this.responsePromises.delete(response.id);
        }
      }
    } catch (error) {
      // Reject all pending promises
      for (const request of requestsToProcess) {
        const promiseHandlers = this.responsePromises.get(request.id);
        if (promiseHandlers) {
          promiseHandlers.reject(error as Error);
          this.responsePromises.delete(request.id);
        }
      }
    }
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get processing statistics
   */
  getStats(): BatchStats {
    return this.processor.getStats();
  }

  /**
   * Get current configuration
   */
  getConfig(): BatchConfig {
    return this.processor.getConfig();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BatchConfig>): void {
    this.processor.updateConfig(config);
  }

  /**
   * Flush any pending requests immediately
   */
  async flush(): Promise<void> {
    if (this.pendingRequests.length > 0) {
      await this.processPendingBatch();
    }
  }

  /**
   * Shutdown the batcher
   */
  async shutdown(): Promise<void> {
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Process any remaining requests
    await this.flush();

    // Reject any remaining promises
    for (const [requestId, handlers] of this.responsePromises) {
      handlers.reject(new Error('Batcher is shutting down'));
      this.responsePromises.delete(requestId);
    }
  }
}

// ============================================================================
// SEMAPHORE FOR CONCURRENCY CONTROL
// ============================================================================

class Semaphore {
  private permits: number;

  private readonly waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const requestBatcher = new RequestBatcher({
  maxBatchSize: 25,
  batchTimeout: 50, // 50ms
  maxWaitTime: 500, // 500ms
  enablePrioritization: true,
  enableDeduplication: true,
  parallelExecution: true,
  maxConcurrency: 5,
});

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Batch a GET request
 */
export const batchGet = async (
  url: string,
  headers: Record<string, string> = {},
  priority?: number
): Promise<BatchResponse> =>
  requestBatcher.addRequest({
    method: 'GET',
    url,
    headers,
    priority,
  });

/**
 * Batch a POST request
 */
export const batchPost = async (
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  priority?: number
): Promise<BatchResponse> =>
  requestBatcher.addRequest({
    method: 'POST',
    url,
    headers,
    body,
    priority,
  });

/**
 * Batch multiple requests
 */
export const batchMultiple = async (
  requests: Array<Omit<BatchRequest, 'id' | 'timestamp'>>
): Promise<BatchResponse[]> => {
  const promises = requests.map(async request => requestBatcher.addRequest(request));
  return Promise.all(promises);
};

/**
 * Get batching statistics
 */
export const getBatchingStats = (): BatchStats => requestBatcher.getStats();
