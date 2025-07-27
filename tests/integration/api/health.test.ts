/**
 * API Integration Tests for Health Endpoints
 *
 * This test suite provides comprehensive coverage for all health-related REST API endpoints.
 * It tests health checks, status monitoring, and error handling.
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';

describe('Health API Integration Tests', () => {
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

    // Debug: Check environment
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('API_KEYS:', process.env.API_KEYS);
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  describe('GET /api/v1/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
      });
    });

    it('should include database status', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.database).toMatchObject({
        status: 'connected',
        type: 'sqlite',
      });
    });

    it('should include memory usage', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.memory).toMatchObject({
        used: expect.any(Number),
        total: expect.any(Number),
        percentage: expect.any(Number),
      });
    });

    it('should reject request without API key', async () => {
      await request(app).get('/api/v1/health').expect(401);
    });
  });

  describe('GET /api/v1/health/detailed', () => {
    it('should return detailed health information', async () => {
      const response = await request(app)
        .get('/api/v1/health/detailed')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        database: expect.any(Object),
        memory: expect.any(Object),
        system: expect.any(Object),
        services: expect.any(Object),
      });
    });

    it('should include system information', async () => {
      const response = await request(app)
        .get('/api/v1/health/detailed')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.system).toMatchObject({
        platform: expect.any(String),
        arch: expect.any(String),
        nodeVersion: expect.any(String),
        cpuUsage: expect.any(Number),
      });
    });

    it('should include service status', async () => {
      const response = await request(app)
        .get('/api/v1/health/detailed')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.services).toMatchObject({
        database: expect.any(String),
        websocket: expect.any(String),
        mcp: expect.any(String),
      });
    });

    it('should reject request without API key', async () => {
      await request(app).get('/api/v1/health/detailed').expect(401);
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('should return ready status when all services are healthy', async () => {
      const response = await request(app)
        .get('/api/v1/health/ready')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        status: 'ready',
        timestamp: expect.any(String),
        checks: expect.any(Object),
      });
    });

    it('should include readiness checks', async () => {
      const response = await request(app)
        .get('/api/v1/health/ready')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.checks).toMatchObject({
        database: expect.any(Boolean),
        websocket: expect.any(Boolean),
        mcp: expect.any(Boolean),
      });
    });

    it('should reject request without API key', async () => {
      await request(app).get('/api/v1/health/ready').expect(401);
    });
  });

  describe('GET /api/v1/health/live', () => {
    it('should return liveness status', async () => {
      const response = await request(app)
        .get('/api/v1/health/live')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        status: 'alive',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      });
    });

    it('should reject request without API key', async () => {
      await request(app).get('/api/v1/health/live').expect(401);
    });
  });

  describe('GET /api/v1/health/metrics', () => {
    it('should return application metrics', async () => {
      const response = await request(app)
        .get('/api/v1/health/metrics')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        timestamp: expect.any(String),
        requests: expect.any(Object),
        memory: expect.any(Object),
        database: expect.any(Object),
      });
    });

    it('should include request metrics', async () => {
      const response = await request(app)
        .get('/api/v1/health/metrics')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toMatchObject({
        total: expect.any(Number),
        active: expect.any(Number),
        averageResponseTime: expect.any(Number),
      });
    });

    it('should include database metrics', async () => {
      const response = await request(app)
        .get('/api/v1/health/metrics')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.database).toMatchObject({
        connections: expect.any(Number),
        queries: expect.any(Number),
        averageQueryTime: expect.any(Number),
      });
    });

    it('should reject request without API key', async () => {
      await request(app).get('/api/v1/health/metrics').expect(401);
    });
  });
});
