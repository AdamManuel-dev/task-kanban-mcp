/**
 * API Load Testing Suite
 *
 * Tests API endpoints under high load conditions to identify performance bottlenecks
 * and ensure the system can handle expected traffic volumes.
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';
import { v4 as uuidv4 } from 'uuid';
import type { Board } from '@/types';

describe('API Load Tests', () => {
  let app: Express;
  let apiKey: string;
  let testBoard: Board;

  beforeAll(async () => {
    // Initialize database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Create Express app
    app = await createServer();

    // Use development API key
    apiKey = 'dev-key-1';

    // Create test board
    const boardId = uuidv4();
    await dbConnection.execute(
      'INSERT INTO boards (id, name, description, created_at) VALUES (?, ?, ?, ?)',
      [boardId, 'Load Test Board', 'Board for load testing', new Date().toISOString()]
    );

    testBoard = {
      id: boardId,
      name: 'Load Test Board',
      description: 'Board for load testing',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Create test column
    const columnId = uuidv4();
    await dbConnection.execute(
      'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
      [columnId, boardId, 'To Do', 0, new Date().toISOString()]
    );

    global.testColumnId = columnId;

    // Seed initial test data
    await seedTestData(100); // Create 100 initial tasks
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    await dbConnection.close();
  });

  async function seedTestData(count: number): Promise<void> {
    const tasks = Array.from({ length: count }, (_, i) => {
      const taskId = uuidv4();
      return {
        id: taskId,
        title: `Load Test Task ${String(i + 1)}`,
        description: `Description for load test task ${String(i + 1)}`,
        board_id: testBoard.id,
        column_id: global.testColumnId,
        status: ['todo', 'in_progress', 'done'][Math.floor(Math.random() * 3)],
        priority: Math.floor(Math.random() * 10),
        position: i,
        created_at: new Date().toISOString(),
      };
    });

    // Bulk insert for performance
    await dbConnection.transaction(async () => {
      await Promise.all(
        tasks.map(async task => {
          await dbConnection.execute(
            `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, position, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              task.id,
              task.title,
              task.description,
              task.board_id,
              task.column_id,
              task.status,
              task.priority,
              task.position,
              task.created_at,
            ]
          );
        })
      );
    });
  }

  describe('Task Endpoints Load Testing', () => {
    it('should handle 100 concurrent GET requests', async () => {
      const concurrentRequests = 100;
      const startTime = Date.now();

      // Create array of concurrent requests
      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/api/v1/tasks').set('X-API-Key', apiKey).query({ limit: 10 })
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Performance assertions
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      // Performance test completed successfully
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    }, 10000);

    it('should handle 50 concurrent POST requests', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();

      // Create array of concurrent POST requests
      const requests = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app)
          .post('/api/v1/tasks')
          .set('X-API-Key', apiKey)
          .send({
            title: `Concurrent Task ${String(i + 1)}`,
            description: `Created during load test`,
            board_id: testBoard.id,
            column_id: global.testColumnId,
            status: 'todo',
            priority: 5,
          })
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Performance assertions
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBeDefined();
      });

      logger.log(`✓ 50 concurrent POST requests completed in ${String(duration)}ms`);
      logger.log(`✓ Average creation time: ${String(duration / concurrentRequests)}ms per task`);
    }, 15000);

    it('should maintain performance with large result sets', async () => {
      // First seed more data for this test
      await seedTestData(500); // Add 500 more tasks (600 total)

      const startTime = Date.now();

      const response = await request(app)
        .get('/api/v1/tasks')
        .set('X-API-Key', apiKey)
        .query({ limit: 500 }); // Request large result set

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(500);

      // Should handle large queries efficiently
      expect(duration).toBeLessThan(3000); // Within 3 seconds

      logger.log(`✓ Large query (500+ tasks) completed in ${String(duration)}ms`);
    });

    it('should handle rapid sequential updates', async () => {
      // Create a task to update
      const createResponse = await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', apiKey)
        .send({
          title: 'Update Test Task',
          board_id: testBoard.id,
          column_id: global.testColumnId,
          status: 'todo',
          priority: 1,
        });

      const taskId = createResponse.body.data.id;
      const updateCount = 20;
      const startTime = Date.now();

      // Perform rapid sequential updates
      for (let i = 0; i < updateCount; i++) {
        const response = await request(app)
          .patch(`/api/v1/tasks/${String(taskId)}`)
          .set('X-API-Key', apiKey)
          .send({
            title: `Updated Task ${String(i + 1)}`,
            description: `Updated description ${String(i + 1)}`,
          });

        expect(response.status).toBe(200);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle rapid updates efficiently
      expect(duration).toBeLessThan(5000); // Within 5 seconds

      logger.log(`✓ ${String(updateCount)} sequential updates completed in ${String(duration)}ms`);
      logger.log(`✓ Average update time: ${String(duration / updateCount)}ms per update`);
    });
  });

  describe('Search Performance', () => {
    it('should perform text search efficiently on large dataset', async () => {
      // Seed data with searchable content
      const searchableCount = 200;
      const searchTerm = 'searchable';

      await dbConnection.transaction(async () => {
        Array.from({ length: searchableCount }, (_, i) => i).forEach(async i => {
          await dbConnection.execute(
            `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, position, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(),
              `${String(searchTerm)} Task ${String(i + 1)}`,
              `This is a ${String(searchTerm)} description for testing search performance`,
              testBoard.id,
              global.testColumnId,
              'todo',
              5,
              i + 1000,
              new Date().toISOString(),
            ]
          );
        });
      });

      const startTime = Date.now();

      const response = await request(app)
        .get('/api/v1/tasks')
        .set('X-API-Key', apiKey)
        .query({ search: searchTerm, limit: 100 });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Search should be fast even on large dataset
      expect(duration).toBeLessThan(2000); // Within 2 seconds

      logger.log(`✓ Text search on large dataset completed in ${String(duration)}ms`);
      logger.log(`✓ Found ${String(String(response.body.data.length))} matching tasks`);
    });

    it('should handle complex filtering efficiently', async () => {
      const startTime = Date.now();

      const response = await request(app).get('/api/v1/tasks').set('X-API-Key', apiKey).query({
        board_id: testBoard.id,
        status: 'todo',
        priority_min: 3,
        priority_max: 7,
        limit: 50,
        sortBy: 'priority',
        sortOrder: 'desc',
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Complex filtering should be efficient
      expect(duration).toBeLessThan(1500); // Within 1.5 seconds

      logger.log(`✓ Complex filtering completed in ${String(duration)}ms`);
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should not have memory leaks during sustained load', async () => {
      const initialMemory = process.memoryUsage();
      const iterations = 100;

      // Perform sustained operations
      Array.from({ length: iterations }, (_, i) => i).forEach(async i => {
        await request(app).get('/api/v1/tasks').set('X-API-Key', apiKey).query({ limit: 10 });

        // Create and delete task to test cleanup
        const createResp = await request(app)
          .post('/api/v1/tasks')
          .set('X-API-Key', apiKey)
          .send({
            title: `Memory Test Task ${String(i)}`,
            board_id: testBoard.id,
            column_id: global.testColumnId,
            status: 'todo',
            priority: 5,
          });

        await request(app)
          .delete(`/api/v1/tasks/${String(String(createResp.body.data.id))}`)
          .set('X-API-Key', apiKey);
      });

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (less than 50MB for this test)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      logger.log(`✓ Memory usage after ${String(iterations)} operations:`);
      logger.log(
        `  Initial: ${String(String(Math.round(initialMemory.heapUsed / 1024 / 1024)))}MB`
      );
      logger.log(`  Final: ${String(String(Math.round(finalMemory.heapUsed / 1024 / 1024)))}MB`);
      logger.log(`  Increase: ${String(String(Math.round(memoryIncrease / 1024 / 1024)))}MB`);
    }, 30000);
  });

  describe('Response Time Benchmarks', () => {
    const benchmarks = {
      'GET /api/v1/tasks (10 items)': { maxTime: 200, samples: 10 },
      'POST /api/v1/tasks': { maxTime: 500, samples: 5 },
      'PATCH /api/v1/tasks/:id': { maxTime: 300, samples: 5 },
      'GET /api/v1/tasks/:id': { maxTime: 150, samples: 10 },
    };

    Object.entries(benchmarks).forEach(([endpoint, { maxTime, samples }]) => {
      it(`should respond within ${String(maxTime)}ms for ${String(endpoint)}`, async () => {
        const times: number[] = [];

        await Promise.all(
          Array.from({ length: samples }, async (_, i) => {
            let startTime: number;
            let response: any;

            if (endpoint.includes('GET /api/v1/tasks (10 items)')) {
              startTime = Date.now();
              response = await request(app)
                .get('/api/v1/tasks')
                .set('X-API-Key', apiKey)
                .query({ limit: 10 });
            } else if (endpoint.includes('POST /api/v1/tasks')) {
              startTime = Date.now();
              response = await request(app)
                .post('/api/v1/tasks')
                .set('X-API-Key', apiKey)
                .send({
                  title: `Benchmark Task ${String(i)}`,
                  board_id: testBoard.id,
                  column_id: global.testColumnId,
                  status: 'todo',
                  priority: 5,
                });
            } else if (endpoint.includes('PATCH /api/v1/tasks/:id')) {
              // Create task first
              const createResp = await request(app)
                .post('/api/v1/tasks')
                .set('X-API-Key', apiKey)
                .send({
                  title: `Update Benchmark Task ${String(i)}`,
                  board_id: testBoard.id,
                  column_id: global.testColumnId,
                  status: 'todo',
                  priority: 5,
                });

              startTime = Date.now();
              response = await request(app)
                .patch(`/api/v1/tasks/${String(String(createResp.body.data.id))}`)
                .set('X-API-Key', apiKey)
                .send({ title: `Updated Benchmark Task ${String(i)}` });
            } else if (endpoint.includes('GET /api/v1/tasks/:id')) {
              // Create task first
              const createResp = await request(app)
                .post('/api/v1/tasks')
                .set('X-API-Key', apiKey)
                .send({
                  title: `Get Benchmark Task ${String(i)}`,
                  board_id: testBoard.id,
                  column_id: global.testColumnId,
                  status: 'todo',
                  priority: 5,
                });

              startTime = Date.now();
              response = await request(app)
                .get(`/api/v1/tasks/${String(String(createResp.body.data.id))}`)
                .set('X-API-Key', apiKey);
            } else {
              throw new Error(`Unknown endpoint: ${String(endpoint)}`);
            }

            const duration = Date.now() - startTime;
            times.push(duration);

            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);
          })
        );

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxTimeObserved = Math.max(...times);

        expect(avgTime).toBeLessThan(maxTime);
        logger.log(
          `✓ ${String(endpoint)}: avg ${String(String(Math.round(avgTime)))}ms, max ${String(maxTimeObserved)}ms`
        );
      });
    });
  });
});
