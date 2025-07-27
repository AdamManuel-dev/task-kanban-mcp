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

import { logger } from '../utils/logger';
import { TaskService } from '../services/TaskService';
import { BoardService } from '../services/BoardService';
import { NoteService } from '../services/NoteService';
import { TagService } from '../services/TagService';
import { dbConnection } from '../database/connection';
import type { WebSocketManager } from './server';
import type {
  WebSocketMessage,
  MessageContext,
  SubscriptionChannel,
  SubscribeMessage,
  UnsubscribeMessage,
  GetTaskMessage,
  UpdateTaskMessage,
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

      const context: MessageContext = {
        clientId,
        client,
        message,
        subscriptionManager: this.webSocketManager.getSubscriptionManager(),
        webSocketManager: this.webSocketManager,
      };

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
          await this.handleUserPresence(context);
          break;

        case 'typing_start':
          await this.handleTypingStart(context);
          break;

        case 'typing_stop':
          await this.handleTypingStop(context);
          break;

        default:
          this.webSocketManager.sendError(
            clientId,
            'UNKNOWN_MESSAGE_TYPE',
            `Unknown message type: ${String(String(message.type))}`,
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

    if (!payload?.channel) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_SUBSCRIBE',
        'Channel is required for subscription',
        message.id
      );
      return;
    }

    const channel = payload.channel as SubscriptionChannel;
    const filters = payload.filters ?? {};

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
        result.error ?? 'Subscription failed',
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

    if (!payload?.channel) {
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
    const payload = message.payload as GetTaskMessage['payload'];

    if (!payload?.taskId) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_GET_TASK',
        'Task ID is required',
        message.id
      );
      return;
    }

    try {
      const task = await this.taskService.getTasks(payload.taskId);
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
    const payload = message.payload as UpdateTaskMessage['payload'];

    if (!payload?.taskId || !payload?.updates) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_UPDATE_TASK',
        'Task ID and updates are required',
        message.id
      );
      return;
    }

    try {
      const task = await this.taskService.updateTask(payload.taskId, payload.updates);

      this.webSocketManager.sendToClient(clientId, {
        type: 'update_task_success',
        id: message.id,
        payload: { task },
      });

      // Broadcast update to other clients subscribed to this task
      this.webSocketManager.broadcastToChannel(`task:${payload.taskId}`, {
        type: 'task_updated',
        payload: { task },
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
    const taskData = message.payload;

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
        !client.permissions.has(`write:board:${String(String(taskData.board_id))}`)
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
        .publishTaskCreated(newTask, client.user?.id ?? 'unknown');
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
    const { taskId } = message.payload;

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
        !client.permissions.has(`delete:task:${String(taskId)}`)
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
        .publishTaskDeleted(taskId, task.board_id, client.user?.id ?? 'unknown');
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
    const { boardId } = message.payload;

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
      if (
        !client.permissions.has('read:all') &&
        !client.permissions.has(`read:board:${String(boardId)}`)
      ) {
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
    const { boardId, updates } = message.payload;

    if (!boardId || !updates) {
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
        !client.permissions.has(`write:board:${String(boardId)}`)
      ) {
        this.webSocketManager.sendError(
          clientId,
          'INSUFFICIENT_PERMISSIONS',
          'Insufficient permissions to update board',
          message.id
        );
        return;
      }

      const updatedBoard = await this.boardService.updateBoard(boardId, updates);

      this.webSocketManager.sendToClient(clientId, {
        type: 'board_updated_response',
        id: message.id,
        payload: { board: updatedBoard },
      });

      // Broadcast update to subscribers
      this.webSocketManager.getSubscriptionManager().publishBoardUpdate(boardId, {
        type: 'board:updated',
        data: {
          board: updatedBoard,
          changes: updates,
          updatedBy: client.user?.id ?? 'unknown',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error updating board', { boardId, updates, error });
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
    const noteData = message.payload;

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
        !client.permissions.has(`write:task:${String(String(noteData.task_id))}`)
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
          .publishNoteAdded(newNote, noteData.task_id, task.board_id, client.user?.id ?? 'unknown');
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
    const { taskId, tagId } = message.payload;

    if (!taskId || !tagId) {
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
        !client.permissions.has(`write:task:${String(taskId)}`)
      ) {
        this.webSocketManager.sendError(
          clientId,
          'INSUFFICIENT_PERMISSIONS',
          'Insufficient permissions to assign tag',
          message.id
        );
        return;
      }

      await this.tagService.addTagToTask(taskId, tagId);

      this.webSocketManager.sendToClient(clientId, {
        type: 'tag_assigned_response',
        id: message.id,
        payload: { taskId, tagId },
      });

      // Get task to find board ID for broadcasting
      const task = await this.taskService.getTaskById(taskId);
      if (task) {
        this.webSocketManager
          .getSubscriptionManager()
          .publishTagAssigned(taskId, tagId, task.board_id, client.user?.id ?? 'unknown');
      }
    } catch (error) {
      logger.error('Error assigning tag', { taskId, tagId, error });
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
    const { status, boardId, taskId } = message.payload;

    if (!status || !client.user) {
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
      this.webSocketManager.getSubscriptionManager().publishUserPresence(client.user.id, status, {
        boardId,
        taskId,
        userId: client.user.id,
        timestamp: new Date().toISOString(),
      });

      this.webSocketManager.sendToClient(clientId, {
        type: 'presence_updated',
        id: message.id,
        payload: { status },
      });
    } catch (error) {
      logger.error('Error updating user presence', { status, boardId, taskId, error });
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
    const { taskId, boardId } = message.payload;

    if (!client.user) {
      return;
    }

    // Broadcast typing indicator
    this.webSocketManager
      .getSubscriptionManager()
      .publishTaskUpdate(String(taskId ?? 'unknown'), String(boardId ?? 'unknown'), {
        type: 'typing:start',
        data: {
          userId: client.user.id,
          taskId,
          boardId,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
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
    const { taskId, boardId } = message.payload;

    if (!client.user) {
      return;
    }

    // Broadcast typing stop indicator
    this.webSocketManager
      .getSubscriptionManager()
      .publishTaskUpdate(String(taskId ?? 'unknown'), String(boardId ?? 'unknown'), {
        type: 'typing:stop',
        data: {
          userId: client.user.id,
          taskId,
          boardId,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
  }
}
