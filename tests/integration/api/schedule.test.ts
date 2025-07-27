/**
 * Schedule Routes Integration Tests
 *
 * @description Tests for backup scheduling REST API endpoints
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';
// import { v4 as uuidv4 } from 'uuid';

describe('Schedule Routes Integration Tests', () => {
  let app: Express;
  let apiKey: string;
  let testScheduleId: string;

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

  describe('POST /api/schedule/create', () => {
    it('should create a schedule successfully', async () => {
      const response = await request(app)
        .post('/api/schedule/create')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Test Schedule',
          description: 'Test backup schedule',
          cronExpression: '0 2 * * *', // Daily at 2 AM
          backupType: 'full',
          enabled: true,
          retentionDays: 30,
          compressionEnabled: true,
          verificationEnabled: true,
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
          name: 'Test Schedule',
          description: 'Test backup schedule',
          cronExpression: '0 2 * * *',
          backupType: 'full',
          enabled: true,
          retentionDays: 30,
          compressionEnabled: true,
          verificationEnabled: true,
          nextRun: expect.any(String),
          lastRun: null,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      });

      testScheduleId = response.body.data.id;
    });

    it('should create an incremental schedule successfully', async () => {
      const response = await request(app)
        .post('/api/schedule/create')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Test Incremental Schedule',
          description: 'Test incremental backup schedule',
          cronExpression: '0 3 * * *', // Daily at 3 AM
          backupType: 'incremental',
          enabled: true,
          retentionDays: 7,
          compressionEnabled: true,
          verificationEnabled: false,
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          name: 'Test Incremental Schedule',
          description: 'Test incremental backup schedule',
          cronExpression: '0 3 * * *',
          backupType: 'incremental',
          enabled: true,
          retentionDays: 7,
          compressionEnabled: true,
          verificationEnabled: false,
        },
      });
    });

    it('should return 400 for invalid cron expression', async () => {
      const response = await request(app)
        .post('/api/schedule/create')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Invalid Schedule',
          cronExpression: 'invalid cron',
          backupType: 'full',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid cron expression'),
      });
    });

    it('should return 400 for invalid backup type', async () => {
      const response = await request(app)
        .post('/api/schedule/create')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Invalid Schedule',
          cronExpression: '0 2 * * *',
          backupType: 'invalid',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid enum value'),
      });
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/schedule/create')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Incomplete Schedule',
          // Missing cronExpression and backupType
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Required'),
      });
    });
  });

  describe('GET /api/schedule/list', () => {
    it('should list schedules successfully', async () => {
      const response = await request(app)
        .get('/api/schedule/list')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            cronExpression: expect.any(String),
            backupType: expect.stringMatching(/^(full|incremental)$/),
            enabled: expect.any(Boolean),
            retentionDays: expect.any(Number),
            compressionEnabled: expect.any(Boolean),
            verificationEnabled: expect.any(Boolean),
            nextRun: expect.any(String),
            lastRun: expect.anything(),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          }),
        ]),
      });
    });

    it('should filter by enabled status', async () => {
      const response = await request(app)
        .get('/api/schedule/list?enabled=true')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });

      // Verify all returned schedules are enabled
      response.body.data.forEach((schedule: any) => {
        expect(schedule.enabled).toBe(true);
      });
    });

    it('should paginate schedules correctly', async () => {
      const response = await request(app)
        .get('/api/schedule/list?limit=1&offset=0')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });

      expect(response.body.data.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /api/schedule/:id', () => {
    it('should get schedule details successfully', async () => {
      const response = await request(app)
        .get(`/api/schedule/${testScheduleId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testScheduleId,
          name: 'Test Schedule',
          description: 'Test backup schedule',
          cronExpression: '0 2 * * *',
          backupType: 'full',
          enabled: true,
          retentionDays: 30,
          compressionEnabled: true,
          verificationEnabled: true,
          nextRun: expect.any(String),
          lastRun: null,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      });
    });

    it('should return 404 for non-existent schedule', async () => {
      const response = await request(app)
        .get('/api/schedule/non-existent-id')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Schedule not found',
      });
    });
  });

  describe('PUT /api/schedule/:id', () => {
    it('should update schedule successfully', async () => {
      const response = await request(app)
        .put(`/api/schedule/${testScheduleId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Updated Test Schedule',
          description: 'Updated test backup schedule',
          cronExpression: '0 4 * * *', // Daily at 4 AM
          retentionDays: 60,
          compressionEnabled: false,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testScheduleId,
          name: 'Updated Test Schedule',
          description: 'Updated test backup schedule',
          cronExpression: '0 4 * * *',
          backupType: 'full',
          enabled: true,
          retentionDays: 60,
          compressionEnabled: false,
          verificationEnabled: true,
          nextRun: expect.any(String),
          lastRun: null,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      });
    });

    it('should return 404 for non-existent schedule', async () => {
      const response = await request(app)
        .put('/api/schedule/non-existent-id')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Updated Schedule',
        })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Schedule not found',
      });
    });

    it('should return 400 for invalid cron expression', async () => {
      const response = await request(app)
        .put(`/api/schedule/${testScheduleId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          cronExpression: 'invalid cron',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid cron expression'),
      });
    });
  });

  describe('POST /api/schedule/:id/execute', () => {
    it('should execute schedule successfully', async () => {
      const response = await request(app)
        .post(`/api/schedule/${testScheduleId}/execute`)
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: expect.stringContaining('Schedule executed'),
          scheduleId: testScheduleId,
          backupId: expect.any(String),
          executionTime: expect.any(String),
        },
      });
    });

    it('should return 404 for non-existent schedule', async () => {
      const response = await request(app)
        .post('/api/schedule/non-existent-id/execute')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Schedule not found',
      });
    });
  });

  describe('DELETE /api/schedule/:id', () => {
    it('should delete schedule successfully', async () => {
      // Create a schedule to delete
      const createResponse = await request(app)
        .post('/api/schedule/create')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Schedule to Delete',
          cronExpression: '0 5 * * *',
          backupType: 'full',
        })
        .expect(201);

      const scheduleId = createResponse.body.data.id;

      // Delete the schedule
      const response = await request(app)
        .delete(`/api/schedule/${scheduleId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: expect.stringContaining('Schedule deleted'),
        },
      });

      // Verify schedule is deleted
      await request(app)
        .get(`/api/schedule/${scheduleId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(404);
    });

    it('should return 404 for non-existent schedule', async () => {
      const response = await request(app)
        .delete('/api/schedule/non-existent-id')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Schedule not found',
      });
    });
  });

  describe('POST /api/schedule/cleanup', () => {
    it('should perform cleanup successfully', async () => {
      const response = await request(app)
        .post('/api/schedule/cleanup')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: expect.stringContaining('Cleanup completed'),
          deletedBackups: expect.any(Number),
          freedSpace: expect.any(Number),
        },
      });
    });
  });

  describe('POST /api/schedule/start', () => {
    it('should start scheduler successfully', async () => {
      const response = await request(app)
        .post('/api/schedule/start')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: expect.stringContaining('Scheduler started'),
          status: 'running',
          activeSchedules: expect.any(Number),
        },
      });
    });
  });

  describe('POST /api/schedule/stop', () => {
    it('should stop scheduler successfully', async () => {
      const response = await request(app)
        .post('/api/schedule/stop')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: expect.stringContaining('Scheduler stopped'),
          status: 'stopped',
        },
      });
    });
  });

  describe('Authentication', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app).get('/api/schedule/list').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'API key required',
      });
    });

    it('should return 401 with invalid API key', async () => {
      const response = await request(app)
        .get('/api/schedule/list')
        .set('Authorization', 'Bearer invalid-key')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid API key',
      });
    });
  });
});
