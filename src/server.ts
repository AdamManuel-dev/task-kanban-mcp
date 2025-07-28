import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { dbConnection } from '@/database/connection';
import { globalErrorHandler } from '@/utils/errors';
import { createApiMiddleware } from '@/middleware';
// Check if WebSockets should be enabled
const enableWebSockets = process.env['ENABLE_WEBSOCKETS'] !== 'false';

export async function createServer(): Promise<express.Application> {
  const app = express();

  // Trust proxy for rate limiting and IP detection
  app.set('trust proxy', 1);

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: config.api.corsOrigin,
      credentials: config.api.corsCredentials,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-API-Key',
        'X-Request-ID',
        'X-Forwarded-For',
      ],
      exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: req =>
      // Skip rate limiting for health checks
      req.path === '/health' || req.path === '/api/health',
    keyGenerator: req =>
      // Use API key if available, otherwise use IP
      (req.get('X-API-Key') || req.ip) ?? 'unknown',
  });

  app.use('/api', limiter);

  // Compression
  app.use(
    compression({
      filter: (req: express.Request, res: express.Response) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      threshold: 1024, // Only compress responses larger than 1KB
    })
  );

  // Body parsing middleware
  app.use(
    express.json({
      limit: config.performance.maxRequestSize,
      strict: true,
    })
  );

  app.use(
    express.urlencoded({
      extended: true,
      limit: config.performance.maxRequestSize,
    })
  );

  // Interactive API Explorer (Swagger UI) - Must be before API middleware to avoid auth
  try {
    const openApiSpecPath = path.join(__dirname, '../docs/api/openapi.yaml');
    const openApiSpec = YAML.load(openApiSpecPath);

    app.use(
      '/api/docs',
      swaggerUi.serve,
      swaggerUi.setup(openApiSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'MCP Kanban API Explorer',
        customfavIcon: '/favicon.ico',
        swaggerOptions: {
          docExpansion: 'list',
          filter: true,
          showRequestHeaders: true,
          tryItOutEnabled: true,
          requestInterceptor: (req: any) => {
            // Add authentication header if available
            if (req.headers && !req.headers.Authorization) {
              const apiKey = req.headers['x-api-key'] || req.headers.authorization;
              if (apiKey) {
                req.headers.Authorization = `Bearer ${apiKey}`;
              }
            }
            return req;
          },
        },
      })
    );

    logger.info('Interactive API Explorer available at /api/docs');
  } catch (error) {
    logger.warn('Failed to load OpenAPI specification for interactive explorer', { error });
  }

  // API middleware
  const apiMiddleware = await createApiMiddleware();
  app.use('/api', apiMiddleware);

  // Health check endpoint
  app.get('/health', async (_req, res) => {
    const health = await dbConnection.healthCheck();

    const status = health.connected && health.responsive ? 'healthy' : 'unhealthy';
    const statusCode = status === 'healthy' ? 200 : 503;

    res.status(statusCode).json({
      status,
      timestamp: new Date().toISOString(),
      version: config.mcp.serverVersion,
      database: {
        connected: health.connected,
        responsive: health.responsive,
        responseTime: health.stats?.responseTime,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });

  // Root endpoint
  app.get('/', (_req, res) => {
    res.json({
      name: config.mcp.serverName,
      version: config.mcp.serverVersion,
      description: 'MCP Kanban Task Management Server',
      documentation: '/api/docs',
      health: '/health',
      endpoints: {
        api: '/api/v1',
        websocket: `ws://localhost:${String(String(config.websocket.port))}${String(String(config.websocket.path))}`,
        interactiveExplorer: '/api/docs',
      },
    });
  });

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      code: 'NOT_FOUND',
      message: `The requested resource ${String(String(req.originalUrl))} was not found`,
      timestamp: new Date().toISOString(),
    });
  });

  // Global error handler
  app.use(
    (error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const serviceError = globalErrorHandler.handleError(error, {
        service: 'ExpressServer',
        method: req.method,
        metadata: {
          url: req.originalUrl,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        },
      });

      logger.error('HTTP request error', {
        requestId: req.get('X-Request-ID'),
        method: req.method,
        url: req.originalUrl,
        statusCode: serviceError.statusCode,
        error: serviceError.message,
        stack: serviceError.stack,
      });

      res.status(serviceError.statusCode).json({
        error: serviceError.message,
        code: serviceError.code,
        timestamp: new Date().toISOString(),
        requestId: req.get('X-Request-ID'),
        ...(config.server.nodeEnv === 'development' && {
          details: serviceError.details,
          stack: serviceError.stack,
        }),
      });
    }
  );

  return app;
}

export async function startServer(): Promise<{
  app: express.Application;
  server: any;
  webSocketManager: any;
}> {
  try {
    // Initialize database
    logger.info('Initializing database connection...');
    await dbConnection.initialize();

    // Create Express app
    logger.info('Creating Express server...');
    const app = await createServer();

    // Start WebSocket server conditionally
    let webSocketManager: any = null;
    if (enableWebSockets) {
      logger.info('Starting WebSocket server...');
      const { webSocketManager: wsManager } = await import('@/websocket');
      webSocketManager = wsManager;
      await webSocketManager.start();
    } else {
      logger.info('WebSocket server disabled via environment configuration');
    }

    // Start server
    logger.info('Starting HTTP server...', {
      host: config.server.host,
      port: config.server.port,
    });
    
    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info('Server started successfully', {
        host: config.server.host,
        port: config.server.port,
        nodeEnv: config.server.nodeEnv,
        version: config.mcp.serverVersion,
        websocket: {
          host: config.websocket.host,
          port: config.websocket.port,
          path: config.websocket.path,
        },
      });
    });

    // Handle server errors
    server.on('error', (error: any) => {
      logger.error('Server error:', { error: error.message, code: error.code, port: config.server.port });
      throw error;
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string): void => {
      logger.info(`Received ${String(signal)}, starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Stop WebSocket server conditionally
          if (enableWebSockets && webSocketManager) {
            await webSocketManager.stop();
            logger.info('WebSocket server closed');
          }

          await dbConnection.close();
          logger.info('Database connection closed');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forceful shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined,
        promise,
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', error => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });

    return { app, server, webSocketManager: webSocketManager || null };
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}
