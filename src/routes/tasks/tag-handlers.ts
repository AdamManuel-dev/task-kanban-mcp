/**
 * @fileoverview Task tag handlers - separated for complexity reduction
 * @lastmodified 2025-07-31T12:00:00Z
 *
 * Features: Task tag assignment, removal, listing
 * Main APIs: getTaskTags(), assignTagToTask(), removeTagFromTask()
 * Constraints: Requires authentication, valid task and tag IDs
 * Patterns: All handlers use try/catch, return Promise<void>
 */

import type { Request, Response, NextFunction } from 'express';
import type { TagService } from '@/services/TagService';
import { ValidationError, NotFoundError } from '@/utils/errors';

export async function getTaskTags(
  req: Request,
  res: Response,
  next: NextFunction,
  tagService: TagService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new ValidationError('Task ID is required');
    }
    const tags = await tagService.getTaskTags(id);
    res.apiSuccess(tags);
  } catch (error) {
    next(error);
  }
}

export async function assignTagToTask(
  req: Request,
  res: Response,
  next: NextFunction,
  tagService: TagService
): Promise<void> {
  try {
    const { id } = req.params;
    const { tag_ids: tagIds } = req.body;

    if (!Array.isArray(tagIds)) {
      res.apiError({
        code: 'INVALID_INPUT',
        message: 'tag_ids must be an array',
        statusCode: 400,
      });
      return;
    }

    if (!id) {
      throw new ValidationError('Task ID is required');
    }
    const assignedTags: unknown[] = [];
    await Promise.all(
      tagIds.map(async tagId => {
        await tagService.addTagToTask(id, tagId);
      })
    );

    res.status(201).apiSuccess(assignedTags);
  } catch (error) {
    next(error);
  }
}

export async function removeTagFromTask(
  req: Request,
  res: Response,
  next: NextFunction,
  tagService: TagService
): Promise<void> {
  try {
    const { id, tagId } = req.params;
    if (!id) {
      throw new NotFoundError('Task', 'ID is required');
    }
    if (!tagId) {
      throw new NotFoundError('Tag', 'Tag ID is required');
    }
    await tagService.removeTagFromTask(id, tagId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
