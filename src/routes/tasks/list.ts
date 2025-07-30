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

interface TaskListOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: {
    board_id?: string;
    column_id?: string;
    status?: string;
    assignee?: string;
    parent_task_id?: string;
    search?: string;
    priority_min?: number;
    priority_max?: number;
  };
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: number;
  [key: string]: unknown;
}

interface Services {
  taskService: {
    getTasks: (options?: TaskListOptions) => Promise<Task[]>;
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

      const limit = Number(filters.limit) || 50;
      const offset = Number(filters.offset) || 0;
      
      const tasks = await services.taskService.getTasks({
        limit,
        offset,
        sortBy: filters.sortBy as string ?? 'updated_at',
        sortOrder: (filters.sortOrder as 'asc' | 'desc') ?? 'desc',
        board_id: filters.board_id as string,
        column_id: filters.column_id as string,
        status: filters.status as string,
        assignee: filters.assignee as string,
        parent_task_id: filters.parent_task_id as string,
        search: filters.search as string,
        priority_min: Number(filters.priority_min),
        priority_max: Number(filters.priority_max),
      });

      // Get total count for pagination (without limit/offset)
      const totalTasks = await services.taskService.getTasks({
        sortBy: filters.sortBy as string ?? 'updated_at',
        sortOrder: (filters.sortOrder as 'asc' | 'desc') ?? 'desc',
        board_id: filters.board_id as string,
        column_id: filters.column_id as string,
        status: filters.status as string,
        assignee: filters.assignee as string,
        parent_task_id: filters.parent_task_id as string,
        search: filters.search as string,
        priority_min: Number(filters.priority_min),
        priority_max: Number(filters.priority_max),
      });
      
      const total = totalTasks.length;
      const hasMore = offset + limit < total;

      res.json({
        success: true,
        data: tasks,
        pagination: {
          limit,
          offset,
          total,
          hasMore,
        },
      });
    } catch (error) {
      logger.error('Error listing tasks', { error, userId: req.user?.id });
      next(error);
    }
  },
];
