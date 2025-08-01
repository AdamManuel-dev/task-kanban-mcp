/**
 * WebSocket message handler for real-time kanban operations
 *
 * @module websocket/handlers
 * @description Handles all WebSocket messages for real-time collaboration features including
 * task updates, board synchronization, user presence, and typing indicators. Provides
 * comprehensive permission checking and event broadcasting.
 *
 * @example
 * ```typescript
 * const handler = new MessageHandler(webSocketManager);
 *
 * // Handle incoming message
 * await handler.handleMessage(clientId, {
 *   type: 'update_task',
 *   id: 'msg123',
 *   payload: { taskId: 'task1', updates: { status: 'in_progress' } }
 * });
 * ```
 */

import type { UpdateBoardRequest } from '@/types';
import { dbConnection } from '../database/connection';
import { BoardService } from '../services/BoardService';
import { NoteService } from '../services/NoteService';
import { TagService } from '../services/TagService';
import type { CreateTaskRequest, UpdateTaskRequest } from '../services/TaskService';
import { TaskService } from '../services/TaskService';
import { logger } from '../utils/logger';
import type { WebSocketManager } from './server';
import type {
  MessageContext,
  SubscribeMessage,
  SubscriptionChannel,
  UnsubscribeMessage,
  UpdateSubtaskMessage,
  WebSocketMessage,
} from './types';

/**
 * Handles WebSocket messages for real-time kanban board collaboration
 *
 * @class MessageHandler
 * @description Central message handler that routes WebSocket messages to appropriate
 * service methods, manages permissions, and broadcasts updates to subscribed clients.
 * Supports all kanban operations including task CRUD, board updates, notes, tags,
 * and real-time collaboration features.
 *
 * @example
 * ```typescript
 * const handler = new MessageHandler(webSocketManager);
 *
 * // Message is automatically routed based on type
 * await handler.handleMessage('client123', {
 *   type: 'subscribe',
 *   id: 'msg1',
 *   payload: { channel: 'board:board1' }
 * });
 * ```
 */
export class MessageHandler {
  /** WebSocket server manager instance */
  private readonly webSocketManager: WebSocketManager;

  /** Task service for task operations */
  private readonly taskService: TaskService;

  /** Board service for board operations */
  private readonly boardService: BoardService;

  /** Note service for note operations */
  private readonly noteService: NoteService;

  /** Tag service for tag operations */
  private readonly tagService: TagService;

  /**
   * Creates a new MessageHandler instance
   *
   * @param {WebSocketManager} webSocketManager - WebSocket server manager
   */
  constructor(webSocketManager: WebSocketManager) {
    this.webSocketManager = webSocketManager;
    this.taskService = new TaskService(dbConnection);
    this.boardService = new BoardService(dbConnection);
    this.noteService = new NoteService(dbConnection);
    this.tagService = new TagService(dbConnection);
  }

  /**
   * Handles incoming WebSocket messages and routes them to appropriate handlers
   *
   * @param {string} clientId - Unique identifier of the client sending the message
   * @param {WebSocketMessage} message - The WebSocket message to handle
   * @returns {Promise<void>}
   *
   * @description Main entry point for all WebSocket messages. Creates a message context,
   * validates the client, and routes messages to specific handlers based on message type.
   * Handles errors gracefully and sends appropriate error responses.
   *
   * Supported message types:
   * - subscribe/unsubscribe: Channel subscription management
   * - ping: Connection keep-alive
   * - get_task/update_task/create_task/delete_task: Task operations
   * - get_board/update_board: Board operations
   * - add_note: Note creation
   * - assign_tag: Tag assignment
   * - user_presence: Presence updates
   * - typing_start/typing_stop: Typing indicators
   *
   * @example
   * ```typescript
   * await handler.handleMessage('client123', {
   *   type: 'create_task',
   *   id: 'msg456',
   *   payload: {
   *     title: 'New Task',
   *     board_id: 'board1',
   *     description: 'Task description'
   *   }
   * });
   * ```
   */
  async handleMessage(clientId: string, message: WebSocketMessage): Promise<void> {
    try {
      const client = this.webSocketManager.getClient(clientId);
      if (!client) {
        logger.warn('Message from unknown client', { clientId });
        return;
      }

      if (!message.payload) {
        this.webSocketManager.sendError(clientId, 'INVALID_REQUEST', 'Invalid payload', message.id);
        return;
      }

      const context: MessageContext = {
        clientId,
        client,
        message,
        subscriptionManager: this.webSocketManager.getSubscriptionManager(),
        webSocketManager: this.webSocketManager,
      } as MessageContext;

      logger.debug('Handling WebSocket message', {
        clientId,
        messageType: message.type,
        messageId: message.id,
      });

      // Route message to appropriate handler
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(context);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(context);
          break;

        case 'ping':
          this.handlePing(context);
          break;

        case 'get_task':
          await this.handleGetTask(context);
          break;

        case 'update_task':
          await this.handleUpdateTask(context);
          break;

        case 'create_task':
          await this.handleCreateTask(context);
          break;

        case 'delete_task':
          await this.handleDeleteTask(context);
          break;

        case 'get_board':
          await this.handleGetBoard(context);
          break;

        case 'update_board':
          await this.handleUpdateBoard(context);
          break;

        case 'add_note':
          await this.handleAddNote(context);
          break;

        case 'assign_tag':
          await this.handleAssignTag(context);
          break;

        case 'user_presence':
          this.handleUserPresence(context);
          break;

        case 'typing_start':
          this.handleTypingStart(context);
          break;

        case 'typing_stop':
          this.handleTypingStop(context);
          break;

        case 'add_dependency':
          await this.handleAddDependency(context);
          break;

        case 'remove_dependency':
          await this.handleRemoveDependency(context);
          break;

        case 'create_subtask':
          await this.handleCreateSubtask(context);
          break;

        case 'update_subtask':
          await this.handleUpdateSubtask(context);
          break;

        case 'delete_subtask':
          await this.handleDeleteSubtask(context);
          break;

        case 'bulk_operation':
          await this.handleBulkOperation(context);
          break;

        case 'filter_subscription':
          this.handleFilterSubscription(context);
          break;

        default:
          this.webSocketManager.sendError(
            clientId,
            'UNKNOWN_MESSAGE_TYPE',
            `Unknown message type: ${message.type}`,
            message.id
          );
      }
    } catch (error) {
      logger.error('Error handling WebSocket message', {
        clientId,
        messageType: message.type,
        messageId: message.id,
        error,
      });

      this.webSocketManager.sendError(
        clientId,
        'MESSAGE_HANDLER_ERROR',
        'Error processing message',
        message.id
      );
    }
  }

  /**
   * Handles channel subscription requests
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   *
   * @description Subscribes a client to a specific channel for receiving real-time updates.
   * Validates the subscription request and creates a new subscription with optional filters.
   *
   * Channel types:
   * - 'board:${boardId}': Updates for a specific board
   * - 'task:${taskId}': Updates for a specific task
   * - 'user:${userId}': Updates for a specific user
   * - 'presence': Global presence updates
   *
   * @example
   * ```typescript
   * // Client subscribes to board updates
   * // Message: { type: 'subscribe', payload: { channel: 'board:board1', filters: { status: 'active' } } }
   * ```
   */
  private handleSubscribe(context: MessageContext): void {
    const { clientId, message } = context;
    const payload = message.payload as SubscribeMessage['payload'];

    if (!payload.channel) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_SUBSCRIBE',
        'Channel is required for subscription',
        message.id
      );
      return;
    }

    const channel = payload.channel as SubscriptionChannel;
    const filters = payload.filters || {};

    const result = this.webSocketManager
      .getSubscriptionManager()
      .subscribe(clientId, channel, filters);

    if (result.success) {
      this.webSocketManager.sendToClient(clientId, {
        type: 'subscribe_success',
        id: message.id,
        payload: {
          subscriptionId: result.subscriptionId,
          channel,
          filters,
        },
      });

      logger.info('Client subscribed to channel', {
        clientId,
        channel,
        subscriptionId: result.subscriptionId,
      });
    } else {
      this.webSocketManager.sendError(
        clientId,
        'SUBSCRIBE_FAILED',
        result.error || 'Subscription failed',
        message.id
      );
    }
  }

  /**
   * Handles channel unsubscription requests
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   *
   * @description Removes a client's subscription to a specific channel.
   * Finds the existing subscription and removes it from the subscription manager.
   *
   * @example
   * ```typescript
   * // Client unsubscribes from board updates
   * // Message: { type: 'unsubscribe', payload: { channel: 'board:board1' } }
   * ```
   */
  private handleUnsubscribe(context: MessageContext): void {
    const { clientId, message } = context;
    const payload = message.payload as UnsubscribeMessage['payload'];

    if (!payload.channel) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_UNSUBSCRIBE',
        'Channel is required for unsubscription',
        message.id
      );
      return;
    }

    // Find and remove subscription
    const subscriptions = this.webSocketManager
      .getSubscriptionManager()
      .getClientSubscriptions(clientId);

    const subscription = subscriptions.find(sub => sub.channel === payload.channel);

    if (subscription) {
      const success = this.webSocketManager.getSubscriptionManager().unsubscribe(subscription.id);

      if (success) {
        this.webSocketManager.sendToClient(clientId, {
          type: 'unsubscribe_success',
          id: message.id,
          payload: {
            channel: payload.channel,
          },
        });
      } else {
        this.webSocketManager.sendError(
          clientId,
          'UNSUBSCRIBE_FAILED',
          'Failed to unsubscribe',
          message.id
        );
      }
    } else {
      this.webSocketManager.sendError(
        clientId,
        'SUBSCRIPTION_NOT_FOUND',
        'Subscription not found',
        message.id
      );
    }
  }

  /**
   * Handles ping messages for connection keep-alive
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   *
   * @description Responds to ping messages with a pong message containing
   * the current timestamp. Used for connection health monitoring and keep-alive.
   *
   * @example
   * ```typescript
   * // Client sends: { type: 'ping', id: 'ping123' }
   * // Server responds: { type: 'pong', id: 'ping123', payload: { timestamp: 1234567890 } }
   * ```
   */
  private handlePing(context: MessageContext): void {
    const { clientId, message } = context;
    this.webSocketManager.sendToClient(clientId, {
      type: 'pong',
      id: message.id,
      payload: { timestamp: Date.now() },
    });
  }

  /**
   * Handles task retrieval requests
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   * @returns {Promise<void>}
   *
   * @description Retrieves a specific task by ID and sends it back to the client.
   * Validates the task ID and handles errors appropriately.
   *
   * @example
   * ```typescript
   * // Client requests: { type: 'get_task', payload: { taskId: 'task123' } }
   * // Server responds: { type: 'get_task_success', payload: { task: {...} } }
   * ```
   */
  private async handleGetTask(context: MessageContext): Promise<void> {
    const { clientId, message } = context;
    const payload = message.payload as { taskId: string };

    if (!payload.taskId) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_GET_TASK',
        'Task ID is required',
        message.id
      );
      return;
    }

    try {
      const task = await this.taskService.getTaskById(payload.taskId);
      if (!task) {
        this.webSocketManager.sendError(clientId, 'TASK_NOT_FOUND', 'Task not found', message.id);
        return;
      }

      this.webSocketManager.sendToClient(clientId, {
        type: 'get_task_success',
        id: message.id,
        payload: { task },
      });
    } catch (error) {
      this.webSocketManager.sendError(
        clientId,
        'GET_TASK_FAILED',
        error instanceof Error ? error.message : 'Failed to get task',
        message.id
      );
    }
  }

  /**
   * Handles task update requests
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   * @returns {Promise<void>}
   *
   * @description Updates a task with provided changes and broadcasts the update
   * to all clients subscribed to the task channel. Validates update data and
   * handles errors appropriately.
   *
   * @example
   * ```typescript
   * // Client sends: { type: 'update_task', payload: { taskId: 'task123', updates: { status: 'done' } } }
   * // Server responds: { type: 'update_task_success', payload: { task: {...} } }
   * // Broadcasts: { type: 'task_updated', payload: { task: {...} } } to subscribers
   * ```
   */
  private async handleUpdateTask(context: MessageContext): Promise<void> {
    const { clientId, message } = context;
    const payload = message.payload as UpdateSubtaskMessage['payload'];

    if (!payload.taskId) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_UPDATE_TASK',
        'Task ID and updates are required',
        message.id
      );
      return;
    }

    try {
      const task = await this.taskService.updateTask(payload.taskId as string, payload.updates);

      this.webSocketManager.sendToClient(clientId, {
        type: 'update_task_success',
        id: message.id,
        payload: { task },
      });

      // Broadcast update to other clients subscribed to this task
      this.webSocketManager.broadcast({
        type: 'task_updated',
        payload: { task },
        id: message.id,
      });
    } catch (error) {
      this.webSocketManager.sendError(
        clientId,
        'UPDATE_TASK_FAILED',
        error instanceof Error ? error.message : 'Failed to update task',
        message.id
      );
    }
  }

  /**
   * Handles task creation requests
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   * @returns {Promise<void>}
   *
   * @description Creates a new task with provided data, checks write permissions,
   * and broadcasts the creation to all relevant subscribers. Validates required
   * fields (title and board_id) before creation.
   *
   * @example
   * ```typescript
   * // Client sends: {
   * //   type: 'create_task',
   * //   payload: { title: 'New Task', board_id: 'board1', description: 'Details' }
   * // }
   * // Server responds: { type: 'task_created_response', payload: { task: {...} } }
   * // Broadcasts creation event to board subscribers
   * ```
   */
  private async handleCreateTask(context: MessageContext): Promise<void> {
    const { clientId, client, message } = context;
    const taskData = message.payload as unknown as CreateTaskRequest | undefined;

    if (!taskData?.title || !taskData.board_id) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_REQUEST',
        'Title and board ID are required',
        message.id
      );
      return;
    }

    try {
      // Check permissions
      if (
        !client.permissions.has('write:all') &&
        !client.permissions.has(`write:board:${taskData.board_id}`)
      ) {
        this.webSocketManager.sendError(
          clientId,
          'INSUFFICIENT_PERMISSIONS',
          'Insufficient permissions to create task',
          message.id
        );
        return;
      }

      const newTask = await this.taskService.createTask(taskData);

      this.webSocketManager.sendToClient(clientId, {
        type: 'task_created_response',
        id: message.id,
        payload: { task: newTask },
      });

      // Broadcast creation to subscribers
      this.webSocketManager
        .getSubscriptionManager()
        .publishTaskCreated(newTask, client.user?.id || 'unknown');
    } catch (error) {
      logger.error('Error creating task', { taskData, error });
      this.webSocketManager.sendError(
        clientId,
        'TASK_CREATE_ERROR',
        'Error creating task',
        message.id
      );
    }
  }

  /**
   * Handles task deletion requests
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   * @returns {Promise<void>}
   *
   * @description Deletes a task after verifying it exists and checking delete
   * permissions. Broadcasts the deletion event to all relevant subscribers.
   *
   * @example
   * ```typescript
   * // Client sends: { type: 'delete_task', payload: { taskId: 'task123' } }
   * // Server responds: { type: 'task_deleted_response', payload: { taskId: 'task123' } }
   * // Broadcasts deletion event to board and task subscribers
   * ```
   */
  private async handleDeleteTask(context: MessageContext): Promise<void> {
    const { clientId, client, message } = context;
    const { taskId } = message.payload as { taskId: string };

    if (!taskId) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_REQUEST',
        'Task ID is required',
        message.id
      );
      return;
    }

    try {
      // Get task first to check permissions and get board ID
      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        this.webSocketManager.sendError(clientId, 'TASK_NOT_FOUND', 'Task not found', message.id);
        return;
      }

      // Check permissions
      if (
        !client.permissions.has('delete:all') &&
        !client.permissions.has(`delete:task:${taskId}`)
      ) {
        this.webSocketManager.sendError(
          clientId,
          'INSUFFICIENT_PERMISSIONS',
          'Insufficient permissions to delete task',
          message.id
        );
        return;
      }

      await this.taskService.deleteTask(taskId);

      this.webSocketManager.sendToClient(clientId, {
        type: 'task_deleted_response',
        id: message.id,
        payload: { taskId },
      });

      // Broadcast deletion to subscribers
      this.webSocketManager
        .getSubscriptionManager()
        .publishTaskDeleted(taskId, task.board_id, client.user?.id || 'unknown');
    } catch (error) {
      logger.error('Error deleting task', { taskId, error });
      this.webSocketManager.sendError(
        clientId,
        'TASK_DELETE_ERROR',
        'Error deleting task',
        message.id
      );
    }
  }

  /**
   * Handles board retrieval requests
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   * @returns {Promise<void>}
   *
   * @description Retrieves a board by ID after checking read permissions.
   * Sends the board data back to the requesting client.
   *
   * @example
   * ```typescript
   * // Client requests: { type: 'get_board', payload: { boardId: 'board123' } }
   * // Server responds: { type: 'board_data', payload: { board: {...} } }
   * ```
   */
  private async handleGetBoard(context: MessageContext): Promise<void> {
    const { clientId, client, message } = context;
    const { boardId } = message.payload as { boardId: string };

    if (!boardId) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_REQUEST',
        'Board ID is required',
        message.id
      );
      return;
    }

    try {
      // Check permissions
      if (!client.permissions.has('read:all') && !client.permissions.has(`read:board:${boardId}`)) {
        this.webSocketManager.sendError(
          clientId,
          'INSUFFICIENT_PERMISSIONS',
          'Insufficient permissions to read board',
          message.id
        );
        return;
      }

      const board = await this.boardService.getBoardById(boardId);

      if (!board) {
        this.webSocketManager.sendError(clientId, 'BOARD_NOT_FOUND', 'Board not found', message.id);
        return;
      }

      this.webSocketManager.sendToClient(clientId, {
        type: 'board_data',
        id: message.id,
        payload: { board },
      });
    } catch (error) {
      logger.error('Error getting board', { boardId, error });
      this.webSocketManager.sendError(
        clientId,
        'BOARD_FETCH_ERROR',
        'Error fetching board',
        message.id
      );
    }
  }

  /**
   * Handles board update requests
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   * @returns {Promise<void>}
   *
   * @description Updates a board with provided changes after checking write
   * permissions. Broadcasts the update to all board subscribers with change details.
   *
   * @example
   * ```typescript
   * // Client sends: {
   * //   type: 'update_board',
   * //   payload: { boardId: 'board123', updates: { title: 'New Title' } }
   * // }
   * // Server responds: { type: 'board_updated_response', payload: { board: {...} } }
   * // Broadcasts update event with changes to board subscribers
   * ```
   */
  private async handleUpdateBoard(context: MessageContext): Promise<void> {
    const { clientId, client, message } = context;
    const payload = message.payload as UpdateBoardRequest | undefined;

    if (!payload) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_REQUEST',
        'Board ID and updates are required',
        message.id
      );
      return;
    }

    try {
      // Check permissions
      if (
        !client.permissions.has('write:all') &&
        !client.permissions.has(`write:board:${(payload as { boardId?: string }).boardId}`)
      ) {
        this.webSocketManager.sendError(
          clientId,
          'INSUFFICIENT_PERMISSIONS',
          'Insufficient permissions to update board',
          message.id
        );
        return;
      }

      const updatedBoard = await this.boardService.updateBoard(message.id, payload);

      this.webSocketManager.sendToClient(clientId, {
        type: 'board_updated_response',
        id: message.id,
        payload: { board: updatedBoard },
      });

      // Broadcast update to subscribers
      this.webSocketManager.getSubscriptionManager().publishBoardUpdate(message.id, {
        id: message.id,
        type: 'board:updated',
        data: {
          board: updatedBoard,
          changes: payload as Record<string, unknown>,
          updatedBy: client.user?.id || 'unknown',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error updating board', { payload, error });
      this.webSocketManager.sendError(
        clientId,
        'BOARD_UPDATE_ERROR',
        'Error updating board',
        message.id
      );
    }
  }

  /**
   * Handles note addition requests
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   * @returns {Promise<void>}
   *
   * @description Creates a new note for a task after checking write permissions.
   * Broadcasts the note creation to relevant subscribers including task and board channels.
   *
   * @example
   * ```typescript
   * // Client sends: {
   * //   type: 'add_note',
   * //   payload: { content: 'Note text', task_id: 'task123' }
   * // }
   * // Server responds: { type: 'note_added_response', payload: { note: {...} } }
   * // Broadcasts note creation to task and board subscribers
   * ```
   */
  private async handleAddNote(context: MessageContext): Promise<void> {
    const { clientId, client, message } = context;
    const noteData = message.payload as { content: string; task_id: string } | undefined;

    if (!noteData?.content || !noteData.task_id) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_REQUEST',
        'Content and task ID are required',
        message.id
      );
      return;
    }

    try {
      // Check permissions
      if (
        !client.permissions.has('write:all') &&
        !client.permissions.has(`write:task:${noteData.task_id}`)
      ) {
        this.webSocketManager.sendError(
          clientId,
          'INSUFFICIENT_PERMISSIONS',
          'Insufficient permissions to add note',
          message.id
        );
        return;
      }

      const newNote = await this.noteService.createNote(noteData);

      this.webSocketManager.sendToClient(clientId, {
        type: 'note_added_response',
        id: message.id,
        payload: { note: newNote },
      });

      // Get task to find board ID for broadcasting
      const task = await this.taskService.getTaskById(noteData.task_id);
      if (task) {
        this.webSocketManager
          .getSubscriptionManager()
          .publishNoteAdded(newNote, noteData.task_id, task.board_id, client.user?.id || 'unknown');
      }
    } catch (error) {
      logger.error('Error adding note', { noteData, error });
      this.webSocketManager.sendError(clientId, 'NOTE_ADD_ERROR', 'Error adding note', message.id);
    }
  }

  /**
   * Handles tag assignment requests
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   * @returns {Promise<void>}
   *
   * @description Assigns a tag to a task after checking write permissions.
   * Broadcasts the tag assignment to relevant subscribers.
   *
   * @example
   * ```typescript
   * // Client sends: {
   * //   type: 'assign_tag',
   * //   payload: { taskId: 'task123', tagId: 'tag456' }
   * // }
   * // Server responds: { type: 'tag_assigned_response', payload: { taskId, tagId } }
   * // Broadcasts tag assignment to task and board subscribers
   * ```
   */
  private async handleAssignTag(context: MessageContext): Promise<void> {
    const { clientId, client, message } = context;
    const payload = message.payload as { taskId: string; tagId: string } | undefined;

    if (!payload) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_REQUEST',
        'Task ID and tag ID are required',
        message.id
      );
      return;
    }

    try {
      // Check permissions
      if (
        !client.permissions.has('write:all') &&
        !client.permissions.has(`write:task:${String(payload.taskId)}`)
      ) {
        this.webSocketManager.sendError(
          clientId,
          'INSUFFICIENT_PERMISSIONS',
          'Insufficient permissions to assign tag',
          message.id
        );
        return;
      }

      await this.tagService.addTagToTask(payload.taskId, payload.tagId);

      this.webSocketManager.sendToClient(clientId, {
        type: 'tag_assigned_response',
        id: message.id,
        payload: { taskId: payload.taskId, tagId: payload.tagId },
      });

      // Get task to find board ID for broadcasting
      const task = await this.taskService.getTaskById(payload.taskId);
      if (task) {
        this.webSocketManager
          .getSubscriptionManager()
          .publishTagAssigned(
            payload.taskId,
            payload.tagId,
            task.board_id,
            client.user?.id ?? 'unknown'
          );
      }
    } catch (error) {
      logger.error('Error assigning tag', { payload, error });
      this.webSocketManager.sendError(
        clientId,
        'TAG_ASSIGN_ERROR',
        'Error assigning tag',
        message.id
      );
    }
  }

  /**
   * Handles user presence updates
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   * @returns {Promise<void>}
   *
   * @description Updates and broadcasts user presence status (online, away, busy, offline).
   * Can include optional board or task context for location-specific presence.
   *
   * @example
   * ```typescript
   * // Client sends: {
   * //   type: 'user_presence',
   * //   payload: { status: 'online', boardId: 'board123' }
   * // }
   * // Server responds: { type: 'presence_updated', payload: { status: 'online' } }
   * // Broadcasts presence update to relevant subscribers
   * ```
   */
  private handleUserPresence(context: MessageContext): void {
    const { clientId, client, message } = context;
    const payload = message.payload as
      | {
          status: string;
          boardId: string;
          taskId: string;
        }
      | undefined;

    if (!payload || !client.user) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_REQUEST',
        'Status is required and user must be authenticated',
        message.id
      );
      return;
    }

    try {
      // Broadcast presence update
      this.webSocketManager
        .getSubscriptionManager()
        .publishUserPresence(client.user.id, payload.status as 'online' | 'offline' | 'away', {
          boardId: payload.boardId,
          taskId: payload.taskId,
          userId: client.user.id,
          timestamp: new Date().toISOString(),
        });

      this.webSocketManager.sendToClient(clientId, {
        type: 'presence_updated',
        id: message.id,
        payload: { status: payload.status },
      });
    } catch (error) {
      logger.error('Error updating user presence', { payload, error });
      this.webSocketManager.sendError(
        clientId,
        'PRESENCE_ERROR',
        'Error updating presence',
        message.id
      );
    }
  }

  /**
   * Handles typing start indicators
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   * @returns {Promise<void>}
   *
   * @description Broadcasts a typing start indicator to other users viewing
   * the same task or board. Used for real-time collaboration awareness.
   *
   * @example
   * ```typescript
   * // Client sends: {
   * //   type: 'typing_start',
   * //   payload: { taskId: 'task123', boardId: 'board123' }
   * // }
   * // Broadcasts typing indicator to task/board subscribers
   * ```
   */
  private handleTypingStart(context: MessageContext): void {
    const { client, message } = context;
    const payload = message.payload as { taskId: string; boardId: string } | undefined;

    if (!client.user) return;

    // Broadcast typing indicator
    this.webSocketManager
      .getSubscriptionManager()
      .publishTaskUpdate(
        String(payload?.taskId ?? 'unknown'),
        String(payload?.boardId ?? 'unknown'),
        {
          id: message.id,
          type: 'typing:start',
          data: {
            userId: client.user.id,
            taskId: payload?.taskId ?? 'unknown',
            boardId: payload?.boardId ?? 'unknown',
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        }
      );
  }

  /**
   * Handles typing stop indicators
   *
   * @private
   * @param {MessageContext} context - Message context with client and message data
   * @returns {Promise<void>}
   *
   * @description Broadcasts a typing stop indicator to other users viewing
   * the same task or board. Clears the typing indicator for the user.
   *
   * @example
   * ```typescript
   * // Client sends: {
   * //   type: 'typing_stop',
   * //   payload: { taskId: 'task123', boardId: 'board123' }
   * // }
   * // Broadcasts typing stop to task/board subscribers
   * ```
   */
  private handleTypingStop(context: MessageContext): void {
    const { client, message } = context;
    const payload = message.payload as { taskId: string; boardId: string } | undefined;

    if (!client.user) return;

    // Broadcast typing stop indicator
    this.webSocketManager
      .getSubscriptionManager()
      .publishTaskUpdate(
        String(payload?.taskId ?? 'unknown'),
        String(payload?.boardId ?? 'unknown'),
        {
          id: message.id,
          type: 'typing:stop',
          data: {
            userId: client.user.id,
            taskId: payload?.taskId ?? 'unknown',
            boardId: payload?.boardId ?? 'unknown',
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        }
      );
  }

  /**
   * Handle adding dependency between tasks
   */
  private async handleAddDependency(context: MessageContext): Promise<void> {
    const { message, clientId } = context;
    const payload = message.payload as
      | {
          taskId: string;
          dependsOnTaskId: string;
          dependencyType: string;
        }
      | undefined;

    try {
      const dependency = await this.taskService.addDependency(
        payload?.taskId ?? 'unknown',
        payload?.dependsOnTaskId ?? 'unknown',
        payload?.dependencyType as 'blocks' | 'relates_to' | 'duplicates' | undefined
      );

      // Get both tasks for the event
      const [task, dependsOnTask] = await Promise.all([
        this.taskService.getTaskById(payload?.taskId ?? 'unknown'),
        this.taskService.getTaskById(payload?.dependsOnTaskId ?? 'unknown'),
      ]);

      if (task && dependsOnTask) {
        // Broadcast dependency added event
        this.webSocketManager.broadcast({
          type: 'dependency:added',
          payload: {
            taskId: payload?.taskId ?? 'unknown',
            dependsOnTaskId: payload?.dependsOnTaskId ?? 'unknown',
            dependencyType: payload?.dependencyType || 'blocks',
            addedBy: clientId,
            boardId: task.board_id,
          },
          id: message.id,
        });
      }

      this.webSocketManager.sendSuccess(clientId, dependency, message.id);
    } catch (error) {
      this.webSocketManager.sendError(
        clientId,
        'DEPENDENCY_ADD_FAILED',
        `Failed to add dependency: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message.id
      );
    }
  }

  /**
   * Handle removing dependency between tasks
   */
  private async handleRemoveDependency(context: MessageContext): Promise<void> {
    const { message, clientId } = context;
    const payload = message.payload as
      | {
          taskId: string;
          dependsOnTaskId: string;
        }
      | undefined;

    try {
      // Get task info before removing
      const task = await this.taskService.getTaskById(payload?.taskId ?? 'unknown');

      await this.taskService.removeDependency(
        payload?.taskId ?? 'unknown',
        payload?.dependsOnTaskId ?? 'unknown'
      );

      if (task) {
        // Broadcast dependency removed event
        this.webSocketManager.broadcast({
          type: 'dependency:removed',
          payload: {
            taskId: payload?.taskId ?? 'unknown',
            dependsOnTaskId: payload?.dependsOnTaskId ?? 'unknown',
            removedBy: clientId,
            boardId: task.board_id,
          },
          id: message.id,
        });
      }

      this.webSocketManager.sendToClient(clientId, {
        type: 'dependency_removed_response',
        id: message.id,
        payload: { success: true },
      });
    } catch (error) {
      this.webSocketManager.sendError(
        clientId,
        'DEPENDENCY_REMOVE_FAILED',
        `Failed to remove dependency: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message.id
      );
    }
  }

  /**
   * Handle creating subtask
   */
  private async handleCreateSubtask(context: MessageContext): Promise<void> {
    const { message, clientId } = context;
    const payload = message.payload as
      | {
          due_date: Date;
          parentTaskId: string;
          title: string;
          description: string;
          priority: string;
          assignee: string;
        }
      | undefined;

    if (!payload) {
      this.webSocketManager.sendError(clientId, 'INVALID_REQUEST', 'Invalid payload', message.id);
      return;
    }

    try {
      // Get parent task info
      const parentTask = await this.taskService.getTaskById(payload.parentTaskId);
      if (!parentTask) {
        throw new Error('Parent task not found');
      }

      const subtask = await this.taskService.createTask({
        title: payload.title,
        description: payload.description,
        board_id: parentTask.board_id,
        column_id: parentTask.column_id,
        priority: (payload.priority || parentTask.priority) as number,
        assignee: payload.assignee,
        due_date: payload.due_date,
        parent_task_id: payload.parentTaskId,
      });

      // Calculate parent progress
      const parentProgress = await this.calculateParentProgress(payload.parentTaskId);

      // Broadcast subtask created event
      this.webSocketManager.broadcast({
        type: 'subtask:created',
        payload: {
          subtask,
          parentTaskId: payload.parentTaskId,
          createdBy: clientId,
          boardId: parentTask.board_id,
          parentProgress,
        },
        id: message.id,
      });

      this.webSocketManager.sendToClient(clientId, {
        type: 'subtask_created_response',
        id: message.id,
        payload: { success: true },
      });
    } catch (error) {
      this.webSocketManager.sendError(
        clientId,
        'SUBTASK_CREATE_FAILED',
        `Failed to create subtask: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message.id
      );
    }
  }

  /**
   * Handle updating subtask
   */
  private async handleUpdateSubtask(context: MessageContext): Promise<void> {
    const { message, clientId } = context;
    const payload = message.payload as
      | {
          subtaskId: string;
          updates: UpdateSubtaskMessage['payload'];
        }
      | undefined;

    if (!payload) {
      this.webSocketManager.sendError(clientId, 'INVALID_REQUEST', 'Invalid payload', message.id);
      return;
    }

    try {
      const existingSubtask = await this.taskService.getTaskById(payload.subtaskId);
      if (!existingSubtask?.parent_task_id) {
        throw new Error('Subtask not found');
      }

      const updatedSubtask = await this.taskService.updateTask(
        payload.subtaskId,
        payload.updates as UpdateTaskRequest
      );

      // Calculate parent progress
      const parentProgress = await this.calculateParentProgress(existingSubtask.parent_task_id);

      // Broadcast subtask updated event
      this.webSocketManager.broadcast({
        type: 'subtask:updated',
        payload: {
          subtask: updatedSubtask,
          changes: payload.updates,
          parentTaskId: existingSubtask.parent_task_id,
          updatedBy: clientId,
          boardId: updatedSubtask.board_id,
          parentProgress,
        },
        id: message.id,
      });

      this.webSocketManager.sendToClient(clientId, {
        type: 'subtask_updated_response',
        id: message.id,
        payload: { success: true },
      });
    } catch (error) {
      this.webSocketManager.sendError(
        clientId,
        'SUBTASK_UPDATE_FAILED',
        `Failed to update subtask: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message.id
      );
    }
  }

  /**
   * Handle deleting subtask
   */
  private async handleDeleteSubtask(context: MessageContext): Promise<void> {
    const { message, clientId } = context;
    const payload = message.payload as { subtaskId: string } | undefined;

    try {
      const subtask = await this.taskService.getTaskById(payload?.subtaskId ?? 'unknown');
      if (!subtask?.parent_task_id) {
        throw new Error('Subtask not found');
      }

      const parentTaskId = subtask.parent_task_id;
      const boardId = subtask.board_id;

      await this.taskService.deleteTask(payload?.subtaskId ?? 'unknown');

      // Calculate parent progress after deletion
      const parentProgress = await this.calculateParentProgress(parentTaskId);

      // Broadcast subtask deleted event
      this.webSocketManager.broadcast({
        type: 'subtask:deleted',
        payload: {
          subtaskId: payload?.subtaskId ?? 'unknown',
          parentTaskId,
          deletedBy: clientId,
          boardId,
          parentProgress,
        },
        id: message.id,
      });

      this.webSocketManager.sendToClient(clientId, {
        type: 'subtask_deleted_response',
        id: message.id,
        payload: { success: true },
      });
    } catch (error) {
      this.webSocketManager.sendError(
        clientId,
        'SUBTASK_DELETE_FAILED',
        `Failed to delete subtask: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message.id
      );
    }
  }

  /**
   * Handle bulk operations on multiple tasks
   */
  private async handleBulkOperation(context: MessageContext): Promise<void> {
    const { message, clientId } = context;
    const payload = message.payload as
      | {
          operation: string;
          taskIds: string[];
          changes: Record<string, unknown>;
        }
      | undefined;

    try {
      const results: unknown[] = [];
      let boardId = '';

      switch (payload?.operation) {
        case 'update':
          for (const taskId of payload.taskIds || []) {
            const task = await this.taskService.updateTask(taskId, payload.changes || {});
            results.push(task);
            if (!boardId) boardId = task.board_id;
          }
          break;

        case 'delete':
          for (const taskId of payload.taskIds) {
            const task = await this.taskService.getTaskById(taskId);
            if (task) {
              await this.taskService.deleteTask(taskId);
              if (!boardId) boardId = task.board_id;
            }
          }
          break;

        default:
          throw new Error(`Unsupported bulk operation: ${payload?.operation}`);
      }

      // Broadcast bulk operation event
      this.webSocketManager.broadcast({
        type: 'bulk:operation',
        payload: {
          operation: payload.operation,
          taskIds: payload.taskIds,
          changes: payload.changes,
          operatedBy: clientId,
          boardId,
          affectedCount: results.length,
        },
        id: message.id,
      });

      this.webSocketManager.sendToClient(clientId, {
        type: 'bulk_operation_response',
        id: message.id,
        payload: { success: true, affectedCount: results.length, results },
      });
    } catch (error) {
      this.webSocketManager.sendError(
        clientId,
        'BULK_OPERATION_FAILED',
        `Failed to perform bulk operation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message.id
      );
    }
  }

  /**
   * Handle filter subscription for client-side event filtering
   */
  private handleFilterSubscription(context: MessageContext): void {
    const { message, clientId } = context;
    const payload = message.payload as
      | {
          channel: string;
          filter: Record<string, unknown>;
        }
      | undefined;

    try {
      // Store filter preferences for this client
      context.subscriptionManager.setClientFilter(
        clientId,
        payload?.channel ?? 'unknown',
        payload?.filter ?? {}
      );

      this.webSocketManager.sendToClient(clientId, {
        type: 'filter_subscription_response',
        id: message.id,
        payload: { success: true },
      });
    } catch (error) {
      this.webSocketManager.sendError(
        clientId,
        'FILTER_SUBSCRIPTION_FAILED',
        `Failed to apply filter: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message.id
      );
    }
  }

  /**
   * Calculate progress percentage for parent task based on completed subtasks
   */
  private async calculateParentProgress(parentTaskId: string): Promise<number> {
    try {
      const taskWithSubtasks = await this.taskService.getTaskWithSubtasks(parentTaskId);
      if (!taskWithSubtasks?.subtasks) {
        return 0;
      }

      const totalSubtasks = taskWithSubtasks.subtasks.length;
      if (totalSubtasks === 0) return 0;

      const completedSubtasks = taskWithSubtasks.subtasks.filter(
        subtask => subtask.status === 'done'
      ).length;

      return Math.round((completedSubtasks / totalSubtasks) * 100);
    } catch (error) {
      logger.error('Failed to calculate parent progress', { parentTaskId, error });
      return 0;
    }
  }
}
