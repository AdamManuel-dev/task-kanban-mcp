/**
 * @fileoverview E2E test for concurrent MCP connections and interactions
 * @lastmodified 2025-01-30T00:00:00Z
 *
 * Features: Tests multiple concurrent MCP client connections
 * Main APIs: MCP protocol via JSON-RPC, stdio transport
 * Constraints: Simulates realistic AI agent interactions
 * Patterns: Concurrent connections, tool calls, resource access
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';

interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

interface SimulationMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  requestsPerSecond: number;
}

class MCPClient {
  private readonly process: ChildProcess;

  private messageId = 1;

  private readonly pendingRequests = new Map<
    string | number,
    {
      resolve: (value: MCPMessage) => void;
      reject: (error: Error) => void;
      startTime: number;
    }
  >();

  private responseBuffer = '';

  private readonly metrics: number[] = [];

  private readonly errors: string[] = [];

  constructor(private readonly clientId: string) {
    this.process = spawn('node', ['dist/mcp/server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        DATABASE_PATH: ':memory:',
        KANBAN_TEST_MODE: 'true',
      },
    });

    // Handle stdout data
    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data);
    });

    // Handle stderr
    this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[${this.clientId}] stderr:`, data.toString());
    });

    // Handle process errors
    this.process.on('error', error => {
      console.error(`[${this.clientId}] Process error:`, error);
      this.errors.push(`Process error: ${error.message}`);
    });
  }

  private handleData(data: Buffer) {
    this.responseBuffer += data.toString();
    const lines = this.responseBuffer.split('\n');

    // Process complete lines
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        try {
          const message = JSON.parse(line) as MCPMessage;
          this.handleMessage(message);
        } catch (error) {
          console.error(`[${this.clientId}] Failed to parse message:`, line);
        }
      }
    }

    // Keep incomplete line in buffer
    this.responseBuffer = lines[lines.length - 1];
  }

  private handleMessage(message: MCPMessage) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const request = this.pendingRequests.get(message.id)!;
      const responseTime = Date.now() - request.startTime;
      this.metrics.push(responseTime);

      this.pendingRequests.delete(message.id);
      request.resolve(message);
    }
  }

  async sendRequest(method: string, params?: any): Promise<MCPMessage> {
    const id = `${this.clientId}-${this.messageId++}`;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      this.pendingRequests.set(id, {
        resolve,
        reject,
        startTime,
      });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          this.errors.push(`Request timeout: ${method}`);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 5000);

      // Send message
      this.process.stdin?.write(`${JSON.stringify(message)}\n`);
    });
  }

  async initialize(): Promise<void> {
    // Wait a bit for the process to start
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const response = await this.sendRequest('initialize', {
        protocolVersion: '0.1.0',
        capabilities: {},
        clientInfo: {
          name: `test-client-${this.clientId}`,
          version: '1.0.0',
        },
      });

      if (response.error) {
        throw new Error(`Initialize failed: ${response.error.message}`);
      }
    } catch (error: any) {
      console.error(`[${this.clientId}] Initialize error:`, error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.process.stdin?.end();
    this.process.kill();
  }

  getMetrics(): SimulationMetrics {
    const total = this.metrics.length + this.errors.length;
    const successful = this.metrics.length;
    const failed = this.errors.length;

    const avg =
      this.metrics.length > 0 ? this.metrics.reduce((a, b) => a + b, 0) / this.metrics.length : 0;

    const max = this.metrics.length > 0 ? Math.max(...this.metrics) : 0;
    const min = this.metrics.length > 0 ? Math.min(...this.metrics) : 0;

    const duration = max > 0 ? max / 1000 : 1; // Convert to seconds
    const rps = total / duration;

    return {
      totalRequests: total,
      successfulRequests: successful,
      failedRequests: failed,
      averageResponseTime: avg,
      maxResponseTime: max,
      minResponseTime: min,
      requestsPerSecond: rps,
    };
  }

  getErrors(): string[] {
    return this.errors;
  }
}

describe('MCP Concurrent Connection Simulation', () => {
  let testDir: string;
  const clients: MCPClient[] = [];

  beforeAll(async () => {
    testDir = join(tmpdir(), `mcp-concurrent-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    process.env.KANBAN_CONFIG_DIR = testDir;
    process.env.DATABASE_PATH = ':memory:';
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
  });

  afterAll(async () => {
    // Clean up all clients
    await Promise.all(clients.map(async client => client.close().catch(() => {})));

    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should connect and initialize a single MCP client', async () => {
    const client = new MCPClient('single-test');
    clients.push(client);

    await client.initialize();

    // Test basic functionality
    const response = await client.sendRequest('tools/list');

    expect(response.result).toBeDefined();
    expect(response.result.tools).toBeDefined();
    expect(Array.isArray(response.result.tools)).toBe(true);

    console.log(`Found ${response.result.tools.length} tools`);

    await client.close();
  }, 15000);

  it('should handle 10 concurrent MCP client connections', async () => {
    const numClients = 10;
    const clientPromises: Array<Promise<void>> = [];

    // Create and initialize clients
    for (let i = 0; i < numClients; i++) {
      const client = new MCPClient(`client-${i}`);
      clients.push(client);

      clientPromises.push(
        client
          .initialize()
          .then(() => console.log(`Client ${i} initialized`))
          .catch(err => console.error(`Client ${i} init failed:`, err))
      );
    }

    // Wait for all clients to initialize
    await Promise.all(clientPromises);

    // Simulate concurrent operations
    const operations: Array<Promise<void>> = [];
    const boardId = uuidv4();

    // Each client performs random operations
    for (let i = 0; i < numClients; i++) {
      const client = clients[i];

      operations.push(
        (async () => {
          try {
            // List available tools
            const toolsResponse = await client.sendRequest('tools/list');
            console.log(`Client ${i} found ${toolsResponse.result?.tools?.length || 0} tools`);

            // Create a task
            const createTaskResponse = await client.sendRequest('tools/call', {
              name: 'create_task',
              arguments: {
                title: `Task from client ${i}`,
                board_id: boardId,
                priority: Math.floor(Math.random() * 5) + 1,
                status: 'todo',
              },
            });

            if (createTaskResponse.result?.success) {
              console.log(`Client ${i} created task`);
            }

            // Get context
            const contextResponse = await client.sendRequest('tools/call', {
              name: 'get_context',
              arguments: { board_id: boardId },
            });

            if (contextResponse.result) {
              console.log(`Client ${i} got context`);
            }

            // Search tasks
            const searchResponse = await client.sendRequest('tools/call', {
              name: 'search_tasks',
              arguments: {
                board_id: boardId,
                status: 'todo',
              },
            });

            if (searchResponse.result) {
              console.log(`Client ${i} searched tasks`);
            }
          } catch (error: any) {
            console.error(`Client ${i} operation failed:`, error.message);
          }
        })()
      );
    }

    // Execute all operations
    await Promise.all(operations);

    // Collect metrics
    const allMetrics = clients.map((client, i) => ({
      clientId: i,
      metrics: client.getMetrics(),
      errors: client.getErrors(),
    }));

    // Aggregate metrics
    const totalRequests = allMetrics.reduce((sum, m) => sum + m.metrics.totalRequests, 0);
    const totalSuccess = allMetrics.reduce((sum, m) => sum + m.metrics.successfulRequests, 0);
    const totalErrors = allMetrics.reduce((sum, m) => sum + m.errors.length, 0);
    const avgResponseTime =
      allMetrics.reduce((sum, m) => sum + m.metrics.averageResponseTime, 0) / numClients;

    console.log('\n=== Concurrent MCP Test Results ===');
    console.log(`Total clients: ${numClients}`);
    console.log(`Total requests: ${totalRequests}`);
    console.log(`Successful requests: ${totalSuccess}`);
    console.log(`Failed requests: ${totalErrors}`);
    console.log(`Average response time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`Success rate: ${((totalSuccess / totalRequests) * 100).toFixed(2)}%`);

    // Assertions
    expect(totalRequests).toBeGreaterThan(numClients * 3); // At least 3 requests per client
    expect(totalSuccess).toBeGreaterThan(totalRequests * 0.8); // 80% success rate
    expect(avgResponseTime).toBeLessThan(1000); // Less than 1 second average
  }, 30000);

  it('should handle rapid-fire requests from multiple clients', async () => {
    const numClients = 5;
    const requestsPerClient = 20;
    const rapidClients: MCPClient[] = [];

    // Create clients
    for (let i = 0; i < numClients; i++) {
      const client = new MCPClient(`rapid-${i}`);
      rapidClients.push(client);
      await client.initialize();
    }

    const startTime = Date.now();
    const operations: Array<Promise<void>> = [];

    // Each client sends rapid requests
    for (let i = 0; i < numClients; i++) {
      const client = rapidClients[i];

      for (let j = 0; j < requestsPerClient; j++) {
        operations.push(
          client
            .sendRequest('tools/call', {
              name: 'search_tasks',
              arguments: {
                limit: 10,
                offset: j * 10,
              },
            })
            .then(() => {
              // Success
            })
            .catch(() => {
              // Error handled in client
            })
        );
      }
    }

    // Wait for all operations
    await Promise.all(operations);
    const duration = Date.now() - startTime;

    // Calculate throughput
    const totalOps = numClients * requestsPerClient;
    const opsPerSecond = (totalOps / duration) * 1000;

    console.log('\n=== Rapid Fire Test Results ===');
    console.log(`Total operations: ${totalOps}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Operations per second: ${opsPerSecond.toFixed(2)}`);

    // Clean up
    await Promise.all(rapidClients.map(async c => c.close()));

    // Assertions
    expect(opsPerSecond).toBeGreaterThan(10); // At least 10 ops/sec
    expect(duration).toBeLessThan(10000); // Complete within 10 seconds
  }, 15000);

  it('should maintain protocol compliance under concurrent load', async () => {
    const client = new MCPClient('protocol-test');
    await client.initialize();

    // Test various protocol operations concurrently
    const protocolTests = [
      // List tools
      client.sendRequest('tools/list'),

      // List resources
      client.sendRequest('resources/list'),

      // List prompts
      client.sendRequest('prompts/list'),

      // Invalid method (should return error)
      client.sendRequest('invalid/method').catch(err => ({ error: err })),

      // Tool call with missing args
      client.sendRequest('tools/call', { name: 'create_task' }).catch(err => ({ error: err })),
    ];

    const results = await Promise.all(protocolTests);

    // Verify protocol compliance
    expect(results[0].result).toHaveProperty('tools');
    expect(Array.isArray(results[0].result.tools)).toBe(true);

    expect(results[1].result).toHaveProperty('resources');
    expect(Array.isArray(results[1].result.resources)).toBe(true);

    expect(results[2].result).toHaveProperty('prompts');
    expect(Array.isArray(results[2].result.prompts)).toBe(true);

    // Verify error handling
    expect(results[3]).toHaveProperty('error');
    expect(results[4]).toHaveProperty('error');

    await client.close();

    console.log('\n=== Protocol Compliance Test ===');
    console.log('✓ Tools listing works');
    console.log('✓ Resources listing works');
    console.log('✓ Prompts listing works');
    console.log('✓ Invalid methods handled correctly');
    console.log('✓ Missing arguments handled correctly');
  }, 10000);
});
