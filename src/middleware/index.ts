import { Router } from 'express';
import apiRoutes from '@/routes';
import { authenticationMiddleware } from './auth';
import { requestLoggingMiddleware } from './logging';
import { requestValidationMiddleware } from './validation';
import { responseFormattingMiddleware } from './response';
import { requestIdMiddleware } from './requestId';
import { cache, invalidateCache, cacheStats } from './responseCache';
import { batchingMiddleware } from './request-batching';

export async function createApiMiddleware(): Promise<Router> {
  const router = Router();

  // Request ID middleware (must be first)
  router.use(requestIdMiddleware);

  // Request logging
  router.use(requestLoggingMiddleware);

  // Request batching, deduplication, and prioritization middleware
  router.use('/api/batch', batchingMiddleware);

  // Response formatting
  router.use(responseFormattingMiddleware);

  // Response caching middleware (before authentication for better performance)
  router.use(
    cache({
      ttl: 300000, // 5 minutes default cache
      maxSize: 1000,
      varyHeaders: ['Authorization', 'X-API-Key', 'Accept-Language'],
      shouldCache: (req, res) => {
        // Only cache GET requests
        if (req.method !== 'GET') return false;

        // Don't cache error responses
        if (res.statusCode >= 400) return false;

        // Don't cache authentication-related routes
        if (req.path.includes('/auth')) return false;

        // Don't cache real-time data endpoints
        if (req.path.includes('/websocket') || req.path.includes('/realtime')) return false;

        return true;
      },
    })
  );

  // Cache invalidation for write operations
  router.use(invalidateCache([/\/boards/, /\/tasks/, /\/columns/, /\/notes/, /\/tags/]));

  // Cache statistics endpoint
  router.get('/cache/stats', cacheStats());

  // Authentication middleware (skip in test environment)
  if (process.env.NODE_ENV !== 'test') {
    router.use(authenticationMiddleware);
  }

  // Request validation middleware
  router.use(requestValidationMiddleware);

  // API routes
  router.use('/api', apiRoutes);

  return router;
}

export * from './auth';
export * from './logging';
export * from './validation';
export * from './response';
export * from './requestId';
export * from './asyncHandler';
export * from './responseCache';
export * from './request-batching';
