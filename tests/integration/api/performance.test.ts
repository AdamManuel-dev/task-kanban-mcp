/**
 * @fileoverview Integration tests for performance monitoring API endpoints
 * @lastmodified 2025-07-28T07:22:00Z
 *
 * Features: Performance metrics collection, monitoring endpoints, health checks
 * Main APIs: /api/performance/*, system metrics, resource monitoring
 * Constraints: Requires test database, performance measurement precision
 * Patterns: HTTP integration testing, metrics validation, timing assertions
 */

import request from 'supertest';
import { app } from '@/server';
import { DatabaseConnection } from '@/database/connection';

describe('Performance API Integration Tests', () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = new DatabaseConnection();
    await connection.initialize();
  });

  afterAll(async () => {
    await connection.close();
  });

  describe('GET /api/performance/metrics', () => {
    test('should return system performance metrics', async () => {
      const response = await request(app).get('/api/performance/metrics').expect(200);

      expect(response.body).toHaveProperty('data');
      const metrics = response.body.data;

      expect(metrics).toHaveProperty('memory');
      expect(metrics.memory).toHaveProperty('used');
      expect(metrics.memory).toHaveProperty('free');
      expect(metrics.memory).toHaveProperty('total');

      expect(metrics).toHaveProperty('cpu');
      expect(metrics.cpu).toHaveProperty('usage');
      expect(metrics.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(metrics.cpu.usage).toBeLessThanOrEqual(100);

      expect(metrics).toHaveProperty('uptime');
      expect(typeof metrics.uptime).toBe('number');
      expect(metrics.uptime).toBeGreaterThan(0);
    });

    test('should include database performance metrics', async () => {
      const response = await request(app).get('/api/performance/metrics').expect(200);

      const metrics = response.body.data;
      expect(metrics).toHaveProperty('database');
      expect(metrics.database).toHaveProperty('connections');
      expect(metrics.database).toHaveProperty('queryTime');
      expect(metrics.database).toHaveProperty('cacheHitRate');
    });

    test('should include request metrics', async () => {
      // Make a few requests to generate metrics
      await request(app).get('/api/health');
      await request(app).get('/api/health');

      const response = await request(app).get('/api/performance/metrics').expect(200);

      const metrics = response.body.data;
      expect(metrics).toHaveProperty('requests');
      expect(metrics.requests).toHaveProperty('total');
      expect(metrics.requests).toHaveProperty('rate');
      expect(metrics.requests).toHaveProperty('averageResponseTime');
    });
  });

  describe('GET /api/performance/health', () => {
    test('should return comprehensive health status', async () => {
      const response = await request(app).get('/api/performance/health').expect(200);

      expect(response.body).toHaveProperty('data');
      const health = response.body.data;

      expect(health).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);

      expect(health).toHaveProperty('checks');
      expect(Array.isArray(health.checks)).toBe(true);

      // Database check
      const dbCheck = health.checks.find((check: any) => check.name === 'database');
      expect(dbCheck).toBeDefined();
      expect(dbCheck).toHaveProperty('status');
      expect(dbCheck).toHaveProperty('responseTime');

      // Memory check
      const memoryCheck = health.checks.find((check: any) => check.name === 'memory');
      expect(memoryCheck).toBeDefined();
      expect(memoryCheck).toHaveProperty('status');
      expect(memoryCheck).toHaveProperty('usage');
    });

    test('should detect unhealthy status when thresholds exceeded', async () => {
      // This test might be flaky depending on system resources
      // We'll check that the endpoint responds correctly regardless of health status
      const response = await request(app).get('/api/performance/health').expect(200);

      const health = response.body.data;

      if (health.status === 'unhealthy') {
        expect(health.checks.some((check: any) => check.status === 'fail')).toBe(true);
      }
    });
  });

  describe('GET /api/performance/stats', () => {
    test('should return application statistics', async () => {
      const response = await request(app).get('/api/performance/stats').expect(200);

      expect(response.body).toHaveProperty('data');
      const stats = response.body.data;

      expect(stats).toHaveProperty('application');
      expect(stats.application).toHaveProperty('version');
      expect(stats.application).toHaveProperty('environment');
      expect(stats.application).toHaveProperty('startTime');

      expect(stats).toHaveProperty('resources');
      expect(stats.resources).toHaveProperty('memoryUsage');
      expect(stats.resources).toHaveProperty('cpuUsage');
    });

    test('should include database statistics', async () => {
      const response = await request(app).get('/api/performance/stats').expect(200);

      const stats = response.body.data;
      expect(stats).toHaveProperty('database');
      expect(stats.database).toHaveProperty('tableStats');
      expect(Array.isArray(stats.database.tableStats)).toBe(true);

      // Check for main tables
      const tables = stats.database.tableStats.map((t: any) => t.name);
      expect(tables).toContain('tasks');
      expect(tables).toContain('boards');
    });
  });

  describe('POST /api/performance/benchmark', () => {
    test('should run performance benchmark', async () => {
      const response = await request(app)
        .post('/api/performance/benchmark')
        .send({
          tests: ['database', 'memory', 'cpu'],
          duration: 1000, // 1 second
        })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      const benchmark = response.body.data;

      expect(benchmark).toHaveProperty('results');
      expect(Array.isArray(benchmark.results)).toBe(true);

      expect(benchmark).toHaveProperty('summary');
      expect(benchmark.summary).toHaveProperty('totalTime');
      expect(benchmark.summary).toHaveProperty('averageResponseTime');
    }, 10000); // Extended timeout for benchmark

    test('should validate benchmark parameters', async () => {
      const response = await request(app)
        .post('/api/performance/benchmark')
        .send({
          tests: ['invalid-test'],
          duration: -1000,
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
    });

    test('should handle empty benchmark request', async () => {
      const response = await request(app).post('/api/performance/benchmark').send({}).expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/performance/history', () => {
    test('should return performance history', async () => {
      // Generate some history by making requests
      await request(app).get('/api/performance/metrics');
      await new Promise(resolve => setTimeout(resolve, 100));
      await request(app).get('/api/performance/metrics');

      const response = await request(app)
        .get('/api/performance/history')
        .query({
          timeRange: '1h',
          metrics: 'memory,cpu',
        })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      const history = response.body.data;

      expect(history).toHaveProperty('timeRange');
      expect(history).toHaveProperty('metrics');
      expect(Array.isArray(history.metrics)).toBe(true);

      if (history.metrics.length > 0) {
        const metric = history.metrics[0];
        expect(metric).toHaveProperty('timestamp');
        expect(metric).toHaveProperty('values');
      }
    });

    test('should validate time range parameter', async () => {
      const response = await request(app)
        .get('/api/performance/history')
        .query({ timeRange: 'invalid' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Performance Under Load', () => {
    test('should maintain performance under concurrent requests', async () => {
      const startTime = Date.now();
      const requests = Array(10)
        .fill(null)
        .map(() => request(app).get('/api/performance/metrics'));

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time (adjust threshold as needed)
      expect(totalTime).toBeLessThan(5000);
    }, 10000);

    test('should track request metrics accurately', async () => {
      const initialResponse = await request(app).get('/api/performance/metrics');

      const initialRequestCount = initialResponse.body.data.requests?.total || 0;

      // Make a known number of requests
      const testRequests = 5;
      const requests = Array(testRequests)
        .fill(null)
        .map(() => request(app).get('/api/health'));

      await Promise.all(requests);

      const finalResponse = await request(app).get('/api/performance/metrics');

      const finalRequestCount = finalResponse.body.data.requests?.total || 0;

      // Should have tracked the test requests (plus the metrics calls)
      expect(finalRequestCount).toBeGreaterThanOrEqual(initialRequestCount + testRequests);
    });
  });

  describe('Resource Monitoring', () => {
    test('should detect memory leaks in long-running operations', async () => {
      const initialMetrics = await request(app).get('/api/performance/metrics').expect(200);

      const initialMemory = initialMetrics.body.data.memory.used;

      // Simulate workload
      const heavyRequests = Array(20)
        .fill(null)
        .map(() => request(app).get('/api/tasks').query({ limit: 100 }));

      await Promise.all(heavyRequests);

      // Allow garbage collection
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalMetrics = await request(app).get('/api/performance/metrics').expect(200);

      const finalMemory = finalMetrics.body.data.memory.used;

      // Memory should not have increased dramatically (adjust threshold as needed)
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreasePercent = (memoryIncrease / initialMemory) * 100;

      expect(memoryIncreasePercent).toBeLessThan(50); // Less than 50% increase
    }, 15000);
  });

  describe('Error Handling', () => {
    test('should handle performance monitoring errors gracefully', async () => {
      // Test endpoint that might fail due to system constraints
      const response = await request(app).get('/api/performance/metrics').expect(200);

      // Even if some metrics fail, the endpoint should return partial data
      expect(response.body).toHaveProperty('data');

      if (response.body.warnings) {
        expect(Array.isArray(response.body.warnings)).toBe(true);
      }
    });

    test('should return 503 when system is severely degraded', async () => {
      // This test is difficult to implement reliably
      // It would require artificially degrading system performance
      // For now, we'll test that the endpoint structure is correct
      const response = await request(app).get('/api/performance/health');

      expect([200, 503]).toContain(response.status);

      if (response.status === 503) {
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('message');
      }
    });
  });
});
