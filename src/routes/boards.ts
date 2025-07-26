import { Router } from 'express';
import { BoardService } from '@/services/BoardService';
import { TaskService } from '@/services/TaskService';
import { dbConnection } from '@/database/connection';
import { requirePermission } from '@/middleware/auth';
import { BoardValidation, validateInput } from '@/utils/validation';
import { NotFoundError } from '@/utils/errors';

export async function boardRoutes() {
  const router = Router();
  
  const boardService = new BoardService(dbConnection);
  const taskService = new TaskService(dbConnection);

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

      res.apiPagination(boards, Math.floor(options.offset / options.limit) + 1, options.limit, total);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/boards - Create board
  router.post('/', requirePermission('write'), async (req, res, next) => {
    try {
      const boardData = validateInput(BoardValidation.create, req.body);
      const board = await boardService.createBoard(boardData);
      res.status(201).apiSuccess(board);
    } catch (error) {
      next(error);
    }
  });

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

      res.apiSuccess(board);
    } catch (error) {
      next(error);
    }
  });

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
      res.apiSuccess(board);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/v1/boards/:id - Delete board
  router.delete('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
      }
      
      await boardService.deleteBoard(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/boards/:id/archive - Archive board
  router.post('/:id/archive', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
      }
      
      const board = await boardService.archiveBoard(id);
      res.apiSuccess(board);
    } catch (error) {
      next(error);
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
      res.apiSuccess(board);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/boards/:id/duplicate - Duplicate board
  router.post('/:id/duplicate', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
      }
      
      const { name } = req.body;

      const newBoard = await boardService.duplicateBoard(id, name);
      res.status(201).apiSuccess(newBoard);
    } catch (error) {
      next(error);
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

      res.apiSuccess(boardWithColumns.columns || []);
    } catch (error) {
      next(error);
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
      next(error);
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
      next(error);
    }
  });

  // DELETE /api/v1/boards/:id/columns/:columnId - Delete column
  router.delete('/:id/columns/:columnId', requirePermission('write'), async (req, res, next) => {
    try {
      const { columnId } = req.params;
      await boardService.deleteColumn(columnId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });
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
      const totalTasks = await taskService.getTasks({ ...options, limit: undefined, offset: undefined });
      const total = totalTasks.length;

      res.apiPagination(tasks, Math.floor(options.offset / options.limit) + 1, options.limit, total);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/boards/:id/analytics - Get board analytics
  router.get('/:id/analytics', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Board ID is required' });
      }
      
      const analytics = await boardService.getBoardWithStats(id);
      res.apiSuccess(analytics);
    } catch (error) {
      next(error);
    }
  });

  return router;
}