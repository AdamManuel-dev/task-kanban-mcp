/**
 * @fileoverview Unit tests for CLI dashboard manager
 * @lastmodified 2025-07-28T07:22:00Z
 *
 * Features: Dashboard state management, UI rendering, keyboard handling
 * Main APIs: initialize(), render(), updateData(), handleKeypress()
 * Constraints: CLI environment, blessed widgets, terminal dimensions
 * Patterns: State-driven UI, event handling, graceful error recovery
 */

import { jest } from '@jest/globals';
import { DashboardManager } from '@/cli/utils/dashboard-manager';
import { logger } from '@/utils/logger';

// Mock blessed library
const mockScreen = {
  render: jest.fn(),
  destroy: jest.fn(),
  key: jest.fn(),
  append: jest.fn(),
  width: 80,
  height: 24,
};

const mockBox = {
  setContent: jest.fn(),
  append: jest.fn(),
  focus: jest.fn(),
  width: 40,
  height: 10,
};

const mockTable = {
  setData: jest.fn(),
  focus: jest.fn(),
  rows: {
    select: jest.fn(),
  },
};

jest.mock('blessed', () => ({
  screen: jest.fn(() => mockScreen),
  box: jest.fn(() => mockBox),
  table: jest.fn(() => mockTable),
}));

jest.mock('@/utils/logger');

describe('DashboardManager', () => {
  let dashboardManager: DashboardManager;
  let mockTaskService: any;
  let mockBoardService: any;

  beforeEach(() => {
    mockTaskService = {
      getTasks: jest.fn(),
      updateTask: jest.fn(),
      getTaskStats: jest.fn(),
    };

    mockBoardService = {
      getBoards: jest.fn(),
      getBoardStats: jest.fn(),
    };

    dashboardManager = new DashboardManager(mockTaskService, mockBoardService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    dashboardManager.destroy();
  });

  describe('Initialization', () => {
    test('should initialize dashboard successfully', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Test Task 1',
          status: 'todo',
          board_id: 'board-1',
          created_at: new Date(),
        },
        {
          id: 'task-2',
          title: 'Test Task 2',
          status: 'in-progress',
          board_id: 'board-1',
          created_at: new Date(),
        },
      ];

      const mockBoards = [
        {
          id: 'board-1',
          name: 'Test Board',
          created_at: new Date(),
        },
      ];

      mockTaskService.getTasks.mockResolvedValue(mockTasks);
      mockBoardService.getBoards.mockResolvedValue(mockBoards);

      await dashboardManager.initialize();

      expect(mockTaskService.getTasks).toHaveBeenCalled();
      expect(mockBoardService.getBoards).toHaveBeenCalled();
      expect(mockScreen.render).toHaveBeenCalled();
    });

    test('should handle initialization errors gracefully', async () => {
      const error = new Error('Service unavailable');
      mockTaskService.getTasks.mockRejectedValue(error);

      await dashboardManager.initialize();

      expect(logger.error).toHaveBeenCalledWith('Failed to initialize dashboard', {
        error,
      });
      expect(mockBox.setContent).toHaveBeenCalledWith(
        expect.stringContaining('Error loading dashboard')
      );
    });

    test('should set up keyboard handlers', async () => {
      await dashboardManager.initialize();

      expect(mockScreen.key).toHaveBeenCalledWith(['q', 'C-c'], expect.any(Function));
      expect(mockScreen.key).toHaveBeenCalledWith(['r'], expect.any(Function));
      expect(mockScreen.key).toHaveBeenCalledWith(['tab'], expect.any(Function));
    });
  });

  describe('Data Updates', () => {
    test('should update task data', async () => {
      const newTasks = [
        {
          id: 'task-3',
          title: 'New Task',
          status: 'todo',
          board_id: 'board-1',
          created_at: new Date(),
        },
      ];

      mockTaskService.getTasks.mockResolvedValue(newTasks);

      await dashboardManager.updateTaskData();

      expect(mockTaskService.getTasks).toHaveBeenCalled();
      expect(mockScreen.render).toHaveBeenCalled();
    });

    test('should update board data', async () => {
      const newBoards = [
        {
          id: 'board-2',
          name: 'New Board',
          created_at: new Date(),
        },
      ];

      mockBoardService.getBoards.mockResolvedValue(newBoards);

      await dashboardManager.updateBoardData();

      expect(mockBoardService.getBoards).toHaveBeenCalled();
      expect(mockScreen.render).toHaveBeenCalled();
    });

    test('should handle data update errors', async () => {
      const error = new Error('Update failed');
      mockTaskService.getTasks.mockRejectedValue(error);

      await dashboardManager.updateTaskData();

      expect(logger.error).toHaveBeenCalledWith('Failed to update task data', {
        error,
      });
    });
  });

  describe('UI Rendering', () => {
    test('should render task statistics', async () => {
      const mockStats = {
        total: 10,
        todo: 4,
        'in-progress': 3,
        done: 3,
      };

      mockTaskService.getTaskStats.mockResolvedValue(mockStats);

      await dashboardManager.renderTaskStats();

      expect(mockBox.setContent).toHaveBeenCalledWith(expect.stringContaining('Total: 10'));
      expect(mockBox.setContent).toHaveBeenCalledWith(expect.stringContaining('Todo: 4'));
    });

    test('should render recent tasks', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Recent Task',
          status: 'todo',
          created_at: new Date(),
        },
      ];

      mockTaskService.getTasks.mockResolvedValue(mockTasks);

      await dashboardManager.renderRecentTasks();

      expect(mockTable.setData).toHaveBeenCalledWith(
        expect.arrayContaining([expect.arrayContaining(['Recent Task', 'todo'])])
      );
    });

    test('should handle empty data gracefully', async () => {
      mockTaskService.getTasks.mockResolvedValue([]);
      mockBoardService.getBoards.mockResolvedValue([]);

      await dashboardManager.initialize();

      expect(mockBox.setContent).toHaveBeenCalledWith(expect.stringContaining('No tasks found'));
    });
  });

  describe('Keyboard Handling', () => {
    test('should handle quit command', async () => {
      await dashboardManager.initialize();

      // Simulate 'q' key press
      const quitHandler = mockScreen.key.mock.calls.find(call => call[0].includes('q'))[1];

      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      expect(() => quitHandler()).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(0);

      exitSpy.mockRestore();
    });

    test('should handle refresh command', async () => {
      await dashboardManager.initialize();

      // Simulate 'r' key press
      const refreshHandler = mockScreen.key.mock.calls.find(call => call[0].includes('r'))[1];

      mockTaskService.getTasks.mockResolvedValue([]);

      await refreshHandler();

      expect(mockTaskService.getTasks).toHaveBeenCalled();
      expect(mockScreen.render).toHaveBeenCalled();
    });

    test('should handle tab navigation', async () => {
      await dashboardManager.initialize();

      // Simulate 'tab' key press
      const tabHandler = mockScreen.key.mock.calls.find(call => call[0].includes('tab'))[1];

      tabHandler();

      // Should cycle focus between UI elements
      expect(mockTable.focus).toHaveBeenCalled();
    });
  });

  describe('Auto-refresh', () => {
    test('should start auto-refresh when enabled', async () => {
      const config = { autoRefresh: true, refreshInterval: 1000 };
      dashboardManager = new DashboardManager(mockTaskService, mockBoardService, config);

      await dashboardManager.initialize();

      // Wait for auto-refresh to trigger
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockTaskService.getTasks).toHaveBeenCalledTimes(2); // Initial + auto-refresh
    });

    test('should stop auto-refresh on destroy', async () => {
      const config = { autoRefresh: true, refreshInterval: 500 };
      dashboardManager = new DashboardManager(mockTaskService, mockBoardService, config);

      await dashboardManager.initialize();
      dashboardManager.destroy();

      const initialCallCount = mockTaskService.getTasks.mock.calls.length;

      // Wait to ensure no more calls are made
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(mockTaskService.getTasks).toHaveBeenCalledTimes(initialCallCount);
    });
  });

  describe('Error Recovery', () => {
    test('should recover from rendering errors', async () => {
      mockScreen.render.mockImplementation(() => {
        throw new Error('Render failed');
      });

      await dashboardManager.initialize();

      expect(logger.error).toHaveBeenCalledWith('Dashboard render failed', {
        error: expect.any(Error),
      });
    });

    test('should handle service timeouts', async () => {
      mockTaskService.getTasks.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      );

      await dashboardManager.initialize();

      expect(logger.error).toHaveBeenCalledWith('Failed to initialize dashboard', {
        error: expect.any(Error),
      });
    });
  });

  describe('Memory Management', () => {
    test('should clean up resources on destroy', () => {
      dashboardManager.destroy();

      expect(mockScreen.destroy).toHaveBeenCalled();
    });

    test('should handle multiple destroy calls safely', () => {
      dashboardManager.destroy();

      expect(() => {
        dashboardManager.destroy();
      }).not.toThrow();
    });
  });

  describe('Theme Support', () => {
    test('should apply custom themes', async () => {
      const customTheme = {
        primary: 'blue',
        secondary: 'green',
        background: 'black',
      };

      dashboardManager = new DashboardManager(mockTaskService, mockBoardService, {
        theme: customTheme,
      });

      await dashboardManager.initialize();

      // Theme should be applied to UI elements
      expect(mockBox.append).toHaveBeenCalled();
    });

    test('should fall back to default theme on error', async () => {
      const invalidTheme = null;

      dashboardManager = new DashboardManager(mockTaskService, mockBoardService, {
        theme: invalidTheme,
      });

      await dashboardManager.initialize();

      expect(logger.warn).toHaveBeenCalledWith('Invalid theme provided, using default');
    });
  });
});
