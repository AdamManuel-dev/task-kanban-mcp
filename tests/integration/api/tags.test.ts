/**
 * API Integration Tests for Tags Endpoints
 *
 * This test suite provides comprehensive coverage for all tags-related REST API endpoints.
 * It tests CRUD operations, filtering, sorting, pagination, and error handling.
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';
import { v4 as uuidv4 } from 'uuid';
import type { Tag, CreateTagRequest } from '@/types';

describe('Tags API Integration Tests', () => {
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
    // Clean up tags before each test
    await dbConnection.execute('DELETE FROM tags');
  });

  describe('POST /api/v1/tags', () => {
    it('should create a new tag with valid data', async () => {
      const newTag: CreateTagRequest = {
        name: 'Test Tag',
        description: 'This is a test tag',
        color: '#ff0000',
      };

      const response = await request(app)
        .post('/api/v1/tags')
        .set('X-API-Key', apiKey)
        .send(newTag)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: newTag.name,
        description: newTag.description,
        color: newTag.color,
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.createdAt).toBeDefined();
    });

    it('should create a tag with minimal required fields', async () => {
      const minimalTag = {
        name: 'Minimal Tag',
      };

      const response = await request(app)
        .post('/api/v1/tags')
        .set('X-API-Key', apiKey)
        .send(minimalTag)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(minimalTag.name);
      expect(response.body.data.description).toBe(''); // Default empty description
      expect(response.body.data.color).toBe('#3b82f6'); // Default color
    });

    it('should reject tag creation with empty name', async () => {
      const invalidTag = {
        name: '',
        description: 'Invalid tag',
      };

      const response = await request(app)
        .post('/api/v1/tags')
        .set('X-API-Key', apiKey)
        .send(invalidTag)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('name');
    });

    it('should reject tag creation with duplicate name', async () => {
      // Create first tag
      const firstTag = {
        name: 'Duplicate Tag',
        description: 'First tag',
      };

      await request(app).post('/api/v1/tags').set('X-API-Key', apiKey).send(firstTag).expect(201);

      // Try to create duplicate
      const duplicateTag = {
        name: 'Duplicate Tag',
        description: 'Second tag with same name',
      };

      const response = await request(app)
        .post('/api/v1/tags')
        .set('X-API-Key', apiKey)
        .send(duplicateTag)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    it('should reject tag creation without API key', async () => {
      const newTag = {
        name: 'Test Tag',
        description: 'This is a test tag',
      };

      await request(app).post('/api/v1/tags').send(newTag).expect(401);
    });

    it('should create tag with custom color', async () => {
      const customTag = {
        name: 'Custom Color Tag',
        description: 'Tag with custom color',
        color: '#00ff00',
      };

      const response = await request(app)
        .post('/api/v1/tags')
        .set('X-API-Key', apiKey)
        .send(customTag)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.color).toBe(customTag.color);
    });
  });

  describe('GET /api/v1/tags', () => {
    beforeEach(async () => {
      // Create test tags
      const tags = [
        {
          id: uuidv4(),
          name: 'Bug',
          description: 'Bug-related tasks',
          color: '#ef4444',
        },
        {
          id: uuidv4(),
          name: 'Feature',
          description: 'Feature requests',
          color: '#10b981',
        },
        {
          id: uuidv4(),
          name: 'Documentation',
          description: 'Documentation tasks',
          color: '#3b82f6',
        },
        {
          id: uuidv4(),
          name: 'Urgent',
          description: 'Urgent tasks',
          color: '#f59e0b',
        },
      ];

      for (const tag of tags) {
        await dbConnection.execute(
          `INSERT INTO tags (id, name, description, color, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            tag.id,
            tag.name,
            tag.description,
            tag.color,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }
    });

    it('should list all tags with default pagination', async () => {
      const response = await request(app).get('/api/v1/tags').set('X-API-Key', apiKey).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(4);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 50,
        total: 4,
        totalPages: 1,
      });
    });

    it('should search tags by name', async () => {
      const response = await request(app)
        .get('/api/v1/tags?search=Bug')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Bug');
    });

    it('should search tags by description', async () => {
      const response = await request(app)
        .get('/api/v1/tags?search=Feature requests')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Feature');
    });

    it('should sort tags by name', async () => {
      const response = await request(app)
        .get('/api/v1/tags?sortBy=name&sortOrder=asc')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(4);
      expect(response.body.data[0].name).toBe('Bug');
      expect(response.body.data[1].name).toBe('Documentation');
      expect(response.body.data[2].name).toBe('Feature');
      expect(response.body.data[3].name).toBe('Urgent');
    });

    it('should apply pagination', async () => {
      const response = await request(app)
        .get('/api/v1/tags?limit=2&offset=0')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 2,
        total: 4,
        totalPages: 2,
      });
    });

    it('should reject request without API key', async () => {
      await request(app).get('/api/v1/tags').expect(401);
    });
  });

  describe('GET /api/v1/tags/:id', () => {
    let testTagId: string;

    beforeEach(async () => {
      // Create a test tag
      testTagId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tags (id, name, description, color, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          testTagId,
          'Test Tag',
          'Test Description',
          '#ff0000',
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    });

    it('should retrieve a tag by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/tags/${testTagId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testTagId,
        name: 'Test Tag',
        description: 'Test Description',
        color: '#ff0000',
      });
    });

    it('should return 404 for non-existent tag', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .get(`/api/v1/tags/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).get(`/api/v1/tags/${testTagId}`).expect(401);
    });
  });

  describe('PUT /api/v1/tags/:id', () => {
    let testTagId: string;

    beforeEach(async () => {
      // Create a test tag
      testTagId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tags (id, name, description, color, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          testTagId,
          'Original Tag',
          'Original Description',
          '#ff0000',
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    });

    it('should update a tag with valid data', async () => {
      const updateData = {
        name: 'Updated Tag',
        description: 'Updated Description',
        color: '#00ff00',
      };

      const response = await request(app)
        .put(`/api/v1/tags/${testTagId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testTagId,
        name: updateData.name,
        description: updateData.description,
        color: updateData.color,
      });
    });

    it('should partially update a tag', async () => {
      const updateData = {
        name: 'Partially Updated Tag',
      };

      const response = await request(app)
        .put(`/api/v1/tags/${testTagId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.description).toBe('Original Description'); // Should remain unchanged
      expect(response.body.data.color).toBe('#ff0000'); // Should remain unchanged
    });

    it('should return 404 for non-existent tag', async () => {
      const nonExistentId = uuidv4();
      const updateData = { name: 'Updated Tag' };

      const response = await request(app)
        .put(`/api/v1/tags/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject invalid tag name', async () => {
      const updateData = {
        name: '', // Empty name is invalid
      };

      const response = await request(app)
        .put(`/api/v1/tags/${testTagId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('name');
    });

    it('should reject request without API key', async () => {
      const updateData = { name: 'Updated Tag' };

      await request(app).put(`/api/v1/tags/${testTagId}`).send(updateData).expect(401);
    });
  });

  describe('DELETE /api/v1/tags/:id', () => {
    let testTagId: string;

    beforeEach(async () => {
      // Create a test tag
      testTagId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tags (id, name, description, color, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          testTagId,
          'Tag to Delete',
          'This tag will be deleted',
          '#ff0000',
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    });

    it('should delete a tag by ID', async () => {
      const response = await request(app)
        .delete(`/api/v1/tags/${testTagId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');

      // Verify tag is actually deleted
      await request(app).get(`/api/v1/tags/${testTagId}`).set('X-API-Key', apiKey).expect(404);
    });

    it('should return 404 for non-existent tag', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .delete(`/api/v1/tags/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).delete(`/api/v1/tags/${testTagId}`).expect(401);
    });
  });

  describe('GET /api/v1/tags/search', () => {
    beforeEach(async () => {
      // Create test tags with varied content
      const tags = [
        {
          id: uuidv4(),
          name: 'Authentication Bug',
          description: 'Bugs related to authentication system',
          color: '#ef4444',
        },
        {
          id: uuidv4(),
          name: 'UI Feature',
          description: 'New UI features and improvements',
          color: '#10b981',
        },
        {
          id: uuidv4(),
          name: 'API Documentation',
          description: 'API documentation updates',
          color: '#3b82f6',
        },
        {
          id: uuidv4(),
          name: 'Security Bug',
          description: 'Security-related bugs and vulnerabilities',
          color: '#ef4444',
        },
      ];

      for (const tag of tags) {
        await dbConnection.execute(
          `INSERT INTO tags (id, name, description, color, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            tag.id,
            tag.name,
            tag.description,
            tag.color,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }
    });

    it('should search tags by name', async () => {
      const response = await request(app)
        .get('/api/v1/tags/search?q=Authentication')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Authentication Bug');
    });

    it('should search tags by description', async () => {
      const response = await request(app)
        .get('/api/v1/tags/search?q=security')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Security Bug');
    });

    it('should search tags with color filter', async () => {
      const response = await request(app)
        .get('/api/v1/tags/search?q=bug&color=%23ef4444')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((tag: Tag) => tag.color === '#ef4444')).toBe(true);
    });

    it('should return empty results for no matches', async () => {
      const response = await request(app)
        .get('/api/v1/tags/search?q=nonexistent')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should reject request without API key', async () => {
      await request(app).get('/api/v1/tags/search?q=test').expect(401);
    });
  });

  describe('POST /api/v1/tags/:id/tasks', () => {
    let testTagId: string;
    let testTaskId: string;

    beforeEach(async () => {
      // Create a test tag
      testTagId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO tags (id, name, description, color, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          testTagId,
          'Test Tag',
          'Test Description',
          '#ff0000',
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );

      // Create a test task
      testTaskId = uuidv4();
      const testBoardId = uuidv4();
      const testColumnId = uuidv4();

      await dbConnection.execute(
        'INSERT INTO boards (id, name, description, created_at) VALUES (?, ?, ?, ?)',
        [testBoardId, 'Test Board', 'Board for tag testing', new Date().toISOString()]
      );

      await dbConnection.execute(
        'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
        [testColumnId, testBoardId, 'To Do', 0, new Date().toISOString()]
      );

      await dbConnection.execute(
        `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          testTaskId,
          'Test Task',
          'Task for tag testing',
          testBoardId,
          testColumnId,
          'todo',
          5,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    });

    it('should associate a tag with a task', async () => {
      const response = await request(app)
        .post(`/api/v1/tags/${testTagId}/tasks`)
        .set('X-API-Key', apiKey)
        .send({ task_id: testTaskId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('associated');
    });

    it('should return 404 for non-existent tag', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .post(`/api/v1/tags/${nonExistentId}/tasks`)
        .set('X-API-Key', apiKey)
        .send({ task_id: testTaskId })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should return 404 for non-existent task', async () => {
      const nonExistentTaskId = uuidv4();
      const response = await request(app)
        .post(`/api/v1/tags/${testTagId}/tasks`)
        .set('X-API-Key', apiKey)
        .send({ task_id: nonExistentTaskId })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app)
        .post(`/api/v1/tags/${testTagId}/tasks`)
        .send({ task_id: testTaskId })
        .expect(401);
    });
  });
});
