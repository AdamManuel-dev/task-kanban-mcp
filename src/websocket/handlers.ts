import { logger } from '@/utils/logger';
import { TaskService } from '@/services/TaskService';
import { BoardService } from '@/services/BoardService';
import { NoteService } from '@/services/NoteService';
import { TagService } from '@/services/TagService';
import { dbConnection } from '@/database/connection';
import type { WebSocketManager } from './server';
import type {
  WebSocketMessage,
  MessageContext,
  SubscriptionChannel,
  SubscribeMessage,
  UnsubscribeMessage,
} from './types';

export class MessageHandler {
  private readonly webSocketManager: WebSocketManager;

  private readonly taskService: TaskService;

  private readonly boardService: BoardService;

  private readonly noteService: NoteService;

  private readonly tagService: TagService;

  constructor(webSocketManager: WebSocketManager) {
    this.webSocketManager = webSocketManager;
    this.taskService = new TaskService(dbConnection);
    this.boardService = new BoardService(dbConnection);
    this.noteService = new NoteService(dbConnection);
    this.tagService = new TagService(dbConnection);
  }

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
          await this.handleSubscribe(context);
          break;

        case 'unsubscribe':
          await this.handleUnsubscribe(context);
          break;

        case 'ping':
          await this.handlePing(context);
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

  private async handleSubscribe(context: MessageContext): Promise<void> {
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

  private async handleUnsubscribe(context: MessageContext): Promise<void> {
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

  private async handlePing(context: MessageContext): Promise<void> {
    const { clientId, message } = context;

    this.webSocketManager.sendToClient(clientId, {
      type: 'pong',
      id: message.id,
      payload: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async handleGetTask(context: MessageContext): Promise<void> {
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
      // Check permissions
      if (!client.permissions.has('read:all') && !client.permissions.has(`read:task:${taskId}`)) {
        this.webSocketManager.sendError(
          clientId,
          'INSUFFICIENT_PERMISSIONS',
          'Insufficient permissions to read task',
          message.id
        );
        return;
      }

      const task = await this.taskService.getTaskById(taskId);

      if (!task) {
        this.webSocketManager.sendError(clientId, 'TASK_NOT_FOUND', 'Task not found', message.id);
        return;
      }

      this.webSocketManager.sendToClient(clientId, {
        type: 'task_data',
        id: message.id,
        payload: { task },
      });
    } catch (error) {
      logger.error('Error getting task', { taskId, error });
      this.webSocketManager.sendError(
        clientId,
        'TASK_FETCH_ERROR',
        'Error fetching task',
        message.id
      );
    }
  }

  private async handleUpdateTask(context: MessageContext): Promise<void> {
    const { clientId, client, message } = context;
    const { taskId, updates } = message.payload;

    if (!taskId || !updates) {
      this.webSocketManager.sendError(
        clientId,
        'INVALID_REQUEST',
        'Task ID and updates are required',
        message.id
      );
      return;
    }

    try {
      // Check permissions
      if (!client.permissions.has('write:all') && !client.permissions.has(`write:task:${taskId}`)) {
        this.webSocketManager.sendError(
          clientId,
          'INSUFFICIENT_PERMISSIONS',
          'Insufficient permissions to update task',
          message.id
        );
        return;
      }

      const updatedTask = await this.taskService.updateTask(taskId, updates);

      this.webSocketManager.sendToClient(clientId, {
        type: 'task_updated_response',
        id: message.id,
        payload: { task: updatedTask },
      });

      // Broadcast update to subscribers
      this.webSocketManager
        .getSubscriptionManager()
        .publishTaskUpdated(updatedTask, updates, client.user?.id || 'unknown');
    } catch (error) {
      logger.error('Error updating task', { taskId, updates, error });
      this.webSocketManager.sendError(
        clientId,
        'TASK_UPDATE_ERROR',
        'Error updating task',
        message.id
      );
    }
  }

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
        !client.permissions.has(`write:board:${boardId}`)
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
        type: 'board_updated',
        board: updatedBoard,
        changes: updates,
        updatedBy: client.user?.id || 'unknown',
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
      if (!client.permissions.has('write:all') && !client.permissions.has(`write:task:${taskId}`)) {
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
          .publishTagAssigned(taskId, tagId, task.board_id, client.user?.id || 'unknown');
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

  private async handleUserPresence(context: MessageContext): Promise<void> {
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
      this.webSocketManager
        .getSubscriptionManager()
        .publishUserPresence(client.user.id, status, { boardId, taskId });

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

  private async handleTypingStart(context: MessageContext): Promise<void> {
    const { client, message } = context;
    const { taskId, boardId } = message.payload;

    if (!client.user) {
      return;
    }

    // Broadcast typing indicator
    this.webSocketManager
      .getSubscriptionManager()
      .publishTaskUpdate(taskId || 'unknown', boardId || 'unknown', {
        type: 'typing_start',
        userId: client.user.id,
        taskId,
        boardId,
        timestamp: new Date().toISOString(),
      });
  }

  private async handleTypingStop(context: MessageContext): Promise<void> {
    const { client, message } = context;
    const { taskId, boardId } = message.payload;

    if (!client.user) {
      return;
    }

    // Broadcast typing stop indicator
    this.webSocketManager
      .getSubscriptionManager()
      .publishTaskUpdate(taskId || 'unknown', boardId || 'unknown', {
        type: 'typing_stop',
        userId: client.user.id,
        taskId,
        boardId,
        timestamp: new Date().toISOString(),
      });
  }
}
