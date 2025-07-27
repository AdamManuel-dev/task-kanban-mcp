import { Router } from 'express';
import { TagService } from '@/services/TagService';
import { dbConnection } from '@/database/connection';
import { requirePermission } from '@/middleware/auth';
import { TagValidation, validateInput } from '@/utils/validation';
import { NotFoundError } from '@/utils/errors';

export async function tagRoutes() {
  const router = Router();

  const tagService = new TagService(dbConnection);

  // GET /api/v1/tags - List tags with filters
  router.get('/', requirePermission('read'), async (req, res, next) => {
    try {
      const {
        limit = 50,
        offset = 0,
        sortBy = 'name',
        sortOrder = 'asc',
        parent_id,
        search,
        color,
        includeUsageCount = false,
      } = req.query;

      const options = {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        parent_id: parent_id as string,
        search: search as string,
        color: color as string,
        includeUsageCount: includeUsageCount === 'true',
      };

      const tags = await tagService.getTags(options);

      // Get total count for pagination
      const { limit: _, offset: __, ...countOptions } = options;
      const totalTags = await tagService.getTags(countOptions);
      const total = totalTags.length;

      return res.apiPagination(
        tags,
        Math.floor(options.offset / options.limit) + 1,
        options.limit,
        total
      );
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/tags - Create tag
  router.post('/', requirePermission('write'), async (req, res, next) => {
    try {
      const tagData = validateInput(TagValidation.create, req.body);
      const tag = await tagService.createTag(tagData);
      return res.status(201).apiSuccess(tag);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tags/tree - Get tag hierarchy tree
  router.get('/tree', requirePermission('read'), async (req, res, next) => {
    try {
      const { includeUsageCount = false } = req.query;
      const tree = await tagService.getTagTree(includeUsageCount === 'true');
      return res.apiSuccess(tree);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tags/popular - Get most used tags
  router.get('/popular', requirePermission('read'), async (req, res, next) => {
    try {
      const { limit = 20, board_id, days = 30 } = req.query;

      const options = {
        limit: parseInt(limit as string, 10),
        board_id: board_id as string,
        days: parseInt(days as string, 10),
      };

      const popularTags = await tagService.getPopularTags(options);
      return res.apiSuccess(popularTags);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tags/colors - Get available tag colors
  router.get('/colors', requirePermission('read'), async (_req, res, next) => {
    try {
      const colors = [
        '#ff6b6b',
        '#4ecdc4',
        '#45b7d1',
        '#96ceb4',
        '#ffeaa7',
        '#dda0dd',
        '#98d8c8',
        '#f7dc6f',
        '#bb8fce',
        '#85c1e9',
        '#f8c471',
        '#82e0aa',
        '#f1948a',
        '#85c1e9',
        '#d2b4de',
        '#aed6f1',
        '#a3e4d7',
        '#f9e79f',
        '#f5b7b1',
        '#d5dbdb',
      ];
      return res.apiSuccess(colors);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tags/stats - Get tag usage statistics
  router.get('/stats', requirePermission('read'), async (req, res, next) => {
    try {
      const { board_id } = req.query;
      const stats = await tagService.getTagStats(board_id as string);
      return res.apiSuccess(stats);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tags/:id - Get tag details
  router.get('/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Tag', 'ID is required');
      }
      const { include } = req.query;

      let tag;
      if (include === 'children') {
        tag = await tagService.getTagWithChildren(id);
      } else {
        tag = await tagService.getTagById(id);
      }

      if (!tag) {
        throw new NotFoundError('Tag', id);
      }

      return res.apiSuccess(tag);
    } catch (error) {
      return next(error);
    }
  });

  // PATCH /api/v1/tags/:id - Update tag
  router.patch('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Tag', 'ID is required');
      }
      const updateData = validateInput(TagValidation.update, req.body);
      const tag = await tagService.updateTag(id, updateData);
      return res.apiSuccess(tag);
    } catch (error) {
      return next(error);
    }
  });

  // DELETE /api/v1/tags/:id - Delete tag
  router.delete('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Tag', 'ID is required');
      }
      await tagService.deleteTag(id);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tags/:id/children - Get tag children
  router.get('/:id/children', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Tag', 'ID is required');
      }
      const tagWithChildren = await tagService.getTagWithChildren(id);

      if (!tagWithChildren) {
        throw new NotFoundError('Tag', id);
      }

      return res.apiSuccess(tagWithChildren.children || []);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tags/:id/path - Get tag hierarchy path
  router.get('/:id/path', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Tag', 'ID is required');
      }
      const path = await tagService.getTagPath(id);
      return res.apiSuccess(path);
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/tags/:id/merge - Merge tags
  router.post('/:id/merge', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Tag', 'ID is required');
      }
      const { target_tag_id } = req.body;

      if (!target_tag_id) {
        return res.status(400).apiError('INVALID_INPUT', 'target_tag_id is required');
      }

      await tagService.mergeTags(id, target_tag_id);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tags/:id/tasks - Get tasks with this tag
  router.get('/:id/tasks', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Tag', 'ID is required');
      }
      // Query parameters available for future filtering implementation
      // const {
      //   limit = 50,
      //   offset = 0,
      //   sortBy = 'updated_at',
      //   sortOrder = 'desc',
      //   board_id,
      //   status,
      // } = req.query;

      // TODO: Pagination options could be used to limit/filter the task IDs returned
      // const options = {
      //   limit: parseInt(limit as string, 10),
      //   offset: parseInt(offset as string, 10),
      //   sortBy: sortBy as string,
      //   sortOrder: sortOrder as 'asc' | 'desc',
      //   board_id: board_id as string,
      //   status: status as any,
      // };

      const taskIds = await tagService.getTaggedTasks(id);

      // TODO: This currently just returns task IDs. You might want to fetch the actual task objects
      // by using TaskService to get the full task details based on these IDs

      return res.apiSuccess({
        task_ids: taskIds,
        message: 'Returns task IDs. Use TaskService to get full task details.',
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
