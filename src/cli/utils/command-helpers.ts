/**
 * @fileoverview Command helper utilities for CLI operations
 * @lastmodified 2025-07-28T13:00:00Z
 *
 * Features: Reusable patterns for API calls, error handling, validation, and formatting
 * Main APIs: withApiClient(), withErrorHandling(), withValidation(), withSpinner()
 * Constraints: Requires global CLI components, maintains error handling consistency
 * Patterns: Higher-order functions, decorator pattern, standardized error responses
 */

import type { CliComponents } from '../types';
import { handleCommandError, handleValidationError } from '../../utils/error-handler';
import { SpinnerManager } from './spinner';
import { hasValidTaskData, hasValidBoardData, hasValidData } from '../../utils/type-guards';

/**
 * Get global CLI components with proper error handling
 */
export const getComponents = (): CliComponents => {
  if (!global.cliComponents) {
    throw new Error('CLI components not initialized');
  }
  return global.cliComponents;
};

/**
 * Higher-order function to inject API client into command handlers
 */
export const withApiClient =
  <T, Args extends unknown[]>(handler: (client: any, ...args: Args) => Promise<T>) =>
  async (...args: Args): Promise<T> => {
    const { apiClient } = getComponents();
    return handler(apiClient, ...args);
  };

/**
 * Higher-order function to wrap command handlers with standardized error handling
 */
export const withErrorHandling =
  <T extends unknown[]>(operation: string, handler: (...args: T) => Promise<void>) =>
  async (...args: T): Promise<void> => {
    try {
      await handler(...args);
    } catch (error) {
      const { formatter } = getComponents();
      handleCommandError(formatter, { operation }, error);
    }
  };

/**
 * Higher-order function to wrap handlers with spinner loading indicators
 */
export const withSpinner =
  <T extends unknown[], R>(
    loadingMessage: string,
    successMessage: string,
    handler: (...args: T) => Promise<R>
  ) =>
  async (...args: T): Promise<R> => {
    const spinner = new SpinnerManager();
    try {
      spinner.start(loadingMessage);
      const result = await handler(...args);
      spinner.succeed(successMessage);
      return result;
    } catch (error) {
      spinner.fail(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

/**
 * Higher-order function for input validation before command execution
 */
export const withValidation =
  <T extends unknown[]>(
    validator: (...args: T) => string[],
    handler: (...args: T) => Promise<void>
  ) =>
  async (...args: T): Promise<void> => {
    const { formatter } = getComponents();
    const errors = validator(...args);

    if (errors.length > 0) {
      handleValidationError(formatter, 'validate input', errors);
      return;
    }

    await handler(...args);
  };

/**
 * Standard validation for required string fields
 */
export const validateRequiredFields = (fields: Record<string, unknown>): string[] => {
  const errors: string[] = [];

  for (const [fieldName, value] of Object.entries(fields)) {
    if (!value || (typeof value === 'string' && value.trim().length === 0)) {
      errors.push(`${fieldName} is required`);
    }
  }

  return errors;
};

/**
 * Validation for task ID format
 */
export const validateTaskId = (taskId: string): string[] => {
  const errors: string[] = [];

  if (!taskId || taskId.trim().length === 0) {
    errors.push('Task ID is required');
  } else if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
    errors.push('Task ID must contain only alphanumeric characters, underscores, and hyphens');
  }

  return errors;
};

/**
 * Validation for board ID format
 */
export const validateBoardId = (boardId: string): string[] => {
  const errors: string[] = [];

  if (!boardId || boardId.trim().length === 0) {
    errors.push('Board ID is required');
  } else if (!/^[a-zA-Z0-9_-]+$/.test(boardId)) {
    errors.push('Board ID must contain only alphanumeric characters, underscores, and hyphens');
  }

  return errors;
};

/**
 * Helper to ensure board ID is available (from options or default)
 */
export const ensureBoardId = (providedBoardId?: string): string => {
  const { config, formatter } = getComponents();

  const boardId = providedBoardId ?? config.getDefaultBoard();
  if (!boardId) {
    formatter.error(
      'Board ID is required. Specify an ID or set default board with "kanban config set defaults.board <id>"'
    );
    process.exit(1);
  }

  return boardId;
};

/**
 * Common pattern for API responses with data validation
 */
export const withDataValidation =
  <T>(
    validator: (response: unknown) => response is { data: T },
    noDataMessage: string = 'No data found'
  ) =>
  (response: unknown): T => {
    const { formatter } = getComponents();

    if (!validator(response)) {
      formatter.info(noDataMessage);
      process.exit(0);
    }

    return response.data;
  };

/**
 * Pre-configured data validators for common response types
 */
export const validateTasksResponse = withDataValidation(hasValidTaskData, 'No tasks found');
export const validateBoardsResponse = withDataValidation(hasValidBoardData, 'No boards found');
export const validateDataResponse = withDataValidation(hasValidData, 'No data available');

/**
 * Helper for interactive confirmation prompts
 */
export const confirmAction = async (
  message: string,
  defaultValue: boolean = false
): Promise<boolean> => {
  const inquirer = await import('inquirer');
  const { confirm } = await inquirer.default.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message,
      default: defaultValue,
    },
  ]);

  return confirm;
};

/**
 * Helper for formatting command output consistently
 */
export const formatOutput = <T>(
  data: T | T[],
  options?: {
    fields?: string[];
    headers?: string[];
    title?: string;
  }
): void => {
  const { formatter } = getComponents();

  if (options?.title) {
    formatter.info(options.title);
  }

  if (options?.fields && options?.headers) {
    formatter.output(data, {
      fields: options.fields,
      headers: options.headers,
    });
  } else {
    formatter.output(data);
  }
};

/**
 * Helper for standardized success messages
 */
export const showSuccess = (message: string, data?: unknown): void => {
  const { formatter } = getComponents();
  formatter.success(message);

  if (data) {
    formatter.output(data);
  }
};

/**
 * Helper for standardized error messages
 */
export const showError = (message: string, exitCode: number = 1): never => {
  const { formatter } = getComponents();
  formatter.error(message);
  process.exit(exitCode);
};

/**
 * Helper to build search/filter parameters from command options
 */
export const buildFilterParams = (options: Record<string, unknown>): Record<string, string> => {
  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null) {
      if (typeof value === 'string' && value.trim().length > 0) {
        params[key] = value.trim();
      } else if (typeof value === 'number') {
        params[key] = value.toString();
      } else if (typeof value === 'boolean') {
        params[key] = value.toString();
      }
    }
  }

  return params;
};

/**
 * Helper to parse and validate limit parameters
 */
export const parseLimit = (
  limitStr?: string,
  defaultLimit: number = 20,
  maxLimit: number = 100
): number => {
  if (!limitStr) return defaultLimit;

  const limit = parseInt(limitStr, 10);
  if (isNaN(limit) || limit < 1) {
    return defaultLimit;
  }

  return Math.min(limit, maxLimit);
};

/**
 * Helper to parse sort parameters
 */
export const parseSortParams = (
  sort?: string,
  order?: string,
  defaultSort: string = 'createdAt',
  validSortFields: string[] = ['createdAt', 'updatedAt', 'priority', 'title']
): { sort: string; order: 'asc' | 'desc' } => {
  const validSort = sort && validSortFields.includes(sort) ? sort : defaultSort;
  const validOrder = order === 'asc' || order === 'desc' ? order : 'desc';

  return { sort: validSort, order: validOrder };
};
