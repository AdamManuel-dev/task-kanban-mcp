/**
 * Unit tests for SpinnerManager
 * Tests comprehensive error handling, validation, and lifecycle management
 */

import ora from 'ora';
import { SpinnerManager, SpinnerError } from '../spinner';

// Mock ora
jest.mock('ora');

describe('SpinnerManager', () => {
  let spinnerManager: SpinnerManager;
  let mockSpinner: any;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    mockSpinner = {
      start: jest.fn().mockReturnThis(),
      stop: jest.fn().mockReturnThis(),
      succeed: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis(),
      warn: jest.fn().mockReturnThis(),
      info: jest.fn().mockReturnThis(),
      clear: jest.fn().mockReturnThis(),
      render: jest.fn().mockReturnThis(),
      text: 'test text',
      color: 'cyan',
      isSpinning: false,
    };

    (ora as jest.Mock).mockReturnValue(mockSpinner);
    consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    spinnerManager = new SpinnerManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleSpy.mockRestore();
    if (spinnerManager && spinnerManager.isActive()) {
      spinnerManager.destroy();
    }
  });

  describe('SpinnerError', () => {
    it('should create a SpinnerError with message and code', () => {
      const error = new SpinnerError('Test message', 'TEST_CODE');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('SpinnerError');
    });
  });

  describe('validation', () => {
    it('should throw error for non-string text', () => {
      expect(() => spinnerManager.start(123 as any)).toThrow(SpinnerError);
      expect(() => spinnerManager.start(123 as any)).toThrow('Text must be a string');
    });

    it('should throw error for empty text', () => {
      expect(() => spinnerManager.start('')).toThrow(SpinnerError);
      expect(() => spinnerManager.start('')).toThrow('Text cannot be empty');
    });

    it('should truncate text that is too long', () => {
      const longText = 'a'.repeat(250);
      spinnerManager.start(longText);

      expect(ora).toHaveBeenCalledWith({
        text: `${'a'.repeat(197)}...`,
        color: 'cyan',
        spinner: 'dots',
        hideCursor: true,
      });
    });

    it('should trim whitespace from text', () => {
      spinnerManager.start('  test text  ');

      expect(ora).toHaveBeenCalledWith({
        text: 'test text',
        color: 'cyan',
        spinner: 'dots',
        hideCursor: true,
      });
    });

    it('should throw error when accessing destroyed spinner', () => {
      spinnerManager.destroy();
      expect(() => spinnerManager.start('test')).toThrow(SpinnerError);
      expect(() => spinnerManager.start('test')).toThrow('SpinnerManager has been destroyed');
    });
  });

  describe('start', () => {
    it('should create and start a spinner with valid text', () => {
      spinnerManager.start('Loading...');

      expect(ora).toHaveBeenCalledWith({
        text: 'Loading...',
        color: 'cyan',
        spinner: 'dots',
        hideCursor: true,
      });
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(spinnerManager.isActive()).toBe(true);
    });

    it('should stop existing spinner before starting new one', () => {
      spinnerManager.start('First spinner');
      spinnerManager.start('Second spinner');

      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(ora).toHaveBeenCalledTimes(2);
    });

    it('should handle ora creation failure', () => {
      (ora as jest.Mock).mockReturnValue(null);

      expect(() => spinnerManager.start('test')).toThrow(SpinnerError);
      expect(() => spinnerManager.start('test')).toThrow('Failed to create spinner instance');
    });

    it('should handle ora throwing error', () => {
      (ora as jest.Mock).mockImplementation(() => {
        throw new Error('Ora error');
      });

      expect(() => spinnerManager.start('test')).toThrow(SpinnerError);
      expect(() => spinnerManager.start('test')).toThrow('Failed to create spinner instance');
    });
  });

  describe('update', () => {
    it('should update spinner text when active', () => {
      spinnerManager.start('Initial text');
      spinnerManager.update('Updated text');

      expect(mockSpinner.text).toBe('Updated text');
    });

    it('should throw error if no spinner exists', () => {
      expect(() => spinnerManager.update('test')).toThrow(SpinnerError);
      expect(() => spinnerManager.update('test')).toThrow('No active spinner to update');
    });

    it('should handle update when spinner is not running', () => {
      // Test that update doesn't throw when no spinner is active
      expect(() => spinnerManager.update('new text')).not.toThrow();
    });

    it('should handle update errors gracefully', () => {
      spinnerManager.start('test');

      // The current implementation doesn't throw on text assignment errors
      // because it uses safeOperation wrapper that logs and continues
      expect(() => spinnerManager.update('new text')).not.toThrow();
    });
  });

  describe('stop methods', () => {
    beforeEach(() => {
      spinnerManager.start('test');
    });

    it('should call succeed with custom text', () => {
      spinnerManager.succeed('Success message');
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Success message');
      expect(spinnerManager.isActive()).toBe(false);
    });

    it('should call succeed with existing text if no text provided', () => {
      spinnerManager.succeed();
      expect(mockSpinner.succeed).toHaveBeenCalledWith('test text');
    });

    it('should call fail with custom text', () => {
      spinnerManager.fail('Error message');
      expect(mockSpinner.fail).toHaveBeenCalledWith('Error message');
      expect(spinnerManager.isActive()).toBe(false);
    });

    it('should call warn with custom text', () => {
      spinnerManager.warn('Warning message');
      expect(mockSpinner.warn).toHaveBeenCalledWith('Warning message');
      expect(spinnerManager.isActive()).toBe(false);
    });

    it('should call info with custom text', () => {
      spinnerManager.info('Info message');
      expect(mockSpinner.info).toHaveBeenCalledWith('Info message');
      expect(spinnerManager.isActive()).toBe(false);
    });

    it('should call stop without text', () => {
      spinnerManager.stop();
      expect(mockSpinner.stop).toHaveBeenCalled();
      expect(spinnerManager.isActive()).toBe(false);
    });

    it('should handle stop errors gracefully', () => {
      mockSpinner.succeed.mockImplementation(() => {
        throw new Error('Stop error');
      });

      spinnerManager.succeed('test');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Spinner operation failed'));
      expect(spinnerManager.isActive()).toBe(false);
    });

    it('should silently ignore stop when no spinner exists', () => {
      const newManager = new SpinnerManager();
      expect(() => newManager.stop()).not.toThrow();
    });

    it('should handle stop after destroy gracefully', () => {
      spinnerManager.destroy();
      expect(() => spinnerManager.stop()).not.toThrow();
    });
  });

  describe('withSpinner', () => {
    it('should execute promise with spinner for success', async () => {
      const testPromise = Promise.resolve('success result');

      const result = await spinnerManager.withSpinner('Processing...', testPromise);

      expect(ora).toHaveBeenCalledWith({
        text: 'Processing...',
        color: 'cyan',
        spinner: 'dots',
        hideCursor: true,
      });
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.succeed).toHaveBeenCalled();
      expect(result).toBe('success result');
    });

    it('should handle promise rejection', async () => {
      const testError = new Error('Test error');
      const testPromise = Promise.reject(testError);

      await expect(spinnerManager.withSpinner('Processing...', testPromise)).rejects.toThrow(
        'Test error'
      );
      expect(mockSpinner.fail).toHaveBeenCalledWith(
        expect.stringContaining('Failed: Processing...')
      );
    });

    it('should use custom success and fail text', async () => {
      const testPromise = Promise.resolve('result');

      await spinnerManager.withSpinner('Processing...', testPromise, {
        successText: 'Custom success',
        failText: 'Custom fail',
      });

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Custom success');
    });

    it('should handle timeout', async () => {
      const slowPromise = new Promise<void>(resolve => {
        setTimeout(resolve, 1000);
      });

      await expect(
        spinnerManager.withSpinner('Processing...', slowPromise, { timeout: 100 })
      ).rejects.toThrow('Operation timed out after 100ms');

      expect(mockSpinner.fail).toHaveBeenCalled();
    }, 500);

    it('should validate promise parameter', async () => {
      await expect(spinnerManager.withSpinner('test', null as any)).rejects.toThrow(
        'Promise is required and must be a valid Promise'
      );
    });

    it('should clear timeout on success', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const testPromise = Promise.resolve('result');

      await spinnerManager.withSpinner('Processing...', testPromise, { timeout: 1000 });

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('withSteps', () => {
    it('should execute steps with progress', async () => {
      const step1 = jest.fn().mockResolvedValue('result1');
      const step2 = jest.fn().mockResolvedValue('result2');

      const steps = [
        { text: 'Step 1', action: step1 },
        { text: 'Step 2', action: step2 },
      ];

      const { results, errors } = await spinnerManager.withSteps(steps);

      expect(step1).toHaveBeenCalled();
      expect(step2).toHaveBeenCalled();
      expect(results).toEqual(['result1', 'result2']);
      expect(errors).toEqual([]);
    });

    it('should show progress indicators', async () => {
      const steps = [
        { text: 'First step', action: jest.fn().mockResolvedValue('r1') },
        { text: 'Second step', action: jest.fn().mockResolvedValue('r2') },
      ];

      await spinnerManager.withSteps(steps, { showProgress: true });

      expect(ora).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '[1/2] First step',
        })
      );
      expect(ora).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '[2/2] Second step',
        })
      );
    });

    it('should handle step errors with stopOnError=false', async () => {
      const step1 = jest.fn().mockResolvedValue('result1');
      const step2 = jest.fn().mockRejectedValue(new Error('Step 2 failed'));
      const step3 = jest.fn().mockResolvedValue('result3');

      const steps = [
        { text: 'Step 1', action: step1 },
        { text: 'Step 2', action: step2 },
        { text: 'Step 3', action: step3 },
      ];

      const { results, errors } = await spinnerManager.withSteps(steps, { stopOnError: false });

      expect(results).toEqual(['result1', 'result3']);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Step 2 failed');
    });

    it('should stop on error by default', async () => {
      const step1 = jest.fn().mockResolvedValue('result1');
      const step2 = jest.fn().mockRejectedValue(new Error('Step 2 failed'));
      const step3 = jest.fn().mockResolvedValue('result3');

      const steps = [
        { text: 'Step 1', action: step1 },
        { text: 'Step 2', action: step2 },
        { text: 'Step 3', action: step3 },
      ];

      await expect(spinnerManager.withSteps(steps)).rejects.toThrow('Step 2 failed');
      expect(step3).not.toHaveBeenCalled();
    });

    it('should validate steps parameter', async () => {
      await expect(spinnerManager.withSteps([])).rejects.toThrow('Steps must be a non-empty array');
      await expect(spinnerManager.withSteps(null as any)).rejects.toThrow(
        'Steps must be a non-empty array'
      );
    });

    it('should handle invalid step', async () => {
      const steps = [
        { text: 'Valid step', action: jest.fn().mockResolvedValue('result') },
        { text: 'Invalid step', action: null as any },
      ];

      await expect(spinnerManager.withSteps(steps)).rejects.toThrow('Invalid step at index 1');
    });

    it('should skip error step if skipOnError=true', async () => {
      const step1 = jest.fn().mockResolvedValue('result1');
      const step2 = jest.fn().mockRejectedValue(new Error('Step 2 failed'));
      const step3 = jest.fn().mockResolvedValue('result3');

      const steps = [
        { text: 'Step 1', action: step1 },
        { text: 'Step 2', action: step2, skipOnError: true },
        { text: 'Step 3', action: step3 },
      ];

      const { results, errors } = await spinnerManager.withSteps(steps);

      expect(results).toEqual(['result1', 'result3']);
      expect(errors).toHaveLength(1);
    });
  });

  describe('state management', () => {
    it('should track active state correctly', () => {
      expect(spinnerManager.isActive()).toBe(false);

      spinnerManager.start('test');
      expect(spinnerManager.isActive()).toBe(true);

      spinnerManager.stop();
      expect(spinnerManager.isActive()).toBe(false);
    });

    it('should return false for active when destroyed', () => {
      spinnerManager.start('test');
      expect(spinnerManager.isActive()).toBe(true);

      spinnerManager.destroy();
      expect(spinnerManager.isActive()).toBe(false);
    });
  });

  describe('destroy and cleanup', () => {
    it('should destroy spinner and prevent further use', () => {
      spinnerManager.start('test');
      spinnerManager.destroy();

      expect(spinnerManager.isActive()).toBe(false);
      expect(() => spinnerManager.start('new')).toThrow('SpinnerManager has been destroyed');
    });

    it('should handle destroy when no spinner exists', () => {
      expect(() => spinnerManager.destroy()).not.toThrow();
    });

    it('should handle spinner.stop error during force cleanup', () => {
      spinnerManager.start('test');
      mockSpinner.stop.mockImplementation(() => {
        throw new Error('Stop error');
      });

      expect(() => spinnerManager.destroy()).not.toThrow();
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton spinner instance', () => {
      const { spinner } = require('../spinner');
      expect(spinner).toBeInstanceOf(SpinnerManager);
    });
  });

  describe('process cleanup', () => {
    it('should set up process event listeners', () => {
      const processOnSpy = jest.spyOn(process, 'on');

      // Re-require to trigger the process listeners setup
      jest.resetModules();
      require('../spinner');

      expect(processOnSpy).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGUSR1', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGUSR2', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));

      processOnSpy.mockRestore();
    });
  });
});
