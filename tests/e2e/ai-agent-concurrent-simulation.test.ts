/**
 * @fileoverview E2E test simulating concurrent AI agent interactions
 * @lastmodified 2025-01-30T00:00:00Z
 *
 * Features: Multiple AI agents working concurrently on kanban tasks
 * Main APIs: Direct database operations simulating MCP-style interactions
 * Constraints: Tests concurrent operations and state consistency
 * Patterns: Agent collaboration, task management, concurrent updates
 */

import { v4 as uuidv4 } from 'uuid';
import { dbConnection } from '../../src/database/connection';

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

class AIAgent {
  private readonly actions: AgentAction[] = [];

  private tasksCreated = 0;

  private tasksCompleted = 0;

  constructor(
    private readonly agentId: string,
    private readonly boardId: string
  ) {}

  async createTask(title: string, priority: number): Promise<string | null> {
    const startTime = Date.now();
    let success = true;
    let taskId: string | null = null;
    let error: string | undefined;

    try {
      taskId = uuidv4();
      const columnId = await this.getColumnId('Todo');

      await dbConnection.execute(
        `INSERT INTO tasks (id, title, board_id, column_id, status, priority, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [taskId, title, this.boardId, columnId, 'todo', priority, Date.now()]
      );

      this.tasksCreated++;
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
      const result = await dbConnection.query(
        `SELECT id, title FROM tasks 
         WHERE board_id = ? AND status = 'todo' 
         ORDER BY priority DESC, created_at ASC 
         LIMIT 1`,
        [this.boardId]
      );

      task = result[0] || null;
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
      await dbConnection.execute(
        `UPDATE tasks SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?`,
        [taskId]
      );

      // Simulate work time
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

      // Complete the task
      await dbConnection.execute(
        `UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?`,
        [taskId]
      );

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
      const result = await dbConnection.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
         FROM tasks WHERE board_id = ?`,
        [this.boardId]
      );

      if (result[0]) {
        analysis = result[0];
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

  private async getColumnId(columnName: string): Promise<string> {
    const result = await dbConnection.query(
      `SELECT id FROM columns WHERE board_id = ? AND name = ? LIMIT 1`,
      [this.boardId, columnName]
    );
    return result[0]?.id || 'default';
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

describe('AI Agent Concurrent Simulation', () => {
  let boardId: string;
  const agents: AIAgent[] = [];

  beforeAll(async () => {
    // Initialize database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Create test board
    boardId = uuidv4();
    await dbConnection.execute(
      `INSERT INTO boards (id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))`,
      [boardId, 'AI Agent Simulation Board']
    );

    // Create columns
    const columns = ['Todo', 'In Progress', 'Done'];
    for (let i = 0; i < columns.length; i++) {
      await dbConnection.execute(
        `INSERT INTO columns (id, board_id, name, position, created_at, updated_at) 
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [uuidv4(), boardId, columns[i], i]
      );
    }
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  it('should simulate 10 AI agents working concurrently', async () => {
    const numAgents = 10;
    const startTime = Date.now();

    // Create agents
    for (let i = 0; i < numAgents; i++) {
      agents.push(new AIAgent(`agent-${i}`, boardId));
    }

    // Create initial tasks
    for (let i = 0; i < 15; i++) {
      await agents[0].createTask(`Initial task ${i + 1}`, Math.floor(Math.random() * 5) + 1);
    }

    // Simulate concurrent agent operations
    const operations: Array<Promise<void>> = [];

    for (let round = 0; round < 5; round++) {
      for (const agent of agents) {
        operations.push(
          (async () => {
            const action = Math.random();

            if (action < 0.3) {
              // Create a new task
              await agent.createTask(
                `Task by ${agent.getMetrics().agentId} round ${round}`,
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

    // Get final board state
    const finalState = await dbConnection.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
       FROM tasks WHERE board_id = ?`,
      [boardId]
    );

    console.log('\n=== AI Agent Simulation Results ===');
    console.log(`Number of agents: ${numAgents}`);
    console.log(`Total duration: ${duration}ms`);
    console.log(`Total actions performed: ${totalActions}`);
    console.log(`Actions per second: ${((totalActions / duration) * 1000).toFixed(2)}`);
    console.log(`Tasks created: ${totalTasksCreated}`);
    console.log(`Tasks completed: ${totalTasksCompleted}`);
    console.log(`Total errors: ${totalErrors}`);
    console.log(`Average action time: ${avgActionTime.toFixed(2)}ms`);
    console.log('\nFinal board state:');
    console.log(`  Total tasks: ${finalState[0].total}`);
    console.log(`  Todo: ${finalState[0].todo}`);
    console.log(`  In Progress: ${finalState[0].in_progress}`);
    console.log(`  Done: ${finalState[0].done}`);

    // Per-agent metrics
    console.log('\nPer-agent performance:');
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
    expect(avgActionTime).toBeLessThan(200); // Reasonable response time
  }, 30000);

  it('should maintain consistency under heavy concurrent load', async () => {
    const testAgents: AIAgent[] = [];
    const numAgents = 20;
    const actionsPerAgent = 10;

    // Create agents
    for (let i = 0; i < numAgents; i++) {
      testAgents.push(new AIAgent(`load-test-${i}`, boardId));
    }

    const operations: Array<Promise<void>> = [];

    // Each agent performs rapid operations
    for (const agent of testAgents) {
      for (let i = 0; i < actionsPerAgent; i++) {
        operations.push(agent.createTask(`Load test ${i}`, 1).catch(() => {}));

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

    console.log('\n=== Load Test Results ===');
    console.log(`Total operations: ${totalOps}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Operations per second: ${opsPerSecond.toFixed(2)}`);

    // Verify data integrity
    const integrityCheck = await dbConnection.query(
      `SELECT COUNT(DISTINCT id) as unique_ids, COUNT(*) as total FROM tasks WHERE board_id = ?`,
      [boardId]
    );

    expect(integrityCheck[0].unique_ids).toBe(integrityCheck[0].total); // No duplicate IDs
    expect(opsPerSecond).toBeGreaterThan(100); // At least 100 ops/sec
  }, 30000);

  it('should demonstrate agent collaboration patterns', async () => {
    const collaborativeAgents = [
      new AIAgent('creator', boardId),
      new AIAgent('worker-1', boardId),
      new AIAgent('worker-2', boardId),
      new AIAgent('reviewer', boardId),
    ];

    // Creator agent creates tasks
    for (let i = 0; i < 10; i++) {
      await collaborativeAgents[0].createTask(`Feature ${i + 1}`, (i % 5) + 1);
    }

    // Workers process tasks concurrently
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

    // Reviewer analyzes progress
    const analysis = await collaborativeAgents[3].analyzeBoard();

    // Agents collaborate based on analysis
    const collaborationOps = collaborativeAgents.map(async agent =>
      agent.collaborateWithAgent('reviewer')
    );

    await Promise.all(collaborationOps);

    // Collect metrics
    const metrics = collaborativeAgents.map(a => a.getMetrics());

    console.log('\n=== Collaboration Pattern Results ===');
    metrics.forEach(m => {
      console.log(`${m.agentId}: Created ${m.tasksCreated}, Completed ${m.tasksCompleted}`);
    });
    console.log(`Final analysis: ${JSON.stringify(analysis)}`);

    // Verify collaboration worked
    expect(metrics[0].tasksCreated).toBeGreaterThan(0); // Creator created tasks
    expect(metrics[1].tasksCompleted + metrics[2].tasksCompleted).toBeGreaterThan(0); // Workers completed tasks
    expect(analysis.total).toBeGreaterThan(0); // Board has tasks
  });
});
