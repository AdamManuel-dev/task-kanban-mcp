/**
 * Type definitions for WebSocket messages and payloads
 */

import type { Task, Board, Note } from '../types';

// Base message structure
export interface WebSocketMessage {
  type: string;
  data?: unknown;
  timestamp?: string;
  requestId?: string;
}

// Authentication payload
export interface AuthPayload {
  token?: string;
  apiKey?: string;
  userId?: string;
  sessionId?: string;
  credentials?: {
    username?: string;
    password?: string;
  };
}

// System notification payload
export interface SystemNotification {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  data?: unknown;
  persistent?: boolean;
  actionUrl?: string;
}

// Task-related messages
export interface TaskCreatedMessage extends WebSocketMessage {
  type: 'task:created';
  data: {
    task: Task;
    createdBy: string;
    boardId: string;
  };
}

export interface TaskUpdatedMessage extends WebSocketMessage {
  type: 'task:updated';
  data: {
    task: Task;
    changes: Record<string, unknown>;
    updatedBy: string;
    boardId: string;
  };
}

export interface TaskMovedMessage extends WebSocketMessage {
  type: 'task:moved';
  data: {
    task: Task;
    fromColumn: string;
    toColumn: string;
    movedBy: string;
    boardId: string;
  };
}

export interface TaskDeletedMessage extends WebSocketMessage {
  type: 'task:deleted';
  data: {
    taskId: string;
    deletedBy: string;
    boardId: string;
  };
}

// Board-related messages
export interface BoardUpdatedMessage extends WebSocketMessage {
  type: 'board:updated';
  data: {
    board: Board;
    changes: Record<string, unknown>;
    updatedBy: string;
  };
}

// Note-related messages
export interface NoteAddedMessage extends WebSocketMessage {
  type: 'note:added';
  data: {
    note: Note;
    taskId: string;
    boardId: string;
    addedBy: string;
  };
}

export interface NoteUpdatedMessage extends WebSocketMessage {
  type: 'note:updated';
  data: {
    note: Note;
    changes: Record<string, unknown>;
    updatedBy: string;
    taskId?: string;
    boardId?: string;
  };
}

// Tag-related messages
export interface TagAssignedMessage extends WebSocketMessage {
  type: 'tag:assigned';
  data: {
    taskId: string;
    tagId: string;
    assignedBy: string;
    boardId: string;
  };
}

// User presence and typing messages
export interface UserPresenceMessage extends WebSocketMessage {
  type: 'user:presence';
  data: {
    userId: string;
    status: 'online' | 'offline' | 'away';
    boardId?: string;
    taskId?: string;
  };
}

export interface TypingStartMessage extends WebSocketMessage {
  type: 'typing:start';
  data: {
    userId: string;
    taskId?: string;
    boardId?: string;
    timestamp: string;
  };
}

export interface TypingStopMessage extends WebSocketMessage {
  type: 'typing:stop';
  data: {
    userId: string;
    taskId?: string;
    boardId?: string;
    timestamp: string;
  };
}

// System messages
export interface SystemNotificationMessage extends WebSocketMessage {
  type: 'system:notification';
  data: SystemNotification;
}

export interface ConnectionStatusMessage extends WebSocketMessage {
  type: 'connection:status';
  data: {
    status: 'connected' | 'disconnected' | 'reconnecting';
    timestamp: string;
    clientId?: string;
  };
}

// Subscription messages
export interface SubscriptionConfirmMessage extends WebSocketMessage {
  type: 'subscription:confirmed';
  data: {
    type: string;
    filters: Record<string, unknown>;
    subscriptionId: string;
  };
}

export interface SubscriptionErrorMessage extends WebSocketMessage {
  type: 'subscription:error';
  data: {
    error: string;
    requestedType?: string;
    requestedFilters?: Record<string, unknown>;
  };
}

// Priority and dependency messages
export interface PriorityChangedMessage extends WebSocketMessage {
  type: 'priority:changed';
  data: {
    taskId: string;
    oldPriority: number;
    newPriority: number;
    reason?: string;
    changedBy?: string;
    boardId: string;
  };
}

export interface DependencyBlockedMessage extends WebSocketMessage {
  type: 'dependency:blocked';
  data: {
    blockedTaskId: string;
    blockingTaskId: string;
    reason: string;
    boardId: string;
  };
}

export interface SubtaskCompletedMessage extends WebSocketMessage {
  type: 'subtask:completed';
  data: {
    subtaskId: string;
    parentTaskId: string;
    completedBy: string;
    boardId: string;
    parentProgress?: number;
  };
}

// Union type for all message types
export type AllWebSocketMessages =
  | TaskCreatedMessage
  | TaskUpdatedMessage
  | TaskMovedMessage
  | TaskDeletedMessage
  | BoardUpdatedMessage
  | NoteAddedMessage
  | NoteUpdatedMessage
  | TagAssignedMessage
  | UserPresenceMessage
  | TypingStartMessage
  | TypingStopMessage
  | SystemNotificationMessage
  | ConnectionStatusMessage
  | SubscriptionConfirmMessage
  | SubscriptionErrorMessage
  | PriorityChangedMessage
  | DependencyBlockedMessage
  | SubtaskCompletedMessage;

// Publication context
export interface PublicationContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  timestamp?: string;
  boardId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

// Request payload (from HTTP server)
export interface RequestInfo {
  method: string;
  url: string;
  headers: Record<string, string>;
  socket: {
    remoteAddress?: string;
    remotePort?: number;
  };
}

// Filter types for message matching
export type MessageFilter = Record<string, unknown>;

// Event emission data
export interface EventData {
  type: string;
  payload: unknown;
  boardId?: string;
  taskId?: string;
  userId?: string;
}