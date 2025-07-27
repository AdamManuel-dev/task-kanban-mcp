/**
 * API Integration Tests for Notes Endpoints
 *
 * This test suite provides comprehensive coverage for all notes-related REST API endpoints.
 * It tests CRUD operations, filtering, sorting, pagination, and error handling.
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';
import { v4 as uuidv4 } from 'uuid';
import type { Note, CreateNoteRequest } from '@/types';

describe('Notes API Integration Tests', () => {
  let app: Express;
  let apiKey: string;
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

    // Create a test task for notes
    testTaskId = uuidv4();
    const testBoardId = uuidv4();
    const testColumnId = uuidv4();

    // Create test board
    await dbConnection.execute(
      'INSERT INTO boards (id, name, description, created_at) VALUES (?, ?, ?, ?)',
      [testBoardId, 'Test Board', 'Board for notes testing', new Date().toISOString()]
    );

    // Create test column
    await dbConnection.execute(
      'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
      [testColumnId, testBoardId, 'To Do', 0, new Date().toISOString()]
    );

    // Create test task
    await dbConnection.execute(
      `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testTaskId,
        'Test Task',
        'Task for notes testing',
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
    // Clean up notes before each test
    await dbConnection.execute('DELETE FROM notes');
  });

  describe('POST /api/v1/notes', () => {
    it('should create a new note with valid data', async () => {
      const newNote: CreateNoteRequest = {
        content: 'This is a test note',
        type: 'comment',
        task_id: testTaskId,
      };

      const response = await request(app)
        .post('/api/v1/notes')
        .set('X-API-Key', apiKey)
        .send(newNote)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        content: newNote.content,
        type: newNote.type,
        task_id: newNote.task_id,
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.createdAt).toBeDefined();
    });

    it('should create a note with minimal required fields', async () => {
      const minimalNote = {
        content: 'Minimal note content',
        task_id: testTaskId,
      };

      const response = await request(app)
        .post('/api/v1/notes')
        .set('X-API-Key', apiKey)
        .send(minimalNote)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(minimalNote.content);
      expect(response.body.data.type).toBe('comment'); // Default type
      expect(response.body.data.task_id).toBe(testTaskId);
    });

    it('should reject note creation with empty content', async () => {
      const invalidNote = {
        content: '',
        task_id: testTaskId,
      };

      const response = await request(app)
        .post('/api/v1/notes')
        .set('X-API-Key', apiKey)
        .send(invalidNote)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('content');
    });

    it('should reject note creation with invalid task_id', async () => {
      const invalidNote = {
        content: 'Test note',
        task_id: 'non-existent-task',
      };

      const response = await request(app)
        .post('/api/v1/notes')
        .set('X-API-Key', apiKey)
        .send(invalidNote)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('task_id');
    });

    it('should reject note creation without API key', async () => {
      const newNote = {
        content: 'Test note',
        task_id: testTaskId,
      };

      await request(app).post('/api/v1/notes').send(newNote).expect(401);
    });

    it('should create note with different types', async () => {
      const noteTypes = ['comment', 'bug', 'feature', 'improvement'];

      for (const type of noteTypes) {
        const noteData = {
          content: `Note of type ${type}`,
          type,
          task_id: testTaskId,
        };

        const response = await request(app)
          .post('/api/v1/notes')
          .set('X-API-Key', apiKey)
          .send(noteData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.type).toBe(type);
      }
    });
  });

  describe('GET /api/v1/notes', () => {
    beforeEach(async () => {
      // Create test notes
      const notes = [
        {
          id: uuidv4(),
          content: 'First test note',
          type: 'comment',
          task_id: testTaskId,
        },
        {
          id: uuidv4(),
          content: 'Second test note',
          type: 'bug',
          task_id: testTaskId,
        },
        {
          id: uuidv4(),
          content: 'Third test note',
          type: 'feature',
          task_id: testTaskId,
        },
      ];

      for (const note of notes) {
        await dbConnection.execute(
          `INSERT INTO notes (id, content, type, task_id, created_at) 
           VALUES (?, ?, ?, ?, ?)`,
          [note.id, note.content, note.type, note.task_id, new Date().toISOString()]
        );
      }
    });

    it('should list all notes with default pagination', async () => {
      const response = await request(app).get('/api/v1/notes').set('X-API-Key', apiKey).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 50,
        total: 3,
        totalPages: 1,
      });
    });

    it('should filter notes by task_id', async () => {
      const response = await request(app)
        .get(`/api/v1/notes?task_id=${testTaskId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data.every((note: Note) => note.task_id === testTaskId)).toBe(true);
    });

    it('should filter notes by type', async () => {
      const response = await request(app)
        .get('/api/v1/notes?type=comment')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].type).toBe('comment');
    });

    it('should search notes by content', async () => {
      const response = await request(app)
        .get('/api/v1/notes?search=First')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].content).toBe('First test note');
    });

    it('should sort notes by creation date', async () => {
      const response = await request(app)
        .get('/api/v1/notes?sortBy=created_at&sortOrder=desc')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      // Should be sorted by creation date descending
      const dates = response.body.data.map((note: Note) => new Date(note.createdAt));
      expect(dates[0] >= dates[1]).toBe(true);
      expect(dates[1] >= dates[2]).toBe(true);
    });

    it('should apply pagination', async () => {
      const response = await request(app)
        .get('/api/v1/notes?limit=2&offset=0')
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
      await request(app).get('/api/v1/notes').expect(401);
    });
  });

  describe('GET /api/v1/notes/:id', () => {
    let testNoteId: string;

    beforeEach(async () => {
      // Create a test note
      testNoteId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO notes (id, content, type, task_id, created_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [testNoteId, 'Test Note', 'comment', testTaskId, new Date().toISOString()]
      );
    });

    it('should retrieve a note by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/notes/${testNoteId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testNoteId,
        content: 'Test Note',
        type: 'comment',
        task_id: testTaskId,
      });
    });

    it('should return 404 for non-existent note', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .get(`/api/v1/notes/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).get(`/api/v1/notes/${testNoteId}`).expect(401);
    });
  });

  describe('PUT /api/v1/notes/:id', () => {
    let testNoteId: string;

    beforeEach(async () => {
      // Create a test note
      testNoteId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO notes (id, content, type, task_id, created_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [testNoteId, 'Original Note', 'comment', testTaskId, new Date().toISOString()]
      );
    });

    it('should update a note with valid data', async () => {
      const updateData = {
        content: 'Updated Note Content',
        type: 'bug',
      };

      const response = await request(app)
        .put(`/api/v1/notes/${testNoteId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: testNoteId,
        content: updateData.content,
        type: updateData.type,
        task_id: testTaskId,
      });
    });

    it('should partially update a note', async () => {
      const updateData = {
        content: 'Partially Updated Content',
      };

      const response = await request(app)
        .put(`/api/v1/notes/${testNoteId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(updateData.content);
      expect(response.body.data.type).toBe('comment'); // Should remain unchanged
    });

    it('should return 404 for non-existent note', async () => {
      const nonExistentId = uuidv4();
      const updateData = { content: 'Updated Content' };

      const response = await request(app)
        .put(`/api/v1/notes/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject invalid note content', async () => {
      const updateData = {
        content: '', // Empty content is invalid
      };

      const response = await request(app)
        .put(`/api/v1/notes/${testNoteId}`)
        .set('X-API-Key', apiKey)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('content');
    });

    it('should reject request without API key', async () => {
      const updateData = { content: 'Updated Content' };

      await request(app).put(`/api/v1/notes/${testNoteId}`).send(updateData).expect(401);
    });
  });

  describe('DELETE /api/v1/notes/:id', () => {
    let testNoteId: string;

    beforeEach(async () => {
      // Create a test note
      testNoteId = uuidv4();
      await dbConnection.execute(
        `INSERT INTO notes (id, content, type, task_id, created_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [testNoteId, 'Note to Delete', 'comment', testTaskId, new Date().toISOString()]
      );
    });

    it('should delete a note by ID', async () => {
      const response = await request(app)
        .delete(`/api/v1/notes/${testNoteId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');

      // Verify note is actually deleted
      await request(app).get(`/api/v1/notes/${testNoteId}`).set('X-API-Key', apiKey).expect(404);
    });

    it('should return 404 for non-existent note', async () => {
      const nonExistentId = uuidv4();
      const response = await request(app)
        .delete(`/api/v1/notes/${nonExistentId}`)
        .set('X-API-Key', apiKey)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject request without API key', async () => {
      await request(app).delete(`/api/v1/notes/${testNoteId}`).expect(401);
    });
  });

  describe('GET /api/v1/notes/search', () => {
    beforeEach(async () => {
      // Create test notes with varied content
      const notes = [
        {
          id: uuidv4(),
          content: 'This is a bug report about authentication',
          type: 'bug',
          task_id: testTaskId,
        },
        {
          id: uuidv4(),
          content: 'Feature request for new dashboard',
          type: 'feature',
          task_id: testTaskId,
        },
        {
          id: uuidv4(),
          content: 'General comment about the project',
          type: 'comment',
          task_id: testTaskId,
        },
        {
          id: uuidv4(),
          content: 'Another bug in the authentication system',
          type: 'bug',
          task_id: testTaskId,
        },
      ];

      for (const note of notes) {
        await dbConnection.execute(
          `INSERT INTO notes (id, content, type, task_id, created_at) 
           VALUES (?, ?, ?, ?, ?)`,
          [note.id, note.content, note.type, note.task_id, new Date().toISOString()]
        );
      }
    });

    it('should search notes by content', async () => {
      const response = await request(app)
        .get('/api/v1/notes/search?q=authentication')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(
        response.body.data.every((note: Note) =>
          note.content.toLowerCase().includes('authentication')
        )
      ).toBe(true);
    });

    it('should search notes with type filter', async () => {
      const response = await request(app)
        .get('/api/v1/notes/search?q=bug&type=bug')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((note: Note) => note.type === 'bug')).toBe(true);
    });

    it('should search notes with task filter', async () => {
      const response = await request(app)
        .get(`/api/v1/notes/search?q=bug&task_id=${testTaskId}`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((note: Note) => note.task_id === testTaskId)).toBe(true);
    });

    it('should return empty results for no matches', async () => {
      const response = await request(app)
        .get('/api/v1/notes/search?q=nonexistent')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should reject request without API key', async () => {
      await request(app).get('/api/v1/notes/search?q=test').expect(401);
    });
  });
});
