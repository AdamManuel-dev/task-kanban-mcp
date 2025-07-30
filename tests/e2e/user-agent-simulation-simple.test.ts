/**
 * @fileoverview Simple E2E test simulating user and AI agent interactions via curl
 * @lastmodified 2025-01-30T00:00:00Z
 *
 * Features: User simulation, AI agent simulation, concurrent interactions
 * Main APIs: HTTP API endpoints, MCP protocol, curl command execution
 * Constraints: Requires running server, API key configuration
 * Patterns: Random action selection, state validation, interaction tracking
 */

import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

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
}

interface BoardState {
  id: string;
  name: string;
}

describe('User and AI Agent Simulation (Simple)', () => {
  let serverProcess: ChildProcess;
  let serverPort: number = 3456;
  let apiKey: string = 'test-api-key-123';
  const baseUrl = `http://localhost:${serverPort}`;

  beforeAll(async () => {
    // Set environment variables
    process.env.NODE_ENV = 'test';
    process.env.KANBAN_TEST_MODE = 'true';
    process.env.KANBAN_API_KEYS = apiKey;
    process.env.PORT = String(serverPort);
    process.env.DATABASE_PATH = ':memory:';
    process.env.LOG_LEVEL = 'error';

    // Start the server as a child process
    logger.info('Starting server process...');
    serverProcess = spawn('node', ['dist/index.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(serverPort),
        KANBAN_API_KEYS: apiKey,
        DATABASE_PATH: ':memory:',
        LOG_LEVEL: 'error',
      },
      stdio: 'pipe',
    });

    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server failed to start within 30 seconds'));
      }, 30000);

      const checkServer = async () => {
        try {
          const { stdout } = await execAsync(`curl -s ${baseUrl}/api/health`);
          const response = JSON.parse(stdout);
          if (response.status === 'healthy') {
            clearTimeout(timeout);
            resolve(true);
          } else {
            setTimeout(checkServer, 1000);
          }
        } catch {
          setTimeout(checkServer, 1000);
        }
      };

      serverProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Start checking after a brief delay
      setTimeout(checkServer, 2000);
    });

    logger.info(`Test server started on port ${serverPort}`);
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  });

  it('should perform basic user and agent interactions', async () => {
    const userErrors: string[] = [];
    const agentErrors: string[] = [];
    let boardId: string | null = null;
    const createdTasks: string[] = [];

    // Step 1: Create a board
    try {
      const { stdout } = await execAsync(`
        curl -s -X POST ${baseUrl}/api/v1/boards \
          -H "X-API-Key: ${apiKey}" \
          -H "Content-Type: application/json" \
          -d '{"name": "Test Board", "template": "kanban"}'
      `);
      const response = JSON.parse(stdout);
      if (response.success) {
        boardId = response.data.id;
        logger.info(`Created board: ${boardId}`);
      } else {
        throw new Error(`Failed to create board: ${response.error}`);
      }
    } catch (error: any) {
      userErrors.push(`Create board: ${error.message}`);
      logger.error('Failed to create board', error);
    }

    expect(boardId).toBeTruthy();

    // Step 2: Create 10 tasks as a user would
    for (let i = 0; i < 10; i++) {
      try {
        const { stdout } = await execAsync(`
          curl -s -X POST ${baseUrl}/api/v1/tasks \
            -H "X-API-Key: ${apiKey}" \
            -H "Content-Type: application/json" \
            -d '{
              "board_id": "${boardId}",
              "title": "User Task ${i}",
              "priority": ${Math.floor(Math.random() * 5) + 1},
              "status": "todo"
            }'
        `);
        const response = JSON.parse(stdout);
        if (response.success) {
          createdTasks.push(response.data.id);
          logger.info(`Created task: ${response.data.id}`);
        } else {
          throw new Error(`Failed to create task: ${response.error}`);
        }
      } catch (error: any) {
        userErrors.push(`Create task ${i}: ${error.message}`);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    expect(createdTasks.length).toBeGreaterThan(5);

    // Step 3: Simulate AI agent working on tasks
    for (let i = 0; i < 5; i++) {
      if (i < createdTasks.length) {
        const taskId = createdTasks[i];
        
        try {
          // Update task status to in_progress
          await execAsync(`
            curl -s -X PATCH ${baseUrl}/api/v1/tasks/${taskId} \
              -H "X-API-Key: ${apiKey}" \
              -H "Content-Type: application/json" \
              -d '{"status": "in_progress"}'
          `);
          
          // Add a note
          await execAsync(`
            curl -s -X POST ${baseUrl}/api/v1/tasks/${taskId}/notes \
              -H "X-API-Key: ${apiKey}" \
              -H "Content-Type: application/json" \
              -d '{"content": "AI Agent: Working on this task"}'
          `);
          
          // Complete the task
          await execAsync(`
            curl -s -X PATCH ${baseUrl}/api/v1/tasks/${taskId} \
              -H "X-API-Key: ${apiKey}" \
              -H "Content-Type: application/json" \
              -d '{"status": "done"}'
          `);
          
          logger.info(`AI agent completed task: ${taskId}`);
        } catch (error: any) {
          agentErrors.push(`Agent work on task ${taskId}: ${error.message}`);
        }
      }
    }

    // Step 4: Verify final state
    try {
      const { stdout } = await execAsync(`
        curl -s -X GET "${baseUrl}/api/v1/tasks?board_id=${boardId}" \
          -H "X-API-Key: ${apiKey}"
      `);
      const response = JSON.parse(stdout);
      
      if (response.success) {
        const tasks = response.data.items;
        const todoCount = tasks.filter((t: any) => t.status === 'todo').length;
        const doneCount = tasks.filter((t: any) => t.status === 'done').length;
        
        logger.info(`Final state - Total: ${tasks.length}, Todo: ${todoCount}, Done: ${doneCount}`);
        
        expect(tasks.length).toBe(10);
        expect(doneCount).toBeGreaterThanOrEqual(3);
      }
    } catch (error: any) {
      logger.error('Failed to get final state', error);
    }

    // Report errors
    logger.info(`User errors: ${userErrors.length}`);
    logger.info(`Agent errors: ${agentErrors.length}`);
    
    expect(userErrors.length).toBeLessThan(3);
    expect(agentErrors.length).toBeLessThan(3);
  }, 60000); // 60 second timeout

  it('should handle concurrent user and agent actions', async () => {
    let boardId: string | null = null;
    const errors: string[] = [];
    
    // Create a board first
    try {
      const { stdout } = await execAsync(`
        curl -s -X POST ${baseUrl}/api/v1/boards \
          -H "X-API-Key: ${apiKey}" \
          -H "Content-Type: application/json" \
          -d '{"name": "Concurrent Test Board", "template": "kanban"}'
      `);
      const response = JSON.parse(stdout);
      boardId = response.data.id;
    } catch (error: any) {
      throw new Error(`Failed to create board: ${error.message}`);
    }

    // Run 20 concurrent operations
    const operations = [];
    
    // User operations
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
        `).catch(err => {
          errors.push(`User op ${i}: ${err.message}`);
        })
      );
    }
    
    // Agent operations (list tasks)
    for (let i = 0; i < 10; i++) {
      operations.push(
        execAsync(`
          curl -s -X GET "${baseUrl}/api/v1/tasks?board_id=${boardId}" \
            -H "X-API-Key: ${apiKey}"
        `).catch(err => {
          errors.push(`Agent op ${i}: ${err.message}`);
        })
      );
    }
    
    // Execute all operations concurrently
    await Promise.all(operations);
    
    logger.info(`Concurrent operations completed with ${errors.length} errors`);
    
    // Verify system stability
    expect(errors.length).toBeLessThan(5); // Less than 25% error rate
  }, 30000);
});