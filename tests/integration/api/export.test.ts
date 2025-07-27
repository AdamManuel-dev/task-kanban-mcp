/**
 * Export Routes Integration Tests
 *
 * @description Tests for data export REST API endpoints
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';
import { v4 as uuidv4 } from 'uuid';

describe('Export Routes Integration Tests', () => {
  let app: Express;
  let apiKey: string;
  let testBoardId: string;

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
    testBoardId = uuidv4();
    await dbConnection.execute(
      'INSERT INTO boards (id, name, description, created_at) VALUES (?, ?, ?, ?)',
      [testBoardId, 'Test Board', 'Board for export tests', new Date().toISOString()]
    );

    // Create test columns
    const columns = ['To Do', 'In Progress', 'Done'];
    await Promise.all(
      columns.map(async (column, i) => {
        const columnId = uuidv4();
        await dbConnection.execute(
          'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
          [columnId, testBoardId, column, i, new Date().toISOString()]
        );
        return columnId;
      })
    );

    // Create test tasks
    const taskId = uuidv4();
    await dbConnection.execute(
      'INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        taskId,
        'Test Task',
        'Test task description',
        testBoardId,
        (
          await dbConnection.queryOne('SELECT id FROM columns WHERE board_id = ? LIMIT 1', [
            testBoardId,
          ])
        )?.id,
        'todo',
        5,
        new Date().toISOString(),
      ]
    );
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  describe('GET /api/v1/export', () => {
    it('should export data to JSON format successfully', async () => {
      const response = await request(app)
        .get('/api/v1/export')
        .set('X-API-Key', apiKey)
        .query({
          format: 'json',
          includeBoards: true,
          includeTasks: true,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          boards: expect.any(Array),
          tasks: expect.any(Array),
          exportDate: expect.any(String),
          version: expect.any(String),
        }),
      });

      // Verify board data is included
      expect(response.body.data.boards).toHaveLength(1);
      expect(response.body.data.boards[0]).toMatchObject({
        id: testBoardId,
        name: 'Test Board',
        description: 'Board for export tests',
      });

      // Verify task data is included
      expect(response.body.data.tasks).toHaveLength(1);
      expect(response.body.data.tasks[0]).toMatchObject({
        title: 'Test Task',
        description: 'Test task description',
        board_id: testBoardId,
        status: 'todo',
        priority: 5,
      });
    });

    it('should export data to CSV format successfully', async () => {
      const response = await request(app)
        .get('/api/v1/export')
        .set('X-API-Key', apiKey)
        .query({
          format: 'csv',
          includeBoards: true,
          includeTasks: true,
        })
        .expect(200);

      // CSV responses should be file downloads
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('kanban-export.csv');
    });

    it('should filter by board IDs', async () => {
      const response = await request(app)
        .get('/api/v1/export')
        .set('X-API-Key', apiKey)
        .query({
          format: 'json',
          includeBoards: true,
          includeTasks: true,
          boardIds: [testBoardId],
        })
        .expect(200);

      expect(response.body.data.boards).toHaveLength(1);
      expect(response.body.data.boards[0].id).toBe(testBoardId);
    });

    it('should filter by task statuses', async () => {
      const response = await request(app)
        .get('/api/v1/export')
        .set('X-API-Key', apiKey)
        .query({
          format: 'json',
          includeTasks: true,
          taskStatuses: ['todo'],
        })
        .expect(200);

      expect(response.body.data.tasks).toHaveLength(1);
      expect(response.body.data.tasks[0].status).toBe('todo');
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const response = await request(app)
        .get('/api/v1/export')
        .set('X-API-Key', apiKey)
        .query({
          format: 'json',
          includeTasks: true,
          dateFrom: yesterday.toISOString(),
          dateTo: now.toISOString(),
        })
        .expect(200);

      expect(response.body.data.tasks).toHaveLength(1);
    });

    it('should return 400 for invalid format', async () => {
      const response = await request(app)
        .get('/api/v1/export')
        .set('X-API-Key', apiKey)
        .query({
          format: 'invalid',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid enum value'),
      });
    });

    it('should return 400 for invalid board ID', async () => {
      const response = await request(app)
        .get('/api/v1/export')
        .set('X-API-Key', apiKey)
        .query({
          format: 'json',
          boardIds: ['invalid-uuid'],
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid uuid'),
      });
    });
  });

  describe('GET /api/v1/export/anonymized', () => {
    it('should export anonymized data successfully', async () => {
      const response = await request(app)
        .get('/api/v1/export/anonymized')
        .set('X-API-Key', apiKey)
        .query({
          format: 'json',
          includeBoards: true,
          includeTasks: true,
          anonymizationOptions: {
            anonymizeUserData: true,
            anonymizeTaskTitles: true,
            anonymizeDescriptions: true,
            preserveStructure: true,
          },
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          boards: expect.any(Array),
          tasks: expect.any(Array),
          exportDate: expect.any(String),
          version: expect.any(String),
        }),
      });

      // Verify data is anonymized
      const board = response.body.data.boards[0];
      const task = response.body.data.tasks[0];

      // Board name and description should be anonymized
      expect(board.name).not.toBe('Test Board');
      expect(board.description).not.toBe('Board for export tests');

      // Task title and description should be anonymized
      expect(task.title).not.toBe('Test Task');
      expect(task.description).not.toBe('Test task description');
    });

    it('should preserve structure when requested', async () => {
      const response = await request(app)
        .get('/api/v1/export/anonymized')
        .set('X-API-Key', apiKey)
        .query({
          format: 'json',
          includeBoards: true,
          includeTasks: true,
          anonymizationOptions: {
            preserveStructure: true,
          },
        })
        .expect(200);

      // Should still have the same structure
      expect(response.body.data.boards).toHaveLength(1);
      expect(response.body.data.tasks).toHaveLength(1);
      expect(response.body.data.boards[0]).toHaveProperty('id');
      expect(response.body.data.boards[0]).toHaveProperty('name');
      expect(response.body.data.tasks[0]).toHaveProperty('title');
      expect(response.body.data.tasks[0]).toHaveProperty('description');
    });
  });

  describe('POST /api/v1/export/convert', () => {
    it('should convert format successfully', async () => {
      const response = await request(app)
        .post('/api/v1/export/convert')
        .set('X-API-Key', apiKey)
        .send({
          inputPath: '/tmp/test-input.json',
          outputFormat: 'csv',
          outputPath: '/tmp/test-output.csv',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'Format conversion completed successfully',
          outputPath: '/tmp/test-output.csv',
          format: 'csv',
        },
      });
    });

    it('should return 400 for invalid output format', async () => {
      const response = await request(app)
        .post('/api/v1/export/convert')
        .set('X-API-Key', apiKey)
        .send({
          inputPath: '/tmp/test-input.json',
          outputFormat: 'invalid',
          outputPath: '/tmp/test-output.csv',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid enum value'),
      });
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/export/convert')
        .set('X-API-Key', apiKey)
        .send({
          inputPath: '/tmp/test-input.json',
          // Missing outputFormat and outputPath
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Required'),
      });
    });
  });

  describe('POST /api/v1/import', () => {
    it('should return 501 not implemented', async () => {
      const response = await request(app)
        .post('/api/v1/import')
        .set('X-API-Key', apiKey)
        .send({
          format: 'json',
        })
        .expect(501);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Import functionality requires multer middleware',
        code: 'NOT_IMPLEMENTED',
      });
    });
  });

  describe('POST /api/v1/import/validate', () => {
    it('should return 501 not implemented', async () => {
      const response = await request(app)
        .post('/api/v1/import/validate')
        .set('X-API-Key', apiKey)
        .send({
          format: 'json',
        })
        .expect(501);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Import validation requires multer middleware',
        code: 'NOT_IMPLEMENTED',
      });
    });
  });

  describe('Authentication', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/v1/export')
        .query({
          format: 'json',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'API key required',
      });
    });

    it('should return 401 with invalid API key', async () => {
      const response = await request(app)
        .get('/api/v1/export')
        .set('X-API-Key', 'invalid-key')
        .query({
          format: 'json',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid API key',
      });
    });
  });
});
