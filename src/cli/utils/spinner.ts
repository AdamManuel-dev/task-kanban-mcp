import type { Ora } from 'ora';
import ora from 'ora';

/**
 * Manages loading spinners for CLI operations
 */
export class SpinnerManager {
  private spinner: Ora | null = null;

  private isSpinning = false;

  /**
   * Start a new spinner with the given text
   */
  start(text: string): void {
    if (this.isSpinning) {
      this.stop();
    }

    this.spinner = ora({
      text,
      color: 'cyan',
      spinner: 'dots',
    }).start();
    this.isSpinning = true;
  }

  /**
   * Update the spinner text
   */
  update(text: string): void {
    if (this.spinner && this.isSpinning) {
      this.spinner.text = text;
    }
  }

  /**
   * Stop the spinner with success
   */
  succeed(text?: string): void {
    if (this.spinner && this.isSpinning) {
      this.spinner.succeed(text || this.spinner.text);
      this.isSpinning = false;
      this.spinner = null;
    }
  }

  /**
   * Stop the spinner with failure
   */
  fail(text?: string): void {
    if (this.spinner && this.isSpinning) {
      this.spinner.fail(text || this.spinner.text);
      this.isSpinning = false;
      this.spinner = null;
    }
  }

  /**
   * Stop the spinner with warning
   */
  warn(text?: string): void {
    if (this.spinner && this.isSpinning) {
      this.spinner.warn(text || this.spinner.text);
      this.isSpinning = false;
      this.spinner = null;
    }
  }

  /**
   * Stop the spinner with info
   */
  info(text?: string): void {
    if (this.spinner && this.isSpinning) {
      this.spinner.info(text || this.spinner.text);
      this.isSpinning = false;
      this.spinner = null;
    }
  }

  /**
   * Stop the spinner without any status
   */
  stop(): void {
    if (this.spinner && this.isSpinning) {
      this.spinner.stop();
      this.isSpinning = false;
      this.spinner = null;
    }
  }

  /**
   * Check if spinner is currently active
   */
  isActive(): boolean {
    return this.isSpinning;
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
    }
  ): Promise<T> {
    this.start(text);

    try {
      const result = await promise;
      this.succeed(options?.successText);
      return result;
    } catch (error) {
      this.fail(options?.failText || `Failed: ${text}`);
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
    }>
  ): Promise<void> {
    for (const step of steps) {
      await this.withSpinner(
        step.text,
        step.action(),
        step.successText || step.failText
          ? {
              ...(step.successText && { successText: step.successText }),
              ...(step.failText && { failText: step.failText }),
            }
          : undefined
      );
    }
  }
}

// Export singleton instance
export const spinner = new SpinnerManager();
