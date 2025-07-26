import { logger } from '@/utils/logger';
import { WebSocketClient, SubscriptionChannel, SubscriptionFilter } from './types';
import { WebSocketManager } from './server';

export interface Subscription {
  id: string;
  clientId: string;
  channel: SubscriptionChannel;
  filters: SubscriptionFilter;
  createdAt: Date;
  lastActivity: Date;
}

export class SubscriptionManager {
  private subscriptions = new Map<string, Subscription>();
  private clientSubscriptions = new Map<string, Set<string>>();
  private channelSubscriptions = new Map<SubscriptionChannel, Set<string>>();
  private webSocketManager: WebSocketManager;

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
      if (!this.webSocketManager['auth'].canSubscribeToChannel(client.permissions, channel)) {
        return { success: false, error: 'Insufficient permissions' };
      }

      // Check subscription limits
      const currentSubscriptions = this.clientSubscriptions.get(clientId) || new Set();
      if (currentSubscriptions.size >= 50) { // Max 50 subscriptions per client
        return { success: false, error: 'Subscription limit exceeded' };
      }

      // Create subscription ID
      const subscriptionId = `${clientId}_${channel}_${Date.now()}`;

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
    const clientSubs = this.clientSubscriptions.get(clientId);
    if (!clientSubs) return 0;

    let count = 0;
    const subscriptionIds = Array.from(clientSubs);

    for (const subscriptionId of subscriptionIds) {
      if (this.unsubscribe(subscriptionId)) {
        count++;
      }
    }

    logger.info('Client unsubscribed from all channels', { clientId, count });
    return count;
  }

  // Publish message to channel subscribers
  publishToChannel(
    channel: SubscriptionChannel,
    message: any,
    filterCallback?: (subscription: Subscription, client: WebSocketClient) => boolean
  ): number {
    const channelSubs = this.channelSubscriptions.get(channel);
    if (!channelSubs || channelSubs.size === 0) {
      return 0;
    }

    let sentCount = 0;

    for (const subscriptionId of channelSubs) {
      const subscription = this.subscriptions.get(subscriptionId);
      if (!subscription) continue;

      const client = this.webSocketManager.getClient(subscription.clientId);
      if (!client) continue;

      // Check if client should receive this message
      if (filterCallback && !filterCallback(subscription, client)) {
        continue;
      }

      // Check subscription filters
      if (!this.matchesFilters(message, subscription.filters)) {
        continue;
      }

      // Send message
      if (this.webSocketManager.sendToClient(subscription.clientId, {
        type: 'channel_message',
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        payload: {
          channel,
          subscriptionId,
          data: message,
        },
      })) {
        sentCount++;
        subscription.lastActivity = new Date();
      }
    }

    return sentCount;
  }

  // Publish to specific board subscribers
  publishBoardUpdate(boardId: string, message: any): number {
    return this.publishToChannel(
      SubscriptionChannel.BOARD,
      message,
      (subscription) => {
        return !subscription.filters.boardId || subscription.filters.boardId === boardId;
      }
    );
  }

  // Publish to specific task subscribers
  publishTaskUpdate(taskId: string, boardId: string, message: any): number {
    let count = 0;

    // Send to task subscribers
    count += this.publishToChannel(
      SubscriptionChannel.TASK,
      message,
      (subscription) => {
        return !subscription.filters.taskId || subscription.filters.taskId === taskId;
      }
    );

    // Send to board subscribers
    count += this.publishToChannel(
      SubscriptionChannel.BOARD,
      message,
      (subscription) => {
        return !subscription.filters.boardId || subscription.filters.boardId === boardId;
      }
    );

    return count;
  }

  // Publish user presence updates
  publishUserPresence(userId: string, status: 'online' | 'offline' | 'away', context?: any): number {
    return this.publishToChannel(
      SubscriptionChannel.USER_PRESENCE,
      {
        userId,
        status,
        timestamp: new Date().toISOString(),
        ...context,
      },
      (subscription) => {
        return !subscription.filters.userId || subscription.filters.userId === userId;
      }
    );
  }

  // Publish system notifications
  publishSystemNotification(notification: any, targetUsers?: string[]): number {
    return this.publishToChannel(
      SubscriptionChannel.SYSTEM_NOTIFICATIONS,
      notification,
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
  cleanupExpiredSubscriptions(maxIdleTime: number = 30 * 60 * 1000): number { // 30 minutes
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
  private matchesFilters(message: any, filters: SubscriptionFilter): boolean {
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

  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  // Message type specific publishing methods
  publishTaskCreated(task: any, createdBy: string): number {
    return this.publishTaskUpdate(task.id, task.board_id, {
      type: 'task_created',
      task,
      createdBy,
      timestamp: new Date().toISOString(),
    });
  }

  publishTaskUpdated(task: any, changes: Record<string, any>, updatedBy: string): number {
    return this.publishTaskUpdate(task.id, task.board_id, {
      type: 'task_updated',
      task,
      changes,
      updatedBy,
      timestamp: new Date().toISOString(),
    });
  }

  publishTaskDeleted(taskId: string, boardId: string, deletedBy: string): number {
    return this.publishTaskUpdate(taskId, boardId, {
      type: 'task_deleted',
      taskId,
      boardId,
      deletedBy,
      timestamp: new Date().toISOString(),
    });
  }

  publishNoteAdded(note: any, taskId: string, boardId: string, addedBy: string): number {
    return this.publishTaskUpdate(taskId, boardId, {
      type: 'note_added',
      note,
      taskId,
      boardId,
      addedBy,
      timestamp: new Date().toISOString(),
    });
  }

  publishTagAssigned(taskId: string, tagId: string, boardId: string, assignedBy: string): number {
    return this.publishTaskUpdate(taskId, boardId, {
      type: 'tag_assigned',
      taskId,
      tagId,
      boardId,
      assignedBy,
      timestamp: new Date().toISOString(),
    });
  }
}