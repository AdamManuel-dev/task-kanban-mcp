import { logger } from '../utils/logger';
import type { WebSocketClient, SubscriptionFilter } from './types';
import { SubscriptionChannel } from './types';
import type { WebSocketManager } from './server';
import type { AllWebSocketMessages, SystemNotification, PublicationContext } from './messageTypes';
import type { Task, Note } from '../types';
import { WebSocketAuth } from './auth';

export interface Subscription {
  id: string;
  clientId: string;
  channel: SubscriptionChannel;
  filters: SubscriptionFilter;
  createdAt: Date;
  lastActivity: Date;
}

export class SubscriptionManager {
  setClientFilter(_clientId: string, _channel: string, _filter: Record<string, unknown>): void {
    throw new Error('Method not implemented.');
  }

  private readonly subscriptions = new Map<string, Subscription>();

  private readonly clientSubscriptions = new Map<string, Set<string>>();

  private readonly channelSubscriptions = new Map<SubscriptionChannel, Set<string>>();

  private readonly webSocketManager: WebSocketManager;

  constructor(webSocketManager: WebSocketManager) {
    this.webSocketManager = webSocketManager;
  }

  // Subscribe to a channel
  subscribe(
    clientId: string,
    channel: SubscriptionChannel,
    filters: SubscriptionFilter = {}
  ): { success: boolean; subscriptionId?: string; error?: string } {
    try {
      const client = this.webSocketManager.getClient(clientId);
      if (!client) {
        return { success: false, error: 'Client not found' };
      }

      // Check permissions
      if (!WebSocketAuth.canSubscribeToChannel(client.permissions, channel)) {
        return { success: false, error: 'Insufficient permissions' };
      }

      // Check subscription limits
      const currentSubscriptions = this.clientSubscriptions.get(clientId) ?? new Set();
      if (currentSubscriptions.size >= 50) {
        // Max 50 subscriptions per client
        return { success: false, error: 'Subscription limit exceeded' };
      }

      // Create subscription ID
      const subscriptionId = `${String(clientId)}_${String(channel)}_${String(Date.now())}`;

      // Create subscription
      const subscription: Subscription = {
        id: subscriptionId,
        clientId,
        channel,
        filters,
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      // Store subscription
      this.subscriptions.set(subscriptionId, subscription);

      // Update client subscriptions
      if (!this.clientSubscriptions.has(clientId)) {
        this.clientSubscriptions.set(clientId, new Set());
      }
      this.clientSubscriptions.get(clientId)!.add(subscriptionId);
      client.subscriptions.add(subscriptionId);

      // Update channel subscriptions
      if (!this.channelSubscriptions.has(channel)) {
        this.channelSubscriptions.set(channel, new Set());
      }
      this.channelSubscriptions.get(channel)!.add(subscriptionId);

      logger.info('Client subscribed to channel', {
        clientId,
        channel,
        subscriptionId,
        filters,
      });

      return { success: true, subscriptionId };
    } catch (error) {
      logger.error('Subscription error', { clientId, channel, error });
      return { success: false, error: 'Subscription failed' };
    }
  }

  // Unsubscribe from a channel
  unsubscribe(subscriptionId: string): boolean {
    try {
      const subscription = this.subscriptions.get(subscriptionId);
      if (!subscription) {
        return false;
      }

      const { clientId, channel } = subscription;

      // Remove from subscriptions
      this.subscriptions.delete(subscriptionId);

      // Remove from client subscriptions
      const clientSubs = this.clientSubscriptions.get(clientId);
      if (clientSubs) {
        clientSubs.delete(subscriptionId);
        if (clientSubs.size === 0) {
          this.clientSubscriptions.delete(clientId);
        }
      }

      // Remove from client object
      const client = this.webSocketManager.getClient(clientId);
      if (client) {
        client.subscriptions.delete(subscriptionId);
      }

      // Remove from channel subscriptions
      const channelSubs = this.channelSubscriptions.get(channel);
      if (channelSubs) {
        channelSubs.delete(subscriptionId);
        if (channelSubs.size === 0) {
          this.channelSubscriptions.delete(channel);
        }
      }

      logger.info('Client unsubscribed from channel', {
        clientId,
        channel,
        subscriptionId,
      });

      return true;
    } catch (error) {
      logger.error('Unsubscription error', { subscriptionId, error });
      return false;
    }
  }

  // Unsubscribe client from all channels
  unsubscribeAll(clientId: string): number {
    let unsubscribedCount = 0;
    const clientSubs = this.clientSubscriptions.get(clientId);

    if (clientSubs) {
      const subscriptionIds = Array.from(clientSubs);
      subscriptionIds.forEach(subscriptionId => {
        if (this.unsubscribe(subscriptionId)) {
          unsubscribedCount += 1;
        }
      });
    }

    return unsubscribedCount;
  }

  // Update subscription activity timestamp
  updateSubscriptionActivity(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    subscription.lastActivity = new Date();
    return true;
  }

  // Publish message to all subscribers of a channel
  publishToChannel(
    channel: SubscriptionChannel,
    message: AllWebSocketMessages,
    filterCallback?: (subscription: Subscription, client: WebSocketClient) => boolean
  ): number {
    let publishedCount = 0;
    const channelSubs = this.channelSubscriptions.get(channel);

    if (!channelSubs) {
      return 0;
    }

    const subscriptionIds = Array.from(channelSubs);
    subscriptionIds.forEach(subscriptionId => {
      const subscription = this.subscriptions.get(subscriptionId);
      if (!subscription) {
        return;
      }

      const client = this.webSocketManager.getClient(subscription.clientId);
      if (!client) {
        return;
      }

      // Check if message matches subscription filters
      if (!SubscriptionManager.matchesFilters(message, subscription.filters)) {
        return;
      }

      // Apply custom filter if provided
      if (filterCallback && !filterCallback(subscription, client)) {
        return;
      }

      // Send message to client
      const success = this.webSocketManager.sendToClient(subscription.clientId, message);
      if (success) {
        publishedCount += 1;
        subscription.lastActivity = new Date();
      }
    });

    return publishedCount;
  }

  // Publish to specific board subscribers
  publishBoardUpdate(boardId: string, message: AllWebSocketMessages): number {
    return this.publishToChannel(
      SubscriptionChannel.BOARD,
      message,
      subscription => !subscription.filters.boardId || subscription.filters.boardId === boardId
    );
  }

  // Publish to specific task subscribers
  publishTaskUpdate(taskId: string, boardId: string, message: AllWebSocketMessages): number {
    let count = 0;

    // Send to task subscribers
    count += this.publishToChannel(
      SubscriptionChannel.TASK,
      message,
      subscription => !subscription.filters.taskId || subscription.filters.taskId === taskId
    );

    // Send to board subscribers
    count += this.publishToChannel(
      SubscriptionChannel.BOARD,
      message,
      subscription => !subscription.filters.boardId || subscription.filters.boardId === boardId
    );

    return count;
  }

  // Publish user presence updates
  publishUserPresence(
    userId: string,
    status: 'online' | 'offline' | 'away',
    context?: PublicationContext
  ): number {
    const message = {
      id: `connection-${userId}-${Date.now()}`,
      type: 'connection:status' as const,
      data: {
        status: status === 'online' ? ('connected' as const) : ('disconnected' as const),
        timestamp: new Date().toISOString(),
        clientId: userId,
      },
      timestamp: new Date().toISOString(),
      ...context,
    };

    return this.publishToChannel(
      SubscriptionChannel.USER_PRESENCE,
      message,
      subscription => !subscription.filters.userId || subscription.filters.userId === userId
    );
  }

  // Publish system notifications
  publishSystemNotification(notification: SystemNotification, targetUsers?: string[]): number {
    const message = {
      id: `notification-${Date.now()}`,
      type: 'system:notification' as const,
      data: notification,
      timestamp: new Date().toISOString(),
    };

    return this.publishToChannel(
      SubscriptionChannel.SYSTEM_NOTIFICATIONS,
      message,
      (_subscription, client) => {
        if (!targetUsers) return true;
        return !!(client.user && targetUsers.includes(client.user.id));
      }
    );
  }

  // Get client subscriptions
  getClientSubscriptions(clientId: string): Subscription[] {
    const clientSubs = this.clientSubscriptions.get(clientId);
    if (!clientSubs) return [];

    return Array.from(clientSubs)
      .map(id => this.subscriptions.get(id))
      .filter(Boolean) as Subscription[];
  }

  // Get channel subscribers
  getChannelSubscribers(channel: SubscriptionChannel): Subscription[] {
    const channelSubs = this.channelSubscriptions.get(channel);
    if (!channelSubs) return [];

    return Array.from(channelSubs)
      .map(id => this.subscriptions.get(id))
      .filter(Boolean) as Subscription[];
  }

  // Get subscription statistics
  getStats(): {
    totalSubscriptions: number;
    activeClients: number;
    channelStats: Record<string, number>;
    averageSubscriptionsPerClient: number;
  } {
    const channelStats: Record<string, number> = {};

    for (const [channel, subs] of this.channelSubscriptions) {
      channelStats[channel] = subs.size;
    }

    const activeClients = this.clientSubscriptions.size;
    const totalSubscriptions = this.subscriptions.size;

    return {
      totalSubscriptions,
      activeClients,
      channelStats,
      averageSubscriptionsPerClient: activeClients > 0 ? totalSubscriptions / activeClients : 0,
    };
  }

  // Clean up expired subscriptions
  cleanupExpiredSubscriptions(maxIdleTime: number = 30 * 60 * 1000): number {
    // 30 minutes
    const now = new Date();
    const expiredSubscriptions: string[] = [];

    for (const [id, subscription] of this.subscriptions) {
      if (now.getTime() - subscription.lastActivity.getTime() > maxIdleTime) {
        expiredSubscriptions.push(id);
      }
    }

    let cleanedCount = 0;
    for (const id of expiredSubscriptions) {
      if (this.unsubscribe(id)) {
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up expired subscriptions', { count: cleanedCount });
    }

    return cleanedCount;
  }

  // Private helper methods
  private static matchesFilters(
    message: AllWebSocketMessages,
    filters: SubscriptionFilter
  ): boolean {
    // If no filters, match all
    if (!filters || Object.keys(filters).length === 0) {
      return true;
    }

    // Check each filter
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;

      const messageValue = this.getNestedProperty(message, key);

      if (Array.isArray(value)) {
        if (!value.includes(messageValue)) return false;
      } else if (messageValue !== value) {
        return false;
      }
    }

    return true;
  }

  private static getNestedProperty(obj: AllWebSocketMessages, path: string): unknown {
    // For our message structure, common paths are:
    // - type: message.type
    // - boardId: message.data.boardId
    // - taskId: message.data.taskId
    // - userId: message.data.userId

    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as any)[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  // Message type specific publishing methods
  publishTaskCreated(task: Task, createdBy: string): number {
    return this.publishTaskUpdate(task.id, task.board_id, {
      id: `task-created-${task.id}`,
      type: 'task:created',
      data: {
        task,
        createdBy,
        boardId: task.board_id,
      },
      timestamp: new Date().toISOString(),
    });
  }

  publishTaskUpdated(task: Task, changes: Record<string, unknown>, updatedBy: string): number {
    return this.publishTaskUpdate(task.id, task.board_id, {
      id: `task-updated-${task.id}`,
      type: 'task:updated',
      data: {
        task,
        changes,
        updatedBy,
        boardId: task.board_id,
      },
      timestamp: new Date().toISOString(),
    });
  }

  publishTaskDeleted(taskId: string, boardId: string, deletedBy: string): number {
    return this.publishTaskUpdate(taskId, boardId, {
      id: `task-deleted-${taskId}`,
      type: 'task:deleted',
      data: {
        taskId,
        deletedBy,
        boardId,
      },
      timestamp: new Date().toISOString(),
    });
  }

  publishNoteAdded(note: Note, taskId: string, boardId: string, addedBy: string): number {
    return this.publishTaskUpdate(taskId, boardId, {
      id: `note-added-${note.id}`,
      type: 'note:added',
      data: {
        note,
        taskId,
        boardId,
        addedBy,
      },
      timestamp: new Date().toISOString(),
    });
  }

  publishTagAssigned(taskId: string, tagId: string, boardId: string, assignedBy: string): number {
    return this.publishTaskUpdate(taskId, boardId, {
      id: `tag-assigned-${taskId}-${tagId}`,
      type: 'tag:assigned',
      data: {
        taskId,
        tagId,
        boardId,
        assignedBy,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
