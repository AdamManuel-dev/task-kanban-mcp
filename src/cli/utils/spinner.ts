import type { Ora } from 'ora';
import ora from 'ora';
import { logger } from '../../utils/logger';

/**
 * Error thrown by SpinnerManager
 */
export class SpinnerError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'SpinnerError';
  }
}

/**
 * Manages loading spinners for CLI operations with comprehensive error handling
 */
export class SpinnerManager {
  private readonly _spinner: Ora | null = null; // eslint-disable-line @typescript-eslint/no-unused-vars

  private readonly isSpinning = false;

  private readonly destroyed = false;

  private readonly maxTextLength = 200;

  /**
   * Validate text input
   */
  private validateText(text: string): string {
    if (this.destroyed) {
      throw new SpinnerError('SpinnerManager has been destroyed', 'DESTROYED');
    }

    if (typeof text !== 'string') {
      throw new SpinnerError('Text must be a string', 'INVALID_TYPE');
    }

    if (text.length === 0) {
      throw new SpinnerError('Text cannot be empty', 'EMPTY_TEXT');
    }

    if (text.length > this.maxTextLength) {
      return `${String(String(text.substring(0, this.maxTextLength - 3)))}...`;
    }

    return text.trim();
  }

  /**
   * Safe spinner operation wrapper
   */
  private static safeOperation<T>(operation: () => T, fallback: T): T {
    try {
      return operation();
    } catch (error) {
      logger.warn(
        `Spinner operation failed: ${String(String(error instanceof Error ? error.message : String(error)))}`
      );
      return fallback;
    }
  }

  /**
   * Start a new spinner with the given text
   */
  start(text: string): void {
    try {
      const validatedText = this.validateText(text);

      if (this.isSpinning) {
        this.stop();
      }

      (this as any).spinner = SpinnerManager.safeOperation(
        () =>
          ora({
            text: validatedText,
            color: 'cyan',
            spinner: 'dots',
            hideCursor: true,
          }).start(),
        null
      );

      if ((this as any).spinner) {
        (this as any).isSpinning = true;
      } else {
        throw new SpinnerError('Failed to create spinner instance', 'CREATION_FAILED');
      }
    } catch (error) {
      if (error instanceof SpinnerError) {
        throw error;
      }
      throw new SpinnerError(
        `Failed to start spinner: ${String(String(error instanceof Error ? error.message : String(error)))}`,
        'START_FAILED'
      );
    }
  }

  /**
   * Update the spinner text
   */
  update(text: string): void {
    try {
      const validatedText = this.validateText(text);

      if (!(this as any).spinner) {
        throw new SpinnerError('No active spinner to update', 'NO_SPINNER');
      }

      if (!(this as any).isSpinning) {
        throw new SpinnerError('Spinner is not currently running', 'NOT_RUNNING');
      }

      SpinnerManager.safeOperation(() => {
        (this as any).spinner.text = validatedText;
        return true;
      }, false);
    } catch (error) {
      if (error instanceof SpinnerError) {
        throw error;
      }
      throw new SpinnerError(
        `Failed to update spinner: ${String(String(error instanceof Error ? error.message : String(error)))}`,
        'UPDATE_FAILED'
      );
    }
  }

  /**
   * Common stop logic with error handling
   */
  private stopSpinnerInstance(
    method: 'succeed' | 'fail' | 'warn' | 'info' | 'stop',
    text?: string
  ): void {
    try {
      if ((this as any).destroyed) {
        logger.warn('Attempted to stop destroyed spinner');
        return;
      }

      if (!(this as any).spinner || !(this as any).isSpinning) {
        // Silently ignore - not an error condition
        return;
      }

      const finalText = text ? this.validateText(text) : (this as any).spinner.text;

      SpinnerManager.safeOperation(() => {
        if (method === 'stop') {
          (this as any).spinner.stop();
        } else {
          (this as any).spinner[method](finalText);
        }
        return true;
      }, false);

      this.cleanupInstance();
    } catch (error) {
      logger.warn(
        `Failed to stop spinner: ${String(String(error instanceof Error ? error.message : String(error)))}`
      );
      this.forceCleanupInstance();
    }
  }

  /**
   * Clean up spinner state
   */
  private cleanupInstance(): void {
    (this as any).isSpinning = false;
    (this as any).spinner = null;
  }

  /**
   * Force cleanup in case of errors
   */
  private forceCleanupInstance(): void {
    try {
      if ((this as any).spinner) {
        (this as any).spinner.stop();
      }
    } catch {
      // Ignore errors during force cleanup
    }
    this.cleanupInstance();
  }

  /**
   * Stop the spinner with success
   */
  succeed(text?: string): void {
    this.stopSpinnerInstance('succeed', text);
  }

  /**
   * Stop the spinner with failure
   */
  fail(text?: string): void {
    this.stopSpinnerInstance('fail', text);
  }

  /**
   * Stop the spinner with warning
   */
  warn(text?: string): void {
    this.stopSpinnerInstance('warn', text);
  }

  /**
   * Stop the spinner with info
   */
  info(text?: string): void {
    this.stopSpinnerInstance('info', text);
  }

  /**
   * Stop the spinner without any status
   */
  stop(): void {
    this.stopSpinnerInstance('stop');
  }

  /**
   * Check if spinner is currently active
   */
  isActive(): boolean {
    return (this as any).isSpinning && !(this as any).destroyed;
  }

  /**
   * Destroy the spinner manager (cleanup)
   */
  destroy(): void {
    this.forceCleanupInstance();
    (this as any).destroyed = true;
  }

  /**
   * Create a promise that shows a spinner while executing
   */
  async withSpinner<T>(
    text: string,
    promise: Promise<T>,
    options?: {
      successText?: string;
      failText?: string;
      timeout?: number;
    }
  ): Promise<T> {
    if (promise == null || typeof promise.then !== 'function') {
      throw new SpinnerError('Promise is required and must be a valid Promise', 'INVALID_PROMISE');
    }

    this.start(text);

    const timeout = options?.timeout;
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      let racePromise: Promise<T>;

      if (timeout && timeout > 0) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new SpinnerError(`Operation timed out after ${String(timeout)}ms`, 'TIMEOUT'));
          }, timeout);
        });

        racePromise = Promise.race([promise, timeoutPromise]);
      } else {
        racePromise = promise;
      }

      const result = await racePromise;
      if (timeoutId) clearTimeout(timeoutId);
      this.succeed(options?.successText);
      return result;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const failText = options?.failText ?? `Failed: ${String(text)} - ${String(errorMessage)}`;

      this.fail(failText);
      throw error;
    }
  }

  /**
   * Create a spinner for a multi-step process
   */
  async withSteps(
    steps: Array<{
      text: string;
      action: () => Promise<any>;
      successText?: string;
      failText?: string;
      timeout?: number;
      skipOnError?: boolean;
    }>,
    options?: {
      stopOnError?: boolean;
      showProgress?: boolean;
    }
  ): Promise<{ results: any[]; errors: Error[] }> {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new SpinnerError('Steps must be a non-empty array', 'INVALID_STEPS');
    }

    const { stopOnError = true, showProgress = true } = options ?? {};
    const results: any[] = [];
    const errors: Error[] = [];

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];

      if (!step || typeof step.action !== 'function') {
        const error = new SpinnerError(
          `Invalid step at index ${String(i)}: action must be a function`,
          'INVALID_STEP'
        );
        errors.push(error);

        if (stopOnError && !step?.skipOnError) {
          throw error;
        }
        continue;
      }

      try {
        const progressText = showProgress
          ? `[${String(i + 1)}/${String(String(steps.length))}] ${String(String(step.text))}`
          : step.text;

        // eslint-disable-next-line no-await-in-loop
        const result = await this.withSpinner(progressText, step.action(), {
          ...(step.successText && { successText: step.successText }),
          ...(step.failText && { failText: step.failText }),
          ...(step.timeout && { timeout: step.timeout }),
        });

        results.push(result);
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error));
        errors.push(stepError);

        if (stopOnError && !step?.skipOnError) {
          throw stepError;
        }
      }
    }

    return { results, errors };
  }
}

// Export singleton instance
export const spinner = new SpinnerManager();

// Cleanup on process termination
const cleanup = (): void => {
  spinner.destroy();
};

process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGUSR1', cleanup);
process.on('SIGUSR2', cleanup);
process.on('uncaughtException', cleanup);
process.on('unhandledRejection', cleanup);
