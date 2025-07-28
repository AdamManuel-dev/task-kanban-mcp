/**
 * @fileoverview Integration tests for response middleware configuration objects
 * @lastmodified 2025-07-28T15:00:00Z
 *
 * Features: Tests configuration object pattern for response middleware
 * Main APIs: ApiErrorConfig, ApiPaginationConfig integration
 * Constraints: Requires Express request/response mocks
 * Patterns: Integration testing with middleware function validation
 */

import request from 'supertest';
import express from 'express';
import { responseFormattingMiddleware } from '../../../src/middleware/response';
import type { ApiErrorConfig, ApiPaginationConfig } from '../../../src/middleware/response';

describe('Response Middleware Configuration Objects', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();

    // Add request ID middleware for testing
    app.use((req, _res, next) => {
      req.requestId = 'test-request-id';
      next();
    });

    app.use(responseFormattingMiddleware);
  });

  describe('apiError with configuration object', () => {
    it('should handle basic error configuration', async () => {
      app.get('/test-basic-error', (_req, res) => {
        const config: ApiErrorConfig = {
          code: 'TEST_ERROR',
          message: 'This is a test error',
        };
        res.apiError(config);
      });

      const response = await request(app).get('/test-basic-error').expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'This is a test error',
        },
        meta: {
          requestId: 'test-request-id',
        },
      });
    });

    it('should handle error with custom status code', async () => {
      app.get('/test-custom-status', (_req, res) => {
        const config: ApiErrorConfig = {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input provided',
          statusCode: 400,
        };
        res.apiError(config);
      });

      const response = await request(app).get('/test-custom-status').expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toBe('Invalid input provided');
    });

    it('should handle error with details', async () => {
      app.get('/test-error-details', (_req, res) => {
        const config: ApiErrorConfig = {
          code: 'COMPLEX_ERROR',
          message: 'Operation failed',
          statusCode: 422,
          details: {
            field: 'email',
            reason: 'Invalid format',
            validationRules: ['required', 'email'],
          },
        };
        res.apiError(config);
      });

      const response = await request(app).get('/test-error-details').expect(422);

      expect(response.body.error.details).toMatchObject({
        field: 'email',
        reason: 'Invalid format',
        validationRules: ['required', 'email'],
      });
    });

    it('should set default status code when not provided', async () => {
      app.get('/test-default-status', (_req, res) => {
        const config: ApiErrorConfig = {
          code: 'GENERIC_ERROR',
          message: 'Something went wrong',
        };
        res.apiError(config);
      });

      await request(app).get('/test-default-status').expect(500);
    });
  });

  describe('apiPagination with configuration object', () => {
    it('should handle basic pagination configuration', async () => {
      app.get('/test-basic-pagination', (_req, res) => {
        const testData = [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' },
          { id: '3', name: 'Item 3' },
        ];

        const config: ApiPaginationConfig<(typeof testData)[0]> = {
          data: testData,
          page: 1,
          limit: 10,
          total: 25,
        };
        res.apiPagination(config);
      });

      const response = await request(app).get('/test-basic-pagination').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' },
          { id: '3', name: 'Item 3' },
        ],
        meta: {
          requestId: 'test-request-id',
          pagination: {
            page: 1,
            limit: 10,
            total: 25,
            hasNext: true,
            hasPrev: false,
          },
        },
      });
    });

    it('should calculate pagination flags correctly', async () => {
      app.get('/test-pagination-flags', (_req, res) => {
        const config: ApiPaginationConfig<{ id: string }> = {
          data: [{ id: '1' }],
          page: 2,
          limit: 5,
          total: 12,
        };
        res.apiPagination(config);
      });

      const response = await request(app).get('/test-pagination-flags').expect(200);

      expect(response.body.meta.pagination).toMatchObject({
        page: 2,
        limit: 5,
        total: 12,
        hasNext: true, // page 2 of 3
        hasPrev: true, // not first page
      });
    });

    it('should handle last page pagination', async () => {
      app.get('/test-last-page', (_req, res) => {
        const config: ApiPaginationConfig<{ id: string }> = {
          data: [{ id: '1' }, { id: '2' }],
          page: 3,
          limit: 5,
          total: 12,
        };
        res.apiPagination(config);
      });

      const response = await request(app).get('/test-last-page').expect(200);

      expect(response.body.meta.pagination).toMatchObject({
        page: 3,
        limit: 5,
        total: 12,
        hasNext: false, // last page
        hasPrev: true, // not first page
      });
    });

    it('should handle single page result', async () => {
      app.get('/test-single-page', (_req, res) => {
        const config: ApiPaginationConfig<{ id: string }> = {
          data: [{ id: '1' }, { id: '2' }],
          page: 1,
          limit: 10,
          total: 2,
        };
        res.apiPagination(config);
      });

      const response = await request(app).get('/test-single-page').expect(200);

      expect(response.body.meta.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 2,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('should handle additional meta information', async () => {
      app.get('/test-additional-meta', (_req, res) => {
        const config: ApiPaginationConfig<{ id: string }> = {
          data: [{ id: '1' }],
          page: 1,
          limit: 10,
          total: 1,
          meta: {
            version: '1.0',
            processingTime: 150,
          },
        };
        res.apiPagination(config);
      });

      const response = await request(app).get('/test-additional-meta').expect(200);

      expect(response.body.meta).toMatchObject({
        requestId: 'test-request-id',
        version: '1.0',
        processingTime: 150,
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    });
  });

  describe('Configuration object type safety', () => {
    it('should enforce ApiErrorConfig structure', () => {
      app.get('/test-error-type-safety', (_req, res) => {
        // This should compile correctly
        const validConfig: ApiErrorConfig = {
          code: 'VALID_CODE',
          message: 'Valid message',
          statusCode: 400,
          details: { extra: 'info' },
        };
        res.apiError(validConfig);
      });

      return request(app).get('/test-error-type-safety').expect(400);
    });

    it('should enforce ApiPaginationConfig structure', () => {
      app.get('/test-pagination-type-safety', (_req, res) => {
        // This should compile correctly
        const validConfig: ApiPaginationConfig<{ id: string; name: string }> = {
          data: [{ id: '1', name: 'Test' }],
          page: 1,
          limit: 10,
          total: 1,
          meta: { customField: 'value' },
        };
        res.apiPagination(validConfig);
      });

      return request(app).get('/test-pagination-type-safety').expect(200);
    });
  });

  describe('Backward compatibility validation', () => {
    it('should work in real API endpoint patterns', async () => {
      // Simulate a real endpoint that might use these patterns
      app.get('/api/tasks', async (_req, res) => {
        try {
          // Simulate data fetching
          const tasks = [
            { id: 'task1', title: 'Task 1', status: 'todo' },
            { id: 'task2', title: 'Task 2', status: 'done' },
          ];

          // Use the new pagination config pattern
          res.apiPagination({
            data: tasks,
            page: 1,
            limit: 20,
            total: 2,
            meta: {
              queryTime: 45,
              fromCache: false,
            },
          });
        } catch (error) {
          // Use the new error config pattern
          res.apiError({
            code: 'TASKS_FETCH_ERROR',
            message: 'Failed to fetch tasks',
            statusCode: 500,
            details: {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        }
      });

      const response = await request(app).get('/api/tasks').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.pagination.total).toBe(2);
      expect(response.body.meta.queryTime).toBe(45);
    });

    it('should handle error scenarios in real endpoints', async () => {
      app.get('/api/error-endpoint', (_req, res) => {
        // Simulate validation error
        res.apiError({
          code: 'VALIDATION_FAILED',
          message: 'Invalid request parameters',
          statusCode: 400,
          details: {
            errors: [
              { field: 'title', message: 'Title is required' },
              { field: 'priority', message: 'Priority must be between 1-10' },
            ],
          },
        });
      });

      const response = await request(app).get('/api/error-endpoint').expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.details.errors).toHaveLength(2);
    });
  });
});
