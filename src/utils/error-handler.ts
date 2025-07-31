/**
 * @fileoverview Unified error handling utilities for CLI commands and services
 * @lastmodified 2025-07-28T03:30:00Z
 *
 * Features: Consistent error handling patterns, structured logging, exit codes
 * Main APIs: handleCommandError(), logAndThrow(), createServiceError()
 * Constraints: Requires logger instance, uses standard exit codes
 * Patterns: Error context enrichment, user-friendly messaging, debugging support
 */

import { logger } from './logger';
import type { OutputFormatter } from '../cli/formatter';
import { EXIT_CODES, ERROR_PREFIXES } from '../constants';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ErrorContext {
  /** Operation that was being performed when error occurred */
  operation: string;
  /** Additional context data for debugging */
  details?: Record<string, unknown>;
  /** Custom exit code (defaults to GENERAL_ERROR) */
  exitCode?: number;
  /** Skip logging if already logged upstream */
  skipLogging?: boolean;
}

export interface ServiceErrorContext {
  /** Error code for categorization */
  code: string;
  /** HTTP status code for API errors */
  statusCode?: number;
  /** Additional context for debugging */
  details?: Record<string, unknown>;
}

// ============================================================================
// CLI COMMAND ERROR HANDLING
// ============================================================================

/**
 * Handles CLI command errors with consistent formatting and logging
 *
 * @param formatter CLI output formatter
 * @param context Error context with operation details
 * @param error The error that occurred
 * @returns Never returns (calls process.exit)
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   handleCommandError(formatter, {
 *     operation: 'create task',
 *     details: { taskId: 'task-123' }
 *   }, error);
 * }
 * ```
 */
export const handleCommandError = (
  formatter: OutputFormatter,
  context: ErrorContext,
  error: unknown
): never => {
  const message = extractErrorMessage(error);

  // Structured logging for debugging
  if (!context.skipLogging) {
    logger.error(`Failed to ${context.operation}`, {
      error: message,
      details: context.details,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  // User-friendly output
  formatter.error(`${ERROR_PREFIXES.GENERAL}: Failed to ${context.operation}: ${message}`);

  // Exit with appropriate code
  process.exit(context.exitCode ?? EXIT_CODES.GENERAL_ERROR);
};

/**
 * Handles validation errors specifically
 *
 * @param formatter CLI output formatter
 * @param operation Operation that failed validation
 * @param validationErrors Array of validation error messages
 * @returns Never returns (calls process.exit)
 */
export const handleValidationError = (
  formatter: OutputFormatter,
  operation: string,
  validationErrors: string[]
): never => {
  logger.error(`Validation failed for ${operation}`, {
    validationErrors,
  });

  formatter.error(`${ERROR_PREFIXES.VALIDATION}: ${operation} failed validation:`);
  validationErrors.forEach(error => {
    formatter.error(`  • ${error}`);
  });

  process.exit(EXIT_CODES.INVALID_USAGE);
};

/**
 * Handles network-related errors
 *
 * @param formatter CLI output formatter
 * @param operation Operation that failed
 * @param error Network error
 * @returns Never returns (calls process.exit)
 */
export const handleNetworkError = (
  formatter: OutputFormatter,
  operation: string,
  error: unknown
): never => {
  const message = extractErrorMessage(error);

  logger.error(`Network error during ${operation}`, {
    error: message,
    isNetworkError: true,
  });

  formatter.error(
    `${ERROR_PREFIXES.NETWORK}: Failed to ${operation} due to network issue: ${message}`
  );
  formatter.info('Please check your connection and try again.');

  process.exit(EXIT_CODES.NETWORK_ERROR);
};

/**
 * Handles permission-related errors
 */
export const handlePermissionError = (
  formatter: OutputFormatter,
  operation: string,
  resource: string
): never => {
  logger.error(`Permission denied for ${operation}`, {
    resource,
  });

  formatter.error(
    `${ERROR_PREFIXES.PERMISSION}: Cannot ${operation} - insufficient permissions for ${resource}`
  );
  formatter.info('Please check your access rights and try again.');

  process.exit(EXIT_CODES.PERMISSION_DENIED);
};

/**
 * Handles resource not found errors
 */
export const handleNotFoundError = (
  formatter: OutputFormatter,
  resourceType: string,
  resourceId: string
): never => {
  logger.error(`Resource not found`, {
    resourceType,
    resourceId,
  });

  formatter.error(`${ERROR_PREFIXES.NOT_FOUND}: ${resourceType} '${resourceId}' not found`);

  process.exit(EXIT_CODES.NOT_FOUND);
};

// ============================================================================
// SERVICE ERROR HANDLING
// ============================================================================

/**
 * Creates standardized service errors with consistent structure
 *
 * @param message Human-readable error message
 * @param context Service error context
 * @returns ServiceError instance
 *
 * @example
 * ```typescript
 * if (!task) {
 *   throw createServiceError('Task not found', {
 *     code: 'TASK_NOT_FOUND',
 *     statusCode: 404,
 *     details: { taskId }
 *   });
 * }
 * ```
 */
export const createServiceError = (message: string, context: ServiceErrorContext): ServiceError => {
  const error = new Error(message) as ServiceError;
  error.code = context.code;
  error.statusCode = context.statusCode ?? 500;
  error.details = context.details;
  return error;
};

/**
 * Logs error and throws it for upstream handling
 *
 * @param message Error message
 * @param details Additional context
 * @returns Never returns (throws error)
 *
 * @example
 * ```typescript
 * if (invalidInput) {
 *   logAndThrow('Invalid input provided', { input, expectedFormat });
 * }
 * ```
 */
export const logAndThrow = (message: string, details?: Record<string, unknown>): never => {
  logger.error(message, details);
  throw new Error(message);
};

// ============================================================================
// ASYNC OPERATION WRAPPERS
// ============================================================================

/**
 * Wraps async operations with consistent error handling
 *
 * @param operation Async operation to execute
 * @param context Error context
 * @param formatter CLI formatter
 * @returns Promise with result or handles error
 */
export const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  formatter: OutputFormatter
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    handleCommandError(formatter, context, error);
    throw error; // Re-throw after handling
  }
};

/**
 * Wraps service operations with structured error handling
 *
 * @param operation Service operation to execute
 * @param operationName Name of operation for logging
 * @param context Additional context
 * @returns Promise with result or throws ServiceError
 */
export const withServiceErrorHandling = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Record<string, unknown>
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    const message = extractErrorMessage(error);
    logger.error(`Service operation failed: ${operationName}`, {
      error: message,
      context,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Re-throw as ServiceError if not already one
    if (isServiceError(error)) {
      throw error;
    }

    throw createServiceError(`${operationName} failed: ${message}`, {
      code: 'OPERATION_FAILED',
      statusCode: 500,
      details: context,
    });
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extracts meaningful error message from unknown error types
 */
export const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }

  return 'Unknown error occurred';
};

/**
 * Checks if error is a ServiceError
 */
export const isServiceError = (error: unknown): error is ServiceError =>
  error instanceof Error && 'code' in error && 'statusCode' in error;

/**
 * Checks if error is a network-related error
 */
export const isNetworkError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('fetch')
  );
};

/**
 * Checks if error indicates a permission issue
 */
export const isPermissionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('permission') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('access denied')
  );
};

/**
 * Checks if error indicates a resource not found
 */
export const isNotFoundError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('not found') || message.includes('does not exist') || message.includes('404')
  );
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * ServiceError interface for consistent service-level error handling
 */
export interface ServiceError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

// ============================================================================
// ERROR RECOVERY UTILITIES
// ============================================================================

/**
 * Retries an operation with exponential backoff
 *
 * @param operation Operation to retry
 * @param maxRetries Maximum number of retry attempts
 * @param baseDelay Base delay in milliseconds
 * @returns Promise with result
 */
export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break; // Don't wait after the last attempt
      }

      const delay = baseDelay * 2 ** attempt;
      logger.warn(`Operation failed, retrying in ${delay}ms`, {
        attempt: attempt + 1,
        maxRetries,
        error: extractErrorMessage(error),
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};

/**
 * Handles graceful shutdown on process signals
 */
export const setupGracefulShutdown = (cleanup?: () => Promise<void>): void => {
  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      if (cleanup) {
        await cleanup();
      }
      process.exit(EXIT_CODES.SUCCESS);
    } catch (error) {
      logger.error('Error during graceful shutdown', {
        error: extractErrorMessage(error),
      });
      process.exit(EXIT_CODES.GENERAL_ERROR);
    }
  };

  process.on('SIGTERM', () => {
    void handleShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void handleShutdown('SIGINT');
  });
};
