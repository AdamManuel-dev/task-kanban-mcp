/**
 * @fileoverview Task tags route handlers
 * @lastmodified 2025-07-28T05:15:00Z
 *
 * Features: Task tag operations, tag assignment/removal
 * Main APIs: taskTagsRoutes - Express router for task tags
 * Constraints: Requires valid task and tag IDs
 * Patterns: RESTful routes under /tasks/:id/tags
 */

import { Router } from 'express';
import { TagService } from '@/services/TagService';
import { logger } from '@/utils/logger';
import { createServiceErrorHandler } from '@/utils/errors';

export const taskTagsRoutes = Router({ mergeParams: true });

/**
 * GET /tasks/:id/tags - Get all tags for a task
 */
taskTagsRoutes.get('/', async (req, res) => {
  const errorHandler = createServiceErrorHandler('getTaskTags', logger);

  try {
    const taskId = req.params.id;
    const tagService = new TagService();
    const result = await tagService.getTagsByTask(taskId);

    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error, req, res);
  }
});

/**
 * POST /tasks/:id/tags/:tagId - Add tag to task
 */
taskTagsRoutes.post('/:tagId', async (req, res) => {
  const errorHandler = createServiceErrorHandler('addTaskTag', logger);

  try {
    const { id: taskId, tagId } = req.params;
    const tagService = new TagService();
    const result = await tagService.addTagToTask(taskId, tagId);

    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error, req, res);
  }
});

/**
 * DELETE /tasks/:id/tags/:tagId - Remove tag from task
 */
taskTagsRoutes.delete('/:tagId', async (req, res) => {
  const errorHandler = createServiceErrorHandler('removeTaskTag', logger);

  try {
    const { id: taskId, tagId } = req.params;
    const tagService = new TagService();
    const result = await tagService.removeTagFromTask(taskId, tagId);

    if (result.success) {
      res.json({ success: true, message: 'Tag removed from task' });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error, req, res);
  }
});
