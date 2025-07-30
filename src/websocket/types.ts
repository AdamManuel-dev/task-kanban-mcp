import type { WebSocket } from 'ws';
import type { SubscriptionManager } from './subscriptions';
import type { WebSocketManager } from './server';

export interface WebSocketMessage {
  type: string;
  id: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

export interface WebSocketClient {
  id: string;
  ws: WebSocket;
  ip: string;
  userAgent?: string | undefined;
  connectedAt: Date;
  lastHeartbeat: Date;
  authenticated: boolean;
  subscriptions: Set<string>;
  user: WebSocketUser | null;
  permissions: Set<string>;
}

export interface WebSocketUser {
  id: string;
  email?: string;
  name?: string;
  role?: string;
}

export interface WebSocketError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AuthenticationResult {
  success: boolean;
  user?: WebSocketUser;
  permissions?: string[];
  error?: string;
}

// Message Types
export interface WelcomeMessage {
  type: 'welcome';
  payload: {
    clientId: string;
    serverVersion: string;
    protocolVersion: string;
    timestamp: string;
    authRequired: boolean;
  };
}

export interface AuthMessage {
  type: 'auth';
  payload: {
    token?: string;
    apiKey?: string;
    credentials?: {
      email: string;
      password: string;
    };
  };
}

export interface SubscribeMessage {
  type: 'subscribe';
  payload: {
    channel: string;
    filters?: Record<string, unknown>;
  };
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  payload: {
    channel: string;
  };
}

export interface TaskUpdateMessage {
  type: 'task_updated';
  payload: {
    task: Record<string, unknown>;
    changes: Record<string, unknown>;
    updatedBy: string;
    boardId: string;
  };
}

export interface TaskCreatedMessage {
  type: 'task_created';
  payload: {
    task: Record<string, unknown>;
    createdBy: string;
    boardId: string;
  };
}

export interface TaskDeletedMessage {
  type: 'task_deleted';
  payload: {
    taskId: string;
    deletedBy: string;
    boardId: string;
  };
}

export interface BoardUpdateMessage {
  type: 'board_updated';
  payload: {
    board: Record<string, unknown>;
    changes: Record<string, unknown>;
    updatedBy: string;
  };
}

export interface NoteAddedMessage {
  type: 'note_added';
  payload: {
    note: Record<string, unknown>;
    taskId: string;
    addedBy: string;
    boardId: string;
  };
}

export interface TagAssignedMessage {
  type: 'tag_assigned';
  payload: {
    taskId: string;
    tagId: string;
    assignedBy: string;
    boardId: string;
  };
}

export interface UserPresenceMessage {
  type: 'user_presence';
  payload: {
    userId: string;
    status: 'online' | 'offline' | 'away';
    boardId?: string;
    taskId?: string;
  };
}

export interface SystemNotificationMessage {
  type: 'system_notification';
  payload: {
    level: 'info' | 'warning' | 'error';
    title: string;
    message: string;
    actions?: Array<{
      label: string;
      action: string;
      data?: Record<string, unknown>;
    }>;
  };
}

// Subscription Channels
export enum SubscriptionChannel {
  BOARD = 'board',
  TASK = 'task',
  USER_PRESENCE = 'user_presence',
  SYSTEM_NOTIFICATIONS = 'system_notifications',
  BOARD_ANALYTICS = 'board_analytics',
  DEPENDENCIES = 'dependencies',
  SUBTASKS = 'subtasks',
}

// WebSocket Events
export enum WebSocketEvent {
  CONNECTION = 'connection',
  MESSAGE = 'message',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  HEARTBEAT = 'heartbeat',
}

// Event Filter for client-side filtering
export interface EventFilter {
  includeEvents?: string[];
  excludeEvents?: string[];
  boardIds?: string[];
  taskIds?: string[];
  userIds?: string[];
  priority?: {
    min?: number;
    max?: number;
  };
  tags?: string[];
  status?: string[];
}

// Add dependency message types
export interface AddDependencyMessage extends WebSocketMessage {
  type: 'add_dependency';
  payload: {
    taskId: string;
    dependsOnTaskId: string;
    dependencyType?: 'blocks' | 'relates_to' | 'duplicates';
  };
}

export interface RemoveDependencyMessage extends WebSocketMessage {
  type: 'remove_dependency';
  payload: {
    taskId: string;
    dependsOnTaskId: string;
  };
}

// Add subtask message types
export interface CreateSubtaskMessage extends WebSocketMessage {
  type: 'create_subtask';
  payload: {
    parentTaskId: string;
    title: string;
    description?: string;
    priority?: number;
    assignee?: string;
    due_date?: string;
  };
}

export interface UpdateSubtaskMessage extends WebSocketMessage {
  type: 'update_subtask';
  payload: {
    taskId: unknown;
    subtaskId: string;
    updates: Record<string, unknown>;
  };
}

export interface DeleteSubtaskMessage extends WebSocketMessage {
  type: 'delete_subtask';
  payload: {
    subtaskId: string;
  };
}

// Bulk operation message
export interface BulkOperationMessage extends WebSocketMessage {
  type: 'bulk_operation';
  payload: {
    operation: 'update' | 'delete' | 'move' | 'assign';
    taskIds: string[];
    changes?: Record<string, unknown>;
  };
}

// Filter subscription message
export interface FilterSubscriptionMessage extends WebSocketMessage {
  type: 'filter_subscription';
  payload: {
    channel: string;
    filter: EventFilter;
  };
}

// Rate Limiting
export interface RateLimitConfig {
  windowMs: number;
  maxConnections: number;
  maxMessagesPerMinute: number;
  maxSubscriptionsPerClient: number;
}

// Subscription Filters
export interface SubscriptionFilter {
  boardId?: string;
  taskId?: string;
  userId?: string;
  tagId?: string;
  noteId?: string;
  priority?: number;
  status?: string;
}

// Message Handler Context
export interface MessageContext {
  clientId: string;
  client: WebSocketClient;
  message: WebSocketMessage;
  subscriptionManager: SubscriptionManager;
  webSocketManager: WebSocketManager;
}
