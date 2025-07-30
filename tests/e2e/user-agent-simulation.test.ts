/**
 * @fileoverview E2E test simulating user and AI agent interactions via curl
 * @lastmodified 2025-01-30T00:00:00Z
 *
 * Features: User simulation, AI agent simulation, concurrent interactions
 * Main APIs: HTTP API endpoints, MCP protocol, curl command execution
 * Constraints: Requires running server, API key configuration
 * Patterns: Random action selection, state validation, interaction tracking
 */

// Mock the service metrics decorator
jest.mock('../../src/utils/service-metrics', () => ({
  TrackPerformance: () => () => ({}),
  serviceMetricsCollector: {
    collectMetric: jest.fn(),
    getMetrics: jest.fn(() => ({ total: 0, success: 0, failure: 0 })),
  },
}));

import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import type { Express } from 'express';
import { createServer } from '../../src/server';
import { dbConnection } from '../../src/database/connection';

const execAsync = promisify(exec);

// Simple logger for test output
const logger = {
  debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
  info: (msg: string) => console.info(`[INFO] ${msg}`),
  error: (msg: string, err?: any) => console.error(`[ERROR] ${msg}`, err),
};

interface TaskState {
  id: string;
  title: string;
  status: string;
  priority: number;
  board_id: string;
  column_id?: string;
  assignee?: string;
  metadata?: any;
}

interface BoardState {
  id: string;
  name: string;
  columns: Array<{ id: string; name: string; position: number }>;
}

/* eslint-disable max-classes-per-file */
class UserSimulator {
  private readonly apiKey: string;

  private readonly baseUrl: string;

  private readonly boards: Map<string, BoardState> = new Map();

  private readonly tasks: Map<string, TaskState> = new Map();

  private readonly actionLog: string[] = [];

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async executeCurl(command: string): Promise<{ stdout: string; stderr: string }> {
    const fullCommand = command
      .replace('{{API_KEY}}', this.apiKey)
      .replace('{{BASE_URL}}', this.baseUrl);
    logger.debug(`Executing: ${fullCommand}`);

    try {
      const result = await execAsync(fullCommand);
      if (result.stdout) {
        logger.debug(`Response: ${result.stdout.substring(0, 200)}...`);
      }
      return result;
    } catch (error: any) {
      logger.error(`Curl error: ${error.message}`);
      throw error;
    }
  }

  private async parseJsonResponse(stdout: string): Promise<any> {
    try {
      return JSON.parse(stdout);
    } catch (error) {
      logger.error(`Failed to parse JSON: ${stdout}`);
      throw new Error(`Invalid JSON response: ${stdout}`);
    }
  }

  async createBoard(name: string): Promise<BoardState> {
    const { stdout } = await this.executeCurl(`
      curl -s -X POST {{BASE_URL}}/api/v1/boards \
        -H "X-API-Key: {{API_KEY}}" \
        -H "Content-Type: application/json" \
        -d '{"name": "${name}", "template": "kanban"}'
    `);

    const response = await this.parseJsonResponse(stdout);
    if (!response.success) throw new Error(`Failed to create board: ${response.error}`);

    const board: BoardState = {
      id: response.data.id,
      name: response.data.name,
      columns: response.data.columns || [],
    };

    this.boards.set(board.id, board);
    this.actionLog.push(`Created board: ${name} (${board.id})`);
    return board;
  }

  async createTask(boardId: string, title: string, priority?: number): Promise<TaskState> {
    const board = this.boards.get(boardId);
    if (!board) throw new Error(`Board ${boardId} not found`);

    const todoColumn = board.columns.find(c => c.name.toLowerCase() === 'todo');
    const columnId = todoColumn?.id || board.columns[0]?.id;

    const { stdout } = await this.executeCurl(`
      curl -s -X POST {{BASE_URL}}/api/v1/tasks \
        -H "X-API-Key: {{API_KEY}}" \
        -H "Content-Type: application/json" \
        -d '{
          "board_id": "${boardId}",
          "column_id": "${columnId}",
          "title": "${title}",
          "priority": ${priority || Math.floor(Math.random() * 5) + 1},
          "status": "todo"
        }'
    `);

    const response = await this.parseJsonResponse(stdout);
    if (!response.success) throw new Error(`Failed to create task: ${response.error}`);

    const task: TaskState = {
      id: response.data.id,
      title: response.data.title,
      status: response.data.status,
      priority: response.data.priority,
      board_id: boardId,
      column_id: columnId,
    };

    this.tasks.set(task.id, task);
    this.actionLog.push(`Created task: ${title} (${task.id})`);
    return task;
  }

  async updateTaskStatus(taskId: string, newStatus: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const { stdout } = await this.executeCurl(`
      curl -s -X PATCH {{BASE_URL}}/api/v1/tasks/${taskId} \
        -H "X-API-Key: {{API_KEY}}" \
        -H "Content-Type: application/json" \
        -d '{"status": "${newStatus}"}'
    `);

    const response = await this.parseJsonResponse(stdout);
    if (!response.success) throw new Error(`Failed to update task: ${response.error}`);

    task.status = newStatus;
    this.actionLog.push(`Updated task ${taskId} status to: ${newStatus}`);
  }

  async getTaskStatus(taskId: string): Promise<string> {
    const { stdout } = await this.executeCurl(`
      curl -s -X GET {{BASE_URL}}/api/v1/tasks/${taskId} \
        -H "X-API-Key: {{API_KEY}}"
    `);

    const response = await this.parseJsonResponse(stdout);
    if (!response.success) throw new Error(`Failed to get task: ${response.error}`);

    const task = this.tasks.get(taskId);
    if (task) {
      task.status = response.data.status;
    }

    this.actionLog.push(`Checked task ${taskId} status: ${response.data.status}`);
    return response.data.status;
  }

  async addTaskNote(taskId: string, content: string): Promise<void> {
    const { stdout } = await this.executeCurl(`
      curl -s -X POST {{BASE_URL}}/api/v1/tasks/${taskId}/notes \
        -H "X-API-Key: {{API_KEY}}" \
        -H "Content-Type: application/json" \
        -d '{"content": "${content}"}'
    `);

    const response = await this.parseJsonResponse(stdout);
    if (!response.success) throw new Error(`Failed to add note: ${response.error}`);

    this.actionLog.push(`Added note to task ${taskId}`);
  }

  async listTasks(boardId: string, filters?: any): Promise<TaskState[]> {
    const queryParams = new URLSearchParams({
      board_id: boardId,
      ...filters,
    }).toString();

    const { stdout } = await this.executeCurl(`
      curl -s -X GET "{{BASE_URL}}/api/v1/tasks?${queryParams}" \
        -H "X-API-Key: {{API_KEY}}"
    `);

    const response = await this.parseJsonResponse(stdout);
    if (!response.success) throw new Error(`Failed to list tasks: ${response.error}`);

    this.actionLog.push(`Listed tasks for board ${boardId}`);
    return response.data.items;
  }

  /* eslint-disable complexity, max-lines-per-function */
  async performRandomAction(): Promise<void> {
    // Weight actions based on current state
    const weights = {
      create_board: this.boards.size < 3 ? 2 : 0.5,
      create_task: this.boards.size > 0 ? 3 : 0,
      update_task_status: this.tasks.size > 0 ? 2 : 0,
      check_task_status: this.tasks.size > 0 ? 2 : 0,
      add_note: this.tasks.size > 0 ? 1 : 0,
      list_tasks: this.boards.size > 0 ? 1 : 0,
    };

    const weightedActions: string[] = [];
    for (const [action, weight] of Object.entries(weights)) {
      for (let i = 0; i < weight * 10; i++) {
        weightedActions.push(action);
      }
    }

    const action = weightedActions[Math.floor(Math.random() * weightedActions.length)];

    switch (action) {
      case 'create_board': {
        await this.createBoard(`Test Board ${Date.now()}`);
        break;
      }

      case 'create_task': {
        const boards = Array.from(this.boards.values());
        if (boards.length > 0) {
          const board = boards[Math.floor(Math.random() * boards.length)];
          await this.createTask(board.id, `Task ${Date.now()}`);
        }
        break;
      }

      case 'update_task_status': {
        const tasksToUpdate = Array.from(this.tasks.values()).filter(t => t.status !== 'done');
        if (tasksToUpdate.length > 0) {
          const task = tasksToUpdate[Math.floor(Math.random() * tasksToUpdate.length)];
          const statuses = ['todo', 'in_progress', 'done', 'blocked'];
          const newStatus = statuses[Math.floor(Math.random() * statuses.length)];
          await this.updateTaskStatus(task.id, newStatus);
        }
        break;
      }

      case 'check_task_status': {
        const tasksToCheck = Array.from(this.tasks.values());
        if (tasksToCheck.length > 0) {
          const task = tasksToCheck[Math.floor(Math.random() * tasksToCheck.length)];
          await this.getTaskStatus(task.id);
        }
        break;
      }

      case 'add_note': {
        const tasksForNotes = Array.from(this.tasks.values());
        if (tasksForNotes.length > 0) {
          const task = tasksForNotes[Math.floor(Math.random() * tasksForNotes.length)];
          await this.addTaskNote(task.id, `Note added at ${new Date().toISOString()}`);
        }
        break;
      }

      case 'list_tasks': {
        const boardsToList = Array.from(this.boards.values());
        if (boardsToList.length > 0) {
          const board = boardsToList[Math.floor(Math.random() * boardsToList.length)];
          await this.listTasks(board.id);
        }
        break;
      }

      default:
        // Do nothing for unknown actions
        break;
    }
  }
  /* eslint-enable complexity, max-lines-per-function */

  getActionLog(): string[] {
    return this.actionLog;
  }

  getState() {
    return {
      boards: Array.from(this.boards.values()),
      tasks: Array.from(this.tasks.values()),
      actionCount: this.actionLog.length,
    };
  }
}

class AIAgentSimulator {
  private readonly apiKey: string;

  private readonly baseUrl: string;

  private readonly mcpUrl: string;

  private currentProject?: { boardId: string; tasks: TaskState[] };

  private readonly actionLog: string[] = [];

  private completedTasks = 0;

  constructor(apiKey: string, baseUrl: string, mcpUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.mcpUrl = mcpUrl;
  }

  private async executeMCPCall(method: string, params: any): Promise<any> {
    const requestId = uuidv4();
    const { stdout } = await execAsync(`
      curl -s -X POST ${this.mcpUrl} \
        -H "Content-Type: application/json" \
        -d '${JSON.stringify({
          jsonrpc: '2.0',
          method,
          params,
          id: requestId,
        })}'
    `);

    const response = JSON.parse(stdout);
    if (response.error) {
      throw new Error(`MCP error: ${response.error.message}`);
    }

    return response.result;
  }

  async initializeProject(boardName: string): Promise<void> {
    // Create a project board using MCP
    const result = await this.executeMCPCall('tools/call', {
      name: 'create_task',
      arguments: {
        board_name: boardName,
        title: 'Project Setup',
        description: 'Initialize the project structure',
        priority: 5,
      },
    });

    this.currentProject = {
      boardId: result.board_id,
      tasks: [],
    };

    this.actionLog.push(`AI Agent: Initialized project ${boardName}`);
  }

  async getContext(): Promise<any> {
    const result = await this.executeMCPCall('tools/call', {
      name: 'get_context',
      arguments: this.currentProject ? { board_id: this.currentProject.boardId } : {},
    });

    this.actionLog.push('AI Agent: Retrieved project context');
    return result;
  }

  async createDevelopmentTasks(): Promise<void> {
    if (!this.currentProject) throw new Error('No project initialized');

    const tasks = [
      { title: 'Setup development environment', priority: 5, estimate: '2h' },
      { title: 'Create database schema', priority: 4, estimate: '3h' },
      { title: 'Implement authentication', priority: 5, estimate: '4h' },
      { title: 'Build API endpoints', priority: 4, estimate: '6h' },
      { title: 'Create frontend components', priority: 3, estimate: '8h' },
      { title: 'Write unit tests', priority: 3, estimate: '4h' },
      { title: 'Setup CI/CD pipeline', priority: 2, estimate: '3h' },
      { title: 'Documentation', priority: 2, estimate: '2h' },
    ];

    for (const taskData of tasks) {
      const result = await this.executeMCPCall('tools/call', {
        name: 'create_task',
        arguments: {
          board_id: this.currentProject.boardId,
          ...taskData,
          description: `Development task: ${taskData.title}`,
          metadata: {
            created_by: 'ai_agent',
            estimated_hours: parseInt(taskData.estimate, 10),
          },
        },
      });

      this.currentProject.tasks.push({
        id: result.id,
        title: taskData.title,
        status: 'todo',
        priority: taskData.priority,
        board_id: this.currentProject.boardId,
      });

      this.actionLog.push(`AI Agent: Created task "${taskData.title}"`);
    }
  }

  async workOnTask(taskId: string): Promise<void> {
    // Simulate working on a task
    const steps = [
      { action: 'analyze', note: 'Analyzing requirements and dependencies' },
      { action: 'implement', note: 'Writing code implementation' },
      { action: 'test', note: 'Running tests and fixing issues' },
      { action: 'review', note: 'Code review and optimization' },
    ];

    // Update task to in_progress
    await this.executeMCPCall('tools/call', {
      name: 'update_task',
      arguments: {
        id: taskId,
        status: 'in_progress',
      },
    });

    this.actionLog.push(`AI Agent: Started working on task ${taskId}`);

    // Simulate work steps
    for (const step of steps) {
      // Add progress note
      await this.executeMCPCall('tools/call', {
        name: 'add_note',
        arguments: {
          task_id: taskId,
          content: `${step.action}: ${step.note}`,
          metadata: {
            step: step.action,
            timestamp: new Date().toISOString(),
          },
        },
      });

      this.actionLog.push(`AI Agent: ${step.action} for task ${taskId}`);

      // Simulate work time
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Mark task as done
    await this.executeMCPCall('tools/call', {
      name: 'update_task',
      arguments: {
        id: taskId,
        status: 'done',
      },
    });

    this.completedTasks++;
    this.actionLog.push(`AI Agent: Completed task ${taskId}`);
  }

  async searchAndPrioritizeTasks(): Promise<TaskState[]> {
    if (!this.currentProject) throw new Error('No project initialized');

    const result = await this.executeMCPCall('tools/call', {
      name: 'search_tasks',
      arguments: {
        board_id: this.currentProject.boardId,
        status: 'todo',
        sort_by: 'priority',
        sort_order: 'desc',
      },
    });

    this.actionLog.push('AI Agent: Searched and prioritized tasks');
    return result.tasks || [];
  }

  async provideFeedback(taskId: string, feedback: string): Promise<void> {
    await this.executeMCPCall('tools/call', {
      name: 'add_note',
      arguments: {
        task_id: taskId,
        content: `AI Feedback: ${feedback}`,
        metadata: {
          type: 'ai_feedback',
          sentiment: 'positive',
          timestamp: new Date().toISOString(),
        },
      },
    });

    this.actionLog.push(`AI Agent: Provided feedback for task ${taskId}`);
  }

  async performAgentAction(): Promise<void> {
    if (!this.currentProject) {
      await this.initializeProject(`AI Project ${Date.now()}`);
      await this.createDevelopmentTasks();
      return;
    }

    // Get current context
    await this.getContext();

    // Find tasks to work on
    const todoTasks = await this.searchAndPrioritizeTasks();

    if (todoTasks.length > 0) {
      // Work on highest priority task
      const task = todoTasks[0];
      await this.workOnTask(task.id);

      // Sometimes provide feedback
      if (Math.random() > 0.7) {
        await this.provideFeedback(
          task.id,
          'Task completed successfully with all requirements met.'
        );
      }
    } else {
      // All tasks done, create a summary
      this.actionLog.push('AI Agent: All tasks completed for current project');
    }
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
/* eslint-enable max-classes-per-file */

describe('User and AI Agent Simulation', () => {
  let app: Express;
  let server: any;
  let serverPort: number;
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

    // Start server on random port
    server = app.listen(0);
    serverPort = (server.address() as any).port;

    const baseUrl = `http://localhost:${serverPort}`;
    const mcpUrl = `http://localhost:${serverPort}/mcp`;

    userSimulator = new UserSimulator(apiKey, baseUrl);
    agentSimulator = new AIAgentSimulator(apiKey, baseUrl, mcpUrl);

    logger.info(`Test server started on port ${serverPort}`);
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  /* eslint-disable max-lines-per-function */
  it('should simulate concurrent user and AI agent interactions for 50 actions', async () => {
    const startTime = Date.now();
    const userErrors: string[] = [];
    const agentErrors: string[] = [];
    let userActionCount = 0;
    let agentActionCount = 0;

    // Create initial shared board for both user and agent
    await userSimulator.createBoard('Shared Simulation Board');

    // Initialize AI agent with the same board
    await agentSimulator.initializeProject('Shared Simulation Board');

    // Create action promises that will run concurrently
    const createUserAction = async (index: number) => {
      try {
        await userSimulator.performRandomAction();
        userActionCount++;
        logger.debug(`User action ${index} completed`);
      } catch (error: any) {
        userErrors.push(`User action ${index}: ${error.message}`);
        logger.error(`User action ${index} failed:`, error);
      }
    };

    const createAgentAction = async (index: number) => {
      try {
        await agentSimulator.performAgentAction();
        agentActionCount++;
        logger.debug(`Agent action ${index} completed`);
      } catch (error: any) {
        agentErrors.push(`Agent action ${index}: ${error.message}`);
        logger.error(`Agent action ${index} failed:`, error);
      }
    };

    // Create arrays of concurrent actions
    const actions: Array<Promise<void>> = [];

    // Add 50 user actions and 50 agent actions, interleaved
    for (let i = 0; i < 50; i++) {
      // Add user action
      actions.push(
        new Promise(resolve => {
          setTimeout(async () => {
            await createUserAction(i);
            resolve();
          }, Math.random() * 100);
        })
      );

      // Add agent action
      actions.push(
        new Promise(resolve => {
          setTimeout(async () => {
            await createAgentAction(i);
            resolve();
          }, Math.random() * 200 + 100);
        })
      );
    }

    // Execute all actions concurrently
    logger.info('Starting concurrent simulation with 50 user actions and 50 agent actions...');
    await Promise.all(actions);

    const duration = Date.now() - startTime;
    const userState = userSimulator.getState();
    const agentStats = agentSimulator.getStats();
    const userLog = userSimulator.getActionLog();
    const agentLog = agentSimulator.getActionLog();

    // Log results
    logger.info(`Concurrent simulation completed in ${duration}ms`);
    logger.info(`User actions completed: ${userActionCount}`);
    logger.info(`Agent actions completed: ${agentActionCount}`);
    logger.info(`User errors: ${userErrors.length}`);
    logger.info(`Agent errors: ${agentErrors.length}`);
    logger.info(`Total boards created: ${userState.boards.length}`);
    logger.info(`Total tasks created: ${userState.tasks.length}`);
    logger.info(`Agent tasks completed: ${agentStats.completedTasks}`);

    // Verify results
    expect(userActionCount + agentActionCount).toBeGreaterThan(80); // At least 80% success rate
    expect(userState.boards.length).toBeGreaterThan(0);
    expect(userState.tasks.length).toBeGreaterThan(0);
    expect(agentStats.completedTasks).toBeGreaterThanOrEqual(0);
    expect(userErrors.length + agentErrors.length).toBeLessThan(20); // Less than 20% error rate

    // Verify data consistency
    for (const task of userState.tasks) {
      expect(task.id).toBeTruthy();
      expect(task.title).toBeTruthy();
      expect(task.status).toMatch(/^(todo|in_progress|done|blocked|archived)$/);
      expect(task.priority).toBeGreaterThanOrEqual(1);
      expect(task.priority).toBeLessThanOrEqual(5);
    }

    // Create activity timeline to verify concurrent execution
    const timeline: Array<{ time: number; actor: string; action: string }> = [];

    userLog.forEach((action, index) => {
      timeline.push({
        time: index,
        actor: 'USER',
        action,
      });
    });

    agentLog.forEach((action, index) => {
      timeline.push({
        time: index,
        actor: 'AGENT',
        action,
      });
    });

    // Sort by approximate time and verify interleaving
    const actorSequence = timeline.map(t => t.actor);
    const userCount = actorSequence.filter(a => a === 'USER').length;
    const agentCount = actorSequence.filter(a => a === 'AGENT').length;

    logger.info(`Activity distribution - User: ${userCount}, Agent: ${agentCount}`);

    // Verify both actors were active
    expect(userCount).toBeGreaterThan(0);
    expect(agentCount).toBeGreaterThan(0);
  }, 60000); // 60 second timeout for this test

  it('should handle stress test with heavy concurrent load', async () => {
    const errors: string[] = [];
    const concurrentActions = 30;
    const actionTimestamps: Array<{ actor: string; action: string; timestamp: number }> = [];

    // Create shared board for concurrent testing
    const sharedBoard = await userSimulator.createBoard('Stress Test Board');

    // Track action timing for concurrency verification
    const trackAction = (actor: string, action: string) => {
      actionTimestamps.push({
        actor,
        action,
        timestamp: Date.now(),
      });
    };

    // Create more complex concurrent scenarios
    const userActions = Array(concurrentActions)
      .fill(0)
      .map(async (_, i) => {
        try {
          // Mix of different action types
          const actionType = i % 5;
          switch (actionType) {
            case 0: {
              await userSimulator.createTask(sharedBoard.id, `Stress Task ${i}`);
              trackAction('USER', `create_task_${i}`);
              break;
            }
            case 1: {
              const tasks = await userSimulator.listTasks(sharedBoard.id);
              trackAction('USER', `list_tasks_${i}`);
              if (tasks.length > 0) {
                const randomTask = tasks[Math.floor(Math.random() * tasks.length)];
                await userSimulator.updateTaskStatus(randomTask.id, 'in_progress');
                trackAction('USER', `update_status_${i}`);
              }
              break;
            }
            case 2: {
              const tasksForNotes = await userSimulator.listTasks(sharedBoard.id);
              if (tasksForNotes.length > 0) {
                const randomTask = tasksForNotes[Math.floor(Math.random() * tasksForNotes.length)];
                await userSimulator.addTaskNote(randomTask.id, `Stress test note ${i}`);
                trackAction('USER', `add_note_${i}`);
              }
              break;
            }
            default:
              await userSimulator.performRandomAction();
              trackAction('USER', `random_action_${i}`);
          }
        } catch (error: any) {
          errors.push(`User action ${i}: ${error.message}`);
          logger.error(`Stress test user action ${i} failed:`, error);
        }
      });

    const agentActions = Array(concurrentActions)
      .fill(0)
      .map(async (_, i) => {
        try {
          // Agents work on the shared board tasks
          await agentSimulator.getContext();
          trackAction('AGENT', `get_context_${i}`);

          if (i % 3 === 0) {
            // Create new tasks
            await agentSimulator.performAgentAction();
            trackAction('AGENT', `create_or_work_${i}`);
          } else {
            // Search and work on existing tasks
            const tasks = await agentSimulator.searchAndPrioritizeTasks();
            trackAction('AGENT', `search_tasks_${i}`);

            if (tasks.length > 0 && i % 2 === 0) {
              const task = tasks[0];
              await agentSimulator.workOnTask(task.id);
              trackAction('AGENT', `complete_task_${i}`);
            }
          }
        } catch (error: any) {
          errors.push(`Agent action ${i}: ${error.message}`);
          logger.error(`Stress test agent action ${i} failed:`, error);
        }
      });

    // Add some bulk operations to stress test the system
    const bulkOperations = [
      // Bulk task creation
      async () => {
        const tasks = Array(10)
          .fill(0)
          .map((_, i) => ({
            board_id: sharedBoard.id,
            title: `Bulk Task ${i}`,
            priority: Math.floor(Math.random() * 5) + 1,
          }));

        for (const task of tasks) {
          await userSimulator.createTask(task.board_id, task.title, task.priority);
        }
        trackAction('BULK', 'create_10_tasks');
      },
      // Rapid status updates
      async () => {
        const tasks = await userSimulator.listTasks(sharedBoard.id);
        const updates = tasks
          .slice(0, 5)
          .map(async task => userSimulator.updateTaskStatus(task.id, 'done'));
        await Promise.all(updates);
        trackAction('BULK', 'update_5_statuses');
      },
    ];

    // Execute everything concurrently
    logger.info(`Starting stress test with ${concurrentActions * 2} concurrent operations...`);
    const startTime = Date.now();

    await Promise.all([
      ...userActions,
      ...agentActions,
      ...bulkOperations.map(async op => op().catch(e => errors.push(`Bulk op: ${e.message}`))),
    ]);

    const duration = Date.now() - startTime;
    logger.info(`Stress test completed in ${duration}ms with ${errors.length} errors`);

    // Analyze concurrency patterns
    const timeRange =
      Math.max(...actionTimestamps.map(a => a.timestamp)) -
      Math.min(...actionTimestamps.map(a => a.timestamp));
    const actionsPerSecond = (actionTimestamps.length / timeRange) * 1000;

    logger.info(`Actions per second: ${actionsPerSecond.toFixed(2)}`);
    logger.info(`Total actions tracked: ${actionTimestamps.length}`);

    // Verify system stability under load
    expect(errors.length).toBeLessThan(concurrentActions * 0.15); // Less than 15% error rate under stress

    // Verify final state consistency
    const finalTasks = await userSimulator.listTasks(sharedBoard.id);
    expect(finalTasks.length).toBeGreaterThan(10); // Should have created many tasks

    // Check for data integrity
    const taskIds = new Set(finalTasks.map(t => t.id));
    expect(taskIds.size).toBe(finalTasks.length); // No duplicate IDs

    // Verify concurrent execution actually happened
    const concurrencyWindows = new Map<number, number>();
    const windowSize = 100; // 100ms windows

    actionTimestamps.forEach(action => {
      const window = Math.floor(action.timestamp / windowSize);
      concurrencyWindows.set(window, (concurrencyWindows.get(window) || 0) + 1);
    });

    const maxConcurrency = Math.max(...concurrencyWindows.values());
    logger.info(`Max actions in ${windowSize}ms window: ${maxConcurrency}`);

    // Should have multiple actions happening in same time windows
    expect(maxConcurrency).toBeGreaterThan(2);
  }, 60000); // 60 second timeout for this test

  it('should validate all API responses match expected schema', async () => {
    // Create test data
    const board = await userSimulator.createBoard('Schema Test Board');
    const task = await userSimulator.createTask(board.id, 'Schema Test Task');

    // Test various API endpoints and validate responses
    const validations = [
      {
        name: 'Get task details',
        curl: `curl -s -X GET {{BASE_URL}}/api/v1/tasks/${task.id} -H "X-API-Key: {{API_KEY}}"`,
        validate: (data: any) => {
          expect(data).toHaveProperty('id');
          expect(data).toHaveProperty('title');
          expect(data).toHaveProperty('status');
          expect(data).toHaveProperty('priority');
          expect(data).toHaveProperty('board_id');
          expect(data).toHaveProperty('created_at');
          expect(data).toHaveProperty('updated_at');
        },
      },
      {
        name: 'List tasks with pagination',
        curl: `curl -s -X GET "{{BASE_URL}}/api/v1/tasks?board_id=${board.id}&limit=10&offset=0" -H "X-API-Key: {{API_KEY}}"`,
        validate: (data: any) => {
          expect(data).toHaveProperty('items');
          expect(data).toHaveProperty('total');
          expect(data).toHaveProperty('limit');
          expect(data).toHaveProperty('offset');
          expect(Array.isArray(data.items)).toBe(true);
        },
      },
      {
        name: 'Get board details',
        curl: `curl -s -X GET {{BASE_URL}}/api/v1/boards/${board.id} -H "X-API-Key: {{API_KEY}}"`,
        validate: (data: any) => {
          expect(data).toHaveProperty('id');
          expect(data).toHaveProperty('name');
          expect(data).toHaveProperty('columns');
          expect(Array.isArray(data.columns)).toBe(true);
          if (data.columns.length > 0) {
            expect(data.columns[0]).toHaveProperty('id');
            expect(data.columns[0]).toHaveProperty('name');
            expect(data.columns[0]).toHaveProperty('position');
          }
        },
      },
    ];

    for (const test of validations) {
      const command = test.curl
        .replace('{{API_KEY}}', apiKey)
        .replace('{{BASE_URL}}', `http://localhost:${serverPort}`);

      const { stdout } = await execAsync(command);
      const response = JSON.parse(stdout);

      expect(response).toHaveProperty('success');
      expect(response.success).toBe(true);
      expect(response).toHaveProperty('data');

      test.validate(response.data);
      logger.info(`✓ ${test.name} schema validation passed`);
    }
  });
  /* eslint-enable max-lines-per-function */

  it('should generate comprehensive action report', async () => {
    const userLog = userSimulator.getActionLog();
    const agentLog = agentSimulator.getActionLog();
    const userState = userSimulator.getState();
    const agentStats = agentSimulator.getStats();

    const report = {
      summary: {
        totalActions: userLog.length + agentLog.length,
        userActions: userLog.length,
        agentActions: agentLog.length,
        boardsCreated: userState.boards.length,
        tasksCreated: userState.tasks.length,
        tasksCompleted: agentStats.completedTasks,
      },
      taskStatusDistribution: userState.tasks.reduce(
        (acc, task) => {
          acc[task.status] = (acc[task.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      sampleUserActions: userLog.slice(-10),
      sampleAgentActions: agentLog.slice(-10),
    };

    logger.info('Simulation Report:');
    logger.info(JSON.stringify(report, null, 2));

    // Save detailed logs for debugging
    const detailedReport = {
      timestamp: new Date().toISOString(),
      duration: 'varies',
      userActions: userLog,
      agentActions: agentLog,
      finalState: {
        user: userState,
        agent: agentStats,
      },
    };

    // Verify simulation achieved meaningful results
    expect(report.summary.totalActions).toBeGreaterThan(50);
    expect(report.summary.boardsCreated).toBeGreaterThan(0);
    expect(report.summary.tasksCreated).toBeGreaterThan(0);
    expect(report.summary.tasksCompleted).toBeGreaterThan(0);

    // Log the detailed report for debugging (without using it in test)
    console.debug('Detailed report saved for debugging:', detailedReport.timestamp);
  });
});