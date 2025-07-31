/**
 * @fileoverview Task dependencies route handlers
 * @lastmodified 2025-07-28T05:15:00Z
 *
 * Features: Task dependency operations, relationship management
 * Main APIs: taskDependencyRoutes - Express router for task dependencies
 * Constraints: Prevents circular dependencies, validates task IDs
 * Patterns: RESTful routes under /tasks/:id/dependencies
 */

import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { TaskService } from '@/services/TaskService';
import { logger } from '@/utils/logger';
import { dbConnection } from '@/database/connection';

export const taskDependencyRoutes = Router({ mergeParams: true });

/**
 * GET /tasks/:id/dependencies - Get all dependencies for a task
 */
taskDependencyRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.id;
    const taskService = new TaskService(dbConnection);
    const result = await taskService.getTaskDependencies(taskId);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/dependencies - Add dependency to task
 */
taskDependencyRoutes.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.id;
    const { dependsOnTaskId, type = 'blocks' } = req.body;

    const taskService = new TaskService(dbConnection);
    const result = await taskService.addDependency(taskId, dependsOnTaskId, type);

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /tasks/:id/dependencies/:dependsOnTaskId - Remove dependency
 */
taskDependencyRoutes.delete(
  '/:dependsOnTaskId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: taskId, dependsOnTaskId } = req.params;
      const taskService = new TaskService(dbConnection);
      await taskService.removeDependency(taskId, dependsOnTaskId);
      res.json({ success: true, message: 'Dependency removed' });
    } catch (error) {
      next(error);
    }
  }
);
