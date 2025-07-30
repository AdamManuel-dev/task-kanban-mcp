/**
 * End-to-End MCP API Tests
 * Tests the Model Context Protocol server functionality and compliance
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

describe('MCP API E2E Tests', () => {
  let mcpProcess: ChildProcess;
  let testDir: string;
  let messageId = 1;

  beforeAll(async () => {
    testDir = join(tmpdir(), `mcp-test-${String(String(Date.now()))}`);
    await fs.mkdir(testDir, { recursive: true });

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    process.env.KANBAN_CONFIG_DIR = testDir;
  });

  afterAll(async () => {
    if (mcpProcess && !mcpProcess.killed) {
      mcpProcess.kill();
    }

    try {
      await fs.rmdir(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper function to start MCP server
   */
  async function startMCPServer(): Promise<ChildProcess> {
    const serverProcess = spawn(
      'npx',
      ['ts-node', '-r', 'tsconfig-paths/register', 'src/mcp/server.ts'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
      }
    );

    // Wait for server to be ready
    await new Promise<void>(resolve => {
      serverProcess;
      resolve();
    });

    return serverProcess;
  }

  /**
   * Helper function to send messages to MCP server and receive responses
   */
  async function sendMCPMessage(process: ChildProcess, message: MCPMessage): Promise<MCPMessage> {
    return new Promise((resolve, reject) => {
      const messageStr = `${JSON.stringify(message)}\n`;
      let responseData = '';

      const timeout = setTimeout(() => {
        reject(new Error('MCP message timeout'));
      }, 10000);

      const onData = (data: Buffer) => {
        responseData += data.toString();

        // Check if we have a complete JSON message
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line.trim()) as MCPMessage;
              if (response.id === message.id || response.error) {
                clearTimeout(timeout);
                process.stdout?.removeListener('data', onData);
                resolve(response);
                return;
              }
            } catch (error) {
              // Continue parsing other lines
            }
          }
        }
      };

      process.stdout?.on('data', onData);

      process.stdin?.write(messageStr);
    });
  }

  describe('MCP Protocol Compliance', () => {
    beforeEach(async () => {
      mcpProcess = await startMCPServer();
    });

    afterEach(() => {
      if (mcpProcess && !mcpProcess.killed) {
        mcpProcess.kill();
      }
    });

    it('should respond to initialize request', async () => {
      const initMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      const response = await sendMCPMessage(mcpProcess, initMessage);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(initMessage.id);
      expect(response.result).toBeDefined();
      expect(response.result.capabilities).toBeDefined();
      expect(response.result.serverInfo).toBeDefined();
      expect(response.result.serverInfo.name).toContain('kanban');
    }, 15000);

    it('should handle invalid JSON-RPC messages', async () => {
      const invalidMessage = 'invalid json\\n';

      mcpProcess.stdin.write(invalidMessage);

      // Should not crash the server
      await new Promise<void>(resolve => {
        setTimeout(resolve, 1000);
      });
      expect(mcpProcess.killed).toBe(false);
    });

    it('should respond with error for unknown methods', async () => {
      const unknownMethodMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'unknown_method',
        params: {},
      };

      const response = await sendMCPMessage(mcpProcess, unknownMethodMessage);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(unknownMethodMessage.id);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32601); // Method not found
    });

    it('should validate protocol version', async () => {
      const invalidVersionMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'initialize',
        params: {
          protocolVersion: '1999-01-01', // Invalid version
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      };

      const response = await sendMCPMessage(mcpProcess, invalidVersionMessage);

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('protocol version');
    });
  });

  describe('Tool Registry and Execution', () => {
    beforeEach(async () => {
      mcpProcess = await startMCPServer();

      // Initialize connection
      await sendMCPMessage(mcpProcess, {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });
    });

    afterEach(() => {
      if (mcpProcess && !mcpProcess.killed) {
        mcpProcess.kill();
      }
    });

    it('should list available tools', async () => {
      const listToolsMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'tools/list',
        params: {},
      };

      const response = await sendMCPMessage(mcpProcess, listToolsMessage);

      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeInstanceOf(Array);
      expect(response.result.tools.length).toBeGreaterThan(0);

      // Check for expected tools
      const toolNames = response.result.tools.map(t => t.name);
      expect(toolNames).toContain('create_task');
      expect(toolNames).toContain('get_context');
      expect(toolNames).toContain('search_tasks');
    });

    it('should execute create_task tool', async () => {
      const createTaskMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'tools/call',
        params: {
          name: 'create_task',
          arguments: {
            title: 'MCP Test Task',
            description: 'Task created via MCP API test',
            board_id: 'test-board',
            column_id: 'todo',
            priority: 1,
          },
        },
      };

      const response = await sendMCPMessage(mcpProcess, createTaskMessage);

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeInstanceOf(Array);
      expect(response.result.content[0].type).toBe('text');
      expect(response.result.content[0].text).toContain('created');
    });

    it('should validate tool arguments', async () => {
      const invalidToolMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'tools/call',
        params: {
          name: 'create_task',
          arguments: {
            // Missing required title
            description: 'Task without title',
          },
        },
      };

      const response = await sendMCPMessage(mcpProcess, invalidToolMessage);

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('required');
    });

    it('should sanitize tool inputs', async () => {
      const maliciousTaskMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'tools/call',
        params: {
          name: 'create_task',
          arguments: {
            title: '<script>alert("mcp-xss")</script>Clean Title',
            description: '$(rm -rf /) Safe description',
            board_id: 'test-board',
            column_id: 'todo',
          },
        },
      };

      const response = await sendMCPMessage(mcpProcess, maliciousTaskMessage);

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).not.toContain('<script>');
      expect(response.result.content[0].text).not.toContain('$(rm -rf /)');
      expect(response.result.content[0].text).toContain('Clean Title');
      expect(response.result.content[0].text).toContain('Safe description');
    });

    it('should handle tool execution errors gracefully', async () => {
      const errorToolMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'tools/call',
        params: {
          name: 'get_task',
          arguments: {
            task_id: 'non-existent-task',
          },
        },
      };

      const response = await sendMCPMessage(mcpProcess, errorToolMessage);

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('not found');
    });
  });

  describe('Resource Management', () => {
    beforeEach(async () => {
      mcpProcess = await startMCPServer();

      // Initialize connection
      await sendMCPMessage(mcpProcess, {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });
    });

    afterEach(() => {
      if (mcpProcess && !mcpProcess.killed) {
        mcpProcess.kill();
      }
    });

    it('should list available resources', async () => {
      const listResourcesMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'resources/list',
        params: {},
      };

      const response = await sendMCPMessage(mcpProcess, listResourcesMessage);

      expect(response.result).toBeDefined();
      expect(response.result.resources).toBeInstanceOf(Array);

      // Check for expected resources
      const resourceUris = response.result.resources.map(r => r.uri);
      expect(resourceUris.some(uri => uri.includes('boards'))).toBe(true);
      expect(resourceUris.some(uri => uri.includes('tasks'))).toBe(true);
    });

    it('should read board resource', async () => {
      const readResourceMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'resources/read',
        params: {
          uri: 'kanban://boards',
        },
      };

      const response = await sendMCPMessage(mcpProcess, readResourceMessage);

      expect(response.result).toBeDefined();
      expect(response.result.contents).toBeInstanceOf(Array);
      expect(response.result.contents[0].uri).toBe('kanban://boards');
      expect(response.result.contents[0].mimeType).toBe('application/json');
    });

    it('should handle invalid resource URIs', async () => {
      const invalidResourceMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'resources/read',
        params: {
          uri: 'invalid://resource',
        },
      };

      const response = await sendMCPMessage(mcpProcess, invalidResourceMessage);

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('not found');
    });

    it('should validate resource access permissions', async () => {
      const restrictedResourceMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'resources/read',
        params: {
          uri: 'kanban://admin/users',
        },
      };

      const response = await sendMCPMessage(mcpProcess, restrictedResourceMessage);

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('access denied');
    });
  });

  describe('Prompt System', () => {
    beforeEach(async () => {
      mcpProcess = await startMCPServer();

      // Initialize connection
      await sendMCPMessage(mcpProcess, {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });
    });

    afterEach(() => {
      if (mcpProcess && !mcpProcess.killed) {
        mcpProcess.kill();
      }
    });

    it('should list available prompts', async () => {
      const listPromptsMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'prompts/list',
        params: {},
      };

      const response = await sendMCPMessage(mcpProcess, listPromptsMessage);

      expect(response.result).toBeDefined();
      expect(response.result.prompts).toBeInstanceOf(Array);

      // Check for expected prompts
      const promptNames = response.result.prompts.map(p => p.name);
      expect(promptNames).toContain('task_analysis');
      expect(promptNames).toContain('project_summary');
    });

    it('should get prompt with context', async () => {
      const getPromptMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'prompts/get',
        params: {
          name: 'task_analysis',
          arguments: {
            board_id: 'test-board',
          },
        },
      };

      const response = await sendMCPMessage(mcpProcess, getPromptMessage);

      expect(response.result).toBeDefined();
      expect(response.result.description).toBeDefined();
      expect(response.result.messages).toBeInstanceOf(Array);
      expect(response.result.messages.length).toBeGreaterThan(0);
    });

    it('should validate prompt arguments', async () => {
      const invalidPromptMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'prompts/get',
        params: {
          name: 'task_analysis',
          arguments: {
            // Missing required board_id
            invalid_param: 'value',
          },
        },
      };

      const response = await sendMCPMessage(mcpProcess, invalidPromptMessage);

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('required');
    });

    it('should sanitize prompt inputs', async () => {
      const maliciousPromptMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'prompts/get',
        params: {
          name: 'project_summary',
          arguments: {
            board_id: '<script>alert("prompt-xss")</script>test-board',
          },
        },
      };

      const response = await sendMCPMessage(mcpProcess, maliciousPromptMessage);

      expect(response.result).toBeDefined();
      expect(response.result.messages[0].content.text).not.toContain('<script>');
      expect(response.result.messages[0].content.text).not.toContain('alert');
    });
  });

  describe('Error Handling and Security', () => {
    beforeEach(async () => {
      mcpProcess = await startMCPServer();
    });

    afterEach(() => {
      if (mcpProcess && !mcpProcess.killed) {
        mcpProcess.kill();
      }
    });

    it('should handle malformed JSON messages', async () => {
      const malformedJson = '{"invalid": json,}\\n';

      mcpProcess.stdin.write(malformedJson);

      // Server should not crash
      await new Promise<void>(resolve => {
        setTimeout(resolve, 1000);
      });
      expect(mcpProcess.killed).toBe(false);
    });

    it('should limit message size', async () => {
      const hugeMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'tools/call',
        params: {
          name: 'create_task',
          arguments: {
            title: 'Huge Task',
            description: 'x'.repeat(1000000), // 1MB description
          },
        },
      };

      const messageStr = `${String(String(JSON.stringify(hugeMessage)))}\\n`;

      mcpProcess.stdin.write(messageStr);

      // Should either handle gracefully or reject
      await new Promise<void>(resolve => {
        setTimeout(resolve, 2000);
      });
      expect(mcpProcess.killed).toBe(false);
    });

    it('should handle concurrent requests', async () => {
      // Initialize first
      await sendMCPMessage(mcpProcess, {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });

      // Send multiple concurrent requests
      const requests = Array(10)
        .fill(null)
        .map(async (_, index) => {
          const message: MCPMessage = {
            jsonrpc: '2.0',
            id: messageId++,
            method: 'tools/call',
            params: {
              name: 'create_task',
              arguments: {
                title: `Concurrent Task ${String(index)}`,
                board_id: 'test-board',
                column_id: 'todo',
              },
            },
          };
          return sendMCPMessage(mcpProcess, message);
        });

      const responses = await Promise.allSettled(requests);
      const successful = responses.filter(r => r.status === 'fulfilled').length;

      expect(successful).toBeGreaterThan(7); // At least 70% success rate
    }, 15000);

    it('should protect against prototype pollution', async () => {
      const pollutionMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'tools/call',
        params: {
          name: 'create_task',
          arguments: {
            title: 'Test Task',
            __proto__: { polluted: true },
            constructor: { prototype: { polluted: true } },
          },
        },
      };

      await sendMCPMessage(mcpProcess, pollutionMessage);

      // Check that global prototypes are not polluted
      expect(Object.prototype.polluted).toBeUndefined();
      expect({}.polluted).toBeUndefined();
    });
  });

  describe('Performance and Scalability', () => {
    beforeEach(async () => {
      mcpProcess = await startMCPServer();

      // Initialize connection
      await sendMCPMessage(mcpProcess, {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });
    });

    afterEach(() => {
      if (mcpProcess && !mcpProcess.killed) {
        mcpProcess.kill();
      }
    });

    it('should respond to requests within reasonable time', async () => {
      const startTime = Date.now();

      const message: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'tools/list',
        params: {},
      };

      await sendMCPMessage(mcpProcess, message);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(5000); // Less than 5 seconds
    });

    it('should handle rapid sequential requests', async () => {
      const requests = [];
      const startTime = Date.now();

      for (let i = 0; i < 20; i++) {
        const message: MCPMessage = {
          jsonrpc: '2.0',
          id: messageId++,
          method: 'resources/list',
          params: {},
        };
        requests.push(sendMCPMessage(mcpProcess, message));
      }

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      expect(responses.length).toBe(20);
      expect(totalTime).toBeLessThan(30000); // Less than 30 seconds total

      responses.forEach(response => {
        expect(response.result).toBeDefined();
      });
    }, 35000);

    it('should maintain stable memory usage', async () => {
      // Create many tasks to test memory stability
      for (let i = 0; i < 50; i++) {
        const message: MCPMessage = {
          jsonrpc: '2.0',
          id: messageId++,
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: {
              title: `Memory Test Task ${String(i)}`,
              board_id: 'test-board',
              column_id: 'todo',
            },
          },
        };

        await sendMCPMessage(mcpProcess, message);
      }

      // Server should still be responsive
      const finalMessage: MCPMessage = {
        jsonrpc: '2.0',
        id: messageId++,
        method: 'tools/list',
        params: {},
      };

      const response = await sendMCPMessage(mcpProcess, finalMessage);
      expect(response.result).toBeDefined();
    }, 60000);
  });
});
