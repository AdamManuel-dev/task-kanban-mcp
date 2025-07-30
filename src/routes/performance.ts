/**
 * Performance Monitoring API Routes
 * Provides endpoints for accessing performance metrics, health status, and dashboards
 */

import { Router } from 'express';
import { asyncHandler } from '@/middleware/asyncHandler';
import { validateRequest } from '@/middleware/validation';
import { performanceMonitor } from '@/services/PerformanceMonitoringService';
import { logger } from '@/utils/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const timeframeSchema = z.object({
  hours: z.number().min(1).max(168).optional(), // Max 1 week
  minutes: z.number().min(1).max(60).optional(),
});

const endpointMetricsSchema = z.object({
  endpoint: z.string(),
  timeframe: z.number().min(60000).max(604800000).optional(), // 1 minute to 1 week in ms
});

const alertRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  condition: z.object({
    metric: z.enum(['responseTime', 'errorRate', 'memoryUsage', 'dbQueryTime']),
    operator: z.enum(['>', '<', '=', '>=', '<=']),
    threshold: z.number().positive(),
    duration: z.number().positive(), // seconds
  }),
  severity: z.enum(['warning', 'error', 'critical']),
  action: z.enum(['log', 'email', 'webhook']),
  enabled: z.boolean(),
});

/**
 * @swagger
 * /api/performance/health:
 *   get:
 *     summary: Get current system health metrics
 *     tags: [Performance]
 *     responses:
 *       200:
 *         description: System health metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uptime:
 *                   type: number
 *                   description: System uptime in milliseconds
 *                 memoryUsage:
 *                   type: object
 *                   description: Node.js memory usage
 *                 cpuUsage:
 *                   type: object
 *                   description: CPU usage metrics
 *                 requestsPerMinute:
 *                   type: number
 *                   description: Number of requests in the last minute
 *                 errorRate:
 *                   type: number
 *                   description: Error rate percentage
 *                 averageResponseTime:
 *                   type: number
 *                   description: Average response time in milliseconds
 */
router.get(
  '/health',
  asyncHandler(async (req, res, next): Promise<void> => {
    const health = performanceMonitor.getSystemHealth();

    logger.debug('System health requested', {
      uptime: health.uptime,
      errorRate: health.errorRate,
      averageResponseTime: health.averageResponseTime,
    });

    res.json({
      success: true,
      data: health,
      timestamp: Date.now(),
    });
  })
);

/**
 * @swagger
 * /api/performance/dashboard:
 *   get:
 *     summary: Get performance dashboard data
 *     tags: [Performance]
 *     responses:
 *       200:
 *         description: Complete performance dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 overview:
 *                   type: object
 *                   description: Overview metrics
 *                 realtime:
 *                   type: object
 *                   description: Real-time metrics
 *                 trends:
 *                   type: object
 *                   description: Performance trends
 *                 topEndpoints:
 *                   type: array
 *                   description: Top performing endpoints
 *                 slowQueries:
 *                   type: array
 *                   description: Slow database queries
 *                 alerts:
 *                   type: array
 *                   description: Active alerts
 */
router.get(
  '/dashboard',
  asyncHandler(async (req, res, next): Promise<void> => {
    const dashboard = performanceMonitor.getDashboard();

    logger.debug('Performance dashboard requested', {
      totalRequests: dashboard.overview.totalRequests,
      healthScore: dashboard.overview.healthScore,
      activeAlerts: dashboard.alerts.length,
    });

    res.json({
      success: true,
      data: dashboard,
      timestamp: Date.now(),
    });
  })
);

/**
 * @swagger
 * /api/performance/metrics/endpoint:
 *   get:
 *     summary: Get performance metrics for a specific endpoint
 *     tags: [Performance]
 *     parameters:
 *       - in: query
 *         name: endpoint
 *         required: true
 *         schema:
 *           type: string
 *         description: The endpoint to get metrics for
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: number
 *         description: Timeframe in milliseconds (default 1 hour)
 *     responses:
 *       200:
 *         description: Endpoint performance metrics
 */
router.get(
  '/metrics/endpoint',
  asyncHandler(async (req, res, next): Promise<void> => {
    const endpoint = req.query.endpoint as string;
    const timeframe = req.query.timeframe ? Number(req.query.timeframe) : undefined;

    const metrics = performanceMonitor.getEndpointMetrics(endpoint, timeframe);

    // Calculate statistics
    const totalRequests = metrics.length;
    const averageResponseTime =
      totalRequests > 0 ? metrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests : 0;
    const errorCount = metrics.filter(m => m.statusCode >= 400).length;
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
    const maxResponseTime = Math.max(...metrics.map(m => m.responseTime), 0);
    const minResponseTime = Math.min(...metrics.map(m => m.responseTime), 0);

    // Calculate percentiles
    const sortedTimes = metrics.map(m => m.responseTime).sort((a, b) => a - b);
    const p95 = totalRequests > 0 ? (sortedTimes[Math.floor(totalRequests * 0.95)] ?? 0) : 0;
    const p99 = totalRequests > 0 ? (sortedTimes[Math.floor(totalRequests * 0.99)] ?? 0) : 0;

    logger.debug('Endpoint metrics requested', {
      endpoint,
      timeframe,
      totalRequests,
      averageResponseTime,
      errorRate,
    });

    res.json({
      success: true,
      data: {
        endpoint,
        timeframe: timeframe || 3600000,
        statistics: {
          totalRequests,
          averageResponseTime,
          errorRate,
          maxResponseTime,
          minResponseTime,
          p95ResponseTime: p95,
          p99ResponseTime: p99,
        },
        metrics: metrics.slice(-100), // Return last 100 metrics
      },
      timestamp: Date.now(),
    });
  })
);

/**
 * @swagger
 * /api/performance/export:
 *   get:
 *     summary: Export performance metrics
 *     tags: [Performance]
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, prometheus]
 *         description: Export format
 *     responses:
 *       200:
 *         description: Exported metrics
 */
router.get(
  '/export',
  asyncHandler(async (req, res, next): Promise<void> => {
    const format = (req.query.format as 'json' | 'prometheus') || 'json';

    const metrics = performanceMonitor.exportMetrics(format);

    if (format === 'prometheus') {
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    } else {
      res.json({
        success: true,
        data: JSON.parse(metrics),
        timestamp: Date.now(),
      });
    }

    logger.debug('Performance metrics exported', { format });
  })
);

/**
 * @swagger
 * /api/performance/alerts:
 *   get:
 *     summary: Get all alert rules
 *     tags: [Performance]
 *     responses:
 *       200:
 *         description: List of alert rules
 */
router.get(
  '/alerts',
  asyncHandler(async (req, res, next): Promise<void> => {
    // Access private alertRules through a public method (would need to add this to the service)
    const alertRules: unknown[] = []; // performanceMonitor.getAlertRules();

    res.json({
      success: true,
      data: alertRules,
      timestamp: Date.now(),
    });
  })
);

/**
 * @swagger
 * /api/performance/alerts:
 *   post:
 *     summary: Create a new alert rule
 *     tags: [Performance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *               condition:
 *                 type: object
 *               severity:
 *                 type: string
 *               action:
 *                 type: string
 *               enabled:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Alert rule created
 */
router.post(
  '/alerts',
  validateRequest(alertRuleSchema),
  asyncHandler(async (req, res, next): Promise<void> => {
    const alertRule = req.body;

    performanceMonitor.addAlertRule(alertRule);

    logger.info('Alert rule created', {
      ruleId: alertRule.id,
      name: alertRule.name,
      severity: alertRule.severity,
    });

    res.status(201).json({
      success: true,
      message: 'Alert rule created successfully',
      data: alertRule,
      timestamp: Date.now(),
    });
  })
);

/**
 * @swagger
 * /api/performance/alerts/{ruleId}:
 *   delete:
 *     summary: Delete an alert rule
 *     tags: [Performance]
 *     parameters:
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alert rule deleted
 *       404:
 *         description: Alert rule not found
 */
router.delete(
  '/alerts/:ruleId',
  asyncHandler(async (req, res, next): Promise<void> => {
    const { ruleId } = req.params;

    const deleted = performanceMonitor.removeAlertRule(ruleId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: {
          code: 'ALERT_RULE_NOT_FOUND',
          message: 'Alert rule not found',
        },
      });
      return;
    }

    logger.info('Alert rule deleted', { ruleId });

    res.json({
      success: true,
      message: 'Alert rule deleted successfully',
      timestamp: Date.now(),
    });
  })
);

/**
 * @swagger
 * /api/performance/status:
 *   get:
 *     summary: Get a simple health status for monitoring systems
 *     tags: [Performance]
 *     responses:
 *       200:
 *         description: System is healthy
 *       503:
 *         description: System is unhealthy
 */
router.get(
  '/status',
  asyncHandler(async (req, res, next): Promise<void> => {
    const health = performanceMonitor.getSystemHealth();
    const dashboard = performanceMonitor.getDashboard();

    // Simple health check logic
    const isHealthy =
      health.errorRate < 20 &&
      health.averageResponseTime < 5000 &&
      dashboard.overview.healthScore > 50;

    const status = isHealthy ? 'healthy' : 'unhealthy';
    const statusCode = isHealthy ? 200 : 503;

    logger.debug('Health status check', {
      status,
      errorRate: health.errorRate,
      averageResponseTime: health.averageResponseTime,
      healthScore: dashboard.overview.healthScore,
    });

    res.status(statusCode).json({
      status,
      timestamp: Date.now(),
      checks: {
        errorRate: health.errorRate < 20,
        responseTime: health.averageResponseTime < 5000,
        healthScore: dashboard.overview.healthScore > 50,
      },
      details: {
        errorRate: health.errorRate,
        averageResponseTime: health.averageResponseTime,
        healthScore: dashboard.overview.healthScore,
        uptime: health.uptime,
      },
    });
  })
);

/**
 * @swagger
 * /api/performance/trends:
 *   get:
 *     summary: Get performance trends over time
 *     tags: [Performance]
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: number
 *           minimum: 1
 *           maximum: 168
 *         description: Number of hours to look back (max 1 week)
 *     responses:
 *       200:
 *         description: Performance trends data
 */
router.get(
  '/trends',
  validateRequest(timeframeSchema),
  asyncHandler(async (req, res, next): Promise<void> => {
    const { hours = 24 } = req.query as { hours?: number };
    const dashboard = performanceMonitor.getDashboard();

    // For now, return the trends from dashboard
    // In a full implementation, this would calculate trends for the specific timeframe
    const { trends } = dashboard;

    logger.debug('Performance trends requested', { hours });

    res.json({
      success: true,
      data: {
        timeframe: `${hours} hours`,
        trends,
      },
      timestamp: Date.now(),
    });
  })
);

export default router;
