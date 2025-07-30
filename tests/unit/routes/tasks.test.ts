/**
 * Unit tests for Tasks Routes
 *
 * @description Comprehensive test suite covering all task route endpoints
 * including authentication, validation, and error handling.
 */

import express from 'express';
import request from 'supertest';

// Mock TaskService
const mockTaskService = {
  getTasks: jest.fn(),
  getTaskById: jest.fn(),
  createTask: jest.fn(),
  updateTask: jest.fn(),
  deleteTask: jest.fn(),
  moveTask: jest.fn(),
  getTasksWithDependencies: jest.fn(),
  getTaskWithSubtasks: jest.fn(),
  getTaskWithDependencies: jest.fn(),
};

jest.doMock('../../../src/services/TaskService', () => ({
  TaskService: jest.fn().mockImplementation(() => mockTaskService),
}));

// Mock NoteService
const mockNoteService = {
  createNote: jest.fn(),
  updateNote: jest.fn(),
  deleteNote: jest.fn(),
  getNoteById: jest.fn(),
  getNotesByTaskId: jest.fn(),
};

jest.doMock('../../../src/services/NoteService', () => ({
  NoteService: jest.fn().mockImplementation(() => mockNoteService),
}));

// Mock TagService
const mockTagService = {
  addTagsToTask: jest.fn(),
  removeTagFromTask: jest.fn(),
  getTagsByTaskId: jest.fn(),
};

jest.doMock('../../../src/services/TagService', () => ({
  TagService: jest.fn().mockImplementation(() => mockTagService),
}));

// Mock the database connection
const mockDbConnection = {
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
  transaction: jest.fn(),
  isConnected: jest.fn(() => true),
  close: jest.fn(),
  getDatabase: jest.fn(),
  getSchemaManager: jest.fn(),
  getMigrationRunner: jest.fn(),
  getSeedRunner: jest.fn(),
  runMigrations: jest.fn(),
  runSeeds: jest.fn(),
  healthCheck: jest.fn(),
  getStats: jest.fn(),
};

// Mock the database connection
jest.doMock('../../../src/database/connection', () => ({
  dbConnection: mockDbConnection,
  DatabaseConnection: {
    getInstance: () => mockDbConnection,
  },
}));

// Mock the logger
jest.doMock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock validation utilities
jest.doMock('../../../src/utils/validation', () => ({
  validateInput: jest.fn((schema, data) => data),
  validateOptionalInput: jest.fn((schema, data) => data),
  TaskValidation: {
    create: {},
    update: {},
  },
  NoteValidation: {
    create: {},
    update: {},
  },
}));

// Mock error utilities
function createMockError(message: string, statusCode: number): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

jest.doMock('../../../src/utils/errors', () => ({
  NotFoundError(entity: string, id: string) {
    return createMockError(`${String(entity)} ${String(id)} not found`, 404);
  },
  ValidationError(message = 'Validation error') {
    return createMockError(message, 400);
  },
}));

// Mock auth middleware
jest.doMock('../../../src/middleware/auth', () => ({
  requirePermission: jest.fn(() => (req: any, res: any, next: any) => {
    // Mock authenticated user
    req.user = { id: 'test-user', permissions: ['read', 'write'] };
    req.apiKey = 'test-api-key';
    next();
  }),
}));

describe('Tasks Routes', () => {
  let app: express.Application;
  let boardId: string;
  let columnId: string;
  let taskId: string;

  beforeAll(async () => {
    // Import after mocks are set up
    const { responseFormattingMiddleware } = await import('../../../src/middleware/response');
    const { taskRoutes } = await import('../../../src/routes/tasks');

    // Set up Express app
    app = express();
    app.use(express.json());

    // Set up middleware
    app.use((req: any, res, next) => {
      req.requestId = 'test-request-id';
      // Mock authenticated user
      req.user = { id: 'test-user', permissions: ['read', 'write'] };
      req.apiKey = 'test-api-key';
      next();
    });
    app.use(responseFormattingMiddleware);

    // Mount routes
    const router = taskRoutes();
    app.use('/api/v1/tasks', router);

    // Error handling middleware
    app.use((error: any, req: any, res: any, _next: any) => {
      // Error logged in test environment for debugging
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    });

    // Set up test data
    boardId = 'test-board-1';
    columnId = 'todo';
    taskId = 'test-task-1';
  });

  afterAll(async () => {
    // No explicit cleanup needed here as services are mocked
  });

  beforeEach(async () => {
    // Reset mock calls before each test
    jest.clearAllMocks();
  });

  describe('GET /api/v1/tasks', () => {
    beforeEach(async () => {
      // Mock service responses for test tasks - returns array directly
      mockTaskService.getTasks.mockResolvedValue([
        {
          id: taskId,
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 1',
          description: 'First test task',
          status: 'todo',
          position: 0,
          priority: 1,
        },
        {
          id: 'test-task-2',
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 2',
          description: 'Second test task',
          status: 'in_progress',
          position: 1,
          priority: 2,
        },
        {
          id: 'test-task-3',
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 3',
          description: 'Third test task',
          status: 'done',
          position: 2,
          priority: 3,
        },
      ]);
    });

    it('should return all tasks with default pagination', async () => {
      const response = await request(app)
        .get('/api/v1/tasks')
        .set('X-API-Key', 'test-api-key')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data[0].title).toBe('Test Task 1');
      expect(response.body.meta.pagination).toBeDefined();
    });

    it('should apply pagination parameters', async () => {
      // Override the mock to return filtered results
      mockTaskService.getTasks.mockResolvedValueOnce([
        {
          id: 'test-task-2',
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 2',
          description: 'Second test task',
          status: 'in_progress',
          position: 1,
          priority: 2,
        },
        {
          id: 'test-task-3',
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 3',
          description: 'Third test task',
          status: 'done',
          position: 2,
          priority: 3,
        },
      ]);

      const response = await request(app)
        .get('/api/v1/tasks')
        .set('X-API-Key', 'test-api-key')
        .query({ limit: 2, offset: 1 })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.pagination.limit).toBe(2);
    });

    it('should filter tasks by board_id', async () => {
      const response = await request(app)
        .get('/api/v1/tasks')
        .set('X-API-Key', 'test-api-key')
        .query({ board_id: boardId })
        .expect(200);

      expect(response.body.data).toHaveLength(3);
      response.body.data.forEach((task: any) => {
        expect(task.board_id).toBe(boardId);
      });
    });

    it('should filter tasks by status', async () => {
      // Override mock for status filtering
      mockTaskService.getTasks.mockResolvedValueOnce([
        {
          id: taskId,
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 1',
          description: 'First test task',
          status: 'todo',
          position: 0,
          priority: 1,
        },
      ]);

      const response = await request(app)
        .get('/api/v1/tasks')
        .set('X-API-Key', 'test-api-key')
        .query({ status: 'todo' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('todo');
    });

    it('should filter tasks by priority range', async () => {
      // Override mock for priority filtering
      mockTaskService.getTasks.mockResolvedValueOnce([
        {
          id: 'test-task-2',
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 2',
          description: 'Second test task',
          status: 'in_progress',
          position: 1,
          priority: 2,
        },
        {
          id: 'test-task-3',
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 3',
          description: 'Third test task',
          status: 'done',
          position: 2,
          priority: 3,
        },
      ]);

      const response = await request(app)
        .get('/api/v1/tasks')
        .set('X-API-Key', 'test-api-key')
        .query({ priority_min: 2, priority_max: 3 })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      response.body.data.forEach((task: any) => {
        expect(task.priority).toBeGreaterThanOrEqual(2);
        expect(task.priority).toBeLessThanOrEqual(3);
      });
    });

    it('should search tasks by title', async () => {
      // Override mock for search filtering
      mockTaskService.getTasks.mockResolvedValueOnce([
        {
          id: 'test-task-2',
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 2',
          description: 'Second test task',
          status: 'in_progress',
          position: 1,
          priority: 2,
        },
      ]);

      const response = await request(app)
        .get('/api/v1/tasks')
        .set('X-API-Key', 'test-api-key')
        .query({ search: 'Task 2' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toContain('Task 2');
    });

    it('should apply sorting', async () => {
      // Override mock for sorting - return in priority order
      mockTaskService.getTasks.mockResolvedValueOnce([
        {
          id: taskId,
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 1',
          description: 'First test task',
          status: 'todo',
          position: 0,
          priority: 1,
        },
        {
          id: 'test-task-2',
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 2',
          description: 'Second test task',
          status: 'in_progress',
          position: 1,
          priority: 2,
        },
        {
          id: 'test-task-3',
          board_id: boardId,
          column_id: columnId,
          title: 'Test Task 3',
          description: 'Third test task',
          status: 'done',
          position: 2,
          priority: 3,
        },
      ]);

      const response = await request(app)
        .get('/api/v1/tasks')
        .set('X-API-Key', 'test-api-key')
        .query({ sortBy: 'priority', sortOrder: 'asc' })
        .expect(200);

      expect(response.body.data[0].priority).toBeLessThanOrEqual(response.body.data[1].priority);
    });
  });

  describe('POST /api/v1/tasks', () => {
    it('should create a new task', async () => {
      const taskData = {
        title: 'New Task',
        description: 'New task description',
        board_id: boardId,
        column_id: columnId,
        priority: 5,
      };

      const createdTask = {
        id: taskId,
        ...taskData,
        status: 'todo',
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockTaskService.createTask.mockResolvedValue(createdTask);

      const response = await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', 'test-api-key')
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('New Task');
      expect(mockTaskService.createTask).toHaveBeenCalledWith(expect.objectContaining(taskData));
    });

    it('should validate required fields', async () => {
      const taskData = {
        description: 'Missing title and board_id',
      };

      const response = await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', 'test-api-key')
        .send(taskData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      const taskData = {
        title: 'Error Task',
        board_id: boardId,
        column_id: 'non-existent-column',
      };

      mockTaskService.createTask.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', 'test-api-key')
        .send(taskData)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/v1/tasks/:id', () => {
    beforeEach(async () => {
      const mockTask = {
        id: taskId,
        board_id: boardId,
        column_id: columnId,
        title: 'Test Task',
        description: 'Test task description',
        status: 'todo',
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockTaskService.getTaskById.mockResolvedValue(mockTask);
    });

    it('should return task by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/tasks/${String(taskId)}`)
        .set('X-API-Key', 'test-api-key')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(taskId);
      expect(response.body.data.title).toBe('Test Task');
    });

    it('should return 404 for non-existent task', async () => {
      mockTaskService.getTaskById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/tasks/non-existent-id')
        .set('X-API-Key', 'test-api-key')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should include subtasks when requested', async () => {
      const taskWithSubtasks = {
        id: taskId,
        board_id: boardId,
        column_id: columnId,
        title: 'Test Task',
        description: 'Test task description',
        status: 'todo',
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        subtasks: [
          {
            id: 'subtask-1',
            board_id: boardId,
            column_id: columnId,
            title: 'Subtask',
            parent_task_id: taskId,
            status: 'todo',
            position: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      };

      mockTaskService.getTaskWithSubtasks.mockResolvedValue(taskWithSubtasks);

      const response = await request(app)
        .get(`/api/v1/tasks/${String(taskId)}`)
        .set('X-API-Key', 'test-api-key')
        .query({ include: 'subtasks' })
        .expect(200);

      expect(response.body.data.subtasks).toBeDefined();
      expect(response.body.data.subtasks).toHaveLength(1);
      expect(response.body.data.subtasks[0].id).toBe('subtask-1');
    });

    it('should include dependencies when requested', async () => {
      const taskWithDependencies = {
        id: taskId,
        board_id: boardId,
        column_id: columnId,
        title: 'Test Task',
        description: 'Test task description',
        status: 'todo',
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dependencies: [],
        dependents: [
          {
            id: 'dependent-task',
            board_id: boardId,
            column_id: columnId,
            title: 'Dependent Task',
            status: 'todo',
            position: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      };

      mockTaskService.getTaskWithDependencies.mockResolvedValue(taskWithDependencies);

      const response = await request(app)
        .get(`/api/v1/tasks/${String(taskId)}`)
        .set('X-API-Key', 'test-api-key')
        .query({ include: 'dependencies' })
        .expect(200);

      expect(response.body.data.dependencies).toBeDefined();
      expect(response.body.data.dependents).toBeDefined();
      expect(response.body.data.dependents).toHaveLength(1);
    });
  });

  describe('PATCH /api/v1/tasks/:id', () => {
    beforeEach(async () => {
      const originalTask = {
        id: taskId,
        board_id: boardId,
        column_id: columnId,
        title: 'Original Task',
        description: 'Original description',
        status: 'todo',
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockTaskService.getTaskById.mockResolvedValue(originalTask);
    });

    it('should update task fields', async () => {
      const updateData = {
        title: 'Updated Task',
        description: 'Updated description',
        status: 'in_progress',
      };

      const updatedTask = {
        id: taskId,
        board_id: boardId,
        column_id: columnId,
        ...updateData,
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockTaskService.updateTask.mockResolvedValue(updatedTask);

      const response = await request(app)
        .patch(`/api/v1/tasks/${String(taskId)}`)
        .set('X-API-Key', 'test-api-key')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Updated Task');
      expect(response.body.data.status).toBe('in_progress');
      expect(mockTaskService.updateTask).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining(updateData)
      );
    });

    it('should return 404 for non-existent task', async () => {
      mockTaskService.updateTask.mockRejectedValue(new Error('Not found'));

      const response = await request(app)
        .patch('/api/v1/tasks/non-existent-id')
        .set('X-API-Key', 'test-api-key')
        .send({ title: 'Updated' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should validate update data', async () => {
      const response = await request(app)
        .patch(`/api/v1/tasks/${String(taskId)}`)
        .set('X-API-Key', 'test-api-key')
        .send({ priority: -1 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/v1/tasks/:id', () => {
    beforeEach(async () => {
      mockTaskService.deleteTask.mockResolvedValue(true);
    });

    it('should delete task', async () => {
      const response = await request(app)
        .delete(`/api/v1/tasks/${String(taskId)}`)
        .set('X-API-Key', 'test-api-key')
        .expect(204);

      expect(mockTaskService.deleteTask).toHaveBeenCalledWith(taskId);
    });

    it('should return 404 for non-existent task', async () => {
      mockTaskService.deleteTask.mockRejectedValue(new Error('Not found'));

      const response = await request(app)
        .delete('/api/v1/tasks/non-existent-id')
        .set('X-API-Key', 'test-api-key')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });
});
