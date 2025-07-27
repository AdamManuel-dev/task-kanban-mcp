/**
 * API Integration Tests for Board Endpoints
 *
 * This test suite provides comprehensive coverage for all board-related REST API endpoints.
 * It tests CRUD operations, filtering, sorting, pagination, and error handling.
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';
import { v4 as uuidv4 } from 'uuid';
import type { Board, CreateBoardRequest } from '@/types';

describe('Board API Integration Tests', () => {
  let app: Express;
  let apiKey: string;

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
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  beforeEach(async () => {
    // Clean up boards before each test
    await dbConnection.execute('DELETE FROM boards');
    await dbConnection.execute('DELETE FROM columns');
  });

  describe('POST /api/v1/boards', () => {
    it('should create a new board with valid data', async () => {
      const newBoard: CreateBoardRequest = {
        name: 'Test Board',
        description: 'This is a test board',
        columns: ['To Do', 'In Progress', 'Done'],
      };

      const response = await request(app)
        .post('/api/v1/boards')
        .set('X-API-Key', apiKey)
        .send(newBoard)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: newBoard.name,
        description: newBoard.description,
        isArchived: false,
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.createdAt).toBeDefined();
      expect(response.body.data.columns).toHaveLength(3);
    });

    it('should create a board with minimal required fields', async () => {
      const minimalBoard = {
        name: 'Minimal Board',
      };

      const response = await request(app)
        .post('/api/v1/boards')
        .set('X-API-Key', apiKey)
        .send(minimalBoard)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(minimalBoard.name);
      expect(response.body.data.description).toBe(''); // Default empty description
      expect(response.body.data.isArchived).toBe(false); // Default not archived
      expect(response.body.data.columns).toHaveLength(3); // Default columns
    });

    it('should reject board creation with empty name', async () => {
      const invalidBoard = {
        name: '',
        description: 'Invalid board',
      };

      const response = await request(app)
        .post('/api/v1/boards')
        .set('X-API-Key', apiKey)
        .send(invalidBoard)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('name');
    });

    it('should reject board creation without API key', async () => {
      const newBoard = {
        name: 'Test Board',
        description: 'This is a test board',
      };

      await request(app).post('/api/v1/boards').send(newBoard).expect(401);
    });

    it('should create board with custom columns', async () => {
      const customBoard = {
        name: 'Custom Board',
        description: 'Board with custom columns',
        columns: ['Backlog', 'Planning', 'Development', 'Testing', 'Deployed'],
      };

      const response = await request(app)
        .post('/api/v1/boards')
        .set('X-API-Key', apiKey)
        .send(customBoard)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.columns).toHaveLength(5);
      expect(response.body.data.columns).toEqual(customBoard.columns);
    });
  });

  describe('GET /api/v1/boards', () => {
    beforeEach(async () => {
      // Create test boards
      const boards = [
        {
          id: uuidv4(),
          name: 'Development Board',
          description: 'Main development tasks',
          isArchived: false,
        },
        {
          id: uuidv4(),
          name: 'Design Board',
          description: 'UI/UX design tasks',
          isArchived: false,
        },
        {
          id: uuidv4(),
          name: 'Archived Board',
          description: 'Old completed tasks',
          isArchived: true,
        },
      ];

      for (const board of boards) {
        await dbConnection.execute(
          `INSERT INTO boards (id, name, description, archived, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
          [
            board.id,
            board.name,
            board.description,
            board.isArchived,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }
    });

    it('should list all boards with default pagination', async () => {
      const response = await request(app)
        .get('/api/v1/boards')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 50,
        total: 3,
        totalPages: 1,
      });
    });

    it('should filter boards by archive status', async () => {
      const response = await request(app)
        .get('/api/v1/boards?archived=false')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((board: Board) => !board.isArchived)).toBe(true);
    });

    it('should search boards by name', async () => {
      const response = await request(app)
        .get('/api/v1/boards?search=Development')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Development Board');
    });

    it('should sort boards by name', async () => {
      const response = await request(app)
        .get('/api/v1/boards?sortBy=name&sortOrder=asc')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data[0].name).toBe('Archived Board');
      expect(response.body.data[1].name).toBe('Design Board');
      expect(response.body.data[2].name).toBe('Development Board');
    });

    it('should apply pagination', async () => {
      const response = await request(app)
        .get('/api/v1/boards?limit=2&offset=0')
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

    it('should reject request without API key', async () => {
      await request(app).get('/api/v1/boards').expect(401);
    });
  });

  describe('GET /api/v1/boards/:id', () => {
    let testBoardId: string;

    beforeEach(async () => {
      // Create a test board
      testBoardId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO boards (id, name, description, archived, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          testBoardId,
          'Test Board',
          'Test Description',
          false,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );

      // Add columns to the board
      const columns = ['To Do', 'In Progress', 'Done'];
      for (let i = 0; i < columns.length; i++) {
        await dbConnection.execute(
          `INSERT INTO columns (id, board_id, name, position, created_at) 
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), testBoardId, columns[i], i, new Date().toISOString()]
        );
      }
    });

    it('should retrieve a board by ID with columns', async () => {
      const response = await request(app)
        .get(`/api/v1/boards/${testBoardId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testBoardId,
        name: 'Test Board',
        description: 'Test Description',
        isArchived: false,
      });
      expect(response.body.data.columns).toHaveLength(3);
      expect(response.body.data.columns.map((col: any) => col.name)).toEqual([
        'To Do',
        'In Progress',
        'Done',
      ]);
    });

    it('should return 404 for non-existent board', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .get(`/api/v1/boards/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).get(`/api/v1/boards/${testBoardId}`).expect(401);
    });
  });

  describe('PUT /api/v1/boards/:id', () => {
    let testBoardId: string;

    beforeEach(async () => {
      // Create a test board
      testBoardId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO boards (id, name, description, archived, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          testBoardId,
          'Original Board',
          'Original Description',
          false,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    });

    it('should update a board with valid data', async () => {
      const updateData = {
        name: 'Updated Board',
        description: 'Updated Description',
        isArchived: true,
      };

      const response = await request(app)
        .put(`/api/v1/boards/${testBoardId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testBoardId,
        name: updateData.name,
        description: updateData.description,
        isArchived: updateData.isArchived,
      });
    });

    it('should partially update a board', async () => {
      const updateData = {
        name: 'Partially Updated Board',
      };

      const response = await request(app)
        .put(`/api/v1/boards/${testBoardId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.description).toBe('Original Description'); // Should remain unchanged
      expect(response.body.data.isArchived).toBe(false); // Should remain unchanged
    });

    it('should return 404 for non-existent board', async () => {
      const nonExistentId = uuidv4();
      const updateData = { name: 'Updated Board' };

      const response = await request(app)
        .put(`/api/v1/boards/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject invalid board name', async () => {
      const updateData = {
        name: '', // Empty name is invalid
      };

      const response = await request(app)
        .put(`/api/v1/boards/${testBoardId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('name');
    });

    it('should reject request without API key', async () => {
      const updateData = { name: 'Updated Board' };

      await request(app).put(`/api/v1/boards/${testBoardId}`).send(updateData).expect(401);
    });
  });

  describe('DELETE /api/v1/boards/:id', () => {
    let testBoardId: string;

    beforeEach(async () => {
      // Create a test board
      testBoardId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO boards (id, name, description, archived, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          testBoardId,
          'Board to Delete',
          'This board will be deleted',
          false,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    });

    it('should delete a board by ID', async () => {
      const response = await request(app)
        .delete(`/api/v1/boards/${testBoardId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');

      // Verify board is actually deleted
      await request(app).get(`/api/v1/boards/${testBoardId}`).set('X-API-Key', apiKey).expect(404);
    });

    it('should return 404 for non-existent board', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .delete(`/api/v1/boards/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).delete(`/api/v1/boards/${testBoardId}`).expect(401);
    });
  });

  describe('POST /api/v1/boards/:id/duplicate', () => {
    let testBoardId: string;

    beforeEach(async () => {
      // Create a test board with columns
      testBoardId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO boards (id, name, description, archived, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          testBoardId,
          'Original Board',
          'Original Description',
          false,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );

      // Add columns to the board
      const columns = ['To Do', 'In Progress', 'Done'];
      for (let i = 0; i < columns.length; i++) {
        await dbConnection.execute(
          `INSERT INTO columns (id, board_id, name, position, created_at) 
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), testBoardId, columns[i], i, new Date().toISOString()]
        );
      }
    });

    it('should duplicate a board with default name', async () => {
      const response = await request(app)
        .post(`/api/v1/boards/${testBoardId}/duplicate`)
        .set('X-API-Key', apiKey)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Original Board (Copy)');
      expect(response.body.data.description).toBe('Original Description');
      expect(response.body.data.isArchived).toBe(false);
      expect(response.body.data.id).not.toBe(testBoardId);
      expect(response.body.data.columns).toHaveLength(3);
    });

    it('should duplicate a board with custom name', async () => {
      const duplicateData = {
        name: 'Custom Duplicate Name',
      };

      const response = await request(app)
        .post(`/api/v1/boards/${testBoardId}/duplicate`)
        .set('X-API-Key', apiKey)
        .send(duplicateData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(duplicateData.name);
      expect(response.body.data.description).toBe('Original Description');
      expect(response.body.data.isArchived).toBe(false);
      expect(response.body.data.id).not.toBe(testBoardId);
      expect(response.body.data.columns).toHaveLength(3);
    });

    it('should return 404 for non-existent board', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .post(`/api/v1/boards/${nonExistentId}/duplicate`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).post(`/api/v1/boards/${testBoardId}/duplicate`).expect(401);
    });
  });

  describe('GET /api/v1/boards/:id/analytics', () => {
    let testBoardId: string;

    beforeEach(async () => {
      // Create a test board
      testBoardId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO boards (id, name, description, archived, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          testBoardId,
          'Analytics Board',
          'Board for analytics testing',
          false,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );

      // Add columns
      const columnId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO columns (id, board_id, name, position, created_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [columnId, testBoardId, 'To Do', 0, new Date().toISOString()]
      );

      // Add some tasks for analytics
      const tasks = [
        { title: 'Task 1', status: 'todo', priority: 5 },
        { title: 'Task 2', status: 'in_progress', priority: 7 },
        { title: 'Task 3', status: 'done', priority: 3 },
        { title: 'Task 4', status: 'done', priority: 8 },
      ];

      for (const task of tasks) {
        await dbConnection.execute(
          `INSERT INTO tasks (id, title, board_id, column_id, status, priority, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            task.title,
            testBoardId,
            columnId,
            task.status,
            task.priority,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }
    });

    it('should retrieve board analytics', async () => {
      const response = await request(app)
        .get(`/api/v1/boards/${testBoardId}/analytics`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalTasks');
      expect(response.body.data).toHaveProperty('tasksByStatus');
      expect(response.body.data).toHaveProperty('averagePriority');
      expect(response.body.data).toHaveProperty('recentActivity');
      expect(response.body.data.totalTasks).toBe(4);
    });

    it('should return 404 for non-existent board', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .get(`/api/v1/boards/${nonExistentId}/analytics`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).get(`/api/v1/boards/${testBoardId}/analytics`).expect(401);
    });
  });
});
