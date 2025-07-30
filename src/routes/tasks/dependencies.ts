/**
 * @fileoverview Task dependencies route handlers
 * @lastmodified 2025-07-28T05:15:00Z
 *
 * Features: Task dependency operations, relationship management
 * Main APIs: taskDependencyRoutes - Express router for task dependencies
 * Constraints: Prevents circular dependencies, validates task IDs
 * Patterns: RESTful routes under /tasks/:id/dependencies
 */

import { Router } from 'express';
import { TaskService } from '@/services/TaskService';
import { logger } from '@/utils/logger';
import { createServiceErrorHandler } from '@/utils/errors';
import { dbConnection } from '@/database/connection';

export const taskDependencyRoutes = Router({ mergeParams: true });

/**
 * GET /tasks/:id/dependencies - Get all dependencies for a task
 */
taskDependencyRoutes.get('/', async (req: any, res: any) => {
  const errorHandler = createServiceErrorHandler('getTaskDependencies');

  try {
    const taskId = req.params.id;
    const taskService = new TaskService(dbConnection);
    const result = await taskService.getTaskDependencies(taskId);

    if ((result as any).success) {
      res.json({ success: true, data: (result as any).data });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error as any, req, res);
  }
});

/**
 * POST /tasks/:id/dependencies - Add dependency to task
 */
taskDependencyRoutes.post('/', async (req: any, res: any) => {
  const errorHandler = createServiceErrorHandler('addTaskDependency');

  try {
    const taskId = req.params.id;
    const { dependsOnTaskId, type = 'blocks' } = req.body;

    const taskService = new TaskService(dbConnection);
    const result = await taskService.addDependency(taskId, dependsOnTaskId, type);

    if ((result as any).success) {
      res.status(201).json({ success: true, data: (result as any).data });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error as any, req, res);
  }
});

/**
 * DELETE /tasks/:id/dependencies/:dependsOnTaskId - Remove dependency
 */
taskDependencyRoutes.delete('/:dependsOnTaskId', async (req: any, res: any) => {
  const errorHandler = createServiceErrorHandler('removeTaskDependency');

  try {
    const { id: taskId, dependsOnTaskId } = req.params;
    const taskService = new TaskService(dbConnection);
    const result = await taskService.removeDependency(taskId, dependsOnTaskId);

    if ((result as any).success) {
      res.json({ success: true, message: 'Dependency removed' });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error as any, req, res);
  }
});
