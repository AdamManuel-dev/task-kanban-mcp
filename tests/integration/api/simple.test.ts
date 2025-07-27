/**
 * Simple Integration Test
 *
 * This test verifies basic server functionality without authentication
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';

describe('Simple Integration Test', () => {
  let app: Express;

  beforeAll(async () => {
    // Initialize database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Create Express app
    app = await createServer();
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  describe('Basic Endpoints', () => {
    it('should return server info at root endpoint', async () => {
      const response = await request(app).get('/').expect(200);

      expect(response.body).toMatchObject({
        name: expect.any(String),
        version: expect.any(String),
        description: expect.any(String),
      });
    });

    it('should return health status at /health endpoint', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: expect.any(String),
        timestamp: expect.any(String),
        version: expect.any(String),
      });
    });
  });
});
