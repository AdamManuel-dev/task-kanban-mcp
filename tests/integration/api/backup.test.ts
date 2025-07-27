/**
 * Backup Routes Integration Tests
 *
 * @description Tests for backup management REST API endpoints
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';
import { BackupService } from '@/services/BackupService';
// import { v4 as uuidv4 } from 'uuid';

describe('Backup Routes Integration Tests', () => {
  let app: Express;
  let apiKey: string;
  let backupService: BackupService;
  let testBackupId: string;

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

    // Initialize backup service
    backupService = new BackupService(dbConnection);

    // Ensure backup directory exists
    await backupService.ensureBackupDirectory();
  });

  afterAll(async () => {
    // Clean up test backups
    if (testBackupId) {
      try {
        await backupService.deleteBackup(testBackupId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Close database connection
    await dbConnection.close();
  });

  describe('POST /api/backup/create', () => {
    it('should create a full backup successfully', async () => {
      const response = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Test Full Backup',
          description: 'Integration test backup',
          type: 'full',
          compress: true,
          verify: true,
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
          name: 'Test Full Backup',
          description: 'Integration test backup',
          type: 'full',
          status: 'completed',
          size: expect.any(Number),
          compressed: true,
          verified: true,
          checksum: expect.any(String),
          filePath: expect.any(String),
          createdAt: expect.any(String),
          completedAt: expect.any(String),
        },
      });

      testBackupId = response.body.data.id;
    });

    it('should create an incremental backup successfully', async () => {
      const response = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Test Incremental Backup',
          description: 'Integration test incremental backup',
          type: 'incremental',
          parentBackupId: testBackupId,
          compress: true,
          verify: true,
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
          name: 'Test Incremental Backup',
          description: 'Integration test incremental backup',
          type: 'incremental',
          status: 'completed',
          parentBackupId: testBackupId,
          size: expect.any(Number),
          compressed: true,
          verified: true,
          checksum: expect.any(String),
          filePath: expect.any(String),
          createdAt: expect.any(String),
          completedAt: expect.any(String),
        },
      });
    });

    it('should return 400 for invalid backup type', async () => {
      const response = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          type: 'invalid',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid enum value'),
      });
    });

    it('should return 400 for incremental backup without parent', async () => {
      const response = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          type: 'incremental',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('parentBackupId'),
      });
    });
  });

  describe('GET /api/backup/list', () => {
    it('should list backups successfully', async () => {
      const response = await request(app)
        .get('/api/backup/list')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            type: expect.stringMatching(/^(full|incremental)$/),
            status: expect.stringMatching(/^(pending|in_progress|completed|failed|corrupted)$/),
            size: expect.any(Number),
            compressed: expect.any(Boolean),
            verified: expect.any(Boolean),
            checksum: expect.any(String),
            filePath: expect.any(String),
            createdAt: expect.any(String),
          }),
        ]),
      });
    });

    it('should filter backups by type', async () => {
      const response = await request(app)
        .get('/api/backup/list?type=full')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'full',
          }),
        ]),
      });

      // Verify all returned backups are full type
      response.body.data.forEach((backup: any) => {
        expect(backup.type).toBe('full');
      });
    });

    it('should paginate backups correctly', async () => {
      const response = await request(app)
        .get('/api/backup/list?limit=1&offset=0')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });

      expect(response.body.data.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /api/backup/:id', () => {
    it('should get backup metadata successfully', async () => {
      const response = await request(app)
        .get(`/api/backup/${testBackupId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testBackupId,
          name: 'Test Full Backup',
          description: 'Integration test backup',
          type: 'full',
          status: 'completed',
          size: expect.any(Number),
          compressed: true,
          verified: true,
          checksum: expect.any(String),
          filePath: expect.any(String),
          createdAt: expect.any(String),
          completedAt: expect.any(String),
        },
      });
    });

    it('should return 404 for non-existent backup', async () => {
      const response = await request(app)
        .get('/api/backup/non-existent-id')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Backup not found',
      });
    });
  });

  describe('POST /api/backup/:id/verify', () => {
    it('should verify backup successfully', async () => {
      const response = await request(app)
        .post(`/api/backup/${testBackupId}/verify`)
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          isValid: true,
          checksum: expect.any(String),
          fileExists: true,
        },
      });
    });

    it('should return 404 for non-existent backup', async () => {
      const response = await request(app)
        .post('/api/backup/non-existent-id/verify')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Backup not found',
      });
    });
  });

  describe('POST /api/backup/:id/validate', () => {
    it('should validate restore options successfully', async () => {
      const response = await request(app)
        .post(`/api/backup/${testBackupId}/validate`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          verify: true,
          preserveExisting: false,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          isValid: true,
          tableChecks: expect.any(Array),
          errors: expect.any(Array),
        },
      });
    });

    it('should return 404 for non-existent backup', async () => {
      const response = await request(app)
        .post('/api/backup/non-existent-id/validate')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          verify: true,
        })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Backup not found',
      });
    });
  });

  describe('POST /api/backup/integrity-check', () => {
    it('should perform data integrity check successfully', async () => {
      const response = await request(app)
        .post('/api/backup/integrity-check')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          isPassed: expect.any(Boolean),
          checks: expect.arrayContaining([
            expect.objectContaining({
              name: expect.any(String),
              passed: expect.any(Boolean),
              message: expect.any(String),
            }),
          ]),
        },
      });
    });
  });

  describe('GET /api/backup/:id/export', () => {
    it('should export backup data successfully', async () => {
      const response = await request(app)
        .get(`/api/backup/${testBackupId}/export`)
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          backupId: testBackupId,
          content: expect.any(String),
          size: expect.any(Number),
          checksum: expect.any(String),
        },
      });

      // Verify the exported content is valid SQL
      expect(response.body.data.content).toContain('-- Backup Export');
      expect(response.body.data.content).toContain('CREATE TABLE');
    });

    it('should return 404 for non-existent backup', async () => {
      const response = await request(app)
        .get('/api/backup/non-existent-id/export')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Backup not found',
      });
    });
  });

  describe('POST /api/backup/:id/restore-partial', () => {
    it('should validate partial restore options', async () => {
      const response = await request(app)
        .post(`/api/backup/${testBackupId}/restore-partial`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          tables: ['boards', 'tasks'],
          includeSchema: true,
          preserveExisting: false,
          validateAfter: true,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: expect.stringContaining('Partial restore validation'),
          tables: expect.arrayContaining(['boards', 'tasks']),
        },
      });
    });

    it('should return 400 for empty tables array', async () => {
      const response = await request(app)
        .post(`/api/backup/${testBackupId}/restore-partial`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          tables: [],
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('tables'),
      });
    });
  });

  describe('POST /api/backup/:id/restore-with-progress', () => {
    it('should start restore with progress tracking', async () => {
      const response = await request(app)
        .post(`/api/backup/${testBackupId}/restore-with-progress`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          verify: true,
          preserveExisting: false,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          progressId: expect.any(String),
          message: expect.stringContaining('Restore started'),
        },
      });
    });
  });

  describe('GET /api/backup/progress/:progressId', () => {
    it('should get restore progress', async () => {
      // First start a restore
      const startResponse = await request(app)
        .post(`/api/backup/${testBackupId}/restore-with-progress`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          verify: true,
          preserveExisting: false,
        })
        .expect(200);

      const { progressId } = startResponse.body.data;

      // Then check progress
      const response = await request(app)
        .get(`/api/backup/progress/${progressId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: progressId,
          totalSteps: expect.any(Number),
          currentStep: expect.any(Number),
          progress: expect.any(Number),
          message: expect.any(String),
          updatedAt: expect.any(String),
        },
      });
    });

    it('should return 404 for non-existent progress', async () => {
      const response = await request(app)
        .get('/api/backup/progress/non-existent-id')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Progress not found',
      });
    });
  });

  describe('DELETE /api/backup/progress/:progressId', () => {
    it('should clear restore progress', async () => {
      // First start a restore
      const startResponse = await request(app)
        .post(`/api/backup/${testBackupId}/restore-with-progress`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          verify: true,
          preserveExisting: false,
        })
        .expect(200);

      const { progressId } = startResponse.body.data;

      // Then clear progress
      const response = await request(app)
        .delete(`/api/backup/progress/${progressId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: expect.stringContaining('Progress cleared'),
        },
      });
    });
  });

  describe('DELETE /api/backup/:id', () => {
    it('should delete backup successfully', async () => {
      // Create a backup to delete
      const createResponse = await request(app)
        .post('/api/backup/create')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Backup to Delete',
          type: 'full',
        })
        .expect(201);

      const backupId = createResponse.body.data.id;

      // Delete the backup
      const response = await request(app)
        .delete(`/api/backup/${backupId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: expect.stringContaining('Backup deleted'),
        },
      });

      // Verify backup is deleted
      await request(app)
        .get(`/api/backup/${backupId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(404);
    });

    it('should return 404 for non-existent backup', async () => {
      const response = await request(app)
        .delete('/api/backup/non-existent-id')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Backup not found',
      });
    });
  });

  describe('Authentication', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app).get('/api/backup/list').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'API key required',
      });
    });

    it('should return 401 with invalid API key', async () => {
      const response = await request(app)
        .get('/api/backup/list')
        .set('Authorization', 'Bearer invalid-key')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid API key',
      });
    });
  });
});
