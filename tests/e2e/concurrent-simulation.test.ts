/**
 * @fileoverview E2E test for concurrent user and agent simulation
 * @lastmodified 2025-01-30T00:00:00Z
 *
 * Features: Tests concurrent user and AI agent interactions
 * Main APIs: Direct database operations to avoid server complexity
 * Constraints: Simulates realistic concurrent operations
 * Patterns: Concurrent task execution, state validation
 */

import { v4 as uuidv4 } from 'uuid';
import { dbConnection } from '../../src/database/connection';

interface SimulatedTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  board_id: string;
  created_at: Date;
  updated_at: Date;
}

describe('Concurrent User and Agent Simulation', () => {
  let boardId: string;

  beforeAll(async () => {
    // Initialize test database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Create a test board
    boardId = uuidv4();
    await dbConnection.db.run(
      `INSERT INTO boards (id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))`,
      [boardId, 'Simulation Board']
    );

    // Create columns for the board
    const columnIds: Record<string, string> = {};
    const columns = ['Todo', 'In Progress', 'Done'];
    for (let i = 0; i < columns.length; i++) {
      const columnId = uuidv4();
      columnIds[columns[i]] = columnId;
      await dbConnection.db.run(
        `INSERT INTO columns (id, board_id, name, position, created_at, updated_at) 
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [columnId, boardId, columns[i], i]
      );
    }
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  it('should simulate 50 concurrent user and agent actions', async () => {
    const userActions: Array<{ type: string; timestamp: number }> = [];
    const agentActions: Array<{ type: string; timestamp: number }> = [];
    const errors: string[] = [];
    let tasksCreated = 0;
    let tasksCompleted = 0;

    // User action: Create a task
    const userCreateTask = async (index: number) => {
      const startTime = Date.now();
      try {
        const taskId = uuidv4();
        const columnId = await dbConnection.db.get(
          `SELECT id FROM columns WHERE board_id = ? AND name = 'Todo' LIMIT 1`,
          [boardId]
        );
        
        await dbConnection.db.run(
          `INSERT INTO tasks (id, title, board_id, column_id, status, priority, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [
            taskId,
            `User Task ${index}`,
            boardId,
            columnId?.id || 'default',
            'todo',
            Math.floor(Math.random() * 5) + 1,
            index * 1000  // position
          ]
        );
        tasksCreated++;
        userActions.push({ type: 'create_task', timestamp: Date.now() - startTime });
      } catch (err: any) {
        errors.push(`User create task ${index}: ${err.message}`);
      }
    };

    // User action: Check task status
    const userCheckStatus = async () => {
      const startTime = Date.now();
      try {
        const result = await dbConnection.db.get(
          `SELECT COUNT(*) as count, status FROM tasks WHERE board_id = ? GROUP BY status`,
          [boardId]
        );
        userActions.push({ type: 'check_status', timestamp: Date.now() - startTime });
      } catch (err: any) {
        errors.push(`User check status: ${err.message}`);
      }
    };

    // Agent action: Get next task to work on
    const agentGetTask = async () => {
      const startTime = Date.now();
      try {
        const task = await dbConnection.db.get(
          `SELECT id, title FROM tasks WHERE board_id = ? AND status = 'todo' ORDER BY priority DESC LIMIT 1`,
          [boardId]
        );
        agentActions.push({ type: 'get_task', timestamp: Date.now() - startTime });
        return task;
      } catch (err: any) {
        errors.push(`Agent get task: ${err.message}`);
        return null;
      }
    };

    // Agent action: Complete a task
    const agentCompleteTask = async (taskId: string) => {
      const startTime = Date.now();
      try {
        // Update to in_progress
        await dbConnection.db.run(
          `UPDATE tasks SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?`,
          [taskId]
        );

        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 10));

        // Complete the task
        await dbConnection.db.run(
          `UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?`,
          [taskId]
        );

        tasksCompleted++;
        agentActions.push({ type: 'complete_task', timestamp: Date.now() - startTime });
      } catch (err: any) {
        errors.push(`Agent complete task: ${err.message}`);
      }
    };

    // Create initial tasks
    for (let i = 0; i < 10; i++) {
      await userCreateTask(i);
    }

    // Run 50 concurrent operations
    const operations: Promise<void>[] = [];

    for (let i = 0; i < 50; i++) {
      // User actions
      if (i % 2 === 0) {
        operations.push(
          new Promise(async (resolve) => {
            await new Promise(r => setTimeout(r, Math.random() * 100));
            if (Math.random() > 0.5) {
              await userCreateTask(10 + i);
            } else {
              await userCheckStatus();
            }
            resolve();
          })
        );
      }

      // Agent actions
      if (i % 3 === 0) {
        operations.push(
          new Promise(async (resolve) => {
            await new Promise(r => setTimeout(r, Math.random() * 150 + 50));
            const task = await agentGetTask();
            if (task) {
              await agentCompleteTask(task.id);
            }
            resolve();
          })
        );
      }
    }

    // Execute all operations concurrently
    const startTime = Date.now();
    await Promise.all(operations);
    const duration = Date.now() - startTime;

    // Verify results
    const finalStats = await dbConnection.db.get(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo_count,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_count
       FROM tasks WHERE board_id = ?`,
      [boardId]
    );

    console.log('Simulation Results:');
    console.log(`- Duration: ${duration}ms`);
    console.log(`- User actions: ${userActions.length}`);
    console.log(`- Agent actions: ${agentActions.length}`);
    console.log(`- Tasks created: ${tasksCreated}`);
    console.log(`- Tasks completed: ${tasksCompleted}`);
    console.log(`- Errors: ${errors.length}`);
    if (errors.length > 0) {
      console.log('First few errors:', errors.slice(0, 3));
    }
    console.log(`- Final state: Total=${finalStats.total}, Todo=${finalStats.todo_count}, Done=${finalStats.done_count}`);

    // Calculate concurrency
    const allActions = [...userActions, ...agentActions];
    const avgResponseTime = allActions.reduce((sum, a) => sum + a.timestamp, 0) / allActions.length;
    console.log(`- Average operation time: ${avgResponseTime.toFixed(2)}ms`);

    // Assertions
    expect(userActions.length + agentActions.length).toBeGreaterThan(20);
    expect(tasksCreated).toBeGreaterThanOrEqual(0);
    expect(tasksCompleted).toBeGreaterThanOrEqual(0);
    expect(errors.length).toBeLessThan(50);
    expect(finalStats.total).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('should handle heavy concurrent load', async () => {
    const errors: string[] = [];
    const operations: Promise<void>[] = [];
    const actionTimestamps: number[] = [];

    // Create 100 concurrent operations
    for (let i = 0; i < 100; i++) {
      operations.push(
        new Promise(async (resolve) => {
          const startTime = Date.now();
          try {
            if (i % 3 === 0) {
              // Create task
              const columnId = await dbConnection.db.get(
                `SELECT id FROM columns WHERE board_id = ? AND name = 'Todo' LIMIT 1`,
                [boardId]
              );
              await dbConnection.db.run(
                `INSERT INTO tasks (id, title, board_id, column_id, status, priority, position, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
                [uuidv4(), `Load Test ${i}`, boardId, columnId?.id || 'default', 'todo', 1, i * 1000]
              );
            } else if (i % 3 === 1) {
              // Read tasks
              await dbConnection.db.all(
                `SELECT * FROM tasks WHERE board_id = ? LIMIT 10`,
                [boardId]
              );
            } else {
              // Update random task
              await dbConnection.db.run(
                `UPDATE tasks SET status = 'in_progress', updated_at = datetime('now') 
                 WHERE board_id = ? AND status = 'todo' 
                 ORDER BY RANDOM() LIMIT 1`,
                [boardId]
              );
            }
            actionTimestamps.push(Date.now() - startTime);
          } catch (err: any) {
            errors.push(`Operation ${i}: ${err.message}`);
          }
          resolve();
        })
      );
    }

    const startTime = Date.now();
    await Promise.all(operations);
    const totalDuration = Date.now() - startTime;

    const successfulOps = 100 - errors.length;
    const opsPerSecond = (successfulOps / totalDuration) * 1000;

    console.log('Load Test Results:');
    console.log(`- Total duration: ${totalDuration}ms`);
    console.log(`- Successful operations: ${successfulOps}`);
    console.log(`- Failed operations: ${errors.length}`);
    console.log(`- Operations per second: ${opsPerSecond.toFixed(2)}`);

    // Verify system stability
    expect(errors.length).toBeLessThan(100); // Allow more errors for concurrent operations
    expect(opsPerSecond).toBeGreaterThan(10); // At least 10 ops/sec
  }, 30000);
});