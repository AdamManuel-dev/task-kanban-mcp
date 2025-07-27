# Utils Module

## Overview

The utils module provides essential utility functions, helpers, and common functionality used throughout the MCP Kanban application. It includes validation utilities, error handling, type guards, formatters, and various helper functions that promote code reuse and maintainability.

## Table of Contents

- [Architecture](#architecture)
- [Core Utilities](#core-utilities)
  - [Validation Utilities](#validation-utilities)
  - [Error Handling](#error-handling)
  - [Type Guards](#type-guards)
  - [Formatters](#formatters)
  - [Transaction Management](#transaction-management)
- [Utility Categories](#utility-categories)
- [Implementation Patterns](#implementation-patterns)
- [Best Practices](#best-practices)
- [Related Modules](#related-modules)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Utils Module                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  /src/utils/                                                │
│  ├── validation.ts      - Input validation and sanitization │
│  ├── errors.ts         - Error classes and handling         │
│  ├── typeGuards.ts     - Runtime type checking              │
│  ├── formatters.ts     - Data formatting utilities          │
│  ├── transactions.ts   - Database transaction management    │
│  ├── logger.ts         - Logging utilities                  │
│  ├── cache.ts          - Caching utilities                  │
│  ├── crypto.ts         - Cryptographic utilities            │
│  ├── date.ts           - Date/time utilities                │
│  └── async.ts          - Async operation helpers            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Core Utilities

### Validation Utilities

**File**: `/src/utils/validation.ts`

Comprehensive validation functions for data integrity and security. This module provides both simple validation functions and a powerful validation builder for complex validation scenarios.

#### Basic Validation Functions

```typescript
/**
 * Validates email format using RFC 5322 compliant regex
 * @param email - Email address to validate
 * @returns true if valid email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
}

/**
 * Validates UUID v4 format
 * @param uuid - UUID string to validate
 * @returns true if valid UUID v4 format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validates URL format and accessibility
 * @param url - URL string to validate
 * @param checkAccessibility - Whether to check if URL is accessible
 * @returns true if valid URL format
 */
export function isValidURL(url: string, checkAccessibility = false): boolean {
  try {
    const urlObj = new URL(url);
    // Basic protocol validation
    if (!['http:', 'https:', 'ftp:', 'ws:', 'wss:'].includes(urlObj.protocol)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates international phone number format (E.164)
 * @param phone - Phone number to validate
 * @returns true if valid international phone format
 */
export function isValidPhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/[\s()-]/g, ''));
}

/**
 * Validates credit card number using Luhn algorithm
 * @param cardNumber - Credit card number to validate
 * @returns true if valid credit card number
 */
export function isValidCreditCard(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  
  let sum = 0;
  let isEven = false;
  
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
}

/**
 * Validates password strength
 * @param password - Password to validate
 * @param options - Password strength requirements
 * @returns validation result with score and feedback
 */
export function validatePassword(
  password: string,
  options: {
    minLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSpecialChars?: boolean;
  } = {}
): { valid: boolean; score: number; feedback: string[] } {
  const {
    minLength = 8,
    requireUppercase = true,
    requireLowercase = true,
    requireNumbers = true,
    requireSpecialChars = false
  } = options;

  const feedback: string[] = [];
  let score = 0;

  if (password.length < minLength) {
    feedback.push(`Password must be at least ${minLength} characters long`);
  } else {
    score += 1;
  }

  if (requireUppercase && !/[A-Z]/.test(password)) {
    feedback.push('Password must contain at least one uppercase letter');
  } else if (requireUppercase) {
    score += 1;
  }

  if (requireLowercase && !/[a-z]/.test(password)) {
    feedback.push('Password must contain at least one lowercase letter');
  } else if (requireLowercase) {
    score += 1;
  }

  if (requireNumbers && !/\d/.test(password)) {
    feedback.push('Password must contain at least one number');
  } else if (requireNumbers) {
    score += 1;
  }

  if (requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    feedback.push('Password must contain at least one special character');
  } else if (requireSpecialChars) {
    score += 1;
  }

  return {
    valid: feedback.length === 0,
    score,
    feedback
  };
}
```

#### Data Sanitization

```typescript
/**
 * Sanitizes user input to prevent XSS attacks
 * @param input - Raw user input
 * @returns sanitized input string
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/data:/gi, '') // Remove data URIs
    .replace(/vbscript:/gi, ''); // Remove VBScript
}

/**
 * Sanitizes HTML content while preserving safe tags
 * @param html - HTML content to sanitize
 * @param allowedTags - Array of allowed HTML tags
 * @returns sanitized HTML
 */
export function sanitizeHTML(
  html: string,
  allowedTags: string[] = ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li']
): string {
  const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
  return html.replace(tagRegex, (match, tag) => {
    return allowedTags.includes(tag.toLowerCase()) ? match : '';
  });
}

/**
 * Escapes special characters for safe database storage
 * @param input - Input string to escape
 * @returns escaped string
 */
export function escapeSQL(input: string): string {
  return input
    .replace(/'/g, "''")
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}
```

#### Advanced Validation Builder

```typescript
/**
 * Fluent validation builder for complex validation scenarios
 * Supports chaining, custom validators, and detailed error reporting
 */
export class ValidationBuilder<T> {
  private rules: Array<{
    validator: (value: T) => boolean | string;
    message: string;
    priority: number;
  }> = [];
  
  /**
   * Marks field as required
   * @param message - Custom error message
   * @returns ValidationBuilder instance for chaining
   */
  required(message = 'This field is required'): this {
    this.rules.push({
      validator: value => value != null && value !== '',
      message,
      priority: 1
    });
    return this;
  }
  
  /**
   * Sets minimum length requirement
   * @param length - Minimum length
   * @param message - Custom error message
   * @returns ValidationBuilder instance for chaining
   */
  min(length: number, message = `Minimum length is ${length}`): this {
    this.rules.push({
      validator: value => String(value).length >= length,
      message,
      priority: 2
    });
    return this;
  }
  
  /**
   * Sets maximum length requirement
   * @param length - Maximum length
   * @param message - Custom error message
   * @returns ValidationBuilder instance for chaining
   */
  max(length: number, message = `Maximum length is ${length}`): this {
    this.rules.push({
      validator: value => String(value).length <= length,
      message,
      priority: 2
    });
    return this;
  }
  
  /**
   * Validates against regex pattern
   * @param regex - Regular expression to test against
   * @param message - Custom error message
   * @returns ValidationBuilder instance for chaining
   */
  pattern(regex: RegExp, message = 'Invalid format'): this {
    this.rules.push({
      validator: value => regex.test(String(value)),
      message,
      priority: 3
    });
    return this;
  }
  
  /**
   * Adds custom validation function
   * @param fn - Custom validation function
   * @param message - Custom error message
   * @returns ValidationBuilder instance for chaining
   */
  custom(fn: (value: T) => boolean, message = 'Validation failed'): this {
    this.rules.push({
      validator: fn,
      message,
      priority: 4
    });
    return this;
  }
  
  /**
   * Validates email format
   * @param message - Custom error message
   * @returns ValidationBuilder instance for chaining
   */
  email(message = 'Invalid email format'): this {
    this.rules.push({
      validator: value => isValidEmail(String(value)),
      message,
      priority: 3
    });
    return this;
  }
  
  /**
   * Validates URL format
   * @param message - Custom error message
   * @returns ValidationBuilder instance for chaining
   */
  url(message = 'Invalid URL format'): this {
    this.rules.push({
      validator: value => isValidURL(String(value)),
      message,
      priority: 3
    });
    return this;
  }
  
  /**
   * Validates numeric range
   * @param min - Minimum value
   * @param max - Maximum value
   * @param message - Custom error message
   * @returns ValidationBuilder instance for chaining
   */
  range(min: number, max: number, message = `Value must be between ${min} and ${max}`): this {
    this.rules.push({
      validator: value => {
        const num = Number(value);
        return !isNaN(num) && num >= min && num <= max;
      },
      message,
      priority: 2
    });
    return this;
  }
  
  /**
   * Validates value against allowed options
   * @param options - Array of allowed values
   * @param message - Custom error message
   * @returns ValidationBuilder instance for chaining
   */
  oneOf(options: T[], message = 'Invalid option selected'): this {
    this.rules.push({
      validator: value => options.includes(value),
      message,
      priority: 2
    });
    return this;
  }
  
  /**
   * Validates the value using all defined rules
   * @param value - Value to validate
   * @returns Validation result with validity status and error messages
   */
  validate(value: T): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Sort rules by priority
    const sortedRules = [...this.rules].sort((a, b) => a.priority - b.priority);
    
    for (const rule of sortedRules) {
      const result = rule.validator(value);
      if (result !== true) {
        errors.push(rule.message);
      }
    }
    
    return { 
      valid: errors.length === 0, 
      errors,
      warnings 
    };
  }
  
  /**
   * Validates multiple values at once
   * @param values - Array of values to validate
   * @returns Array of validation results
   */
  validateAll(values: T[]): Array<{ value: T; valid: boolean; errors: string[] }> {
    return values.map(value => ({
      value,
      ...this.validate(value)
    }));
  }
}

// Usage examples
const titleValidator = new ValidationBuilder<string>()
  .required('Task title is required')
  .min(3, 'Title must be at least 3 characters')
  .max(200, 'Title cannot exceed 200 characters')
  .pattern(/^[a-zA-Z0-9\s\-_]+$/, 'Title contains invalid characters');

const emailValidator = new ValidationBuilder<string>()
  .required()
  .email('Please enter a valid email address');

const ageValidator = new ValidationBuilder<number>()
  .required()
  .range(0, 120, 'Age must be between 0 and 120');

// Validation results
const titleResult = titleValidator.validate('My Task');
const emailResult = emailValidator.validate('user@example.com');
const ageResult = ageValidator.validate(25);
```

### Error Handling

**File**: `/src/utils/errors.ts`

Comprehensive error management system with hierarchical error classes, global error handling, retry mechanisms, and circuit breaker patterns.

#### Error Hierarchy

```typescript
/**
 * Base error class for all service errors
 * Provides consistent error structure and logging
 */
export abstract class BaseServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;
  public readonly cause?: Error;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date();
    this.context = context;
    this.cause = cause;
    
    // Ensure proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts error to JSON for API responses
   */
  toJSON(): Record<string, any> {
    return {
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        timestamp: this.timestamp.toISOString(),
        context: this.context,
        ...(this.cause && { cause: this.cause.message })
      }
    };
  }

  /**
   * Creates a standardized error response
   */
  toResponse(): { status: number; body: Record<string, any> } {
    return {
      status: this.statusCode,
      body: this.toJSON()
    };
  }
}

// HTTP Status Code Errors
export class ValidationError extends BaseServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', context);
  }
}

export class UnauthorizedError extends BaseServiceError {
  constructor(message = 'Unauthorized access', context?: Record<string, any>) {
    super(message, 401, 'UNAUTHORIZED', context);
  }
}

export class ForbiddenError extends BaseServiceError {
  constructor(message = 'Access forbidden', context?: Record<string, any>) {
    super(message, 403, 'FORBIDDEN', context);
  }
}

export class NotFoundError extends BaseServiceError {
  constructor(resource: string, context?: Record<string, any>) {
    super(`${resource} not found`, 404, 'NOT_FOUND', context);
  }
}

export class ConflictError extends BaseServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 409, 'CONFLICT', context);
  }
}

export class RateLimitError extends BaseServiceError {
  constructor(message = 'Rate limit exceeded', context?: Record<string, any>) {
    super(message, 429, 'RATE_LIMIT', context);
  }
}

export class InternalServerError extends BaseServiceError {
  constructor(message = 'Internal server error', context?: Record<string, any>) {
    super(message, 500, 'INTERNAL_ERROR', context);
  }
}

export class DatabaseError extends BaseServiceError {
  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, 500, 'DATABASE_ERROR', context, cause);
  }
}

export class DependencyError extends BaseServiceError {
  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, 400, 'DEPENDENCY_ERROR', context, cause);
  }
}

export class ExternalServiceError extends BaseServiceError {
  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', context, cause);
  }
}
```

#### Global Error Handler

```typescript
/**
 * Global error handler for centralized error management
 * Provides logging, monitoring, and consistent error responses
 */
export class GlobalErrorHandler {
  private readonly logger: Logger;
  private readonly errorCounts = new Map<string, number>();
  private readonly maxErrorCount = 100;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('GlobalErrorHandler');
  }

  /**
   * Handles and processes errors consistently
   * @param error - Error to handle
   * @param context - Additional context information
   */
  handleError(error: Error, context?: Record<string, any>): void {
    // Increment error count
    const errorType = error.constructor.name;
    const currentCount = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, currentCount + 1);

    // Log error with context
    this.logger.error('Error occurred', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        type: errorType
      },
      context,
      errorCount: currentCount + 1
    });

    // Alert on high error rates
    if (currentCount + 1 >= this.maxErrorCount) {
      this.alertHighErrorRate(errorType, currentCount + 1);
    }

    // Send to monitoring service
    this.sendToMonitoring(error, context);
  }

  /**
   * Converts any error to a standardized service error
   * @param error - Any error object
   * @returns Standardized service error
   */
  normalizeError(error: unknown): BaseServiceError {
    if (error instanceof BaseServiceError) {
      return error;
    }

    if (error instanceof Error) {
      return new InternalServerError(error.message, { originalError: error.name });
    }

    return new InternalServerError('Unknown error occurred', { originalError: String(error) });
  }

  /**
   * Creates appropriate error based on error type
   * @param errorType - Type of error to create
   * @param message - Error message
   * @param context - Additional context
   */
  createError(
    errorType: 'validation' | 'notFound' | 'conflict' | 'unauthorized' | 'forbidden' | 'rateLimit' | 'internal',
    message: string,
    context?: Record<string, any>
  ): BaseServiceError {
    switch (errorType) {
      case 'validation':
        return new ValidationError(message, context);
      case 'notFound':
        return new NotFoundError(message, context);
      case 'conflict':
        return new ConflictError(message, context);
      case 'unauthorized':
        return new UnauthorizedError(message, context);
      case 'forbidden':
        return new ForbiddenError(message, context);
      case 'rateLimit':
        return new RateLimitError(message, context);
      case 'internal':
      default:
        return new InternalServerError(message, context);
    }
  }

  private alertHighErrorRate(errorType: string, count: number): void {
    this.logger.warn('High error rate detected', {
      errorType,
      count,
      threshold: this.maxErrorCount
    });
  }

  private sendToMonitoring(error: Error, context?: Record<string, any>): void {
    // Implementation for sending to monitoring service
    // e.g., Sentry, DataDog, etc.
  }
}

// Global instance
export const globalErrorHandler = new GlobalErrorHandler();
```

#### Retry Mechanisms

```typescript
/**
 * Retry options for retry mechanisms
 */
export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryCondition?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Retries an operation with exponential backoff
 * @param operation - Async operation to retry
 * @param options - Retry configuration
 * @returns Promise that resolves with operation result
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    retryCondition = () => true,
    onRetry = () => {}
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Check if we should retry
      if (attempt === maxAttempts || !retryCondition(lastError)) {
        throw lastError;
      }

      // Call retry callback
      onRetry(attempt, lastError);

      // Wait before retry
      await sleep(delay);
      
      // Calculate next delay
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Retries an operation with jitter to prevent thundering herd
 * @param operation - Async operation to retry
 * @param options - Retry configuration
 * @returns Promise that resolves with operation result
 */
export async function retryWithJitter<T>(
  operation: () => Promise<T>,
  options: RetryOptions & { jitterFactor?: number } = {}
): Promise<T> {
  const { jitterFactor = 0.1, ...retryOptions } = options;
  
  const originalOnRetry = retryOptions.onRetry;
  retryOptions.onRetry = (attempt, error) => {
    // Add jitter to delay
    const jitter = Math.random() * jitterFactor;
    const delay = retryOptions.initialDelay! * (1 + jitter);
    retryOptions.initialDelay = delay;
    
    if (originalOnRetry) {
      originalOnRetry(attempt, error);
    }
  };

  return retryWithBackoff(operation, retryOptions);
}
```

#### Circuit Breaker Pattern

```typescript
/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',    // Normal operation
  OPEN = 'OPEN',        // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  failureThreshold: number;     // Number of failures before opening
  recoveryTimeout: number;      // Time to wait before half-open
  expectedErrors?: string[];    // Error types that count as failures
  monitorInterval?: number;     // Interval to check circuit state
}

/**
 * Circuit breaker implementation for fault tolerance
 * Prevents cascading failures by temporarily stopping requests to failing services
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions
  ) {
    this.options = {
      monitorInterval: 1000,
      ...options
    };
  }

  /**
   * Executes operation with circuit breaker protection
   * @param operation - Operation to execute
   * @returns Promise that resolves with operation result
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN;
      } else {
        throw new Error(`Circuit breaker '${this.name}' is OPEN`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Gets current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Manually resets circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
    }
  }

  private onFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.shouldOpenCircuit()) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  private shouldOpenCircuit(): boolean {
    return this.failureCount >= this.options.failureThreshold;
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.options.recoveryTimeout;
  }
}

/**
 * Creates a circuit breaker instance
 * @param name - Circuit breaker name
 * @param options - Circuit breaker configuration
 * @returns Circuit breaker instance
 */
export function createCircuitBreaker(
  name: string,
  options: CircuitBreakerOptions
): CircuitBreaker {
  return new CircuitBreaker(name, options);
}
```

#### Error Decorators

```typescript
/**
 * Decorator to add error handling to service methods
 * @param serviceName - Name of the service for logging
 */
export function createServiceErrorHandler(serviceName: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await method.apply(this, args);
      } catch (error) {
        globalErrorHandler.handleError(error, {
          service: serviceName,
          method: propertyName,
          args: args.map(arg => typeof arg === 'object' ? '[Object]' : String(arg))
        });
        throw globalErrorHandler.normalizeError(error);
      }
    };
  };
}

/**
 * Decorator to create error boundaries for async operations
 * @param context - Context name for error handling
 */
export function createErrorBoundary(context: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await method.apply(this, args);
      } catch (error) {
        const normalizedError = globalErrorHandler.normalizeError(error);
        normalizedError.context = {
          ...normalizedError.context,
          boundary: context,
          method: propertyName
        };
        throw normalizedError;
      }
    };
  };
}
```

### Type Guards

**File**: `/src/utils/typeGuards.ts`

Comprehensive runtime type checking utilities that provide type-safe validation and assertion functions. These utilities help ensure data integrity and provide better error messages during runtime.

#### Basic Type Guards

```typescript
/**
 * Type guard for string values
 * @param value - Value to check
 * @returns true if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for number values (excluding NaN)
 * @param value - Value to check
 * @returns true if value is a valid number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Type guard for boolean values
 * @param value - Value to check
 * @returns true if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard for plain objects (excluding null, arrays, and functions)
 * @param value - Value to check
 * @returns true if value is a plain object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard for arrays
 * @param value - Value to check
 * @returns true if value is an array
 */
export function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Type guard for functions
 * @param value - Value to check
 * @returns true if value is a function
 */
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * Type guard for Date objects with valid date
 * @param value - Value to check
 * @returns true if value is a valid Date
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Type guard for Error objects
 * @param value - Value to check
 * @returns true if value is an Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Type guard for null values
 * @param value - Value to check
 * @returns true if value is null
 */
export function isNull(value: unknown): value is null {
  return value === null;
}

/**
 * Type guard for undefined values
 * @param value - Value to check
 * @returns true if value is undefined
 */
export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

/**
 * Type guard for null or undefined values
 * @param value - Value to check
 * @returns true if value is null or undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value == null;
}

/**
 * Type guard for defined values (not null or undefined)
 * @param value - Value to check
 * @returns true if value is defined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value != null;
}

/**
 * Type guard for primitive values
 * @param value - Value to check
 * @returns true if value is a primitive
 */
export function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return (
    isString(value) ||
    isNumber(value) ||
    isBoolean(value) ||
    isNull(value) ||
    isUndefined(value)
  );
}
```

#### Advanced Type Guards

```typescript
/**
 * Type guard for objects with specific property
 * @param obj - Object to check
 * @param key - Property key to check for
 * @returns true if object has the specified property
 */
export function hasProperty<K extends PropertyKey>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return isObject(obj) && key in obj;
}

/**
 * Type guard for objects with multiple properties
 * @param obj - Object to check
 * @param keys - Array of property keys to check for
 * @returns true if object has all specified properties
 */
export function hasProperties<K extends PropertyKey>(
  obj: unknown,
  keys: K[]
): obj is Record<K, unknown> {
  return isObject(obj) && keys.every(key => key in obj);
}

/**
 * Type guard for arrays with specific element type
 * @param value - Value to check
 * @param guard - Type guard function for array elements
 * @returns true if value is an array with all elements matching the guard
 */
export function isArrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T
): value is T[] {
  return isArray(value) && value.every(guard);
}

/**
 * Type guard for records with specific value type
 * @param value - Value to check
 * @param guard - Type guard function for record values
 * @returns true if value is a record with all values matching the guard
 */
export function isRecord<T>(
  value: unknown,
  guard: (item: unknown) => item is T
): value is Record<string, T> {
  if (!isObject(value)) return false;
  return Object.values(value).every(guard);
}

/**
 * Type guard for objects matching a specific shape
 * @param value - Value to check
 * @param shape - Object shape definition
 * @returns true if value matches the specified shape
 */
export function matchesShape<T extends Record<string, any>>(
  value: unknown,
  shape: Record<keyof T, (val: unknown) => boolean>
): value is T {
  if (!isObject(value)) return false;
  
  for (const [key, guard] of Object.entries(shape)) {
    if (!(key in value) || !guard((value as any)[key])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Type guard for union types
 * @param value - Value to check
 * @param guards - Array of type guard functions
 * @returns true if value matches any of the guards
 */
export function isUnion<T>(
  value: unknown,
  guards: Array<(val: unknown) => val is T>
): value is T {
  return guards.some(guard => guard(value));
}

/**
 * Type guard for intersection types
 * @param value - Value to check
 * @param guards - Array of type guard functions
 * @returns true if value matches all of the guards
 */
export function isIntersection<T>(
  value: unknown,
  guards: Array<(val: unknown) => val is T>
): value is T {
  return guards.every(guard => guard(value));
}
```

#### Domain-Specific Type Guards

```typescript
/**
 * Type guard for valid email addresses
 * @param value - Value to check
 * @returns true if value is a valid email
 */
export function isEmail(value: unknown): value is string {
  if (!isString(value)) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Type guard for valid UUIDs
 * @param value - Value to check
 * @returns true if value is a valid UUID
 */
export function isUUID(value: unknown): value is string {
  if (!isString(value)) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Type guard for valid URLs
 * @param value - Value to check
 * @returns true if value is a valid URL
 */
export function isURL(value: unknown): value is string {
  if (!isString(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Type guard for valid JSON strings
 * @param value - Value to check
 * @returns true if value is a valid JSON string
 */
export function isJSONString(value: unknown): value is string {
  if (!isString(value)) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Type guard for positive numbers
 * @param value - Value to check
 * @returns true if value is a positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

/**
 * Type guard for non-negative numbers
 * @param value - Value to check
 * @returns true if value is a non-negative number
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

/**
 * Type guard for integers
 * @param value - Value to check
 * @returns true if value is an integer
 */
export function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

/**
 * Type guard for positive integers
 * @param value - Value to check
 * @returns true if value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}
```

#### Utility Functions

```typescript
/**
 * Exhaustive type checking for switch statements
 * @param value - Value that should be handled by all cases
 * @throws Error if value is not handled
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}

/**
 * Extracts error message from any error-like object
 * @param error - Error object or string
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) return error.message;
  if (isString(error)) return error;
  if (isObject(error) && hasProperty(error, 'message')) {
    return String(error.message);
  }
  return 'Unknown error occurred';
}

/**
 * Safely extracts property value with type checking
 * @param obj - Object to extract from
 * @param key - Property key
 * @param fallback - Fallback value if property doesn't exist
 * @returns Property value or fallback
 */
export function safeGet<T, K extends keyof T>(
  obj: T,
  key: K,
  fallback: T[K]
): T[K] {
  return obj[key] ?? fallback;
}

/**
 * Safely accesses nested object properties
 * @param obj - Root object
 * @param path - Array of property keys
 * @param fallback - Fallback value if path doesn't exist
 * @returns Value at path or fallback
 */
export function safeGetNested<T>(
  obj: unknown,
  path: (string | number)[],
  fallback: T
): T {
  let current: unknown = obj;
  
  for (const key of path) {
    if (isObject(current) && key in current) {
      current = (current as any)[key];
    } else {
      return fallback;
    }
  }
  
  return current as T;
}
```

#### Type Assertion Helpers

```typescript
/**
 * Asserts that a value is defined (not null or undefined)
 * @param value - Value to assert
 * @param message - Error message
 * @throws Error if value is null or undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is not defined'
): asserts value is T {
  if (value == null) {
    throw new Error(message);
  }
}

/**
 * Asserts that a value is a string
 * @param value - Value to assert
 * @param message - Error message
 * @throws TypeError if value is not a string
 */
export function assertString(
  value: unknown,
  message = 'Value is not a string'
): asserts value is string {
  if (!isString(value)) {
    throw new TypeError(message);
  }
}

/**
 * Asserts that a value is a number
 * @param value - Value to assert
 * @param message - Error message
 * @throws TypeError if value is not a number
 */
export function assertNumber(
  value: unknown,
  message = 'Value is not a number'
): asserts value is number {
  if (!isNumber(value)) {
    throw new TypeError(message);
  }
}

/**
 * Asserts that a value is an object
 * @param value - Value to assert
 * @param message - Error message
 * @throws TypeError if value is not an object
 */
export function assertObject(
  value: unknown,
  message = 'Value is not an object'
): asserts value is Record<string, unknown> {
  if (!isObject(value)) {
    throw new TypeError(message);
  }
}

/**
 * Asserts that a value is an array
 * @param value - Value to assert
 * @param message - Error message
 * @throws TypeError if value is not an array
 */
export function assertArray<T>(
  value: unknown,
  message = 'Value is not an array'
): asserts value is T[] {
  if (!isArray(value)) {
    throw new TypeError(message);
  }
}

/**
 * Asserts that an object has a specific property
 * @param obj - Object to check
 * @param key - Property key
 * @param message - Error message
 * @throws Error if property doesn't exist
 */
export function assertProperty<K extends PropertyKey>(
  obj: unknown,
  key: K,
  message = `Object does not have property '${String(key)}'`
): asserts obj is Record<K, unknown> {
  if (!hasProperty(obj, key)) {
    throw new Error(message);
  }
}

/**
 * Asserts that a value is within a specific range
 * @param value - Value to check
 * @param min - Minimum value
 * @param max - Maximum value
 * @param message - Error message
 * @throws Error if value is outside range
 */
export function assertRange(
  value: number,
  min: number,
  max: number,
  message = `Value must be between ${min} and ${max}`
): asserts value is number {
  if (value < min || value > max) {
    throw new Error(message);
  }
}
```

#### Type Guard Composition

```typescript
/**
 * Composes multiple type guards with AND logic
 * @param guards - Array of type guard functions
 * @returns Combined type guard
 */
export function and<T>(
  ...guards: Array<(value: unknown) => value is T>
): (value: unknown) => value is T {
  return (value: unknown): value is T => {
    return guards.every(guard => guard(value));
  };
}

/**
 * Composes multiple type guards with OR logic
 * @param guards - Array of type guard functions
 * @returns Combined type guard
 */
export function or<T>(
  ...guards: Array<(value: unknown) => value is T>
): (value: unknown) => value is T {
  return (value: unknown): value is T => {
    return guards.some(guard => guard(value));
  };
}

/**
 * Negates a type guard
 * @param guard - Type guard to negate
 * @returns Negated type guard
 */
export function not<T>(
  guard: (value: unknown) => value is T
): (value: unknown) => value is Exclude<unknown, T> {
  return (value: unknown): value is Exclude<unknown, T> => {
    return !guard(value);
  };
}

// Usage examples
const isValidUser = and(
  isObject,
  hasProperty('id'),
  hasProperty('name'),
  (value): value is { id: string; name: string } => {
    return isString((value as any).id) && isString((value as any).name);
  }
);

const isValidId = or(isString, isPositiveInteger);
```

### Formatters

**File**: `/src/utils/formatters.ts`

Comprehensive data formatting utilities for dates, numbers, strings, and other data types. These utilities provide consistent formatting across the application with localization support.

#### Date and Time Formatting

```typescript
/**
 * Date format tokens supported by formatDate
 */
export type DateFormatToken = 
  | 'YYYY' | 'YY' | 'MM' | 'DD' | 'HH' | 'mm' | 'ss' | 'SSS'
  | 'A' | 'a' | 'ddd' | 'dddd' | 'MMM' | 'MMMM';

/**
 * Formats a date using custom format tokens
 * @param date - Date to format
 * @param format - Format string with tokens
 * @param locale - Locale for formatting
 * @returns Formatted date string
 */
export function formatDate(
  date: Date, 
  format = 'YYYY-MM-DD',
  locale = 'en-US'
): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const milliseconds = date.getMilliseconds();
  
  const monthNames = new Intl.DateTimeFormat(locale, { month: 'long' }).formatToParts(date);
  const monthAbbr = new Intl.DateTimeFormat(locale, { month: 'short' }).formatToParts(date);
  const dayNames = new Intl.DateTimeFormat(locale, { weekday: 'long' }).formatToParts(date);
  const dayAbbr = new Intl.DateTimeFormat(locale, { weekday: 'short' }).formatToParts(date);
  
  return format
    .replace('YYYY', String(year))
    .replace('YY', String(year).slice(-2))
    .replace('MM', String(month).padStart(2, '0'))
    .replace('DD', String(day).padStart(2, '0'))
    .replace('HH', String(hours).padStart(2, '0'))
    .replace('mm', String(minutes).padStart(2, '0'))
    .replace('ss', String(seconds).padStart(2, '0'))
    .replace('SSS', String(milliseconds).padStart(3, '0'))
    .replace('A', hours >= 12 ? 'PM' : 'AM')
    .replace('a', hours >= 12 ? 'pm' : 'am')
    .replace('dddd', dayNames[0]?.value || '')
    .replace('ddd', dayAbbr[0]?.value || '')
    .replace('MMMM', monthNames[0]?.value || '')
    .replace('MMM', monthAbbr[0]?.value || '');
}

/**
 * Formats a date as a relative time string
 * @param date - Date to format
 * @param now - Reference date (defaults to current time)
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date, now = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  if (diffMs < 0) {
    // Future dates
    const absDiffMs = Math.abs(diffMs);
    const absDiffSecs = Math.floor(absDiffMs / 1000);
    const absDiffMins = Math.floor(absDiffSecs / 60);
    const absDiffHours = Math.floor(absDiffMins / 60);
    const absDiffDays = Math.floor(absDiffHours / 24);
    
    if (absDiffDays > 0) return `in ${absDiffDays} day${absDiffDays > 1 ? 's' : ''}`;
    if (absDiffHours > 0) return `in ${absDiffHours} hour${absDiffHours > 1 ? 's' : ''}`;
    if (absDiffMins > 0) return `in ${absDiffMins} minute${absDiffMins > 1 ? 's' : ''}`;
    return 'in a moment';
  }
  
  // Past dates
  if (diffYears > 0) return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
  if (diffMonths > 0) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  if (diffWeeks > 0) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffSecs > 30) return `${diffSecs} second${diffSecs > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Formats a date range
 * @param startDate - Start date
 * @param endDate - End date
 * @param format - Date format to use
 * @returns Formatted date range string
 */
export function formatDateRange(
  startDate: Date,
  endDate: Date,
  format = 'MMM DD'
): string {
  const start = formatDate(startDate, format);
  const end = formatDate(endDate, format);
  
  if (start === end) {
    return start;
  }
  
  return `${start} - ${end}`;
}

/**
 * Formats a duration in milliseconds
 * @param durationMs - Duration in milliseconds
 * @param format - Format style ('short', 'long', 'compact')
 * @returns Formatted duration string
 */
export function formatDuration(
  durationMs: number,
  format: 'short' | 'long' | 'compact' = 'long'
): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  const remainingHours = hours % 24;
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;
  
  switch (format) {
    case 'short':
      if (days > 0) return `${days}d ${remainingHours}h`;
      if (hours > 0) return `${hours}h ${remainingMinutes}m`;
      if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
      return `${seconds}s`;
      
    case 'compact':
      if (days > 0) return `${days}d`;
      if (hours > 0) return `${hours}h`;
      if (minutes > 0) return `${minutes}m`;
      return `${seconds}s`;
      
    case 'long':
    default:
      const parts: string[] = [];
      if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
      if (remainingHours > 0) parts.push(`${remainingHours} hour${remainingHours > 1 ? 's' : ''}`);
      if (remainingMinutes > 0) parts.push(`${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`);
      if (remainingSeconds > 0) parts.push(`${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`);
      
      return parts.join(', ') || '0 seconds';
  }
}
```

#### Number Formatting

```typescript
/**
 * Formats a number with locale-specific formatting
 * @param value - Number to format
 * @param options - NumberFormat options
 * @param locale - Locale for formatting
 * @returns Formatted number string
 */
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
  locale = 'en-US'
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Formats a number as currency
 * @param value - Number to format
 * @param currency - Currency code
 * @param locale - Locale for formatting
 * @returns Formatted currency string
 */
export function formatCurrency(
  value: number,
  currency = 'USD',
  locale = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Formats a number as a percentage
 * @param value - Number to format (0-1 for percentage)
 * @param decimals - Number of decimal places
 * @param locale - Locale for formatting
 * @returns Formatted percentage string
 */
export function formatPercentage(
  value: number,
  decimals = 0,
  locale = 'en-US'
): string {
  const percentage = value * 100;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(percentage / 100);
}

/**
 * Formats file size in bytes
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places
 * @param binary - Use binary units (KiB, MiB) instead of decimal (KB, MB)
 * @returns Formatted file size string
 */
export function formatBytes(
  bytes: number,
  decimals = 2,
  binary = false
): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = binary ? 1024 : 1000;
  const sizes = binary 
    ? ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
    : ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  
  return `${value.toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Formats a number with ordinal suffix
 * @param value - Number to format
 * @param locale - Locale for formatting
 * @returns Formatted ordinal number string
 */
export function formatOrdinal(
  value: number,
  locale = 'en-US'
): string {
  return new Intl.PluralRules(locale, { type: 'ordinal' }).select(value);
}

/**
 * Formats a number with compact notation
 * @param value - Number to format
 * @param locale - Locale for formatting
 * @returns Formatted compact number string
 */
export function formatCompactNumber(
  value: number,
  locale = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Formats a number range
 * @param min - Minimum value
 * @param max - Maximum value
 * @param locale - Locale for formatting
 * @returns Formatted range string
 */
export function formatRange(
  min: number,
  max: number,
  locale = 'en-US'
): string {
  const formatter = new Intl.NumberFormat(locale);
  return `${formatter.format(min)} - ${formatter.format(max)}`;
}
```

#### String Formatting

```typescript
/**
 * Truncates a string to specified length
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add when truncated
 * @param preserveWords - Whether to preserve word boundaries
 * @returns Truncated string
 */
export function truncate(
  str: string,
  maxLength: number,
  suffix = '...',
  preserveWords = true
): string {
  if (str.length <= maxLength) return str;
  
  if (preserveWords) {
    const truncated = str.substring(0, maxLength - suffix.length);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      return truncated.substring(0, lastSpace) + suffix;
    }
  }
  
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitalizes the first letter of a string
 * @param str - String to capitalize
 * @returns Capitalized string
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Capitalizes the first letter of each word
 * @param str - String to capitalize
 * @param separator - Word separator (default: space)
 * @returns Title-cased string
 */
export function titleCase(
  str: string,
  separator = ' '
): string {
  return str
    .split(separator)
    .map(word => capitalize(word))
    .join(separator);
}

/**
 * Converts string to camelCase
 * @param str - String to convert
 * @returns camelCase string
 */
export function camelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, chr => chr.toLowerCase());
}

/**
 * Converts string to snake_case
 * @param str - String to convert
 * @returns snake_case string
 */
export function snakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[^a-z0-9]+/g, '_');
}

/**
 * Converts string to kebab-case
 * @param str - String to convert
 * @returns kebab-case string
 */
export function kebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/[^a-z0-9]+/g, '-');
}

/**
 * Converts string to PascalCase
 * @param str - String to convert
 * @returns PascalCase string
 */
export function pascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[a-z]/, chr => chr.toUpperCase());
}

/**
 * Removes HTML tags from a string
 * @param str - String to clean
 * @returns String without HTML tags
 */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Escapes HTML special characters
 * @param str - String to escape
 * @returns Escaped string
 */
export function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  
  return str.replace(/[&<>"'/]/g, char => htmlEscapes[char]);
}

/**
 * Unescapes HTML entities
 * @param str - String to unescape
 * @returns Unescaped string
 */
export function unescapeHtml(str: string): string {
  const htmlUnescapes: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#x2F;': '/'
  };
  
  return str.replace(/&amp;|&lt;|&gt;|&quot;|&#x27;|&#x2F;/g, entity => htmlUnescapes[entity]);
}
```

#### Template and Interpolation

```typescript
/**
 * Simple template interpolation
 * @param template - Template string with {{variable}} placeholders
 * @param data - Data object with variable values
 * @returns Interpolated string
 */
export function template(
  template: string,
  data: Record<string, any>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return String(data[key] ?? '');
  });
}

/**
 * Advanced template interpolation with filters
 * @param template - Template string with {{variable|filter}} syntax
 * @param data - Data object with variable values
 * @param filters - Available filters
 * @returns Interpolated string
 */
export function templateWithFilters(
  template: string,
  data: Record<string, any>,
  filters: Record<string, (value: any) => string> = {}
): string {
  return template.replace(/\{\{(\w+)(?:\|(\w+))?\}\}/g, (_, key, filter) => {
    let value = data[key] ?? '';
    
    if (filter && filters[filter]) {
      value = filters[filter](value);
    }
    
    return String(value);
  });
}

/**
 * Formats a list of items
 * @param items - Array of items to format
 * @param formatter - Function to format each item
 * @param separator - Separator between items
 * @param conjunction - Conjunction for last item (e.g., 'and', 'or')
 * @returns Formatted list string
 */
export function formatList<T>(
  items: T[],
  formatter: (item: T) => string = String,
  separator = ', ',
  conjunction = 'and'
): string {
  if (items.length === 0) return '';
  if (items.length === 1) return formatter(items[0]);
  if (items.length === 2) {
    return `${formatter(items[0])} ${conjunction} ${formatter(items[1])}`;
  }
  
  const formatted = items.map(formatter);
  const last = formatted.pop();
  return `${formatted.join(separator)}, ${conjunction} ${last}`;
}

/**
 * Formats a phone number
 * @param phone - Phone number string
 * @param format - Format style ('national', 'international', 'compact')
 * @returns Formatted phone number
 */
export function formatPhoneNumber(
  phone: string,
  format: 'national' | 'international' | 'compact' = 'national'
): string {
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    switch (format) {
      case 'national':
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
      case 'international':
        return `+1 ${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
      case 'compact':
        return cleaned;
    }
  }
  
  return phone; // Return original if not recognized format
}
```

#### Data Structure Formatting

```typescript
/**
 * Formats an object for display
 * @param obj - Object to format
 * @param indent - Indentation level
 * @returns Formatted object string
 */
export function formatObject(
  obj: Record<string, any>,
  indent = 2
): string {
  return JSON.stringify(obj, null, indent);
}

/**
 * Formats an array for display
 * @param arr - Array to format
 * @param formatter - Function to format each item
 * @param separator - Separator between items
 * @returns Formatted array string
 */
export function formatArray<T>(
  arr: T[],
  formatter: (item: T) => string = String,
  separator = ', '
): string {
  return arr.map(formatter).join(separator);
}

/**
 * Formats a table for display
 * @param data - Array of objects representing table rows
 * @param columns - Column definitions
 * @returns Formatted table string
 */
export function formatTable<T extends Record<string, any>>(
  data: T[],
  columns: Array<{
    key: keyof T;
    header: string;
    formatter?: (value: any) => string;
    width?: number;
  }>
): string {
  if (data.length === 0) return 'No data';
  
  // Format headers
  const headers = columns.map(col => col.header.padEnd(col.width || 10));
  const headerRow = headers.join(' | ');
  const separator = '-'.repeat(headerRow.length);
  
  // Format rows
  const rows = data.map(row => {
    return columns.map(col => {
      const value = row[col.key];
      const formatted = col.formatter ? col.formatter(value) : String(value);
      return formatted.padEnd(col.width || 10);
    }).join(' | ');
  });
  
  return [headerRow, separator, ...rows].join('\n');
}
```

### Transaction Management

**File**: `/src/utils/transactions.ts`

Comprehensive database transaction management utilities that provide ACID compliance, rollback capabilities, and transaction monitoring. These utilities ensure data consistency and provide robust error handling for database operations.

#### Core Transaction Types

```typescript
/**
 * Transaction context containing metadata about the current transaction
 */
export interface TransactionContext {
  id: string;
  startTime: Date;
  operations: Array<{
    service: string;
    method: string;
    timestamp: Date;
    duration?: number;
  }>;
  rollbackActions: RollbackAction[];
  metadata: Record<string, any>;
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
}

/**
 * Rollback action to be executed if transaction fails
 */
export interface RollbackAction {
  id: string;
  description: string;
  action: () => Promise<void>;
  priority: number; // Higher priority actions execute first
  dependencies?: string[]; // IDs of actions this depends on
}

/**
 * Transaction options for configuration
 */
export interface TransactionOptions {
  timeout?: number; // Transaction timeout in milliseconds
  retryAttempts?: number; // Number of retry attempts on failure
  retryDelay?: number; // Delay between retries in milliseconds
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  readOnly?: boolean; // Whether transaction is read-only
  rollbackOnError?: boolean; // Whether to rollback on any error
  savepoints?: boolean; // Whether to use savepoints for partial rollbacks
}

/**
 * Transaction callback function type
 */
export type TransactionCallback<T> = (context: TransactionContext) => Promise<T>;

/**
 * Transaction result with metadata
 */
export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  duration: number;
  operationsCount: number;
  rollbackActionsExecuted: number;
}
```

#### Transaction Manager

```typescript
/**
 * Main transaction manager for handling database transactions
 * Provides ACID compliance, rollback capabilities, and transaction monitoring
 */
export class TransactionManager {
  private readonly logger: Logger;
  private readonly transactionMonitor: TransactionMonitor;
  private readonly savepointManager: SavepointManager;

  constructor(
    private readonly db: DatabaseConnection,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('TransactionManager');
    this.transactionMonitor = new TransactionMonitor();
    this.savepointManager = new SavepointManager(db);
  }

  /**
   * Executes a transaction with full ACID compliance
   * @param operations - Transaction operations to execute
   * @param options - Transaction configuration options
   * @returns Promise that resolves with transaction result
   */
  async executeTransaction<T>(
    operations: TransactionCallback<T>,
    options: TransactionOptions = {}
  ): Promise<TransactionResult<T>> {
    const context = this.createTransactionContext(options);
    const startTime = Date.now();

    try {
      this.logger.info('Starting transaction', { transactionId: context.id });
      this.transactionMonitor.startTransaction(context);

      // Begin transaction
      await this.db.beginTransaction(options.isolationLevel);

      // Execute operations
      const result = await this.executeWithTimeout(
        () => operations(context),
        options.timeout || 30000
      );

      // Commit transaction
      await this.db.commit();
      
      const duration = Date.now() - startTime;
      this.logger.info('Transaction committed successfully', {
        transactionId: context.id,
        duration,
        operationsCount: context.operations.length
      });

      this.transactionMonitor.completeTransaction(context, duration);

      return {
        success: true,
        data: result,
        duration,
        operationsCount: context.operations.length,
        rollbackActionsExecuted: 0
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Transaction failed', {
        transactionId: context.id,
        error: error.message,
        duration
      });

      // Rollback transaction
      await this.rollbackTransaction(context, error as Error);

      this.transactionMonitor.failTransaction(context, error as Error, duration);

      return {
        success: false,
        error: error as Error,
        duration,
        operationsCount: context.operations.length,
        rollbackActionsExecuted: context.rollbackActions.length
      };
    }
  }

  /**
   * Executes a transaction with automatic retry on failure
   * @param operations - Transaction operations to execute
   * @param options - Transaction configuration options
   * @returns Promise that resolves with transaction result
   */
  async executeTransactionWithRetry<T>(
    operations: TransactionCallback<T>,
    options: TransactionOptions & { retryAttempts?: number; retryDelay?: number } = {}
  ): Promise<TransactionResult<T>> {
    const { retryAttempts = 3, retryDelay = 1000, ...transactionOptions } = options;
    let lastError: Error;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const result = await this.executeTransaction(operations, transactionOptions);
        if (result.success) {
          return result;
        }
        lastError = result.error!;
      } catch (error) {
        lastError = error as Error;
      }

      if (attempt < retryAttempts) {
        this.logger.warn('Transaction failed, retrying', {
          attempt,
          maxAttempts: retryAttempts,
          error: lastError.message
        });
        await sleep(retryDelay * attempt); // Exponential backoff
      }
    }

    throw lastError!;
  }

  /**
   * Creates a savepoint within the current transaction
   * @param name - Savepoint name
   * @returns Promise that resolves when savepoint is created
   */
  async createSavepoint(name: string): Promise<void> {
    await this.savepointManager.createSavepoint(name);
  }

  /**
   * Rolls back to a specific savepoint
   * @param name - Savepoint name to rollback to
   * @returns Promise that resolves when rollback is complete
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    await this.savepointManager.rollbackToSavepoint(name);
  }

  /**
   * Releases a savepoint
   * @param name - Savepoint name to release
   * @returns Promise that resolves when savepoint is released
   */
  async releaseSavepoint(name: string): Promise<void> {
    await this.savepointManager.releaseSavepoint(name);
  }

  /**
   * Adds an operation to the transaction context
   * @param context - Transaction context
   * @param service - Service name
   * @param method - Method name
   */
  addOperation(context: TransactionContext, service: string, method: string): void {
    context.operations.push({
      service,
      method,
      timestamp: new Date()
    });
  }

  /**
   * Adds a rollback action to the transaction context
   * @param context - Transaction context
   * @param action - Rollback action to add
   */
  addRollbackAction(context: TransactionContext, action: RollbackAction): void {
    context.rollbackActions.push(action);
    // Sort by priority (highest first)
    context.rollbackActions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Creates a new transaction context
   * @param options - Transaction options
   * @returns New transaction context
   */
  private createTransactionContext(options: TransactionOptions): TransactionContext {
    return {
      id: generateUUID(),
      startTime: new Date(),
      operations: [],
      rollbackActions: [],
      metadata: {},
      isolationLevel: options.isolationLevel
    };
  }

  /**
   * Executes operations with timeout
   * @param operations - Operations to execute
   * @param timeout - Timeout in milliseconds
   * @returns Promise that resolves with operation result
   */
  private async executeWithTimeout<T>(
    operations: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      operations(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Transaction timeout')), timeout);
      })
    ]);
  }

  /**
   * Rolls back a transaction and executes rollback actions
   * @param context - Transaction context
   * @param error - Error that caused the rollback
   */
  private async rollbackTransaction(context: TransactionContext, error: Error): Promise<void> {
    try {
      // Execute rollback actions in dependency order
      await this.executeRollbackActions(context);

      // Rollback database transaction
      await this.db.rollback();

      this.logger.info('Transaction rolled back successfully', {
        transactionId: context.id,
        rollbackActionsExecuted: context.rollbackActions.length
      });
    } catch (rollbackError) {
      this.logger.error('Rollback failed', {
        transactionId: context.id,
        originalError: error.message,
        rollbackError: rollbackError.message
      });
      throw rollbackError;
    }
  }

  /**
   * Executes rollback actions in dependency order
   * @param context - Transaction context
   */
  private async executeRollbackActions(context: TransactionContext): Promise<void> {
    const executed = new Set<string>();
    const actions = [...context.rollbackActions];

    while (actions.length > 0) {
      const executable = actions.filter(action => 
        !action.dependencies || 
        action.dependencies.every(dep => executed.has(dep))
      );

      if (executable.length === 0) {
        throw new Error('Circular dependency in rollback actions');
      }

      await Promise.all(
        executable.map(async action => {
          try {
            await action.action();
            executed.add(action.id);
            this.logger.debug('Rollback action executed', {
              actionId: action.id,
              description: action.description
            });
          } catch (error) {
            this.logger.error('Rollback action failed', {
              actionId: action.id,
              description: action.description,
              error: error.message
            });
            throw error;
          }
        })
      );

      // Remove executed actions
      actions.splice(0, executable.length);
    }
  }
}
```

#### Transaction Decorators

```typescript
/**
 * Decorator to make a method transactional
 * @param options - Transaction options
 */
export function transactional(options: TransactionOptions = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const transactionManager = new TransactionManager(target.db || target.constructor.db);

    descriptor.value = async function (...args: any[]) {
      return transactionManager.executeTransaction(async (context) => {
        // Add operation to context
        transactionManager.addOperation(context, target.constructor.name, propertyName);
        
        // Execute the original method
        return await method.apply(this, args);
      }, options);
    };
  };
}

/**
 * Decorator to make a method use savepoints
 * @param savepointName - Name for the savepoint
 */
export function withSavepoint(savepointName: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const transactionManager = new TransactionManager(target.db || target.constructor.db);

    descriptor.value = async function (...args: any[]) {
      try {
        await transactionManager.createSavepoint(savepointName);
        const result = await method.apply(this, args);
        await transactionManager.releaseSavepoint(savepointName);
        return result;
      } catch (error) {
        await transactionManager.rollbackToSavepoint(savepointName);
        throw error;
      }
    };
  };
}
```

#### Helper Functions

```typescript
/**
 * Executes operations within a transaction context
 * @param service - Service instance
 * @param operation - Operation to execute
 * @param options - Transaction options
 * @returns Promise that resolves with operation result
 */
export function withTransaction<TService, TResult>(
  service: TService,
  operation: (service: TService, context: TransactionContext) => Promise<TResult>,
  options: TransactionOptions = {}
): Promise<TransactionResult<TResult>> {
  const transactionManager = new TransactionManager(service.db || service.constructor.db);
  
  return transactionManager.executeTransaction(async (context) => {
    return await operation(service, context);
  }, options);
}

/**
 * Executes batch operations within a single transaction
 * @param db - Database connection
 * @param items - Items to process
 * @param operation - Operation to apply to each item
 * @param options - Transaction and batch options
 * @returns Promise that resolves with operation results
 */
export async function batchInTransaction<T, R>(
  db: DatabaseConnection,
  items: T[],
  operation: (item: T, index: number) => Promise<R>,
  options: TransactionOptions & { batchSize?: number } = {}
): Promise<R[]> {
  const { batchSize = 100, ...transactionOptions } = options;
  const transactionManager = new TransactionManager(db);
  const results: R[] = [];

  return transactionManager.executeTransaction(async (context) => {
    // Process items in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map((item, batchIndex) => 
          operation(item, i + batchIndex)
        )
      );
      
      results.push(...batchResults);
      
      // Add operation to context
      transactionManager.addOperation(context, 'BatchProcessor', `batch_${i / batchSize}`);
    }
    
    return results;
  }, transactionOptions);
}

/**
 * Executes operations in parallel within a transaction
 * @param db - Database connection
 * @param operations - Array of operations to execute
 * @param options - Transaction options
 * @returns Promise that resolves with operation results
 */
export async function parallelInTransaction<T>(
  db: DatabaseConnection,
  operations: Array<() => Promise<T>>,
  options: TransactionOptions = {}
): Promise<T[]> {
  const transactionManager = new TransactionManager(db);
  
  return transactionManager.executeTransaction(async (context) => {
    const results = await Promise.all(
      operations.map(async (operation, index) => {
        const result = await operation();
        transactionManager.addOperation(context, 'ParallelProcessor', `operation_${index}`);
        return result;
      })
    );
    
    return results;
  }, options);
}

/**
 * Creates a transaction context for manual transaction management
 * @param db - Database connection
 * @param options - Transaction options
 * @returns Transaction context and manager
 */
export function createTransactionContext(
  db: DatabaseConnection,
  options: TransactionOptions = {}
): { context: TransactionContext; manager: TransactionManager } {
  const manager = new TransactionManager(db);
  const context = manager['createTransactionContext'](options);
  
  return { context, manager };
}
```

#### Transaction Monitoring

```typescript
/**
 * Monitors transaction performance and provides metrics
 */
export class TransactionMonitor {
  private readonly metrics = {
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    averageDuration: 0,
    totalDuration: 0,
    activeTransactions: 0
  };

  private readonly activeTransactions = new Map<string, TransactionContext>();

  /**
   * Records the start of a transaction
   * @param context - Transaction context
   */
  startTransaction(context: TransactionContext): void {
    this.metrics.totalTransactions++;
    this.metrics.activeTransactions++;
    this.activeTransactions.set(context.id, context);
  }

  /**
   * Records the successful completion of a transaction
   * @param context - Transaction context
   * @param duration - Transaction duration in milliseconds
   */
  completeTransaction(context: TransactionContext, duration: number): void {
    this.metrics.successfulTransactions++;
    this.metrics.activeTransactions--;
    this.updateDurationMetrics(duration);
    this.activeTransactions.delete(context.id);
  }

  /**
   * Records the failure of a transaction
   * @param context - Transaction context
   * @param error - Error that caused the failure
   * @param duration - Transaction duration in milliseconds
   */
  failTransaction(context: TransactionContext, error: Error, duration: number): void {
    this.metrics.failedTransactions++;
    this.metrics.activeTransactions--;
    this.updateDurationMetrics(duration);
    this.activeTransactions.delete(context.id);
  }

  /**
   * Gets current transaction metrics
   * @returns Transaction metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Gets currently active transactions
   * @returns Array of active transaction contexts
   */
  getActiveTransactions(): TransactionContext[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * Updates duration-related metrics
   * @param duration - Transaction duration in milliseconds
   */
  private updateDurationMetrics(duration: number): void {
    this.metrics.totalDuration += duration;
    this.metrics.averageDuration = this.metrics.totalDuration / this.metrics.totalTransactions;
  }
}
```

#### Savepoint Management

```typescript
/**
 * Manages database savepoints for partial transaction rollbacks
 */
export class SavepointManager {
  private readonly savepoints = new Map<string, string>();

  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Creates a savepoint
   * @param name - Savepoint name
   * @returns Promise that resolves when savepoint is created
   */
  async createSavepoint(name: string): Promise<void> {
    const savepointId = `sp_${name}_${Date.now()}`;
    await this.db.execute(`SAVEPOINT ${savepointId}`);
    this.savepoints.set(name, savepointId);
  }

  /**
   * Rolls back to a specific savepoint
   * @param name - Savepoint name
   * @returns Promise that resolves when rollback is complete
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    const savepointId = this.savepoints.get(name);
    if (!savepointId) {
      throw new Error(`Savepoint '${name}' not found`);
    }
    
    await this.db.execute(`ROLLBACK TO SAVEPOINT ${savepointId}`);
  }

  /**
   * Releases a savepoint
   * @param name - Savepoint name
   * @returns Promise that resolves when savepoint is released
   */
  async releaseSavepoint(name: string): Promise<void> {
    const savepointId = this.savepoints.get(name);
    if (!savepointId) {
      throw new Error(`Savepoint '${name}' not found`);
    }
    
    await this.db.execute(`RELEASE SAVEPOINT ${savepointId}`);
    this.savepoints.delete(name);
  }

  /**
   * Gets all active savepoints
   * @returns Array of savepoint names
   */
  getActiveSavepoints(): string[] {
    return Array.from(this.savepoints.keys());
  }
}
```

## Utility Categories

### Async Utilities

```typescript
// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

// Promise utilities
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function timeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

export async function retry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < attempts - 1) {
        await sleep(delay * Math.pow(2, i)); // Exponential backoff
      }
    }
  }
  
  throw lastError!;
}

// Parallel execution with concurrency limit
export async function parallelLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  
  for (const item of items) {
    const promise = fn(item).then(result => {
      results.push(result);
    });
    
    executing.push(promise);
    
    if (executing.length >= limit) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === promise), 1);
    }
  }
  
  await Promise.all(executing);
  return results;
}
```

### Cryptographic Utilities

```typescript
// Hash generation
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Random string generation
export function generateRandomString(
  length: number,
  charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
): string {
  let result = '';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  
  return result;
}

// UUID generation
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

### Cache Utilities

```typescript
// Simple in-memory cache
export class Cache<T> {
  private cache = new Map<string, { value: T; expires: number }>();
  
  constructor(private defaultTTL = 3600000) {} // 1 hour default
  
  set(key: string, value: T, ttl = this.defaultTTL): void {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl
    });
  }
  
  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return undefined;
    }
    
    return item.value;
  }
  
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  // Automatic cleanup
  startCleanup(interval = 300000): void { // 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.cache.entries()) {
        if (now > item.expires) {
          this.cache.delete(key);
        }
      }
    }, interval);
  }
}

// Memoization decorator
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyFn?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>) => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}
```

## Implementation Patterns

### Functional Composition

```typescript
// Pipe function
export function pipe<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduce((acc, fn) => fn(acc), arg);
}

// Compose function
export function compose<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduceRight((acc, fn) => fn(acc), arg);
}

// Partial application
export function partial<T extends (...args: any[]) => any>(
  fn: T,
  ...boundArgs: Partial<Parameters<T>>
): (...args: any[]) => ReturnType<T> {
  return (...args: any[]) => fn(...boundArgs, ...args);
}

// Curry function
export function curry<T extends (...args: any[]) => any>(
  fn: T
): (...args: any[]) => any {
  return function curried(...args: any[]): any {
    if (args.length >= fn.length) {
      return fn(...args);
    }
    return (...nextArgs: any[]) => curried(...args, ...nextArgs);
  };
}
```

### Object Utilities

```typescript
// Deep clone
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as T;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as T;
  
  const cloned = {} as T;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

// Deep merge
export function deepMerge<T extends Record<string, any>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  if (!sources.length) return target;
  const source = sources.shift();
  
  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }
  
  return deepMerge(target, ...sources);
}

// Pick properties
export function pick<T, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

// Omit properties
export function omit<T, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => {
    delete result[key];
  });
  return result;
}
```

## Best Practices

### 1. Pure Functions

Write utilities as pure functions when possible:

```typescript
// Good: Pure function
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Bad: Mutates input
export function addDaysMutating(date: Date, days: number): Date {
  date.setDate(date.getDate() + days); // Mutates original
  return date;
}
```

### 2. Error Handling

Always handle edge cases:

```typescript
export function safeDivide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}

export function parseJSON<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
```

### 3. Type Safety

Use TypeScript features for type safety:

```typescript
// Use generics
export function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

// Use type predicates
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// Use overloads for better inference
export function getValue(key: string): string;
export function getValue(key: string, defaultValue: string): string;
export function getValue(key: string, defaultValue?: string): string | undefined {
  const value = localStorage.getItem(key);
  return value ?? defaultValue;
}
```

### 4. Performance

Consider performance implications:

```typescript
// Memoize expensive computations
const expensiveOperation = memoize((input: string) => {
  // Complex calculation
  return result;
});

// Use lazy evaluation
export function* range(start: number, end: number): Generator<number> {
  for (let i = start; i <= end; i++) {
    yield i;
  }
}
```

### 5. Testing

Make utilities easily testable:

```typescript
// Good: Dependency injection
export function createLogger(writer: (msg: string) => void) {
  return {
    log: (message: string) => {
      const timestamp = new Date().toISOString();
      writer(`[${timestamp}] ${message}`);
    }
  };
}

// Usage in tests
const messages: string[] = [];
const testLogger = createLogger(msg => messages.push(msg));
```

## Related Modules

- [Types Module](./types.md) - Type definitions and guards
- [Middleware Module](./middleware.md) - Uses validation utilities
- [Services Module](./services.md) - Uses error handling and transactions
- [Database Module](./database.md) - Transaction management
- [API Module](./api.md) - Uses formatters and validators

## Testing Utilities

```typescript
// Test helpers
export function createMockFunction<T extends (...args: any[]) => any>(): jest.MockedFunction<T> {
  return jest.fn() as jest.MockedFunction<T>;
}

export function waitFor(
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(check, interval);
      }
    };
    
    check();
  });
}

// Snapshot testing utilities
export function normalizeForSnapshot(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (key === 'id' || key === 'created_at' || key === 'updated_at') {
      return '[NORMALIZED]';
    }
    return value;
  }));
}
```