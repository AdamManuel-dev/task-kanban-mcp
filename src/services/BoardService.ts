import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import type {
  Board,
  Column,
  CreateBoardRequest,
  UpdateBoardRequest,
  BoardWithColumns,
  BoardWithStats,
  ServiceError,
  PaginationOptions,
  FilterOptions,
} from '@/types';

export class BoardService {
  constructor(private db: DatabaseConnection) {}

  async createBoard(data: CreateBoardRequest): Promise<Board> {
    const id = uuidv4();
    const now = new Date();
    
    const board: Board = {
      id,
      name: data.name,
      description: data.description,
      color: data.color || '#2196F3',
      created_at: now,
      updated_at: now,
      archived: false,
    };

    try {
      await this.db.transaction(async (db) => {
        await db.run(`
          INSERT INTO boards (id, name, description, color, created_at, updated_at, archived)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [board.id, board.name, board.description, board.color, board.created_at, board.updated_at, board.archived]);

        const defaultColumns = [
          { name: 'Todo', position: 0 },
          { name: 'In Progress', position: 1 },
          { name: 'Done', position: 2 },
        ];

        for (const col of defaultColumns) {
          const columnId = uuidv4();
          await db.run(`
            INSERT INTO columns (id, board_id, name, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [columnId, board.id, col.name, col.position, now, now]);
        }
      });

      logger.info('Board created successfully', { boardId: board.id, name: board.name });
      return board;
    } catch (error) {
      logger.error('Failed to create board', { error, data });
      throw this.createError('BOARD_CREATE_FAILED', 'Failed to create board', error);
    }
  }

  async getBoardById(id: string): Promise<Board | null> {
    try {
      const board = await this.db.queryOne<Board>(`
        SELECT * FROM boards WHERE id = ? AND archived = FALSE
      `, [id]);

      if (board) {
        board.created_at = new Date(board.created_at);
        board.updated_at = new Date(board.updated_at);
      }

      return board || null;
    } catch (error) {
      logger.error('Failed to get board by ID', { error, id });
      throw this.createError('BOARD_FETCH_FAILED', 'Failed to fetch board', error);
    }
  }

  async getBoardWithColumns(id: string): Promise<BoardWithColumns | null> {
    try {
      const board = await this.getBoardById(id);
      if (!board) return null;

      const columns = await this.db.query<Column>(`
        SELECT * FROM columns 
        WHERE board_id = ? 
        ORDER BY position ASC
      `, [id]);

      columns.forEach(col => {
        col.created_at = new Date(col.created_at);
        col.updated_at = new Date(col.updated_at);
      });

      return {
        ...board,
        columns,
      };
    } catch (error) {
      logger.error('Failed to get board with columns', { error, id });
      throw this.createError('BOARD_FETCH_FAILED', 'Failed to fetch board with columns', error);
    }
  }

  async getBoardWithStats(id: string): Promise<BoardWithStats | null> {
    try {
      const board = await this.getBoardById(id);
      if (!board) return null;

      const [taskStats, columnCount] = await Promise.all([
        this.db.queryOne<{
          total: number;
          completed: number;
          in_progress: number;
          todo: number;
        }>(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo
          FROM tasks 
          WHERE board_id = ? AND archived = FALSE
        `, [id]),
        this.db.queryOne<{ count: number }>(`
          SELECT COUNT(*) as count FROM columns WHERE board_id = ?
        `, [id])
      ]);

      return {
        ...board,
        taskCount: taskStats?.total || 0,
        completedTasks: taskStats?.completed || 0,
        inProgressTasks: taskStats?.in_progress || 0,
        todoTasks: taskStats?.todo || 0,
        columnCount: columnCount?.count || 0,
      };
    } catch (error) {
      logger.error('Failed to get board with stats', { error, id });
      throw this.createError('BOARD_FETCH_FAILED', 'Failed to fetch board stats', error);
    }
  }

  async getBoards(options: PaginationOptions & FilterOptions = {}): Promise<Board[]> {
    const {
      limit = 50,
      offset = 0,
      sortBy = 'updated_at',
      sortOrder = 'desc',
      archived = false,
      search,
    } = options;

    try {
      let query = 'SELECT * FROM boards WHERE archived = ?';
      const params: any[] = [archived];

      if (search) {
        query += ' AND (name LIKE ? OR description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const boards = await this.db.query<Board>(query, params);
      
      boards.forEach(board => {
        board.created_at = new Date(board.created_at);
        board.updated_at = new Date(board.updated_at);
      });

      return boards;
    } catch (error) {
      logger.error('Failed to get boards', { error, options });
      throw this.createError('BOARDS_FETCH_FAILED', 'Failed to fetch boards', error);
    }
  }

  async updateBoard(id: string, data: UpdateBoardRequest): Promise<Board> {
    try {
      const existingBoard = await this.getBoardById(id);
      if (!existingBoard) {
        throw this.createError('BOARD_NOT_FOUND', 'Board not found', { id });
      }

      const updates: string[] = [];
      const params: any[] = [];

      if (data.name !== undefined) {
        updates.push('name = ?');
        params.push(data.name);
      }
      if (data.description !== undefined) {
        updates.push('description = ?');
        params.push(data.description);
      }
      if (data.color !== undefined) {
        updates.push('color = ?');
        params.push(data.color);
      }
      if (data.archived !== undefined) {
        updates.push('archived = ?');
        params.push(data.archived);
      }

      if (updates.length === 0) {
        return existingBoard;
      }

      updates.push('updated_at = ?');
      params.push(new Date());

      params.push(id);

      await this.db.execute(`
        UPDATE boards 
        SET ${updates.join(', ')}
        WHERE id = ?
      `, params);

      const updatedBoard = await this.getBoardById(id);
      if (!updatedBoard) {
        throw this.createError('BOARD_UPDATE_FAILED', 'Board disappeared after update');
      }

      logger.info('Board updated successfully', { boardId: id });
      return updatedBoard;
    } catch (error) {
      if (error instanceof Error && error.message.includes('BOARD_')) {
        throw error;
      }
      logger.error('Failed to update board', { error, id, data });
      throw this.createError('BOARD_UPDATE_FAILED', 'Failed to update board', error);
    }
  }

  async deleteBoard(id: string): Promise<void> {
    try {
      const board = await this.getBoardById(id);
      if (!board) {
        throw this.createError('BOARD_NOT_FOUND', 'Board not found', { id });
      }

      await this.db.transaction(async (db) => {
        await db.run('DELETE FROM task_dependencies WHERE task_id IN (SELECT id FROM tasks WHERE board_id = ?)', [id]);
        await db.run('DELETE FROM notes WHERE task_id IN (SELECT id FROM tasks WHERE board_id = ?)', [id]);
        await db.run('DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE board_id = ?)', [id]);
        await db.run('DELETE FROM tasks WHERE board_id = ?', [id]);
        await db.run('DELETE FROM columns WHERE board_id = ?', [id]);
        await db.run('DELETE FROM boards WHERE id = ?', [id]);
      });

      logger.info('Board deleted successfully', { boardId: id });
    } catch (error) {
      if (error instanceof Error && error.message.includes('BOARD_')) {
        throw error;
      }
      logger.error('Failed to delete board', { error, id });
      throw this.createError('BOARD_DELETE_FAILED', 'Failed to delete board', error);
    }
  }

  async archiveBoard(id: string): Promise<Board> {
    return this.updateBoard(id, { archived: true });
  }

  async unarchiveBoard(id: string): Promise<Board> {
    return this.updateBoard(id, { archived: false });
  }

  async duplicateBoard(id: string, newName?: string): Promise<Board> {
    try {
      const originalBoard = await this.getBoardWithColumns(id);
      if (!originalBoard) {
        throw this.createError('BOARD_NOT_FOUND', 'Board not found', { id });
      }

      const duplicatedBoard = await this.createBoard({
        name: newName || `${originalBoard.name} (Copy)`,
        description: originalBoard.description,
        color: originalBoard.color,
      });

      await this.db.transaction(async (db) => {
        await db.run('DELETE FROM columns WHERE board_id = ?', [duplicatedBoard.id]);

        for (const column of originalBoard.columns) {
          const newColumnId = uuidv4();
          await db.run(`
            INSERT INTO columns (id, board_id, name, position, wip_limit, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [newColumnId, duplicatedBoard.id, column.name, column.position, column.wip_limit, new Date(), new Date()]);
        }
      });

      logger.info('Board duplicated successfully', { originalId: id, newId: duplicatedBoard.id });
      return duplicatedBoard;
    } catch (error) {
      if (error instanceof Error && error.message.includes('BOARD_')) {
        throw error;
      }
      logger.error('Failed to duplicate board', { error, id });
      throw this.createError('BOARD_DUPLICATE_FAILED', 'Failed to duplicate board', error);
    }
  }

  private createError(code: string, message: string, originalError?: any): ServiceError {
    const error = new Error(message) as ServiceError;
    error.code = code;
    error.statusCode = this.getStatusCodeForError(code);
    error.details = originalError;
    return error;
  }

  private getStatusCodeForError(code: string): number {
    switch (code) {
      case 'BOARD_NOT_FOUND':
        return 404;
      case 'BOARD_CREATE_FAILED':
      case 'BOARD_UPDATE_FAILED':
      case 'BOARD_DELETE_FAILED':
      case 'BOARD_DUPLICATE_FAILED':
        return 500;
      case 'BOARD_FETCH_FAILED':
      case 'BOARDS_FETCH_FAILED':
        return 500;
      default:
        return 500;
    }
  }
}