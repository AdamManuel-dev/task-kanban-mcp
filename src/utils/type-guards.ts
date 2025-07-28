/**
 * @fileoverview Type guards and validation utilities
 * @lastmodified 2025-07-28T12:00:00Z
 *
 * Features: Complex conditional logic simplified into reusable type guards
 * Main APIs: hasValidTaskData(), hasValidBoardData(), isSuccessResponse()
 * Constraints: Maintains type safety while improving readability
 * Patterns: Type guard functions, response validation, data existence checks
 */

import type { Task, Board } from '../types';

/**
 * Type guard to check if response contains valid task data array
 */
export const hasValidTaskData = (response: unknown): response is { data: Task[] } =>
  response !== null &&
  response !== undefined &&
  typeof response === 'object' &&
  'data' in response &&
  Array.isArray((response as { data: unknown }).data) &&
  (response as { data: unknown[] }).data.length > 0;

/**
 * Type guard to check if response contains valid board data array
 */
export const hasValidBoardData = (response: unknown): response is { data: Board[] } =>
  response !== null &&
  response !== undefined &&
  typeof response === 'object' &&
  'data' in response &&
  Array.isArray((response as { data: unknown }).data) &&
  (response as { data: unknown[] }).data.length > 0;

/**
 * Type guard to check if response contains any valid data array
 */
export const hasValidData = (response: unknown): response is { data: unknown[] } =>
  response !== null &&
  response !== undefined &&
  typeof response === 'object' &&
  'data' in response &&
  Array.isArray((response as { data: unknown }).data) &&
  (response as { data: unknown[] }).data.length > 0;

/**
 * Type guard to check if response is a success response with data
 */
export const isSuccessResponseWithData = <T>(
  response: unknown
): response is { success: true; data: T } =>
  response !== null &&
  response !== undefined &&
  typeof response === 'object' &&
  'success' in response &&
  (response as { success: unknown }).success === true &&
  'data' in response &&
  (response as { data: unknown }).data !== null &&
  (response as { data: unknown }).data !== undefined;

/**
 * Type guard to check if value is a valid non-empty string
 */
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Type guard to check if value is a valid number within range
 */
export const isValidNumber = (value: unknown, min?: number, max?: number): value is number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return false;
  }

  if (min !== undefined && value < min) {
    return false;
  }

  if (max !== undefined && value > max) {
    return false;
  }

  return true;
};

/**
 * Type guard to check if value is a valid priority (1-10)
 */
export const isValidPriority = (value: unknown): value is number => isValidNumber(value, 1, 10);

/**
 * Type guard to check if object has required properties
 */
export const hasRequiredProperties = <T extends Record<string, unknown>>(
  obj: unknown,
  requiredKeys: (keyof T)[]
): obj is T => {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const objectKeys = Object.keys(obj as Record<string, unknown>);
  return requiredKeys.every(key => objectKeys.includes(String(key)));
};

/**
 * Type guard to check if value is a valid task status
 */
export const isValidTaskStatus = (
  value: unknown
): value is 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived' =>
  typeof value === 'string' &&
  ['todo', 'in_progress', 'done', 'blocked', 'archived'].includes(value);

/**
 * Type guard to check if value is a valid date string
 */
export const isValidDateString = (value: unknown): value is string => {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

/**
 * Validation helper for API response structure
 */
export const validateApiResponse = <T>(
  response: unknown,
  validator: (data: unknown) => data is T
): response is { data: T } =>
  response !== null &&
  response !== undefined &&
  typeof response === 'object' &&
  'data' in response &&
  validator((response as { data: unknown }).data);

/**
 * Type guard to check if error has message property
 */
export const isErrorWithMessage = (error: unknown): error is { message: string } =>
  error !== null &&
  error !== undefined &&
  typeof error === 'object' &&
  'message' in error &&
  typeof (error as { message: unknown }).message === 'string';

/**
 * Safe error message extraction
 */
export const extractErrorMessage = (error: unknown): string => {
  if (isErrorWithMessage(error)) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error occurred';
};
