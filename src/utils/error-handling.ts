/**
 * @fileoverview Standardized error handling utilities
 * @lastmodified 2025-07-31T12:00:00Z
 *
 * Features: Consistent error logging, error type detection, service error creation
 * Main APIs: handleServiceError(), createServiceError(), logAndThrow()
 * Constraints: Works with logger system, maintains error context
 * Patterns: Centralized error handling, consistent logging format
 */

import { logger } from './logger';

export interface ErrorContext {
  operation: string;
  service: string;
  details?: Record<string, unknown>;
  originalError?: Error;
}

export interface ServiceError extends Error {
  name: 'ServiceError';
  code: string;
  service: string;
  operation: string;
  details?: Record<string, unknown>;
  originalError?: Error;
}

/**
 * Standard error codes for different types of service errors
 */
export const ERROR_CODES = {
  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Resource errors
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',

  // Operation errors
  OPERATION_FAILED: 'OPERATION_FAILED',
  CIRCULAR_DEPENDENCY: 'CIRCULAR_DEPENDENCY',
  DEPENDENCY_VIOLATION: 'DEPENDENCY_VIOLATION',

  // System errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',

  // Security errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
} as const;

/**
 * Create a standardized service error
 *
 * @param code - Error code from ERROR_CODES
 * @param message - Human-readable error message
 * @param context - Error context information
 * @returns ServiceError instance
 */
export function createServiceError(
  code: keyof typeof ERROR_CODES,
  message: string,
  context: Omit<ErrorContext, 'originalError'>
): ServiceError {
  const error = new Error(message) as ServiceError;
  error.name = 'ServiceError';
  error.code = ERROR_CODES[code];
  error.service = context.service;
  error.operation = context.operation;
  error.details = context.details;

  return error;
}

/**
 * Handle service errors with consistent logging and error transformation
 *
 * This function provides a standardized way to handle errors across services.
 * It logs the error with appropriate context and can optionally transform
 * the error into a ServiceError.
 *
 * @param error - The caught error
 * @param context - Context information about the error
 * @param transformToServiceError - Whether to wrap in ServiceError
 * @returns ServiceError or re-throws original error
 */
export function handleServiceError(
  error: unknown,
  context: ErrorContext,
  transformToServiceError = true
): never {
  const originalError = error instanceof Error ? error : new Error(String(error));

  // Log the error with full context
  logger.error(`${context.service} operation failed`, {
    service: context.service,
    operation: context.operation,
    error: originalError.message,
    stack: originalError.stack,
    details: context.details,
  });

  if (transformToServiceError) {
    const serviceError = new Error(
      `${context.operation} failed: ${originalError.message}`
    ) as ServiceError;

    serviceError.name = 'ServiceError';
    serviceError.code = ERROR_CODES.OPERATION_FAILED;
    serviceError.service = context.service;
    serviceError.operation = context.operation;
    serviceError.details = context.details;
    serviceError.originalError = originalError;

    throw serviceError;
  }

  throw originalError;
}

/**
 * Log an error and throw a ServiceError in one operation
 *
 * Convenience function for common pattern of logging an error
 * and then throwing a ServiceError.
 *
 * @param code - Error code
 * @param message - Error message
 * @param context - Error context
 * @returns Never returns (always throws)
 */
export function logAndThrow(
  code: keyof typeof ERROR_CODES,
  message: string,
  context: ErrorContext
): never {
  logger.error(`${context.service} error: ${message}`, {
    service: context.service,
    operation: context.operation,
    code: ERROR_CODES[code],
    details: context.details,
  });

  throw createServiceError(code, message, context);
}

/**
 * Wrap an async operation with standardized error handling
 *
 * @param operation - Async operation to wrap
 * @param context - Error context for logging
 * @returns Promise that resolves to operation result or throws ServiceError
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: ErrorContext
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return handleServiceError(error, {
      ...context,
      originalError: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

/**
 * Check if an error is a ServiceError
 *
 * @param error - Error to check
 * @returns True if error is a ServiceError
 */
export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof Error && error.name === 'ServiceError';
}

/**
 * Extract error message safely from unknown error
 *
 * @param error - Error to extract message from
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

/**
 * Common validation error helper
 *
 * @param fieldName - Name of the field that failed validation
 * @param value - Value that failed validation
 * @param requirement - Description of the requirement
 * @param context - Service context
 * @returns Never returns (always throws)
 */
export function throwValidationError(
  fieldName: string,
  value: unknown,
  requirement: string,
  context: Pick<ErrorContext, 'service' | 'operation'>
): never {
  logAndThrow('VALIDATION_FAILED', `Field '${fieldName}' ${requirement}`, {
    ...context,
    details: { fieldName, value, requirement },
  });
}

/**
 * Common not found error helper
 *
 * @param resourceType - Type of resource (e.g., 'Task', 'Board')
 * @param identifier - Resource identifier that wasn't found
 * @param context - Service context
 * @returns Never returns (always throws)
 */
export function throwNotFoundError(
  resourceType: string,
  identifier: string,
  context: Pick<ErrorContext, 'service' | 'operation'>
): never {
  logAndThrow('RESOURCE_NOT_FOUND', `${resourceType} with ID '${identifier}' not found`, {
    ...context,
    details: { resourceType, identifier },
  });
}
