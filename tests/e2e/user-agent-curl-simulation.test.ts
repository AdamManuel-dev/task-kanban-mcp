/**
 * @fileoverview E2E test simulating user and AI agent interactions via curl
 * @lastmodified 2025-01-30T00:00:00Z
 *
 * Features: User simulation, AI agent simulation, concurrent interactions
 * Main APIs: HTTP API endpoints via curl commands
 * Constraints: Tests API endpoints directly without full server setup
 * Patterns: Sequential and concurrent curl operations
 */

import { describe, it, expect } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import request from 'supertest';
import type { Express } from 'express';

// Import server after mocking
import { createServer } from '../../src/server';
import { dbConnection } from '../../src/database/connection';

const execAsync = promisify(exec);

// Mock the problematic imports
jest.mock('../../src/utils/service-metrics', () => ({
  TrackPerformance: () => () => ({}),
  serviceMetricsCollector: {
    collectMetric: jest.fn(),
  },
}));

describe('User and AI Agent Curl Simulation', () => {
  let app: Express;
  let server: import('http').Server;
  let baseUrl: string;
  let apiKey: string;

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.KANBAN_TEST_MODE = 'true';
    apiKey = `test-api-key-${Date.now()}`;
    process.env.KANBAN_API_KEYS = apiKey;

    // Create test database
    await dbConnection.initialize();

    // Create Express app
    app = await createServer();

    // Start server on random port
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;

    console.log(`Test server started on port ${port}`);
  }, 30000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
      });
    }
    await dbConnection.close();
  });

  it('should simulate user creating tasks and AI agent completing them', async () => {
    let boardId: string;
    const taskIds: string[] = [];

    // Step 1: User creates a board
    const createBoardCmd = `
      curl -s -X POST ${baseUrl}/api/v1/boards \
        -H "X-API-Key: ${apiKey}" \
        -H "Content-Type: application/json" \
        -d '{"name": "User Test Board", "template": "kanban"}'
    `;

    const { stdout: boardResponse } = await execAsync(createBoardCmd);
    const boardData = JSON.parse(boardResponse);
    expect(boardData.success).toBe(true);
    boardId = boardData.data.id;
    console.log(`Created board: ${boardId}`);

    // Step 2: User creates 5 tasks
    for (let i = 0; i < 5; i++) {
      const createTaskCmd = `
        curl -s -X POST ${baseUrl}/api/v1/tasks \
          -H "X-API-Key: ${apiKey}" \
          -H "Content-Type: application/json" \
          -d '{
            "board_id": "${boardId}",
            "title": "User Task ${i + 1}",
            "description": "Task created by user simulation",
            "priority": ${Math.floor(Math.random() * 5) + 1},
            "status": "todo"
          }'
      `;

      const { stdout } = await execAsync(createTaskCmd);
      const taskData = JSON.parse(stdout);
      expect(taskData.success).toBe(true);
      taskIds.push(taskData.data.id);
      console.log(`User created task: ${taskData.data.id}`);

      // Small delay to simulate realistic user behavior
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Step 3: AI Agent retrieves task list
    const listTasksCmd = `
      curl -s -X GET "${baseUrl}/api/v1/tasks?board_id=${boardId}" \
        -H "X-API-Key: ${apiKey}"
    `;

    const { stdout: tasksListResponse } = await execAsync(listTasksCmd);
    const tasksList = JSON.parse(tasksListResponse);
    expect(tasksList.success).toBe(true);
    expect(tasksList.data.items.length).toBe(5);
    console.log(`AI Agent found ${tasksList.data.items.length} tasks`);

    // Step 4: AI Agent works on first 3 tasks
    for (let i = 0; i < 3; i++) {
      const taskId = taskIds[i];

      // Update to in_progress
      const updateProgressCmd = `
        curl -s -X PATCH ${baseUrl}/api/v1/tasks/${taskId} \
          -H "X-API-Key: ${apiKey}" \
          -H "Content-Type: application/json" \
          -d '{"status": "in_progress"}'
      `;
      await execAsync(updateProgressCmd);
      console.log(`AI Agent started working on task: ${taskId}`);

      // Add progress note
      const addNoteCmd = `
        curl -s -X POST ${baseUrl}/api/v1/tasks/${taskId}/notes \
          -H "X-API-Key: ${apiKey}" \
          -H "Content-Type: application/json" \
          -d '{"content": "AI Agent: Analyzing and implementing solution..."}'
      `;
      await execAsync(addNoteCmd);

      // Complete the task
      const completeTaskCmd = `
        curl -s -X PATCH ${baseUrl}/api/v1/tasks/${taskId} \
          -H "X-API-Key: ${apiKey}" \
          -H "Content-Type: application/json" \
          -d '{"status": "done"}'
      `;
      await execAsync(completeTaskCmd);
      console.log(`AI Agent completed task: ${taskId}`);

      // Simulate work time
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Step 5: Verify final state
    const { stdout: finalStateResponse } = await execAsync(listTasksCmd);
    const finalState = JSON.parse(finalStateResponse);

    const todoCount = finalState.data.items.filter((t: any) => t.status === 'todo').length;
    const doneCount = finalState.data.items.filter((t: any) => t.status === 'done').length;

    expect(todoCount).toBe(2);
    expect(doneCount).toBe(3);

    console.log(`Final state - Todo: ${todoCount}, Done: ${doneCount}`);
  }, 30000);

  it('should handle concurrent user and agent operations', async () => {
    let boardId: string;
    const errors: string[] = [];

    // Create a shared board
    const { stdout } = await execAsync(`
      curl -s -X POST ${baseUrl}/api/v1/boards \
        -H "X-API-Key: ${apiKey}" \
        -H "Content-Type: application/json" \
        -d '{"name": "Concurrent Test Board", "template": "kanban"}'
    `);
    boardId = JSON.parse(stdout).data.id;

    // Define concurrent operations
    const operations: Array<Promise<void>> = [];

    // User operations: Create 10 tasks
    for (let i = 0; i < 10; i++) {
      operations.push(
        execAsync(`
          curl -s -X POST ${baseUrl}/api/v1/tasks \
            -H "X-API-Key: ${apiKey}" \
            -H "Content-Type: application/json" \
            -d '{
              "board_id": "${boardId}",
              "title": "Concurrent Task ${i}",
              "priority": ${Math.floor(Math.random() * 5) + 1},
              "status": "todo"
            }'
        `)
          .then(() => {
            void console.log(`Created concurrent task ${i}`);
          })
          .catch(err => {
            errors.push(`Create task ${i}: ${err.message}`);
          })
      );
    }

    // Agent operations: List tasks repeatedly
    for (let i = 0; i < 10; i++) {
      operations.push(
        new Promise(resolve => setTimeout(resolve, i * 50)) // Stagger the requests slightly
          .then(async () =>
            execAsync(`
            curl -s -X GET "${baseUrl}/api/v1/tasks?board_id=${boardId}" \
              -H "X-API-Key: ${apiKey}"
          `)
          )
          .then(({ stdout: queryOutput }) => {
            const tasks = JSON.parse(queryOutput).data.items;
            console.log(`Agent query ${i}: Found ${tasks.length} tasks`);
          })
          .catch(err => {
            errors.push(`List tasks ${i}: ${err.message}`);
          })
      );
    }

    // Execute all operations concurrently
    await Promise.all(operations);

    console.log(`Completed with ${errors.length} errors`);
    errors.forEach(err => console.error(err));

    // Verify system handled the load
    expect(errors.length).toBeLessThan(5); // Allow some errors but not too many

    // Verify final state
    const { stdout: finalCheck } = await execAsync(`
      curl -s -X GET "${baseUrl}/api/v1/tasks?board_id=${boardId}" \
        -H "X-API-Key: ${apiKey}"
    `);
    const finalTasks = JSON.parse(finalCheck).data.items;

    expect(finalTasks.length).toBeGreaterThanOrEqual(5); // At least half should succeed
    console.log(`Final task count: ${finalTasks.length}`);
  }, 30000);

  it('should simulate realistic workflow with mixed operations', async () => {
    const operations: Array<{ type: string; time: number }> = [];
    let boardId: string;
    const taskIds: string[] = [];

    // Create board
    const { stdout } = await execAsync(`
      curl -s -X POST ${baseUrl}/api/v1/boards \
        -H "X-API-Key: ${apiKey}" \
        -H "Content-Type: application/json" \
        -d '{"name": "Workflow Test Board", "template": "kanban"}'
    `);
    boardId = JSON.parse(stdout).data.id;

    // Simulate 30 random operations
    for (let i = 0; i < 30; i++) {
      const opType = Math.random();
      const startTime = Date.now();

      try {
        if (opType < 0.4 && taskIds.length < 15) {
          // User creates task (40% chance if under limit)
          const { stdout: createResp } = await execAsync(`
            curl -s -X POST ${baseUrl}/api/v1/tasks \
              -H "X-API-Key: ${apiKey}" \
              -H "Content-Type: application/json" \
              -d '{
                "board_id": "${boardId}",
                "title": "Task ${i}",
                "priority": ${Math.floor(Math.random() * 5) + 1},
                "status": "todo"
              }'
          `);
          const taskId = JSON.parse(createResp).data.id;
          taskIds.push(taskId);
          operations.push({ type: 'create_task', time: Date.now() - startTime });
        } else if (opType < 0.6) {
          // User lists tasks (20% chance)
          await execAsync(`
            curl -s -X GET "${baseUrl}/api/v1/tasks?board_id=${boardId}" \
              -H "X-API-Key: ${apiKey}"
          `);
          operations.push({ type: 'list_tasks', time: Date.now() - startTime });
        } else if (opType < 0.8 && taskIds.length > 0) {
          // Agent updates task status (20% chance)
          const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
          const statuses = ['in_progress', 'done', 'blocked'];
          const newStatus = statuses[Math.floor(Math.random() * statuses.length)];

          await execAsync(`
            curl -s -X PATCH ${baseUrl}/api/v1/tasks/${taskId} \
              -H "X-API-Key: ${apiKey}" \
              -H "Content-Type: application/json" \
              -d '{"status": "${newStatus}"}'
          `);
          operations.push({ type: 'update_status', time: Date.now() - startTime });
        } else if (taskIds.length > 0) {
          // Agent adds note (20% chance)
          const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
          await execAsync(`
            curl -s -X POST ${baseUrl}/api/v1/tasks/${taskId}/notes \
              -H "X-API-Key: ${apiKey}" \
              -H "Content-Type: application/json" \
              -d '{"content": "Progress update ${i}"}'
          `);
          operations.push({ type: 'add_note', time: Date.now() - startTime });
        }

        // Random delay between operations (50-200ms)
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
      } catch (err: any) {
        console.error(`Operation ${i} failed: ${err.message}`);
      }
    }

    // Calculate statistics
    const stats = operations.reduce(
      (acc, op) => {
        if (!acc[op.type]) {
          acc[op.type] = { count: 0, totalTime: 0 };
        }
        acc[op.type].count++;
        acc[op.type].totalTime += op.time;
        return acc;
      },
      {} as Record<string, { count: number; totalTime: number }>
    );

    console.log('Operation statistics:');
    Object.entries(stats).forEach(([type, data]) => {
      console.log(
        `  ${type}: ${data.count} ops, avg ${(data.totalTime / data.count).toFixed(2)}ms`
      );
    });

    // Verify operations completed successfully
    expect(operations.length).toBeGreaterThan(20);
    expect(taskIds.length).toBeGreaterThan(5);
  }, 45000);
});
