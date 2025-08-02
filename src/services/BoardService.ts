/**
 * Board Service - Core business logic for board management
 *
 * @module services/BoardService
 * @description Provides comprehensive board management functionality including CRUD operations,
 * board statistics, archiving, duplication, and column management. Handles board lifecycle
 * and maintains referential integrity with associated tasks and columns.
 *
 * @example
 * ```typescript
 * import { BoardService } from '@/services/BoardService';
 * import { dbConnection } from '@/database/connection';
 *
 * const boardService = new BoardService(dbConnection);
 *
 * // Create a new board with default columns
 * const board = await boardService.createBoard({
 *   name: 'Sprint Planning',
 *   description: 'Q4 feature development',
 *   color: '#2196F3'
 * });
 *
 * // Get board with statistics
 * const stats = await boardService.getBoardWithStats(board.id);
 * logger.log(`Tasks: ${stats.taskCount}, Completion: ${stats.completedTasks}/${stats.taskCount}`);
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import type { DatabaseConnection, QueryParameters, QueryParameter } from '@/database/connection';
import { CreateBoardRequest } from '@/types';
import type {
  Board,
  Column,
  UpdateBoardRequest,
  BoardWithColumns,
  BoardWithStats,
  ServiceError,
  PaginationOptions,
  FilterOptions,
} from '@/types';
import { CacheService } from './CacheService';
import { TrackPerformance } from '../utils/service-metrics';
import { validatePagination } from '../utils/sql-security';

/**
 * Board Service - Manages kanban board operations and lifecycle
 *
 * @class BoardService
 * @description Provides comprehensive board management including creation, retrieval,
 * updates, archiving, and deletion. Automatically creates default columns (Todo, In Progress, Done)
 * for new boards and maintains referential integrity across related entities.
 *
 * @example
 * ```typescript
 * const boardService = new BoardService(dbConnection);
 *
 * // Create board with automatic column setup
 * const board = await boardService.createBoard({
 *   name: 'Project Alpha',
 *   description: 'Main project board'
 * });
 *
 * // Get comprehensive board data
 * const boardWithColumns = await boardService.getBoardWithColumns(board.id);
 * ```
 */
export class BoardService {
  private readonly cache: CacheService<string, Board | null>;

  /**
   * Initialize BoardService with database connection
   *
   * @param {DatabaseConnection} db - Database connection instance
   * @param cache Optional cache service for performance optimization
   */
  constructor(
    private readonly db: DatabaseConnection,
    cache?: CacheService<string, Board | null>
  ) {
    this.cache =
      cache ??
      new CacheService<string, Board | null>({
        maxSize: 100,
        defaultTTL: 120000, // 2 minutes
        enableStats: true,
        evictionPolicy: 'lru',
      });
  }

  /**
   * Create a new board with default columns
   *
   * @param {CreateBoardRequest} data - Board creation data
   * @param {string} data.name - Board name (required)
   * @param {string} [data.description] - Board description
   * @param {string} [data['color'] = '#2196F3'] - Board color in hex format
   * @returns {Promise<Board>} Created board with generated ID and timestamps
   * @throws {ServiceError} If board creation fails
   *
   * @example
   * ```typescript
   * const board = await boardService.createBoard({
   *   name: 'Development Sprint',
   *   description: 'Sprint 1 planning board',
   *   color: '#4CAF50'
   * });
   * logger.log(`Created board: ${board.name} with ID: ${board.id}`);
   * ```
   */
  @TrackPerformance('BoardService')
  async createBoard(data: CreateBoardRequest): Promise<Board> {
    // Validate required fields
    if (!data.name || data.name.trim().length === 0) {
      throw BoardService.createError('INVALID_NAME', 'Board name is required and cannot be empty');
    }

    const id = uuidv4();
    const now = new Date();

    const board: Board = {
      id,
      name: data.name,
      description: data.description,
      color: data.color ?? '#2196F3',
      created_at: now,
      updated_at: now,
      archived: false,
    };

    try {
      await this.db.transaction(async db => {
        await db.run(
          `
          INSERT INTO boards (id, name, description, color, created_at, updated_at, archived)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
          [
            board.id,
            board.name,
            board.description,
            board.color,
            board.created_at,
            board.updated_at,
            board.archived,
          ]
        );

        const defaultColumns = [
          { name: 'Todo', position: 0 },
          { name: 'In Progress', position: 1 },
          { name: 'Done', position: 2 },
        ];

        await Promise.all(
          defaultColumns.map(async col => {
            const columnId = uuidv4();
            await db.run(
              `
            INSERT INTO columns (id, board_id, name, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
              [columnId, board.id, col.name, col.position, now, now]
            );
          })
        );
      });

      logger.info('Board created successfully', { boardId: board.id, name: board.name });
      return board;
    } catch (error) {
      logger.error('Failed to create board', { error, data });
      throw BoardService.createError('BOARD_CREATE_FAILED', 'Failed to create board', error);
    }
  }

  /**
   * Get a board by its ID
   *
   * @param {string} id - Board ID (UUID)
   * @returns {Promise<Board | null>} Board object or null if not found
   * @throws {ServiceError} If database query fails
   *
   * @example
   * ```typescript
   * const board = await boardService.getBoardById('board-123');
   * if (board) {
   *   logger.log(`Found board: ${board.name}`);
   * } else {
   *   logger.log('Board not found');
   * }
   * ```
   */
  @TrackPerformance('BoardService')
  async getBoardById(id: string): Promise<Board | null> {
    const cacheKey = `board:${id}`;

    // Try to get from cache first
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      logger.debug('Board retrieved from cache', { boardId: id });
      return cached;
    }

    try {
      const board = await this.db.queryOne<Board>(
        `
        SELECT * FROM boards WHERE id = ? AND archived = FALSE
      `,
        [id]
      );

      if (board) {
        const boardData = { ...board };
        boardData.created_at = new Date(boardData.created_at);
        boardData.updated_at = new Date(boardData.updated_at);
        Object.assign(board, boardData);

        // Cache the board for 5 minutes
        this.cache.set(cacheKey, board, 300000);
        logger.debug('Board cached', { boardId: id });
      } else {
        // Cache null result for 1 minute to avoid repeated queries
        this.cache.set(cacheKey, null, 60000);
      }

      return board ?? null;
    } catch (error) {
      logger.error('Failed to get board by ID', { error, id });
      throw BoardService.createError('BOARD_FETCH_FAILED', 'Failed to fetch board', error);
    }
  }

  /**
   * Get a board with its associated columns
   *
   * @param {string} id - Board ID (UUID)
   * @returns {Promise<BoardWithColumns | null>} Board with columns array or null if not found
   * @throws {ServiceError} If database query fails
   *
   * @example
   * ```typescript
   * const boardWithColumns = await boardService.getBoardWithColumns('board-123');
   * if (boardWithColumns) {
   *   logger.log(`Board has ${boardWithColumns.columns.length} columns`);
   *   boardWithColumns.columns.forEach(col => {
   *     logger.log(`Column: ${col.name} (position: ${col.position})`);
   *   });
   * }
   * ```
   */
  async getBoardWithColumns(id: string): Promise<BoardWithColumns | null> {
    try {
      const board = await this.getBoardById(id);
      if (!board) return null;

      const columns = await this.db.query<Column>(
        `
        SELECT * FROM columns 
        WHERE board_id = ? 
        ORDER BY position ASC
      `,
        [id]
      );

      columns.forEach(col => {
        const column = { ...col };
        column.created_at = new Date(column.created_at);
        column.updated_at = new Date(column.updated_at);
        Object.assign(col, column);
      });

      return { ...board, columns };
    } catch (error) {
      logger.error('Failed to get board with columns', { error, id });
      throw BoardService.createError(
        'BOARD_FETCH_FAILED',
        'Failed to fetch board with columns',
        error
      );
    }
  }

  /**
   * Get a board with comprehensive statistics
   *
   * @param {string} id - Board ID (UUID)
   * @returns {Promise<BoardWithStats | null>} Board with task statistics or null if not found
   * @throws {ServiceError} If database query fails
   *
   * @example
   * ```typescript
   * const stats = await boardService.getBoardWithStats('board-123');
   * if (stats) {
   *   logger.log(`Board: ${stats.name}`);
   *   logger.log(`Total tasks: ${String(String(stats.taskCount))}`);
   *   logger.log(`Completed: ${String(String(stats.completedTasks))}`);
   *   logger.log(`In progress: ${String(String(stats.inProgressTasks))}`);
   *   logger.log(`Todo: ${String(String(stats.todoTasks))}`);
   *   logger.log(`Columns: ${String(String(stats.columnCount))}`);
   * }
   * ```
   */
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
        }>(
          `
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo
          FROM tasks 
          WHERE board_id = ? AND archived = FALSE
        `,
          [id]
        ),
        this.db.queryOne<{ count: number }>(
          `
          SELECT COUNT(*) as count FROM columns WHERE board_id = ?
        `,
          [id]
        ),
      ]);

      return {
        ...board,
        taskCount: taskStats?.total ?? 0,
        completedTasks: taskStats?.completed ?? 0,
        inProgressTasks: taskStats?.in_progress ?? 0,
        todoTasks: taskStats?.todo ?? 0,
        columnCount: columnCount?.count ?? 0,
      };
    } catch (error) {
      logger.error('Failed to get board with stats', { error, id });
      throw BoardService.createError('BOARD_FETCH_FAILED', 'Failed to fetch board stats', error);
    }
  }

  /**
   * Get multiple boards with filtering and pagination
   *
   * @param {PaginationOptions & FilterOptions} [options={}] - Query options
   * @param {number} [options['limit'] = 50] - Maximum number of boards to return
   * @param {number} [options.offset=0] - Number of boards to skip
   * @param {string} [options.sortBy='updated_at'] - Field to sort by
   * @param {'asc'|'desc'} [options.sortOrder='desc'] - Sort direction
   * @param {boolean} [options.archived=false] - Include archived boards
   * @param {string} [options.search] - Search term for name/description
   * @returns {Promise<Board[]>} Array of boards matching criteria
   * @throws {ServiceError} If database query fails
   *
   * @example
   * ```typescript
   * // Get recent active boards
   * const boards = await boardService.getBoards({
   *   limit: 10,
   *   sortBy: 'updated_at',
   *   sortOrder: 'desc'
   * });
   *
   * // Search boards
   * const searchResults = await boardService.getBoards({
   *   search: 'development',
   *   limit: 5
   * });
   * ```
   */
  @TrackPerformance('BoardService')
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
      const params: QueryParameters = [archived];

      if (search) {
        query += ' AND (name LIKE ? OR description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      // Use secure pagination to prevent ORDER BY injection
      const paginationResult = validatePagination({ limit, offset, sortBy, sortOrder }, 'boards');
      query += ` ${paginationResult.orderByClause} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const boards = await this.db.query<Board>(query, params);

      boards.forEach(board => {
        const boardData = { ...board };
        boardData.created_at = new Date(boardData.created_at);
        boardData.updated_at = new Date(boardData.updated_at);
        Object.assign(board, boardData);
      });

      return boards;
    } catch (error) {
      logger.error('Failed to get boards', { error, options });
      throw BoardService.createError('BOARDS_FETCH_FAILED', 'Failed to fetch boards', error);
    }
  }

  /**
   * Update an existing board
   *
   * @param {string} id - Board ID (UUID)
   * @param {UpdateBoardRequest} data - Update data
   * @param {string} [data.name] - New board name
   * @param {string} [data.description] - New board description
   * @param {string} [data.color] - New board color
   * @param {boolean} [data.archived] - Archive status
   * @returns {Promise<Board>} Updated board
   * @throws {ServiceError} If board not found or update fails
   *
   * @example
   * ```typescript
   * const updatedBoard = await boardService.updateBoard('board-123', {
   *   name: 'Updated Sprint Board',
   *   description: 'Updated description',
   *   color: '#FF5722'
   * });
   * logger.log(`Updated board: ${String(String(updatedBoard.name))}`);
   * ```
   */
  async updateBoard(id: string, data: UpdateBoardRequest): Promise<Board> {
    try {
      const existingBoard = await this.getBoardById(id);
      if (!existingBoard) {
        throw BoardService.createError('BOARD_NOT_FOUND', 'Board not found', { id });
      }

      const updates: string[] = [];
      const params: QueryParameters = [];

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

      await this.db.execute(
        `
        UPDATE boards 
        SET ${updates.join(', ')}
        WHERE id = ?
      `,
        params
      );

      const updatedBoard = await this.getBoardById(id);
      if (!updatedBoard) {
        throw BoardService.createError('BOARD_UPDATE_FAILED', 'Board disappeared after update');
      }

      logger.info('Board updated successfully', { boardId: id });
      return updatedBoard;
    } catch (error) {
      if (error instanceof Error && error.message.includes('BOARD_')) {
        throw error;
      }
      logger.error('Failed to update board', { error, id, data });
      throw BoardService.createError('BOARD_UPDATE_FAILED', 'Failed to update board', error);
    }
  }

  /**
   * Permanently delete a board and all associated data
   *
   * @param {string} id - Board ID (UUID)
   * @returns {Promise<void>}
   * @throws {ServiceError} If board not found or deletion fails
   *
   * @example
   * ```typescript
   * // WARNING: This permanently deletes the board and all its data
   * await boardService.deleteBoard('board-123');
   * logger.log('Board and all associated data deleted');
   * ```
   */
  async deleteBoard(id: string): Promise<void> {
    try {
      const board = await this.getBoardById(id);
      if (!board) {
        throw BoardService.createError('BOARD_NOT_FOUND', 'Board not found', { id });
      }

      await this.db.transaction(async db => {
        await db.run(
          'DELETE FROM task_dependencies WHERE task_id IN (SELECT id FROM tasks WHERE board_id = ?)',
          [id]
        );
        await db.run(
          'DELETE FROM notes WHERE task_id IN (SELECT id FROM tasks WHERE board_id = ?)',
          [id]
        );
        // Delete in order that respects foreign key constraints
        await db.run(
          'DELETE FROM task_tags WHERE task_id IN (SELECT id FROM tasks WHERE board_id = ?)',
          [id]
        );
        await Promise.all([
          db.run('DELETE FROM tasks WHERE board_id = ?', [id]),
          db.run('DELETE FROM columns WHERE board_id = ?', [id]),
        ]);
        await db.run('DELETE FROM boards WHERE id = ?', [id]);
      });

      logger.info('Board deleted successfully', { boardId: id });
    } catch (error) {
      if (error instanceof Error && error.message.includes('BOARD_')) {
        throw error;
      }
      logger.error('Failed to delete board', { error, id });
      throw BoardService.createError('BOARD_DELETE_FAILED', 'Failed to delete board', error);
    }
  }

  /**
   * Archive a board (soft delete)
   *
   * @param {string} id - Board ID (UUID)
   * @returns {Promise<Board>} Archived board
   * @throws {ServiceError} If board not found or archiving fails
   *
   * @example
   * ```typescript
   * const archivedBoard = await boardService.archiveBoard('board-123');
   * logger.log(`Archived board: ${String(String(archivedBoard.name))}`);
   * ```
   */
  async archiveBoard(id: string): Promise<Board> {
    return this.updateBoard(id, { archived: true });
  }

  /**
   * Unarchive a board (restore from soft delete)
   *
   * @param {string} id - Board ID (UUID)
   * @returns {Promise<Board>} Unarchived board
   * @throws {ServiceError} If board not found or unarchiving fails
   *
   * @example
   * ```typescript
   * const restoredBoard = await boardService.unarchiveBoard('board-123');
   * logger.log(`Restored board: ${String(String(restoredBoard.name))}`);
   * ```
   */
  async unarchiveBoard(id: string): Promise<Board> {
    return this.updateBoard(id, { archived: false });
  }

  /**
   * Create a duplicate of an existing board with its columns
   *
   * @param {string} id - Source board ID (UUID)
   * @param {string} [newName] - Name for the duplicated board (defaults to "Original Name (Copy)")
   * @returns {Promise<Board>} Newly created duplicate board
   * @throws {ServiceError} If source board not found or duplication fails
   *
   * @example
   * ```typescript
   * // Duplicate with auto-generated name
   * const duplicate = await boardService.duplicateBoard('board-123');
   * logger.log(`Created duplicate: ${String(String(duplicate.name))}`);
   *
   * // Duplicate with custom name
   * const namedDuplicate = await boardService.duplicateBoard('board-123', 'Sprint 2 Board');
   * ```
   */
  async duplicateBoard(id: string, newName?: string): Promise<Board> {
    try {
      const originalBoard = await this.getBoardWithColumns(id);
      if (!originalBoard) {
        throw BoardService.createError('BOARD_NOT_FOUND', 'Board not found', { id });
      }

      const duplicatedBoard = await this.createBoard({
        name: newName ?? `${String(String(originalBoard.name))} (Copy)`,
        description: originalBoard.description,
        color: originalBoard.color,
      });

      await this.db.transaction(async db => {
        await db.run('DELETE FROM columns WHERE board_id = ?', [duplicatedBoard.id]);

        await Promise.all(
          originalBoard.columns.map(async column => {
            const newColumnId = uuidv4();
            await db.run(
              `
              INSERT INTO columns (id, board_id, name, position, wip_limit, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
              [
                newColumnId,
                duplicatedBoard.id,
                column.name,
                column.position,
                column.wip_limit,
                new Date(),
                new Date(),
              ]
            );
          })
        );
      });

      logger.info('Board duplicated successfully', { originalId: id, newId: duplicatedBoard.id });
      return duplicatedBoard;
    } catch (error) {
      if (error instanceof Error && error.message.includes('BOARD_')) {
        throw error;
      }
      logger.error('Failed to duplicate board', { error, id });
      throw BoardService.createError('BOARD_DUPLICATE_FAILED', 'Failed to duplicate board', error);
    }
  }

  /**
   * Create a new column for a board
   *
   * @param {object} data - Column creation data
   * @param {string} data.board_id - Board ID to create column in
   * @param {string} data.name - Column name
   * @param {number} data.position - Column position
   * @param {number} [data.wip_limit] - Optional WIP limit
   * @returns {Promise<Column>} Created column
   * @throws {ServiceError} If board not found or creation fails
   *
   * @example
   * ```typescript
   * const column = await boardService.createColumn({
   *   board_id: 'board-123',
   *   name: 'In Review',
   *   position: 2,
   *   wip_limit: 3
   * });
   * ```
   */
  async createColumn(data: {
    board_id: string;
    name: string;
    position: number;
    wip_limit?: number;
  }): Promise<Column> {
    try {
      // Verify board exists
      const board = await this.getBoardById(data.board_id);
      if (!board) {
        throw BoardService.createError('BOARD_NOT_FOUND', 'Board not found', {
          board_id: data.board_id,
        });
      }

      const columnId = uuidv4();
      const now = new Date();

      await this.db.query(
        `
        INSERT INTO columns (id, board_id, name, position, wip_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [columnId, data.board_id, data.name, data.position, data.wip_limit ?? null, now, now]
      );

      const columnResult = await this.db.query<Column>('SELECT * FROM columns WHERE id = ?', [
        columnId,
      ]);

      if (!columnResult || columnResult.length === 0) {
        throw BoardService.createError('COLUMN_CREATE_FAILED', 'Failed to retrieve created column');
      }

      logger.info('Column created successfully', {
        columnId,
        board_id: data.board_id,
        name: data.name,
      });
      return columnResult[0];
    } catch (error) {
      if (
        (error instanceof Error && error.message.includes('BOARD_')) ||
        (error instanceof Error && error.message.includes('COLUMN_'))
      ) {
        throw error;
      }
      logger.error('Failed to create column', { error, data });
      throw BoardService.createError('COLUMN_CREATE_FAILED', 'Failed to create column', error);
    }
  }

  /**
   * Update an existing column
   *
   * @param {string} id - Column ID to update
   * @param {object} data - Update data
   * @param {string} [data.name] - New column name
   * @param {number} [data.position] - New column position
   * @param {number} [data.wip_limit] - New WIP limit
   * @returns {Promise<Column>} Updated column
   * @throws {ServiceError} If column not found or update fails
   *
   * @example
   * ```typescript
   * const column = await boardService.updateColumn('col-123', {
   *   name: 'In Progress',
   *   wip_limit: 5
   * });
   * ```
   */
  async updateColumn(
    id: string,
    data: {
      name?: string;
      position?: number;
      wip_limit?: number;
    }
  ): Promise<Column> {
    try {
      // Verify column exists
      const existingColumnResults = await this.db.query<Column>(
        'SELECT * FROM columns WHERE id = ?',
        [id]
      );

      if (!existingColumnResults.length) {
        throw BoardService.createError('COLUMN_NOT_FOUND', 'Column not found', { id });
      }

      const existingColumn = existingColumnResults[0];

      const updateFields: string[] = [];
      const updateValues: QueryParameter[] = [];

      if (data.name !== undefined) {
        updateFields.push('name = ?');
        updateValues.push(data.name);
      }

      if (data.position !== undefined) {
        updateFields.push('position = ?');
        updateValues.push(data.position);
      }

      if (data.wip_limit !== undefined) {
        updateFields.push('wip_limit = ?');
        updateValues.push(data.wip_limit);
      }

      if (updateFields.length === 0) {
        // No updates, return existing column
        return existingColumn;
      }

      updateFields.push('updated_at = ?');
      updateValues.push(new Date());
      updateValues.push(id);

      await this.db.query(
        `UPDATE columns SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      const updatedColumnResults = await this.db.query<Column>(
        'SELECT * FROM columns WHERE id = ?',
        [id]
      );

      if (!updatedColumnResults.length) {
        throw BoardService.createError('COLUMN_UPDATE_FAILED', 'Failed to retrieve updated column');
      }

      const updatedColumn = updatedColumnResults[0];
      logger.info('Column updated successfully', { id, updates: data });
      return updatedColumn;
    } catch (error) {
      if (error instanceof Error && error.message.includes('COLUMN_')) {
        throw error;
      }
      logger.error('Failed to update column', { error, id, data });
      throw BoardService.createError('COLUMN_UPDATE_FAILED', 'Failed to update column', error);
    }
  }

  /**
   * Delete a column and handle task reassignment
   *
   * @param {string} id - Column ID to delete
   * @returns {Promise<void>}
   * @throws {ServiceError} If column not found, has tasks, or deletion fails
   *
   * @example
   * ```typescript
   * await boardService.deleteColumn('col-123');
   * ```
   */
  async deleteColumn(id: string): Promise<void> {
    try {
      // Verify column exists
      const columnResult = await this.db.query<Column>('SELECT * FROM columns WHERE id = ?', [id]);

      if (!columnResult || columnResult.length === 0) {
        throw BoardService.createError('COLUMN_NOT_FOUND', 'Column not found', { id });
      }

      // Check if column has tasks
      const taskCountResult = await this.db.query<{ count: number }>(
        'SELECT COUNT(*) as count FROM tasks WHERE column_id = ? AND archived = FALSE',
        [id]
      );

      if (taskCountResult && taskCountResult.length > 0 && taskCountResult[0].count > 0) {
        throw BoardService.createError(
          'COLUMN_HAS_TASKS',
          'Cannot delete column with tasks. Move tasks to another column first.',
          { id, taskCount: taskCountResult[0].count }
        );
      }

      await this.db.query('DELETE FROM columns WHERE id = ?', [id]);

      logger.info('Column deleted successfully', { id, board_id: columnResult[0].board_id });
    } catch (error) {
      if (error instanceof Error && error.message.includes('COLUMN_')) {
        throw error;
      }
      logger.error('Failed to delete column', { error, id });
      throw BoardService.createError('COLUMN_DELETE_FAILED', 'Failed to delete column', error);
    }
  }

  /**
   * Create a standardized service error
   *
   * @private
   * @param {string} code - Error code for categorization
   * @param {string} message - Human-readable error message
   * @param {any} [originalError] - Original error object for debugging
   * @returns {ServiceError} Formatted service error with status code
   */
  private static createError(code: string, message: string, originalError?: unknown): ServiceError {
    const error = new Error(message) as ServiceError;
    error.code = code;
    error.statusCode = BoardService.getStatusCodeForError(code);
    error.details = originalError as ServiceError['details'];
    return error;
  }

  /**
   * Map error codes to appropriate HTTP status codes
   *
   * @private
   * @param {string} code - Error code
   * @returns {number} HTTP status code
   */
  private static getStatusCodeForError(code: string): number {
    switch (code) {
      case 'BOARD_NOT_FOUND':
      case 'COLUMN_NOT_FOUND':
        return 404;
      case 'INVALID_NAME':
      case 'COLUMN_HAS_TASKS':
        return 400;
      case 'BOARD_CREATE_FAILED':
      case 'BOARD_UPDATE_FAILED':
      case 'BOARD_DELETE_FAILED':
      case 'BOARD_DUPLICATE_FAILED':
      case 'COLUMN_CREATE_FAILED':
      case 'COLUMN_UPDATE_FAILED':
      case 'COLUMN_DELETE_FAILED':
        return 500;
      case 'BOARD_FETCH_FAILED':
      case 'BOARDS_FETCH_FAILED':
        return 500;
      default:
        return 500;
    }
  }
}
