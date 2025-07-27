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
import { BoardService } from '@/services/BoardService';
import { TaskService } from '@/services/TaskService';
import { dbConnection } from '@/database/connection';
import { requirePermission } from '@/middleware/auth';
import { BoardValidation, validateInput } from '@/utils/validation';
import { NotFoundError } from '@/utils/errors';

/**
 * Create and configure board routes.
 *
 * @returns Express router with all board endpoints configured
 */
export async function boardRoutes(): Promise<void>(): Promise<Router> {
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
  router.get('/', requirePermission('read'), async (req, res, next) => {
    try {
      const {
        limit = 50,
        offset = 0,
        sortBy = 'updated_at',
        sortOrder = 'desc',
        archived,
        search,
      } = req.query;

      const options: any = {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
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
      const { limit: _, offset: __, ...countOptions } = options;
      const totalBoards = await boardService.getBoards(countOptions);
      const total = totalBoards.length;

      return res.apiPagination(
        boards,
        Math.floor(options.offset / options.limit) + 1,
        options.limit,
        total
      );
    } catch (error) {
      return next(error);
    }
  });

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
  router.post('/', requirePermission('write'), async (req, res, next) => {
    try {
      const boardData = validateInput(BoardValidation.create, req.body);
      const board = await boardService.createBoard(boardData);
      return res.status(201).apiSuccess(board);
    } catch (error) {
      return next(error);
    }
  });

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
  router.get('/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { include } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
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

      return res.apiSuccess(board);
    } catch (error) {
      return next(error);
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
  router.patch('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
      }

      const rawUpdateData = validateInput(BoardValidation.update, req.body);
      const updateData = Object.fromEntries(
        Object.entries(rawUpdateData).filter(([, value]) => value !== undefined)
      );
      const board = await boardService.updateBoard(id, updateData);
      return res.apiSuccess(board);
    } catch (error) {
      return next(error);
    }
  });

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
  router.delete('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
      }

      await boardService.deleteBoard(id);
      return res.status(204).send();
    } catch (error) {
      return next(error);
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
  router.post('/:id/archive', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
      }

      const board = await boardService.archiveBoard(id);
      return res.apiSuccess(board);
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/boards/:id/restore - Restore archived board
  router.post('/:id/restore', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
      }

      const board = await boardService.unarchiveBoard(id);
      return res.apiSuccess(board);
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
  router.post('/:id/duplicate', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
      }

      const { name } = req.body;

      const newBoard = await boardService.duplicateBoard(id, name);
      return res.status(201).apiSuccess(newBoard);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/boards/:id/columns - Get board columns
  router.get('/:id/columns', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
      }

      const boardWithColumns = await boardService.getBoardWithColumns(id);

      if (!boardWithColumns) {
        throw new NotFoundError('Board', id);
      }

      return res.apiSuccess(boardWithColumns.columns || []);
    } catch (error) {
      return next(error);
    }
  });

  // TODO: Column routes should be implemented in a separate column service
  // These are commented out as BoardService doesn't have column management methods
  /*
  // POST /api/v1/boards/:id/columns - Create column
  router.post('/:id/columns', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const columnData = validateInput(BoardValidation.column.create, {
        ...req.body,
        board_id: id,
      });
      
      const column = await boardService.createColumn(columnData);
      res.status(201).apiSuccess(column);
    } catch (error) {
      return next(error);
    }
  });

  // PATCH /api/v1/boards/:id/columns/:columnId - Update column
  router.patch('/:id/columns/:columnId', requirePermission('write'), async (req, res, next) => {
    try {
      const { columnId } = req.params;
      const updateData = validateInput(BoardValidation.column.update, req.body);
      const column = await boardService.updateColumn(columnId, updateData);
      res.apiSuccess(column);
    } catch (error) {
      return next(error);
    }
  });

  // DELETE /api/v1/boards/:id/columns/:columnId - Delete column
  router.delete('/:id/columns/:columnId', requirePermission('write'), async (req, res, next) => {
    try {
      const { columnId } = req.params;
      await boardService.deleteColumn(columnId);
      res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });
  */

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
  router.get('/:id/tasks', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
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

      const options: any = {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        board_id: id,
      };

      if (column_id) options.column_id = column_id as string;
      if (status) options.status = status;
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

      return res.apiPagination(
        tasks,
        Math.floor(options.offset / options.limit) + 1,
        options.limit,
        total
      );
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
  router.get('/:id/analytics', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
      }

      const analytics = await boardService.getBoardWithStats(id);
      return res.apiSuccess(analytics);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
