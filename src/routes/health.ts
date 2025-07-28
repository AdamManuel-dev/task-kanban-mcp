import { Router } from 'express';
import { dbConnection } from '@/database/connection';
import { config } from '@/config';
import { webSocketManager } from '@/websocket';
import '@/middleware/response';

export function healthRoutes(): Router {
  const router = Router();

  // Basic health check
  router.get('/health', async (_req: Request, res: Response): Promise<void> => {
    const health = await dbConnection.healthCheck();

    const status = health.connected && health.responsive ? 'healthy' : 'unhealthy';
    const statusCode = status === 'healthy' ? 200 : 503;

    res.status(statusCode).apiSuccess({
      status,
      version: config.mcp.serverVersion,
      database: {
        connected: health.connected,
        responsive: health.responsive,
        responseTime: health.stats?.responseTime,
      },
      websocket: {
        running: !!webSocketManager,
        clients: webSocketManager?.getClientCount() || 0,
      },
      uptime: process.uptime(),
    });
  });

  // Detailed health check
  router.get('/health/detailed', async (_req: Request, res: Response): Promise<void> => {
    const health = await dbConnection.healthCheck();
    const stats = await dbConnection.getStats();

    res.apiSuccess({
      status: health.connected && health.responsive ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: config.mcp.serverVersion,
      database: {
        connected: health.connected,
        responsive: health.responsive,
        responseTime: health.stats?.responseTime,
        size: stats.size,
        tables: stats.tables,
        walMode: stats.walMode,
      },
      websocket: {
        running: !!webSocketManager,
        clients: webSocketManager?.getClientCount() || 0,
        subscriptions: webSocketManager?.getSubscriptionManager().getStats() || null,
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
      },
    });
  });

  // Readiness check
  router.get('/ready', async (_req: Request, res: Response): Promise<void> => {
    try {
      const health = await dbConnection.healthCheck();

      if (health.connected && health.responsive) {
        res.apiSuccess({ ready: true });
      } else {
        res.status(503).apiError({
          code: 'SERVICE_NOT_READY',
          message: 'Service not ready',
          statusCode: 503,
        });
      }
    } catch (error) {
      res.status(503).apiError({
        code: 'SERVICE_NOT_READY',
        message: 'Service not ready',
        statusCode: 503,
        details: {
          error: (error as Error).message,
        },
      });
    }
  });

  // Liveness check
  router.get('/live', (_req: Request, res: Response): void => {
    res.apiSuccess({ alive: true });
  });

  return router;
}
