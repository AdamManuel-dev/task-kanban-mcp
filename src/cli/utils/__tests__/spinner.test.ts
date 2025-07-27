/**
 * Unit tests for SpinnerManager
 */

import { SpinnerManager } from '../spinner';
import ora from 'ora';

// Mock ora
jest.mock('ora');

describe('SpinnerManager', () => {
  let spinnerManager: SpinnerManager;
  let mockSpinner: any;

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
      text: '',
      color: 'cyan',
      isSpinning: false,
    };

    (ora as jest.Mock).mockReturnValue(mockSpinner);
    spinnerManager = new SpinnerManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('should create and start a spinner with default text', () => {
      spinnerManager.start();

      expect(ora).toHaveBeenCalledWith({
        text: 'Loading...',
        color: 'cyan',
        spinner: 'dots',
      });
      expect(mockSpinner.start).toHaveBeenCalled();
    });

    it('should create spinner with custom text', () => {
      const customText = 'Processing tasks...';
      spinnerManager.start(customText);

      expect(ora).toHaveBeenCalledWith({
        text: customText,
        color: 'cyan',
        spinner: 'dots',
      });
      expect(mockSpinner.start).toHaveBeenCalled();
    });

    it('should create spinner with custom options', () => {
      const customOptions = {
        text: 'Custom text',
        color: 'green' as const,
        spinner: 'star' as const,
      };
      spinnerManager.start(customOptions.text, customOptions);

      expect(ora).toHaveBeenCalledWith(customOptions);
      expect(mockSpinner.start).toHaveBeenCalled();
    });

    it('should not create new spinner if one is already spinning', () => {
      spinnerManager.start('First spinner');
      spinnerManager.start('Second spinner');

      expect(ora).toHaveBeenCalledTimes(1);
      expect(mockSpinner.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('should update spinner text if spinner exists', () => {
      spinnerManager.start('Initial text');
      spinnerManager.update('Updated text');

      expect(mockSpinner.text).toBe('Updated text');
    });

    it('should not throw if no spinner exists', () => {
      expect(() => spinnerManager.update('Test text')).not.toThrow();
    });
  });

  describe('succeed', () => {
    it('should call succeed on spinner with custom text', () => {
      spinnerManager.start();
      spinnerManager.succeed('Success message');

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Success message');
    });

    it('should call succeed with default text if none provided', () => {
      spinnerManager.start();
      spinnerManager.succeed();

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Done!');
    });

    it('should not throw if no spinner exists', () => {
      expect(() => spinnerManager.succeed('Test')).not.toThrow();
    });
  });

  describe('fail', () => {
    it('should call fail on spinner with custom text', () => {
      spinnerManager.start();
      spinnerManager.fail('Error message');

      expect(mockSpinner.fail).toHaveBeenCalledWith('Error message');
    });

    it('should call fail with default text if none provided', () => {
      spinnerManager.start();
      spinnerManager.fail();

      expect(mockSpinner.fail).toHaveBeenCalledWith('Failed!');
    });

    it('should not throw if no spinner exists', () => {
      expect(() => spinnerManager.fail('Test')).not.toThrow();
    });
  });

  describe('warn', () => {
    it('should call warn on spinner with text', () => {
      spinnerManager.start();
      spinnerManager.warn('Warning message');

      expect(mockSpinner.warn).toHaveBeenCalledWith('Warning message');
    });

    it('should not throw if no spinner exists', () => {
      expect(() => spinnerManager.warn('Test')).not.toThrow();
    });
  });

  describe('info', () => {
    it('should call info on spinner with text', () => {
      spinnerManager.start();
      spinnerManager.info('Info message');

      expect(mockSpinner.info).toHaveBeenCalledWith('Info message');
    });

    it('should not throw if no spinner exists', () => {
      expect(() => spinnerManager.info('Test')).not.toThrow();
    });
  });

  describe('stop', () => {
    it('should stop and clear spinner', () => {
      spinnerManager.start();
      spinnerManager.stop();

      expect(mockSpinner.stop).toHaveBeenCalled();
    });

    it('should not throw if no spinner exists', () => {
      expect(() => spinnerManager.stop()).not.toThrow();
    });
  });

  describe('withSpinner', () => {
    it('should execute function with spinner for sync function', async () => {
      const syncFunction = jest.fn().mockReturnValue('result');
      
      const result = await spinnerManager.withSpinner(
        'Processing...',
        syncFunction
      );

      expect(ora).toHaveBeenCalledWith({
        text: 'Processing...',
        color: 'cyan',
        spinner: 'dots',
      });
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(syncFunction).toHaveBeenCalled();
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Done!');
      expect(result).toBe('result');
    });

    it('should execute function with spinner for async function', async () => {
      const asyncFunction = jest.fn().mockResolvedValue('async result');
      
      const result = await spinnerManager.withSpinner(
        'Processing async...',
        asyncFunction
      );

      expect(mockSpinner.start).toHaveBeenCalled();
      expect(asyncFunction).toHaveBeenCalled();
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Done!');
      expect(result).toBe('async result');
    });

    it('should handle function errors and show failure', async () => {
      const errorFunction = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(
        spinnerManager.withSpinner('Processing...', errorFunction)
      ).rejects.toThrow('Test error');

      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.fail).toHaveBeenCalledWith('Failed!');
    });

    it('should use custom success and error messages', async () => {
      const successFunction = jest.fn().mockResolvedValue('result');
      
      await spinnerManager.withSpinner(
        'Processing...',
        successFunction,
        'Custom success',
        'Custom error'
      );

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Custom success');
    });

    it('should show custom error message on failure', async () => {
      const errorFunction = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(
        spinnerManager.withSpinner(
          'Processing...',
          errorFunction,
          'Success',
          'Custom error'
        )
      ).rejects.toThrow('Test error');

      expect(mockSpinner.fail).toHaveBeenCalledWith('Custom error');
    });
  });

  describe('withSteps', () => {
    it('should execute steps with progress updates', async () => {
      const step1 = jest.fn().mockResolvedValue('step1 result');
      const step2 = jest.fn().mockResolvedValue('step2 result');
      const step3 = jest.fn().mockResolvedValue('step3 result');

      const steps = [
        { text: 'Step 1', fn: step1 },
        { text: 'Step 2', fn: step2 },
        { text: 'Step 3', fn: step3 },
      ];

      const results = await spinnerManager.withSteps(steps);

      expect(mockSpinner.start).toHaveBeenCalled();
      expect(step1).toHaveBeenCalled();
      expect(step2).toHaveBeenCalled();
      expect(step3).toHaveBeenCalled();
      expect(mockSpinner.succeed).toHaveBeenCalledWith('All steps completed!');
      expect(results).toEqual(['step1 result', 'step2 result', 'step3 result']);
    });

    it('should update spinner text for each step', async () => {
      const steps = [
        { text: 'First step', fn: jest.fn().mockResolvedValue('result1') },
        { text: 'Second step', fn: jest.fn().mockResolvedValue('result2') },
      ];

      await spinnerManager.withSteps(steps);

      expect(mockSpinner.text).toHaveBeenCalledWith('First step (1/2)');
      expect(mockSpinner.text).toHaveBeenCalledWith('Second step (2/2)');
    });

    it('should handle step failures', async () => {
      const step1 = jest.fn().mockResolvedValue('success');
      const step2 = jest.fn().mockRejectedValue(new Error('Step 2 failed'));

      const steps = [
        { text: 'Step 1', fn: step1 },
        { text: 'Step 2', fn: step2 },
      ];

      await expect(spinnerManager.withSteps(steps)).rejects.toThrow('Step 2 failed');
      expect(mockSpinner.fail).toHaveBeenCalledWith('Step failed: Step 2');
    });

    it('should handle empty steps array', async () => {
      const results = await spinnerManager.withSteps([]);

      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.succeed).toHaveBeenCalledWith('All steps completed!');
      expect(results).toEqual([]);
    });
  });

  describe('state management', () => {
    it('should track spinning state correctly', () => {
      expect(spinnerManager.isSpinning).toBe(false);
      
      spinnerManager.start();
      expect(spinnerManager.isSpinning).toBe(true);
      
      spinnerManager.stop();
      expect(spinnerManager.isSpinning).toBe(false);
    });

    it('should track spinning state after succeed', () => {
      spinnerManager.start();
      expect(spinnerManager.isSpinning).toBe(true);
      
      spinnerManager.succeed();
      expect(spinnerManager.isSpinning).toBe(false);
    });

    it('should track spinning state after fail', () => {
      spinnerManager.start();
      expect(spinnerManager.isSpinning).toBe(true);
      
      spinnerManager.fail();
      expect(spinnerManager.isSpinning).toBe(false);
    });
  });
});