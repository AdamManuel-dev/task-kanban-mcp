/**
 * Analytics API Routes
 * Provides endpoints for accessing completion analytics, velocity metrics, and productivity insights
 */

import { Router } from 'express';
import { asyncHandler } from '@/middleware/asyncHandler';
import { AnalyticsService } from '@/services/AnalyticsService';
import { logger } from '@/utils/logger';

const router = Router();
const analyticsService = AnalyticsService.getInstance();

/**
 * @swagger
 * /api/v1/analytics/completion:
 *   get:
 *     summary: Get task completion analytics
 *     tags: [Analytics]
 *     parameters:
 *       - name: boardId
 *         in: query
 *         schema:
 *           type: string
 *       - name: timeframe
 *         in: query
 *         schema:
 *           type: integer
 *           description: Timeframe in days
 *     responses:
 *       200:
 *         description: Completion analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CompletionAnalytics'
 */
router.get(
  '/completion',
  asyncHandler(async (req, res) => {
    const boardId = req.query.boardId as string | undefined;
    const timeframe = req.query.timeframe ? Number(req.query.timeframe) : undefined;

    logger.info('Fetching completion analytics', { boardId, timeframe });

    const analytics = await analyticsService.getCompletionAnalytics(boardId, timeframe);

    res.json({
      success: true,
      data: analytics,
    });
  })
);

/**
 * @swagger
 * /api/v1/analytics/velocity:
 *   get:
 *     summary: Get velocity metrics
 *     tags: [Analytics]
 *     parameters:
 *       - name: boardId
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Velocity metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/VelocityMetrics'
 */
router.get(
  '/velocity',
  asyncHandler(async (req, res) => {
    const { boardId } = req.query as { boardId?: string };

    logger.info('Fetching velocity metrics', { boardId });

    const metrics = await analyticsService.getVelocityMetrics(boardId);

    res.json({
      success: true,
      data: metrics,
    });
  })
);

/**
 * @swagger
 * /api/v1/analytics/productivity:
 *   get:
 *     summary: Get productivity insights
 *     tags: [Analytics]
 *     parameters:
 *       - name: boardId
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Productivity insights
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ProductivityInsights'
 */
router.get(
  '/productivity',
  asyncHandler(async (req, res) => {
    const { boardId } = req.query as { boardId?: string };

    logger.info('Fetching productivity insights', { boardId });

    const insights = await analyticsService.getProductivityInsights(boardId);

    res.json({
      success: true,
      data: insights,
    });
  })
);

/**
 * @swagger
 * /api/v1/analytics/dashboard:
 *   get:
 *     summary: Get analytics dashboard data
 *     tags: [Analytics]
 *     parameters:
 *       - name: boardId
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Analytics dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AnalyticsDashboard'
 */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const { boardId } = req.query as { boardId?: string };

    logger.info('Fetching analytics dashboard', { boardId });

    const dashboard = await analyticsService.getDashboardAnalytics(boardId);

    res.json({
      success: true,
      data: dashboard,
    });
  })
);

export default router;
