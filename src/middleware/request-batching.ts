/**
 * @fileoverview Express middleware for request batching integration
 * @lastmodified 2025-07-28T09:00:00Z
 *
 * Features: Express middleware, request transformation, response aggregation, error handling
 * Main APIs: batchingMiddleware, BatchingController, ResponseAggregator
 * Constraints: Requires Express.js integration, response correlation
 * Patterns: Middleware pattern, response transformation, async request handling
 */

import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger';
import { requestBatcher } from '../utils/request-batching';
import { requestDeduplicator } from '../utils/request-deduplication';
import { requestScheduler } from '../utils/request-prioritization';
import { ValidationError } from '../utils/errors';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface BatchedRequest {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  timestamp: number;
  clientId?: string;
  priority?: number;
}

export interface BatchRequestPayload {
  requests: Array<{
    id?: string;
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    priority?: number;
  }>;
  options?: {
    enableDeduplication?: boolean;
    enablePrioritization?: boolean;
    maxBatchSize?: number;
    timeout?: number;
  };
}

export interface BatchedResponse {
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
  cached?: boolean;
  deduplicated?: boolean;
}

export interface BatchingMiddlewareOptions {
  enableBatching: boolean;
  enableDeduplication: boolean;
  enablePrioritization: boolean;
  maxBatchSize: number;
  batchTimeout: number;
  excludePaths: string[];
  includePaths: string[];
  enableMetrics: boolean;
  enableLogging: boolean;
}

// ============================================================================
// RESPONSE AGGREGATOR
// ============================================================================

export class ResponseAggregator {
  private readonly responses = new Map<
    string,
    {
      response: BatchedResponse;
      originalReq: Request;
      originalRes: Response;
    }
  >();

  /**
   * Add response for aggregation
   */
  addResponse(requestId: string, response: BatchedResponse, req: Request, res: Response): void {
    this.responses.set(requestId, {
      response,
      originalReq: req,
      originalRes: res,
    });
  }

  /**
   * Send aggregated response to client
   */
  sendResponse(requestId: string): void {
    const entry = this.responses.get(requestId);
    if (!entry) {
      logger.error('Response not found for aggregation', { requestId });
      return;
    }

    const { response, originalRes } = entry;

    try {
      // Set response headers
      Object.entries(response.headers).forEach(([key, value]) => {
        originalRes.setHeader(key, value);
      });

      // Add batching metadata headers
      originalRes.setHeader('X-Batched', 'true');
      originalRes.setHeader('X-Processing-Time', response.processingTime.toString());

      if (response.cached) {
        originalRes.setHeader('X-Cache', 'HIT');
      }

      if (response.deduplicated) {
        originalRes.setHeader('X-Deduplicated', 'true');
      }

      // Send response
      if (response.error) {
        originalRes.status(response.status).json({
          error: response.error,
          timestamp: new Date().toISOString(),
          requestId,
        });
      } else {
        originalRes.status(response.status).json(response.data);
      }
    } catch (err) {
      logger.error('Error sending aggregated response', {
        requestId,
        error: (err as Error).message,
      });

      originalRes.status(500).json({
        error: {
          code: 'RESPONSE_AGGREGATION_ERROR',
          message: 'Failed to send response',
        },
      });
    } finally {
      this.responses.delete(requestId);
    }
  }

  /**
   * Clean up expired responses
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 30000; // 30 seconds

    for (const [requestId, entry] of this.responses) {
      const age = now - entry.response.processingTime;
      if (age > maxAge) {
        logger.warn('Cleaning up expired response', { requestId, age });
        this.responses.delete(requestId);
      }
    }
  }

  /**
   * Get pending response count
   */
  getPendingCount(): number {
    return this.responses.size;
  }
}

// ============================================================================
// BATCHING CONTROLLER
// ============================================================================

export class BatchingController {
  private readonly responseAggregator: ResponseAggregator;

  private readonly options: BatchingMiddlewareOptions;

  constructor(options: BatchingMiddlewareOptions) {
    this.options = options;
    this.responseAggregator = new ResponseAggregator();

    // Start cleanup interval
    setInterval(() => {
      this.responseAggregator.cleanup();
    }, 30000); // Every 30 seconds
  }

  /**
   * Handle batch request endpoint
   */
  async handleBatchRequest(req: Request, res: Response): Promise<void> {
    const startTime = performance.now();

    try {
      // Validate batch request payload
      const payload = this.validateBatchPayload(req.body);

      // Process batch requests
      const responses = await this.processBatchRequests(payload, req);

      // Send aggregated response
      res.status(200).json({
        responses,
        metadata: {
          totalRequests: payload.requests.length,
          processingTime: performance.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      });

      if (this.options.enableLogging) {
        logger.info('Batch request processed', {
          requestCount: payload.requests.length,
          processingTime: performance.now() - startTime,
          clientId: this.extractClientId(req),
        });
      }
    } catch (error) {
      logger.error('Batch request processing failed', {
        error: (error as Error).message,
        requestBody: req.body,
      });

      res.status(500).json({
        error: {
          code: 'BATCH_PROCESSING_ERROR',
          message: 'Failed to process batch request',
          details: (error as Error).message,
        },
      });
    }
  }

  /**
   * Process multiple batch requests
   */
  private async processBatchRequests(
    payload: BatchRequestPayload,
    originalReq: Request
  ): Promise<BatchedResponse[]> {
    const responses: BatchedResponse[] = [];
    const clientId = this.extractClientId(originalReq);

    // Process each request in the batch
    for (let i = 0; i < payload.requests.length; i++) {
      const requestSpec = payload.requests[i];
      const requestId = requestSpec.id || this.generateRequestId(i);

      try {
        const batchedRequest: BatchedRequest = {
          id: requestId,
          method: requestSpec.method,
          url: requestSpec.url,
          headers: requestSpec.headers ?? {},
          body: requestSpec.body,
          timestamp: Date.now(),
          clientId,
          priority: requestSpec.priority,
        };

        const response = await this.processIndividualRequest(batchedRequest, payload.options ?? {});

        responses.push(response);
      } catch (error) {
        responses.push({
          id: requestId,
          status: 500,
          statusText: 'Internal Server Error',
          headers: {},
          error: {
            code: 'REQUEST_PROCESSING_ERROR',
            message: 'Failed to process individual request',
            details: (error as Error).message,
          },
          processingTime: 0,
        });
      }
    }

    return responses;
  }

  /**
   * Process individual request within batch
   */
  private async processIndividualRequest(
    request: BatchedRequest,
    options: BatchRequestPayload['options'] = {}
  ): Promise<BatchedResponse> {
    const startTime = performance.now();

    try {
      // Apply deduplication if enabled
      if (options.enableDeduplication && this.options.enableDeduplication) {
        const cachedResponse = await this.tryDeduplication(request);
        if (cachedResponse) {
          return { ...cachedResponse, deduplicated: true, processingTime: performance.now() - startTime };
        }
      }

      // Apply prioritization if enabled
      if (options.enablePrioritization && this.options.enablePrioritization) {
        const scheduled = requestScheduler.scheduleRequest(request.id, request, {
          priority: request.priority,
          clientId: request.clientId,
          requestType: 'batch',
        });

        if (!scheduled) {
          throw new Error('Failed to schedule request');
        }
      }

      // Execute the request
      const response = await this.executeRequest(request);

      return { id: request.id, status: response.status, statusText: response.statusText, headers: response.headers, data: response.data, processingTime: performance.now() - startTime };
    } catch (error) {
      return { id: request.id, status: 500, statusText: 'Internal Server Error', headers: { },
        error: {
          code: 'REQUEST_EXECUTION_ERROR',
          message: 'Failed to execute request',
          details: (error as Error).message,
        },
        processingTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Try request deduplication
   */
  private async tryDeduplication(request: BatchedRequest): Promise<BatchedResponse | null> {
    try {
      const response = await requestDeduplicator.processRequest(
        request.method,
        request.url,
        request.headers,
        request.body
      );

      if (response) {
        return { id: request.id, status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' },
          data: response,
          processingTime: 0,
          cached: true,
        };
      }
    } catch (error) {
      logger.debug('Deduplication failed, proceeding with normal execution', {
        requestId: request.id,
        error: (error as Error).message,
      });
    }

    return null;
  }

  /**
   * Execute individual request
   */
  private async executeRequest(request: BatchedRequest): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data?: unknown;
  }> {
    // This is a mock implementation - in production, you would integrate
    // with your actual Express.js routing system

    // Simulate request processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

    // Mock different responses based on URL patterns
    if (request.url.includes('/error')) {
      throw new Error('Simulated request error');
    }

    if (request.url.includes('/slow')) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' },
      data: {
        id: request.id,
        method: request.method,
        url: request.url,
        processed: true,
        timestamp: Date.now(),
        batched: true,
      },
    };
  }

  /**
   * Validate batch request payload
   */
  private validateBatchPayload(body: unknown): BatchRequestPayload {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid batch request payload');
    }

    const typedBody = body as BatchRequestPayload;

    if (!Array.isArray(typedBody.requests)) {
      throw new ValidationError('Requests must be an array');
    }

    if (typedBody.requests.length === 0) {
      throw new ValidationError('At least one request must be provided');
    }

    if (typedBody.requests.length > this.options.maxBatchSize) {
      throw new ValidationError(`Batch size exceeds maximum of ${this.options.maxBatchSize}`);
    }

    // Validate each request in the batch
    for (let i = 0; i < typedBody.requests.length; i++) {
      const request = typedBody.requests[i];

      if (!request.method || !request.url) {
        throw new ValidationError(`Request ${i} is missing required method or url`);
      }

      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) {
        throw new ValidationError(`Request ${i} has invalid HTTP method: ${request.method}`);
      }
    }

    return typedBody;
  }

  /**
   * Extract client ID from request
   */
  private extractClientId(req: Request): string | undefined {
    return ((req.headers['x-client-id'] as string) || req.ip) ?? 'anonymous';
  }

  /**
   * Generate request ID
   */
  private generateRequestId(index: number): string {
    return `batch_${Date.now()}_${index}`;
  }

  /**
   * Get controller statistics
   */
  getStats(): {
    pendingResponses: number;
    batchingEnabled: boolean;
    deduplicationEnabled: boolean;
    prioritizationEnabled: boolean;
  } {
    return { pendingResponses: this.responseAggregator.getPendingCount(), batchingEnabled: this.options.enableBatching, deduplicationEnabled: this.options.enableDeduplication, prioritizationEnabled: this.options.enablePrioritization };
  }
}

// ============================================================================
// MIDDLEWARE FUNCTIONS
// ============================================================================

/**
 * Create batching middleware with configuration
 */
export function createBatchingMiddleware(options: Partial<BatchingMiddlewareOptions> = {}): {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  router: Router;
  controller: BatchingController;
} {
  const defaultOptions: BatchingMiddlewareOptions = {
    enableBatching: true,
    enableDeduplication: true,
    enablePrioritization: true,
    maxBatchSize: 25,
    batchTimeout: 100,
    excludePaths: ['/health', '/ready', '/metrics'],
    includePaths: [],
    enableMetrics: true,
    enableLogging: true,
  };

  const finalOptions = { ...defaultOptions, ...options };
  const controller = new BatchingController(finalOptions);

  // Create middleware function
  const middleware = (req: Request, res: Response, next: NextFunction) => {
    // Skip batching for excluded paths
    if (finalOptions.excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Only apply to included paths if specified
    if (finalOptions.includePaths.length) {
      if (!finalOptions.includePaths.some(path => req.path.startsWith(path))) {
        return next();
      }
    }

    // Add batching headers
    res.setHeader('X-Batching-Enabled', 'true');
    res.setHeader('X-Max-Batch-Size', finalOptions.maxBatchSize.toString());

    // Continue with normal processing
    next();
  };

  // Create router for batch endpoints
  const router = Router();

  // Batch request endpoint
  router.post('/batch', (req: Request, res: Response) => {
    void controller.handleBatchRequest(req, res);
  });

  // Batch status endpoint
  router.get('/batch/status', (req: Request, res: Response) => {
    const stats = controller.getStats();
    res.json({
      status: 'active',
      ...stats,
      timestamp: new Date().toISOString(),
    });
  });

  return { middleware, router, controller };
}

/**
 * Simple batching middleware with default options
 */
export const batchingMiddleware = createBatchingMiddleware().middleware;

/**
 * Batch router with default options
 */
export const batchRouter = createBatchingMiddleware().router;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if request should be batched
 */
export function shouldBatchRequest(req: Request): boolean {
  // Don't batch WebSocket upgrades
  if (req.headers.upgrade === 'websocket') {
    return false;
  }

  // Don't batch streaming responses
  if (req.headers.accept?.includes('text/event-stream')) {
    return false;
  }

  // Don't batch file uploads
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    return false;
  }

  return true;
}

/**
 * Extract batch metadata from request
 */
export function extractBatchMetadata(req: Request): {
  clientId?: string;
  priority?: number;
  timeout?: number;
} {
  return { clientId: req.headers['x-client-id'] as string, priority: req.headers['x-priority'], ? parseInt(req.headers['x-priority'] as string, 10), : undefined, timeout: req.headers['x-timeout'], ? parseInt(req.headers['x-timeout'] as string, 10), : undefined };
}

/**
 * Create batch request from Express request
 */
export function createBatchRequest(req: Request): BatchedRequest {
  return { id: `req_${Date.now() }_${Math.random().toString(36).substring(2, 11)}`,
    method: req.method,
    url: req.originalUrl || req.url,
    headers: req.headers as Record<string, string>,
    body: req.body,
    query: req.query as Record<string, unknown>,
    params: req.params,
    timestamp: Date.now(),
    clientId: (req.headers['x-client-id'] as string) || req.ip,
    priority: req.headers['x-priority'] ? parseInt(req.headers['x-priority'] as string, 10) : 5,
  };
}
