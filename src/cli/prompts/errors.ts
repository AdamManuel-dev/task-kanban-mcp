/**
 * @fileoverview Standardized error handling and formatting for CLI prompts
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Error message formatting, error types, standardized responses
 * Main APIs: StandardError classes, formatError(), createErrorResponse()
 * Constraints: Must integrate with logger and chalk for consistent output
 * Patterns: Error hierarchy, consistent messaging, structured error data
 */

/* eslint-disable max-classes-per-file */
import chalk from 'chalk';
import { logger } from '../../utils/logger';

// Configuration interfaces for error constructors
export interface ValidationErrorConfig {
  field: string;
  value: unknown;
  reason: string;
  context?: Record<string, unknown>;
}

export interface InputErrorConfig {
  input: unknown;
  expected: string;
  context?: Record<string, unknown>;
}

export interface SystemErrorConfig {
  operation: string;
  cause: Error;
  context?: Record<string, unknown>;
}

// Utility functions (declared first to avoid hoisting issues)
/**
 * Get styled prefix for error category
 */
function getErrorPrefix(category: string): string {
  switch (category) {
    case 'validation':
      return chalk.red('❌ Validation Error:');
    case 'cancellation':
      return chalk.yellow('⚠️  Cancelled:');
    case 'system':
      return chalk.red('🚨 System Error:');
    case 'input':
      return chalk.red('📝 Input Error:');
    default:
      return chalk.red('❌ Error:');
  }
}

/**
 * Format error message with consistent styling
 */
export function formatErrorMessage(category: string, message: string): string {
  const prefix = getErrorPrefix(category);
  return `${prefix} ${message}`;
}

// Error class definitions
/**
 * Base error class for all prompt-related errors
 */
export abstract class PromptError extends Error {
  abstract readonly code: string;

  abstract readonly category: 'validation' | 'cancellation' | 'system' | 'input';

  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  /**
   * Get formatted error message for display to user
   */
  getDisplayMessage(): string {
    return formatErrorMessage(this.category, this.message);
  }

  /**
   * Get structured error data for logging
   */
  getLogData(): Record<string, unknown> {
    return {
      code: this.code,
      category: this.category,
      message: this.message,
      context: this.context,
      stack: this.stack,
    };
  }
}

// Validation and input errors
export class ValidationError extends PromptError {
  readonly code = 'VALIDATION_FAILED';

  readonly category = 'validation' as const;

  constructor(config: ValidationErrorConfig) {
    const { field, value, reason, context } = config;
    super(`${field}: ${reason}`, { field, value, reason, ...context });
  }
}

export class InputError extends PromptError {
  readonly code = 'INVALID_INPUT';

  readonly category = 'input' as const;

  constructor(config: InputErrorConfig) {
    const { input, expected, context } = config;
    super(`Invalid input: expected ${expected}, got ${typeof input}`, {
      input,
      expected,
      ...context,
    });
  }
}

// Operation errors
export class CancellationError extends PromptError {
  readonly code = 'USER_CANCELLED';

  readonly category = 'cancellation' as const;

  constructor(operation: string, context?: Record<string, unknown>) {
    super(`${operation} was cancelled by user`, { operation, ...context });
  }
}

export class SystemError extends PromptError {
  readonly code = 'SYSTEM_ERROR';

  readonly category = 'system' as const;

  constructor(config: SystemErrorConfig) {
    const { operation, cause, context } = config;
    super(`${operation} failed: ${cause.message}`, {
      cause: cause.message,
      ...context,
    });
    if (cause.stack) {
      this.stack = cause.stack;
    }
  }
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  error: unknown,
  operation: string
): {
  success: false;
  error: string;
  code: string;
  category: string;
} {
  if (error instanceof PromptError) {
    logger.error(`${operation} failed`, error.getLogData());
    return { success: false, error: error.message, code: error.code, category: error.category };
  }

  // Handle standard errors
  const message = error instanceof Error ? error.message : String(error);
  const systemError = new SystemError({
    operation,
    cause: error instanceof Error ? error : new Error(message),
  });

  logger.error(`${operation} failed`, systemError.getLogData());

  return {
    success: false,
    error: systemError.message,
    code: systemError.code,
    category: systemError.category,
  };
}

/**
 * Handle and format error for CLI display
 */
export function handleCliError(error: unknown, operation: string): never {
  const response = createErrorResponse(error, operation);

  // Display formatted error to user
  logger.info('');
  logger.info(formatErrorMessage(response.category, response.error));
  logger.info('');

  // Re-throw the original error to maintain stack trace
  throw error;
}

/**
 * Wrap async operations with standardized error handling
 */
export async function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  try {
    logger.debug(`Starting ${operation}`, context);
    const result = await fn();
    logger.debug(`Completed ${operation}`, { ...context, success: true });
    return result;
  } catch (error) {
    if (error instanceof PromptError) {
      // Already properly formatted, just re-throw
      throw error;
    }

    // Wrap in system error
    throw new SystemError({
      operation,
      cause: error instanceof Error ? error : new Error(String(error)),
      context,
    });
  }
}

/**
 * Validation helper that throws standardized errors
 */
export function validateInput<T>(
  field: string,
  value: T,
  validator: (value: T) => boolean | string,
  context?: Record<string, unknown>
): T {
  const result = validator(value);

  if (result) {
    return value;
  }

  const reason = typeof result === 'string' ? result : 'validation failed';
  throw new ValidationError({
    field,
    value,
    reason,
    context,
  });
}

/**
 * Check for user cancellation and throw appropriate error
 */
export function checkCancellation(
  result: unknown,
  operation: string,
  context?: Record<string, unknown>
): void {
  if (result === undefined || result === null) {
    throw new CancellationError(operation, context);
  }
}

/**
 * Error recovery suggestions
 */
export function getErrorSuggestions(error: PromptError): string[] {
  switch (error.category) {
    case 'validation':
      return [
        'Check your input format and try again',
        'Refer to the help text for valid options',
        'Use the --help flag for more information',
      ];
    case 'cancellation':
      return [
        'Use Ctrl+C to exit completely',
        'Press Enter to continue with default values',
        'Type "help" for available commands',
      ];
    case 'system':
      return [
        'Check your internet connection',
        'Verify file permissions',
        'Try running the command again',
        'Contact support if the problem persists',
      ];
    case 'input':
      return [
        'Verify the input format is correct',
        'Check for typos in your input',
        'Use quotes for strings with spaces',
      ];
    default:
      return ['Try running the command again'];
  }
}
