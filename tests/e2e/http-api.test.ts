/**
 * End-to-End HTTP API Tests
 * Tests the complete HTTP API functionality with security validation
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '../../src/server';
import { dbConnection } from '../../src/database/connection';

describe('HTTP API E2E Tests', () => {
  let app: Express;
  let server: any;
  let testApiKey: string;

  beforeAll(async (): Promise<void> => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.KANBAN_TEST_MODE = 'true';
    // Server will be started by the individual tests

    // Create test database
    await dbConnection.initialize();

    // Create Express app
    app = await createServer();

    // Start server on random port
    server = app.listen(0);

    // Generate test API key
    testApiKey = `test-api-key-${String(String(Date.now()))}`;
    process.env.KANBAN_API_KEYS = testApiKey;
  });

  afterAll(async () => {
    // Cleanup
    if (server) {
      server.close();
    }
    await dbConnection.close();
    delete process.env.KANBAN_API_KEYS;
  });

  describe('Health and Status Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });

    it('should return server info without sensitive data', async () => {
      const response = await request(app).get('/api/health').expect(200);

      // Should not expose sensitive information
      expect(response.body).not.toHaveProperty('apiKeys');
      expect(response.body).not.toHaveProperty('dbConnection');
      expect(response.body).not.toHaveProperty('secrets');
    });

    it('should handle health check with rate limiting', async () => {
      // Make multiple requests to test rate limiting
      const requests = Array(20)
        .fill(null)
        .map(() => request(app).get('/api/health'));

      const responses = await Promise.allSettled(requests);
      const successful = responses.filter(r => r.status === 'fulfilled').length;
      const rateLimited = responses.filter(
        r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 429)
      ).length;

      // Should eventually rate limit
      expect(successful).toBeGreaterThan(0);
      expect(successful + rateLimited).toBe(20);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require API key for protected endpoints', async () => {
      await request(app).get('/api/tasks').expect(401);
    });

    it('should accept valid API key', async () => {
      await request(app).get('/api/tasks').set('X-API-Key', testApiKey).expect(200);
    });

    it('should reject invalid API key', async () => {
      await request(app).get('/api/tasks').set('X-API-Key', 'invalid-key').expect(401);
    });

    it('should sanitize API key in error responses', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('X-API-Key', 'malicious-<script>alert(1)</script>')
        .expect(401);

      expect(response.text).not.toContain('<script>');
      expect(response.text).not.toContain('malicious-');
    });

    it('should handle authorization header format', async () => {
      await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${String(testApiKey)}`)
        .expect(200);
    });
  });

  describe('Input Sanitization and Security', () => {
    it('should sanitize XSS attempts in task creation', async () => {
      const maliciousPayload = {
        title: '<script>alert("xss")</script>Clean Title',
        description: '<img src=x onerror=alert(1)>',
        board_id: 'test-board',
        column_id: 'todo',
      };

      const response = await request(app)
        .post('/api/tasks')
        .set('X-API-Key', testApiKey)
        .send(maliciousPayload)
        .expect(201);

      expect(response.body.title).not.toContain('<script>');
      expect(response.body.title).toContain('Clean Title');
      expect(response.body.description).not.toContain('<img');
      expect(response.body.description).not.toContain('onerror');
    });

    it('should prevent SQL injection in search queries', async () => {
      const sqlInjection = "'; DROP TABLE tasks; --";

      const response = await request(app)
        .get('/api/tasks/search')
        .query({ q: sqlInjection })
        .set('X-API-Key', testApiKey)
        .expect(200);

      // Should not crash and return safe results
      expect(response.body).toHaveProperty('tasks');
      expect(Array.isArray(response.body.tasks)).toBe(true);
    });

    it('should validate and sanitize JSON payloads', async () => {
      const maliciousJson = {
        title: 'Normal Task',
        '$(whoami)': 'malicious-value',
        constructor: { prototype: { polluted: true } },
        __proto__: { polluted: true },
      };

      const response = await request(app)
        .post('/api/tasks')
        .set('X-API-Key', testApiKey)
        .send(maliciousJson);

      // Should either reject or sanitize
      if (response.status === 201) {
        expect(response.body).not.toHaveProperty('$(whoami)');
        expect(response.body).not.toHaveProperty('constructor');
        expect(response.body).not.toHaveProperty('__proto__');
      } else {
        expect(response.status).toBe(400);
      }
    });

    it('should handle Unicode and encoding attacks', async () => {
      const unicodeAttack = {
        title: '\\u003cscript\\u003ealert(1)\\u003c/script\\u003e',
        description: '\\x3Cimg src=x onerror=alert(1)\\x3E',
        board_id: 'test-board',
        column_id: 'todo',
      };

      const response = await request(app)
        .post('/api/tasks')
        .set('X-API-Key', testApiKey)
        .send(unicodeAttack)
        .expect(201);

      expect(response.body.title).not.toContain('script');
      expect(response.body.description).not.toContain('img');
    });
  });

  describe('Task Management API', () => {
    let testBoardId: string;
    let testTaskId: string;

    beforeAll(async () => {
      // Create test board
      const boardResponse = await request(app)
        .post('/api/boards')
        .set('X-API-Key', testApiKey)
        .send({
          name: 'E2E Test Board',
          description: 'Board for E2E testing',
        })
        .expect(201);

      testBoardId = boardResponse.body.id;
    });

    it('should create task with proper validation', async () => {
      const taskData = {
        title: 'E2E Test Task',
        description: 'Task created by E2E test',
        board_id: testBoardId,
        column_id: 'todo',
        priority: 1,
      };

      const response = await request(app)
        .post('/api/tasks')
        .set('X-API-Key', testApiKey)
        .send(taskData)
        .expect(201);

      testTaskId = response.body.id;
      expect(response.body.title).toBe(taskData.title);
      expect(response.body.description).toBe(taskData.description);
      expect(response.body.board_id).toBe(testBoardId);
    });

    it('should list tasks with filtering', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .query({ board_id: testBoardId })
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(response.body.tasks).toBeInstanceOf(Array);
      expect(response.body.tasks.length).toBeGreaterThan(0);

      const createdTask = response.body.tasks.find(t => t.id === testTaskId);
      expect(createdTask).toBeDefined();
    });

    it('should update task with security validation', async () => {
      const updates = {
        title: 'Updated E2E Test Task',
        status: 'in_progress',
      };

      const response = await request(app)
        .put(`/api/tasks/${String(testTaskId)}`)
        .set('X-API-Key', testApiKey)
        .send(updates)
        .expect(200);

      expect(response.body.title).toBe(updates.title);
      expect(response.body.status).toBe(updates.status);
    });

    it('should handle task deletion securely', async () => {
      // Create task to delete
      const taskToDelete = await request(app)
        .post('/api/tasks')
        .set('X-API-Key', testApiKey)
        .send({
          title: 'Task to Delete',
          board_id: testBoardId,
          column_id: 'todo',
        })
        .expect(201);

      // Delete task
      await request(app)
        .delete(`/api/tasks/${String(String(taskToDelete.body.id))}`)
        .set('X-API-Key', testApiKey)
        .expect(204);

      // Verify deletion
      await request(app)
        .get(`/api/tasks/${String(String(taskToDelete.body.id))}`)
        .set('X-API-Key', testApiKey)
        .expect(404);
    });

    it('should prevent unauthorized task access', async () => {
      // Try to access task without proper authorization
      await request(app)
        .get(`/api/tasks/${String(testTaskId)}`)
        .expect(401);

      // Try with invalid API key
      await request(app)
        .get(`/api/tasks/${String(testTaskId)}`)
        .set('X-API-Key', 'invalid-key')
        .expect(401);
    });
  });

  describe('Board Management API', () => {
    it('should create board with template support', async () => {
      const boardData = {
        name: 'Template Test Board',
        description: 'Testing board templates',
        template: 'scrum',
      };

      const response = await request(app)
        .post('/api/boards')
        .set('X-API-Key', testApiKey)
        .send(boardData)
        .expect(201);

      expect(response.body.name).toBe(boardData.name);
      expect(response.body.description).toBe(boardData.description);
      expect(response.body.columns).toBeInstanceOf(Array);
      expect(response.body.columns.length).toBeGreaterThan(0);
    });

    it('should list boards with pagination', async () => {
      const response = await request(app)
        .get('/api/boards')
        .query({ page: 1, limit: 10 })
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(response.body.boards).toBeInstanceOf(Array);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('total');
    });

    it('should handle board archiving', async () => {
      // Create board to archive
      const boardResponse = await request(app)
        .post('/api/boards')
        .set('X-API-Key', testApiKey)
        .send({
          name: 'Board to Archive',
          description: 'Will be archived',
        })
        .expect(201);

      const boardId = boardResponse.body.id;

      // Archive board
      await request(app)
        .patch(`/api/boards/${String(boardId)}`)
        .set('X-API-Key', testApiKey)
        .send({ archived: true })
        .expect(200);

      // Verify archived
      const archivedBoard = await request(app)
        .get(`/api/boards/${String(boardId)}`)
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(archivedBoard.body.archived).toBe(true);
    });
  });

  describe('Search and Context API', () => {
    it('should search tasks securely', async () => {
      const searchQuery = 'E2E Test';

      const response = await request(app)
        .get('/api/tasks/search')
        .query({ q: searchQuery })
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(response.body.tasks).toBeInstanceOf(Array);
      expect(response.body).toHaveProperty('query', searchQuery);
      expect(response.body).toHaveProperty('total');
    });

    it('should get context information', async () => {
      const response = await request(app)
        .get('/api/context')
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('statistics');
      expect(response.body).toHaveProperty('recent_activity');
    });

    it('should handle advanced search with filters', async () => {
      const response = await request(app)
        .get('/api/tasks/search')
        .query({
          q: 'test',
          status: 'todo',
          priority_min: 1,
          priority_max: 3,
        })
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(response.body.tasks).toBeInstanceOf(Array);
      expect(response.body.filters).toBeDefined();
    });
  });

  describe('Error Handling and Security', () => {
    it('should return proper error structure', async () => {
      const response = await request(app)
        .get('/api/tasks/non-existent-id')
        .set('X-API-Key', testApiKey)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('sensitive');
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('X-API-Key', testApiKey)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.error).toContain('Invalid JSON');
    });

    it('should prevent path traversal attacks', async () => {
      const response = await request(app)
        .get('/api/tasks/../../../etc/passwd')
        .set('X-API-Key', testApiKey)
        .expect(404);

      expect(response.body).not.toContain('root:');
    });

    it('should sanitize error messages', async () => {
      const maliciousId = '<script>alert("error-xss")</script>';

      const response = await request(app)
        .get(`/api/tasks/${String(maliciousId)}`)
        .set('X-API-Key', testApiKey)
        .expect(404);

      expect(response.body.message).not.toContain('<script>');
      expect(response.body.message).not.toContain('alert');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent requests', async () => {
      const concurrentRequests = 20;
      const requests = Array(concurrentRequests)
        .fill(null)
        .map((_, index) =>
          request(app)
            .post('/api/tasks')
            .set('X-API-Key', testApiKey)
            .send({
              title: `Concurrent Task ${String(index)}`,
              board_id: 'test-board',
              column_id: 'todo',
            })
        );

      const responses = await Promise.allSettled(requests);
      const successful = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 201
      ).length;

      expect(successful).toBeGreaterThan(concurrentRequests * 0.8); // 80% success rate
    });

    it('should handle large payload efficiently', async () => {
      const largeDescription = 'x'.repeat(10000); // 10KB description

      const startTime = Date.now();
      const response = await request(app).post('/api/tasks').set('X-API-Key', testApiKey).send({
        title: 'Large Payload Task',
        description: largeDescription,
        board_id: 'test-board',
        column_id: 'todo',
      });
      const endTime = Date.now();

      expect(response.status).toBe(201);
      expect(endTime - startTime).toBeLessThan(5000); // Less than 5 seconds
    });

    it('should respect request timeout limits', async () => {
      // Test with a very long search query that might timeout
      const longQuery = 'test '.repeat(1000);

      const response = await request(app)
        .get('/api/tasks/search')
        .query({ q: longQuery })
        .set('X-API-Key', testApiKey)
        .timeout(10000); // 10 second timeout

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('WebSocket API Integration', () => {
    it('should handle WebSocket upgrade requests', async () => {
      const response = await request(app)
        .get('/ws')
        .set('Upgrade', 'websocket')
        .set('Connection', 'Upgrade')
        .set('Sec-WebSocket-Key', 'test-key')
        .set('Sec-WebSocket-Version', '13');

      expect([101, 426]).toContain(response.status); // 101 Switching Protocols or 426 Upgrade Required
    });
  });
});
