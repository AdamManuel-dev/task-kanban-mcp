/**
 * API Integration Tests for Task Endpoints
 *
 * This test suite provides comprehensive coverage for all task-related REST API endpoints.
 * It tests CRUD operations, filtering, sorting, pagination, and error handling.
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';
import { v4 as uuidv4 } from 'uuid';
import type { Task, Board, CreateTaskRequest } from '@/types';

describe('Task API Integration Tests', () => {
  let app: Express;
  let apiKey: string;
  let testBoard: Board;
  // let testTask: Task;
  let testColumnId: string;

  beforeAll(async () => {
    // Initialize database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Create Express app
    app = await createServer();

    // Use development API key
    apiKey = 'dev-key-1';

    // Create test board
    const boardId = uuidv4();
    await dbConnection.execute(
      'INSERT INTO boards (id, name, description, created_at) VALUES (?, ?, ?, ?)',
      [boardId, 'Test Board', 'Board for integration tests', new Date().toISOString()]
    );

    testBoard = {
      id: boardId,
      name: 'Test Board',
      description: 'Board for integration tests',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Create test columns and store IDs
    const columns = ['To Do', 'In Progress', 'Done'];
    const columnIds = await Promise.all(
      columns.map(async (column, i) => {
        const columnId = uuidv4();
        await dbConnection.execute(
          'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
          [columnId, boardId, column, i, new Date().toISOString()]
        );
        return columnId;
      })
    );

    // Store first column ID for task creation
    testColumnId = columnIds[0];
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  beforeEach(async () => {
    // Clean up tasks before each test
    await dbConnection.execute('DELETE FROM tasks');
  });

  describe('POST /api/v1/tasks', () => {
    it('should create a new task with valid data', async () => {
      const newTask: CreateTaskRequest = {
        title: 'Test Task',
        description: 'This is a test task',
        board_id: testBoard.id,
        column_id: testColumnId,
        status: 'todo',
        priority: 5,
      };

      const response = await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', apiKey)
        .send(newTask)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        title: newTask.title,
        description: newTask.description,
        board_id: newTask.board_id,
        status: newTask.status,
        priority: newTask.priority,
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.createdAt).toBeDefined();
    });

    it('should create a task with minimal required fields', async () => {
      const minimalTask = {
        title: 'Minimal Task',
        board_id: testBoard.id,
        column_id: testColumnId,
      };

      const response = await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', apiKey)
        .send(minimalTask)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(minimalTask.title);
      expect(response.body.data.status).toBe('todo'); // Default status
      expect(response.body.data.priority).toBe(5); // Default priority
    });

    it('should reject task creation with invalid board_id', async () => {
      const invalidTask = {
        title: 'Invalid Task',
        board_id: 'non-existent-board',
        column_id: testColumnId,
      };

      const response = await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', apiKey)
        .send(invalidTask)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('board_id');
    });

    it('should reject task creation with invalid column_id', async () => {
      const invalidTask = {
        title: 'Invalid Task',
        board_id: testBoard.id,
        column_id: 'non-existent-column',
      };

      const response = await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', apiKey)
        .send(invalidTask)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('column_id');
    });

    it('should reject task creation without API key', async () => {
      const newTask = {
        title: 'Test Task',
        board_id: testBoard.id,
        column_id: testColumnId,
      };

      await request(app).post('/api/v1/tasks').send(newTask).expect(401);
    });

    it('should reject task creation with invalid status', async () => {
      const invalidTask = {
        title: 'Invalid Task',
        board_id: testBoard.id,
        column_id: testColumnId,
        status: 'invalid_status',
      };

      const response = await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', apiKey)
        .send(invalidTask)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('status');
    });
  });

  describe('GET /api/v1/tasks', () => {
    beforeEach(async () => {
      // Create test tasks
      const tasks = [
        {
          id: uuidv4(),
          title: 'Task 1',
          description: 'First test task',
          board_id: testBoard.id,
          column_id: testColumnId,
          status: 'todo',
          priority: 3,
        },
        {
          id: uuidv4(),
          title: 'Task 2',
          description: 'Second test task',
          board_id: testBoard.id,
          column_id: testColumnId,
          status: 'in_progress',
          priority: 7,
        },
        {
          id: uuidv4(),
          title: 'Task 3',
          description: 'Third test task',
          board_id: testBoard.id,
          column_id: testColumnId,
          status: 'done',
          priority: 5,
        },
      ];

      for (const task of tasks) {
        await dbConnection.execute(
          `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.id,
            task.title,
            task.description,
            task.board_id,
            task.column_id,
            task.status,
            task.priority,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }
    });

    it('should list all tasks with default pagination', async () => {
      const response = await request(app).get('/api/v1/tasks').set('X-API-Key', apiKey).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 50,
        total: 3,
        totalPages: 1,
      });
    });

    it('should filter tasks by status', async () => {
      const response = await request(app)
        .get('/api/v1/tasks?status=todo')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('todo');
    });

    it('should filter tasks by board_id', async () => {
      const response = await request(app)
        .get(`/api/v1/tasks?board_id=${testBoard.id}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data.every((task: Task) => task.board_id === testBoard.id)).toBe(true);
    });

    it('should search tasks by title', async () => {
      const response = await request(app)
        .get('/api/v1/tasks?search=Task 1')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Task 1');
    });

    it('should sort tasks by priority', async () => {
      const response = await request(app)
        .get('/api/v1/tasks?sortBy=priority&sortOrder=desc')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data[0].priority).toBe(7);
      expect(response.body.data[1].priority).toBe(5);
      expect(response.body.data[2].priority).toBe(3);
    });

    it('should apply pagination', async () => {
      const response = await request(app)
        .get('/api/v1/tasks?limit=2&offset=0')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it('should filter by priority range', async () => {
      const response = await request(app)
        .get('/api/v1/tasks?priority_min=4&priority_max=6')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].priority).toBe(5);
    });

    it('should reject request without API key', async () => {
      await request(app).get('/api/v1/tasks').expect(401);
    });
  });

  describe('GET /api/v1/tasks/:id', () => {
    let testTaskId: string;

    beforeEach(async () => {
      // Create a test task
      testTaskId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          testTaskId,
          'Test Task',
          'Test Description',
          testBoard.id,
          testColumnId,
          'todo',
          5,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    });

    it('should retrieve a task by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/tasks/${testTaskId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testTaskId,
        title: 'Test Task',
        description: 'Test Description',
        board_id: testBoard.id,
        status: 'todo',
        priority: 5,
      });
    });

    it('should return 404 for non-existent task', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .get(`/api/v1/tasks/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).get(`/api/v1/tasks/${testTaskId}`).expect(401);
    });
  });

  describe('PUT /api/v1/tasks/:id', () => {
    let testTaskId: string;

    beforeEach(async () => {
      // Create a test task
      testTaskId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          testTaskId,
          'Original Task',
          'Original Description',
          testBoard.id,
          testColumnId,
          'todo',
          3,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    });

    it('should update a task with valid data', async () => {
      const updateData = {
        title: 'Updated Task',
        description: 'Updated Description',
        status: 'in_progress',
        priority: 8,
      };

      const response = await request(app)
        .put(`/api/v1/tasks/${testTaskId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testTaskId,
        title: updateData.title,
        description: updateData.description,
        status: updateData.status,
        priority: updateData.priority,
      });
    });

    it('should partially update a task', async () => {
      const updateData = {
        status: 'done',
      };

      const response = await request(app)
        .put(`/api/v1/tasks/${testTaskId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('done');
      expect(response.body.data.title).toBe('Original Task'); // Should remain unchanged
    });

    it('should return 404 for non-existent task', async () => {
      const nonExistentId = uuidv4();
      const updateData = { title: 'Updated Task' };

      const response = await request(app)
        .put(`/api/v1/tasks/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject invalid status update', async () => {
      const updateData = {
        status: 'invalid_status',
      };

      const response = await request(app)
        .put(`/api/v1/tasks/${testTaskId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('status');
    });

    it('should reject request without API key', async () => {
      const updateData = { title: 'Updated Task' };

      await request(app).put(`/api/v1/tasks/${testTaskId}`).send(updateData).expect(401);
    });
  });

  describe('DELETE /api/v1/tasks/:id', () => {
    let testTaskId: string;

    beforeEach(async () => {
      // Create a test task
      testTaskId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          testTaskId,
          'Task to Delete',
          'This task will be deleted',
          testBoard.id,
          testColumnId,
          'todo',
          5,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    });

    it('should delete a task by ID', async () => {
      const response = await request(app)
        .delete(`/api/v1/tasks/${testTaskId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');

      // Verify task is actually deleted
      await request(app).get(`/api/v1/tasks/${testTaskId}`).set('X-API-Key', apiKey).expect(404);
    });

    it('should return 404 for non-existent task', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .delete(`/api/v1/tasks/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).delete(`/api/v1/tasks/${testTaskId}`).expect(401);
    });
  });

  describe('POST /api/v1/tasks/:id/notes', () => {
    let testTaskId: string;

    beforeEach(async () => {
      // Create a test task
      testTaskId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          testTaskId,
          'Task with Notes',
          'This task will have notes added',
          testBoard.id,
          testColumnId,
          'todo',
          5,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    });

    it('should add a note to a task', async () => {
      const noteData = {
        content: 'This is a test note',
        type: 'comment',
      };

      const response = await request(app)
        .post(`/api/v1/tasks/${testTaskId}/notes`)
        .set('X-API-Key', apiKey)
        .send(noteData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        content: noteData.content,
        type: noteData.type,
        task_id: testTaskId,
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.createdAt).toBeDefined();
    });

    it('should return 404 for non-existent task', async () => {
      const nonExistentId = uuidv4();
      const noteData = { content: 'Test note' };

      const response = await request(app)
        .post(`/api/v1/tasks/${nonExistentId}/notes`)
        .set('X-API-Key', apiKey)
        .send(noteData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('GET /api/v1/tasks/:id/notes', () => {
    let testTaskId: string;

    beforeEach(async () => {
      // Create a test task with notes
      testTaskId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          testTaskId,
          'Task with Notes',
          'This task has notes',
          testBoard.id,
          testColumnId,
          'todo',
          5,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );

      // Add notes to the task
      const notes = [
        { content: 'First note', type: 'comment' },
        { content: 'Second note', type: 'comment' },
      ];

      for (const note of notes) {
        await dbConnection.execute(
          `INSERT INTO notes (id, task_id, content, type, created_at) 
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), testTaskId, note.content, note.type, new Date().toISOString()]
        );
      }
    });

    it('should retrieve all notes for a task', async () => {
      const response = await request(app)
        .get(`/api/v1/tasks/${testTaskId}/notes`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].task_id).toBe(testTaskId);
      expect(response.body.data[1].task_id).toBe(testTaskId);
    });

    it('should return empty array for task with no notes', async () => {
      const emptyTaskId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          emptyTaskId,
          'Empty Task',
          'This task has no notes',
          testBoard.id,
          testColumnId,
          'todo',
          5,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );

      const response = await request(app)
        .get(`/api/v1/tasks/${emptyTaskId}/notes`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should return 404 for non-existent task', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .get(`/api/v1/tasks/${nonExistentId}/notes`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });
});
