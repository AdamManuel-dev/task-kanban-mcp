/**
 * @fileoverview Unit tests for WebSocket subscriptions manager
 * @lastmodified 2025-07-28T07:22:00Z
 *
 * Features: Subscription management, client tracking, event broadcasting
 * Main APIs: subscribe(), unsubscribe(), broadcast(), getSubscribers()
 * Constraints: WebSocket client mocks, memory-based storage
 * Patterns: Event-driven subscriptions, client lifecycle management
 */

import { jest } from '@jest/globals';
import { SubscriptionManager } from '@/websocket/subscriptions';
import { logger } from '@/utils/logger';

jest.mock('@/utils/logger');

describe('SubscriptionManager', () => {
  let subscriptionManager: SubscriptionManager;
  let mockClient1: any;
  let mockClient2: any;
  let mockClient3: any;

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager();

    mockClient1 = {
      id: 'client-1',
      userId: 'user-1',
      send: jest.fn(),
      readyState: 1, // WebSocket.OPEN
    };

    mockClient2 = {
      id: 'client-2',
      userId: 'user-2',
      send: jest.fn(),
      readyState: 1,
    };

    mockClient3 = {
      id: 'client-3',
      userId: 'user-1', // Same user as client1
      send: jest.fn(),
      readyState: 1,
    };

    jest.clearAllMocks();
  });

  describe('Board Subscriptions', () => {
    test('should subscribe client to board', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');

      const subscribers = subscriptionManager.getBoardSubscribers('board-1');
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]).toBe(mockClient1);
    });

    test('should handle multiple clients subscribing to same board', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');
      subscriptionManager.subscribeToBoard(mockClient2, 'board-1');

      const subscribers = subscriptionManager.getBoardSubscribers('board-1');
      expect(subscribers).toHaveLength(2);
      expect(subscribers).toContain(mockClient1);
      expect(subscribers).toContain(mockClient2);
    });

    test('should prevent duplicate subscriptions', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1'); // Duplicate

      const subscribers = subscriptionManager.getBoardSubscribers('board-1');
      expect(subscribers).toHaveLength(1);
    });

    test('should unsubscribe client from board', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');
      subscriptionManager.subscribeToBoard(mockClient2, 'board-1');

      subscriptionManager.unsubscribeFromBoard(mockClient1, 'board-1');

      const subscribers = subscriptionManager.getBoardSubscribers('board-1');
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]).toBe(mockClient2);
    });

    test('should broadcast to board subscribers', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');
      subscriptionManager.subscribeToBoard(mockClient2, 'board-1');

      const message = {
        type: 'task:created',
        data: { id: 'task-1', title: 'New Task' },
      };

      subscriptionManager.broadcastToBoard('board-1', message);

      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    test('should not broadcast to unsubscribed clients', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');
      subscriptionManager.subscribeToBoard(mockClient2, 'board-2');

      const message = {
        type: 'task:created',
        data: { id: 'task-1' },
      };

      subscriptionManager.broadcastToBoard('board-1', message);

      expect(mockClient1.send).toHaveBeenCalled();
      expect(mockClient2.send).not.toHaveBeenCalled();
    });
  });

  describe('Task Subscriptions', () => {
    test('should subscribe client to task', () => {
      subscriptionManager.subscribeToTask(mockClient1, 'task-1');

      const subscribers = subscriptionManager.getTaskSubscribers('task-1');
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]).toBe(mockClient1);
    });

    test('should broadcast to task subscribers', () => {
      subscriptionManager.subscribeToTask(mockClient1, 'task-1');
      subscriptionManager.subscribeToTask(mockClient2, 'task-1');

      const message = {
        type: 'task:updated',
        data: { id: 'task-1', status: 'done' },
      };

      subscriptionManager.broadcastToTask('task-1', message);

      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    test('should unsubscribe client from task', () => {
      subscriptionManager.subscribeToTask(mockClient1, 'task-1');
      subscriptionManager.subscribeToTask(mockClient2, 'task-1');

      subscriptionManager.unsubscribeFromTask(mockClient1, 'task-1');

      const subscribers = subscriptionManager.getTaskSubscribers('task-1');
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]).toBe(mockClient2);
    });
  });

  describe('User Subscriptions', () => {
    test('should subscribe client to user events', () => {
      subscriptionManager.subscribeToUser(mockClient1, 'user-1');

      const subscribers = subscriptionManager.getUserSubscribers('user-1');
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]).toBe(mockClient1);
    });

    test('should handle multiple clients for same user', () => {
      subscriptionManager.subscribeToUser(mockClient1, 'user-1');
      subscriptionManager.subscribeToUser(mockClient3, 'user-1'); // Same user

      const subscribers = subscriptionManager.getUserSubscribers('user-1');
      expect(subscribers).toHaveLength(2);
    });

    test('should broadcast to user subscribers', () => {
      subscriptionManager.subscribeToUser(mockClient1, 'user-1');
      subscriptionManager.subscribeToUser(mockClient3, 'user-1');

      const message = {
        type: 'notification',
        data: { message: 'Task assigned to you' },
      };

      subscriptionManager.broadcastToUser('user-1', message);

      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(mockClient3.send).toHaveBeenCalledWith(JSON.stringify(message));
    });
  });

  describe('Client Management', () => {
    test('should track client subscriptions', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');
      subscriptionManager.subscribeToBoard(mockClient1, 'board-2');
      subscriptionManager.subscribeToTask(mockClient1, 'task-1');

      const subscriptions = subscriptionManager.getClientSubscriptions(mockClient1.id);
      expect(subscriptions.boards).toContain('board-1');
      expect(subscriptions.boards).toContain('board-2');
      expect(subscriptions.tasks).toContain('task-1');
    });

    test('should remove all client subscriptions on disconnect', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');
      subscriptionManager.subscribeToTask(mockClient1, 'task-1');
      subscriptionManager.subscribeToUser(mockClient1, 'user-1');

      subscriptionManager.removeClient(mockClient1);

      expect(subscriptionManager.getBoardSubscribers('board-1')).toHaveLength(0);
      expect(subscriptionManager.getTaskSubscribers('task-1')).toHaveLength(0);
      expect(subscriptionManager.getUserSubscribers('user-1')).toHaveLength(0);
    });

    test('should handle removing non-existent client gracefully', () => {
      const fakeClient = { id: 'fake-client', send: jest.fn() };

      expect(() => {
        subscriptionManager.removeClient(fakeClient as any);
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle send errors gracefully', () => {
      mockClient1.send = jest.fn().mockImplementation(() => {
        throw new Error('Send failed');
      });

      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');

      const message = { type: 'test', data: {} };

      expect(() => {
        subscriptionManager.broadcastToBoard('board-1', message);
      }).not.toThrow();

      expect(logger.error).toHaveBeenCalledWith('Failed to send message to client', {
        clientId: 'client-1',
        error: expect.any(Error),
      });
    });

    test('should skip closed connections', () => {
      mockClient1.readyState = 3; // WebSocket.CLOSED
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');

      const message = { type: 'test', data: {} };
      subscriptionManager.broadcastToBoard('board-1', message);

      expect(mockClient1.send).not.toHaveBeenCalled();
    });

    test('should clean up closed connections automatically', () => {
      mockClient1.readyState = 3; // WebSocket.CLOSED
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');

      subscriptionManager.cleanupClosedConnections();

      expect(subscriptionManager.getBoardSubscribers('board-1')).toHaveLength(0);
    });
  });

  describe('Subscription Statistics', () => {
    test('should return subscription statistics', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');
      subscriptionManager.subscribeToBoard(mockClient2, 'board-1');
      subscriptionManager.subscribeToTask(mockClient1, 'task-1');
      subscriptionManager.subscribeToUser(mockClient3, 'user-1');

      const stats = subscriptionManager.getSubscriptionStats();

      expect(stats.totalClients).toBe(3);
      expect(stats.boardSubscriptions).toBe(1);
      expect(stats.taskSubscriptions).toBe(1);
      expect(stats.userSubscriptions).toBe(1);
      expect(stats.totalSubscriptions).toBe(4);
    });

    test('should return empty stats when no subscriptions exist', () => {
      const stats = subscriptionManager.getSubscriptionStats();

      expect(stats.totalClients).toBe(0);
      expect(stats.totalSubscriptions).toBe(0);
    });
  });

  describe('Bulk Operations', () => {
    test('should broadcast to all clients', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');
      subscriptionManager.subscribeToBoard(mockClient2, 'board-2');

      const message = {
        type: 'system:maintenance',
        data: { message: 'System maintenance in 5 minutes' },
      };

      subscriptionManager.broadcastToAll(message);

      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    test('should unsubscribe client from all subscriptions', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');
      subscriptionManager.subscribeToBoard(mockClient1, 'board-2');
      subscriptionManager.subscribeToTask(mockClient1, 'task-1');

      subscriptionManager.unsubscribeFromAll(mockClient1);

      expect(subscriptionManager.getBoardSubscribers('board-1')).toHaveLength(0);
      expect(subscriptionManager.getBoardSubscribers('board-2')).toHaveLength(0);
      expect(subscriptionManager.getTaskSubscribers('task-1')).toHaveLength(0);
    });
  });

  describe('Memory Management', () => {
    test('should handle large number of subscriptions', () => {
      // Create many subscriptions
      for (let i = 0; i < 1000; i++) {
        const client = {
          id: `client-${i}`,
          send: jest.fn(),
          readyState: 1,
        };
        subscriptionManager.subscribeToBoard(client as any, `board-${i % 10}`);
      }

      const stats = subscriptionManager.getSubscriptionStats();
      expect(stats.totalClients).toBe(1000);
      expect(stats.boardSubscriptions).toBe(10);
    });

    test('should clean up empty subscription maps', () => {
      subscriptionManager.subscribeToBoard(mockClient1, 'board-1');
      subscriptionManager.unsubscribeFromBoard(mockClient1, 'board-1');

      // Internal cleanup should remove empty maps
      const subscribers = subscriptionManager.getBoardSubscribers('board-1');
      expect(subscribers).toHaveLength(0);
    });
  });
});
