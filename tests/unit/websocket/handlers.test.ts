/**
 * @fileoverview Unit tests for WebSocket handlers
 * @lastmodified 2025-07-28T07:22:00Z
 *
 * Features: WebSocket message handling, task operations, error handling
 * Main APIs: handleMessage(), taskHandlers, errorHandling
 * Constraints: Requires WebSocket mock, database mocks
 * Patterns: Event-driven handlers, async operations with proper error handling
 */

import { jest } from '@jest/globals';
import { MessageHandler } from '@/websocket/handlers';
import { TaskService } from '@/services/TaskService';
import { BoardService } from '@/services/BoardService';
import { logger } from '@/utils/logger';

// Mock dependencies
jest.mock('@/services/TaskService');
jest.mock('@/services/BoardService');
jest.mock('@/utils/logger');

const mockTaskService = jest.mocked(TaskService);
const mockBoardService = jest.mocked(BoardService);

describe('MessageHandler', () => {
  let handlers: MessageHandler;
  let mockWebSocket: any;
  let mockBroadcast: jest.MockedFunction<any>;

  beforeEach(() => {
    mockWebSocket = {
      send: jest.fn(),
      readyState: 1, // WebSocket.OPEN
      id: 'test-socket-id',
      userId: 'test-user-id',
    };

    mockBroadcast = jest.fn();
    handlers = new MessageHandler(mockBroadcast);

    jest.clearAllMocks();
  });

  describe('Task Operations', () => {
    test('should handle task creation messages', async () => {
      const mockTask = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test Description',
        status: 'todo',
        board_id: 'board-1',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockTaskService.prototype.createTask = jest.fn().mockResolvedValue(mockTask);

      const message = {
        type: 'task:create',
        data: {
          title: 'Test Task',
          description: 'Test Description',
          board_id: 'board-1',
        },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockTaskService.prototype.createTask).toHaveBeenCalledWith(message.data);
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: 'task:created',
        data: mockTask,
      });
    });

    test('should handle task update messages', async () => {
      const mockTask = {
        id: 'task-1',
        title: 'Updated Task',
        status: 'in-progress',
        board_id: 'board-1',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockTaskService.prototype.updateTask = jest.fn().mockResolvedValue(mockTask);

      const message = {
        type: 'task:update',
        data: {
          id: 'task-1',
          title: 'Updated Task',
          status: 'in-progress',
        },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockTaskService.prototype.updateTask).toHaveBeenCalledWith('task-1', {
        title: 'Updated Task',
        status: 'in-progress',
      });
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: 'task:updated',
        data: mockTask,
      });
    });

    test('should handle task deletion messages', async () => {
      mockTaskService.prototype.deleteTask = jest.fn().mockResolvedValue(true);

      const message = {
        type: 'task:delete',
        data: { id: 'task-1' },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockTaskService.prototype.deleteTask).toHaveBeenCalledWith('task-1');
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: 'task:deleted',
        data: { id: 'task-1' },
      });
    });

    test('should handle task status changes', async () => {
      const mockTask = {
        id: 'task-1',
        title: 'Test Task',
        status: 'done',
        board_id: 'board-1',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockTaskService.prototype.updateTask = jest.fn().mockResolvedValue(mockTask);

      const message = {
        type: 'task:status',
        data: {
          id: 'task-1',
          status: 'done',
        },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockTaskService.prototype.updateTask).toHaveBeenCalledWith('task-1', {
        status: 'done',
      });
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: 'task:updated',
        data: mockTask,
      });
    });
  });

  describe('Board Operations', () => {
    test('should handle board creation messages', async () => {
      const mockBoard = {
        id: 'board-1',
        name: 'Test Board',
        description: 'Test Description',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockBoardService.prototype.createBoard = jest.fn().mockResolvedValue(mockBoard);

      const message = {
        type: 'board:create',
        data: {
          name: 'Test Board',
          description: 'Test Description',
        },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockBoardService.prototype.createBoard).toHaveBeenCalledWith(message.data);
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: 'board:created',
        data: mockBoard,
      });
    });

    test('should handle board updates', async () => {
      const mockBoard = {
        id: 'board-1',
        name: 'Updated Board',
        description: 'Updated Description',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockBoardService.prototype.updateBoard = jest.fn().mockResolvedValue(mockBoard);

      const message = {
        type: 'board:update',
        data: {
          id: 'board-1',
          name: 'Updated Board',
          description: 'Updated Description',
        },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockBoardService.prototype.updateBoard).toHaveBeenCalledWith('board-1', {
        name: 'Updated Board',
        description: 'Updated Description',
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid message types', async () => {
      const message = {
        type: 'invalid:type',
        data: {},
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'error',
          data: {
            message: 'Unknown message type: invalid:type',
            code: 'UNKNOWN_MESSAGE_TYPE',
          },
        })
      );
    });

    test('should handle service errors gracefully', async () => {
      const serviceError = new Error('Service error');
      mockTaskService.prototype.createTask = jest.fn().mockRejectedValue(serviceError);

      const message = {
        type: 'task:create',
        data: {
          title: 'Test Task',
          board_id: 'board-1',
        },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'error',
          data: {
            message: 'Failed to create task',
            code: 'TASK_CREATE_FAILED',
            details: serviceError.message,
          },
        })
      );
    });

    test('should handle malformed messages', async () => {
      const message = {
        // Missing type field
        data: { title: 'Test Task' },
      };

      await handlers.handleMessage(mockWebSocket, message as any);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'error',
          data: {
            message: 'Invalid message format',
            code: 'INVALID_MESSAGE_FORMAT',
          },
        })
      );
    });

    test('should handle missing data field', async () => {
      const message = {
        type: 'task:create',
        // Missing data field
      };

      await handlers.handleMessage(mockWebSocket, message as any);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'error',
          data: {
            message: 'Missing message data',
            code: 'MISSING_MESSAGE_DATA',
          },
        })
      );
    });
  });

  describe('Real-time Subscriptions', () => {
    test('should handle board subscription', async () => {
      const message = {
        type: 'subscribe:board',
        data: { board_id: 'board-1' },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscription:confirmed',
          data: { board_id: 'board-1' },
        })
      );
    });

    test('should handle task subscription', async () => {
      const message = {
        type: 'subscribe:task',
        data: { task_id: 'task-1' },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscription:confirmed',
          data: { task_id: 'task-1' },
        })
      );
    });

    test('should handle unsubscribe messages', async () => {
      const message = {
        type: 'unsubscribe:board',
        data: { board_id: 'board-1' },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'unsubscription:confirmed',
          data: { board_id: 'board-1' },
        })
      );
    });
  });

  describe('Message Validation', () => {
    test('should validate required fields for task creation', async () => {
      const message = {
        type: 'task:create',
        data: {
          // Missing required title field
          board_id: 'board-1',
        },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'error',
          data: {
            message: 'Missing required field: title',
            code: 'VALIDATION_ERROR',
          },
        })
      );
    });

    test('should validate field types', async () => {
      const message = {
        type: 'task:create',
        data: {
          title: 123, // Should be string
          board_id: 'board-1',
        },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'error',
          data: {
            message: 'Invalid field type: title must be string',
            code: 'VALIDATION_ERROR',
          },
        })
      );
    });
  });

  describe('Connection Handling', () => {
    test('should handle closed connections gracefully', async () => {
      mockWebSocket.readyState = 3; // WebSocket.CLOSED

      const message = {
        type: 'task:create',
        data: { title: 'Test Task', board_id: 'board-1' },
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(mockWebSocket.send).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('Attempted to send message to closed connection');
    });

    test('should handle connection errors', async () => {
      mockWebSocket.send = jest.fn().mockImplementation(() => {
        throw new Error('Connection error');
      });

      const message = {
        type: 'invalid:type',
        data: {},
      };

      await handlers.handleMessage(mockWebSocket, message);

      expect(logger.error).toHaveBeenCalledWith('Failed to send WebSocket message', {
        error: expect.any(Error),
        socketId: 'test-socket-id',
      });
    });
  });
});
