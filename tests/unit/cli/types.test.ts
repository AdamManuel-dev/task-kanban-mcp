/**
 * Unit tests for CLI Types
 *
 * @description Tests for CLI type definitions and interfaces
 */

import type {
  ApiResponse,
  ApiError,
  TaskData,
  BoardData,
  PaginatedResponse,
  HealthStatus,
  TaskCreateRequest,
  TaskUpdateRequest,
  SearchRequest,
} from '@/cli/types';

describe('CLI Types', () => {
  describe('ApiResponse', () => {
    it('should properly type successful API responses', () => {
      const successResponse: ApiResponse<string> = {
        success: true,
        data: 'operation completed',
        timestamp: new Date().toISOString(),
      };

      expect(successResponse.success).toBe(true);
      expect(successResponse.data).toBe('operation completed');
      expect(successResponse.timestamp).toBeDefined();
    });

    it('should properly type error API responses', () => {
      const errorResponse: ApiResponse<string> = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          details: { field: 'title', issue: 'required' },
        },
        timestamp: new Date().toISOString(),
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.details).toMatchObject({
        field: 'title',
        issue: 'required',
      });
    });

    it('should support generic typing for data', () => {
      interface CustomData {
        id: number;
        items: string[];
      }

      const typedResponse: ApiResponse<CustomData> = {
        success: true,
        data: {
          id: 123,
          items: ['item1', 'item2'],
        },
        timestamp: new Date().toISOString(),
      };

      expect(typedResponse.data.id).toBe(123);
      expect(typedResponse.data.items).toHaveLength(2);
    });
  });

  describe('ApiError', () => {
    it('should structure basic error information', () => {
      const error: ApiError = {
        code: 'TASK_NOT_FOUND',
        message: 'Task with ID task-123 not found',
      };

      expect(error.code).toBe('TASK_NOT_FOUND');
      expect(error.message).toContain('task-123');
    });

    it('should support detailed error information', () => {
      const detailedError: ApiError = {
        code: 'VALIDATION_ERROR',
        message: 'Multiple validation errors occurred',
        details: {
          errors: [
            { field: 'title', message: 'Title is required' },
            { field: 'board_id', message: 'Invalid board ID format' },
          ],
          requestId: 'req-12345',
        },
      };

      expect(detailedError.details).toBeDefined();
      expect(detailedError.details.errors).toHaveLength(2);
      expect(detailedError.details.requestId).toBe('req-12345');
    });
  });

  describe('TaskData', () => {
    it('should properly structure task information', () => {
      const task: TaskData = {
        id: 'task-123',
        title: 'Implement user authentication',
        description: 'Add JWT-based authentication system',
        status: 'in_progress',
        priority: 7,
        board_id: 'board-456',
        column_id: 'column-789',
        position: 0,
        assignee: 'developer@example.com',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T14:30:00Z',
        archived: false,
      };

      expect(task.id).toBe('task-123');
      expect(task.title).toBe('Implement user authentication');
      expect(task.status).toBe('in_progress');
      expect(task.priority).toBe(7);
      expect(task.archived).toBe(false);
    });

    it('should handle optional fields correctly', () => {
      const minimalTask: TaskData = {
        id: 'task-minimal',
        title: 'Simple task',
        status: 'todo',
        priority: 1,
        board_id: 'board-123',
        column_id: 'column-456',
        position: 0,
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        archived: false,
      };

      expect(minimalTask.description).toBeUndefined();
      expect(minimalTask.assignee).toBeUndefined();
      expect(minimalTask.due_date).toBeUndefined();
    });
  });

  describe('BoardData', () => {
    it('should properly structure board information', () => {
      const board: BoardData = {
        id: 'board-123',
        name: 'Development Sprint',
        description: 'Current development sprint board',
        color: '#2196F3',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        archived: false,
      };

      expect(board.id).toBe('board-123');
      expect(board.name).toBe('Development Sprint');
      expect(board.color).toBe('#2196F3');
      expect(board.archived).toBe(false);
    });

    it('should handle optional description', () => {
      const simpleBoard: BoardData = {
        id: 'board-simple',
        name: 'Simple Board',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        archived: false,
      };

      expect(simpleBoard.description).toBeUndefined();
      expect(simpleBoard.color).toBeUndefined();
    });
  });

  describe('Request Types', () => {
    describe('TaskCreateRequest', () => {
      it('should properly structure task creation requests', () => {
        const createRequest: TaskCreateRequest = {
          title: 'New Feature Implementation',
          description: 'Implement the new user dashboard feature',
          board_id: 'board-123',
          column_id: 'column-456',
          priority: 8,
          assignee: 'dev@example.com',
          due_date: '2024-02-01T00:00:00Z',
        };

        expect(createRequest.title).toBe('New Feature Implementation');
        expect(createRequest.board_id).toBe('board-123');
        expect(createRequest.priority).toBe(8);
      });

      it('should require only essential fields', () => {
        const minimalRequest: TaskCreateRequest = {
          title: 'Minimal Task',
          board_id: 'board-123',
          column_id: 'column-456',
        };

        expect(minimalRequest.title).toBe('Minimal Task');
        expect(minimalRequest.description).toBeUndefined();
        expect(minimalRequest.priority).toBeUndefined();
      });
    });

    describe('TaskUpdateRequest', () => {
      it('should allow partial updates', () => {
        const updateRequest: TaskUpdateRequest = {
          title: 'Updated Task Title',
          status: 'done',
          priority: 9,
        };

        expect(updateRequest.title).toBe('Updated Task Title');
        expect(updateRequest.status).toBe('done');
        expect(updateRequest.description).toBeUndefined();
      });

      it('should handle empty update requests', () => {
        const emptyUpdate: TaskUpdateRequest = {};
        expect(Object.keys(emptyUpdate as Record<string, unknown>)).toHaveLength(0);
      });
    });

    describe('SearchRequest', () => {
      it('should properly structure search requests', () => {
        const searchRequest: SearchRequest = {
          query: 'authentication jwt login',
          filters: {
            board_id: 'board-123',
            status: 'in_progress',
            tags: ['feature', 'security'],
          },
          limit: 25,
          offset: 0,
        };

        expect(searchRequest.query).toBe('authentication jwt login');
        expect(searchRequest.filters?.board_id).toBe('board-123');
        expect(searchRequest.filters?.tags).toContain('feature');
        expect(searchRequest.limit).toBe(25);
      });

      it('should handle simple queries', () => {
        const simpleSearch: SearchRequest = {
          query: 'bug fix',
        };

        expect(simpleSearch.query).toBe('bug fix');
        expect(simpleSearch.filters).toBeUndefined();
        expect(simpleSearch.limit).toBeUndefined();
      });
    });
  });

  describe('PaginatedResponse', () => {
    it('should properly structure paginated results', () => {
      const paginatedTasks: PaginatedResponse<TaskData> = {
        data: [
          {
            id: 'task-1',
            title: 'Task 1',
            status: 'todo',
            priority: 1,
            board_id: 'board-1',
            column_id: 'column-1',
            position: 0,
            created_at: '2024-01-15T10:00:00Z',
            updated_at: '2024-01-15T10:00:00Z',
            archived: false,
          },
          {
            id: 'task-2',
            title: 'Task 2',
            status: 'in_progress',
            priority: 2,
            board_id: 'board-1',
            column_id: 'column-2',
            position: 0,
            created_at: '2024-01-15T11:00:00Z',
            updated_at: '2024-01-15T11:00:00Z',
            archived: false,
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 45,
          totalPages: 3,
          hasNext: true,
          hasPrevious: false,
        },
      };

      expect(paginatedTasks.data).toHaveLength(2);
      expect(paginatedTasks.pagination.total).toBe(45);
      expect(paginatedTasks.pagination.totalPages).toBe(3);
      expect(paginatedTasks.pagination.hasNext).toBe(true);
    });
  });

  describe('Status Types', () => {
    describe('HealthStatus', () => {
      it('should structure health check results', () => {
        const healthStatus: HealthStatus = {
          status: 'healthy',
          timestamp: '2024-01-15T10:00:00Z',
          uptime: 86400, // 24 hours in seconds
          version: '1.2.3',
          database: {
            connected: true,
            responseTime: 15,
            lastCheck: '2024-01-15T10:00:00Z',
          },
          websocket: {
            active: true,
            connections: 5,
            lastActivity: '2024-01-15T09:58:00Z',
          },
        };

        expect(healthStatus.status).toBe('healthy');
        expect(healthStatus.database.connected).toBe(true);
        expect(healthStatus.websocket.connections).toBe(5);
      });

      it('should handle unhealthy status', () => {
        const unhealthyStatus: HealthStatus = {
          status: 'unhealthy',
          timestamp: '2024-01-15T10:00:00Z',
          uptime: 1200,
          version: '1.2.3',
          database: {
            connected: false,
            responseTime: 5000,
            lastCheck: '2024-01-15T10:00:00Z',
            error: 'Connection timeout',
          },
          websocket: {
            active: false,
            connections: 0,
            lastActivity: '2024-01-15T09:00:00Z',
            error: 'WebSocket server not responding',
          },
        };

        expect(unhealthyStatus.status).toBe('unhealthy');
        expect(unhealthyStatus.database.error).toBe('Connection timeout');
        expect(unhealthyStatus.websocket.error).toBe('WebSocket server not responding');
      });
    });
  });

  describe('Type integration and compatibility', () => {
    it('should work correctly in API client contexts', () => {
      // Simulate API client method
      async function fetchTasks(options?: {
        board_id?: string;
        limit?: number;
      }): Promise<ApiResponse<TaskData[]>> {
        // Mock implementation
        return {
          success: true,
          data: [
            {
              id: 'task-test',
              title: 'Test Task',
              status: 'todo',
              priority: 1,
              board_id: options?.board_id || 'default-board',
              column_id: 'column-1',
              position: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              archived: false,
            },
          ],
          timestamp: new Date().toISOString(),
        };
      }

      // Type checking should work correctly
      const response = fetchTasks({ board_id: 'board-123', limit: 10 });
      expect(response).resolves.toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('should support transformation between types', () => {
      function transformTaskData(taskCreate: TaskCreateRequest, id: string): TaskData {
        return {
          id,
          title: taskCreate.title,
          description: taskCreate.description,
          status: 'todo',
          priority: taskCreate.priority || 1,
          board_id: taskCreate.board_id,
          column_id: taskCreate.column_id,
          position: taskCreate.position || 0,
          assignee: taskCreate.assignee,
          due_date: taskCreate.due_date,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          archived: false,
        };
      }

      const createRequest: TaskCreateRequest = {
        title: 'Transform Test',
        board_id: 'board-123',
        column_id: 'column-456',
        priority: 5,
      };

      const taskData = transformTaskData(createRequest, 'task-generated');
      expect(taskData.id).toBe('task-generated');
      expect(taskData.title).toBe('Transform Test');
      expect(taskData.status).toBe('todo');
      expect(taskData.priority).toBe(5);
    });
  });
});
