# WebSocket API Documentation

## Overview

The MCP Kanban WebSocket API provides real-time updates and bidirectional communication for collaborative task management. Built on Socket.io, it supports authentication, rate limiting, and structured message handling.

## Table of Contents

- [Connection](#connection)
- [Authentication](#authentication)
- [Message Format](#message-format)
- [Event Types](#event-types)
- [Subscriptions](#subscriptions)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)

## Connection

### WebSocket Endpoint
```
ws://localhost:3456/socket.io/
wss://your-domain.com/socket.io/
```

### Connection Options
```javascript
const socket = io('http://localhost:3456', {
  auth: {
    token: 'your-auth-token'
  },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});
```

## Authentication

Authentication is required for all WebSocket connections. The server supports multiple authentication methods:

### Token Authentication
```javascript
socket.auth = {
  token: 'bearer-token-here'
};
```

### API Key Authentication
```javascript
socket.auth = {
  apiKey: 'your-api-key'
};
```

### Session Authentication
```javascript
socket.auth = {
  sessionId: 'session-id',
  userId: 'user-id'
};
```

## Message Format

All WebSocket messages follow a consistent structure:

```typescript
interface WebSocketMessage {
  type: string;           // Message type identifier
  data?: unknown;         // Message payload
  timestamp?: string;     // ISO timestamp
  requestId?: string;     // Optional request tracking ID
}
```

## Event Types

### Task Events

#### task:created
Emitted when a new task is created.

```typescript
{
  type: 'task:created',
  data: {
    task: Task,
    createdBy: string,
    boardId: string
  }
}
```

#### task:updated
Emitted when a task is updated.

```typescript
{
  type: 'task:updated',
  data: {
    task: Task,
    changes: Record<string, unknown>,
    updatedBy: string,
    boardId: string
  }
}
```

#### task:moved
Emitted when a task is moved between columns.

```typescript
{
  type: 'task:moved',
  data: {
    task: Task,
    fromColumn: string,
    toColumn: string,
    movedBy: string,
    boardId: string
  }
}
```

#### task:deleted
Emitted when a task is deleted.

```typescript
{
  type: 'task:deleted',
  data: {
    taskId: string,
    deletedBy: string,
    boardId: string
  }
}
```

### Board Events

#### board:updated
Emitted when a board is updated.

```typescript
{
  type: 'board:updated',
  data: {
    board: Board,
    changes: Record<string, unknown>,
    updatedBy: string
  }
}
```

### Note Events

#### note:added
Emitted when a note is added to a task.

```typescript
{
  type: 'note:added',
  data: {
    note: Note,
    taskId: string,
    boardId: string,
    addedBy: string
  }
}
```

#### note:updated
Emitted when a note is updated.

```typescript
{
  type: 'note:updated',
  data: {
    note: Note,
    changes: Record<string, unknown>,
    updatedBy: string,
    taskId?: string,
    boardId?: string
  }
}
```

### Tag Events

#### tag:assigned
Emitted when a tag is assigned to a task.

```typescript
{
  type: 'tag:assigned',
  data: {
    taskId: string,
    tagId: string,
    assignedBy: string,
    boardId: string
  }
}
```

### User Presence Events

#### user:presence
Indicates user online/offline status.

```typescript
{
  type: 'user:presence',
  data: {
    userId: string,
    status: 'online' | 'offline' | 'away',
    boardId?: string,
    taskId?: string
  }
}
```

#### typing:start
User started typing in a task or comment.

```typescript
{
  type: 'typing:start',
  data: {
    userId: string,
    taskId?: string,
    boardId?: string,
    timestamp: string
  }
}
```

#### typing:stop
User stopped typing.

```typescript
{
  type: 'typing:stop',
  data: {
    userId: string,
    taskId?: string,
    boardId?: string,
    timestamp: string
  }
}
```

### System Events

#### system:notification
System-wide notifications.

```typescript
{
  type: 'system:notification',
  data: {
    type: 'info' | 'warning' | 'error' | 'success',
    title: string,
    message: string,
    data?: unknown,
    persistent?: boolean,
    actionUrl?: string
  }
}
```

#### connection:status
Connection status updates.

```typescript
{
  type: 'connection:status',
  data: {
    status: 'connected' | 'disconnected' | 'reconnecting',
    timestamp: string,
    clientId?: string
  }
}
```

### Priority & Dependency Events

#### priority:changed
Task priority has changed.

```typescript
{
  type: 'priority:changed',
  data: {
    taskId: string,
    oldPriority: number,
    newPriority: number,
    reason?: string,
    changedBy?: string,
    boardId: string
  }
}
```

#### dependency:blocked
Task is blocked by dependency.

```typescript
{
  type: 'dependency:blocked',
  data: {
    blockedTaskId: string,
    blockingTaskId: string,
    reason: string,
    boardId: string
  }
}
```

#### subtask:completed
Subtask has been completed.

```typescript
{
  type: 'subtask:completed',
  data: {
    subtaskId: string,
    parentTaskId: string,
    completedBy: string,
    boardId: string,
    parentProgress?: number
  }
}
```

## Subscriptions

Subscribe to specific event types or filtered events:

### Subscribe to Event Type
```javascript
// Client -> Server
socket.emit('subscribe', {
  type: 'task:*',  // Subscribe to all task events
  filters: {
    boardId: 'board-123'
  }
});

// Server -> Client
{
  type: 'subscription:confirmed',
  data: {
    type: 'task:*',
    filters: { boardId: 'board-123' },
    subscriptionId: 'sub-456'
  }
}
```

### Unsubscribe
```javascript
socket.emit('unsubscribe', {
  subscriptionId: 'sub-456'
});
```

### Subscription Patterns
- `task:*` - All task events
- `board:*` - All board events
- `*` - All events (requires admin permission)
- Specific events like `task:created`, `task:updated`

## Error Handling

### Error Response Format
```typescript
{
  type: 'error',
  data: {
    code: string,
    message: string,
    details?: unknown
  }
}
```

### Common Error Codes
- `AUTH_FAILED` - Authentication failure
- `RATE_LIMIT` - Rate limit exceeded
- `INVALID_MESSAGE` - Malformed message
- `SUBSCRIPTION_FAILED` - Unable to create subscription
- `PERMISSION_DENIED` - Insufficient permissions

## Rate Limiting

The WebSocket API implements rate limiting to prevent abuse:

- **Message Rate**: 100 messages per minute per connection
- **Subscription Limit**: 20 active subscriptions per connection
- **Burst Allowance**: 10 messages in rapid succession

Rate limit exceeded response:
```typescript
{
  type: 'error',
  data: {
    code: 'RATE_LIMIT',
    message: 'Rate limit exceeded',
    details: {
      limit: 100,
      window: 60,
      retryAfter: 45
    }
  }
}
```

## Examples

### Complete Connection Example
```javascript
import io from 'socket.io-client';

// Connect with authentication
const socket = io('http://localhost:3456', {
  auth: {
    token: localStorage.getItem('authToken')
  }
});

// Connection event handlers
socket.on('connect', () => {
  console.log('Connected to WebSocket server');
  
  // Subscribe to board events
  socket.emit('subscribe', {
    type: 'task:*',
    filters: {
      boardId: 'my-board-id'
    }
  });
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

// Handle task events
socket.on('task:created', (message) => {
  console.log('New task created:', message.data.task);
  updateUI(message.data.task);
});

socket.on('task:updated', (message) => {
  console.log('Task updated:', message.data.task);
  updateTaskInUI(message.data.task);
});

// Handle errors
socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Send typing indicator
function startTyping(taskId) {
  socket.emit('typing:start', {
    taskId,
    timestamp: new Date().toISOString()
  });
}

// Clean up on unmount
function cleanup() {
  socket.disconnect();
}
```

### React Hook Example
```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function useTaskWebSocket(boardId) {
  const [socket, setSocket] = useState(null);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    const newSocket = io('http://localhost:3456', {
      auth: { token: getAuthToken() }
    });

    newSocket.on('connect', () => {
      newSocket.emit('subscribe', {
        type: 'task:*',
        filters: { boardId }
      });
    });

    newSocket.on('task:created', (message) => {
      setTasks(prev => [...prev, message.data.task]);
    });

    newSocket.on('task:updated', (message) => {
      setTasks(prev => prev.map(task => 
        task.id === message.data.task.id 
          ? message.data.task 
          : task
      ));
    });

    newSocket.on('task:deleted', (message) => {
      setTasks(prev => prev.filter(task => 
        task.id !== message.data.taskId
      ));
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [boardId]);

  return { socket, tasks };
}
```

### TypeScript Client Example
```typescript
import { io, Socket } from 'socket.io-client';
import type { 
  WebSocketMessage, 
  TaskCreatedMessage,
  TaskUpdatedMessage 
} from './types';

class KanbanWebSocketClient {
  private socket: Socket;
  private subscriptions: Map<string, string> = new Map();

  constructor(url: string, token: string) {
    this.socket = io(url, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.resubscribe();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  subscribeToBoard(boardId: string): void {
    this.socket.emit('subscribe', {
      type: 'task:*',
      filters: { boardId }
    });

    this.socket.once('subscription:confirmed', (message) => {
      this.subscriptions.set(boardId, message.data.subscriptionId);
    });
  }

  unsubscribeFromBoard(boardId: string): void {
    const subscriptionId = this.subscriptions.get(boardId);
    if (subscriptionId) {
      this.socket.emit('unsubscribe', { subscriptionId });
      this.subscriptions.delete(boardId);
    }
  }

  onTaskCreated(callback: (task: TaskCreatedMessage) => void): void {
    this.socket.on('task:created', callback);
  }

  onTaskUpdated(callback: (task: TaskUpdatedMessage) => void): void {
    this.socket.on('task:updated', callback);
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  private resubscribe(): void {
    // Resubscribe to all boards after reconnection
    for (const [boardId] of this.subscriptions) {
      this.subscribeToBoard(boardId);
    }
  }
}

// Usage
const client = new KanbanWebSocketClient(
  'http://localhost:3456',
  'auth-token'
);

client.subscribeToBoard('board-123');

client.onTaskCreated((message) => {
  console.log('New task:', message.data.task);
});

client.onTaskUpdated((message) => {
  console.log('Updated task:', message.data.task);
});
```

## Best Practices

1. **Always handle disconnections** - Implement reconnection logic
2. **Subscribe to specific events** - Don't subscribe to all events unless necessary
3. **Implement rate limiting on client** - Don't overwhelm the server
4. **Handle errors gracefully** - Show user-friendly messages
5. **Clean up subscriptions** - Unsubscribe when components unmount
6. **Use request IDs** - Track message flows for debugging
7. **Implement heartbeat** - Detect stale connections
8. **Batch updates** - Group multiple updates when possible

## See Also

- [REST API Documentation](./REST.md)
- [MCP API Documentation](./MCP.md)
- [Authentication Guide](../guides/AUTHENTICATION.md)
- [Real-time Features Guide](../guides/REALTIME.md)