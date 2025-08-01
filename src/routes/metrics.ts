/**
 * @fileoverview Service performance metrics API endpoints
 * @lastmodified 2025-07-28T16:45:00Z
 *
 * Features: Metrics endpoints, Prometheus export, service stats, health monitoring
 * Main APIs: GET /metrics, GET /metrics/prometheus, GET /metrics/services/:name
 * Constraints: Requires service metrics collection to be active
 * Patterns: Express router, metrics aggregation, format conversion
 */

import { Router } from 'express';
import {
  serviceMetricsCollector,
  formatServiceMetrics,
  exportPrometheusMetrics,
  startMetricsReporting,
} from '../utils/service-metrics';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Get overall metrics summary
 */
router.get('/', (req, res) => {
  try {
    const summary = serviceMetricsCollector.generateSummaryReport();
    res.json({
      success: true,
      data: summary,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to get metrics summary', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics',
    });
  }
});

/**
 * Get metrics for a specific service
 */
router.get('/services/:serviceName', (req, res) => {
  try {
    const { serviceName } = req.params;
    const metrics = serviceMetricsCollector.getServiceMetrics(serviceName);

    if (!metrics) {
      res.status(404).json({
        success: false,
        error: `No metrics found for service: ${serviceName}`,
      });
      return;
    }

    // Convert Map to plain object for JSON serialization
    const metricsData = {
      ...metrics,
      methodMetrics: Array.from(metrics.methodMetrics.entries()).map(([name, stats]) => ({
        ...stats,
        methodName: name,
      })),
    };

    res.json({
      success: true,
      data: metricsData,
      formatted: formatServiceMetrics(serviceName),
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to get service metrics', { error, serviceName: req.params.serviceName });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve service metrics',
    });
  }
});

/**
 * Get all service names that have metrics
 */
router.get('/services', (req, res) => {
  try {
    const allMetrics = serviceMetricsCollector.getAllMetrics();
    const services = Array.from(allMetrics.keys()).map(serviceName => {
      const metrics = allMetrics.get(serviceName)!;
      return {
        name: serviceName,
        totalCalls: metrics.totalCalls,
        averageTime: metrics.averageTime,
        errorRate: metrics.errorRate,
        healthScore: metrics.healthScore,
        lastActive: metrics.lastActive,
        methodCount: metrics.methodMetrics.size,
      };
    });

    res.json({
      success: true,
      data: services,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to get services list', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve services list',
    });
  }
});

/**
 * Get top performing services
 */
router.get('/top-performers', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const topServices = serviceMetricsCollector.getTopPerformingServices(limit);

    res.json({
      success: true,
      data: topServices.map(service => ({
        ...service,
        methodMetrics: Array.from(service.methodMetrics.entries()).map(([name, stats]) => ({
          ...stats,
          methodName: name,
        })),
      })),
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to get top performers', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve top performers',
    });
  }
});

/**
 * Get slowest services
 */
router.get('/slowest', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const slowestServices = serviceMetricsCollector.getSlowestServices(limit);

    res.json({
      success: true,
      data: slowestServices.map(service => ({
        ...service,
        methodMetrics: Array.from(service.methodMetrics.entries()).map(([name, stats]) => ({
          ...stats,
          methodName: name,
        })),
      })),
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to get slowest services', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve slowest services',
    });
  }
});

/**
 * Get services with highest error rates
 */
router.get('/highest-errors', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const highErrorServices = serviceMetricsCollector.getHighestErrorRateServices(limit);

    res.json({
      success: true,
      data: highErrorServices.map(service => ({
        ...service,
        methodMetrics: Array.from(service.methodMetrics.entries()).map(([name, stats]) => ({
          ...stats,
          methodName: name,
        })),
      })),
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to get highest error services', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve highest error services',
    });
  }
});

/**
 * Export metrics in Prometheus format
 */
router.get('/prometheus', (req, res) => {
  try {
    const prometheusMetrics = exportPrometheusMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(prometheusMetrics);
  } catch (error) {
    logger.error('Failed to export Prometheus metrics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to export Prometheus metrics',
    });
  }
});

/**
 * Reset all metrics (admin endpoint)
 */
router.post('/reset', (req, res) => {
  try {
    serviceMetricsCollector.resetMetrics();
    logger.info('Service metrics reset via API');

    res.json({
      success: true,
      message: 'All service metrics have been reset',
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to reset metrics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to reset metrics',
    });
  }
});

/**
 * Start periodic metrics reporting
 */
router.post('/reporting/start', (req, res) => {
  try {
    const intervalMs = parseInt(req.body.intervalMs) || 300000; // 5 minutes default
    startMetricsReporting(intervalMs);

    res.json({
      success: true,
      message: 'Periodic metrics reporting started',
      intervalMs,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Failed to start metrics reporting', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to start metrics reporting',
    });
  }
});

/**
 * Health check endpoint with basic metrics
 */
router.get('/health', (req, res) => {
  try {
    const summary = serviceMetricsCollector.generateSummaryReport();
    const isHealthy = summary.overallErrorRate < 10 && summary.overallAverageTime < 5000;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      metrics: {
        totalServices: summary.totalServices,
        totalCalls: summary.totalCalls,
        errorRate: summary.overallErrorRate,
        averageTime: summary.overallAverageTime,
        healthScore: summary.averageHealthScore,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: Date.now(),
    });
  }
});

export default router;
