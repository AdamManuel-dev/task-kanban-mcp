/**
 * API Integration Tests for Task Endpoints
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';
import { v4 as uuidv4 } from 'uuid';
import type { Task, Board } from '@/types';

describe('Task API Integration Tests', () => {
  let app: Express;
  let apiKey: string;
  let testBoard: Board;
  let testTask: Task;

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
    const columnIds = [];
    for (let i = 0; i < columns.length; i++) {
      const columnId = uuidv4();
      columnIds.push(columnId);
      await dbConnection.execute(
        'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
        [columnId, boardId, columns[i], i, new Date().toISOString()]
      );
    }

    // Store first column ID for task creation
    global.testColumnId = columnIds[0];
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  beforeEach(async () => {
    // Clean up tasks before each test
    await dbConnection.execute('DELETE FROM tasks');
  });

  describe('POST /api/v1/tasks', () => {
    it('should create a new task', async () => {
      const newTask = {
        title: 'Test Task',
        description: 'This is a test task',
        board_id: testBoard.id,
        column_id: global.testColumnId,
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

    it('should validate required fields', async () => {
      const invalidTask = {
        description: 'Missing title',
      };

      const response = await request(app)
        .post('/api/v1/tasks')
        .set('X-API-Key', apiKey)
        .send(invalidTask)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should require authentication', async () => {
      const newTask = {
        title: 'Test Task',
        board_id: testBoard.id,
        column_id: global.testColumnId,
      };

      await request(app).post('/api/v1/tasks').send(newTask).expect(401);
    });
  });

  describe('GET /api/v1/tasks', () => {
    beforeEach(async () => {
      // Create test tasks
      const taskId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, position, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          taskId,
          'Test Task 1',
          'Description 1',
          testBoard.id,
          global.testColumnId,
          'todo',
          'high',
          0,
          new Date().toISOString(),
        ]
      );

      testTask = {
        id: taskId,
        title: 'Test Task 1',
        description: 'Description 1',
        boardId: testBoard.id,
        columnId: null,
        status: 'todo',
        priority: 'high',
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    it('should list all tasks', async () => {
      const response = await request(app).get('/api/v1/tasks').set('X-API-Key', apiKey).expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toMatchObject({
        title: testTask.title,
        description: testTask.description,
      });
    });

    it('should filter tasks by board', async () => {
      // Create task in different board
      const otherBoardId = uuidv4();
      await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
        otherBoardId,
        'Other Board',
        new Date().toISOString(),
      ]);

      // Need to create column for other board first
      const otherColumnId = uuidv4();
      await dbConnection.execute(
        'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
        [otherColumnId, otherBoardId, 'To Do', 0, new Date().toISOString()]
      );

      await dbConnection.execute(
        `INSERT INTO tasks (id, title, board_id, column_id, status, position, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), 'Other Task', otherBoardId, otherColumnId, 'todo', 0, new Date().toISOString()]
      );

      const response = await request(app)
        .get('/api/v1/tasks')
        .query({ boardId: testBoard.id })
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].boardId).toBe(testBoard.id);
    });

    it('should filter tasks by status', async () => {
      // Create task with different status
      await dbConnection.execute(
        `INSERT INTO tasks (id, title, board_id, column_id, status, position, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          'Done Task',
          testBoard.id,
          global.testColumnId,
          'done',
          1,
          new Date().toISOString(),
        ]
      );

      const response = await request(app)
        .get('/api/v1/tasks')
        .query({ status: 'todo' })
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('todo');
    });

    it('should support pagination', async () => {
      // Create multiple tasks
      for (let i = 0; i < 5; i++) {
        await dbConnection.execute(
          `INSERT INTO tasks (id, title, board_id, column_id, status, position, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            `Task ${i + 2}`,
            testBoard.id,
            global.testColumnId,
            'todo',
            i + 1,
            new Date().toISOString(),
          ]
        );
      }

      const response = await request(app)
        .get('/api/v1/tasks')
        .query({ limit: 3, offset: 0 })
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination).toMatchObject({
        limit: 3,
        offset: 0,
        total: 6,
      });
    });
  });

  describe('GET /api/v1/tasks/:id', () => {
    it('should get a specific task', async () => {
      const response = await request(app)
        .get(`/api/v1/tasks/${testTask.id}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testTask.id,
        title: testTask.title,
        description: testTask.description,
      });
    });

    it('should return 404 for non-existent task', async () => {
      const fakeId = uuidv4();

      const response = await request(app)
        .get(`/api/v1/tasks/${fakeId}`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('PATCH /api/v1/tasks/:id', () => {
    it('should update a task', async () => {
      const updates = {
        title: 'Updated Task Title',
        status: 'in_progress',
        priority: 'high',
      };

      const response = await request(app)
        .patch(`/api/v1/tasks/${testTask.id}`)
        .set('X-API-Key', apiKey)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject(updates);
      expect(response.body.data.updatedAt).toBeDefined();
    });

    it('should validate update fields', async () => {
      const invalidUpdate = {
        status: 'invalid_status',
      };

      const response = await request(app)
        .patch(`/api/v1/tasks/${testTask.id}`)
        .set('X-API-Key', apiKey)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/tasks/:id', () => {
    it('should delete a task', async () => {
      const response = await request(app)
        .delete(`/api/v1/tasks/${testTask.id}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify task is deleted
      const checkResponse = await request(app)
        .get(`/api/v1/tasks/${testTask.id}`)
        .set('X-API-Key', apiKey)
        .expect(404);
    });
  });

  describe('Task Dependencies', () => {
    let dependentTaskId: string;

    beforeEach(async () => {
      // Create a dependent task
      dependentTaskId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tasks (id, title, board_id, column_id, status, position, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          dependentTaskId,
          'Dependent Task',
          testBoard.id,
          global.testColumnId,
          'todo',
          1,
          new Date().toISOString(),
        ]
      );
    });

    it('should add task dependencies', async () => {
      const response = await request(app)
        .post(`/api/v1/tasks/${testTask.id}/dependencies`)
        .set('X-API-Key', apiKey)
        .send({ dependsOn: [dependentTaskId] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.dependencies).toContain(dependentTaskId);
    });

    it('should prevent circular dependencies', async () => {
      // First add A depends on B
      await request(app)
        .post(`/api/v1/tasks/${testTask.id}/dependencies`)
        .set('X-API-Key', apiKey)
        .send({ dependsOn: [dependentTaskId] })
        .expect(200);

      // Then try to add B depends on A (circular)
      const response = await request(app)
        .post(`/api/v1/tasks/${dependentTaskId}/dependencies`)
        .set('X-API-Key', apiKey)
        .send({ dependsOn: [testTask.id] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('circular');
    });
  });

  describe('Task Search', () => {
    beforeEach(async () => {
      // Create tasks with different titles for search
      const tasks = [
        { title: 'Important bug fix', description: 'Fix critical bug in auth' },
        { title: 'Feature request', description: 'Add new dashboard' },
        { title: 'Documentation update', description: 'Update API docs' },
      ];

      for (const task of tasks) {
        await dbConnection.execute(
          `INSERT INTO tasks (id, title, description, board_id, column_id, status, position, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            task.title,
            task.description,
            testBoard.id,
            global.testColumnId,
            'todo',
            0,
            new Date().toISOString(),
          ]
        );
      }
    });

    it('should search tasks by title', async () => {
      const response = await request(app)
        .get('/api/v1/tasks/search')
        .query({ q: 'bug' })
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toContain('bug');
    });

    it('should search tasks by description', async () => {
      const response = await request(app)
        .get('/api/v1/tasks/search')
        .query({ q: 'API' })
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].description).toContain('API');
    });
  });
});
