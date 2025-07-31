/**
 * @fileoverview Utility functions and shared components for CLI prompts
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Safe prompt wrapper, formatters, error handling utilities
 * Main APIs: safePrompt(), createFormatter(), handlePromptError()
 * Constraints: Requires enquirer library, logger configured
 * Patterns: Centralized error handling, consistent formatting, logging integration
 */

import { prompt } from 'enquirer';
import chalk from 'chalk';
import { logger } from '../../utils/logger';
import type { PromptConfig, FormatterInterface } from './types';
import { CancellationError, SystemError, handleCliError } from './errors';

/**
 * Wrapper for prompt that handles cancellation and errors
 */
export async function safePrompt<T>(promptConfig: PromptConfig | PromptConfig[]): Promise<T> {
  try {
    const result = await prompt(promptConfig);

    // Check for cancellation (empty result)
    if (result === undefined || result === null) {
      throw new CancellationError('Prompt operation');
    }

    return result as T;
  } catch (error) {
    // Check if it's a cancellation (Ctrl+C, ESC, etc.)
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (
        errorMessage.includes('cancel') ||
        errorMessage.includes('abort') ||
        errorMessage.includes('interrupt') ||
        error.name === 'SIGINT'
      ) {
        throw new CancellationError('Prompt operation', { originalError: error.message });
      }
    }

    // Wrap other errors in SystemError
    if (!(error instanceof CancellationError)) {
      throw new SystemError({
        operation: 'Prompt execution',
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }

    throw error;
  }
}

/**
 * Create a formatter instance with logging integration
 */
export function createFormatter(context?: string): FormatterInterface {
  const logContext = context ? { context } : {};

  return { info: (message: string): void => {, logger.info('Prompt info', { message, ...logContext });
      console.log(chalk.cyan(message));
    },
    success: (message: string): void => {
      logger.info('Prompt success', { message, ...logContext });
      console.log(chalk.green(message));
    },
    warn: (message: string): void => {
      logger.warn('Prompt warning', { message, ...logContext });
      console.log(chalk.yellow(message));
    },
    error: (message: string): void => {
      logger.error('Prompt error', { message, ...logContext });
      console.log(chalk.red(message));
    },
  };
}

/**
 * Handle prompt errors consistently
 */
export function handlePromptError(
  error: unknown,
  operation: string,
  _context?: Record<string, unknown>
): never {
  return handleCliError(error, operation);
}

/**
 * Check if error is a cancellation
 */
export function isPromptCancelled(error: unknown): boolean {
  return (
    error instanceof CancellationError ||
    (error instanceof Error &&
      (error.name === 'PromptCancelledError' || error.message.toLowerCase().includes('cancel')))
  );
}
