/**
 * @fileoverview Tests for WebSocket subscription management system
 * @lastmodified 2025-07-28T12:30:00Z
 *
 * Features: Subscription handling, channel management, filtering, permission checking
 * Test Coverage: Subscribe/unsubscribe, message broadcasting, filtering, error handling
 * Test Tools: Jest, mock WebSocket clients, subscription simulation, permission testing
 * Patterns: Unit tests, mock dependencies, subscription lifecycle, permission validation
 */

import { SubscriptionManager, Subscription } from '../../../src/websocket/subscriptions';
import { SubscriptionChannel } from '../../../src/websocket/types';
import { WebSocketAuth } from '../../../src/websocket/auth';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/websocket/auth', () => ({
  WebSocketAuth: {
    canSubscribeToChannel: jest.fn(),
    canPublishToChannel: jest.fn(),
    hasPermission: jest.fn(),
  },
}));

// Mock WebSocket Manager
const mockWebSocketManager = {
  getClient: jest.fn(),
  sendToClient: jest.fn(),
  broadcastToClients: jest.fn(),
  getStats: jest.fn(),
  getConnections: jest.fn(),
};

// Mock WebSocket Client
const createMockClient = (id: string, permissions = ['read', 'write']) => ({
  id,
  socket: {
    readyState: 1, // OPEN
    send: jest.fn(),
    close: jest.fn(),
  },
  user: {
    id: `user-${id}`,
    email: `${id}@example.com`,
    permissions,
  },
  permissions,
  connectedAt: new Date(),
  lastActivity: new Date(),
  messageCount: 0,
  subscriptions: new Set<string>(),
});

describe('SubscriptionManager', () => {
  let subscriptionManager: SubscriptionManager;
  let mockAuth: jest.Mocked<typeof WebSocketAuth>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks
    mockWebSocketManager.getClient.mockReset();
    mockWebSocketManager.sendToClient.mockReset();
    mockWebSocketManager.broadcastToClients.mockReset();

    mockAuth = WebSocketAuth as jest.Mocked<typeof WebSocketAuth>;
    mockAuth.canSubscribeToChannel.mockReturnValue(true);
    mockAuth.canPublishToChannel.mockReturnValue(true);
    mockAuth.hasPermission.mockReturnValue(true);

    subscriptionManager = new SubscriptionManager(mockWebSocketManager as any);
  });

  describe('Subscription Management', () => {
    it('should successfully subscribe client to channel', () => {
      const clientId = 'client-1';
      const channel = SubscriptionChannel.TASKS;
      const mockClient = createMockClient(clientId);

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(true);

      const result = subscriptionManager.subscribe(clientId, channel);

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(mockAuth.canSubscribeToChannel).toHaveBeenCalledWith(mockClient.permissions, channel);
    });

    it('should fail to subscribe non-existent client', () => {
      const clientId = 'non-existent-client';
      const channel = SubscriptionChannel.TASKS;

      mockWebSocketManager.getClient.mockReturnValue(null);

      const result = subscriptionManager.subscribe(clientId, channel);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Client not found');
      expect(result.subscriptionId).toBeUndefined();
    });

    it('should fail to subscribe client without permissions', () => {
      const clientId = 'client-1';
      const channel = SubscriptionChannel.ADMIN;
      const mockClient = createMockClient(clientId, ['read']); // No admin permissions

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(false);

      const result = subscriptionManager.subscribe(clientId, channel);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient permissions');
      expect(result.subscriptionId).toBeUndefined();
    });

    it('should subscribe with custom filters', () => {
      const clientId = 'client-1';
      const channel = SubscriptionChannel.TASKS;
      const filters = { boardId: 'board-123', priority: 'high' };
      const mockClient = createMockClient(clientId);

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(true);

      const result = subscriptionManager.subscribe(clientId, channel, filters);

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBeDefined();
    });

    it('should handle duplicate subscriptions', () => {
      const clientId = 'client-1';
      const channel = SubscriptionChannel.TASKS;
      const mockClient = createMockClient(clientId);

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(true);

      // First subscription
      const result1 = subscriptionManager.subscribe(clientId, channel);
      expect(result1.success).toBe(true);

      // Second subscription to same channel
      const result2 = subscriptionManager.subscribe(clientId, channel);
      expect(result2.success).toBe(true);
      expect(result2.subscriptionId).not.toBe(result1.subscriptionId);
    });

    it('should enforce subscription limits', () => {
      const clientId = 'client-1';
      const mockClient = createMockClient(clientId);

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(true);

      // Create 50 subscriptions (the limit)
      for (let i = 0; i < 50; i++) {
        const result = subscriptionManager.subscribe(clientId, SubscriptionChannel.TASKS);
        expect(result.success).toBe(true);
      }

      // Try to create 51st subscription
      const result = subscriptionManager.subscribe(clientId, SubscriptionChannel.TASKS);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Subscription limit exceeded');
    });
  });

  describe('Unsubscription Management', () => {
    it('should successfully unsubscribe from specific subscription', () => {
      const clientId = 'client-1';
      const channel = SubscriptionChannel.TASKS;
      const mockClient = createMockClient(clientId);

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(true);

      // Subscribe first
      const subscribeResult = subscriptionManager.subscribe(clientId, channel);
      expect(subscribeResult.success).toBe(true);
      const subscriptionId = subscribeResult.subscriptionId!;

      // Then unsubscribe
      const result = subscriptionManager.unsubscribe(subscriptionId);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should fail to unsubscribe non-existent subscription', () => {
      const nonExistentId = 'non-existent-subscription';

      const result = subscriptionManager.unsubscribe(nonExistentId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Subscription not found');
    });

    it('should unsubscribe all subscriptions for client', () => {
      const clientId = 'client-1';
      const mockClient = createMockClient(clientId);

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(true);

      // Subscribe to multiple channels
      const channels = [
        SubscriptionChannel.TASKS,
        SubscriptionChannel.BOARDS,
        SubscriptionChannel.NOTES,
      ];
      const subscriptionIds: string[] = [];

      channels.forEach(channel => {
        const result = subscriptionManager.subscribe(clientId, channel);
        expect(result.success).toBe(true);
        subscriptionIds.push(result.subscriptionId!);
      });

      // Unsubscribe all
      const result = subscriptionManager.unsubscribeAll(clientId);
      expect(result.success).toBe(true);
      expect(result.unsubscribedCount).toBe(3);
    });

    it('should handle unsubscribe all for client with no subscriptions', () => {
      const clientId = 'client-without-subscriptions';

      const result = subscriptionManager.unsubscribeAll(clientId);
      expect(result.success).toBe(true);
      expect(result.unsubscribedCount).toBe(0);
    });
  });

  describe('Message Publishing', () => {
    beforeEach(() => {
      // Setup mock clients and subscriptions
      const clients = ['client-1', 'client-2', 'client-3'].map(id => createMockClient(id));
      clients.forEach(client => {
        mockWebSocketManager.getClient.mockReturnValue(client);
        mockAuth.canSubscribeToChannel.mockReturnValue(true);

        // Subscribe each client to tasks channel
        subscriptionManager.subscribe(client.id, SubscriptionChannel.TASKS);
      });
    });

    it('should publish message to all subscribers of channel', () => {
      const message = {
        type: 'task_created' as const,
        data: { id: 'task-123', title: 'New Task', boardId: 'board-1' },
        requestId: 'req-123',
      };

      mockAuth.canPublishToChannel.mockReturnValue(true);

      const result = subscriptionManager.publish(SubscriptionChannel.TASKS, message);
      expect(result.success).toBe(true);
      expect(result.recipientCount).toBeGreaterThan(0);
    });

    it('should apply filters when publishing', () => {
      const clientId = 'filtered-client';
      const mockClient = createMockClient(clientId);

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(true);

      // Subscribe with board filter
      const filters = { boardId: 'board-specific' };
      subscriptionManager.subscribe(clientId, SubscriptionChannel.TASKS, filters);

      const matchingMessage = {
        type: 'task_created' as const,
        data: { id: 'task-123', title: 'Task', boardId: 'board-specific' },
        requestId: 'req-123',
      };

      const nonMatchingMessage = {
        type: 'task_created' as const,
        data: { id: 'task-456', title: 'Task', boardId: 'different-board' },
        requestId: 'req-456',
      };

      mockAuth.canPublishToChannel.mockReturnValue(true);

      // Test matching message
      const result1 = subscriptionManager.publish(SubscriptionChannel.TASKS, matchingMessage);
      expect(result1.success).toBe(true);

      // Test non-matching message
      const result2 = subscriptionManager.publish(SubscriptionChannel.TASKS, nonMatchingMessage);
      expect(result2.success).toBe(true);
    });

    it('should handle system notifications without filters', () => {
      const systemMessage = {
        type: 'system_notification' as const,
        data: {
          level: 'info' as const,
          message: 'System maintenance scheduled',
          timestamp: new Date().toISOString(),
        },
        requestId: 'system-123',
      };

      mockAuth.canPublishToChannel.mockReturnValue(true);

      const result = subscriptionManager.publish(SubscriptionChannel.SYSTEM, systemMessage);
      expect(result.success).toBe(true);
    });

    it('should handle publication context', () => {
      const message = {
        type: 'task_updated' as const,
        data: { id: 'task-123', changes: { status: 'completed' } },
        requestId: 'req-123',
      };

      const context = {
        excludeClient: 'client-1', // Don't send to originating client
        priority: 'high' as const,
        metadata: { source: 'api' },
      };

      mockAuth.canPublishToChannel.mockReturnValue(true);

      const result = subscriptionManager.publish(SubscriptionChannel.TASKS, message, context);
      expect(result.success).toBe(true);
    });

    it('should fail publication without permissions', () => {
      const message = {
        type: 'admin_action' as const,
        data: { action: 'user_banned', userId: 'user-123' },
        requestId: 'req-123',
      };

      mockAuth.canPublishToChannel.mockReturnValue(false);

      const result = subscriptionManager.publish(SubscriptionChannel.ADMIN, message);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient permissions to publish to channel');
    });
  });

  describe('Subscription Filtering', () => {
    it('should match simple field filters', () => {
      const subscription: Subscription = {
        id: 'sub-1',
        clientId: 'client-1',
        channel: SubscriptionChannel.TASKS,
        filters: { boardId: 'board-123' },
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      const matchingMessage = {
        type: 'task_created' as const,
        data: { id: 'task-1', boardId: 'board-123', title: 'Test' },
        requestId: 'req-1',
      };

      const nonMatchingMessage = {
        type: 'task_created' as const,
        data: { id: 'task-2', boardId: 'board-456', title: 'Test' },
        requestId: 'req-2',
      };

      // Access private method for testing
      const matchesFilter = (subscriptionManager as any).matchesFilter;

      expect(matchesFilter(subscription, matchingMessage)).toBe(true);
      expect(matchesFilter(subscription, nonMatchingMessage)).toBe(false);
    });

    it('should match array filters', () => {
      const subscription: Subscription = {
        id: 'sub-1',
        clientId: 'client-1',
        channel: SubscriptionChannel.TASKS,
        filters: { priority: ['high', 'critical'] },
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      const highPriorityMessage = {
        type: 'task_created' as const,
        data: { id: 'task-1', priority: 'high', title: 'Test' },
        requestId: 'req-1',
      };

      const lowPriorityMessage = {
        type: 'task_created' as const,
        data: { id: 'task-2', priority: 'low', title: 'Test' },
        requestId: 'req-2',
      };

      const matchesFilter = (subscriptionManager as any).matchesFilter;

      expect(matchesFilter(subscription, highPriorityMessage)).toBe(true);
      expect(matchesFilter(subscription, lowPriorityMessage)).toBe(false);
    });

    it('should match multiple field filters (AND logic)', () => {
      const subscription: Subscription = {
        id: 'sub-1',
        clientId: 'client-1',
        channel: SubscriptionChannel.TASKS,
        filters: { boardId: 'board-123', assigneeId: 'user-456' },
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      const fullyMatchingMessage = {
        type: 'task_created' as const,
        data: { id: 'task-1', boardId: 'board-123', assigneeId: 'user-456', title: 'Test' },
        requestId: 'req-1',
      };

      const partiallyMatchingMessage = {
        type: 'task_created' as const,
        data: { id: 'task-2', boardId: 'board-123', assigneeId: 'user-789', title: 'Test' },
        requestId: 'req-2',
      };

      const matchesFilter = (subscriptionManager as any).matchesFilter;

      expect(matchesFilter(subscription, fullyMatchingMessage)).toBe(true);
      expect(matchesFilter(subscription, partiallyMatchingMessage)).toBe(false);
    });

    it('should handle empty filters (match all)', () => {
      const subscription: Subscription = {
        id: 'sub-1',
        clientId: 'client-1',
        channel: SubscriptionChannel.TASKS,
        filters: {},
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      const anyMessage = {
        type: 'task_created' as const,
        data: { id: 'task-1', title: 'Test' },
        requestId: 'req-1',
      };

      const matchesFilter = (subscriptionManager as any).matchesFilter;

      expect(matchesFilter(subscription, anyMessage)).toBe(true);
    });
  });

  describe('Subscription Statistics', () => {
    beforeEach(() => {
      // Setup multiple clients and subscriptions
      const clients = ['client-1', 'client-2', 'client-3'];
      clients.forEach(clientId => {
        const mockClient = createMockClient(clientId);
        mockWebSocketManager.getClient.mockReturnValue(mockClient);
        mockAuth.canSubscribeToChannel.mockReturnValue(true);

        // Subscribe to different channels
        subscriptionManager.subscribe(clientId, SubscriptionChannel.TASKS);
        subscriptionManager.subscribe(clientId, SubscriptionChannel.BOARDS);
      });
    });

    it('should return subscription statistics', () => {
      const stats = subscriptionManager.getStats();

      expect(stats.totalSubscriptions).toBeGreaterThan(0);
      expect(stats.uniqueClients).toBeGreaterThan(0);
      expect(stats.channelCounts).toBeDefined();
      expect(stats.channelCounts[SubscriptionChannel.TASKS]).toBeGreaterThan(0);
      expect(stats.channelCounts[SubscriptionChannel.BOARDS]).toBeGreaterThan(0);
    });

    it('should return client subscriptions', () => {
      const clientId = 'client-1';
      const subscriptions = subscriptionManager.getClientSubscriptions(clientId);

      expect(Array.isArray(subscriptions)).toBe(true);
      expect(subscriptions.length).toBeGreaterThan(0);
      expect(subscriptions[0]).toHaveProperty('id');
      expect(subscriptions[0]).toHaveProperty('channel');
      expect(subscriptions[0]).toHaveProperty('filters');
    });

    it('should return empty array for client with no subscriptions', () => {
      const clientId = 'non-existent-client';
      const subscriptions = subscriptionManager.getClientSubscriptions(clientId);

      expect(Array.isArray(subscriptions)).toBe(true);
      expect(subscriptions.length).toBe(0);
    });

    it('should return channel subscribers', () => {
      const subscribers = subscriptionManager.getChannelSubscribers(SubscriptionChannel.TASKS);

      expect(Array.isArray(subscribers)).toBe(true);
      expect(subscribers.length).toBeGreaterThan(0);
      expect(subscribers[0]).toHaveProperty('clientId');
      expect(subscribers[0]).toHaveProperty('subscriptionId');
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket send errors gracefully', () => {
      const clientId = 'client-1';
      const mockClient = createMockClient(clientId);
      mockClient.socket.send = jest.fn().mockImplementation(() => {
        throw new Error('WebSocket send failed');
      });

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockWebSocketManager.sendToClient.mockImplementation(() => {
        throw new Error('Send failed');
      });
      mockAuth.canSubscribeToChannel.mockReturnValue(true);
      mockAuth.canPublishToChannel.mockReturnValue(true);

      // Subscribe
      subscriptionManager.subscribe(clientId, SubscriptionChannel.TASKS);

      // Try to publish - should handle error gracefully
      const message = {
        type: 'task_created' as const,
        data: { id: 'task-123', title: 'Test' },
        requestId: 'req-123',
      };

      const result = subscriptionManager.publish(SubscriptionChannel.TASKS, message);
      expect(result.success).toBe(true); // Should not fail due to send error
      expect(logger.error).toHaveBeenCalled();
    });

    it('should clean up subscriptions for disconnected clients', () => {
      const clientId = 'client-1';
      const mockClient = createMockClient(clientId);
      mockClient.socket.readyState = 3; // CLOSED

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(true);

      // Subscribe
      const subscribeResult = subscriptionManager.subscribe(clientId, SubscriptionChannel.TASKS);
      expect(subscribeResult.success).toBe(true);

      // Simulate cleanup
      subscriptionManager.cleanupClientSubscriptions(clientId);

      // Verify cleanup
      const subscriptions = subscriptionManager.getClientSubscriptions(clientId);
      expect(subscriptions.length).toBe(0);
    });

    it('should handle invalid filter values', () => {
      const clientId = 'client-1';
      const mockClient = createMockClient(clientId);

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(true);

      // Subscribe with function as filter (invalid)
      const invalidFilters = { boardId: () => 'invalid' } as any;

      const result = subscriptionManager.subscribe(
        clientId,
        SubscriptionChannel.TASKS,
        invalidFilters
      );
      expect(result.success).toBe(true); // Should still work, but filter might be ignored
    });

    it('should handle subscription errors gracefully', () => {
      const clientId = 'client-1';

      // Mock getClient to throw an error
      mockWebSocketManager.getClient.mockImplementation(() => {
        throw new Error('Client lookup failed');
      });

      const result = subscriptionManager.subscribe(clientId, SubscriptionChannel.TASKS);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Subscription failed');
      expect(logger.error).toHaveBeenCalledWith('Subscription error', expect.any(Object));
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle large number of subscriptions', () => {
      const clientCount = 100;
      const channelCount = Object.keys(SubscriptionChannel).length;

      // Create many subscriptions
      for (let i = 0; i < clientCount; i++) {
        const clientId = `client-${i}`;
        const mockClient = createMockClient(clientId);
        mockWebSocketManager.getClient.mockReturnValue(mockClient);
        mockAuth.canSubscribeToChannel.mockReturnValue(true);

        Object.values(SubscriptionChannel).forEach(channel => {
          subscriptionManager.subscribe(clientId, channel);
        });
      }

      const stats = subscriptionManager.getStats();
      expect(stats.totalSubscriptions).toBe(clientCount * channelCount);
      expect(stats.uniqueClients).toBe(clientCount);
    });

    it('should update subscription activity timestamps', () => {
      const clientId = 'client-1';
      const mockClient = createMockClient(clientId);

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(true);

      const subscribeResult = subscriptionManager.subscribe(clientId, SubscriptionChannel.TASKS);
      const subscriptionId = subscribeResult.subscriptionId!;

      // Get initial activity time
      const subscriptions = subscriptionManager.getClientSubscriptions(clientId);
      const subscription = subscriptions.find(s => s.id === subscriptionId);
      const initialActivity = subscription?.lastActivity;

      // Wait a bit and trigger activity update
      setTimeout(() => {
        subscriptionManager.updateSubscriptionActivity(subscriptionId);

        const updatedSubscriptions = subscriptionManager.getClientSubscriptions(clientId);
        const updatedSubscription = updatedSubscriptions.find(s => s.id === subscriptionId);

        expect(updatedSubscription?.lastActivity.getTime()).toBeGreaterThan(
          initialActivity?.getTime() || 0
        );
      }, 10);
    });

    it('should batch multiple publications efficiently', () => {
      const clients = Array.from({ length: 10 }, (_, i) => createMockClient(`client-${i}`));

      clients.forEach(client => {
        mockWebSocketManager.getClient.mockReturnValue(client);
        mockAuth.canSubscribeToChannel.mockReturnValue(true);
        subscriptionManager.subscribe(client.id, SubscriptionChannel.TASKS);
      });

      mockAuth.canPublishToChannel.mockReturnValue(true);

      // Batch publish multiple messages
      const messages = Array.from({ length: 5 }, (_, i) => ({
        type: 'task_created' as const,
        data: { id: `task-${i}`, title: `Task ${i}` },
        requestId: `req-${i}`,
      }));

      const startTime = Date.now();

      messages.forEach(message => {
        subscriptionManager.publish(SubscriptionChannel.TASKS, message);
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete reasonably quickly
      expect(duration).toBeLessThan(100); // 100ms threshold
    });
  });

  describe('Integration Tests', () => {
    it('should handle realistic subscription workflow', () => {
      const clientId = 'client-1';
      const mockClient = createMockClient(clientId);

      mockWebSocketManager.getClient.mockReturnValue(mockClient);
      mockAuth.canSubscribeToChannel.mockReturnValue(true);
      mockAuth.canPublishToChannel.mockReturnValue(true);

      // 1. Subscribe to multiple channels
      const tasksSub = subscriptionManager.subscribe(clientId, SubscriptionChannel.TASKS);
      const boardsSub = subscriptionManager.subscribe(clientId, SubscriptionChannel.BOARDS);
      const notesSub = subscriptionManager.subscribe(clientId, SubscriptionChannel.NOTES, {
        boardId: 'board-123',
      });

      expect(tasksSub.success).toBe(true);
      expect(boardsSub.success).toBe(true);
      expect(notesSub.success).toBe(true);

      // 2. Publish messages to subscribed channels
      const taskMessage = {
        type: 'task_created' as const,
        data: { id: 'task-1', title: 'New Task' },
        requestId: 'req-1',
      };

      const noteMessage = {
        type: 'note_added' as const,
        data: { id: 'note-1', boardId: 'board-123', content: 'Test note' },
        requestId: 'req-2',
      };

      const taskResult = subscriptionManager.publish(SubscriptionChannel.TASKS, taskMessage);
      const noteResult = subscriptionManager.publish(SubscriptionChannel.NOTES, noteMessage);

      expect(taskResult.success).toBe(true);
      expect(noteResult.success).toBe(true);

      // 3. Unsubscribe from one channel
      const unsubResult = subscriptionManager.unsubscribe(tasksSub.subscriptionId!);
      expect(unsubResult.success).toBe(true);

      // 4. Clean up all subscriptions
      const cleanupResult = subscriptionManager.unsubscribeAll(clientId);
      expect(cleanupResult.success).toBe(true);
      expect(cleanupResult.unsubscribedCount).toBe(2); // boards and notes remaining
    });
  });
});
