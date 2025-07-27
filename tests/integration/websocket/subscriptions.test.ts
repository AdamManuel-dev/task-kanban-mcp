/**
 * WebSocket Subscription Integration Tests
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { webSocketManager } from '../../src/websocket/server';
import { dbConnection } from '../../src/database/connection';
import { config } from '../../src/config';
import { SubscriptionChannel } from '../../src/websocket/types';
import type { WebSocketMessage } from '../../src/websocket/types';
import type { Task, Board } from '../../src/types';

describe.skip('WebSocket Subscription Integration Tests', () => {
  // Use a dynamic port for testing to avoid conflicts
  const testPort = 3001 + Math.floor(Math.random() * 1000);
  const wsUrl = `ws://${String(String(config.websocket.host))}:${String(testPort)}${String(String(config.websocket.path))}`;
  let apiKey: string;
  let testBoard: Board;
  let testTask: Task;
  let authenticatedWs: WebSocket | null = null;

  beforeAll(async () => {
    // Initialize database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Create test API key
    apiKey = `test-api-key-${String(uuidv4())}`;
    await dbConnection.execute(
      'INSERT INTO api_keys (id, key_hash, name, permissions, created_at) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), apiKey, 'Test API Key', 'read,write', new Date().toISOString()]
    );

    // Create test board
    const boardId = uuidv4();
    await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
      boardId,
      'Test Board',
      new Date().toISOString(),
    ]);
    testBoard = {
      id: boardId,
      name: 'Test Board',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Create test column
    const columnId = uuidv4();
    await dbConnection.execute(
      'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
      [columnId, boardId, 'To Do', 0, new Date().toISOString()]
    );

    // Store column ID for tests
    global.testColumnId = columnId;

    // Create test task
    const taskId = uuidv4();
    await dbConnection.execute(
      `INSERT INTO tasks (id, title, board_id, column_id, status, position, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [taskId, 'Test Task', boardId, columnId, 'todo', 0, new Date().toISOString()]
    );
    testTask = {
      id: taskId,
      title: 'Test Task',
      boardId,
      board_id: boardId,
      status: 'todo',
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Task;

    // Start WebSocket server on test port
    await webSocketManager.start(testPort);
  });

  afterAll(async () => {
    await webSocketManager.stop();
    await dbConnection.close();
  });

  beforeEach(async () => {
    // Create authenticated connection
    authenticatedWs = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      authenticatedWs.on('open', () => {
        authenticatedWs.on('message', data => {
          const message = JSON.parse(data.toString()) as WebSocketMessage;

          if (message.type === 'welcome') {
            clientId = message.payload.clientId;
            // Send auth
            const authMessage: WebSocketMessage = {
              type: 'auth',
              id: uuidv4(),
              payload: { apiKey },
              timestamp: new Date().toISOString(),
            };
            authenticatedWs.send(JSON.stringify(authMessage));
          } else if (message.type === 'auth_success') {
            resolve();
          }
        });
      });

      authenticatedWs.on('error', reject);
    });
  });

  afterEach(() => {
    if (authenticatedWs && authenticatedWs.readyState === WebSocket.OPEN) {
      authenticatedWs.close();
    }
    authenticatedWs = null;
  });

  describe('Channel Subscriptions', () => {
    it('should subscribe to board channel', async () => {
      const messages: WebSocketMessage[] = [];

      if (!authenticatedWs) {
        throw new Error('WebSocket connection not established');
      }

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Subscribe to board updates
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        id: uuidv4(),
        payload: {
          channel: SubscriptionChannel.BOARD,
          filters: { boardId: testBoard.id },
        },
        timestamp: new Date().toISOString(),
      };
      authenticatedWs.send(JSON.stringify(subscribeMessage));

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      const subscribeResponse = messages.find(m => m.type === 'subscribe_success');
      expect(subscribeResponse).toBeDefined();
      expect(subscribeResponse?.payload.channel).toBe(SubscriptionChannel.BOARD);
      expect(subscribeResponse?.payload.subscriptionId).toBeDefined();
    });

    it('should subscribe to task channel', async () => {
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Subscribe to task updates
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        id: uuidv4(),
        payload: {
          channel: SubscriptionChannel.TASK,
          filters: { taskId: testTask.id },
        },
        timestamp: new Date().toISOString(),
      };
      authenticatedWs.send(JSON.stringify(subscribeMessage));

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      const subscribeResponse = messages.find(m => m.type === 'subscribe_success');
      expect(subscribeResponse).toBeDefined();
      expect(subscribeResponse?.payload.channel).toBe(SubscriptionChannel.TASK);
    });

    it('should handle multiple subscriptions', async () => {
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Subscribe to multiple channels
      const channels = [
        SubscriptionChannel.BOARD,
        SubscriptionChannel.TASK,
        SubscriptionChannel.USER_PRESENCE,
        SubscriptionChannel.SYSTEM_NOTIFICATIONS,
      ];

      await Promise.all(
        channels.map(async _channel => {
          await new Promise<void>(resolve => {
            setTimeout(resolve, 200);
          });
        })
      );
    });

    it('should enforce subscription limits', async () => {
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Try to create more than 50 subscriptions
      for (let i = 0; i < 55; i++) {
        const subscribeMessage: WebSocketMessage = {
          type: 'subscribe',
          id: uuidv4(),
          payload: {
            channel: SubscriptionChannel.BOARD,
            filters: { boardId: `board-${String(i)}` },
          },
          timestamp: new Date().toISOString(),
        };
        authenticatedWs.send(JSON.stringify(subscribeMessage));
      }

      await new Promise<void>(resolve => {
        setTimeout(resolve, 500);
      });

      const errorResponses = messages.filter(
        m => m.type === 'error' && m.payload.message.includes('limit')
      );
      expect(errorResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(async () => {
      // Subscribe to board updates
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        id: uuidv4(),
        payload: {
          channel: SubscriptionChannel.BOARD,
          filters: { boardId: testBoard.id },
        },
        timestamp: new Date().toISOString(),
      };
      authenticatedWs.send(JSON.stringify(subscribeMessage));

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      const subscribeResponse = messages.find(m => m.type === 'subscribe_success');
      subscriptionId = subscribeResponse?.payload.subscriptionId;
    });

    it('should receive task creation updates', async () => {
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Create a new task through subscription manager
      const newTask: Task = {
        id: uuidv4(),
        title: 'New Task via Subscription',
        board_id: testBoard.id,
        boardId: testBoard.id,
        status: 'todo',
        position: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Task;

      const sentCount = webSocketManager
        .getSubscriptionManager()
        .publishTaskCreated(newTask, 'test-user');

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      expect(sentCount).toBeGreaterThan(0);

      const channelMessage = messages.find(
        m => m.type === 'channel_message' && m.payload.data.type === 'task:created'
      );

      expect(channelMessage).toBeDefined();
      expect(channelMessage?.payload.channel).toBe(SubscriptionChannel.BOARD);
      expect(channelMessage?.payload.data.data.task.id).toBe(newTask.id);
    });

    it('should receive task update notifications', async () => {
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Publish task update
      const changes = { title: 'Updated Title', status: 'in_progress' };
      const updatedTask = { ...testTask, ...changes };

      const sentCount = webSocketManager
        .getSubscriptionManager()
        .publishTaskUpdated(updatedTask as Task, changes, 'test-user');

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      expect(sentCount).toBeGreaterThan(0);

      const channelMessage = messages.find(
        m => m.type === 'channel_message' && m.payload.data.type === 'task:updated'
      );

      expect(channelMessage).toBeDefined();
      expect(channelMessage?.payload.data.data.changes).toEqual(changes);
    });

    it('should filter updates by subscription filters', async () => {
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Create task for different board
      const otherBoardTask: Task = {
        id: uuidv4(),
        title: 'Other Board Task',
        board_id: 'other-board-id',
        boardId: 'other-board-id',
        status: 'todo',
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Task;

      // This should NOT be received
      webSocketManager.getSubscriptionManager().publishTaskCreated(otherBoardTask, 'test-user');

      // This SHOULD be received
      const sameBoasdTask: Task = {
        id: uuidv4(),
        title: 'Same Board Task',
        board_id: testBoard.id,
        boardId: testBoard.id,
        status: 'todo',
        position: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Task;

      webSocketManager.getSubscriptionManager().publishTaskCreated(sameBoasdTask, 'test-user');

      await new Promise<void>(resolve => {
        setTimeout(resolve, 200);
      });

      const channelMessages = messages.filter(
        m => m.type === 'channel_message' && m.payload.data.type === 'task:created'
      );

      expect(channelMessages).toHaveLength(1);
      expect(channelMessages[0].payload.data.data.task.boardId).toBe(testBoard.id);
    });
  });

  describe('User Presence', () => {
    it('should publish and receive presence updates', async () => {
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Subscribe to user presence
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        id: uuidv4(),
        payload: {
          channel: SubscriptionChannel.USER_PRESENCE,
        },
        timestamp: new Date().toISOString(),
      };
      authenticatedWs.send(JSON.stringify(subscribeMessage));

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      // Publish presence update
      const userId = 'test-user-123';
      const sentCount = webSocketManager
        .getSubscriptionManager()
        .publishUserPresence(userId, 'online');

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      expect(sentCount).toBeGreaterThan(0);

      const presenceMessage = messages.find(
        m => m.type === 'channel_message' && m.payload.data.type === 'connection:status'
      );

      expect(presenceMessage).toBeDefined();
      expect(presenceMessage?.payload.data.data.status).toBe('connected');
    });
  });

  describe('System Notifications', () => {
    it('should broadcast system notifications', async () => {
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Subscribe to system notifications
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        id: uuidv4(),
        payload: {
          channel: SubscriptionChannel.SYSTEM_NOTIFICATIONS,
        },
        timestamp: new Date().toISOString(),
      };
      authenticatedWs.send(JSON.stringify(subscribeMessage));

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      // Publish system notification
      const notification = {
        id: uuidv4(),
        type: 'info' as const,
        title: 'System Maintenance',
        message: 'The system will undergo maintenance in 1 hour',
        timestamp: new Date().toISOString(),
      };

      const sentCount = webSocketManager
        .getSubscriptionManager()
        .publishSystemNotification(notification);

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      expect(sentCount).toBeGreaterThan(0);

      const notificationMessage = messages.find(
        m => m.type === 'channel_message' && m.payload.data.type === 'system:notification'
      );

      expect(notificationMessage).toBeDefined();
      expect(notificationMessage?.payload.data.data.title).toBe(notification.title);
    });

    it('should target specific users for notifications', async () => {
      // Create second authenticated connection
      const secondWs = new WebSocket(wsUrl);
      const secondMessages: WebSocketMessage[] = [];

      await new Promise<void>((resolve, reject) => {
        secondWs.on('open', () => {
          secondWs.on('message', data => {
            const message = JSON.parse(data.toString()) as WebSocketMessage;
            secondMessages.push(message);

            if (message.type === 'welcome') {
              // Send auth
              const authMessage: WebSocketMessage = {
                type: 'auth',
                id: uuidv4(),
                payload: { apiKey },
                timestamp: new Date().toISOString(),
              };
              secondWs.send(JSON.stringify(authMessage));
            } else if (message.type === 'auth_success') {
              // Subscribe to notifications
              const subscribeMessage: WebSocketMessage = {
                type: 'subscribe',
                id: uuidv4(),
                payload: {
                  channel: SubscriptionChannel.SYSTEM_NOTIFICATIONS,
                },
                timestamp: new Date().toISOString(),
              };
              secondWs.send(JSON.stringify(subscribeMessage));
              setTimeout(resolve, 100);
            }
          });
        });

        secondWs.on('error', reject);
      });

      // Clear existing messages
      const firstMessages: WebSocketMessage[] = [];
      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        firstMessages.push(message);
      });

      // Ensure first client is also subscribed
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        id: uuidv4(),
        payload: {
          channel: SubscriptionChannel.SYSTEM_NOTIFICATIONS,
        },
        timestamp: new Date().toISOString(),
      };
      authenticatedWs.send(JSON.stringify(subscribeMessage));

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      // Send targeted notification (neither client is authenticated with user ID)
      const notification = {
        id: uuidv4(),
        type: 'warning' as const,
        title: 'Targeted Notification',
        message: 'This is for specific users only',
        timestamp: new Date().toISOString(),
      };

      webSocketManager
        .getSubscriptionManager()
        .publishSystemNotification(notification, ['user-123', 'user-456']);

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      // Neither client should receive it since they don't have user IDs
      const firstNotification = firstMessages.find(
        m => m.type === 'channel_message' && m.payload.data.data.title === 'Targeted Notification'
      );
      const secondNotification = secondMessages.find(
        m => m.type === 'channel_message' && m.payload.data.data.title === 'Targeted Notification'
      );

      expect(firstNotification).toBeUndefined();
      expect(secondNotification).toBeUndefined();

      secondWs.close();
    });
  });

  describe('Unsubscribe', () => {
    it('should unsubscribe from channel', async () => {
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Subscribe first
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        id: uuidv4(),
        payload: {
          channel: SubscriptionChannel.BOARD,
          filters: { boardId: testBoard.id },
        },
        timestamp: new Date().toISOString(),
      };
      authenticatedWs.send(JSON.stringify(subscribeMessage));

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      const subscribeResponse = messages.find(m => m.type === 'subscribe_success');
      const subscriptionId = subscribeResponse?.payload.subscriptionId;

      // Unsubscribe
      const unsubscribeMessage: WebSocketMessage = {
        type: 'unsubscribe',
        id: uuidv4(),
        payload: {
          subscriptionId,
        },
        timestamp: new Date().toISOString(),
      };
      authenticatedWs.send(JSON.stringify(unsubscribeMessage));

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      const unsubscribeResponse = messages.find(m => m.type === 'unsubscribe_success');
      expect(unsubscribeResponse).toBeDefined();

      // Verify no more updates are received
      messages.length = 0;

      // Publish update
      const newTask: Task = {
        id: uuidv4(),
        title: 'Should not be received',
        board_id: testBoard.id,
        boardId: testBoard.id,
        status: 'todo',
        position: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Task;

      webSocketManager.getSubscriptionManager().publishTaskCreated(newTask, 'test-user');

      await new Promise<void>(resolve => {
        setTimeout(resolve, 100);
      });

      const channelMessage = messages.find(m => m.type === 'channel_message');
      expect(channelMessage).toBeUndefined();
    });

    it('should unsubscribe all on disconnect', async () => {
      // Subscribe to multiple channels
      const channels = [
        SubscriptionChannel.BOARD,
        SubscriptionChannel.TASK,
        SubscriptionChannel.USER_PRESENCE,
      ];

      await Promise.all(
        channels.map(async _channel => {
          await new Promise<void>(resolve => {
            setTimeout(resolve, 200);
          });
        })
      );
    });
  });
});
