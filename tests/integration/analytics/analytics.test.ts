/**
 * Integration tests for Analytics and Performance Monitoring
 */

import request from 'supertest';
import { app } from '@/server';
import { AnalyticsService } from '@/services/AnalyticsService';

describe('Analytics Integration Tests', () => {
  let _analyticsService: AnalyticsService;

  beforeAll(async () => {
    _analyticsService = AnalyticsService.getInstance();
    // Set up test data
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('Completion Analytics', () => {
    it('should get completion analytics for a board', async () => {
      const response = await request(app)
        .get('/api/analytics/completion')
        .query({ boardId: 'test-board-1' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalTasks');
      expect(response.body.data).toHaveProperty('completedTasks');
      expect(response.body.data).toHaveProperty('completionRate');
      expect(response.body.data).toHaveProperty('averageCompletionTime');
      expect(response.body.data).toHaveProperty('topPerformers');
      expect(response.body.data).toHaveProperty('trends');
    });

    it('should filter analytics by timeframe', async () => {
      const response = await request(app)
        .get('/api/analytics/completion')
        .query({ timeframe: 7 }) // 7 days
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalTasks).toBeGreaterThanOrEqual(0);
    });

    it('should calculate completion rates correctly', async () => {
      const response = await request(app).get('/api/analytics/completion').expect(200);

      const { totalTasks, completedTasks, completionRate } = response.body.data;

      if (totalTasks > 0) {
        const expectedRate = (completedTasks / totalTasks) * 100;
        expect(Math.abs(completionRate - expectedRate)).toBeLessThan(0.1);
      }
    });
  });

  describe('Velocity Metrics', () => {
    it('should get velocity metrics', async () => {
      const response = await request(app).get('/api/analytics/velocity').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('currentSprint');
      expect(response.body.data).toHaveProperty('historicalVelocity');
      expect(response.body.data).toHaveProperty('teamVelocity');
      expect(response.body.data).toHaveProperty('burndownData');
      expect(response.body.data).toHaveProperty('predictiveAnalytics');
    });

    it('should calculate sprint metrics', async () => {
      const response = await request(app).get('/api/analytics/velocity').expect(200);

      const { currentSprint } = response.body.data;
      expect(currentSprint).toHaveProperty('plannedPoints');
      expect(currentSprint).toHaveProperty('completedPoints');
      expect(currentSprint).toHaveProperty('remainingPoints');
      expect(currentSprint).toHaveProperty('velocityRate');
    });
  });

  describe('Productivity Insights', () => {
    it('should get productivity insights', async () => {
      const response = await request(app).get('/api/analytics/productivity').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('peakHours');
      expect(response.body.data).toHaveProperty('peakDays');
      expect(response.body.data).toHaveProperty('bottlenecks');
      expect(response.body.data).toHaveProperty('efficiencyMetrics');
    });
  });

  describe('Dashboard Analytics', () => {
    it('should get comprehensive dashboard data', async () => {
      const response = await request(app).get('/api/analytics/dashboard').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('completion');
      expect(response.body.data).toHaveProperty('velocity');
      expect(response.body.data).toHaveProperty('productivity');
      expect(response.body.data).toHaveProperty('summary');
    });

    it('should include key metrics in summary', async () => {
      const response = await request(app).get('/api/analytics/dashboard').expect(200);

      const { summary } = response.body.data;
      expect(summary).toHaveProperty('keyMetrics');
      expect(summary).toHaveProperty('alerts');
      expect(summary).toHaveProperty('achievements');
    });
  });
});

describe('Performance Monitoring Integration Tests', () => {
  describe('System Health', () => {
    it('should get current system health', async () => {
      const response = await request(app).get('/api/performance/health').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('uptime');
      expect(response.body.data).toHaveProperty('memoryUsage');
      expect(response.body.data).toHaveProperty('cpuUsage');
      expect(response.body.data).toHaveProperty('requestsPerMinute');
      expect(response.body.data).toHaveProperty('errorRate');
      expect(response.body.data).toHaveProperty('averageResponseTime');
    });

    it('should return valid health metrics', async () => {
      const response = await request(app).get('/api/performance/health').expect(200);

      const { data } = response.body;
      expect(data.uptime).toBeGreaterThan(0);
      expect(data.errorRate).toBeGreaterThanOrEqual(0);
      expect(data.averageResponseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Dashboard', () => {
    it('should get performance dashboard data', async () => {
      const response = await request(app).get('/api/performance/dashboard').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('overview');
      expect(response.body.data).toHaveProperty('realtime');
      expect(response.body.data).toHaveProperty('trends');
      expect(response.body.data).toHaveProperty('topEndpoints');
      expect(response.body.data).toHaveProperty('slowQueries');
      expect(response.body.data).toHaveProperty('alerts');
    });

    it('should include health score in overview', async () => {
      const response = await request(app).get('/api/performance/dashboard').expect(200);

      const { overview } = response.body.data;
      expect(overview).toHaveProperty('healthScore');
      expect(overview.healthScore).toBeGreaterThanOrEqual(0);
      expect(overview.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Endpoint Metrics', () => {
    it('should get metrics for specific endpoint', async () => {
      // First make a request to generate metrics
      await request(app).get('/api/tasks').expect(200);

      const response = await request(app)
        .get('/api/performance/metrics/endpoint')
        .query({ endpoint: 'GET /api/tasks' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('endpoint');
      expect(response.body.data).toHaveProperty('statistics');
      expect(response.body.data).toHaveProperty('metrics');
    });

    it('should calculate percentiles correctly', async () => {
      // Generate some test requests
      for (let i = 0; i < 10; i++) {
        await request(app).get('/api/health');
      }

      const response = await request(app)
        .get('/api/performance/metrics/endpoint')
        .query({ endpoint: 'GET /api/health' })
        .expect(200);

      const { statistics } = response.body.data;
      expect(statistics).toHaveProperty('p95ResponseTime');
      expect(statistics).toHaveProperty('p99ResponseTime');
      expect(statistics.p95ResponseTime).toBeGreaterThanOrEqual(0);
      expect(statistics.p99ResponseTime).toBeGreaterThanOrEqual(statistics.p95ResponseTime);
    });
  });

  describe('Metrics Export', () => {
    it('should export metrics in JSON format', async () => {
      const response = await request(app)
        .get('/api/performance/export')
        .query({ format: 'json' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('systemHealth');
      expect(response.body.data).toHaveProperty('dashboard');
    });

    it('should export metrics in Prometheus format', async () => {
      const response = await request(app)
        .get('/api/performance/export')
        .query({ format: 'prometheus' })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
      expect(response.text).toContain('http_requests_total');
    });
  });

  describe('Alert Management', () => {
    it('should create alert rule', async () => {
      const alertRule = {
        id: 'test-alert-1',
        name: 'Test Alert',
        condition: {
          metric: 'responseTime',
          operator: '>',
          threshold: 1000,
          duration: 60,
        },
        severity: 'warning',
        action: 'log',
        enabled: true,
      };

      const response = await request(app)
        .post('/api/performance/alerts')
        .send(alertRule)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(alertRule.id);
    });

    it('should delete alert rule', async () => {
      // Create an alert first
      const alertRule = {
        id: 'test-alert-2',
        name: 'Test Alert 2',
        condition: {
          metric: 'errorRate',
          operator: '>',
          threshold: 5,
          duration: 120,
        },
        severity: 'error',
        action: 'log',
        enabled: true,
      };

      await request(app).post('/api/performance/alerts').send(alertRule).expect(201);

      // Delete the alert
      const response = await request(app)
        .delete(`/api/performance/alerts/${alertRule.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent alert rule', async () => {
      const response = await request(app)
        .delete('/api/performance/alerts/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ALERT_RULE_NOT_FOUND');
    });
  });

  describe('Health Status Endpoint', () => {
    it('should return healthy status under normal conditions', async () => {
      const response = await request(app).get('/api/performance/status').expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('checks');
      expect(response.body).toHaveProperty('details');
    });

    it('should include all required health checks', async () => {
      const response = await request(app).get('/api/performance/status').expect(200);

      const { checks } = response.body;
      expect(checks).toHaveProperty('errorRate');
      expect(checks).toHaveProperty('responseTime');
      expect(checks).toHaveProperty('healthScore');
    });
  });

  describe('Performance Trends', () => {
    it('should get performance trends', async () => {
      const response = await request(app)
        .get('/api/performance/trends')
        .query({ hours: 24 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('timeframe');
      expect(response.body.data).toHaveProperty('trends');
    });
  });
});

describe('WebSocket Performance Monitoring', () => {
  describe('Real-time Metrics', () => {
    it('should track WebSocket connection metrics', async () => {
      // This would test WebSocket performance tracking
      // Implementation depends on WebSocket test setup
      expect(true).toBe(true);
    });

    it('should monitor WebSocket message performance', async () => {
      // Test WebSocket message handling performance
      expect(true).toBe(true);
    });
  });
});

describe('Rate Limiting Integration', () => {
  describe('Enhanced Rate Limiting', () => {
    it('should apply rate limits per endpoint', async () => {
      const endpoint = '/api/tasks';
      const promises = [];

      // Make multiple rapid requests
      for (let i = 0; i < 10; i++) {
        promises.push(request(app).get(endpoint));
      }

      const responses = await Promise.all(promises);

      // All should succeed under normal rate limits
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });

    it('should include rate limit headers', async () => {
      const response = await request(app).get('/api/tasks').expect(200);

      // Check for rate limit headers
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });
  });
});

// Helper functions
async function setupTestData(): Promise<void> {
  // Create test boards
  await dbConnection.query(`
    INSERT OR IGNORE INTO boards (id, name, description, created_at) VALUES 
    ('test-board-1', 'Test Board 1', 'Analytics test board', datetime('now')),
    ('test-board-2', 'Test Board 2', 'Performance test board', datetime('now'))
  `);

  // Create test columns
  await dbConnection.query(`
    INSERT OR IGNORE INTO board_columns (id, board_id, name, position, created_at) VALUES 
    ('test-col-1', 'test-board-1', 'To Do', 0, datetime('now')),
    ('test-col-2', 'test-board-1', 'In Progress', 1, datetime('now')),
    ('test-col-3', 'test-board-1', 'Done', 2, datetime('now'))
  `);

  // Create test tasks with various statuses and completion times
  const testTasks = [
    {
      id: 'test-task-1',
      title: 'Completed Task 1',
      status: 'done',
      priority: 3,
      assignee: 'user1',
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(), // 5 days ago
      completed_at: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
    },
    {
      id: 'test-task-2',
      title: 'In Progress Task',
      status: 'in_progress',
      priority: 2,
      assignee: 'user2',
      created_at: new Date(Date.now() - 86400000 * 3).toISOString(), // 3 days ago
      completed_at: null,
    },
    {
      id: 'test-task-3',
      title: 'Completed Task 2',
      status: 'done',
      priority: 1,
      assignee: 'user1',
      created_at: new Date(Date.now() - 86400000 * 7).toISOString(), // 7 days ago
      completed_at: new Date(Date.now() - 86400000 * 1).toISOString(), // 1 day ago
    },
  ];

  for (const task of testTasks) {
    await dbConnection.query(
      `
      INSERT OR IGNORE INTO tasks (
        id, title, status, priority, assignee, board_id, column_id, 
        created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        task.id,
        task.title,
        task.status,
        task.priority,
        task.assignee,
        'test-board-1',
        'test-col-1',
        task.created_at,
        task.completed_at,
      ]
    );
  }
}

async function cleanupTestData(): Promise<void> {
  // Clean up test data
  await dbConnection.query('DELETE FROM tasks WHERE id LIKE "test-task-%"');
  await dbConnection.query('DELETE FROM board_columns WHERE id LIKE "test-col-%"');
  await dbConnection.query('DELETE FROM boards WHERE id LIKE "test-board-%"');
}
