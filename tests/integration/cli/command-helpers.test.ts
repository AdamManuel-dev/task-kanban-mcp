/**
 * @fileoverview Integration tests for CLI command helpers
 * @lastmodified 2025-07-28T15:00:00Z
 *
 * Features: Tests for withErrorHandling, withSpinner, validation helpers
 * Main APIs: Command helper utilities integration testing
 * Constraints: Requires mock global CLI components
 * Patterns: Integration testing with real-world scenarios
 */

import {
  withErrorHandling,
  withSpinner,
  validateRequiredFields,
  validateTaskId,
  validateBoardId,
  ensureBoardId,
  validateTasksResponse,
  validateBoardsResponse,
  formatOutput,
  showSuccess,
  parseLimit,
  parseSortParams,
} from '../../../src/cli/utils/command-helpers';
import type { CliComponents } from '../../../src/cli/types';

// Mock the SpinnerManager
jest.mock('../../../src/cli/utils/spinner', () => ({
  SpinnerManager: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    stop: jest.fn(),
    withSpinner: jest.fn().mockImplementation(async (message, promise) => promise),
  })),
}));

// Mock global CLI components
const mockFormatter = {
  info: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  output: jest.fn(),
  setFormat: jest.fn(),
  setVerbose: jest.fn(),
  setQuiet: jest.fn(),
  getFormat: jest.fn().mockReturnValue('table'),
  isVerbose: jest.fn().mockReturnValue(false),
  isQuiet: jest.fn().mockReturnValue(false),
  formatData: jest.fn(),
  formatError: jest.fn(),
  formatSuccess: jest.fn(),
  formatWarning: jest.fn(),
  formatInfo: jest.fn(),
  log: jest.fn(),
  table: jest.fn(),
  json: jest.fn(),
};

const mockConfig = {
  getDefaultBoard: jest.fn(),
  setDefaultBoard: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  has: jest.fn(),
  remove: jest.fn(),
  clear: jest.fn(),
  getAll: jest.fn(),
  save: jest.fn(),
  load: jest.fn(),
};

const mockApiClient = {
  getTasks: jest.fn(),
  getBoards: jest.fn(),
  createTask: jest.fn(),
  updateTask: jest.fn(),
  deleteTask: jest.fn(),
};

const mockServices = {} as any;

const mockComponents: CliComponents = {
  config: mockConfig,
  apiClient: mockApiClient,
  formatter: mockFormatter,
  services: mockServices,
};

// Set up global mock
beforeEach(() => {
  global.cliComponents = mockComponents;
  jest.clearAllMocks();
});

describe('Command Helper Integration Tests', () => {
  describe('withErrorHandling', () => {
    it('should handle successful operation', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      const wrappedOperation = withErrorHandling('test operation', mockOperation);

      await wrappedOperation('arg1', 'arg2');

      expect(mockOperation).toHaveBeenCalledWith('arg1', 'arg2');
      expect(mockFormatter.error).not.toHaveBeenCalled();
    });

    it('should handle operation errors', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Test error'));
      const wrappedOperation = withErrorHandling('test operation', mockOperation);

      // Mock process.exit to prevent test termination
      const mockExit = jest.spyOn(process, 'exit').mockImplementation();

      await wrappedOperation('arg1');

      expect(mockFormatter.error).toHaveBeenCalledWith(
        'Error: Failed to test operation: Test error'
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });

  describe('withSpinner', () => {
    it('should show loading and success messages', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');
      const wrappedOperation = withSpinner('Loading...', 'Success!', mockOperation);

      const result = await wrappedOperation('arg1');

      expect(result).toBe('result');
      expect(mockOperation).toHaveBeenCalledWith('arg1');
    });

    it('should handle operation failures', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const wrappedOperation = withSpinner('Loading...', 'Success!', mockOperation);

      await expect(wrappedOperation()).rejects.toThrow('Operation failed');
    });
  });

  describe('Validation helpers', () => {
    describe('validateRequiredFields', () => {
      it('should return no errors for valid fields', () => {
        const fields = { title: 'Test', boardId: 'board-123' };
        const errors = validateRequiredFields(fields);
        expect(errors).toEqual([]);
      });

      it('should return errors for missing fields', () => {
        const fields = { title: '', boardId: null };
        const errors = validateRequiredFields(fields);
        expect(errors).toEqual(['title is required', 'boardId is required']);
      });

      it('should return errors for whitespace-only strings', () => {
        const fields = { title: '   ', description: '\t\n' };
        const errors = validateRequiredFields(fields);
        expect(errors).toEqual(['title is required', 'description is required']);
      });
    });

    describe('validateTaskId', () => {
      it('should accept valid task IDs', () => {
        const validIds = ['task-123', 'TASK_456', 'task789', '123-abc-def'];
        validIds.forEach(id => {
          expect(validateTaskId(id)).toEqual([]);
        });
      });

      it('should reject invalid task IDs', () => {
        const invalidIds = ['', '   ', 'task@123', 'task 123', 'task.123'];
        invalidIds.forEach(id => {
          const errors = validateTaskId(id);
          expect(errors.length).toBeGreaterThan(0);
        });
      });
    });

    describe('validateBoardId', () => {
      it('should accept valid board IDs', () => {
        const validIds = ['board-123', 'BOARD_456', 'board789'];
        validIds.forEach(id => {
          expect(validateBoardId(id)).toEqual([]);
        });
      });

      it('should reject invalid board IDs', () => {
        const invalidIds = ['', 'board@123', 'board 123'];
        invalidIds.forEach(id => {
          const errors = validateBoardId(id);
          expect(errors.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('ensureBoardId', () => {
    it('should return provided board ID when valid', () => {
      const boardId = ensureBoardId('board-123');
      expect(boardId).toBe('board-123');
    });

    it('should return default board when no ID provided', () => {
      mockConfig.getDefaultBoard.mockReturnValue('default-board');
      const boardId = ensureBoardId();
      expect(boardId).toBe('default-board');
    });

    it('should exit when no board ID available', () => {
      mockConfig.getDefaultBoard.mockReturnValue(null);
      const mockExit = jest.spyOn(process, 'exit').mockImplementation();

      ensureBoardId();

      expect(mockFormatter.error).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });

  describe('Response validators', () => {
    describe('validateTasksResponse', () => {
      it('should return data for valid task response', () => {
        const response = { data: [{ id: 'task1', title: 'Test' }] };
        const result = validateTasksResponse(response);
        expect(result).toEqual(response.data);
      });

      it('should exit for invalid response', () => {
        const mockExit = jest.spyOn(process, 'exit').mockImplementation();

        validateTasksResponse({ data: [] });

        expect(mockFormatter.info).toHaveBeenCalledWith('No tasks found');
        expect(mockExit).toHaveBeenCalledWith(0);

        mockExit.mockRestore();
      });
    });

    describe('validateBoardsResponse', () => {
      it('should return data for valid board response', () => {
        const response = { data: [{ id: 'board1', name: 'Test Board' }] };
        const result = validateBoardsResponse(response);
        expect(result).toEqual(response.data);
      });

      it('should exit for empty response', () => {
        const mockExit = jest.spyOn(process, 'exit').mockImplementation();

        validateBoardsResponse({ data: [] });

        expect(mockFormatter.info).toHaveBeenCalledWith('No boards found');
        expect(mockExit).toHaveBeenCalledWith(0);

        mockExit.mockRestore();
      });
    });
  });

  describe('Output helpers', () => {
    describe('formatOutput', () => {
      it('should format data with headers and fields', () => {
        const data = [{ id: '1', name: 'Test' }];
        formatOutput(data, {
          fields: ['id', 'name'],
          headers: ['ID', 'Name'],
        });

        expect(mockFormatter.output).toHaveBeenCalledWith(data, {
          fields: ['id', 'name'],
          headers: ['ID', 'Name'],
        });
      });

      it('should format data without options', () => {
        const data = { message: 'test' };
        formatOutput(data);

        expect(mockFormatter.output).toHaveBeenCalledWith(data);
      });

      it('should show title when provided', () => {
        const data = [{ id: '1' }];
        formatOutput(data, { title: 'Test Title' });

        expect(mockFormatter.info).toHaveBeenCalledWith('Test Title');
        expect(mockFormatter.output).toHaveBeenCalledWith(data);
      });
    });

    describe('showSuccess', () => {
      it('should show success message', () => {
        showSuccess('Operation completed');
        expect(mockFormatter.success).toHaveBeenCalledWith('Operation completed');
      });

      it('should show success message with data', () => {
        const data = { id: '123' };
        showSuccess('Task created', data);

        expect(mockFormatter.success).toHaveBeenCalledWith('Task created');
        expect(mockFormatter.output).toHaveBeenCalledWith(data);
      });
    });
  });

  describe('Parsing helpers', () => {
    describe('parseLimit', () => {
      it('should return default limit for undefined input', () => {
        expect(parseLimit()).toBe(20);
        expect(parseLimit(undefined, 30)).toBe(30);
      });

      it('should parse valid limit strings', () => {
        expect(parseLimit('10')).toBe(10);
        expect(parseLimit('50')).toBe(50);
      });

      it('should enforce maximum limit', () => {
        expect(parseLimit('200')).toBe(100);
        expect(parseLimit('150', 20, 50)).toBe(50);
      });

      it('should return default for invalid inputs', () => {
        expect(parseLimit('abc')).toBe(20);
        expect(parseLimit('-5')).toBe(20);
        expect(parseLimit('0')).toBe(20);
      });
    });

    describe('parseSortParams', () => {
      it('should return default sort params', () => {
        const result = parseSortParams();
        expect(result).toEqual({ sort: 'createdAt', order: 'desc' });
      });

      it('should parse valid sort parameters', () => {
        const result = parseSortParams('title', 'asc');
        expect(result).toEqual({ sort: 'title', order: 'asc' });
      });

      it('should use default for invalid sort field', () => {
        const result = parseSortParams('invalid-field', 'asc');
        expect(result).toEqual({ sort: 'createdAt', order: 'asc' });
      });

      it('should use default for invalid order', () => {
        const result = parseSortParams('title', 'invalid');
        expect(result).toEqual({ sort: 'title', order: 'desc' });
      });

      it('should validate against custom valid fields', () => {
        const result = parseSortParams('custom', 'asc', 'defaultField', ['custom', 'other']);
        expect(result).toEqual({ sort: 'custom', order: 'asc' });
      });
    });
  });
});
