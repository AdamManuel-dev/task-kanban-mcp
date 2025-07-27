/**
 * Unit tests for Tasks Routes
 *
 * @description Comprehensive test suite covering all task route endpoints
 * including authentication, validation, and error handling.
 */

import request from 'supertest';
import express from 'express';
import { taskRoutes } from '@/routes/tasks';
import { responseFormattingMiddleware } from '@/middleware/response';

// Mock the logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock authentication middleware
jest.mock('@/middleware/auth', () => ({
  requirePermission: (_permission: string) => (req: any, res: any, next: any) => {
    // Mock authenticated user
    req.user = { id: 'test-user', permissions: ['read', 'write'] };
    next();
  },
}));

// Mock database connection
let mockDbConnection: DatabaseConnection;
jest.mock('@/database/connection', () => ({
  dbConnection: {
    get isConnected() {
      return mockDbConnection?.isConnected() || false;
    },
    get query() {
      return mockDbConnection?.query?.bind(mockDbConnection);
    },
    get queryOne() {
      return mockDbConnection?.queryOne?.bind(mockDbConnection);
    },
    get execute() {
      return mockDbConnection?.execute?.bind(mockDbConnection);
    },
    get transaction() {
      return mockDbConnection?.transaction?.bind(mockDbConnection);
    },
  },
}));

// Mock validation utilities
jest.mock('@/utils/validation', () => ({
  TaskValidation: {
    create: {},
    update: {},
  },
  NoteValidation: {
    create: {},
    update: {},
  },
  TagValidation: {
    create: {},
    update: {},
  },
  validateInput: (schema: any, data: any) => {
    // Basic validation - just return the data for testing
    if (!data.title && schema === {}) {
      throw { statusCode: 400, message: 'Validation failed' };
    }
    return data;
  },
}));

// Mock error utilities
jest.mock('@/utils/errors', () => ({
  NotFoundError: class extends Error {
    statusCode = 404;

    constructor(entity: string, id: string) {
      super(`${entity} ${id} not found`);
    }
  },
}));

describe('Tasks Routes', () => {
  let app: express.Application;
  let dbConnection: DatabaseConnection;
  let boardId: string;
  let columnId: string;
  let taskId: string;

  beforeAll(async () => {
    // Set up Express app
    app = express();
    app.use(express.json());

    // Set up middleware
    app.use((req, res, next) => {
      req.requestId = 'test-request-id';
      next();
    });
    app.use(responseFormattingMiddleware);

    // Mount routes
    const router = await taskRoutes();
    app.use('/api/v1/tasks', router);

    // Error handling middleware
    app.use((error: any, req: any, res: any, next: any) => {
      // Error logged in test environment for debugging
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    });

    // Set up database
    (DatabaseConnection as any).instance = null;
    dbConnection = DatabaseConnection.getInstance();

    if (dbConnection.isConnected()) {
      await dbConnection.close();
    }

    process.env.DATABASE_PATH = './data/kanban-test.db';
    await dbConnection.initialize();

    // Set the mock connection to use our test instance
    mockDbConnection = dbConnection;

    // Set up test data
    boardId = 'test-board-1';
    columnId = 'todo';
    taskId = 'test-task-1';

    // Create test board and column
    await dbConnection.execute('INSERT INTO boards (id, name, description) VALUES (?, ?, ?)', [
      boardId,
      'Test Board',
      'Test board for routes testing',
    ]);

    await dbConnection.execute(
      'INSERT INTO columns (id, board_id, name, position) VALUES (?, ?, ?, ?)',
      [columnId, boardId, 'To Do', 0]
    );
  });

  afterAll(async () => {
    if (dbConnection?.isConnected()) {
      await dbConnection.close();
    }
  });

  beforeEach(async () => {
    // Clean up tasks before each test
    await dbConnection.execute('DELETE FROM task_tags');
    await dbConnection.execute('DELETE FROM notes');
    await dbConnection.execute('DELETE FROM task_dependencies');
    await dbConnection.execute('DELETE FROM tasks');
  });

  describe('GET /api/v1/tasks', () => {
    beforeEach(async () => {
      // Create test tasks
      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, description, status, position, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [taskId, boardId, columnId, 'Test Task 1', 'First test task', 'todo', 0, 1]
      );

      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, description, status, position, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['test-task-2', boardId, columnId, 'Test Task 2', 'Second test task', 'in_progress', 1, 2]
      );

      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, description, status, position, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['test-task-3', boardId, columnId, 'Test Task 3', 'Third test task', 'done', 2, 3]
      );
    });

    it('should return all tasks with default pagination', async () => {
      const response = await request(app).get('/api/v1/tasks').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(50);
      expect(response.body.pagination.total).toBe(3);
    });

    it('should apply pagination parameters', async () => {
      const response = await request(app)
        .get('/api/v1/tasks')
        .query({ limit: 2, offset: 1 })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.page).toBe(2);
    });

    it('should filter tasks by board_id', async () => {
      const response = await request(app)
        .get('/api/v1/tasks')
        .query({ board_id: boardId })
        .expect(200);

      expect(response.body.data).toHaveLength(3);
      response.body.data.forEach((task: any) => {
        expect(task.board_id).toBe(boardId);
      });
    });

    it('should filter tasks by status', async () => {
      const response = await request(app)
        .get('/api/v1/tasks')
        .query({ status: 'todo' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('todo');
    });

    it('should filter tasks by priority range', async () => {
      const response = await request(app)
        .get('/api/v1/tasks')
        .query({ priority_min: 2, priority_max: 3 })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      response.body.data.forEach((task: any) => {
        expect(task.priority).toBeGreaterThanOrEqual(2);
        expect(task.priority).toBeLessThanOrEqual(3);
      });
    });

    it('should search tasks by title', async () => {
      const response = await request(app)
        .get('/api/v1/tasks')
        .query({ search: 'Task 2' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toContain('Task 2');
    });

    it('should apply sorting', async () => {
      const response = await request(app)
        .get('/api/v1/tasks')
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
        priority: 1,
      };

      const response = await request(app).post('/api/v1/tasks').send(taskData).expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('New Task');
      expect(response.body.data.board_id).toBe(boardId);
      expect(response.body.data.column_id).toBe(columnId);
    });

    it('should validate required fields', async () => {
      const taskData = {
        description: 'Missing title and board_id',
      };

      const response = await request(app).post('/api/v1/tasks').send(taskData).expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      const taskData = {
        title: 'Task with invalid board',
        board_id: 'non-existent-board',
        column_id: 'non-existent-column',
      };

      const response = await request(app).post('/api/v1/tasks').send(taskData).expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/v1/tasks/:id', () => {
    beforeEach(async () => {
      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, description, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [taskId, boardId, columnId, 'Test Task', 'Test task description', 'todo', 0]
      );
    });

    it('should return task by ID', async () => {
      const response = await request(app).get(`/api/v1/tasks/${taskId}`).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(taskId);
      expect(response.body.data.title).toBe('Test Task');
    });

    it('should return 404 for non-existent task', async () => {
      const response = await request(app).get('/api/v1/tasks/non-existent-id').expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should include subtasks when requested', async () => {
      // Create a subtask
      const subtaskId = 'subtask-1';
      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, parent_task_id, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [subtaskId, boardId, columnId, 'Subtask', taskId, 'todo', 0]
      );

      const response = await request(app)
        .get(`/api/v1/tasks/${taskId}`)
        .query({ include: 'subtasks' })
        .expect(200);

      expect(response.body.data.subtasks).toBeDefined();
      expect(response.body.data.subtasks).toHaveLength(1);
      expect(response.body.data.subtasks[0].id).toBe(subtaskId);
    });

    it('should include dependencies when requested', async () => {
      // Create dependency
      const dependentTaskId = 'dependent-task';
      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, status, position) VALUES (?, ?, ?, ?, ?, ?)',
        [dependentTaskId, boardId, columnId, 'Dependent Task', 'todo', 1]
      );

      await dbConnection.execute(
        'INSERT INTO task_dependencies (id, task_id, depends_on_task_id) VALUES (?, ?, ?)',
        ['dep-1', dependentTaskId, taskId]
      );

      const response = await request(app)
        .get(`/api/v1/tasks/${taskId}`)
        .query({ include: 'dependencies' })
        .expect(200);

      expect(response.body.data.dependents).toBeDefined();
    });
  });

  describe('PATCH /api/v1/tasks/:id', () => {
    beforeEach(async () => {
      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, description, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [taskId, boardId, columnId, 'Original Task', 'Original description', 'todo', 0]
      );
    });

    it('should update task fields', async () => {
      const updateData = {
        title: 'Updated Task',
        description: 'Updated description',
        status: 'in_progress',
      };

      const response = await request(app)
        .patch(`/api/v1/tasks/${taskId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Updated Task');
      expect(response.body.data.description).toBe('Updated description');
      expect(response.body.data.status).toBe('in_progress');
    });

    it('should return 404 for non-existent task', async () => {
      const response = await request(app)
        .patch('/api/v1/tasks/non-existent-id')
        .send({ title: 'Updated' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should validate update data', async () => {
      const response = await request(app)
        .patch(`/api/v1/tasks/${taskId}`)
        .send({ status: 'invalid-status' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/tasks/:id', () => {
    beforeEach(async () => {
      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, status, position) VALUES (?, ?, ?, ?, ?, ?)',
        [taskId, boardId, columnId, 'Task to Delete', 'todo', 0]
      );
    });

    it('should delete task', async () => {
      const response = await request(app).delete(`/api/v1/tasks/${taskId}`).expect(204);

      // Verify task is deleted
      const checkResponse = await request(app).get(`/api/v1/tasks/${taskId}`).expect(404);
    });

    it('should return 404 for non-existent task', async () => {
      const response = await request(app).delete('/api/v1/tasks/non-existent-id').expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Task Subtask Routes', () => {
    beforeEach(async () => {
      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, status, position) VALUES (?, ?, ?, ?, ?, ?)',
        [taskId, boardId, columnId, 'Parent Task', 'todo', 0]
      );
    });

    it('should create subtask', async () => {
      const subtaskData = {
        title: 'New Subtask',
        description: 'Subtask description',
      };

      const response = await request(app)
        .post(`/api/v1/tasks/${taskId}/subtasks`)
        .send(subtaskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('New Subtask');
      expect(response.body.data.parent_task_id).toBe(taskId);
    });

    it('should list subtasks', async () => {
      // Create subtasks
      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, parent_task_id, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['subtask-1', boardId, columnId, 'Subtask 1', taskId, 'todo', 0]
      );

      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, parent_task_id, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['subtask-2', boardId, columnId, 'Subtask 2', taskId, 'done', 1]
      );

      const response = await request(app).get(`/api/v1/tasks/${taskId}/subtasks`).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('Task Dependencies Routes', () => {
    let dependentTaskId: string;

    beforeEach(async () => {
      dependentTaskId = 'dependent-task';

      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, status, position) VALUES (?, ?, ?, ?, ?, ?)',
        [taskId, boardId, columnId, 'Parent Task', 'todo', 0]
      );

      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, status, position) VALUES (?, ?, ?, ?, ?, ?)',
        [dependentTaskId, boardId, columnId, 'Dependent Task', 'todo', 1]
      );
    });

    it('should add task dependency', async () => {
      const response = await request(app)
        .post(`/api/v1/tasks/${dependentTaskId}/dependencies`)
        .send({ depends_on_task_id: taskId })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.task_id).toBe(dependentTaskId);
      expect(response.body.data.depends_on_task_id).toBe(taskId);
    });

    it('should list task dependencies', async () => {
      // Create dependency
      await dbConnection.execute(
        'INSERT INTO task_dependencies (id, task_id, depends_on_task_id) VALUES (?, ?, ?)',
        ['dep-1', dependentTaskId, taskId]
      );

      const response = await request(app)
        .get(`/api/v1/tasks/${dependentTaskId}/dependencies`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].depends_on_task_id).toBe(taskId);
    });

    it('should prevent circular dependencies', async () => {
      // Create initial dependency
      await dbConnection.execute(
        'INSERT INTO task_dependencies (id, task_id, depends_on_task_id) VALUES (?, ?, ?)',
        ['dep-1', dependentTaskId, taskId]
      );

      // Try to create reverse dependency (circular)
      const response = await request(app)
        .post(`/api/v1/tasks/${taskId}/dependencies`)
        .send({ depends_on_task_id: dependentTaskId })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('circular');
    });
  });

  describe('Task Tags Routes', () => {
    let tagId: string;

    beforeEach(async () => {
      tagId = 'test-tag';

      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, status, position) VALUES (?, ?, ?, ?, ?, ?)',
        [taskId, boardId, columnId, 'Task with Tags', 'todo', 0]
      );

      await dbConnection.execute('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', [
        tagId,
        'test-tag',
        '#FF0000',
      ]);
    });

    it('should add tag to task', async () => {
      const response = await request(app)
        .post(`/api/v1/tasks/${taskId}/tags`)
        .send({ tag_id: tagId })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.task_id).toBe(taskId);
      expect(response.body.data.tag_id).toBe(tagId);
    });

    it('should remove tag from task', async () => {
      // First add the tag
      await dbConnection.execute(
        'INSERT INTO task_tags (task_id, tag_id, created_at) VALUES (?, ?, ?)',
        [taskId, tagId, new Date()]
      );

      const response = await request(app)
        .delete(`/api/v1/tasks/${taskId}/tags/${tagId}`)
        .expect(204);

      // Verify tag is removed
      const tags = await dbConnection.query(
        'SELECT * FROM task_tags WHERE task_id = ? AND tag_id = ?',
        [taskId, tagId]
      );
      expect(tags).toHaveLength(0);
    });
  });

  describe('Task Notes Routes', () => {
    beforeEach(async () => {
      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, status, position) VALUES (?, ?, ?, ?, ?, ?)',
        [taskId, boardId, columnId, 'Task with Notes', 'todo', 0]
      );
    });

    it('should add note to task', async () => {
      const noteData = {
        content: 'This is a test note',
        category: 'general',
      };

      const response = await request(app)
        .post(`/api/v1/tasks/${taskId}/notes`)
        .send(noteData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe('This is a test note');
      expect(response.body.data.task_id).toBe(taskId);
    });

    it('should list task notes', async () => {
      // Create test notes
      await dbConnection.execute(
        'INSERT INTO notes (id, task_id, content, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['note-1', taskId, 'First note', 'general', new Date(), new Date()]
      );

      await dbConnection.execute(
        'INSERT INTO notes (id, task_id, content, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['note-2', taskId, 'Second note', 'progress', new Date(), new Date()]
      );

      const response = await request(app).get(`/api/v1/tasks/${taskId}/notes`).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/v1/tasks')
        .send({ invalid: 'data' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should handle server errors', async () => {
      // Close database to force error
      await dbConnection.close();

      const response = await request(app).get('/api/v1/tasks').expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();

      // Reconnect for cleanup
      await dbConnection.initialize();
    });
  });
});
