/**
 * Enhanced API Rate Limiting Middleware
 * Provides per-user rate limiting, adaptive limits, and comprehensive monitoring
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { config } from '@/config';

interface RateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
  burstCount?: number;
  adaptiveMultiplier?: number;
}

interface UserRateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  burstLimit: number;
  adaptiveEnabled: boolean;
}

interface RateLimitAnalytics {
  totalRequests: number;
  blockedRequests: number;
  uniqueUsers: number;
  avgRequestsPerUser: number;
  burstDetections: number;
  adaptiveAdjustments: number;
}

export class EnhancedRateLimiter {
  private readonly globalLimits = new Map<string, RateLimitEntry>();

  private readonly userLimits = new Map<string, RateLimitEntry>();

  private readonly userConfigs = new Map<string, UserRateLimitConfig>();

  private readonly analytics: RateLimitAnalytics = {
    totalRequests: 0,
    blockedRequests: 0,
    uniqueUsers: 0,
    avgRequestsPerUser: 0,
    burstDetections: 0,
    adaptiveAdjustments: 0,
  };

  private cleanupInterval: NodeJS.Timeout | null = null;

  private readonly cleanupIntervalMs = 300000; // 5 minutes

  constructor() {
    this.startCleanup();
  }

  /**
   * Express middleware for enhanced rate limiting
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const ip = this.getClientIP(req);
      const userId = this.getUserId(req);
      const endpoint = `${req.method} ${req.route?.path || req.path}`;

      this.analytics.totalRequests++;

      // Check global IP-based limits
      const globalCheck = this.checkGlobalLimit(ip, endpoint);
      if (!globalCheck.allowed) {
        this.analytics.blockedRequests++;
        this.sendRateLimitResponse(res, globalCheck);
        return;
      }

      // Check user-specific limits if authenticated
      if (userId) {
        const userCheck = this.checkUserLimit(userId, endpoint);
        if (!userCheck.allowed) {
          this.analytics.blockedRequests++;
          this.sendRateLimitResponse(res, userCheck);
          return;
        }

        // Set user-specific headers
        this.setRateLimitHeaders(res, userCheck);
      } else {
        // Set global headers for unauthenticated users
        this.setRateLimitHeaders(res, globalCheck);
      }

      // Log rate limit info
      logger.debug('Rate limit check passed', {
        ip,
        userId,
        endpoint,
        remaining: userId ? this.getUserStatus(userId).remaining : globalCheck.remaining,
      });

      next();
    };
  }

  /**
   * Check global IP-based rate limits
   */
  private checkGlobalLimit(ip: string, _endpoint: string): RateLimitResult {
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = config.rateLimit.maxRequests || 1000;

    let entry = this.globalLimits.get(ip);
    if (!entry) {
      entry = {
        count: 0,
        firstRequest: now,
        lastRequest: now,
      };
      this.globalLimits.set(ip, entry);
    }

    // Reset if window expired
    if (now - entry.firstRequest >= windowMs) {
      entry.count = 0;
      entry.firstRequest = now;
    }

    const allowed = entry.count < maxRequests;
    const remaining = Math.max(0, maxRequests - entry.count);

    if (allowed) {
      entry.count++;
      entry.lastRequest = now;
    }

    const result: RateLimitResult = {
      allowed,
      remaining,
      resetTime: entry.firstRequest + windowMs,
      limit: maxRequests,
    };

    if (!allowed) {
      result.retryAfter = Math.ceil((entry.firstRequest + windowMs - now) / 1000);
    }

    return result;
  }

  /**
   * Check user-specific rate limits with adaptive scaling
   */
  private checkUserLimit(userId: string, _endpoint: string): RateLimitResult {
    const now = Date.now();
    const userConfig = this.getUserConfig(userId);
    const windowMs = 60000; // 1 minute

    let entry = this.userLimits.get(userId);
    if (!entry) {
      entry = {
        count: 0,
        firstRequest: now,
        lastRequest: now,
        burstCount: 0,
        adaptiveMultiplier: 1.0,
      };
      this.userLimits.set(userId, entry);
      this.analytics.uniqueUsers++;
    }

    // Reset if window expired
    if (now - entry.firstRequest >= windowMs) {
      entry.count = 0;
      entry.firstRequest = now;
      entry.burstCount = 0;
    }

    // Adaptive limit calculation
    let effectiveLimit = userConfig.requestsPerMinute;
    if (userConfig.adaptiveEnabled && entry.adaptiveMultiplier) {
      effectiveLimit = Math.floor(effectiveLimit * entry.adaptiveMultiplier);
      if (entry.adaptiveMultiplier !== 1.0) {
        this.analytics.adaptiveAdjustments++;
      }
    }

    // Burst detection
    const timeSinceLastRequest = now - entry.lastRequest;
    if (timeSinceLastRequest < 1000 && entry.burstCount !== undefined) {
      entry.burstCount++;
      if (entry.burstCount >= userConfig.burstLimit) {
        this.analytics.burstDetections++;

        // Temporarily reduce adaptive multiplier
        if (userConfig.adaptiveEnabled) {
          entry.adaptiveMultiplier = Math.max(0.5, (entry.adaptiveMultiplier || 1.0) * 0.8);
        }

        return {
          allowed: false,
          remaining: 0,
          resetTime: entry.firstRequest + windowMs,
          limit: effectiveLimit,
          retryAfter: Math.ceil(userConfig.burstLimit / 10), // 10% of burst limit in seconds
          reason: 'Burst limit exceeded',
        };
      }
    } else if (entry.burstCount !== undefined) {
      entry.burstCount = 0;
    }

    const allowed = entry.count < effectiveLimit;
    const remaining = Math.max(0, effectiveLimit - entry.count);

    if (allowed) {
      entry.count++;
      entry.lastRequest = now;

      // Gradually restore adaptive multiplier for good behavior
      if (
        userConfig.adaptiveEnabled &&
        entry.adaptiveMultiplier &&
        entry.adaptiveMultiplier < 1.0
      ) {
        entry.adaptiveMultiplier = Math.min(1.0, entry.adaptiveMultiplier + 0.01);
      }
    }

    const result: RateLimitResult = {
      allowed,
      remaining,
      resetTime: entry.firstRequest + windowMs,
      limit: effectiveLimit,
    };

    if (!allowed) {
      result.retryAfter = Math.ceil((entry.firstRequest + windowMs - now) / 1000);
    }

    return result;
  }

  /**
   * Get user-specific rate limit configuration
   */
  private getUserConfig(userId: string): UserRateLimitConfig {
    let userConfig = this.userConfigs.get(userId);
    if (!userConfig) {
      // Default configuration - could be customized per user tier
      userConfig = {
        requestsPerMinute: config.rateLimit.maxRequests || 100,
        requestsPerHour: (config.rateLimit.maxRequests || 100) * 60,
        burstLimit: 20,
        adaptiveEnabled: true,
      };
      this.userConfigs.set(userId, userConfig);
    }
    return userConfig;
  }

  /**
   * Set user-specific rate limit configuration
   */
  public setUserConfig(userId: string, config: Partial<UserRateLimitConfig>): void {
    const currentConfig = this.getUserConfig(userId);
    const newConfig = { ...currentConfig, ...config };
    this.userConfigs.set(userId, newConfig);

    logger.info('Updated user rate limit configuration', {
      userId,
      config: newConfig,
    });
  }

  /**
   * Get current rate limit status for a user
   */
  public getUserStatus(userId: string): RateLimitStatus {
    const entry = this.userLimits.get(userId);
    const config = this.getUserConfig(userId);
    const now = Date.now();

    if (!entry) {
      return {
        requests: 0,
        remaining: config.requestsPerMinute,
        resetTime: now + 60000,
        limit: config.requestsPerMinute,
        burstCount: 0,
        adaptiveMultiplier: 1.0,
      };
    }

    const windowStart = now - 60000;
    const requests = entry.firstRequest < windowStart ? 0 : entry.count;
    const effectiveLimit = config.adaptiveEnabled
      ? Math.floor(config.requestsPerMinute * (entry.adaptiveMultiplier || 1.0))
      : config.requestsPerMinute;

    return {
      requests,
      remaining: Math.max(0, effectiveLimit - requests),
      resetTime: entry.firstRequest + 60000,
      limit: effectiveLimit,
      burstCount: entry.burstCount ?? 0,
      adaptiveMultiplier: entry.adaptiveMultiplier || 1.0,
    };
  }

  /**
   * Get analytics data
   */
  public getAnalytics(): RateLimitAnalytics & {
    topUsers: Array<{ userId: string; requests: number }>;
  } {
    // Calculate average requests per user
    if (this.analytics.uniqueUsers > 0) {
      this.analytics.avgRequestsPerUser = this.analytics.totalRequests / this.analytics.uniqueUsers;
    }

    // Get top users by request count
    const topUsers = Array.from(this.userLimits.entries())
      .map(([userId, entry]) => ({ userId, requests: entry.count }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return {
      ...this.analytics,
      topUsers,
    };
  }

  /**
   * Reset rate limits for a user
   */
  public resetUserLimits(userId: string): boolean {
    const deleted = this.userLimits.delete(userId);
    if (deleted) {
      logger.info('User rate limits reset', { userId });
    }
    return deleted;
  }

  /**
   * Extract client IP from request
   */
  private getClientIP(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string).split(',')[0] ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Extract user ID from request (from auth middleware)
   */
  private getUserId(req: Request): string | null {
    return ((req as any).user?.id || (req as any).userId) ?? null;
  }

  /**
   * Send rate limit exceeded response
   */
  private sendRateLimitResponse(res: Response, result: RateLimitResult): void {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: result.reason ?? 'Too many requests',
        details: {
          limit: result.limit,
          remaining: result.remaining,
          resetTime: new Date(result.resetTime).toISOString(),
          retryAfter: result.retryAfter,
        },
      },
    });

    logger.warn('Rate limit exceeded', {
      ip: this.getClientIP(res.req as Request),
      limit: result.limit,
      remaining: result.remaining,
      reason: result.reason,
    });
  }

  /**
   * Set rate limit headers
   */
  private setRateLimitHeaders(res: Response, result: RateLimitResult): void {
    res.set({
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
    });

    if (result.retryAfter) {
      res.set('Retry-After', result.retryAfter.toString());
    }
  }

  /**
   * Start cleanup interval to remove expired entries
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * Clean up expired rate limit entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredThreshold = 3600000; // 1 hour

    let cleanedGlobal = 0;
    let cleanedUser = 0;

    // Clean global limits
    for (const [key, entry] of this.globalLimits.entries()) {
      if (now - entry.lastRequest > expiredThreshold) {
        this.globalLimits.delete(key);
        cleanedGlobal++;
      }
    }

    // Clean user limits
    for (const [key, entry] of this.userLimits.entries()) {
      if (now - entry.lastRequest > expiredThreshold) {
        this.userLimits.delete(key);
        cleanedUser++;
      }
    }

    if (cleanedGlobal > 0 || cleanedUser > 0) {
      logger.debug('Rate limit cleanup completed', {
        cleanedGlobal,
        cleanedUser,
        remainingGlobal: this.globalLimits.size,
        remainingUser: this.userLimits.size,
      });
    }
  }

  /**
   * Stop the rate limiter and cleanup
   */
  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Types
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
  retryAfter?: number;
  reason?: string;
}

interface RateLimitStatus {
  requests: number;
  remaining: number;
  resetTime: number;
  limit: number;
  burstCount: number;
  adaptiveMultiplier: number;
}

// Create singleton instance
export const enhancedRateLimiter = new EnhancedRateLimiter();

// Export middleware
export const rateLimitMiddleware = enhancedRateLimiter.middleware();
