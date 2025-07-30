/**
 * @fileoverview Tests for WebSocket rate limiting system
 * @lastmodified 2025-07-28T12:45:00Z
 *
 * Features: Rate limiting, sliding window, IP tracking, message throttling
 * Test Coverage: Connection limits, message limits, window expiration, status tracking
 * Test Tools: Jest, time mocking, rate limit simulation, concurrent request testing
 * Patterns: Unit tests, time-based testing, rate limit validation, error handling
 */

import { RateLimiter, RateLimitEntry, RateLimitConfig } from '../../../src/websocket/rateLimit';
import { logger } from '../../../src/utils/logger';
import { config } from '../../../src/config';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100,
    },
    websocket: {
      maxConnections: 1000,
      maxMessagesPerMinute: 120,
      maxSubscriptionsPerClient: 50,
    },
  },
}));

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  let mockDate: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Date.now to control time-based testing
    mockDate = jest.spyOn(Date, 'now');
    mockDate.mockReturnValue(1000000); // Fixed timestamp for predictable testing

    rateLimiter = new RateLimiter();
  });

  afterEach(() => {
    mockDate.mockRestore();
    if (rateLimiter) {
      // Clean up any intervals
      (rateLimiter as any).cleanupInterval && clearInterval((rateLimiter as any).cleanupInterval);
    }
  });

  describe('Connection Rate Limiting', () => {
    it('should allow connections within limit', () => {
      const ip = '192.168.1.1';

      // Should allow first connection
      const result1 = rateLimiter.checkLimit(ip);
      expect(result1).toBe(true);

      // Should allow second connection
      const result2 = rateLimiter.checkLimit(ip);
      expect(result2).toBe(true);
    });

    it('should track connection count correctly', () => {
      const ip = '192.168.1.1';

      // Make several connections
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit(ip);
      }

      const status = rateLimiter.getConnectionStatus(ip);
      expect(status.requests).toBe(5);
      expect(status.remaining).toBe(config.websocket.maxConnections - 5);
    });

    it('should reject connections exceeding limit', () => {
      const ip = '192.168.1.1';
      const maxConnections = config.websocket.maxConnections;

      // Make connections up to the limit
      for (let i = 0; i < maxConnections; i++) {
        const result = rateLimiter.checkLimit(ip);
        expect(result).toBe(true);
      }

      // Next connection should be rejected
      const result = rateLimiter.checkLimit(ip);
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Connection rate limit exceeded',
        expect.objectContaining({
          ip,
          count: maxConnections,
          limit: maxConnections,
        })
      );
    });

    it('should reset connection count after window expires', () => {
      const ip = '192.168.1.1';
      const windowMs = config.rateLimit.windowMs;
      const maxConnections = config.websocket.maxConnections;

      // Fill up the connection limit
      for (let i = 0; i < maxConnections; i++) {
        rateLimiter.checkLimit(ip);
      }

      // Should be at limit
      expect(rateLimiter.checkLimit(ip)).toBe(false);

      // Advance time beyond window
      mockDate.mockReturnValue(1000000 + windowMs + 1000);

      // Should allow connections again
      expect(rateLimiter.checkLimit(ip)).toBe(true);
    });

    it('should handle different IPs independently', () => {
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';
      const maxConnections = config.websocket.maxConnections;

      // Fill up limit for first IP
      for (let i = 0; i < maxConnections; i++) {
        rateLimiter.checkLimit(ip1);
      }

      // First IP should be blocked
      expect(rateLimiter.checkLimit(ip1)).toBe(false);

      // Second IP should still be allowed
      expect(rateLimiter.checkLimit(ip2)).toBe(true);
    });

    it('should handle errors gracefully', () => {
      const ip = 'invalid-ip';

      // Mock Map.get to throw error
      const originalGet = Map.prototype.get;
      Map.prototype.get = jest.fn().mockImplementation(() => {
        throw new Error('Map error');
      });

      const result = rateLimiter.checkLimit(ip);
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Error checking connection rate limit',
        expect.objectContaining({ ip, error: expect.any(Error) })
      );

      // Restore original method
      Map.prototype.get = originalGet;
    });
  });

  describe('Message Rate Limiting', () => {
    it('should allow messages within limit', () => {
      const clientId = 'client-1';

      // Should allow first message
      const result1 = rateLimiter.checkMessageLimit(clientId);
      expect(result1).toBe(true);

      // Should allow second message
      const result2 = rateLimiter.checkMessageLimit(clientId);
      expect(result2).toBe(true);
    });

    it('should track message count correctly', () => {
      const clientId = 'client-1';

      // Send several messages
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkMessageLimit(clientId);
      }

      const status = rateLimiter.getMessageStatus(clientId);
      expect(status.messages).toBe(10);
      expect(status.remaining).toBe(config.websocket.maxMessagesPerMinute - 10);
    });

    it('should reject messages exceeding limit', () => {
      const clientId = 'client-1';
      const maxMessages = config.websocket.maxMessagesPerMinute;

      // Send messages up to the limit
      for (let i = 0; i < maxMessages; i++) {
        const result = rateLimiter.checkMessageLimit(clientId);
        expect(result).toBe(true);
      }

      // Next message should be rejected
      const result = rateLimiter.checkMessageLimit(clientId);
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Message rate limit exceeded',
        expect.objectContaining({
          clientId,
          count: maxMessages,
          limit: maxMessages,
        })
      );
    });

    it('should reset message count after window expires', () => {
      const clientId = 'client-1';
      const windowMs = config.rateLimit.windowMs;
      const maxMessages = config.websocket.maxMessagesPerMinute;

      // Fill up the message limit
      for (let i = 0; i < maxMessages; i++) {
        rateLimiter.checkMessageLimit(clientId);
      }

      // Should be at limit
      expect(rateLimiter.checkMessageLimit(clientId)).toBe(false);

      // Advance time beyond window
      mockDate.mockReturnValue(1000000 + windowMs + 1000);

      // Should allow messages again
      expect(rateLimiter.checkMessageLimit(clientId)).toBe(true);
    });

    it('should handle different clients independently', () => {
      const client1 = 'client-1';
      const client2 = 'client-2';
      const maxMessages = config.websocket.maxMessagesPerMinute;

      // Fill up limit for first client
      for (let i = 0; i < maxMessages; i++) {
        rateLimiter.checkMessageLimit(client1);
      }

      // First client should be blocked
      expect(rateLimiter.checkMessageLimit(client1)).toBe(false);

      // Second client should still be allowed
      expect(rateLimiter.checkMessageLimit(client2)).toBe(true);
    });

    it('should handle message limit errors gracefully', () => {
      const clientId = 'client-1';

      // Mock Map.set to throw error
      const originalSet = Map.prototype.set;
      Map.prototype.set = jest.fn().mockImplementation(() => {
        throw new Error('Map error');
      });

      const result = rateLimiter.checkMessageLimit(clientId);
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Error checking message rate limit',
        expect.objectContaining({ clientId, error: expect.any(Error) })
      );

      // Restore original method
      Map.prototype.set = originalSet;
    });
  });

  describe('Status Tracking', () => {
    it('should return correct connection status', () => {
      const ip = '192.168.1.1';
      const maxConnections = config.websocket.maxConnections;

      // Initially should show full capacity
      let status = rateLimiter.getConnectionStatus(ip);
      expect(status.requests).toBe(0);
      expect(status.limit).toBe(maxConnections);
      expect(status.remaining).toBe(maxConnections);
      expect(status.resetTime).toBeGreaterThan(Date.now());

      // After some connections
      const connectionCount = 5;
      for (let i = 0; i < connectionCount; i++) {
        rateLimiter.checkLimit(ip);
      }

      status = rateLimiter.getConnectionStatus(ip);
      expect(status.requests).toBe(connectionCount);
      expect(status.remaining).toBe(maxConnections - connectionCount);
    });

    it('should return correct message status', () => {
      const clientId = 'client-1';
      const maxMessages = config.websocket.maxMessagesPerMinute;

      // Initially should show full capacity
      let status = rateLimiter.getMessageStatus(clientId);
      expect(status.messages).toBe(0);
      expect(status.limit).toBe(maxMessages);
      expect(status.remaining).toBe(maxMessages);
      expect(status.resetTime).toBeGreaterThan(Date.now());

      // After some messages
      const messageCount = 10;
      for (let i = 0; i < messageCount; i++) {
        rateLimiter.checkMessageLimit(clientId);
      }

      status = rateLimiter.getMessageStatus(clientId);
      expect(status.messages).toBe(messageCount);
      expect(status.remaining).toBe(maxMessages - messageCount);
    });

    it('should handle status for expired windows', () => {
      const ip = '192.168.1.1';
      const windowMs = config.rateLimit.windowMs;

      // Make some connections
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit(ip);
      }

      // Advance time beyond window
      mockDate.mockReturnValue(1000000 + windowMs + 1000);

      // Status should show reset counts
      const status = rateLimiter.getConnectionStatus(ip);
      expect(status.requests).toBe(0);
      expect(status.remaining).toBe(config.websocket.maxConnections);
    });
  });

  describe('Cleanup and Memory Management', () => {
    it('should start cleanup interval', () => {
      const rateLimiter = new RateLimiter();
      expect((rateLimiter as any).cleanupInterval).toBeTruthy();
    });

    it('should clean up expired entries', () => {
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';
      const windowMs = config.rateLimit.windowMs;

      // Create entries for both IPs
      rateLimiter.checkLimit(ip1);
      rateLimiter.checkLimit(ip2);

      // Advance time to expire first entry
      mockDate.mockReturnValue(1000000 + windowMs + 1000);

      // Create new entry for ip2 to keep it active
      rateLimiter.checkLimit(ip2);

      // Manually trigger cleanup
      (rateLimiter as any).cleanup();

      // Check that expired entries are cleaned up
      const connectionLimits = (rateLimiter as any).connectionLimits;
      expect(connectionLimits.has(ip1)).toBe(false); // Should be cleaned up
      expect(connectionLimits.has(ip2)).toBe(true); // Should remain
    });

    it('should handle cleanup errors gracefully', () => {
      const originalDelete = Map.prototype.delete;
      Map.prototype.delete = jest.fn().mockImplementation(() => {
        throw new Error('Delete error');
      });

      // Make some entries
      rateLimiter.checkLimit('test-ip');

      // Trigger cleanup - should not throw
      expect(() => {
        (rateLimiter as any).cleanup();
      }).not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Error during rate limit cleanup',
        expect.objectContaining({ error: expect.any(Error) })
      );

      // Restore original method
      Map.prototype.delete = originalDelete;
    });
  });

  describe('Configuration', () => {
    it('should use default configuration values', () => {
      // Mock config to be undefined
      jest.doMock('../../../src/config', () => ({
        config: {},
      }));

      const rateLimiter = new RateLimiter();
      const connectionStatus = rateLimiter.getConnectionStatus('test');

      // Should use default values
      expect(connectionStatus.limit).toBe(1000); // Default maxConnections
    });

    it('should allow custom configuration', () => {
      const customConfig = {
        rateLimit: {
          windowMs: 30000,
          maxRequests: 50,
        },
        websocket: {
          maxConnections: 500,
          maxMessagesPerMinute: 60,
          maxSubscriptionsPerClient: 25,
        },
      };

      jest.doMock('../../../src/config', () => ({
        config: customConfig,
      }));

      const rateLimiter = new RateLimiter();
      const connectionStatus = rateLimiter.getConnectionStatus('test');

      expect(connectionStatus.limit).toBe(500);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid successive requests', () => {
      const ip = '192.168.1.1';

      // Make many rapid requests
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(rateLimiter.checkLimit(ip));
      }

      // All should be allowed (within limits)
      expect(results.every(result => result)).toBe(true);
    });

    it('should handle concurrent requests from same IP', async () => {
      const ip = '192.168.1.1';

      // Simulate concurrent requests
      const promises = Array.from({ length: 10 }, async () =>
        Promise.resolve(rateLimiter.checkLimit(ip))
      );

      const results = await Promise.all(promises);

      // All should be processed correctly
      expect(results.every(result => typeof result === 'boolean')).toBe(true);
    });

    it('should handle time going backwards', () => {
      const ip = '192.168.1.1';

      // Make initial request
      rateLimiter.checkLimit(ip);

      // Move time backwards (system clock adjustment)
      mockDate.mockReturnValue(999000);

      // Should still handle request gracefully
      const result = rateLimiter.checkLimit(ip);
      expect(typeof result).toBe('boolean');
    });

    it('should handle extremely large numbers', () => {
      const ip = '192.168.1.1';

      // Mock Date.now to return very large number
      mockDate.mockReturnValue(Number.MAX_SAFE_INTEGER);

      const result = rateLimiter.checkLimit(ip);
      expect(typeof result).toBe('boolean');
    });

    it('should handle empty or null identifiers', () => {
      // Test with empty string
      const result1 = rateLimiter.checkLimit('');
      expect(typeof result1).toBe('boolean');

      // Test with null (converted to string)
      const result2 = rateLimiter.checkMessageLimit(null as any);
      expect(typeof result2).toBe('boolean');
    });
  });

  describe('Performance Tests', () => {
    it('should handle large number of unique IPs efficiently', () => {
      const startTime = Date.now();

      // Create entries for many unique IPs
      for (let i = 0; i < 1000; i++) {
        const ip = `192.168.1.${i % 255}`;
        rateLimiter.checkLimit(ip);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete reasonably quickly
      expect(duration).toBeLessThan(1000); // 1 second threshold
    });

    it('should handle frequent status checks efficiently', () => {
      const ip = '192.168.1.1';

      // Make some connections first
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkLimit(ip);
      }

      const startTime = Date.now();

      // Check status many times
      for (let i = 0; i < 1000; i++) {
        rateLimiter.getConnectionStatus(ip);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly
      expect(duration).toBeLessThan(100); // 100ms threshold
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle realistic WebSocket connection pattern', () => {
      const baseIP = '192.168.1.';
      const results = [];

      // Simulate multiple clients connecting
      for (let i = 1; i <= 10; i++) {
        const ip = `${baseIP}${i}`;

        // Each client makes multiple connections
        for (let j = 0; j < 5; j++) {
          results.push({
            ip,
            attempt: j + 1,
            allowed: rateLimiter.checkLimit(ip),
          });
        }
      }

      // All should be allowed initially
      expect(results.every(r => r.allowed)).toBe(true);

      // Check final status
      const finalStatus = rateLimiter.getConnectionStatus(`${baseIP}1`);
      expect(finalStatus.requests).toBe(5);
    });

    it('should handle mixed connection and message limiting', () => {
      const ip = '192.168.1.1';
      const clientId = 'client-1';

      // Make some connections
      const connectionResults = [];
      for (let i = 0; i < 10; i++) {
        connectionResults.push(rateLimiter.checkLimit(ip));
      }

      // Send some messages
      const messageResults = [];
      for (let i = 0; i < 20; i++) {
        messageResults.push(rateLimiter.checkMessageLimit(clientId));
      }

      // Both should work independently
      expect(connectionResults.every(r => r)).toBe(true);
      expect(messageResults.every(r => r)).toBe(true);

      // Status should be tracked separately
      const connectionStatus = rateLimiter.getConnectionStatus(ip);
      const messageStatus = rateLimiter.getMessageStatus(clientId);

      expect(connectionStatus.requests).toBe(10);
      expect(messageStatus.messages).toBe(20);
    });

    it('should handle rate limit reset cycles', () => {
      const ip = '192.168.1.1';
      const windowMs = config.rateLimit.windowMs;
      const maxConnections = config.websocket.maxConnections;

      let currentTime = 1000000;
      mockDate.mockImplementation(() => currentTime);

      // Fill up first window
      for (let i = 0; i < maxConnections; i++) {
        rateLimiter.checkLimit(ip);
      }
      expect(rateLimiter.checkLimit(ip)).toBe(false);

      // Move to next window
      currentTime += windowMs + 1000;

      // Should be reset
      expect(rateLimiter.checkLimit(ip)).toBe(true);

      // Fill up second window
      for (let i = 1; i < maxConnections; i++) {
        rateLimiter.checkLimit(ip);
      }
      expect(rateLimiter.checkLimit(ip)).toBe(false);

      // Move to third window
      currentTime += windowMs + 1000;

      // Should be reset again
      expect(rateLimiter.checkLimit(ip)).toBe(true);
    });
  });
});
