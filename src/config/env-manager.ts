/**
 * Environment Variable Manager
 * Advanced environment variable handling with validation, type conversion, and security
 *
 * @module config/env-manager
 * @description Provides secure and type-safe environment variable management with
 * validation, transformation, caching, and cloud platform integration.
 */

import { z } from 'zod';
import { logger } from '../utils/logger';
import { CLOUD_ENV } from './cloud-env';

export interface EnvValidationRule {
  key: string;
  schema: z.ZodSchema;
  required: boolean;
  sensitive: boolean;
  description: string;
  defaultValue?: any;
  cloudOverrides?: Record<string, any>;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missing: string[];
  invalid: string[];
  values: Record<string, any>;
}

/**
 * Environment variable validation rules
 */
export const ENV_RULES: readonly EnvValidationRule[] = [
  // Server configuration
  {
    key: 'NODE_ENV',
    schema: z.enum(['development', 'production', 'test']),
    required: false,
    sensitive: false,
    description: 'Node.js environment mode',
    defaultValue: 'development',
  },
  {
    key: 'PORT',
    schema: z
      .string()
      .transform(val => parseInt(val, 10))
      .pipe(z.number().int().min(1).max(65535)),
    required: false,
    sensitive: false,
    description: 'Server port number',
    defaultValue: 3000,
    cloudOverrides: {
      replit: 3000,
      codespaces: 3000,
      gitpod: 3000,
    },
  },
  {
    key: 'HOST',
    schema: z.string().min(1),
    required: false,
    sensitive: false,
    description: 'Server host address',
    defaultValue: 'localhost',
    cloudOverrides: {
      replit: '0.0.0.0',
      codespaces: '0.0.0.0',
      gitpod: '0.0.0.0',
      stackblitz: '0.0.0.0',
      codesandbox: '0.0.0.0',
    },
  },

  // Database configuration
  {
    key: 'DATABASE_URL',
    schema: z.string().min(1),
    required: false,
    sensitive: false,
    description: 'Database connection URL or file path',
    defaultValue: 'file:./data/kanban.db',
  },
  {
    key: 'DATABASE_MEMORY_LIMIT',
    schema: z
      .string()
      .transform(val => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    required: false,
    sensitive: false,
    description: 'Database memory limit in bytes',
    defaultValue: 268435456, // 256MB
    cloudOverrides: {
      replit: 134217728, // 128MB
      stackblitz: 67108864, // 64MB
    },
  },

  // Security configuration
  {
    key: 'JWT_SECRET',
    schema: z.string().min(32),
    required: true,
    sensitive: true,
    description: 'JWT signing secret (minimum 32 characters)',
    defaultValue: 'dev-jwt-secret-change-in-production-min-32-chars',
  },
  {
    key: 'API_KEY_SECRET',
    schema: z.string().min(16),
    required: true,
    sensitive: true,
    description: 'API key signing secret (minimum 16 characters)',
    defaultValue: 'dev-api-secret-change-in-production',
  },
  {
    key: 'API_KEYS',
    schema: z
      .string()
      .transform(val => val.split(','))
      .pipe(z.array(z.string().min(1))),
    required: false,
    sensitive: true,
    description: 'Comma-separated list of valid API keys',
    defaultValue: ['dev-api-key-1'],
  },

  // Performance configuration
  {
    key: 'MAX_MEMORY_USAGE',
    schema: z
      .string()
      .transform(val => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    required: false,
    sensitive: false,
    description: 'Maximum memory usage in MB',
    defaultValue: 512,
    cloudOverrides: {
      replit: 512,
      codespaces: 4096,
      gitpod: 2048,
      stackblitz: 256,
      codesandbox: 512,
    },
  },
  {
    key: 'REQUEST_TIMEOUT',
    schema: z
      .string()
      .transform(val => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    required: false,
    sensitive: false,
    description: 'Request timeout in milliseconds',
    defaultValue: 30000,
  },

  // Feature flags
  {
    key: 'ENABLE_ANALYTICS',
    schema: z
      .string()
      .transform(val => val.toLowerCase() === 'true')
      .pipe(z.boolean()),
    required: false,
    sensitive: false,
    description: 'Enable analytics and monitoring',
    defaultValue: true,
  },
  {
    key: 'ENABLE_WEBSOCKETS',
    schema: z
      .string()
      .transform(val => val.toLowerCase() === 'true')
      .pipe(z.boolean()),
    required: false,
    sensitive: false,
    description: 'Enable WebSocket real-time features',
    defaultValue: true,
    cloudOverrides: {
      stackblitz: false, // WebSockets unreliable in StackBlitz
    },
  },
  {
    key: 'ENABLE_BACKUP_SCHEDULING',
    schema: z
      .string()
      .transform(val => val.toLowerCase() === 'true')
      .pipe(z.boolean()),
    required: false,
    sensitive: false,
    description: 'Enable automatic backup scheduling',
    defaultValue: true,
    cloudOverrides: {
      stackblitz: false, // Limited file system
      codesandbox: false,
    },
  },

  // Logging configuration
  {
    key: 'LOG_LEVEL',
    schema: z.enum(['error', 'warn', 'info', 'debug']),
    required: false,
    sensitive: false,
    description: 'Logging level',
    defaultValue: 'info',
  },
  {
    key: 'LOG_FORMAT',
    schema: z.enum(['text', 'json']),
    required: false,
    sensitive: false,
    description: 'Log output format',
    defaultValue: 'text',
    cloudOverrides: {
      replit: 'json',
      codespaces: 'json',
      gitpod: 'json',
    },
  },

  // CORS configuration
  {
    key: 'CORS_ORIGIN',
    schema: z.string(),
    required: false,
    sensitive: false,
    description: 'CORS allowed origins',
    defaultValue: 'http://localhost:3000',
    cloudOverrides: {
      replit: '*',
      codespaces: '*',
      gitpod: '*',
      stackblitz: '*',
      codesandbox: '*',
    },
  },

  // Rate limiting
  {
    key: 'RATE_LIMIT_WINDOW_MS',
    schema: z
      .string()
      .transform(val => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    required: false,
    sensitive: false,
    description: 'Rate limit window in milliseconds',
    defaultValue: 900000, // 15 minutes
  },
  {
    key: 'RATE_LIMIT_MAX_REQUESTS',
    schema: z
      .string()
      .transform(val => parseInt(val, 10))
      .pipe(z.number().int().positive()),
    required: false,
    sensitive: false,
    description: 'Maximum requests per window',
    defaultValue: 1000,
    cloudOverrides: {
      replit: 500,
      stackblitz: 200,
      codesandbox: 300,
    },
  },
];

/**
 * Environment variable manager class
 */
export class EnvironmentManager {
  private readonly cache: Map<string, any> = new Map();

  private validated = false; // eslint-disable-line @typescript-eslint/no-unused-vars

  /**
   * Gets an environment variable with type conversion and validation
   */
  get<T>(key: string, defaultValue?: T): T {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const rule = ENV_RULES.find(r => r.key === key);
    if (!rule) {
      // Fallback for unknown keys
      const value = process.env[key] ?? defaultValue;
      this.cache.set(key, value);
      return value as T;
    }

    try {
      const rawValue = this.getRawValue(key, rule);
      const parsedValue = rule.schema.parse(rawValue);
      this.cache.set(key, parsedValue);
      return parsedValue;
    } catch (error) {
      logger.warn(`Failed to parse environment variable ${key}:`, error);

      const fallback = this.getDefaultValue(rule) ?? defaultValue;
      this.cache.set(key, fallback);
      return fallback as T;
    }
  }

  /**
   * Sets an environment variable (runtime only)
   */
  set(key: string, value: any): void {
    process.env[key] = String(value);
    this.cache.delete(key); // Clear cache to force re-parsing
  }

  /**
   * Validates all environment variables
   */
  validate(): EnvValidationResult {
    const result: EnvValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      missing: [],
      invalid: [],
      values: {},
    };

    for (const rule of ENV_RULES) {
      try {
        const rawValue = this.getRawValue(rule.key, rule);

        if (rawValue === undefined && rule.required) {
          result.missing.push(rule.key);
          result.errors.push(
            `Missing required environment variable: ${rule.key} - ${rule.description}`
          );
          result.valid = false;
          continue;
        }

        if (rawValue !== undefined) {
          const parsedValue = rule.schema.parse(rawValue);
          result.values[rule.key] = parsedValue;

          // Security warnings for sensitive variables
          if (rule.sensitive && rule.defaultValue === rawValue) {
            result.warnings.push(
              `Using default value for sensitive variable: ${rule.key}. Change this in production!`
            );
          }
        } else {
          result.values[rule.key] = this.getDefaultValue(rule);
        }
      } catch (error) {
        result.invalid.push(rule.key);
        result.errors.push(
          `Invalid value for ${rule.key}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        result.valid = false;
      }
    }

    this.validated = true;
    return result;
  }

  /**
   * Gets raw environment variable value with cloud overrides
   */
  private getRawValue(key: string, rule: EnvValidationRule): string | undefined {
    let value = process.env[key];

    // Apply cloud environment overrides
    if (CLOUD_ENV.isCloud && rule.cloudOverrides?.[CLOUD_ENV.platform]) {
      const override = rule.cloudOverrides[CLOUD_ENV.platform];
      value = String(override);
      logger.debug(`Applied cloud override for ${key}:`, {
        platform: CLOUD_ENV.platform,
        value: override,
      });
    }

    return value;
  }

  /**
   * Gets default value with cloud overrides
   */
  private getDefaultValue(rule: EnvValidationRule): any {
    if (CLOUD_ENV.isCloud && rule.cloudOverrides?.[CLOUD_ENV.platform]) {
      return rule.cloudOverrides[CLOUD_ENV.platform];
    }
    return rule.defaultValue;
  }

  /**
   * Gets all environment variables as a sanitized object
   */
  getAll(includeSensitive = false): Record<string, any> {
    const values: Record<string, any> = {};

    for (const rule of ENV_RULES) {
      if (!includeSensitive && rule.sensitive) {
        values[rule.key] = '***REDACTED***';
      } else {
        values[rule.key] = this.get(rule.key);
      }
    }

    return values;
  }

  /**
   * Clears the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.validated = false;
  }

  /**
   * Generates environment documentation
   */
  generateDocs(): string {
    let docs = '# Environment Variables\n\n';
    docs += 'This document describes all supported environment variables for MCP Kanban.\n\n';

    // Group by category
    const categories: Record<string, EnvValidationRule[]> = {
      Server: [],
      Database: [],
      Security: [],
      Performance: [],
      Features: [],
      Logging: [],
      Network: [],
    };

    for (const rule of ENV_RULES) {
      const { key } = rule;
      if (key.startsWith('NODE_ENV') || key.startsWith('PORT') || key.startsWith('HOST')) {
        categories['Server'].push(rule);
      } else if (key.startsWith('DATABASE_')) {
        categories['Database'].push(rule);
      } else if (key.includes('SECRET') || key.includes('KEY') || key.includes('CORS')) {
        categories['Security'].push(rule);
      } else if (key.includes('MEMORY') || key.includes('TIMEOUT') || key.includes('LIMIT')) {
        categories['Performance'].push(rule);
      } else if (key.startsWith('ENABLE_')) {
        categories['Features'].push(rule);
      } else if (key.startsWith('LOG_')) {
        categories['Logging'].push(rule);
      } else {
        categories['Network'].push(rule);
      }
    }

    for (const [category, rules] of Object.entries(categories)) {
      if (rules.length === 0) continue;

      docs += `## ${category}\n\n`;

      for (const rule of rules) {
        docs += `### \`${rule.key}\`\n\n`;
        docs += `${rule.description}\n\n`;
        docs += `- **Required**: ${rule.required ? 'Yes' : 'No'}\n`;
        docs += `- **Sensitive**: ${rule.sensitive ? 'Yes' : 'No'}\n`;

        if (rule.defaultValue !== undefined) {
          const defaultDisplay = rule.sensitive
            ? '***REDACTED***'
            : JSON.stringify(rule.defaultValue);
          docs += `- **Default**: ${defaultDisplay}\n`;
        }

        if (rule.cloudOverrides) {
          docs += `- **Cloud Overrides**:\n`;
          for (const [platform, value] of Object.entries(rule.cloudOverrides)) {
            docs += `  - ${platform}: ${JSON.stringify(value)}\n`;
          }
        }

        docs += '\n';
      }
    }

    // Add cloud environment info
    docs += '## Cloud Environment Detection\n\n';
    docs += `Current environment: **${CLOUD_ENV.platform}**\n\n`;

    if (CLOUD_ENV.isCloud) {
      docs += 'Cloud-specific configurations are automatically applied.\n\n';
      docs += `Platform features:\n`;
      for (const [feature, enabled] of Object.entries(CLOUD_ENV.features)) {
        docs += `- ${feature}: ${enabled ? '✅' : '❌'}\n`;
      }
    }

    return docs;
  }
}

// Export singleton instance
export const envManager = new EnvironmentManager();

// Validate environment on module load
export const ENV_VALIDATION = envManager.validate();

if (!ENV_VALIDATION.valid) {
  logger.error('Environment validation failed:', {
    errors: ENV_VALIDATION.errors,
    missing: ENV_VALIDATION.missing,
    invalid: ENV_VALIDATION.invalid,
  });
}

if (ENV_VALIDATION.warnings.length > 0) {
  logger.warn('Environment validation warnings:', ENV_VALIDATION.warnings);
}

// Log successful validation
logger.info('Environment configuration loaded', {
  platform: CLOUD_ENV.platform,
  isCloud: CLOUD_ENV.isCloud,
  variablesLoaded: Object.keys(ENV_VALIDATION.values).length,
  warnings: ENV_VALIDATION.warnings.length,
  errors: ENV_VALIDATION.errors.length,
});

// Export helper functions
export const getEnv = <T>(key: string, defaultValue?: T): T => envManager.get(key, defaultValue);
export const setEnv = (key: string, value: any): void => envManager.set(key, value);
export const getAllEnv = (includeSensitive = false): Record<string, any> =>
  envManager.getAll(includeSensitive);
