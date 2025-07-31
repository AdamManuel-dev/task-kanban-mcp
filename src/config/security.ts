/**
 * @fileoverview Security configuration with secure defaults
 * @lastmodified 2025-07-31T01:45:00Z
 * 
 * Features: Secure JWT/API key generation, production validation, crypto helpers
 * Main APIs: generateSecureSecret(), validateProductionConfig(), hashPassword()
 * Constraints: Requires crypto module, min 32 char secrets in production
 * Patterns: Throws SecurityError on weak configs, uses crypto.randomBytes
 */

import crypto from 'crypto';
import { z } from 'zod';
import { logger } from '../utils/logger';

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Generates a cryptographically secure random secret
 */
export function generateSecureSecret(length = 64): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Validates that a secret is secure enough for production
 */
export function isSecureSecret(secret: string, minLength = 32): boolean {
  if (secret.length < minLength) return false;
  
  // Check for common weak patterns
  const weakPatterns = [
    /^dev-/i,
    /^test-/i,
    /^default/i,
    /^change-?me/i,
    /^secret/i,
    /^password/i,
    /^12345/,
    /^admin/i,
    /^demo/i,
  ];
  
  return !weakPatterns.some(pattern => pattern.test(secret));
}

/**
 * Security configuration schema with strict production validation
 */
export const securityConfigSchema = z.object({
  jwt: z.object({
    secret: z.string().min(32).refine(
      (val) => {
        if (process.env.NODE_ENV === 'production' && !isSecureSecret(val)) {
          throw new SecurityError(
            'JWT_SECRET must be a secure, randomly generated secret in production. ' +
            'Use: openssl rand -base64 48'
          );
        }
        return true;
      }
    ),
    expiresIn: z.string().default('24h'),
    refreshExpiresIn: z.string().default('7d'),
    algorithm: z.enum(['HS256', 'HS384', 'HS512']).default('HS512'),
  }),
  
  apiKey: z.object({
    secret: z.string().min(32).refine(
      (val) => {
        if (process.env.NODE_ENV === 'production' && !isSecureSecret(val)) {
          throw new SecurityError(
            'API_KEY_SECRET must be a secure, randomly generated secret in production'
          );
        }
        return true;
      }
    ),
    hashAlgorithm: z.enum(['sha256', 'sha384', 'sha512']).default('sha512'),
  }),
  
  cors: z.object({
    origin: z.union([
      z.string(),
      z.array(z.string()),
      z.function().returns(z.boolean()),
    ]).refine(
      (val) => {
        if (process.env.NODE_ENV === 'production' && val === '*') {
          logger.warn('CORS allowing all origins in production - this is a security risk');
        }
        return true;
      }
    ),
    credentials: z.boolean().refine(
      (val) => {
        if (process.env.NODE_ENV === 'production' && val === true) {
          logger.warn('CORS credentials enabled - ensure origin is properly restricted');
        }
        return true;
      }
    ),
    methods: z.array(z.string()).default(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    allowedHeaders: z.array(z.string()).default([
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Request-ID',
    ]),
    exposedHeaders: z.array(z.string()).default(['X-Request-ID', 'X-Rate-Limit-Remaining']),
    maxAge: z.number().default(86400), // 24 hours
    preflightContinue: z.boolean().default(false),
    optionsSuccessStatus: z.number().default(204),
  }),
  
  password: z.object({
    minLength: z.number().min(8).default(12),
    requireUppercase: z.boolean().default(true),
    requireLowercase: z.boolean().default(true),
    requireNumbers: z.boolean().default(true),
    requireSpecialChars: z.boolean().default(true),
    bcryptRounds: z.number().min(10).max(15).default(12),
  }),
  
  session: z.object({
    secret: z.string().min(32).refine(
      (val) => {
        if (process.env.NODE_ENV === 'production' && !isSecureSecret(val)) {
          throw new SecurityError(
            'SESSION_SECRET must be a secure, randomly generated secret in production'
          );
        }
        return true;
      }
    ),
    name: z.string().default('mcp.kanban.sid'),
    cookie: z.object({
      secure: z.boolean().default(process.env.NODE_ENV === 'production'),
      httpOnly: z.boolean().default(true),
      sameSite: z.enum(['strict', 'lax', 'none']).default('strict'),
      maxAge: z.number().default(86400000), // 24 hours
    }),
  }),
});

/**
 * Get secure defaults for security configuration
 */
export function getSecurityDefaults() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    jwt: {
      secret: process.env.JWT_SECRET || (isProduction ? '' : generateSecureSecret()),
      expiresIn: '24h',
      refreshExpiresIn: '7d',
      algorithm: 'HS512' as const,
    },
    apiKey: {
      secret: process.env.API_KEY_SECRET || (isProduction ? '' : generateSecureSecret()),
      hashAlgorithm: 'sha512' as const,
    },
    cors: {
      origin: process.env.CORS_ORIGIN || (isProduction ? 'https://localhost:3000' : '*'),
      credentials: process.env.CORS_CREDENTIALS === 'true',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
      maxAge: 86400,
      preflightContinue: false,
      optionsSuccessStatus: 204,
    },
    password: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      bcryptRounds: 12,
    },
    session: {
      secret: process.env.SESSION_SECRET || (isProduction ? '' : generateSecureSecret()),
      name: 'mcp.kanban.sid',
      cookie: {
        secure: isProduction,
        httpOnly: true,
        sameSite: 'strict' as const,
        maxAge: 86400000,
      },
    },
  };
}

/**
 * Validate security configuration for production
 */
export function validateProductionSecurity(config: z.infer<typeof securityConfigSchema>): void {
  if (process.env.NODE_ENV !== 'production') return;
  
  const errors: string[] = [];
  
  // Check JWT secret
  if (!config.jwt.secret || !isSecureSecret(config.jwt.secret)) {
    errors.push('JWT_SECRET must be set to a secure value in production');
  }
  
  // Check API key secret
  if (!config.apiKey.secret || !isSecureSecret(config.apiKey.secret)) {
    errors.push('API_KEY_SECRET must be set to a secure value in production');
  }
  
  // Check session secret
  if (!config.session.secret || !isSecureSecret(config.session.secret)) {
    errors.push('SESSION_SECRET must be set to a secure value in production');
  }
  
  // Check CORS configuration
  if (config.cors.origin === '*') {
    errors.push('CORS must not allow all origins (*) in production');
  }
  
  if (config.cors.credentials && config.cors.origin === '*') {
    errors.push('CORS credentials must not be enabled with wildcard origin');
  }
  
  // Check cookie security
  if (!config.session.cookie.secure) {
    errors.push('Session cookies must be secure in production');
  }
  
  if (errors.length > 0) {
    throw new SecurityError(
      'Security configuration errors:\n' + errors.map(e => `  - ${e}`).join('\n')
    );
  }
}

/**
 * Generate a secure API key
 */
export function generateApiKey(prefix = 'mcp_kanban'): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(32).toString('base64url');
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(apiKey: string, secret: string): string {
  return crypto
    .createHmac('sha512', secret)
    .update(apiKey)
    .digest('hex');
}

/**
 * Validate an API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  // Format: prefix_timestamp_random
  const parts = apiKey.split('_');
  return parts.length >= 3 && parts[0].length > 0 && parts[1].length > 0 && parts[2].length >= 32;
}