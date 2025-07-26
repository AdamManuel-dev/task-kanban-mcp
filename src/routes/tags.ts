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
      const totalTags = await tagService.getTags({ ...options, limit: undefined, offset: undefined });
      const total = totalTags.length;

      res.apiPagination(tags, Math.floor(options.offset / options.limit) + 1, options.limit, total);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/tags - Create tag
  router.post('/', requirePermission('write'), async (req, res, next) => {
    try {
      const tagData = validateInput(TagValidation.create, req.body);
      const tag = await tagService.createTag(tagData);
      res.status(201).apiSuccess(tag);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tags/:id - Get tag details
  router.get('/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
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

      res.apiSuccess(tag);
    } catch (error) {
      next(error);
    }
  });

  // PATCH /api/v1/tags/:id - Update tag
  router.patch('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = validateInput(TagValidation.update, req.body);
      const tag = await tagService.updateTag(id, updateData);
      res.apiSuccess(tag);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/v1/tags/:id - Delete tag
  router.delete('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      await tagService.deleteTag(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tags/:id/children - Get tag children
  router.get('/:id/children', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const tagWithChildren = await tagService.getTagWithChildren(id);
      
      if (!tagWithChildren) {
        throw new NotFoundError('Tag', id);
      }

      res.apiSuccess(tagWithChildren.children || []);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tags/:id/path - Get tag hierarchy path
  router.get('/:id/path', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const path = await tagService.getTagPath(id);
      res.apiSuccess(path);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/tags/:id/merge - Merge tags
  router.post('/:id/merge', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { target_tag_id } = req.body;

      if (!target_tag_id) {
        return res.status(400).apiError('INVALID_INPUT', 'target_tag_id is required');
      }

      await tagService.mergeTags(id, target_tag_id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tags/:id/tasks - Get tasks with this tag
  router.get('/:id/tasks', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const {
        limit = 50,
        offset = 0,
        sortBy = 'updated_at',
        sortOrder = 'desc',
        board_id,
        status,
      } = req.query;

      const options = {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        board_id: board_id as string,
        status: status as any,
      };

      const tasks = await tagService.getTagTasks(id, options);
      
      // Get total count for pagination
      const totalTasks = await tagService.getTagTasks(id, { ...options, limit: undefined, offset: undefined });
      const total = totalTasks.length;

      res.apiPagination(tasks, Math.floor(options.offset / options.limit) + 1, options.limit, total);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tags/tree - Get tag hierarchy tree
  router.get('/tree', requirePermission('read'), async (req, res, next) => {
    try {
      const { includeUsageCount = false } = req.query;
      const tree = await tagService.getTagTree(includeUsageCount === 'true');
      res.apiSuccess(tree);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tags/popular - Get most used tags
  router.get('/popular', requirePermission('read'), async (req, res, next) => {
    try {
      const {
        limit = 20,
        board_id,
        days = 30,
      } = req.query;

      const options = {
        limit: parseInt(limit as string, 10),
        board_id: board_id as string,
        days: parseInt(days as string, 10),
      };

      const popularTags = await tagService.getPopularTags(options);
      res.apiSuccess(popularTags);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tags/colors - Get available tag colors
  router.get('/colors', requirePermission('read'), async (req, res, next) => {
    try {
      const colors = [
        '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
        '#dda0dd', '#98d8c8', '#f7dc6f', '#bb8fce', '#85c1e9',
        '#f8c471', '#82e0aa', '#f1948a', '#85c1e9', '#d2b4de',
        '#aed6f1', '#a3e4d7', '#f9e79f', '#f5b7b1', '#d5dbdb',
      ];
      res.apiSuccess(colors);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tags/stats - Get tag usage statistics
  router.get('/stats', requirePermission('read'), async (req, res, next) => {
    try {
      const { board_id } = req.query;
      const stats = await tagService.getTagStats(board_id as string);
      res.apiSuccess(stats);
    } catch (error) {
      next(error);
    }
  });

  return router;
}