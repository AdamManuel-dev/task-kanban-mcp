import { Router } from 'express';
import { authenticationMiddleware } from './auth';
import { requestLoggingMiddleware } from './logging';
import { requestValidationMiddleware } from './validation';
import { responseFormattingMiddleware } from './response';
import { requestIdMiddleware } from './requestId';
import { apiRoutes } from '@/routes';

export async function createApiMiddleware() {
  const router = Router();

  // Request ID middleware (must be first)
  router.use(requestIdMiddleware);

  // Request logging
  router.use(requestLoggingMiddleware);

  // Response formatting
  router.use(responseFormattingMiddleware);

  // Authentication middleware
  router.use(authenticationMiddleware);

  // Request validation middleware
  router.use(requestValidationMiddleware);

  // API routes
  router.use('/v1', await apiRoutes());

  return router;
}

export * from './auth';
export * from './logging';
export * from './validation';
export * from './response';
export * from './requestId';