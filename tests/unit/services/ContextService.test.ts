/**
 * @fileoverview Focused ContextService test suite - essential functionality
 * @module tests/unit/services/ContextService.focused
 * @description Tests core ContextService functionality including project context,
 * task context, and work context generation with proper mocking
 */

import { ContextService } from '@/services/ContextService';
import { DatabaseConnection } from '@/database/connection';
import type { BoardService } from '@/services/BoardService';
import type { TaskService } from '@/services/TaskService';
import type { NoteService } from '@/services/NoteService';
import type { TagService } from '@/services/TagService';
import type { Task, Board, Note, Tag } from '@/types';

// Test setup
let testDb: DatabaseConnection;
let contextService: ContextService;
let mockBoardService: jest.Mocked<BoardService>;
let mockTaskService: jest.Mocked<TaskService>;
let mockNoteService: jest.Mocked<NoteService>;
let mockTagService: jest.Mocked<TagService>;

// Test data factories
const createTestTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-123',
  title: 'Test Task',
  description: 'Test task description',
  status: 'todo',
  priority: 5,
  board_id: 'board-123',
  column_id: 'column-123',
  position: 1,
  created_at: new Date(),
  updated_at: new Date(),
  archived: false,
  ...overrides,
});

const createTestBoard = (overrides: Partial<Board> = {}): Board => ({
  id: 'board-123',
  name: 'Test Board',
  description: 'Test board description',
  created_at: new Date(),
  updated_at: new Date(),
  archived: false,
  ...overrides,
});

beforeEach(async () => {
  // Setup test database
  (DatabaseConnection as any).instance = null;
  testDb = DatabaseConnection.getInstance();

  if (testDb.isConnected()) {
    await testDb.close();
  }

  process.env.DATABASE_PATH = './data/kanban-context-focused-test.db';
  await testDb.initialize();

  // Setup mocks with proper defaults
  mockBoardService = {
    getBoards: jest.fn().mockResolvedValue([]),
    getBoardById: jest.fn().mockResolvedValue(null),
    getBoardWithStats: jest.fn().mockResolvedValue(null),
  } as any;

  mockTaskService = {
    getTaskById: jest.fn().mockResolvedValue(null),
    getTasks: jest.fn().mockResolvedValue([]),
    getOverdueTasks: jest.fn().mockResolvedValue([]),
    getBlockedTasks: jest.fn().mockResolvedValue([]),
    getTaskWithDependencies: jest.fn().mockResolvedValue(null),
  } as any;

  mockNoteService = {
    getTaskNotes: jest.fn().mockResolvedValue([]),
  } as any;

  mockTagService = {
    getTaskTags: jest.fn().mockResolvedValue([]),
  } as any;

  contextService = new ContextService(
    testDb,
    mockBoardService,
    mockTaskService,
    mockNoteService,
    mockTagService
  );
});

afterEach(async () => {
  if (testDb && testDb.isConnected()) {
    await testDb.close();
  }
  jest.clearAllMocks();
});

describe('ContextService - Core Functionality', () => {
  describe('Initialization', () => {
    it('should initialize with all dependencies', () => {
      expect(contextService).toBeInstanceOf(ContextService);
    });
  });

  describe('Project Context Generation', () => {
    it('should generate basic project context', async () => {
      // Setup minimal database mocking
      const queryMock = jest.spyOn(testDb, 'query').mockResolvedValue([]);
      const queryOneMock = jest.spyOn(testDb, 'queryOne').mockResolvedValue({
        total: 0,
        completed: 0,
        count: 0,
        avg_days: 0,
      });

      const context = await contextService.getProjectContext({
        include_metrics: false,
        max_items: 5,
      });

      expect(context).toBeDefined();
      expect(context.summary).toContain('Project Status');
      expect(context.boards).toEqual([]);
      expect(context.recent_activities).toEqual([]);
      expect(context.priorities).toEqual([]);
      expect(context.blockers).toEqual([]);
      expect(context.overdue_tasks).toEqual([]);
      expect(context.generated_at).toBeInstanceOf(Date);

      queryMock.mockRestore();
      queryOneMock.mockRestore();
    });

    it('should handle project with boards and tasks', async () => {
      const testBoard = createTestBoard();
      const testTask = createTestTask();

      mockBoardService.getBoards.mockResolvedValue([testBoard]);
      mockBoardService.getBoardWithStats.mockResolvedValue({
        ...testBoard,
        taskCount: 5,
        completedTasks: 2,
      });
      mockTaskService.getTasks.mockResolvedValue([testTask]);

      const queryMock = jest.spyOn(testDb, 'query').mockResolvedValue([]);
      const queryOneMock = jest
        .spyOn(testDb, 'queryOne')
        .mockImplementation(async (query: string) => {
          if (query.includes('board_id = ?')) {
            return { count: 2 }; // Recent activity
          }
          return { total: 5, completed: 2, count: 0, avg_days: 3 };
        });

      const context = await contextService.getProjectContext();

      expect(context.boards).toHaveLength(1);
      expect(context.boards[0].board).toEqual(testBoard);
      expect(context.boards[0].task_count).toBe(5);
      expect(context.boards[0].completion_rate).toBe(40); // 2/5 * 100

      queryMock.mockRestore();
      queryOneMock.mockRestore();
    });

    it('should handle database errors gracefully', async () => {
      mockBoardService.getBoards.mockRejectedValue(new Error('Database connection failed'));

      await expect(contextService.getProjectContext()).rejects.toThrow(
        'Failed to generate project context'
      );
    });
  });

  describe('Task Context Generation', () => {
    it('should generate task context with dependencies', async () => {
      const testTask = createTestTask();
      const testBoard = createTestBoard();
      const testNotes = [
        {
          id: 'note-1',
          task_id: 'task-123',
          content: 'Progress note',
          category: 'progress',
          pinned: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
      const testTags = [
        {
          id: 'tag-1',
          name: 'feature',
          color: '#blue',
          parent_tag_id: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockTaskService.getTaskById.mockResolvedValue(testTask);
      mockBoardService.getBoardById.mockResolvedValue(testBoard);
      mockTaskService.getTaskWithDependencies.mockResolvedValue({
        ...testTask,
        dependencies: [],
        dependents: [],
      });
      mockNoteService.getTaskNotes.mockResolvedValue(testNotes);
      mockTagService.getTaskTags.mockResolvedValue(testTags);

      const queryMock = jest.spyOn(testDb, 'query').mockResolvedValue([]);

      const context = await contextService.getTaskContext('task-123');

      expect(context).toBeDefined();
      expect(context.task).toEqual(testTask);
      expect(context.board).toEqual(testBoard);
      expect(context.notes).toEqual(testNotes);
      expect(context.tags).toEqual(testTags);
      expect(context.context_summary).toContain(testTask.title);
      expect(context.recommendations).toBeDefined();
      expect(context.generated_at).toBeInstanceOf(Date);

      queryMock.mockRestore();
    });

    it('should handle task not found', async () => {
      mockTaskService.getTaskById.mockResolvedValue(null);

      await expect(contextService.getTaskContext('nonexistent')).rejects.toThrow(
        'Failed to generate task context'
      );
    });

    it('should generate recommendations for overdue tasks', async () => {
      const overdueTask = createTestTask({
        due_date: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      });
      const testBoard = createTestBoard();

      mockTaskService.getTaskById.mockResolvedValue(overdueTask);
      mockBoardService.getBoardById.mockResolvedValue(testBoard);
      mockTaskService.getTaskWithDependencies.mockResolvedValue({
        ...overdueTask,
        dependencies: [],
        dependents: [],
      });
      mockNoteService.getTaskNotes.mockResolvedValue([]);
      mockTagService.getTaskTags.mockResolvedValue([]);

      const queryMock = jest.spyOn(testDb, 'query').mockResolvedValue([]);

      const context = await contextService.getTaskContext('task-123');

      expect(context.recommendations).toContain('This task is overdue and should be prioritized');

      queryMock.mockRestore();
    });
  });

  describe('Current Work Context', () => {
    it('should generate work context with active tasks', async () => {
      const activeTasks = [
        createTestTask({
          id: 'task-1',
          status: 'in_progress',
          estimated_hours: 4,
          actual_hours: 2,
        }),
        createTestTask({
          id: 'task-2',
          status: 'in_progress',
          estimated_hours: 6,
          actual_hours: 1,
        }),
      ];

      mockTaskService.getTasks.mockResolvedValue(activeTasks);

      const queryMock = jest.spyOn(testDb, 'queryOne').mockResolvedValue({ count: 0 });

      const workContext = await contextService.getCurrentWorkContext({ max_items: 10 });

      expect(workContext).toBeDefined();
      expect(workContext.active_tasks).toEqual(activeTasks);
      expect(workContext.next_actions).toBeDefined();
      expect(workContext.blockers).toBeDefined();
      expect(workContext.focus_recommendations).toBeDefined();
      expect(workContext.estimated_work_hours).toBe(7); // (4-2) + (6-1) = 7

      queryMock.mockRestore();
    });

    it('should recommend reducing WIP for many active tasks', async () => {
      const manyActiveTasks = Array.from({ length: 5 }, (_, i) =>
        createTestTask({ id: `task-${i}`, status: 'in_progress' })
      );

      mockTaskService.getTasks.mockResolvedValue(manyActiveTasks);
      jest.spyOn(testDb, 'queryOne').mockResolvedValue({ count: 0 });

      const workContext = await contextService.getCurrentWorkContext();

      expect(workContext.focus_recommendations).toContain(
        'Consider reducing work in progress - focus on completing current tasks'
      );
    });

    it('should handle service errors gracefully', async () => {
      mockTaskService.getTasks.mockRejectedValue(new Error('Service unavailable'));

      await expect(contextService.getCurrentWorkContext()).rejects.toThrow(
        'Failed to generate work context'
      );
    });
  });

  describe('Priority Analysis', () => {
    it('should calculate priority scores for tasks', async () => {
      const highPriorityTask = createTestTask({
        priority: 8,
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      });

      mockBoardService.getBoards.mockResolvedValue([]);
      mockTaskService.getTasks.mockResolvedValue([highPriorityTask]);
      mockTaskService.getOverdueTasks.mockResolvedValue([]);
      mockTaskService.getBlockedTasks.mockResolvedValue([]);

      const queryMock = jest.spyOn(testDb, 'query').mockResolvedValue([]);
      const queryOneMock = jest
        .spyOn(testDb, 'queryOne')
        .mockImplementation(async (query: string) => {
          if (query.includes('depends_on_task_id = ?')) {
            return { count: 1 }; // Blocks 1 task
          }
          return { total: 1, completed: 0, count: 0, avg_days: 1 };
        });

      const context = await contextService.getProjectContext({ max_items: 5 });

      expect(context.priorities).toHaveLength(1);
      const priority = context.priorities[0];
      expect(priority.task).toEqual(highPriorityTask);
      expect(priority.urgency_level).toMatch(/medium|high|critical/);
      expect(priority.reasoning).toContain('High priority level set');

      queryMock.mockRestore();
      queryOneMock.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle board service failures', async () => {
      mockBoardService.getBoards.mockRejectedValue(new Error('BoardService error'));

      await expect(contextService.getProjectContext()).rejects.toThrow(
        'Failed to generate project context'
      );
    });

    it('should handle task service failures in task context', async () => {
      mockTaskService.getTaskById.mockRejectedValue(new Error('TaskService error'));

      await expect(contextService.getTaskContext('task-123')).rejects.toThrow(
        'Failed to generate task context'
      );
    });
  });
});
