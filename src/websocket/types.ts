import type { WebSocket } from 'ws';

export interface WebSocketMessage {
  type: string;
  id: string;
  payload?: any;
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
  details?: any;
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
    filters?: Record<string, any>;
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
    task: any;
    changes: Record<string, any>;
    updatedBy: string;
    boardId: string;
  };
}

export interface TaskCreatedMessage {
  type: 'task_created';
  payload: {
    task: any;
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
    board: any;
    changes: Record<string, any>;
    updatedBy: string;
  };
}

export interface NoteAddedMessage {
  type: 'note_added';
  payload: {
    note: any;
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
      data?: any;
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
}

// WebSocket Events
export enum WebSocketEvent {
  CONNECTION = 'connection',
  MESSAGE = 'message',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  HEARTBEAT = 'heartbeat',
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
  subscriptionManager: any;
  webSocketManager: any;
}
