/**
 * @fileoverview Task tags route handlers
 * @lastmodified 2025-07-28T05:15:00Z
 *
 * Features: Task tag operations, tag assignment/removal
 * Main APIs: taskTagsRoutes - Express router for task tags
 * Constraints: Requires valid task and tag IDs
 * Patterns: RESTful routes under /tasks/:id/tags
 */

import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { TagService } from '@/services/TagService';
import { DatabaseConnection } from '@/database/connection';
import { logger } from '@/utils/logger';
import { createServiceError } from '@/utils/error-handler';

export const taskTagsRoutes = Router({ mergeParams: true });

/**
 * GET /tasks/:id/tags - Get all tags for a task
 */
taskTagsRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  // Error handler for getTaskTags

  try {
    const taskId = req.params.id;
    const db = await DatabaseConnection.getInstance();
    const tagService = new TagService(db);
    const tags = await tagService.getTaskTags(taskId);
    res.json({ success: true, data: tags });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/tags/:tagId - Add tag to task
 */
taskTagsRoutes.post('/:tagId', async (req: Request, res: Response, next: NextFunction) => {
  // Error handler for addTaskTag

  try {
    const { id: taskId, tagId } = req.params;
    const db = await DatabaseConnection.getInstance();
    const tagService = new TagService(db);
    const result = await tagService.addTagToTask(taskId, tagId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /tasks/:id/tags/:tagId - Remove tag from task
 */
taskTagsRoutes.delete('/:tagId', async (req: Request, res: Response, next: NextFunction) => {
  // Error handler for removeTaskTag

  try {
    const { id: taskId, tagId } = req.params;
    const db = await DatabaseConnection.getInstance();
    const tagService = new TagService(db);
    await tagService.removeTagFromTask(taskId, tagId);
    res.json({ success: true, message: 'Tag removed from task' });
  } catch (error) {
    next(error);
  }
});
