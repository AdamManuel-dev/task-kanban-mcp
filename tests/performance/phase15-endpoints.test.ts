/**
 * Performance tests for Phase 15 new endpoints
 * Tests performance characteristics of priority calculation and dependency management
 */

import { expect } from 'chai';
import request from 'supertest';
import { performance } from 'perf_hooks';
import { app } from '../../src/server';
import { createTestBoard, createTestTask, cleanupTestData } from '../helpers/testData';

describe('Phase 15 Endpoints Performance Tests', () => {
  let testBoardId: string;
  let taskIds: string[] = [];

  beforeEach(async () => {
    await cleanupTestData();

    // Create test board
    const board = await createTestBoard('Performance Test Board');
    testBoardId = board.id;

    // Create large number of tasks for performance testing
    const taskPromises = [];
    for (let i = 0; i < 100; i++) {
      taskPromises.push(
        createTestTask(testBoardId, {
          title: `Performance Task ${i}`,
          priority: Math.floor(Math.random() * 5) + 1,
          status: i % 3 === 0 ? 'done' : i % 3 === 1 ? 'in_progress' : 'todo',
          due_date: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within 30 days
        })
      );
    }

    const tasks = await Promise.all(taskPromises);
    taskIds = tasks.map(task => task.id);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Priority Calculation Performance', () => {
    it('should calculate priorities for large board within acceptable time', async () => {
      const startTime = performance.now();

      const response = await request(app)
        .post('/api/v1/priorities/calculate')
        .send({
          board_id: testBoardId,
          algorithm: 'contextual',
        })
        .expect(200);

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      expect(response.body.success).to.be.true;
      expect(response.body.data.updated_count).to.equal(100);

      // Should complete within 5 seconds for 100 tasks
      expect(executionTime).to.be.lessThan(5000);

      console.log(`Priority calculation for 100 tasks: ${executionTime.toFixed(2)}ms`);
    });

    it('should handle concurrent priority calculations efficiently', async () => {
      const concurrentRequests = 5;
      const requests = [];

      const startTime = performance.now();

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          request(app).post('/api/v1/priorities/calculate').send({
            board_id: testBoardId,
            algorithm: 'contextual',
          })
        );
      }

      const responses = await Promise.all(requests);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      responses.forEach(response => {
        expect(response.status).to.equal(200);
      });

      // Concurrent requests should not take significantly longer than sequential
      expect(totalTime).to.be.lessThan(10000); // 10 seconds for 5 concurrent requests

      console.log(`5 concurrent priority calculations: ${totalTime.toFixed(2)}ms`);
    });

    it('should perform well with single task priority calculation', async () => {
      const iterations = 50;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];

        const startTime = performance.now();

        await request(app)
          .post('/api/v1/priorities/calculate')
          .send({
            task_id: taskId,
            algorithm: 'contextual',
          })
          .expect(200);

        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);

      // Single task calculations should be very fast
      expect(averageTime).to.be.lessThan(100); // Average under 100ms
      expect(maxTime).to.be.lessThan(500); // Max under 500ms

      console.log(
        `Single task priority calculation - Avg: ${averageTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`
      );
    });
  });

  describe('Next Task Recommendation Performance', () => {
    it('should quickly recommend next task from large dataset', async () => {
      const iterations = 20;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        const response = await request(app)
          .get('/api/v1/priorities/next')
          .query({ board_id: testBoardId })
          .expect(200);

        const endTime = performance.now();
        times.push(endTime - startTime);

        expect(response.body.success).to.be.true;
        expect(response.body.data).to.have.property('task');
      }

      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);

      // Recommendations should be fast
      expect(averageTime).to.be.lessThan(50); // Average under 50ms
      expect(maxTime).to.be.lessThan(200); // Max under 200ms

      console.log(
        `Next task recommendation - Avg: ${averageTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`
      );
    });

    it('should handle filtered recommendations efficiently', async () => {
      const filters = [
        { status: 'todo' },
        { status: 'in_progress' },
        { assignee: 'test-user' },
        { priority_min: 3 },
      ];

      for (const filter of filters) {
        const startTime = performance.now();

        await request(app)
          .get('/api/v1/priorities/next')
          .query({
            board_id: testBoardId,
            ...filter,
          });

        const endTime = performance.now();
        const executionTime = endTime - startTime;

        // Filtered queries should still be fast
        expect(executionTime).to.be.lessThan(100);

        console.log(
          `Filtered recommendation (${JSON.stringify(filter)}): ${executionTime.toFixed(2)}ms`
        );
      }
    });
  });

  describe('Dependency Management Performance', () => {
    it('should handle bulk dependency operations efficiently', async () => {
      // Create dependency relationships
      const dependencyTaskIds = taskIds.slice(0, 20);
      const targetTaskId = taskIds[50];

      const startTime = performance.now();

      const response = await request(app)
        .patch(`/api/v1/tasks/${targetTaskId}/dependencies`)
        .send({
          add: dependencyTaskIds,
          dependency_type: 'blocks',
        })
        .expect(200);

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      expect(response.body.success).to.be.true;
      expect(response.body.data.dependencies_added).to.equal(20);

      // Bulk operations should complete quickly
      expect(executionTime).to.be.lessThan(1000); // Under 1 second for 20 dependencies

      console.log(`Bulk dependency addition (20 deps): ${executionTime.toFixed(2)}ms`);
    });

    it('should efficiently validate circular dependencies', async () => {
      // Create a chain of dependencies
      const chainLength = 10;
      const chainTasks = taskIds.slice(0, chainLength);

      // Create chain: task0 -> task1 -> task2 -> ... -> task9
      for (let i = 0; i < chainLength - 1; i++) {
        await request(app)
          .patch(`/api/v1/tasks/${chainTasks[i]}/dependencies`)
          .send({
            add: [chainTasks[i + 1]],
            dependency_type: 'blocks',
          })
          .expect(200);
      }

      // Try to create circular dependency: task9 -> task0
      const startTime = performance.now();

      const response = await request(app)
        .patch(`/api/v1/tasks/${chainTasks[chainLength - 1]}/dependencies`)
        .send({
          add: [chainTasks[0]],
          dependency_type: 'blocks',
        })
        .expect(400); // Should be rejected

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      expect(response.body.success).to.be.false;
      expect(response.body.error.message).to.include('circular');

      // Circular dependency detection should be fast even for long chains
      expect(executionTime).to.be.lessThan(500);

      console.log(
        `Circular dependency detection (chain of ${chainLength}): ${executionTime.toFixed(2)}ms`
      );
    });
  });

  describe('Database Performance', () => {
    it('should maintain good query performance with priority scores', async () => {
      // Generate priority scores for all tasks
      await request(app)
        .post('/api/v1/priorities/calculate')
        .send({
          board_id: testBoardId,
          algorithm: 'contextual',
        })
        .expect(200);

      // Test various queries that use priority scores
      const queries = [
        () => request(app).get('/api/v1/priorities/next').query({ board_id: testBoardId }),
        () => request(app).get(`/api/v1/boards/${testBoardId}/tasks`).query({ sort: 'priority' }),
        () => request(app).get(`/api/v1/boards/${testBoardId}/tasks`).query({ priority_min: 3 }),
      ];

      for (const query of queries) {
        const startTime = performance.now();

        const response = await query();

        const endTime = performance.now();
        const executionTime = endTime - startTime;

        expect(response.status).to.be.oneOf([200, 404]); // 404 is acceptable for some filtered queries
        expect(executionTime).to.be.lessThan(100); // Queries should be under 100ms

        console.log(`Query execution time: ${executionTime.toFixed(2)}ms`);
      }
    });

    it('should clean up expired priority scores efficiently', async () => {
      // This would test the cleanup trigger performance
      // In a real scenario, we'd manipulate timestamps to force cleanup

      const startTime = performance.now();

      // Generate many priority calculations to trigger cleanup
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/v1/priorities/calculate')
          .send({
            board_id: testBoardId,
            algorithm: 'contextual',
          })
          .expect(200);
      }

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      // Multiple calculations with cleanup should still be reasonable
      expect(executionTime).to.be.lessThan(10000); // Under 10 seconds

      console.log(`10 priority calculations with cleanup: ${executionTime.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage', () => {
    it('should not cause memory leaks during intensive operations', async () => {
      const initialMemory = process.memoryUsage();

      // Perform memory-intensive operations
      for (let i = 0; i < 50; i++) {
        await request(app)
          .post('/api/v1/priorities/calculate')
          .send({
            board_id: testBoardId,
            algorithm: 'contextual',
          })
          .expect(200);

        await request(app)
          .get('/api/v1/priorities/next')
          .query({ board_id: testBoardId })
          .expect(200);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      // Memory increase should be reasonable (under 50MB for this test)
      expect(memoryIncreaseMB).to.be.lessThan(50);

      console.log(`Memory increase after intensive operations: ${memoryIncreaseMB.toFixed(2)}MB`);
    });
  });
});
