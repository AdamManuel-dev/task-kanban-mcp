/**
 * @fileoverview E2E test for concurrent MCP interactions via HTTP
 * @lastmodified 2025-01-30T00:00:00Z
 *
 * Features: Tests multiple concurrent MCP-style interactions via HTTP API
 * Main APIs: HTTP endpoints that simulate MCP protocol operations
 * Constraints: Uses HTTP instead of stdio transport for easier testing
 * Patterns: Concurrent operations, tool simulation, state management
 */

import request from 'supertest';
import type { Express } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { createServer } from '../../src/server';
import { dbConnection } from '../../src/database/connection';

// Mock the service metrics decorator
jest.mock('../../src/utils/service-metrics', () => ({
  TrackPerformance: () => () => ({}),
  serviceMetricsCollector: {
    collectMetric: jest.fn(),
    getMetrics: jest.fn(() => ({ total: 0, success: 0, failure: 0 })),
  },
}));

interface MCPOperation {
  type: 'tool_call' | 'resource_read' | 'prompt_get';
  name: string;
  parameters?: any;
  clientId: string;
  timestamp: number;
  duration?: number;
  success: boolean;
  error?: string;
}

class MCPSimulatedClient {
  private readonly operations: MCPOperation[] = [];

  constructor(
    private readonly clientId: string,
    private readonly app: Express,
    private readonly apiKey: string
  ) {}

  async callTool(toolName: string, args: any): Promise<any> {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;
    let result: any;

    try {
      switch (toolName) {
        case 'create_task':
          result = await this.createTask(args);
          break;
        case 'search_tasks':
          result = await this.searchTasks(args);
          break;
        case 'get_context':
          result = await this.getContext(args);
          break;
        case 'update_task':
          result = await this.updateTask(args);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (err: any) {
      success = false;
      error = err.message;
      console.error(`[${this.clientId}] Tool call failed:`, err.message);
    }

    const operation: MCPOperation = {
      type: 'tool_call',
      name: toolName,
      parameters: args,
      clientId: this.clientId,
      timestamp: startTime,
      duration: Date.now() - startTime,
      success,
      error,
    };

    this.operations.push(operation);
    return result;
  }

  private async createTask(args: any): Promise<any> {
    const response = await request(this.app)
      .post('/api/v1/tasks')
      .set('X-API-Key', this.apiKey)
      .send({
        board_id: args.board_id || args.board_name, // Handle both formats
        title: args.title,
        description: args.description,
        priority: args.priority || 3,
        status: args.status || 'todo',
      });

    if (!response.body.success) {
      throw new Error(response.body.error || 'Failed to create task');
    }

    return response.body.data;
  }

  private async searchTasks(args: any): Promise<any> {
    const response = await request(this.app)
      .get('/api/v1/tasks')
      .set('X-API-Key', this.apiKey)
      .query({
        board_id: args.board_id,
        status: args.status,
        limit: args.limit || 10,
        offset: args.offset || 0,
        sort_by: args.sort_by,
        sort_order: args.sort_order,
      });

    if (!response.body.success) {
      throw new Error(response.body.error || 'Failed to search tasks');
    }

    return {
      tasks: response.body.data.items,
      total: response.body.data.total,
    };
  }

  private async getContext(args: any): Promise<any> {
    // Simulate context aggregation
    const tasksResponse = await request(this.app)
      .get('/api/v1/tasks')
      .set('X-API-Key', this.apiKey)
      .query({ board_id: args.board_id, limit: 50 });

    const tasks = tasksResponse.body.data.items;

    const todoCount = tasks.filter((t: any) => t.status === 'todo').length;
    const inProgressCount = tasks.filter((t: any) => t.status === 'in_progress').length;
    const doneCount = tasks.filter((t: any) => t.status === 'done').length;

    return {
      board_id: args.board_id,
      summary: {
        total_tasks: tasks.length,
        todo: todoCount,
        in_progress: inProgressCount,
        done: doneCount,
      },
      recent_tasks: tasks.slice(0, 5),
    };
  }

  private async updateTask(args: any): Promise<any> {
    const response = await request(this.app)
      .patch(`/api/v1/tasks/${args.id || args.task_id}`)
      .set('X-API-Key', this.apiKey)
      .send({
        status: args.status,
        priority: args.priority,
        title: args.title,
        description: args.description,
      });

    if (!response.body.success) {
      throw new Error(response.body.error || 'Failed to update task');
    }

    return response.body.data;
  }

  async simulateAgentWorkflow(boardId: string): Promise<void> {
    // 1. Get context
    const context = await this.callTool('get_context', { board_id: boardId });
    console.log(`[${this.clientId}] Got context: ${context.summary.total_tasks} tasks`);

    // 2. Search for todo tasks
    const todoTasks = await this.callTool('search_tasks', {
      board_id: boardId,
      status: 'todo',
      sort_by: 'priority',
      sort_order: 'desc',
    });

    if (todoTasks && todoTasks.tasks.length > 0) {
      // 3. Work on highest priority task
      const task = todoTasks.tasks[0];
      console.log(`[${this.clientId}] Working on task: ${task.title}`);

      // Update to in_progress
      await this.callTool('update_task', {
        task_id: task.id,
        status: 'in_progress',
      });

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

      // Complete the task
      await this.callTool('update_task', {
        task_id: task.id,
        status: 'done',
      });

      console.log(`[${this.clientId}] Completed task: ${task.title}`);
    }
  }

  getMetrics() {
    const totalOps = this.operations.length;
    const successfulOps = this.operations.filter(op => op.success).length;
    const failedOps = this.operations.filter(op => !op.success).length;
    const avgDuration = this.operations.reduce((sum, op) => sum + (op.duration || 0), 0) / totalOps;

    return {
      clientId: this.clientId,
      totalOperations: totalOps,
      successfulOperations: successfulOps,
      failedOperations: failedOps,
      averageDuration: avgDuration,
      operationsByType: this.operations.reduce(
        (acc, op) => {
          acc[op.type] = (acc[op.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }
}

describe('MCP HTTP Simulation', () => {
  let app: Express;
  let server: any;
  let apiKey: string;
  let testBoardId: string;

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.KANBAN_TEST_MODE = 'true';
    apiKey = `test-api-key-${Date.now()}`;
    process.env.KANBAN_API_KEYS = apiKey;

    // Initialize database
    await dbConnection.initialize();

    // Create server
    app = await createServer();
    server = app.listen(0);

    // Create a test board
    const boardResponse = await request(app)
      .post('/api/v1/boards')
      .set('X-API-Key', apiKey)
      .send({ name: 'MCP Test Board', template: 'kanban' });

    testBoardId = boardResponse.body.data.id;
  }, 30000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
      });
    }
    await dbConnection.close();
  });

  it('should simulate 10 concurrent AI agents working on tasks', async () => {
    const numAgents = 10;
    const agents: MCPSimulatedClient[] = [];

    // Create initial tasks for agents to work on
    for (let i = 0; i < 20; i++) {
      await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', apiKey)
        .send({
          board_id: testBoardId,
          title: `Task ${i + 1}`,
          description: `Task for AI agents to process`,
          priority: Math.floor(Math.random() * 5) + 1,
          status: 'todo',
        });
    }

    // Create agents
    for (let i = 0; i < numAgents; i++) {
      agents.push(new MCPSimulatedClient(`agent-${i}`, app, apiKey));
    }

    // Run concurrent agent workflows
    const startTime = Date.now();
    const workflows = agents.map(async agent =>
      agent.simulateAgentWorkflow(testBoardId).catch(err => {
        console.error(`Agent ${agent.getMetrics().clientId} workflow failed:`, err);
      })
    );

    await Promise.all(workflows);
    const duration = Date.now() - startTime;

    // Collect and analyze metrics
    const allMetrics = agents.map(agent => agent.getMetrics());

    const totalOps = allMetrics.reduce((sum, m) => sum + m.totalOperations, 0);
    const successfulOps = allMetrics.reduce((sum, m) => sum + m.successfulOperations, 0);
    const avgDuration = allMetrics.reduce((sum, m) => sum + m.averageDuration, 0) / numAgents;

    console.log('\n=== Concurrent AI Agent Simulation Results ===');
    console.log(`Total agents: ${numAgents}`);
    console.log(`Total operations: ${totalOps}`);
    console.log(`Successful operations: ${successfulOps}`);
    console.log(`Success rate: ${((successfulOps / totalOps) * 100).toFixed(2)}%`);
    console.log(`Average operation duration: ${avgDuration.toFixed(2)}ms`);
    console.log(`Total workflow duration: ${duration}ms`);
    console.log(`Operations per second: ${((totalOps / duration) * 1000).toFixed(2)}`);

    // Verify results
    expect(totalOps).toBeGreaterThan(numAgents * 3); // At least 3 ops per agent
    expect(successfulOps).toBeGreaterThan(totalOps * 0.8); // 80% success rate
    expect(avgDuration).toBeLessThan(500); // Less than 500ms average
  }, 30000);

  it('should handle rapid concurrent tool calls', async () => {
    const numClients = 5;
    const callsPerClient = 50;
    const clients: MCPSimulatedClient[] = [];

    // Create clients
    for (let i = 0; i < numClients; i++) {
      clients.push(new MCPSimulatedClient(`rapid-${i}`, app, apiKey));
    }

    const operations: Array<Promise<any>> = [];
    const startTime = Date.now();

    // Each client makes rapid tool calls
    for (let i = 0; i < numClients; i++) {
      const client = clients[i];

      for (let j = 0; j < callsPerClient; j++) {
        // Mix of different operations
        if (j % 3 === 0) {
          operations.push(
            client.callTool('create_task', {
              board_id: testBoardId,
              title: `Rapid task ${i}-${j}`,
              priority: (j % 5) + 1,
            })
          );
        } else if (j % 3 === 1) {
          operations.push(
            client.callTool('search_tasks', {
              board_id: testBoardId,
              limit: 5,
              offset: j,
            })
          );
        } else {
          operations.push(
            client.callTool('get_context', {
              board_id: testBoardId,
            })
          );
        }
      }
    }

    // Wait for all operations
    await Promise.allSettled(operations);
    const duration = Date.now() - startTime;

    // Analyze results
    const totalOps = numClients * callsPerClient;
    const opsPerSecond = (totalOps / duration) * 1000;

    const allMetrics = clients.map(c => c.getMetrics());
    const successCount = allMetrics.reduce((sum, m) => sum + m.successfulOperations, 0);

    console.log('\n=== Rapid Fire Test Results ===');
    console.log(`Total operations: ${totalOps}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Operations per second: ${opsPerSecond.toFixed(2)}`);
    console.log(`Success rate: ${((successCount / totalOps) * 100).toFixed(2)}%`);

    // Verify performance
    expect(opsPerSecond).toBeGreaterThan(50); // At least 50 ops/sec
    expect(successCount).toBeGreaterThan(totalOps * 0.9); // 90% success rate
  }, 30000);

  it('should maintain data consistency under concurrent load', async () => {
    const testBoard = uuidv4();
    const numClients = 10;
    const clients: MCPSimulatedClient[] = [];

    // Create board
    await request(app)
      .post('/api/v1/boards')
      .set('X-API-Key', apiKey)
      .send({ id: testBoard, name: 'Consistency Test Board', template: 'kanban' });

    // Create clients
    for (let i = 0; i < numClients; i++) {
      clients.push(new MCPSimulatedClient(`consistency-${i}`, app, apiKey));
    }

    // Each client creates and updates tasks concurrently
    const operations = clients.map(async (client, index) => {
      // Create a task
      const task = await client.callTool('create_task', {
        board_id: testBoard,
        title: `Consistency test ${index}`,
        priority: 3,
      });

      // Update it multiple times
      for (let i = 0; i < 5; i++) {
        await client.callTool('update_task', {
          task_id: task.id,
          status: ['todo', 'in_progress', 'done'][i % 3],
          priority: (i % 5) + 1,
        });
      }

      return task.id;
    });

    const taskIds = await Promise.all(operations);

    // Verify all tasks exist and have consistent state
    const finalTasks = await request(app)
      .get('/api/v1/tasks')
      .set('X-API-Key', apiKey)
      .query({ board_id: testBoard });

    const tasks = finalTasks.body.data.items;

    // Check data integrity
    expect(tasks.length).toBe(numClients);
    expect(new Set(taskIds).size).toBe(numClients); // All unique IDs

    // Verify each task has valid state
    tasks.forEach((task: any) => {
      expect(task.id).toBeTruthy();
      expect(task.title).toBeTruthy();
      expect(['todo', 'in_progress', 'done']).toContain(task.status);
      expect(task.priority).toBeGreaterThanOrEqual(1);
      expect(task.priority).toBeLessThanOrEqual(5);
    });

    console.log('\n=== Data Consistency Test ===');
    console.log(`✓ All ${numClients} tasks created successfully`);
    console.log('✓ No duplicate IDs');
    console.log('✓ All tasks have valid state');
  }, 30000);
});
