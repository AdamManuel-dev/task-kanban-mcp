/**
 * MCP Server Integration Tests
 */

import { MCPKanbanServer } from '@/mcp/server';
import { dbConnection } from '@/database/connection';
import { v4 as uuidv4 } from 'uuid';
import type { Task, Board } from '@/types';

describe('MCP Server Integration Tests', () => {
  let server: MCPKanbanServer;
  let testBoard: Board;
  let testTask: Task;

  beforeAll(async () => {
    // Initialize database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Create a test server instance (not the singleton)
    server = new MCPKanbanServer();

    // Initialize the server (this will set up the database connection for services)
    await server.start();

    // Create test board
    const boardId = uuidv4();
    await dbConnection.execute(
      'INSERT INTO boards (id, name, description, created_at) VALUES (?, ?, ?, ?)',
      [boardId, 'Test Board', 'Integration test board', new Date().toISOString()]
    );

    testBoard = {
      id: boardId,
      name: 'Test Board',
      description: 'Integration test board',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Create test column
    const columnId = uuidv4();
    await dbConnection.execute(
      'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
      [columnId, boardId, 'To Do', 0, new Date().toISOString()]
    );

    // Store column ID for tests
    global.testColumnId = columnId;

    // Create test task
    const taskId = uuidv4();
    await dbConnection.execute(
      `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, position, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        'Test Task',
        'Integration test task',
        boardId,
        columnId,
        'todo',
        'medium',
        0,
        new Date().toISOString(),
      ]
    );

    testTask = {
      id: taskId,
      title: 'Test Task',
      description: 'Integration test task',
      boardId,
      board_id: boardId,
      status: 'todo',
      priority: 'medium',
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Task;
  });

  afterAll(async () => {
    // Stop the server properly (don't exit process in tests)
    await server.stop(false);
    await dbConnection.close();
  });

  describe('Server Lifecycle', () => {
    it('should get server info', () => {
      const info = server.getServerInfo();

      expect(info.name).toBeDefined();
      expect(info.version).toBeDefined();
      expect(info.capabilities).toContain('tools');
      expect(info.capabilities).toContain('resources');
      expect(info.capabilities).toContain('prompts');
      expect(info.description).toContain('Kanban');
    });

    it('should perform health check', async () => {
      const health = await server.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.database).toBe(true);
      expect(health.tools).toBeGreaterThan(0);
      expect(health.resources).toBeGreaterThan(0);
      expect(health.prompts).toBeGreaterThan(0);
      expect(health.uptime).toBeGreaterThan(0);
    });

    it('should handle database connection issues', async () => {
      // Close database connection
      await dbConnection.close();

      const health = await server.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.database).toBe(false);

      // Reconnect for other tests
      await dbConnection.initialize({
        path: ':memory:',
        skipSchema: false,
      });
    });
  });

  describe('Tool Registry', () => {
    it('should list available tools', async () => {
      const toolRegistry = server.getToolRegistry();
      const tools = await toolRegistry.listTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);

      // Check for essential tools
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('create_task');
      expect(toolNames).toContain('get_task');
      expect(toolNames).toContain('update_task');
      expect(toolNames).toContain('delete_task');
      expect(toolNames).toContain('list_tasks');
      expect(toolNames).toContain('search_tasks');
    });

    it('should provide tool schema information', async () => {
      const toolRegistry = server.getToolRegistry();
      const tools = await toolRegistry.listTools();

      const createTaskTool = tools.find(t => t.name === 'create_task');
      expect(createTaskTool).toBeDefined();
      expect(createTaskTool?.description).toBeDefined();
      expect(createTaskTool?.inputSchema).toBeDefined();
      expect(createTaskTool?.inputSchema.properties).toBeDefined();
    });

    it('should execute create_task tool', async () => {
      const toolRegistry = server.getToolRegistry();

      const taskData = {
        title: 'Tool Created Task',
        description: 'Created via MCP tool',
        board_id: testBoard.id,
        column_id: global.testColumnId,
        status: 'todo',
        priority: 'high',
      };

      const result = await toolRegistry.callTool('create_task', taskData);

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.task.title).toBe(taskData.title);
      expect(result.task.id).toBeDefined();
    });

    it('should execute get_task tool', async () => {
      const toolRegistry = server.getToolRegistry();

      const result = await toolRegistry.callTool('get_task', { task_id: testTask.id });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.id).toBe(testTask.id);
      expect(result.data.title).toBe(testTask.title);
    });

    it('should execute update_task tool', async () => {
      const toolRegistry = server.getToolRegistry();

      const updates = {
        task_id: testTask.id,
        title: 'Updated via MCP Tool',
        status: 'in_progress',
      };

      const result = await toolRegistry.callTool('update_task', updates);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.title).toBe(updates.title);
      expect(result.data.status).toBe(updates.status);
    });

    it('should execute search_tasks tool', async () => {
      const toolRegistry = server.getToolRegistry();

      const result = await toolRegistry.callTool('search_tasks', {
        query: 'Test',
        boardId: testBoard.id,
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle tool execution errors', async () => {
      const toolRegistry = server.getToolRegistry();

      // Try to get non-existent task
      const result = await toolRegistry.callTool('get_task', { id: 'non-existent-id' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('not found');
    });

    it('should validate tool arguments', async () => {
      const toolRegistry = server.getToolRegistry();

      // Try to create task without required fields
      await expect(toolRegistry.callTool('create_task', { title: '' })).rejects.toThrow();
    });
  });

  describe('Resource Registry', () => {
    it('should list available resources', async () => {
      const resourceRegistry = server.getResourceRegistry();
      const resources = await resourceRegistry.listResources();

      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);

      // Check for essential resources
      const resourceUris = resources.map(r => r.uri);
      expect(resourceUris.some(uri => uri.includes('boards'))).toBe(true);
      expect(resourceUris.some(uri => uri.includes('tasks'))).toBe(true);
    });

    it('should provide resource metadata', async () => {
      const resourceRegistry = server.getResourceRegistry();
      const resources = await resourceRegistry.listResources();

      const boardResource = resources.find(r => r.uri.includes('boards'));
      expect(boardResource).toBeDefined();
      expect(boardResource?.name).toBeDefined();
      expect(boardResource?.description).toBeDefined();
      expect(boardResource?.mimeType).toBeDefined();
    });

    it('should read board list resource', async () => {
      const resourceRegistry = server.getResourceRegistry();

      const result = await resourceRegistry.readResource('kanban://boards');

      expect(result.text).toBeDefined();

      const boardData = JSON.parse(result.text);
      expect(Array.isArray(boardData)).toBe(true);
      expect(boardData.length).toBeGreaterThan(0);
      expect(boardData[0].id).toBe(testBoard.id);
    });

    it('should read specific board resource', async () => {
      const resourceRegistry = server.getResourceRegistry();

      const result = await resourceRegistry.readResource(
        `kanban://boards/${String(String(testBoard.id))}`
      );

      expect(result.text).toBeDefined();

      const boardData = JSON.parse(result.text);
      expect(boardData.id).toBe(testBoard.id);
      expect(boardData.name).toBe(testBoard.name);
    });

    it('should read board tasks resource', async () => {
      const resourceRegistry = server.getResourceRegistry();

      const result = await resourceRegistry.readResource(
        `kanban://boards/${String(String(testBoard.id))}/tasks`
      );

      expect(result.text).toBeDefined();

      const tasksData = JSON.parse(result.text);
      expect(Array.isArray(tasksData)).toBe(true);
      expect(tasksData.length).toBeGreaterThan(0);
    });

    it('should handle non-existent resources', async () => {
      const resourceRegistry = server.getResourceRegistry();

      await expect(
        resourceRegistry.readResource('kanban://boards/non-existent-id')
      ).rejects.toThrow();
    });

    it('should handle invalid resource URIs', async () => {
      const resourceRegistry = server.getResourceRegistry();

      await expect(resourceRegistry.readResource('invalid://resource')).rejects.toThrow();
    });
  });

  describe('Prompt Registry', () => {
    it('should list available prompts', async () => {
      const promptRegistry = server.getPromptRegistry();
      const prompts = await promptRegistry.listPrompts();

      expect(Array.isArray(prompts)).toBe(true);
      expect(prompts.length).toBeGreaterThan(0);

      // Check for essential prompts
      const promptNames = prompts.map(p => p.name);
      expect(promptNames).toContain('task_planning');
      expect(promptNames).toContain('task_breakdown');
      expect(promptNames).toContain('sprint_planning');
    });

    it('should provide prompt metadata', async () => {
      const promptRegistry = server.getPromptRegistry();
      const prompts = await promptRegistry.listPrompts();

      const taskPlanningPrompt = prompts.find(p => p.name === 'task_planning');
      expect(taskPlanningPrompt).toBeDefined();
      expect(taskPlanningPrompt?.description).toBeDefined();
      expect(taskPlanningPrompt?.arguments).toBeDefined();
    });

    it('should generate task planning prompt', async () => {
      const promptRegistry = server.getPromptRegistry();

      const prompt = await promptRegistry.getPrompt('task_planning', {
        boardId: testBoard.id,
        context: 'Sprint planning for Q1',
      });

      expect(prompt.description).toBeDefined();
      expect(Array.isArray(prompt.messages)).toBe(true);
      expect(prompt.messages.length).toBeGreaterThan(0);
      expect(prompt.messages[0].content).toBeDefined();
    });

    it('should generate task breakdown prompt with context', async () => {
      const promptRegistry = server.getPromptRegistry();

      const prompt = await promptRegistry.getPrompt('task_breakdown', {
        taskId: testTask.id,
        complexity: 'high',
      });

      expect(prompt.description).toBeDefined();
      expect(Array.isArray(prompt.messages)).toBe(true);
      expect(prompt.messages.length).toBeGreaterThan(0);

      // Check that task details are included in the prompt
      const { content } = prompt.messages[0];
      expect(content).toContain(testTask.title);
    });

    it('should handle missing prompt arguments', async () => {
      const promptRegistry = server.getPromptRegistry();

      await expect(promptRegistry.getPrompt('task_planning', {})).rejects.toThrow();
    });

    it('should handle non-existent prompts', async () => {
      const promptRegistry = server.getPromptRegistry();

      await expect(promptRegistry.getPrompt('non_existent_prompt', {})).rejects.toThrow();
    });
  });

  describe('Integration Scenarios', () => {
    it('should support complete task management workflow', async () => {
      const toolRegistry = server.getToolRegistry();

      // 1. Create a new task
      const createResult = await toolRegistry.callTool('create_task', {
        title: 'Workflow Test Task',
        description: 'Testing complete workflow',
        boardId: testBoard.id,
        columnId: global.testColumnId,
        status: 'todo',
        priority: 'medium',
      });

      expect(createResult.success).toBe(true);
      const newTaskId = createResult.data.id;

      // 2. Get the task
      const getResult = await toolRegistry.callTool('get_task', { id: newTaskId });
      expect(getResult.success).toBe(true);
      expect(getResult.data.title).toBe('Workflow Test Task');

      // 3. Update the task
      const updateResult = await toolRegistry.callTool('update_task', {
        id: newTaskId,
        status: 'in_progress',
        priority: 'high',
      });
      expect(updateResult.success).toBe(true);
      expect(updateResult.data.status).toBe('in_progress');

      // 4. Search for the task
      const searchResult = await toolRegistry.callTool('search_tasks', {
        query: 'Workflow',
        boardId: testBoard.id,
      });
      expect(searchResult.success).toBe(true);
      expect(searchResult.data.some((task: Task) => task.id === newTaskId)).toBe(true);

      // 5. Delete the task
      const deleteResult = await toolRegistry.callTool('delete_task', { id: newTaskId });
      expect(deleteResult.success).toBe(true);

      // 6. Verify deletion
      const getDeletedResult = await toolRegistry.callTool('get_task', { id: newTaskId });
      expect(getDeletedResult.success).toBe(false);
    });

    it('should support board and task resource access', async () => {
      const resourceRegistry = server.getResourceRegistry();

      // 1. Get boards list
      const boardsResult = await resourceRegistry.readResource('kanban://boards');
      const boards = JSON.parse(boardsResult.text);
      expect(boards.length).toBeGreaterThan(0);

      // 2. Get specific board
      const boardResult = await resourceRegistry.readResource(
        `kanban://boards/${String(String(testBoard.id))}`
      );
      const board = JSON.parse(boardResult.text);
      expect(board.id).toBe(testBoard.id);

      // 3. Get board tasks
      const tasksResult = await resourceRegistry.readResource(
        `kanban://boards/${String(String(testBoard.id))}/tasks`
      );
      const tasks = JSON.parse(tasksResult.text);
      expect(Array.isArray(tasks)).toBe(true);

      // 4. Get task context
      const contextResult = await resourceRegistry.readResource(
        `kanban://context/board/${String(String(testBoard.id))}`
      );
      const context = JSON.parse(contextResult.text);
      expect(context.board).toBeDefined();
      expect(context.tasks).toBeDefined();
    });

    it('should support AI-guided task planning', async () => {
      const promptRegistry = server.getPromptRegistry();
      const toolRegistry = server.getToolRegistry();

      // 1. Generate planning prompt with current board context
      const planningPrompt = await promptRegistry.getPrompt('task_planning', {
        boardId: testBoard.id,
        context: 'Planning next sprint with focus on testing',
      });

      expect(planningPrompt.messages).toBeDefined();
      expect(planningPrompt.messages[0].content).toContain(testBoard.name);

      // 2. Generate task breakdown prompt
      const breakdownPrompt = await promptRegistry.getPrompt('task_breakdown', {
        taskId: testTask.id,
        complexity: 'medium',
      });

      expect(breakdownPrompt.messages).toBeDefined();
      expect(breakdownPrompt.messages[0].content).toContain(testTask.title);

      // 3. Create subtasks based on breakdown (simulated)
      const subtaskData = {
        title: 'Subtask from AI breakdown',
        description: 'Created based on AI task breakdown',
        boardId: testBoard.id,
        columnId: global.testColumnId,
        status: 'todo',
        priority: 'low',
      };

      const subtaskResult = await toolRegistry.callTool('create_task', subtaskData);
      expect(subtaskResult.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      await dbConnection.close();

      const toolRegistry = server.getToolRegistry();

      const result = await toolRegistry.callTool('list_tasks', {});
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Reconnect for cleanup
      await dbConnection.initialize({
        path: ':memory:',
        skipSchema: false,
      });
    });

    it('should validate input parameters', async () => {
      const toolRegistry = server.getToolRegistry();

      // Invalid task creation (missing required fields)
      await expect(
        toolRegistry.callTool('create_task', {
          boardId: testBoard.id,
          columnId: global.testColumnId,
        })
      ).rejects.toThrow();

      // Invalid task ID format
      const result = await toolRegistry.callTool('get_task', { id: 'invalid-uuid' });
      expect(result.success).toBe(false);
    });

    it('should handle concurrent operations', async () => {
      const toolRegistry = server.getToolRegistry();

      // Create multiple tasks concurrently
      const taskPromises = Array.from({ length: 5 }, (_, i) =>
        toolRegistry.callTool('create_task', {
          title: `Concurrent Task ${String(i + 1)}`,
          boardId: testBoard.id,
          columnId: global.testColumnId,
          status: 'todo',
        })
      );

      const results = await Promise.all(taskPromises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data.id).toBeDefined();
      });

      // Verify all tasks were created
      const listResult = await toolRegistry.callTool('list_tasks', { boardId: testBoard.id });
      expect(listResult.success).toBe(true);
      expect(listResult.data.length).toBeGreaterThanOrEqual(5);
    });
  });
});
