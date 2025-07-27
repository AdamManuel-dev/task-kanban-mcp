import type { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Log incoming request
  logger.info('HTTP request started', {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    contentLength: req.get('Content-Length'),
  });

  // Override res.end to log response
  const originalEnd = res.end.bind(res);
  (res.end as any) = function logResponseEnd(this: Response, ...args: any[]) {
    const duration = Date.now() - startTime;

    logger.info('HTTP request completed', {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${String(duration)}ms`,
      contentLength: res.get('Content-Length'),
    });

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow HTTP request detected', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        duration: `${String(duration)}ms`,
      });
    }

    return originalEnd.apply(this, args as [any, BufferEncoding, (() => void)?]);
  };

  next();
}
