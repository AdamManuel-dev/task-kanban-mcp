/**
 * Type Improvements Utilities
 *
 * This module provides common type replacements and improvements for the codebase
 * to help systematically improve TypeScript type coverage.
 */

import type { QueryParameters } from '../database/connection';

/**
 * Common type replacements for better type safety
 */

// Database-related types
export type DatabaseParams = QueryParameters;
export type DatabaseResult<T = unknown> = T[];

// API-related types
export interface ApiRequest {
  body?: unknown;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Error handling types
export type ErrorHandler = (error: unknown) => void;
export type AsyncErrorHandler = (error: unknown) => Promise<void>;

// Event handling types
export interface EventData {
  type: string;
  payload?: unknown;
  timestamp?: Date;
  id?: string;
}

export type EventHandler<T = unknown> = (event: EventData, data?: T) => void;
export type AsyncEventHandler<T = unknown> = (event: EventData, data?: T) => Promise<void>;

// Configuration types
export interface ConfigValue {
  value: unknown;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
}

export type ConfigData = Record<string, ConfigValue>;

// CLI-related types
export type CliOptions = Record<string, unknown>;

export interface CliCommand {
  name: string;
  description: string;
  options?: CliOptions;
  action: (...args: unknown[]) => Promise<void> | void;
}

// WebSocket types
export interface WebSocketMessage<T = unknown> {
  type: string;
  payload?: T;
  id?: string;
  timestamp?: Date;
}

export interface WebSocketConnection {
  id: string;
  connected: boolean;
  subscriptions: string[];
  lastActivity: Date;
}

// Validation types
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export type Validator<T = unknown> = (value: T) => ValidationResult;

// Utility types for common patterns
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Function types
export type AsyncFunction<TArgs extends unknown[] = unknown[], TReturn = unknown> = (
  ...args: TArgs
) => Promise<TReturn>;

export type SyncFunction<TArgs extends unknown[] = unknown[], TReturn = unknown> = (
  ...args: TArgs
) => TReturn;

// Collection types
export type ArrayElement<T> = T extends ReadonlyArray<infer U> ? U : never;
export type ObjectValues<T> = T[keyof T];

// Type guards for common patterns
export function isApiRequest(value: unknown): value is ApiRequest {
  return (
    (typeof value === 'object' && value !== null && (value as ApiRequest).body !== undefined) ||
    (value as ApiRequest).query !== undefined ||
    (value as ApiRequest).params !== undefined
  );
}

export function isApiResponse<T = unknown>(value: unknown): value is ApiResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiResponse).success === 'boolean'
  );
}

export function isEventData(value: unknown): value is EventData {
  return (
    typeof value === 'object' && value !== null && typeof (value as EventData).type === 'string'
  );
}

export function isWebSocketMessage<T = unknown>(value: unknown): value is WebSocketMessage<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WebSocketMessage).type === 'string'
  );
}

export function isCliOptions(value: unknown): value is CliOptions {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isConfigData(value: unknown): value is ConfigData {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      v => typeof v === 'object' && v !== null && typeof (v as ConfigValue).type === 'string'
    )
  );
}

// Type-safe utility functions
export function safeJsonParse<T>(
  json: string,
  validator?: (value: unknown) => value is T
): T | null {
  try {
    const parsed = JSON.parse(json);
    if (validator && !validator(parsed)) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function createTypedArray<T>(length: number, defaultValue: T): T[] {
  return new Array(length).fill(defaultValue);
}

export function createTypedRecord<K extends string, V>(entries: Array<[K, V]>): Record<K, V> {
  return Object.fromEntries(entries) as Record<K, V>;
}

// Type-safe error handling
export function createErrorHandler<T extends Error = Error>(
  errorType: new (message: string) => T
): (message: string, cause?: unknown) => T {
  return (message: string, cause?: unknown) => {
    const error = new errorType(message);
    if (cause && error instanceof Error) {
      (error as Error & { cause?: unknown }).cause = cause;
    }
    return error;
  };
}

// Type-safe async operations
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  delayMs: number
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

// Type-safe validation utilities
export function createValidator<T>(rules: Array<(value: T) => string | null>): Validator<T> {
  return (value: T): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of rules) {
      const result = rule(value);
      if (result) {
        errors.push(result);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  };
}

// Type-safe transformation utilities
export function mapValues<T, U>(
  obj: Record<string, T>,
  transform: (value: T, key: string) => U
): Record<string, U> {
  const result: Record<string, U> = {};

  for (const [key, value] of Object.entries(obj)) {
    result[key] = transform(value, key);
  }

  return result;
}

export function filterValues<T>(
  obj: Record<string, T>,
  predicate: (value: T, key: string) => boolean
): Record<string, T> {
  const result: Record<string, T> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value, key)) {
      result[key] = value;
    }
  }

  return result;
}

// Type-safe async utilities
export async function mapAsync<T, U>(
  items: T[],
  transform: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  const promises = items.map(async (item, index) => transform(item, index));
  return Promise.all(promises);
}

export async function filterAsync<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<boolean>
): Promise<T[]> {
  const results: T[] = [];

  // eslint-disable-next-line no-await-in-loop
  for (let i = 0; i < items.length; i++) {
    if (await predicate(items[i], i)) {
      results.push(items[i]);
    }
  }

  return results;
}

// Type-safe memoization
export function memoize<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  keyGenerator?: (...args: TArgs) => string
): (...args: TArgs) => TReturn {
  const cache = new Map<string, TReturn>();

  return (...args: TArgs): TReturn => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

// Type-safe debouncing
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number
): (...args: TArgs) => void {
  let timeoutId: NodeJS.Timeout | undefined;

  return (...args: TArgs): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

// Type-safe throttling
export function throttle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number
): (...args: TArgs) => void {
  let lastCall = 0;

  return (...args: TArgs): void => {
    const now = Date.now();

    if (now - lastCall >= delayMs) {
      lastCall = now;
      fn(...args);
    }
  };
}

// Export common type replacements for easy import
export const TypeReplacements = {
  // Database
  'params: QueryParameters[]': 'params: QueryParameters',
  'params: QueryParameters': 'params: QueryParameters',

  // Error handling
  'error: unknown': 'error: unknown',
  'err: unknown': 'err: unknown',

  // Data handling
  'data: any': 'data: unknown',
  'result: any': 'result: unknown',
  'response: any': 'response: unknown',
  'value: any': 'value: unknown',

  // Collections
  'items: any[]': 'items: unknown[]',
  'array: any[]': 'array: unknown[]',
  'list: any[]': 'list: unknown[]',

  // Objects
  'obj: any': 'obj: Record<string, unknown>',
  'object: any': 'object: Record<string, unknown>',
  'config: any': 'config: ConfigData',
  'options: any': 'options: CliOptions',

  // Functions
  'callback: any': 'callback: (...args: unknown[]) => void',
  'handler: any': 'handler: (event: EventData) => void',
  'fn: any': 'fn: (...args: unknown[]) => unknown',
} as const;
