import { Router } from 'express';
import { dbConnection } from '@/database/connection';
import { config } from '@/config';
import { webSocketManager } from '@/websocket';

export async function healthRoutes() {
  const router = Router();

  // Basic health check
  router.get('/health', async (req, res) => {
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
        running: webSocketManager ? true : false,
        clients: webSocketManager?.getClientCount() || 0,
      },
      uptime: process.uptime(),
    });
  });

  // Detailed health check
  router.get('/health/detailed', async (req, res) => {
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
        running: webSocketManager ? true : false,
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
  router.get('/ready', async (req, res) => {
    try {
      const health = await dbConnection.healthCheck();
      
      if (health.connected && health.responsive) {
        res.apiSuccess({ ready: true });
      } else {
        res.status(503).apiError('SERVICE_NOT_READY', 'Service not ready');
      }
    } catch (error) {
      res.status(503).apiError('SERVICE_NOT_READY', 'Service not ready', 503, { error: (error as Error).message });
    }
  });

  // Liveness check
  router.get('/live', (req, res) => {
    res.apiSuccess({ alive: true });
  });

  return router;
}