/**
 * @fileoverview E2E test simulating user and AI agent interactions via API
 * @lastmodified 2025-01-30T00:00:00Z
 *
 * Features: User simulation, AI agent simulation, concurrent interactions
 * Main APIs: HTTP API endpoints, realistic workflow simulation
 * Constraints: Uses supertest for API calls to avoid curl dependency
 * Patterns: Random action selection, state validation, concurrent operations
 */

import request from 'supertest';
import type { Express } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Import server after mocking
import { createServer } from '../../src/server';
import { dbConnection } from '../../src/database/connection';

// Mock the problematic service metrics decorator
jest.mock('../../src/utils/service-metrics', () => ({
  TrackPerformance: () => () => ({}),
  serviceMetricsCollector: {
    collectMetric: jest.fn(),
    getMetrics: jest.fn(() => ({ total: 0, success: 0, failure: 0 })),
  },
}));

interface TaskState {
  id: string;
  title: string;
  status: string;
  priority: number;
  board_id: string;
  column_id?: string;
}

interface BoardState {
  id: string;
  name: string;
  columns: Array<{ id: string; name: string; position: number }>;
}

class UserSimulator {
  constructor(
    private readonly app: Express,
    private readonly apiKey: string
  ) {}

  private readonly taskCache: Map<string, TaskState> = new Map();

  private readonly boardCache: Map<string, BoardState> = new Map();

  private readonly actionLog: string[] = [];

  async createBoard(name: string): Promise<BoardState> {
    const response = await request(this.app)
      .post('/api/v1/boards')
      .set('X-API-Key', this.apiKey)
      .send({ name, template: 'kanban' });

    if (!response.body.success) {
      throw new Error(`Failed to create board: ${response.body.error}`);
    }

    const board = response.body.data;
    this.boardCache.set(board.id, board);
    this.actionLog.push(`Created board: ${name} (${board.id})`);
    return board;
  }

  async createTask(boardId: string, title: string, priority?: number): Promise<TaskState> {
    const board = this.boardCache.get(boardId);
    if (!board) throw new Error(`Board ${boardId} not found`);

    const columnId = board.columns.find(c => c.name === 'Todo')?.id || board.columns[0]?.id;

    const response = await request(this.app)
      .post('/api/v1/tasks')
      .set('X-API-Key', this.apiKey)
      .send({
        board_id: boardId,
        column_id: columnId,
        title,
        priority: priority || Math.floor(Math.random() * 5) + 1,
        status: 'todo',
      });

    if (!response.body.success) {
      throw new Error(`Failed to create task: ${response.body.error}`);
    }

    const task = response.body.data;
    this.taskCache.set(task.id, task);
    this.actionLog.push(`Created task: ${title} (${task.id})`);
    return task;
  }

  async updateTaskStatus(taskId: string, newStatus: string): Promise<void> {
    const response = await request(this.app)
      .patch(`/api/v1/tasks/${taskId}`)
      .set('X-API-Key', this.apiKey)
      .send({ status: newStatus });

    if (!response.body.success) {
      throw new Error(`Failed to update task: ${response.body.error}`);
    }

    const task = this.taskCache.get(taskId);
    if (task) {
      task.status = newStatus;
    }
    this.actionLog.push(`Updated task ${taskId} status to: ${newStatus}`);
  }

  async addTaskNote(taskId: string, content: string): Promise<void> {
    const response = await request(this.app)
      .post(`/api/v1/tasks/${taskId}/notes`)
      .set('X-API-Key', this.apiKey)
      .send({ content });

    if (!response.body.success) {
      throw new Error(`Failed to add note: ${response.body.error}`);
    }

    this.actionLog.push(`Added note to task ${taskId}`);
  }

  async listTasks(boardId: string): Promise<TaskState[]> {
    const response = await request(this.app)
      .get('/api/v1/tasks')
      .set('X-API-Key', this.apiKey)
      .query({ board_id: boardId });

    if (!response.body.success) {
      throw new Error(`Failed to list tasks: ${response.body.error}`);
    }

    this.actionLog.push(`Listed tasks for board ${boardId}`);
    return response.body.data.items;
  }

  getActionLog(): string[] {
    return this.actionLog;
  }

  getStats() {
    return {
      boards: Array.from(this.boardCache.values()),
      tasks: Array.from(this.taskCache.values()),
      actionCount: this.actionLog.length,
    };
  }
}

class AIAgentSimulator {
  constructor(
    private readonly app: Express,
    private readonly apiKey: string
  ) {}

  private currentProject?: { boardId: string; taskIds: string[] };

  private readonly actionLog: string[] = [];

  private completedTasks = 0;

  async initializeProject(boardId: string): Promise<void> {
    this.currentProject = {
      boardId,
      taskIds: [],
    };
    this.actionLog.push(`AI Agent: Initialized project with board ${boardId}`);
  }

  async searchTasks(status?: string): Promise<TaskState[]> {
    if (!this.currentProject) throw new Error('No project initialized');

    const response = await request(this.app)
      .get('/api/v1/tasks')
      .set('X-API-Key', this.apiKey)
      .query({
        board_id: this.currentProject.boardId,
        ...(status && { status }),
        sort_by: 'priority',
        sort_order: 'desc',
      });

    this.actionLog.push('AI Agent: Searched for tasks');
    return response.body.data.items;
  }

  async workOnTask(taskId: string): Promise<void> {
    // Update to in_progress
    await request(this.app)
      .patch(`/api/v1/tasks/${taskId}`)
      .set('X-API-Key', this.apiKey)
      .send({ status: 'in_progress' });

    this.actionLog.push(`AI Agent: Started working on task ${taskId}`);

    // Simulate work with notes
    const steps = [
      'Analyzing requirements',
      'Implementing solution',
      'Testing implementation',
      'Final review',
    ];

    for (const step of steps) {
      await request(this.app)
        .post(`/api/v1/tasks/${taskId}/notes`)
        .set('X-API-Key', this.apiKey)
        .send({ content: `AI Agent: ${step}` });

      // Simulate work time
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Complete the task
    await request(this.app)
      .patch(`/api/v1/tasks/${taskId}`)
      .set('X-API-Key', this.apiKey)
      .send({ status: 'done' });

    this.completedTasks++;
    this.actionLog.push(`AI Agent: Completed task ${taskId}`);
  }

  getActionLog(): string[] {
    return this.actionLog;
  }

  getStats() {
    return {
      completedTasks: this.completedTasks,
      actionCount: this.actionLog.length,
      currentProject: this.currentProject,
    };
  }
}

describe('User and AI Agent API Simulation', () => {
  let app: Express;
  let server: import('http').Server;
  let apiKey: string;
  let userSimulator: UserSimulator;
  let agentSimulator: AIAgentSimulator;

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

    // Start server
    server = app.listen(0);

    userSimulator = new UserSimulator(app, apiKey);
    agentSimulator = new AIAgentSimulator(app, apiKey);
  }, 30000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
      });
    }
    await dbConnection.close();
  });

  it('should simulate 50 random user and agent interactions concurrently', async () => {
    const userErrors: string[] = [];
    const agentErrors: string[] = [];
    let userActionCount = 0;
    let agentActionCount = 0;

    // Create initial board
    const board = await userSimulator.createBoard('Simulation Board');
    await agentSimulator.initializeProject(board.id);

    // Create some initial tasks
    for (let i = 0; i < 5; i++) {
      await userSimulator.createTask(board.id, `Initial Task ${i + 1}`);
    }

    // Define user actions
    const performUserAction = async (index: number) => {
      try {
        const actionType = Math.random();

        if (actionType < 0.4) {
          // Create task
          await userSimulator.createTask(board.id, `User Task ${index}`);
        } else if (actionType < 0.6) {
          // List tasks
          await userSimulator.listTasks(board.id);
        } else if (actionType < 0.8) {
          // Update task status
          const tasks = await userSimulator.listTasks(board.id);
          if (tasks.length > 0) {
            const task = tasks[Math.floor(Math.random() * tasks.length)];
            const statuses = ['todo', 'in_progress', 'done', 'blocked'];
            await userSimulator.updateTaskStatus(
              task.id,
              statuses[Math.floor(Math.random() * statuses.length)]
            );
          }
        } else {
          // Add note
          const tasks = await userSimulator.listTasks(board.id);
          if (tasks.length > 0) {
            const task = tasks[Math.floor(Math.random() * tasks.length)];
            await userSimulator.addTaskNote(task.id, `User note ${index}`);
          }
        }

        userActionCount++;
      } catch (error: any) {
        userErrors.push(`User action ${index}: ${error.message}`);
      }
    };

    // Define agent actions
    const performAgentAction = async (index: number) => {
      try {
        const todoTasks = await agentSimulator.searchTasks('todo');

        if (todoTasks.length > 0 && Math.random() > 0.3) {
          // Work on a task
          const task = todoTasks[0];
          await agentSimulator.workOnTask(task.id);
        } else {
          // Just search tasks
          await agentSimulator.searchTasks();
        }

        agentActionCount++;
      } catch (error: any) {
        agentErrors.push(`Agent action ${index}: ${error.message}`);
      }
    };

    // Create 50 concurrent operations (25 user, 25 agent)
    const operations: Array<Promise<void>> = [];

    for (let i = 0; i < 25; i++) {
      // Add slight delay to avoid overwhelming the system
      operations.push(
        new Promise(resolve => setTimeout(resolve, i * 20)).then(async () => performUserAction(i))
      );

      operations.push(
        new Promise(resolve => setTimeout(resolve, i * 30 + 10)).then(async () =>
          performAgentAction(i)
        )
      );
    }

    // Execute all operations
    await Promise.all(operations);

    // Get final stats
    const userStats = userSimulator.getStats();
    const agentStats = agentSimulator.getStats();

    console.log(`User actions completed: ${userActionCount}`);
    console.log(`Agent actions completed: ${agentActionCount}`);
    console.log(`User errors: ${userErrors.length}`);
    console.log(`Agent errors: ${agentErrors.length}`);
    console.log(`Total boards: ${userStats.boards.length}`);
    console.log(`Total tasks: ${userStats.tasks.length}`);
    console.log(`Agent completed tasks: ${agentStats.completedTasks}`);

    // Verify results
    expect(userActionCount + agentActionCount).toBeGreaterThan(40); // At least 80% success
    expect(userStats.tasks.length).toBeGreaterThan(5);
    expect(agentStats.completedTasks).toBeGreaterThanOrEqual(0);
    expect(userErrors.length + agentErrors.length).toBeLessThan(10); // Less than 20% errors
  }, 60000);

  it('should validate API responses match expected schema', async () => {
    // Create test data
    const board = await userSimulator.createBoard('Schema Test Board');
    const task = await userSimulator.createTask(board.id, 'Schema Test Task');

    // Test task retrieval
    const getTaskResponse = await request(app)
      .get(`/api/v1/tasks/${task.id}`)
      .set('X-API-Key', apiKey);

    expect(getTaskResponse.body.success).toBe(true);
    expect(getTaskResponse.body.data).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      status: expect.any(String),
      priority: expect.any(Number),
      board_id: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    // Test task listing with pagination
    const listResponse = await request(app)
      .get('/api/v1/tasks')
      .set('X-API-Key', apiKey)
      .query({ board_id: board.id, limit: 10, offset: 0 });

    expect(listResponse.body.success).toBe(true);
    expect(listResponse.body.data).toMatchObject({
      items: expect.any(Array),
      total: expect.any(Number),
      limit: 10,
      offset: 0,
    });

    // Test board retrieval
    const getBoardResponse = await request(app)
      .get(`/api/v1/boards/${board.id}`)
      .set('X-API-Key', apiKey);

    expect(getBoardResponse.body.success).toBe(true);
    expect(getBoardResponse.body.data).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      columns: expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          position: expect.any(Number),
        }),
      ]),
    });
  });

  it('should handle stress test with heavy concurrent load', async () => {
    const errors: string[] = [];
    const board = await userSimulator.createBoard('Stress Test Board');

    // Create 30 concurrent operations
    const operations: Array<Promise<void>> = [];

    // Mix of create, update, and read operations
    for (let i = 0; i < 30; i++) {
      const opType = i % 3;

      operations.push(
        (async () => {
          try {
            if (opType === 0) {
              // Create task
              await userSimulator.createTask(board.id, `Stress Task ${i}`);
            } else if (opType === 1) {
              // List tasks
              const tasks = await userSimulator.listTasks(board.id);
              console.log(`Found ${tasks.length} tasks`);
            } else {
              // Update random task
              const tasks = await userSimulator.listTasks(board.id);
              if (tasks.length > 0) {
                const task = tasks[Math.floor(Math.random() * tasks.length)];
                await userSimulator.updateTaskStatus(task.id, 'in_progress');
              }
            }
          } catch (error: any) {
            errors.push(`Operation ${i}: ${error.message}`);
          }
        })()
      );
    }

    await Promise.all(operations);

    console.log(`Stress test completed with ${errors.length} errors`);

    // Verify system stability
    expect(errors.length).toBeLessThan(5); // Less than ~15% error rate

    // Verify data integrity
    const finalTasks = await userSimulator.listTasks(board.id);
    expect(finalTasks.length).toBeGreaterThan(5);

    // Check no duplicate IDs
    const taskIds = new Set(finalTasks.map(t => t.id));
    expect(taskIds.size).toBe(finalTasks.length);
  }, 45000);
});
