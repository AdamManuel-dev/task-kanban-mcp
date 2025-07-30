/**
 * @fileoverview List tasks handler with filtering, sorting, and pagination
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Task listing, filtering, sorting, pagination, search
 * Main APIs: listTasksHandler()
 * Constraints: Requires authentication, read permission
 * Patterns: Query parameter validation, service delegation, response formatting
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requirePermission } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { logger } from '@/utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    permissions: string[];
  };
}

interface Services {
  taskService: {
    getTasks: (options?: unknown) => Promise<unknown>;
  };
}

// Query parameters schema
const listTasksQuerySchema = z.object({
  limit: z
    .string()
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(1000))
    .optional(),
  offset: z
    .string()
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int().min(0))
    .optional(),
  sortBy: z.enum(['updated_at', 'created_at', 'priority', 'due_date']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  board_id: z.string().uuid().optional(),
  column_id: z.string().uuid().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'blocked', 'archived']).optional(),
  assignee: z.string().optional(),
  parent_task_id: z.string().uuid().optional(),
  search: z.string().optional(),
  priority_min: z
    .string()
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int())
    .optional(),
  priority_max: z
    .string()
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int())
    .optional(),
});

/**
 * List tasks with filtering, sorting, and pagination
 */
export const listTasksHandler = (services: Services) => [
  requirePermission('read'),
  validateRequest(listTasksQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const filters = req.query;

      logger.debug('Listing tasks', { filters, userId: req.user?.id });

      const result = await services.taskService.listTasks({
        limit: filters.limit || 50,
        offset: filters.offset ?? 0,
        sortBy: filters.sortBy ?? 'updated_at',
        sortOrder: filters.sortOrder ?? 'desc',
        filters: {
          board_id: filters.board_id,
          column_id: filters.column_id,
          status: filters.status,
          assignee: filters.assignee,
          parent_task_id: filters.parent_task_id,
          search: filters.search,
          priority_min: filters.priority_min,
          priority_max: filters.priority_max,
        },
      });

      res.json({
        success: true,
        data: result.tasks,
        pagination: {
          limit: result.limit,
          offset: result.offset,
          total: result.total,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      logger.error('Error listing tasks', { error, userId: req.user?.id });
      next(error);
    }
  },
];
