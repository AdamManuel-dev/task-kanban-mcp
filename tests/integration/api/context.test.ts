/**
 * API Integration Tests for Context Endpoints
 *
 * This test suite provides comprehensive coverage for all context-related REST API endpoints.
 * It tests AI context generation, task analysis, and error handling.
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';
import { v4 as uuidv4 } from 'uuid';
// import type { Task, Board } from '@/types';

describe('Context API Integration Tests', () => {
  let app: Express;
  let apiKey: string;
  let testBoardId: string;
  let testTaskId: string;

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
      [testBoardId, 'Test Board', 'Board for context testing', new Date().toISOString()]
    );

    // Create test column
    const testColumnId = uuidv4();
    await dbConnection.execute(
      'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
      [testColumnId, testBoardId, 'To Do', 0, new Date().toISOString()]
    );

    // Create test task
    testTaskId = uuidv4();
    await dbConnection.execute(
      `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testTaskId,
        'Test Task',
        'Task for context testing',
        testBoardId,
        testColumnId,
        'todo',
        5,
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  beforeEach(async () => {
    // Clean up context-related data before each test
    await dbConnection.execute('DELETE FROM notes WHERE task_id = ?', [testTaskId]);
  });

  describe('POST /api/v1/context/generate', () => {
    it('should generate context for a task', async () => {
      const contextRequest = {
        task_id: testTaskId,
        include_history: true,
        include_related: true,
      };

      const response = await request(app)
        .post('/api/v1/context/generate')
        .set('X-API-Key', apiKey)
        .send(contextRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        task_id: testTaskId,
        context: expect.any(String),
        generated_at: expect.any(String),
      });
    });

    it('should generate context with minimal parameters', async () => {
      const contextRequest = {
        task_id: testTaskId,
      };

      const response = await request(app)
        .post('/api/v1/context/generate')
        .set('X-API-Key', apiKey)
        .send(contextRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.task_id).toBe(testTaskId);
      expect(response.body.data.context).toBeDefined();
    });

    it('should return 404 for non-existent task', async () => {
      const nonExistentTaskId = uuidv4();
      const contextRequest = {
        task_id: nonExistentTaskId,
      };

      const response = await request(app)
        .post('/api/v1/context/generate')
        .set('X-API-Key', apiKey)
        .send(contextRequest)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      const contextRequest = {
        task_id: testTaskId,
      };

      await request(app).post('/api/v1/context/generate').send(contextRequest).expect(401);
    });

    it('should generate context with custom options', async () => {
      const contextRequest = {
        task_id: testTaskId,
        include_history: false,
        include_related: false,
        max_length: 500,
      };

      const response = await request(app)
        .post('/api/v1/context/generate')
        .set('X-API-Key', apiKey)
        .send(contextRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.context).toBeDefined();
    });
  });

  describe('POST /api/v1/context/analyze', () => {
    it('should analyze task context and provide insights', async () => {
      const analysisRequest = {
        task_id: testTaskId,
        analysis_type: 'comprehensive',
      };

      const response = await request(app)
        .post('/api/v1/context/analyze')
        .set('X-API-Key', apiKey)
        .send(analysisRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        task_id: testTaskId,
        analysis: expect.any(Object),
        insights: expect.any(Array),
        recommendations: expect.any(Array),
        generated_at: expect.any(String),
      });
    });

    it('should analyze task with specific focus areas', async () => {
      const analysisRequest = {
        task_id: testTaskId,
        analysis_type: 'focused',
        focus_areas: ['complexity', 'dependencies'],
      };

      const response = await request(app)
        .post('/api/v1/context/analyze')
        .set('X-API-Key', apiKey)
        .send(analysisRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.analysis).toBeDefined();
      expect(response.body.data.insights).toBeDefined();
    });

    it('should return 404 for non-existent task', async () => {
      const nonExistentTaskId = uuidv4();
      const analysisRequest = {
        task_id: nonExistentTaskId,
        analysis_type: 'comprehensive',
      };

      const response = await request(app)
        .post('/api/v1/context/analyze')
        .set('X-API-Key', apiKey)
        .send(analysisRequest)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      const analysisRequest = {
        task_id: testTaskId,
        analysis_type: 'comprehensive',
      };

      await request(app).post('/api/v1/context/analyze').send(analysisRequest).expect(401);
    });
  });

  describe('POST /api/v1/context/suggest', () => {
    it('should suggest improvements for a task', async () => {
      const suggestionRequest = {
        task_id: testTaskId,
        suggestion_type: 'improvements',
      };

      const response = await request(app)
        .post('/api/v1/context/suggest')
        .set('X-API-Key', apiKey)
        .send(suggestionRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        task_id: testTaskId,
        suggestions: expect.any(Array),
        reasoning: expect.any(String),
        generated_at: expect.any(String),
      });
    });

    it('should suggest task breakdown', async () => {
      const suggestionRequest = {
        task_id: testTaskId,
        suggestion_type: 'breakdown',
      };

      const response = await request(app)
        .post('/api/v1/context/suggest')
        .set('X-API-Key', apiKey)
        .send(suggestionRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.suggestions).toBeDefined();
      expect(response.body.data.reasoning).toBeDefined();
    });

    it('should suggest related tasks', async () => {
      const suggestionRequest = {
        task_id: testTaskId,
        suggestion_type: 'related',
      };

      const response = await request(app)
        .post('/api/v1/context/suggest')
        .set('X-API-Key', apiKey)
        .send(suggestionRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.suggestions).toBeDefined();
    });

    it('should return 404 for non-existent task', async () => {
      const nonExistentTaskId = uuidv4();
      const suggestionRequest = {
        task_id: nonExistentTaskId,
        suggestion_type: 'improvements',
      };

      const response = await request(app)
        .post('/api/v1/context/suggest')
        .set('X-API-Key', apiKey)
        .send(suggestionRequest)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      const suggestionRequest = {
        task_id: testTaskId,
        suggestion_type: 'improvements',
      };

      await request(app).post('/api/v1/context/suggest').send(suggestionRequest).expect(401);
    });
  });

  describe('GET /api/v1/context/:task_id', () => {
    it('should retrieve context for a task', async () => {
      const response = await request(app)
        .get(`/api/v1/context/${testTaskId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        task_id: testTaskId,
        context: expect.any(Object),
        last_generated: expect.any(String),
      });
    });

    it('should return 404 for non-existent task', async () => {
      const nonExistentTaskId = uuidv4();
      const response = await request(app)
        .get(`/api/v1/context/${nonExistentTaskId}`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).get(`/api/v1/context/${testTaskId}`).expect(401);
    });
  });

  describe('POST /api/v1/context/batch', () => {
    it('should generate context for multiple tasks', async () => {
      // Create additional test tasks
      const additionalTaskIds = [];
      const testColumnId = uuidv4();

      await dbConnection.execute(
        'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
        [testColumnId, testBoardId, 'In Progress', 1, new Date().toISOString()]
      );

      for (let i = 0; i < 3; i++) {
        const taskId = uuidv4();
        await dbConnection.execute(
          `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            taskId,
            `Batch Task ${i + 1}`,
            `Description for batch task ${i + 1}`,
            testBoardId,
            testColumnId,
            'todo',
            5,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
        additionalTaskIds.push(taskId);
      }

      const batchRequest = {
        task_ids: [testTaskId, ...additionalTaskIds],
        include_history: true,
        include_related: true,
      };

      const response = await request(app)
        .post('/api/v1/context/batch')
        .set('X-API-Key', apiKey)
        .send(batchRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(4);
      expect(
        response.body.data.every((item: any) => item.task_id && item.context && item.generated_at)
      ).toBe(true);
    });

    it('should handle partial failures in batch processing', async () => {
      const batchRequest = {
        task_ids: [testTaskId, 'non-existent-task-id'],
        include_history: true,
      };

      const response = await request(app)
        .post('/api/v1/context/batch')
        .set('X-API-Key', apiKey)
        .send(batchRequest)
        .expect(207); // Multi-status

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].success).toBe(true);
      expect(response.body.data[1].success).toBe(false);
    });

    it('should reject request without API key', async () => {
      const batchRequest = {
        task_ids: [testTaskId],
      };

      await request(app).post('/api/v1/context/batch').send(batchRequest).expect(401);
    });
  });

  describe('DELETE /api/v1/context/:task_id', () => {
    it('should clear context for a task', async () => {
      const response = await request(app)
        .delete(`/api/v1/context/${testTaskId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('cleared');
    });

    it('should return 404 for non-existent task', async () => {
      const nonExistentTaskId = uuidv4();
      const response = await request(app)
        .delete(`/api/v1/context/${nonExistentTaskId}`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).delete(`/api/v1/context/${testTaskId}`).expect(401);
    });
  });
});
