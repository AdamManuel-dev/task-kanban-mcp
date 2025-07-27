# WebSocket Module Documentation

## Overview

The WebSocket module provides real-time communication capabilities for the MCP Kanban system. Built on Socket.io, it enables instant updates across connected clients, supporting features like live task updates, user presence, and collaborative editing notifications.

## Table of Contents

- [Architecture](#architecture)
- [Core Components](#core-components)
- [Message Types](#message-types)
- [Event Handlers](#event-handlers)
- [Subscription System](#subscription-system)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Development](#development)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Socket.io Server                       │
│                 (src/websocket/server.ts)               │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼─────┐   ┌─────▼─────┐  ┌─────▼─────┐
    │   Auth   │   │ Handlers  │  │Rate Limit│
    ├──────────┤   ├───────────┤  ├───────────┤
    │ • token  │   │ • task    │  │ • counter │
    │ • apiKey │   │ • board   │  │ • window  │
    │ • session│   │ • presence│  │ • burst   │
    └──────────┘   └───────────┘  └───────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                ┌────────▼────────┐
                │ Subscriptions   │
                ├─────────────────┤
                │ • rooms         │
                │ • filters       │
                │ • broadcast     │
                └─────────────────┘
```

## Core Components

### WebSocket Server

**Location**: `src/websocket/server.ts`

```typescript
export class WebSocketServer {
  private io: Server;
  private subscriptionManager: SubscriptionManager;
  private rateLimiter: RateLimiter;
  
  constructor(httpServer: HTTPServer, options?: WebSocketOptions) {
    this.io = new Server(httpServer, {
      cors: options?.cors || defaultCorsOptions,
      pingTimeout: options?.pingTimeout || 60000,
      pingInterval: options?.pingInterval || 25000,
    });
    
    this.setupMiddleware();
    this.setupHandlers();
  }
  
  // Connection handling
  private setupHandlers() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }
  
  // Event broadcasting
  broadcastToBoard(boardId: string, event: WebSocketMessage) {
    this.io.to(`board:${boardId}`).emit(event.type, event);
  }
  
  broadcastToUser(userId: string, event: WebSocketMessage) {
    this.io.to(`user:${userId}`).emit(event.type, event);
  }
}
```

### Message Types

**Location**: `src/websocket/messageTypes.ts`

```typescript
// Base message structure
interface WebSocketMessage {
  type: string;
  data?: unknown;
  timestamp?: string;
  requestId?: string;
}

// Task events
interface TaskCreatedMessage extends WebSocketMessage {
  type: 'task:created';
  data: {
    task: Task;
    createdBy: string;
    boardId: string;
  };
}

// Presence events
interface UserPresenceMessage extends WebSocketMessage {
  type: 'user:presence';
  data: {
    userId: string;
    status: 'online' | 'offline' | 'away';
    boardId?: string;
    taskId?: string;
  };
}
```

### Event Handlers

**Location**: `src/websocket/handlers.ts`

```typescript
export class WebSocketHandlers {
  constructor(
    private services: {
      taskService: TaskService;
      boardService: BoardService;
      noteService: NoteService;
    }
  ) {}
  
  // Handle task updates
  async handleTaskUpdate(socket: Socket, data: UpdateTaskData) {
    try {
      // Validate permissions
      if (!socket.data.user.permissions.includes('write')) {
        throw new UnauthorizedError('Write permission required');
      }
      
      // Update task
      const task = await this.services.taskService.updateTask(
        data.taskId,
        data.updates
      );
      
      // Broadcast update
      const message: TaskUpdatedMessage = {
        type: 'task:updated',
        data: {
          task,
          changes: data.updates,
          updatedBy: socket.data.user.id,
          boardId: task.board_id,
        },
        timestamp: new Date().toISOString(),
      };
      
      socket.to(`board:${task.board_id}`).emit('task:updated', message);
      
      // Acknowledge to sender
      socket.emit('task:update:success', { task });
    } catch (error) {
      socket.emit('task:update:error', {
        error: error.message,
        code: error.code,
      });
    }
  }
  
  // Handle presence updates
  handlePresenceUpdate(socket: Socket, data: PresenceData) {
    const presence: UserPresenceMessage = {
      type: 'user:presence',
      data: {
        userId: socket.data.user.id,
        status: data.status,
        boardId: data.boardId,
        taskId: data.taskId,
      },
      timestamp: new Date().toISOString(),
    };
    
    // Broadcast to relevant rooms
    if (data.boardId) {
      socket.to(`board:${data.boardId}`).emit('user:presence', presence);
    }
    
    // Update user's presence state
    socket.data.presence = data;
  }
}
```

## Message Types

### Task Messages

```typescript
// Task lifecycle events
'task:created'     // New task created
'task:updated'     // Task properties updated
'task:moved'       // Task moved between columns
'task:deleted'     // Task deleted
'task:assigned'    // Task assigned to user
'task:completed'   // Task marked as done

// Task interaction events
'task:comment:added'    // Comment added to task
'task:attachment:added' // File attached to task
'task:dependency:added' // Dependency created
```

### Board Messages

```typescript
// Board management events
'board:created'    // New board created
'board:updated'    // Board properties updated
'board:archived'   // Board archived
'board:restored'   // Board restored from archive

// Column events
'column:created'   // New column added
'column:updated'   // Column properties updated
'column:reordered' // Columns reordered
'column:deleted'   // Column removed
```

### Collaboration Messages

```typescript
// User presence
'user:joined'      // User joined board/task
'user:left'        // User left board/task
'user:presence'    // Presence status update

// Typing indicators
'typing:start'     // User started typing
'typing:stop'      // User stopped typing

// Notifications
'notification:task'   // Task-related notification
'notification:mention' // User mentioned
'notification:system'  // System notification
```

## Subscription System

### Subscription Manager

**Location**: `src/websocket/subscriptions.ts`

```typescript
export class SubscriptionManager {
  private subscriptions = new Map<string, Subscription>();
  
  // Subscribe to events
  subscribe(
    socket: Socket,
    pattern: string,
    filters?: SubscriptionFilters
  ): string {
    const subscriptionId = generateId();
    
    const subscription: Subscription = {
      id: subscriptionId,
      socketId: socket.id,
      pattern,
      filters,
      createdAt: new Date(),
    };
    
    this.subscriptions.set(subscriptionId, subscription);
    
    // Join appropriate rooms
    if (filters?.boardId) {
      socket.join(`board:${filters.boardId}`);
    }
    
    if (filters?.taskId) {
      socket.join(`task:${filters.taskId}`);
    }
    
    return subscriptionId;
  }
  
  // Pattern matching
  matchesPattern(eventType: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === eventType) return true;
    
    // Wildcard matching (e.g., 'task:*' matches 'task:created')
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*') + '$'
    );
    return regex.test(eventType);
  }
  
  // Get matching subscriptions
  getMatchingSubscriptions(
    event: WebSocketMessage
  ): Subscription[] {
    return Array.from(this.subscriptions.values()).filter(sub => {
      // Check pattern match
      if (!this.matchesPattern(event.type, sub.pattern)) {
        return false;
      }
      
      // Check filters
      if (sub.filters) {
        return this.matchesFilters(event, sub.filters);
      }
      
      return true;
    });
  }
}
```

### Room Management

```typescript
// Room naming conventions
`board:${boardId}`     // All users viewing a board
`task:${taskId}`       // All users viewing a task
`user:${userId}`       // Specific user notifications
`team:${teamId}`       // Team-wide notifications
`global`               // System-wide broadcasts

// Room operations
socket.join(`board:${boardId}`);
socket.leave(`board:${boardId}`);
socket.to(`board:${boardId}`).emit('event', data);
io.in(`board:${boardId}`).emit('event', data);
```

## Authentication

### WebSocket Authentication

**Location**: `src/websocket/auth.ts`

```typescript
export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void
) {
  try {
    const { token, apiKey, sessionId } = socket.handshake.auth;
    
    let user: AuthenticatedUser | null = null;
    
    // Try different auth methods
    if (token) {
      user = await validateToken(token);
    } else if (apiKey) {
      user = await validateApiKey(apiKey);
    } else if (sessionId) {
      user = await validateSession(sessionId);
    }
    
    if (!user) {
      return next(new Error('Authentication failed'));
    }
    
    // Attach user to socket
    socket.data.user = user;
    socket.data.authenticated = true;
    
    // Join user room
    socket.join(`user:${user.id}`);
    
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
}
```

### Permission Checking

```typescript
export function requireSocketPermission(permission: string) {
  return (socket: Socket, next: (err?: Error) => void) => {
    if (!socket.data.user?.permissions.includes(permission)) {
      return next(new Error(`Permission denied: ${permission}`));
    }
    next();
  };
}

// Usage in handlers
socket.use(requireSocketPermission('write'));
```

## Rate Limiting

### Rate Limiter Implementation

**Location**: `src/websocket/rateLimit.ts`

```typescript
export class WebSocketRateLimiter {
  private limits = new Map<string, RateLimit>();
  
  constructor(
    private options: RateLimitOptions = {
      windowMs: 60000,      // 1 minute
      maxRequests: 100,     // 100 requests per window
      burstLimit: 10,       // 10 requests in rapid succession
    }
  ) {}
  
  checkLimit(socketId: string): boolean {
    const now = Date.now();
    let limit = this.limits.get(socketId);
    
    if (!limit) {
      limit = {
        requests: [],
        burst: [],
      };
      this.limits.set(socketId, limit);
    }
    
    // Clean old requests
    limit.requests = limit.requests.filter(
      time => now - time < this.options.windowMs
    );
    
    // Check window limit
    if (limit.requests.length >= this.options.maxRequests) {
      return false;
    }
    
    // Check burst limit
    limit.burst = limit.burst.filter(
      time => now - time < 1000 // 1 second burst window
    );
    
    if (limit.burst.length >= this.options.burstLimit) {
      return false;
    }
    
    // Record request
    limit.requests.push(now);
    limit.burst.push(now);
    
    return true;
  }
  
  getRateLimitInfo(socketId: string): RateLimitInfo {
    const limit = this.limits.get(socketId);
    if (!limit) {
      return {
        remaining: this.options.maxRequests,
        reset: Date.now() + this.options.windowMs,
      };
    }
    
    const now = Date.now();
    const validRequests = limit.requests.filter(
      time => now - time < this.options.windowMs
    );
    
    return {
      remaining: this.options.maxRequests - validRequests.length,
      reset: Math.min(...validRequests) + this.options.windowMs,
    };
  }
}
```

## Development

### Setting Up WebSocket Server

```typescript
import { createServer } from 'http';
import { WebSocketServer } from '@/websocket/server';
import { app } from '@/app';

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket server
const wsServer = new WebSocketServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Client Integration

```typescript
import { io, Socket } from 'socket.io-client';

class KanbanWebSocketClient {
  private socket: Socket;
  
  constructor(url: string, token: string) {
    this.socket = io(url, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
    
    this.setupEventHandlers();
  }
  
  private setupEventHandlers() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      this.subscribeToUpdates();
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
    });
    
    // Task events
    this.socket.on('task:created', (message: TaskCreatedMessage) => {
      this.handleTaskCreated(message);
    });
    
    this.socket.on('task:updated', (message: TaskUpdatedMessage) => {
      this.handleTaskUpdated(message);
    });
  }
  
  subscribeToBoard(boardId: string) {
    this.socket.emit('subscribe', {
      type: 'board:*',
      filters: { boardId }
    });
  }
}
```

### Testing WebSocket Events

```typescript
import { io as ioClient } from 'socket.io-client';
import { createTestServer } from '@/tests/helpers';

describe('WebSocket Events', () => {
  let server: Server;
  let client: Socket;
  
  beforeEach(async () => {
    server = await createTestServer();
    client = ioClient(`http://localhost:${PORT}`, {
      auth: { token: 'test-token' }
    });
    
    await new Promise(resolve => {
      client.on('connect', resolve);
    });
  });
  
  afterEach(() => {
    client.disconnect();
    server.close();
  });
  
  it('should broadcast task updates', async () => {
    const taskUpdate = new Promise(resolve => {
      client.on('task:updated', resolve);
    });
    
    // Subscribe to board
    client.emit('subscribe', {
      type: 'task:*',
      filters: { boardId: 'test-board' }
    });
    
    // Trigger task update
    await updateTask('task-123', { status: 'done' });
    
    // Verify broadcast
    const message = await taskUpdate;
    expect(message).toMatchObject({
      type: 'task:updated',
      data: {
        task: { id: 'task-123', status: 'done' }
      }
    });
  });
});
```

### Error Handling

```typescript
// Server-side error handling
socket.on('error', (error) => {
  logger.error('Socket error', {
    socketId: socket.id,
    userId: socket.data.user?.id,
    error: error.message,
    stack: error.stack,
  });
  
  // Notify client
  socket.emit('error', {
    code: 'SOCKET_ERROR',
    message: 'An error occurred',
    timestamp: new Date().toISOString(),
  });
});

// Client-side error handling
socket.on('error', (error) => {
  console.error('WebSocket error:', error);
  
  // Implement retry logic
  if (error.code === 'RATE_LIMIT') {
    setTimeout(() => {
      socket.connect();
    }, error.retryAfter * 1000);
  }
});
```

## Best Practices

### 1. Event Naming

Use consistent, hierarchical event names:

```typescript
// Good
'task:created'
'task:updated'
'task:moved'
'board:column:added'

// Bad
'taskCreated'
'update-task'
'TASK_MOVED'
```

### 2. Message Structure

Always include metadata in messages:

```typescript
const message: WebSocketMessage = {
  type: 'task:updated',
  data: payload,
  timestamp: new Date().toISOString(),
  requestId: generateRequestId(),
  userId: socket.data.user.id,
};
```

### 3. Room Management

Use rooms for efficient broadcasting:

```typescript
// Join/leave rooms appropriately
socket.on('view:board', (boardId) => {
  // Leave previous board room
  const rooms = Array.from(socket.rooms);
  rooms.filter(r => r.startsWith('board:')).forEach(room => {
    socket.leave(room);
  });
  
  // Join new board room
  socket.join(`board:${boardId}`);
});
```

### 4. Authentication

Always verify permissions before processing:

```typescript
async function handleSecureAction(socket: Socket, data: any) {
  // Verify authentication
  if (!socket.data.authenticated) {
    socket.emit('error', { code: 'UNAUTHENTICATED' });
    return;
  }
  
  // Check permissions
  if (!hasPermission(socket.data.user, 'write')) {
    socket.emit('error', { code: 'FORBIDDEN' });
    return;
  }
  
  // Process action
  await processAction(data);
}
```

### 5. Performance

Implement efficient event handling:

```typescript
// Debounce rapid updates
const debouncedUpdate = debounce((socket, data) => {
  handleTaskUpdate(socket, data);
}, 300);

// Batch notifications
const notificationBatcher = new BatchProcessor({
  maxBatchSize: 10,
  maxWaitTime: 1000,
  process: async (batch) => {
    socket.emit('notifications:batch', batch);
  },
});
```

## See Also

- [WebSocket API Reference](../api/WEBSOCKET.md)
- [Real-time Features Guide](../guides/REALTIME.md)
- [API Module](./api.md)
- [Services Module](./services.md)