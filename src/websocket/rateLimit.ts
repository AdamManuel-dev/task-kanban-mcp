import { logger } from '@/utils/logger';
import { config } from '@/config';

export interface RateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  maxConnections: number;
  maxMessagesPerMinute: number;
  maxSubscriptionsPerClient: number;
}

export class RateLimiter {
  private connectionLimits = new Map<string, RateLimitEntry>();
  private messageLimits = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private config: RateLimitConfig;

  constructor() {
    this.config = {
      windowMs: config.rateLimit?.windowMs || 60000, // 1 minute
      maxRequests: config.rateLimit?.maxRequests || 100,
      maxConnections: config.websocket?.maxConnections || 1000,
      maxMessagesPerMinute: config.websocket?.maxMessagesPerMinute || 120,
      maxSubscriptionsPerClient: config.websocket?.maxSubscriptionsPerClient || 50,
    };

    this.startCleanup();
  }

  // Check if a new connection is allowed from this IP
  checkLimit(ip: string): boolean {
    try {
      const now = Date.now();
      const windowStart = now - this.config.windowMs;

      // Get or create rate limit entry
      let entry = this.connectionLimits.get(ip);
      if (!entry) {
        entry = {
          count: 0,
          firstRequest: now,
          lastRequest: now,
        };
        this.connectionLimits.set(ip, entry);
      }

      // Reset count if window has expired
      if (entry.firstRequest < windowStart) {
        entry.count = 0;
        entry.firstRequest = now;
      }

      // Check if limit exceeded
      if (entry.count >= this.config.maxConnections) {
        logger.warn('Connection rate limit exceeded', {
          ip,
          count: entry.count,
          limit: this.config.maxConnections,
        });
        return false;
      }

      // Increment count
      entry.count++;
      entry.lastRequest = now;

      return true;
    } catch (error) {
      logger.error('Error checking connection rate limit', { ip, error });
      return false;
    }
  }

  // Check if a message is allowed from this client
  checkMessageLimit(clientId: string): boolean {
    try {
      const now = Date.now();
      const windowStart = now - this.config.windowMs;

      // Get or create rate limit entry
      let entry = this.messageLimits.get(clientId);
      if (!entry) {
        entry = {
          count: 0,
          firstRequest: now,
          lastRequest: now,
        };
        this.messageLimits.set(clientId, entry);
      }

      // Reset count if window has expired
      if (entry.firstRequest < windowStart) {
        entry.count = 0;
        entry.firstRequest = now;
      }

      // Check if limit exceeded
      if (entry.count >= this.config.maxMessagesPerMinute) {
        logger.warn('Message rate limit exceeded', {
          clientId,
          count: entry.count,
          limit: this.config.maxMessagesPerMinute,
        });
        return false;
      }

      // Increment count
      entry.count++;
      entry.lastRequest = now;

      return true;
    } catch (error) {
      logger.error('Error checking message rate limit', { clientId, error });
      return false;
    }
  }

  // Get current rate limit status for an IP
  getConnectionStatus(ip: string): {
    requests: number;
    limit: number;
    remaining: number;
    resetTime: number;
  } {
    const entry = this.connectionLimits.get(ip);
    const now = Date.now();
    
    if (!entry) {
      return {
        requests: 0,
        limit: this.config.maxConnections,
        remaining: this.config.maxConnections,
        resetTime: now + this.config.windowMs,
      };
    }

    const windowStart = now - this.config.windowMs;
    const requests = entry.firstRequest < windowStart ? 0 : entry.count;
    const remaining = Math.max(0, this.config.maxConnections - requests);
    const resetTime = entry.firstRequest + this.config.windowMs;

    return {
      requests,
      limit: this.config.maxConnections,
      remaining,
      resetTime,
    };
  }

  // Get current rate limit status for a client
  getMessageStatus(clientId: string): {
    messages: number;
    limit: number;
    remaining: number;
    resetTime: number;
  } {
    const entry = this.messageLimits.get(clientId);
    const now = Date.now();
    
    if (!entry) {
      return {
        messages: 0,
        limit: this.config.maxMessagesPerMinute,
        remaining: this.config.maxMessagesPerMinute,
        resetTime: now + this.config.windowMs,
      };
    }

    const windowStart = now - this.config.windowMs;
    const messages = entry.firstRequest < windowStart ? 0 : entry.count;
    const remaining = Math.max(0, this.config.maxMessagesPerMinute - messages);
    const resetTime = entry.firstRequest + this.config.windowMs;

    return {
      messages,
      limit: this.config.maxMessagesPerMinute,
      remaining,
      resetTime,
    };
  }

  // Remove rate limit entry for a client (when they disconnect)
  removeClient(clientId: string): void {
    this.messageLimits.delete(clientId);
  }

  // Get rate limit statistics
  getStats(): {
    connectionLimits: number;
    messageLimits: number;
    totalConnections: number;
    totalMessages: number;
    config: RateLimitConfig;
  } {
    let totalConnections = 0;
    let totalMessages = 0;

    for (const entry of this.connectionLimits.values()) {
      totalConnections += entry.count;
    }

    for (const entry of this.messageLimits.values()) {
      totalMessages += entry.count;
    }

    return {
      connectionLimits: this.connectionLimits.size,
      messageLimits: this.messageLimits.size,
      totalConnections,
      totalMessages,
      config: this.config,
    };
  }

  // Update rate limit configuration
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Rate limit configuration updated', { config: this.config });
  }

  // Reset rate limits for an IP
  resetConnectionLimits(ip: string): boolean {
    const deleted = this.connectionLimits.delete(ip);
    if (deleted) {
      logger.info('Connection rate limits reset', { ip });
    }
    return deleted;
  }

  // Reset rate limits for a client
  resetMessageLimits(clientId: string): boolean {
    const deleted = this.messageLimits.delete(clientId);
    if (deleted) {
      logger.info('Message rate limits reset', { clientId });
    }
    return deleted;
  }

  // Clear all rate limits
  clearAllLimits(): void {
    const connectionCount = this.connectionLimits.size;
    const messageCount = this.messageLimits.size;
    
    this.connectionLimits.clear();
    this.messageLimits.clear();
    
    logger.info('All rate limits cleared', {
      clearedConnections: connectionCount,
      clearedMessages: messageCount,
    });
  }

  // Advanced rate limiting: burst detection
  detectBurst(clientId: string, threshold: number = 10, timeWindow: number = 1000): boolean {
    const entry = this.messageLimits.get(clientId);
    if (!entry) return false;

    const now = Date.now();
    const recentWindow = now - timeWindow;

    // If last request was very recent and count is high, it might be a burst
    if (entry.lastRequest > recentWindow && entry.count > threshold) {
      logger.warn('Potential burst detected', {
        clientId,
        count: entry.count,
        threshold,
        timeWindow,
      });
      return true;
    }

    return false;
  }

  // Adaptive rate limiting based on server load
  adaptToLoad(serverLoad: number): void {
    const baseMaxMessages = this.config.maxMessagesPerMinute;
    const baseMaxConnections = this.config.maxConnections;

    if (serverLoad > 0.8) {
      // High load: reduce limits
      this.config.maxMessagesPerMinute = Math.floor(baseMaxMessages * 0.5);
      this.config.maxConnections = Math.floor(baseMaxConnections * 0.7);
      logger.info('Rate limits reduced due to high server load', {
        load: serverLoad,
        newMessageLimit: this.config.maxMessagesPerMinute,
        newConnectionLimit: this.config.maxConnections,
      });
    } else if (serverLoad < 0.3) {
      // Low load: restore normal limits
      this.config.maxMessagesPerMinute = baseMaxMessages;
      this.config.maxConnections = baseMaxConnections;
    }
  }

  // Whitelist/blacklist functionality
  private whitelist = new Set<string>();
  private blacklist = new Set<string>();

  addToWhitelist(ip: string): void {
    this.whitelist.add(ip);
    logger.info('IP added to whitelist', { ip });
  }

  removeFromWhitelist(ip: string): void {
    this.whitelist.delete(ip);
    logger.info('IP removed from whitelist', { ip });
  }

  addToBlacklist(ip: string): void {
    this.blacklist.add(ip);
    logger.info('IP added to blacklist', { ip });
  }

  removeFromBlacklist(ip: string): void {
    this.blacklist.delete(ip);
    logger.info('IP removed from blacklist', { ip });
  }

  isWhitelisted(ip: string): boolean {
    return this.whitelist.has(ip);
  }

  isBlacklisted(ip: string): boolean {
    return this.blacklist.has(ip);
  }

  // Enhanced check that considers whitelist/blacklist
  checkEnhancedLimit(ip: string, clientId?: string): boolean {
    // Check blacklist first
    if (this.isBlacklisted(ip)) {
      logger.warn('Blocked request from blacklisted IP', { ip });
      return false;
    }

    // Whitelist bypasses rate limits
    if (this.isWhitelisted(ip)) {
      return true;
    }

    // Apply normal rate limiting
    return this.checkLimit(ip);
  }

  // Start cleanup interval
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.windowMs);
  }

  // Clean up expired entries
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    let cleanedConnections = 0;
    let cleanedMessages = 0;

    // Clean connection limits
    for (const [ip, entry] of this.connectionLimits.entries()) {
      if (entry.lastRequest < windowStart) {
        this.connectionLimits.delete(ip);
        cleanedConnections++;
      }
    }

    // Clean message limits
    for (const [clientId, entry] of this.messageLimits.entries()) {
      if (entry.lastRequest < windowStart) {
        this.messageLimits.delete(clientId);
        cleanedMessages++;
      }
    }

    if (cleanedConnections > 0 || cleanedMessages > 0) {
      logger.debug('Rate limit cleanup completed', {
        cleanedConnections,
        cleanedMessages,
        remainingConnections: this.connectionLimits.size,
        remainingMessages: this.messageLimits.size,
      });
    }
  }

  // Stop cleanup interval
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Rate limiter stopped');
    }
  }
}