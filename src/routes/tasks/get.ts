/**
 * @fileoverview Get single task handler
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Task retrieval, permission checking, related data inclusion
 * Main APIs: getTaskHandler()
 * Constraints: Requires authentication, read permission
 * Patterns: Parameter validation, service delegation, error handling
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
    getTaskById: (id: string, options?: any) => Promise<any>;
  };
}

// Path parameters schema
const getTaskParamsSchema = z.object({
  id: z.string().uuid(),
});

// Query parameters schema
const getTaskQuerySchema = z.object({
  include: z.string().optional(), // Comma-separated list: notes,tags,dependencies,subtasks
});

/**
 * Get a single task by ID
 */
export const getTaskHandler = (services: Services) => [
  requirePermission('read'),
  validateRequest(getTaskParamsSchema, 'params'),
  validateRequest(getTaskQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { include } = req.query;

      logger.debug('Getting task', { taskId: id, include, userId: req.user?.id });

      const includeOptions = include
        ? include.split(',').reduce(
            (acc, item) => {
              acc[item.trim()] = true;
              return acc;
            },
            {} as Record<string, boolean>
          )
        : {};

      const task = await services.taskService.getTaskById(id, includeOptions);

      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
        });
      }

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.error('Error getting task', { error, taskId: req.params.id, userId: req.user?.id });
      next(error);
    }
  },
];
