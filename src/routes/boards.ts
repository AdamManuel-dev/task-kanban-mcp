/**
 * @module routes/boards
 * @description RESTful API routes for board management.
 *
 * This module provides comprehensive board operations including CRUD operations,
 * archiving, duplication, and board analytics. All routes require authentication
 * and appropriate permissions.
 *
 * Base path: `/api/v1/boards`
 *
 * @example
 * ```typescript
 * // Client usage example
 * const response = await fetch('/api/v1/boards', {
 *   method: 'GET',
 *   headers: {
 *     'X-API-Key': 'your-api-key',
 *     'Content-Type': 'application/json'
 *   }
 * });
 * ```
 */

import { Router } from 'express';
import { z } from 'zod';
import { BoardService } from '@/services/BoardService';
import { TaskService } from '@/services/TaskService';
import { dbConnection } from '@/database/connection';
import { requirePermission } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { BoardValidation, validateInput } from '@/utils/validation';
import { NotFoundError } from '@/utils/errors';
import type { PaginationOptions, FilterOptions } from '@/types';
import type { TaskFilters } from '@/services/TaskService';

// Validation schemas
const CreateBoardSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .optional(),
  columns: z
    .array(
      z.object({
        name: z.string().min(1).max(50),
        order: z.number().int().min(0),
        wip_limit: z.number().int().min(0).optional(),
      })
    )
    .optional(),
});

const UpdateBoardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .optional(),
  archived: z.boolean().optional(),
});

const ListBoardsSchema = z.object({
  archived: z.enum(['true', 'false', 'all']).optional(),
  search: z.string().optional(),
  sort: z.enum(['name', 'created_at', 'updated_at']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z
    .union([z.string().transform(Number), z.number()])
    .pipe(z.number().int().min(1).max(100))
    .optional(),
  offset: z
    .union([z.string().transform(Number), z.number()])
    .pipe(z.number().int().min(0))
    .optional(),
});

/**
 * Create and configure board routes.
 *
 * @returns Express router with all board endpoints configured
 */
export function boardRoutes(): Router {
  const router = Router();

  const boardService = new BoardService(dbConnection);
  const taskService = new TaskService(dbConnection);

  /**
   * List boards with filtering, sorting, and pagination.
   *
   * @route GET /api/v1/boards
   * @auth Required - Read permission
   *
   * @queryparam {number} limit - Maximum boards to return (default: 50)
   * @queryparam {number} offset - Pagination offset (default: 0)
   * @queryparam {string} sortBy - Field to sort by: updated_at, created_at, name (default: updated_at)
   * @queryparam {string} sortOrder - Sort direction: asc or desc (default: desc)
   * @queryparam {boolean} archived - Filter by archive status (true/false)
   * @queryparam {string} search - Search in board names and descriptions
   *
   * @response 200 - Success
   * ```json
   * {
   *   "success": true,
   *   "data": [
   *     {
   *       "id": "board123",
   *       "name": "Development Board",
   *       "description": "Main development tasks",
   *       "archived": false,
   *       "created_at": "2024-01-20T10:00:00Z",
   *       "updated_at": "2024-01-21T14:30:00Z"
   *     }
   *   ],
   *   "pagination": {
   *     "page": 1,
   *     "limit": 50,
   *     "total": 10,
   *     "totalPages": 1
   *   }
   * }
   * ```
   *
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   */
  // GET /api/v1/boards - List boards
  router.get(
    '/',
    requirePermission('read'),
    validateRequest(ListBoardsSchema),
    async (req, res, next): Promise<void> => {
      try {
        const {
          limit = 50,
          offset = 0,
          sortBy = 'updated_at',
          sortOrder = 'desc',
          archived,
          search,
        } = req.query;

        const options: PaginationOptions & FilterOptions = {
          limit: parseInt(limit as string, 10) || 50,
          offset: parseInt(offset as string, 10) || 0,
          sortBy: sortBy as string,
          sortOrder: sortOrder as 'asc' | 'desc',
          search: search as string,
        };

        if (archived === 'true') {
          options.archived = true;
        } else if (archived === 'false') {
          options.archived = false;
        }

        const boards = await boardService.getBoards(options);

        // Get total count for pagination
        const countOptions = { ...options };
        delete countOptions.limit;
        delete countOptions.offset;
        const totalBoards = await boardService.getBoards(countOptions);
        const total = totalBoards.length;

        return res.apiPagination({
          data: boards,
          page: Math.floor((options.offset || 0) / (options.limit || 50)) + 1,
          limit: options.limit || 50,
          total,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Create a new board.
   *
   * @route POST /api/v1/boards
   * @auth Required - Write permission
   *
   * @bodyparam {string} name - Board name (required)
   * @bodyparam {string} [description] - Board description
   * @bodyparam {boolean} [is_public] - Make board publicly accessible (default: false)
   * @bodyparam {Object[]} [columns] - Initial columns configuration
   * @bodyparam {string} columns[].name - Column name
   * @bodyparam {number} columns[].order - Column position
   * @bodyparam {number} columns[].wip_limit - Work-in-progress limit
   *
   * @response 201 - Board created successfully
   * ```json
   * {
   *   "success": true,
   *   "data": {
   *     "id": "board456",
   *     "name": "New Board",
   *     "description": "Board description",
   *     "is_public": false,
   *     "created_at": "2024-01-20T10:00:00Z",
   *     "columns": [
   *       {
   *         "id": "col123",
   *         "name": "To Do",
   *         "order": 0,
   *         "wip_limit": null
   *       }
   *     ]
   *   }
   * }
   * ```
   *
   * @response 400 - Invalid input data
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   */
  // POST /api/v1/boards - Create board
  router.post(
    '/',
    requirePermission('write'),
    validateRequest(CreateBoardSchema),
    async (req, res, next): Promise<void> => {
      try {
        const boardData = validateInput(BoardValidation.create, req.body);
        const board = await boardService.createBoard(boardData as { name: string; description?: string; color?: string });
        return res.status(201).apiSuccess(board);
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Get detailed information about a specific board.
   *
   * @route GET /api/v1/boards/:id
   * @auth Required - Read permission
   *
   * @param {string} id - Board ID
   * @queryparam {string} [include] - Include related data: 'columns' or 'tasks'
   *
   * @response 200 - Success
   * ```json
   * {
   *   "success": true,
   *   "data": {
   *     "id": "board123",
   *     "name": "Development Board",
   *     "description": "Main development tasks",
   *     "is_public": false,
   *     "archived": false,
   *     "created_at": "2024-01-20T10:00:00Z",
   *     "updated_at": "2024-01-21T14:30:00Z",
   *     "columns": [],  // If include=columns
   *     "task_count": 45,  // If include=tasks
   *     "completed_tasks": 20  // If include=tasks
   *   }
   * }
   * ```
   *
   * @response 400 - Invalid board ID
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Board not found
   */
  // GET /api/v1/boards/:id - Get board details
  router.get('/:id', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;
      const { include } = req.query;

      if (!id) {
        res.status(400).json({ error: 'Board ID is required' });
        return;
      }

      let board;
      if (include === 'columns') {
        board = await boardService.getBoardWithColumns(id);
      } else if (include === 'tasks') {
        board = await boardService.getBoardWithStats(id);
      } else {
        board = await boardService.getBoardById(id);
      }

      if (!board) {
        throw new NotFoundError('Board', id);
      }

      res.apiSuccess(board);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Update board properties.
   *
   * @route PATCH /api/v1/boards/:id
   * @auth Required - Write permission
   *
   * @param {string} id - Board ID
   * @bodyparam {string} [name] - New board name
   * @bodyparam {string} [description] - New description
   * @bodyparam {boolean} [is_public] - Update visibility
   * @bodyparam {boolean} [archived] - Archive status
   *
   * @response 200 - Board updated successfully
   * ```json
   * {
   *   "success": true,
   *   "data": {
   *     "id": "board123",
   *     "name": "Updated Board Name",
   *     "description": "Updated description",
   *     "updated_at": "2024-01-21T15:00:00Z"
   *   }
   * }
   * ```
   *
   * @response 400 - Invalid input data
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Board not found
   */
  // PATCH /api/v1/boards/:id - Update board
  router.patch(
    '/:id',
    requirePermission('write'),
    validateRequest(UpdateBoardSchema),
    async (req, res, next): Promise<void> => {
      try {
        const { id } = req.params;

        if (!id) {
          res.status(400).json({ error: 'Board ID is required' });
          return;
        }

        const rawUpdateData = validateInput(BoardValidation.update, req.body);
        const updateData = Object.fromEntries(
          Object.entries(rawUpdateData).filter(([, value]) => value !== undefined)
        );
        const board = await boardService.updateBoard(id, updateData);
        res.apiSuccess(board);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Delete a board permanently.
   *
   * @route DELETE /api/v1/boards/:id
   * @auth Required - Write permission
   *
   * @param {string} id - Board ID to delete
   *
   * @response 204 - Board deleted successfully (no content)
   * @response 400 - Invalid board ID
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Board not found
   *
   * @warning This permanently deletes the board and all associated data
   * including columns, tasks, notes, and tags. This action cannot be undone.
   */
  // DELETE /api/v1/boards/:id - Delete board
  router.delete('/:id', requirePermission('write'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Board ID is required' });
        return;
      }

      await boardService.deleteBoard(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  /**
   * Archive a board to hide it from active lists.
   *
   * @route POST /api/v1/boards/:id/archive
   * @auth Required - Write permission
   *
   * @param {string} id - Board ID to archive
   *
   * @response 200 - Board archived successfully
   * ```json
   * {
   *   "success": true,
   *   "data": {
   *     "id": "board123",
   *     "name": "Archived Board",
   *     "archived": true,
   *     "archived_at": "2024-01-21T15:00:00Z"
   *   }
   * }
   * ```
   *
   * @response 400 - Invalid board ID
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Board not found
   *
   * @note Archived boards can be restored using POST /api/v1/boards/:id/restore
   */
  // POST /api/v1/boards/:id/archive - Archive board
  router.post('/:id/archive', requirePermission('write'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Board ID is required' });
      }

      const board = await boardService.archiveBoard(id);
      res.apiSuccess(board);
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/boards/:id/restore - Restore archived board
  router.post('/:id/restore', requirePermission('write'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Board ID is required' });
      }

      const board = await boardService.unarchiveBoard(id);
      res.apiSuccess(board);
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Duplicate an existing board with all its columns.
   *
   * @route POST /api/v1/boards/:id/duplicate
   * @auth Required - Write permission
   *
   * @param {string} id - Board ID to duplicate
   * @bodyparam {string} [name] - Name for the new board (default: "Copy of [original]")
   *
   * @response 201 - Board duplicated successfully
   * ```json
   * {
   *   "success": true,
   *   "data": {
   *     "id": "board789",
   *     "name": "Copy of Development Board",
   *     "description": "Main development tasks",
   *     "created_at": "2024-01-21T15:00:00Z",
   *     "columns": [
   *       {
   *         "id": "col456",
   *         "name": "To Do",
   *         "order": 0
   *       }
   *     ]
   *   }
   * }
   * ```
   *
   * @response 400 - Invalid board ID
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Board not found
   *
   * @note Tasks are not duplicated, only the board structure
   */
  // POST /api/v1/boards/:id/duplicate - Duplicate board
  router.post(
    '/:id/duplicate',
    requirePermission('write'),
    async (req, res, next): Promise<void> => {
      try {
        const { id } = req.params;

        if (!id) {
          res.status(400).json({ error: 'Board ID is required' });
        }

        const { name } = req.body;

        const newBoard = await boardService.duplicateBoard(id, name);
        res.status(201).apiSuccess(newBoard);
      } catch (error) {
        return next(error);
      }
    }
  );

  // GET /api/v1/boards/:id/columns - Get board columns
  router.get('/:id/columns', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Board ID is required' });
      }

      const boardWithColumns = await boardService.getBoardWithColumns(id);

      if (!boardWithColumns) {
        throw new NotFoundError('Board', id);
      }

      res.apiSuccess(boardWithColumns.columns ?? []);
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Create a new column in a board
   *
   * @route POST /api/v1/boards/:id/columns
   * @auth Required - Write permission
   *
   * @param {string} id - Board ID
   * @bodyparam {string} name - Column name
   * @bodyparam {number} position - Column position
   * @bodyparam {number} [wip_limit] - Optional WIP limit
   *
   * @returns {Column} Created column with metadata
   *
   * @example
   * ```bash
   * curl -X POST "http://localhost:3000/api/v1/boards/board-123/columns" \
   *   -H "Authorization: Bearer YOUR_API_KEY" \
   *   -H "Content-Type: application/json" \
   *   -d '{
   *     "name": "In Review",
   *     "position": 2,
   *     "wip_limit": 3
   *   }'
   * ```
   *
   * @response 201 - Column created successfully
   * @response 400 - Invalid input data
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Board not found
   */
  router.post('/:id/columns', requirePermission('write'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;
      const columnData = validateInput(BoardValidation.column.create, {
        ...req.body,
        board_id: id,
      });

      const column = await boardService.createColumn(columnData as { board_id: string; name: string; position: number; wip_limit?: number });
      res.status(201).json({
        success: true,
        data: column,
        message: 'Column created successfully',
      });
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Update an existing column
   *
   * @route PATCH /api/v1/boards/:id/columns/:columnId
   * @auth Required - Write permission
   *
   * @param {string} id - Board ID
   * @param {string} columnId - Column ID to update
   * @bodyparam {string} [name] - New column name
   * @bodyparam {number} [position] - New column position
   * @bodyparam {number} [wip_limit] - New WIP limit
   *
   * @returns {Column} Updated column
   *
   * @example
   * ```bash
   * curl -X PATCH "http://localhost:3000/api/v1/boards/board-123/columns/col-456" \
   *   -H "Authorization: Bearer YOUR_API_KEY" \
   *   -H "Content-Type: application/json" \
   *   -d '{
   *     "name": "Ready for Review",
   *     "wip_limit": 5
   *   }'
   * ```
   *
   * @response 200 - Column updated successfully
   * @response 400 - Invalid input data
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Column not found
   */
  router.patch(
    '/:id/columns/:columnId',
    requirePermission('write'),
    async (req, res, next): Promise<void> => {
      try {
        const { columnId } = req.params;
        const updateData = validateInput(BoardValidation.column.update, req.body);
        const column = await boardService.updateColumn(columnId, updateData);
        res.json({
          success: true,
          data: column,
          message: 'Column updated successfully',
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Delete a column from a board
   *
   * @route DELETE /api/v1/boards/:id/columns/:columnId
   * @auth Required - Write permission
   *
   * @param {string} id - Board ID
   * @param {string} columnId - Column ID to delete
   *
   * @returns {void} No content on successful deletion
   *
   * @example
   * ```bash
   * curl -X DELETE "http://localhost:3000/api/v1/boards/board-123/columns/col-456" \
   *   -H "Authorization: Bearer YOUR_API_KEY"
   * ```
   *
   * @response 204 - Column deleted successfully
   * @response 400 - Column has tasks (cannot delete)
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Column not found
   *
   * @note Cannot delete columns that contain tasks. Move tasks to another column first.
   */
  router.delete(
    '/:id/columns/:columnId',
    requirePermission('write'),
    async (req, res, next): Promise<void> => {
      try {
        const { columnId } = req.params;
        await boardService.deleteColumn(columnId);
        res.status(204).send();
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * Get all tasks in a board with filtering and sorting.
   *
   * @route GET /api/v1/boards/:id/tasks
   * @auth Required - Read permission
   *
   * @param {string} id - Board ID
   * @queryparam {number} limit - Maximum tasks to return (default: 50)
   * @queryparam {number} offset - Pagination offset (default: 0)
   * @queryparam {string} sortBy - Sort field: position, priority, created_at (default: position)
   * @queryparam {string} sortOrder - Sort direction: asc or desc (default: asc)
   * @queryparam {string} column_id - Filter by specific column
   * @queryparam {string} status - Filter by task status
   * @queryparam {string} assignee - Filter by assignee
   * @queryparam {string} search - Search in task titles and descriptions
   *
   * @response 200 - Success with paginated task list
   * ```json
   * {
   *   "success": true,
   *   "data": [
   *     {
   *       "id": "task123",
   *       "title": "Task in board",
   *       "column_id": "col123",
   *       "position": 0,
   *       "status": "in_progress",
   *       "priority": 7
   *     }
   *   ],
   *   "pagination": {
   *     "page": 1,
   *     "limit": 50,
   *     "total": 45,
   *     "totalPages": 1
   *   }
   * }
   * ```
   *
   * @response 400 - Invalid board ID
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Board not found
   */
  // GET /api/v1/boards/:id/tasks - Get board tasks
  router.get('/:id/tasks', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Board ID is required' });
      }

      const {
        limit = 50,
        offset = 0,
        sortBy = 'position',
        sortOrder = 'asc',
        column_id,
        status,
        assignee,
        search,
      } = req.query;

      const options: PaginationOptions & TaskFilters = {
        limit: parseInt(limit as string, 10) || 50,
        offset: parseInt(offset as string, 10) || 0,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        board_id: id,
      };

      if (column_id) options.column_id = column_id as string;
      if (status)
        options.status = status as 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived';
      if (assignee) options.assignee = assignee as string;
      if (search) options.search = search as string;

      const tasks = await taskService.getTasks(options);

      // Get total count for pagination
      const totalTasks = await taskService.getTasks({
        ...options,
        limit: undefined,
        offset: undefined,
      });
      const total = totalTasks.length;

      res.apiPagination({
        data: tasks,
        page: Math.floor((options.offset || 0) / (options.limit || 50)) + 1,
        limit: options.limit || 50,
        total,
      });
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Get analytics and statistics for a board.
   *
   * @route GET /api/v1/boards/:id/analytics
   * @auth Required - Read permission
   *
   * @param {string} id - Board ID
   *
   * @response 200 - Board analytics data
   * ```json
   * {
   *   "success": true,
   *   "data": {
   *     "id": "board123",
   *     "name": "Development Board",
   *     "statistics": {
   *       "total_tasks": 45,
   *       "completed_tasks": 20,
   *       "in_progress_tasks": 15,
   *       "blocked_tasks": 3,
   *       "overdue_tasks": 2,
   *       "completion_rate": 0.44,
   *       "average_task_age_days": 12.5
   *     },
   *     "column_statistics": [
   *       {
   *         "column_id": "col123",
   *         "column_name": "In Progress",
   *         "task_count": 15,
   *         "wip_limit": 10,
   *         "is_over_limit": true
   *       }
   *     ],
   *     "recent_activity": {
   *       "tasks_created_today": 5,
   *       "tasks_completed_today": 3,
   *       "tasks_updated_today": 12
   *     }
   *   }
   * }
   * ```
   *
   * @response 400 - Invalid board ID
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Board not found
   */
  // GET /api/v1/boards/:id/analytics - Get board analytics
  router.get('/:id/analytics', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Board ID is required' });
      }

      const analytics = await boardService.getBoardWithStats(id);
      res.apiSuccess(analytics);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
