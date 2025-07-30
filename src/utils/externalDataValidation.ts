/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * External data validation utilities for API responses, query parameters, and WebSocket messages
 */

import { z } from 'zod';
import { isRecord, isString, hasProperty, getErrorMessage } from './typeGuards';

/**
 * Base API response schema
 */
export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  });

/**
 * Pagination query schema
 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * Common query filter schema
 */
export const FilterQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  boardId: z.coerce.number().int().positive().optional(),
  columnId: z.coerce.number().int().positive().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignee: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Validate and parse API response
 */
export function validateApiResponse<T>(
  data: unknown,
  schema: z.ZodType<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      };
    }
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Validate query parameters with schema
 */
export function validateQueryParams<T>(params: unknown, schema: z.ZodType<T>): T {
  // Convert query string arrays to actual arrays if needed
  if (isRecord(params)) {
    const normalized = { ...params };
    for (const [key, value] of Object.entries(normalized)) {
      // Express query parser may return string or string[] for array params
      if (key === 'tags' && isString(value) && value.includes(',')) {
        normalized[key] = value.split(',').map(s => s.trim());
      }
    }
    return schema.parse(normalized);
  }

  return schema.parse(params);
}

/**
 * WebSocket message schemas
 */
export const WebSocketMessageBaseSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

export const SubscribeMessageSchema = WebSocketMessageBaseSchema.extend({
  type: z.literal('subscribe'),
  payload: z.object({
    channel: z.enum(['boards', 'tasks', 'notes', 'tags']),
    filters: z.record(z.unknown()).optional(),
  }),
});

export const UnsubscribeMessageSchema = WebSocketMessageBaseSchema.extend({
  type: z.literal('unsubscribe'),
  payload: z.object({
    channel: z.enum(['boards', 'tasks', 'notes', 'tags']),
  }),
});

/**
 * Validate WebSocket message
 */
export function validateWebSocketMessage(
  message: unknown
): { type: string; payload?: unknown; id?: string | undefined } | null {
  if (!isRecord(message) || !isString(message.type)) {
    return null;
  }

  try {
    // Validate base structure
    const base = WebSocketMessageBaseSchema.parse(message);

    // Return with original payload for specific handlers to validate
    return {
      type: base.type,
      id: base.id,
      payload: hasProperty(message, 'payload') ? message.payload : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * JSON parse with validation
 */
export function parseJsonSafe<T>(
  json: string,
  schema: z.ZodType<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(json);
    return validateApiResponse(parsed, schema);
  } catch (error) {
    return { success: false, error: `JSON parse error: ${getErrorMessage(error)}` };
  }
}

/**
 * Create a validated API response handler
 */
export function createApiResponseHandler<T>(schema: z.ZodType<T>) {
  return async (response: Response): Promise<T> => {
    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorData = JSON.parse(text);
        if (isRecord(errorData) && isString(errorData.error)) {
          errorMessage = errorData.error;
        } else if (isRecord(errorData) && isString(errorData.message)) {
          errorMessage = errorData.message;
        }
      } catch {
        // Use text as error message if not JSON
        if (text) errorMessage = text;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    const result = validateApiResponse(data, schema);

    if (!result.success) {
      throw new Error((result as { success: false; error: string }).error);
    }

    return result.data;
  };
}

/**
 * Type-safe fetch wrapper
 */
export async function typedFetch<T>(
  url: string,
  options: RequestInit,
  schema: z.ZodType<T>
): Promise<T> {
  const response = await fetch(url, options);
  return createApiResponseHandler(schema)(response);
}

/**
 * Validate environment variables
 */
export const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default('./kanban.db'),
  API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export function validateEnvironment(env: unknown): Environment {
  return EnvironmentSchema.parse(env);
}
