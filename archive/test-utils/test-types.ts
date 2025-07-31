/**
 * @fileoverview Common type definitions for test files
 * @lastmodified 2025-01-31T00:00:00Z
 *
 * Features: Express mock types, database mock types, service mock interfaces
 * Main APIs: MockRequest, MockResponse, MockDatabase interfaces
 * Constraints: Jest environment only, TypeScript strict mode
 * Patterns: Replace `as any` with proper typed mocks
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Typed mock for Express Request object
 */
export interface MockRequest extends Partial<Request> {
  apiKey?: string;
  user?: {
    id?: string;
    permissions?: string[];
    [key: string]: unknown;
  };
  requestId?: string;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  get?: jest.MockedFunction<(name: string) => string | undefined>;
}

/**
 * Typed mock for Express Response object
 */
export interface MockResponse extends Partial<Response> {
  status: jest.MockedFunction<(code: number) => MockResponse>;
  json: jest.MockedFunction<(body: unknown) => MockResponse>;
  send: jest.MockedFunction<(body: unknown) => MockResponse>;
  setHeader?: jest.MockedFunction<(name: string, value: string) => MockResponse>;
  getHeader?: jest.MockedFunction<(name: string) => string | undefined>;
}

/**
 * Typed mock for Express NextFunction
 */
export type MockNext = jest.MockedFunction<NextFunction>;

/**
 * Mock database connection interface
 */
export interface MockDatabase {
  query: jest.MockedFunction<(sql: string, params?: unknown[]) => Promise<unknown[]>>;
  run: jest.MockedFunction<
    (sql: string, params?: unknown[]) => Promise<{ lastInsertRowid: number; changes: number }>
  >;
  get: jest.MockedFunction<(sql: string, params?: unknown[]) => Promise<unknown>>;
  all: jest.MockedFunction<(sql: string, params?: unknown[]) => Promise<unknown[]>>;
  exec: jest.MockedFunction<(sql: string) => Promise<void>>;
  transaction: jest.MockedFunction<
    (callback: (db: MockDatabase) => Promise<unknown>) => Promise<unknown>
  >;
}

/**
 * Generic mock service interface
 */
export interface MockService {
  [key: string]: jest.MockedFunction<(...args: unknown[]) => unknown>;
}

/**
 * Mock logger interface
 */
export interface MockLogger {
  info: jest.MockedFunction<(message: string, ...args: unknown[]) => void>;
  warn: jest.MockedFunction<(message: string, ...args: unknown[]) => void>;
  error: jest.MockedFunction<(message: string, ...args: unknown[]) => void>;
  debug: jest.MockedFunction<(message: string, ...args: unknown[]) => void>;
}

/**
 * Type-safe mock factory for Express objects
 */
export function createMockRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    method: 'GET',
    url: '/test',
    originalUrl: '/test',
    path: '/test',
    get: jest.fn(),
    query: {},
    params: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  };
}

/**
 * Type-safe mock factory for Express Response
 */
export function createMockResponse(): MockResponse {
  const res: MockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    getHeader: jest.fn(),
  };
  return res;
}

/**
 * Type-safe mock factory for database connections
 */
export function createMockDatabase(): MockDatabase {
  return {
    query: jest.fn(),
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn(),
    exec: jest.fn(),
    transaction: jest.fn(),
  };
}

/**
 * Type-safe mock factory for logger
 */
export function createMockLogger(): MockLogger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

/**
 * Type-safe error mock factory
 */
export function createMockError(
  message = 'Test error',
  code = 'TEST_ERROR'
): Error & { code?: string } {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Type-safe async function that can be used in tests
 */
export type AsyncTestFunction<T = unknown> = (...args: unknown[]) => Promise<T>;

/**
 * Type-safe sync function that can be used in tests
 */
export type SyncTestFunction<T = unknown> = (...args: unknown[]) => T;

/**
 * Mock validation result
 */
export interface MockValidationResult {
  isValid: boolean;
  errors: string[];
  value?: unknown;
}

/**
 * Type assertion helper for unknown values in tests
 */
export function assertType<T>(value: unknown): asserts value is T {
  // Type assertion helper - only for tests
}

/**
 * Safe type cast for test values
 */
export function asTestType<T>(value: unknown): T {
  return value as T;
}
