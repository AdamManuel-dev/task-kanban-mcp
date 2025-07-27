/**
 * Unit tests for MCP Types
 *
 * @description Tests for MCP (Model Context Protocol) type definitions and interfaces
 */

import type {
  McpResponse,
  McpError,
  McpTool,
  McpToolResult,
  ToolDefinition,
  ToolCall,
  ResourceDefinition,
  PromptDefinition,
} from '@/mcp/types';

describe('MCP Types', () => {
  describe('McpResponse', () => {
    it('should properly type success responses', () => {
      const successResponse: McpResponse<string> = {
        success: true,
        data: 'test data',
      };

      expect(successResponse.success).toBe(true);
      expect(successResponse.data).toBe('test data');
      // success responses should not have error
      expect('error' in successResponse).toBe(false);
    });

    it('should properly type error responses', () => {
      const errorResponse: McpResponse<string> = {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid request parameters',
        },
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe('INVALID_REQUEST');
      expect(errorResponse.error.message).toBe('Invalid request parameters');
      // error responses should not have data
      expect('data' in errorResponse).toBe(false);
    });

    it('should support generic typing', () => {
      interface TestData {
        id: string;
        name: string;
      }

      const typedResponse: McpResponse<TestData> = {
        success: true,
        data: {
          id: 'test-id',
          name: 'Test Name',
        },
      };

      expect(typedResponse.data.id).toBe('test-id');
      expect(typedResponse.data.name).toBe('Test Name');
    });
  });

  describe('McpError', () => {
    it('should properly structure error objects', () => {
      const error: McpError = {
        code: 'TASK_NOT_FOUND',
        message: 'Task with specified ID not found',
      };

      expect(error.code).toBe('TASK_NOT_FOUND');
      expect(error.message).toBe('Task with specified ID not found');
    });

    it('should support optional details', () => {
      const errorWithDetails: McpError = {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        details: {
          field: 'title',
          reason: 'required',
        },
      };

      expect(errorWithDetails.details).toBeDefined();
      expect(errorWithDetails.details).toMatchObject({
        field: 'title',
        reason: 'required',
      });
    });
  });

  describe('ToolDefinition', () => {
    it('should properly define tool schemas', () => {
      const toolDef: ToolDefinition = {
        name: 'create_task',
        description: 'Create a new task in the kanban board',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Task title',
            },
            description: {
              type: 'string',
              description: 'Task description',
            },
            board_id: {
              type: 'string',
              description: 'Board ID where task will be created',
            },
          },
          required: ['title', 'board_id'],
        },
      };

      expect(toolDef.name).toBe('create_task');
      expect(toolDef.description).toContain('Create a new task');
      expect(toolDef.inputSchema.type).toBe('object');
      expect(toolDef.inputSchema.required).toContain('title');
      expect(toolDef.inputSchema.required).toContain('board_id');
    });

    it('should handle complex parameter schemas', () => {
      const complexTool: ToolDefinition = {
        name: 'advanced_search',
        description: 'Advanced task search with multiple filters',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            filters: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
                priority: { type: 'number', minimum: 1, maximum: 10 },
                tags: { type: 'array', items: { type: 'string' } },
              },
            },
            limit: { type: 'number', default: 50 },
          },
          required: ['query'],
        },
      };

      expect(complexTool.inputSchema.properties.filters).toBeDefined();
      expect(complexTool.inputSchema.properties.limit).toMatchObject({
        type: 'number',
        default: 50,
      });
    });
  });

  describe('ToolCall', () => {
    it('should properly structure tool calls', () => {
      const toolCall: ToolCall = {
        name: 'get_tasks',
        arguments: {
          board_id: 'board-123',
          status: 'in_progress',
          limit: 10,
        },
      };

      expect(toolCall.name).toBe('get_tasks');
      expect(toolCall.arguments.board_id).toBe('board-123');
      expect(toolCall.arguments.status).toBe('in_progress');
      expect(toolCall.arguments.limit).toBe(10);
    });

    it('should handle empty arguments', () => {
      const simpleCall: ToolCall = {
        name: 'list_boards',
        arguments: {},
      };

      expect(simpleCall.name).toBe('list_boards');
      expect(Object.keys(simpleCall.arguments)).toHaveLength(0);
    });
  });

  describe('McpToolResult', () => {
    it('should structure successful tool results', () => {
      const result: McpToolResult = {
        content: [
          {
            type: 'text',
            text: 'Task created successfully with ID: task-456',
          },
        ],
        isError: false,
      };

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Task created successfully');
    });

    it('should structure error tool results', () => {
      const errorResult: McpToolResult = {
        content: [
          {
            type: 'text',
            text: 'Error: Task not found',
          },
        ],
        isError: true,
      };

      expect(errorResult.isError).toBe(true);
      expect(errorResult.content[0].text).toContain('Error:');
    });

    it('should support multiple content items', () => {
      const multiContentResult: McpToolResult = {
        content: [
          {
            type: 'text',
            text: 'Found 3 matching tasks:',
          },
          {
            type: 'text',
            text: '1. Implement authentication',
          },
          {
            type: 'text',
            text: '2. Add unit tests',
          },
          {
            type: 'text',
            text: '3. Update documentation',
          },
        ],
        isError: false,
      };

      expect(multiContentResult.content).toHaveLength(4);
      expect(multiContentResult.content.every(item => item.type === 'text')).toBe(true);
    });
  });

  describe('ResourceDefinition', () => {
    it('should properly define resource schemas', () => {
      const resourceDef: ResourceDefinition = {
        uri: 'kanban://tasks/{id}',
        name: 'Task Resource',
        description: 'Individual task data and metadata',
        mimeType: 'application/json',
      };

      expect(resourceDef.uri).toBe('kanban://tasks/{id}');
      expect(resourceDef.name).toBe('Task Resource');
      expect(resourceDef.mimeType).toBe('application/json');
    });

    it('should support optional mime type', () => {
      const simpleResource: ResourceDefinition = {
        uri: 'kanban://boards',
        name: 'Boards List',
        description: 'List of all kanban boards',
      };

      expect(simpleResource.mimeType).toBeUndefined();
      expect(simpleResource.uri).toBe('kanban://boards');
    });
  });

  describe('PromptDefinition', () => {
    it('should properly define prompt schemas', () => {
      const promptDef: PromptDefinition = {
        name: 'task_analysis',
        description: 'Analyze task dependencies and suggest improvements',
        arguments: [
          {
            name: 'task_id',
            description: 'ID of the task to analyze',
            required: true,
          },
          {
            name: 'include_subtasks',
            description: 'Whether to include subtask analysis',
            required: false,
          },
        ],
      };

      expect(promptDef.name).toBe('task_analysis');
      expect(promptDef.arguments).toHaveLength(2);
      expect(promptDef.arguments[0].required).toBe(true);
      expect(promptDef.arguments[1].required).toBe(false);
    });

    it('should handle prompts without arguments', () => {
      const simplePrompt: PromptDefinition = {
        name: 'project_summary',
        description: 'Generate a comprehensive project status summary',
        arguments: [],
      };

      expect(simplePrompt.arguments).toHaveLength(0);
      expect(simplePrompt.name).toBe('project_summary');
    });
  });

  describe('Type compatibility and integration', () => {
    it('should work correctly in service contexts', () => {
      // Simulate a tool service function
      function createMcpTool(definition: ToolDefinition): McpTool {
        return {
          definition,
          execute: async (call: ToolCall): Promise<McpToolResult> => ({
            content: [
              {
                type: 'text',
                text: `Executed ${String(String(call.name))} with ${String(String(Object.keys(call.arguments).length))} arguments`,
              },
            ],
            isError: false,
          }),
        };
      }

      const toolDef: ToolDefinition = {
        name: 'test_tool',
        description: 'Test tool for type checking',
        inputSchema: {
          type: 'object',
          properties: {
            param: { type: 'string' },
          },
          required: ['param'],
        },
      };

      const tool = createMcpTool(toolDef);
      expect(tool.definition.name).toBe('test_tool');
      expect(typeof tool.execute).toBe('function');
    });

    it('should properly handle response transformations', () => {
      function transformToMcpResponse<T>(data: T | null, error?: string): McpResponse<T> {
        if (error) {
          return {
            success: false,
            error: {
              code: 'OPERATION_FAILED',
              message: error,
            },
          };
        }

        if (data === null) {
          return {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Resource not found',
            },
          };
        }

        return {
          success: true,
          data,
        };
      }

      const successResult = transformToMcpResponse({ id: '1', name: 'Test' });
      const errorResult = transformToMcpResponse(null);
      const explicitErrorResult = transformToMcpResponse(null, 'Custom error');

      expect(successResult.success).toBe(true);
      expect(errorResult.success).toBe(false);
      expect(explicitErrorResult.success).toBe(false);

      if (successResult.success) {
        expect(successResult.data.id).toBe('1');
      }

      if (!errorResult.success) {
        expect(errorResult.error.code).toBe('NOT_FOUND');
      }
    });
  });
});
