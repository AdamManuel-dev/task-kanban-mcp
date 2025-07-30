/**
 * @fileoverview AI Agent Concurrent Simulation using HTTP API
 * @lastmodified 2025-01-30T01:20:00Z
 *
 * Features: Multiple AI agents working concurrently via HTTP endpoints
 * Main APIs: All HTTP REST endpoints (/api/v1/*)
 * Constraints: Tests concurrent HTTP operations and state consistency
 * Patterns: Agent collaboration, HTTP API usage, concurrent requests
 */

// Mock the service metrics decorator first
import request from 'supertest';
import type { Express } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createServer } from '../../src/server';
import { dbConnection } from '../../src/database/connection';

jest.mock('../../src/utils/service-metrics', () => ({
  TrackPerformance: () => () => ({}),
  serviceMetricsCollector: {
    collectMetric: jest.fn(),
    getMetrics: jest.fn(() => ({ total: 0, success: 0, failure: 0 })),
  },
}));

interface AgentAction {
  agentId: string;
  action: string;
  targetId?: string;
  timestamp: number;
  duration: number;
  success: boolean;
  error?: string;
}

interface AgentMetrics {
  agentId: string;
  actionsPerformed: number;
  tasksCreated: number;
  tasksCompleted: number;
  averageActionTime: number;
  errors: number;
}

class HTTPAIAgent {
  private readonly actions: AgentAction[] = [];

  private tasksCreated = 0;

  private tasksCompleted = 0;

  constructor(
    private readonly agentId: string,
    private readonly boardId: string,
    private readonly app: Express,
    private readonly apiKey: string
  ) {}

  async createTask(title: string, priority: number): Promise<string | null> {
    const startTime = Date.now();
    let success = true;
    let taskId: string | null = null;
    let error: string | undefined;

    try {
      const response = await request(this.app)
        .post('/api/v1/tasks')
        .set('X-API-Key', this.apiKey)
        .send({
          board_id: this.boardId,
          title,
          priority,
          status: 'todo',
        });

      if (response.body.success) {
        taskId = response.body.data.id;
        this.tasksCreated++;
      } else {
        throw new Error(response.body.error || 'Failed to create task');
      }
    } catch (err: any) {
      success = false;
      error = err.message;
      taskId = null;
    }

    this.recordAction('create_task', taskId || undefined, startTime, success, error);
    return taskId;
  }

  async findNextTask(): Promise<{ id: string; title: string } | null> {
    const startTime = Date.now();
    let success = true;
    let task: any = null;
    let error: string | undefined;

    try {
      const response = await request(this.app)
        .get('/api/v1/tasks')
        .set('X-API-Key', this.apiKey)
        .query({
          board_id: this.boardId,
          status: 'todo',
          sort_by: 'priority',
          sort_order: 'desc',
          limit: 1,
        });

      if (response.body.success && response.body.data.items.length > 0) {
        task = response.body.data.items[0];
      }
    } catch (err: any) {
      success = false;
      error = err.message;
    }

    this.recordAction('find_task', task?.id, startTime, success, error);
    return task;
  }

  async workOnTask(taskId: string): Promise<void> {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;

    try {
      // Update to in_progress
      await request(this.app)
        .patch(`/api/v1/tasks/${taskId}`)
        .set('X-API-Key', this.apiKey)
        .send({ status: 'in_progress' });

      // Simulate work time
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

      // Complete the task
      await request(this.app)
        .patch(`/api/v1/tasks/${taskId}`)
        .set('X-API-Key', this.apiKey)
        .send({ status: 'done' });

      this.tasksCompleted++;
    } catch (err: any) {
      success = false;
      error = err.message;
    }

    this.recordAction('work_on_task', taskId, startTime, success, error);
  }

  async analyzeBoard(): Promise<{ total: number; todo: number; done: number }> {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;
    let analysis = { total: 0, todo: 0, done: 0 };

    try {
      const response = await request(this.app)
        .get('/api/v1/tasks')
        .set('X-API-Key', this.apiKey)
        .query({ board_id: this.boardId, limit: 100 });

      if (response.body.success) {
        const tasks = response.body.data.items;
        analysis = {
          total: tasks.length,
          todo: tasks.filter((t: any) => t.status === 'todo').length,
          done: tasks.filter((t: any) => t.status === 'done').length,
        };
      }
    } catch (err: any) {
      success = false;
      error = err.message;
    }

    this.recordAction('analyze_board', undefined, startTime, success, error);
    return analysis;
  }

  async collaborateWithAgent(otherAgentId: string): Promise<void> {
    const startTime = Date.now();

    // Simulate agent collaboration by analyzing the board
    // and deciding whether to create more tasks or work on existing ones
    const analysis = await this.analyzeBoard();

    if (analysis.todo < 3) {
      // Create more tasks
      await this.createTask(`Collaborative task from ${this.agentId}`, 3);
    } else if (analysis.todo > 5) {
      // Help complete tasks
      const task = await this.findNextTask();
      if (task) {
        await this.workOnTask(task.id);
      }
    }

    this.recordAction('collaborate', otherAgentId, startTime, true);
  }

  private recordAction(
    action: string,
    targetId: string | undefined,
    startTime: number,
    success: boolean,
    error?: string
  ) {
    this.actions.push({
      agentId: this.agentId,
      action,
      targetId,
      timestamp: startTime,
      duration: Date.now() - startTime,
      success,
      error,
    });
  }

  getMetrics(): AgentMetrics {
    const totalActions = this.actions.length;
    const errors = this.actions.filter(a => !a.success).length;
    const totalTime = this.actions.reduce((sum, a) => sum + a.duration, 0);

    return {
      agentId: this.agentId,
      actionsPerformed: totalActions,
      tasksCreated: this.tasksCreated,
      tasksCompleted: this.tasksCompleted,
      averageActionTime: totalActions > 0 ? totalTime / totalActions : 0,
      errors,
    };
  }

  getActionLog(): AgentAction[] {
    return this.actions;
  }
}

describe('AI Agent HTTP Concurrent Simulation', () => {
  let app: Express;
  let server: any;
  let boardId: string;
  let apiKey: string;
  const agents: HTTPAIAgent[] = [];

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.KANBAN_TEST_MODE = 'true';
    apiKey = `test-api-key-${Date.now()}`;
    process.env.KANBAN_API_KEYS = apiKey;

    // Initialize database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Create Express app
    app = await createServer();
    server = app.listen(0);

    // Create test board
    const boardResponse = await request(app)
      .post('/api/v1/boards')
      .set('X-API-Key', apiKey)
      .send({ name: 'HTTP AI Agent Simulation Board', template: 'kanban' });

    boardId = boardResponse.body.data.id;
  }, 30000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
      });
    }
    await dbConnection.close();
  });

  it('should simulate 10 AI agents working concurrently via HTTP', async () => {
    const numAgents = 10;
    const startTime = Date.now();

    // Create agents
    for (let i = 0; i < numAgents; i++) {
      agents.push(new HTTPAIAgent(`http-agent-${i}`, boardId, app, apiKey));
    }

    // Create initial tasks via HTTP
    for (let i = 0; i < 15; i++) {
      await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', apiKey)
        .send({
          board_id: boardId,
          title: `Initial HTTP task ${i + 1}`,
          priority: Math.floor(Math.random() * 5) + 1,
          status: 'todo',
        });
    }

    // Simulate concurrent agent operations via HTTP
    const operations: Array<Promise<void>> = [];

    for (let round = 0; round < 5; round++) {
      for (const agent of agents) {
        operations.push(
          (async () => {
            const action = Math.random();

            if (action < 0.3) {
              // Create a new task
              await agent.createTask(
                `HTTP Task by ${agent.getMetrics().agentId} round ${round}`,
                Math.floor(Math.random() * 5) + 1
              );
            } else if (action < 0.7) {
              // Work on a task
              const task = await agent.findNextTask();
              if (task) {
                await agent.workOnTask(task.id);
              }
            } else if (action < 0.9) {
              // Analyze the board
              await agent.analyzeBoard();
            } else {
              // Collaborate with another agent
              const otherAgent = agents[Math.floor(Math.random() * agents.length)];
              await agent.collaborateWithAgent(otherAgent.getMetrics().agentId);
            }
          })()
        );
      }
    }

    // Execute all operations concurrently
    await Promise.all(operations);
    const duration = Date.now() - startTime;

    // Collect and analyze metrics
    const allMetrics = agents.map(agent => agent.getMetrics());

    const totalActions = allMetrics.reduce((sum, m) => sum + m.actionsPerformed, 0);
    const totalTasksCreated = allMetrics.reduce((sum, m) => sum + m.tasksCreated, 0);
    const totalTasksCompleted = allMetrics.reduce((sum, m) => sum + m.tasksCompleted, 0);
    const totalErrors = allMetrics.reduce((sum, m) => sum + m.errors, 0);
    const avgActionTime = allMetrics.reduce((sum, m) => sum + m.averageActionTime, 0) / numAgents;

    // Get final board state via HTTP
    const finalStateResponse = await request(app)
      .get('/api/v1/tasks')
      .set('X-API-Key', apiKey)
      .query({ board_id: boardId, limit: 200 });

    const tasks = finalStateResponse.body.data.items;
    const todoCount = tasks.filter((t: any) => t.status === 'todo').length;
    const inProgressCount = tasks.filter((t: any) => t.status === 'in_progress').length;
    const doneCount = tasks.filter((t: any) => t.status === 'done').length;

    console.log('\\n=== HTTP AI Agent Simulation Results ===');
    console.log(`Number of agents: ${numAgents}`);
    console.log(`Total duration: ${duration}ms`);
    console.log(`Total actions performed: ${totalActions}`);
    console.log(`Actions per second: ${((totalActions / duration) * 1000).toFixed(2)}`);
    console.log(`Tasks created via HTTP: ${totalTasksCreated}`);
    console.log(`Tasks completed via HTTP: ${totalTasksCompleted}`);
    console.log(`Total errors: ${totalErrors}`);
    console.log(`Average action time: ${avgActionTime.toFixed(2)}ms`);
    console.log('\\nFinal board state (via HTTP):');
    console.log(`  Total tasks: ${tasks.length}`);
    console.log(`  Todo: ${todoCount}`);
    console.log(`  In Progress: ${inProgressCount}`);
    console.log(`  Done: ${doneCount}`);

    // Per-agent metrics
    console.log('\\nPer-agent HTTP performance:');
    allMetrics.forEach(m => {
      console.log(
        `  ${m.agentId}: ${m.actionsPerformed} actions, ${m.tasksCreated} created, ${m.tasksCompleted} completed`
      );
    });

    // Verify results
    expect(totalActions).toBeGreaterThan(numAgents * 5); // At least 5 actions per agent
    expect(totalTasksCreated).toBeGreaterThan(15); // More than initial tasks
    expect(totalTasksCompleted).toBeGreaterThan(0); // Some tasks completed
    expect(totalErrors).toBeLessThan(totalActions * 0.1); // Less than 10% error rate
    expect(avgActionTime).toBeLessThan(500); // Reasonable HTTP response time
  }, 30000);

  it('should maintain HTTP API consistency under heavy concurrent load', async () => {
    const testAgents: HTTPAIAgent[] = [];
    const numAgents = 20;
    const actionsPerAgent = 10;

    // Create agents
    for (let i = 0; i < numAgents; i++) {
      testAgents.push(new HTTPAIAgent(`http-load-test-${i}`, boardId, app, apiKey));
    }

    const operations: Array<Promise<void>> = [];

    // Each agent performs rapid HTTP operations
    for (const agent of testAgents) {
      for (let i = 0; i < actionsPerAgent; i++) {
        operations.push(agent.createTask(`HTTP Load test ${i}`, 1).catch(() => {}));

        operations.push(
          (async () => {
            const task = await agent.findNextTask();
            if (task) {
              await agent.workOnTask(task.id);
            }
          })().catch(() => {})
        );
      }
    }

    const startTime = Date.now();
    await Promise.all(operations);
    const duration = Date.now() - startTime;

    const totalOps = numAgents * actionsPerAgent * 2;
    const opsPerSecond = (totalOps / duration) * 1000;

    console.log('\\n=== HTTP Load Test Results ===');
    console.log(`Total HTTP operations: ${totalOps}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`HTTP Operations per second: ${opsPerSecond.toFixed(2)}`);

    // Verify data integrity via HTTP API
    const integrityResponse = await request(app)
      .get('/api/v1/tasks')
      .set('X-API-Key', apiKey)
      .query({ board_id: boardId, limit: 500 });

    const allTasks = integrityResponse.body.data.items;
    const uniqueIds = new Set(allTasks.map((t: any) => t.id));

    expect(uniqueIds.size).toBe(allTasks.length); // No duplicate IDs
    expect(opsPerSecond).toBeGreaterThan(100); // At least 100 HTTP ops/sec
  }, 30000);

  it('should demonstrate HTTP agent collaboration patterns', async () => {
    const collaborativeAgents = [
      new HTTPAIAgent('http-creator', boardId, app, apiKey),
      new HTTPAIAgent('http-worker-1', boardId, app, apiKey),
      new HTTPAIAgent('http-worker-2', boardId, app, apiKey),
      new HTTPAIAgent('http-reviewer', boardId, app, apiKey),
    ];

    // Creator agent creates tasks via HTTP
    for (let i = 0; i < 10; i++) {
      await collaborativeAgents[0].createTask(`HTTP Feature ${i + 1}`, (i % 5) + 1);
    }

    // Workers process tasks concurrently via HTTP
    const workerOps = [];
    for (let i = 0; i < 5; i++) {
      workerOps.push(
        collaborativeAgents[1].findNextTask().then(async task => {
          if (task) return collaborativeAgents[1].workOnTask(task.id);
        })
      );

      workerOps.push(
        collaborativeAgents[2].findNextTask().then(async task => {
          if (task) return collaborativeAgents[2].workOnTask(task.id);
        })
      );
    }

    await Promise.all(workerOps);

    // Reviewer analyzes progress via HTTP
    const analysis = await collaborativeAgents[3].analyzeBoard();

    // Agents collaborate based on analysis
    const collaborationOps = collaborativeAgents.map(async agent =>
      agent.collaborateWithAgent('http-reviewer')
    );

    await Promise.all(collaborationOps);

    // Collect metrics
    const metrics = collaborativeAgents.map(a => a.getMetrics());

    console.log('\\n=== HTTP Collaboration Pattern Results ===');
    metrics.forEach(m => {
      console.log(`${m.agentId}: Created ${m.tasksCreated}, Completed ${m.tasksCompleted}`);
    });
    console.log(`Final HTTP analysis: ${JSON.stringify(analysis)}`);

    // Verify collaboration worked via HTTP
    expect(metrics[0].tasksCreated).toBeGreaterThan(0); // Creator created tasks
    expect(metrics[1].tasksCompleted + metrics[2].tasksCompleted).toBeGreaterThan(0); // Workers completed tasks
    expect(analysis.total).toBeGreaterThan(0); // Board has tasks
  });
});
