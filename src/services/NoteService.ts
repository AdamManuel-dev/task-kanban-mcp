/**
 * Note Service - Core business logic for note management
 *
 * @module services/NoteService
 * @description Provides comprehensive note management functionality including CRUD operations,
 * search capabilities, categorization, pinning, and note statistics. Supports task-associated
 * notes with categories for progress tracking, blockers, decisions, and questions.
 *
 * @example
 * ```typescript
 * import { NoteService } from '@/services/NoteService';
 * import { dbConnection } from '@/database/connection';
 *
 * const noteService = new NoteService(dbConnection);
 *
 * // Create a blocker note
 * const note = await noteService.createNote({
 *   task_id: 'task-123',
 *   content: 'Waiting for API credentials from client',
 *   category: 'blocker',
 *   pinned: true
 * });
 *
 * // Search notes across boards
 * const results = await noteService.searchNotes({
 *   query: 'API',
 *   board_id: 'board-123',
 *   highlight: true
 * });
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import type { DatabaseConnection, QueryParameters } from '@/database/connection';
import type { Note, ServiceError, PaginationOptions, FilterOptions } from '@/types';
import { validatePagination } from '../utils/sql-security';

/**
 * Request interface for creating new notes
 *
 * @interface CreateNoteRequest
 * @description Defines the structure for note creation requests with required task association
 */
export interface CreateNoteRequest {
  task_id: string;
  content: string;
  category?: Note['category'];
  pinned?: boolean;
}

/**
 * Request interface for updating existing notes
 *
 * @interface UpdateNoteRequest
 * @description All fields are optional to support partial updates
 */
export interface UpdateNoteRequest {
  content?: string;
  category?: Note['category'];
  pinned?: boolean;
}

/**
 * Advanced filtering options for note queries
 *
 * @interface NoteFilters
 * @extends FilterOptions
 * @description Provides comprehensive filtering capabilities including task/board scope,
 * category filtering, pinned status, content search, and date ranges
 */
export interface NoteFilters extends FilterOptions {
  task_id?: string;
  category?: Note['category'];
  pinned?: boolean;
  content_search?: string;
  board_id?: string;
  date_from?: Date;
  date_to?: Date;
}

/**
 * Options for note search functionality
 *
 * @interface NoteSearchOptions
 * @extends PaginationOptions
 * @description Defines search parameters including query text, scope filters,
 * and highlighting options
 */
export interface NoteSearchOptions extends PaginationOptions {
  query: string;
  task_id?: string;
  board_id?: string;
  category?: Note['category'];
  pinned_only?: boolean;
  highlight?: boolean;
}

/**
 * Note search result with additional context
 *
 * @interface NoteSearchResult
 * @extends Note
 * @description Includes task/board context and search relevance information
 */
export interface NoteSearchResult extends Note {
  task_title?: string;
  board_name?: string;
  relevance_score?: number;
  highlighted_content?: string;
}

/**
 * Note Service - Manages all note-related operations
 *
 * @class NoteService
 * @description Core service class providing comprehensive note management functionality.
 * Handles note CRUD operations, search, categorization, and statistics with proper
 * transaction handling and task association validation.
 */
export class NoteService {
  /**
   * Creates a new NoteService instance
   *
   * @param db Database connection instance for note operations
   */
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Creates a new note associated with a task
   *
   * @param data Note creation data including task association and content
   * @returns Promise resolving to the created note with generated ID and timestamps
   *
   * @throws {ServiceError} NOTE_CREATE_FAILED - When note creation fails
   * @throws {Error} Task not found - When specified task_id doesn't exist
   *
   * @example
   * ```typescript
   * const note = await noteService.createNote({
   *   task_id: 'task-123',
   *   content: 'Implementation completed, ready for review',
   *   category: 'progress',
   *   pinned: false
   * });
   * ```
   *
   * @since 1.0.0
   */
  async createNote(data: CreateNoteRequest): Promise<Note> {
    const id = uuidv4();
    const now = new Date();

    const note: Note = {
      id,
      task_id: data.task_id,
      content: data.content,
      category: data.category ?? 'general',
      pinned: data.pinned ?? false,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.db.transaction(async db => {
        const taskExists = await db.get('SELECT id FROM tasks WHERE id = ?', [data.task_id]);
        if (!taskExists) {
          throw new Error('Task not found');
        }

        await db.run(
          `
          INSERT INTO notes (id, task_id, content, category, pinned, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
          [
            note.id,
            note.task_id,
            note.content,
            note.category,
            note.pinned,
            note.created_at,
            note.updated_at,
          ]
        );
      });

      logger.info('Note created successfully', { noteId: note.id, taskId: data.task_id });
      return note;
    } catch (error) {
      logger.error('Failed to create note', { error, data });
      throw NoteService.createError('NOTE_CREATE_FAILED', 'Failed to create note', error);
    }
  }

  /**
   * Retrieves a single note by its ID
   *
   * @param id Unique note identifier
   * @returns Promise resolving to the note if found, null otherwise
   *
   * @throws {ServiceError} NOTE_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * const note = await noteService.getNoteById('note-123');
   * if (note) {
   *   logger.log(`Note: ${String(String(note.content))}`);
   * }
   * ```
   */
  async getNoteById(id: string): Promise<Note | null> {
    try {
      const note = await this.db.queryOne<Note>(
        `
        SELECT * FROM notes WHERE id = ?
      `,
        [id]
      );

      if (note) {
        NoteService.convertNoteDates(note);
      }

      return note ?? null;
    } catch (error) {
      logger.error('Failed to get note by ID', { error, id });
      throw NoteService.createError('NOTE_FETCH_FAILED', 'Failed to fetch note', error);
    }
  }

  /**
   * Retrieves notes with advanced filtering, pagination, and sorting
   *
   * @param options Comprehensive options for filtering, pagination, and sorting
   * @returns Promise resolving to array of notes matching the criteria
   *
   * @throws {ServiceError} NOTES_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * // Get recent blocker notes for a board
   * const blockers = await noteService.getNotes({
   *   board_id: 'board-123',
   *   category: 'blocker',
   *   sortBy: 'created_at',
   *   sortOrder: 'desc',
   *   limit: 20
   * });
   *
   * // Search notes by content
   * const searchResults = await noteService.getNotes({
   *   content_search: 'deployment',
   *   date_from: new Date('2025-01-01')
   * });
   * ```
   */
  async getNotes(options: PaginationOptions & NoteFilters = {}): Promise<Note[]> {
    const {
      limit = 50,
      offset = 0,
      sortBy = 'updated_at',
      sortOrder = 'desc',
      task_id: taskId,
      category,
      pinned,
      content_search: contentSearch,
      board_id: boardId,
      date_from: dateFrom,
      date_to: dateTo,
    } = options;

    try {
      let query = 'SELECT n.* FROM notes n';
      const params: QueryParameters = [];
      const conditions: string[] = [];

      if (boardId) {
        query += ' INNER JOIN tasks t ON n.task_id = t.id';
        conditions.push('t.board_id = ?');
        params.push(boardId);
      }

      if (taskId) {
        conditions.push('n.task_id = ?');
        params.push(taskId);
      }

      if (category) {
        conditions.push('n.category = ?');
        params.push(category);
      }

      if (pinned !== undefined) {
        conditions.push('n.pinned = ?');
        params.push(pinned);
      }

      if (contentSearch) {
        conditions.push('n.content LIKE ?');
        params.push(`%${String(contentSearch)}%`);
      }

      if (dateFrom) {
        conditions.push('n.created_at >= ?');
        params.push(dateFrom);
      }

      if (dateTo) {
        conditions.push('n.created_at <= ?');
        params.push(dateTo);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      // Use secure pagination to prevent ORDER BY injection
      const paginationClause = validatePagination(sortBy, sortOrder, 'notes', 'n');
      query += ` ${paginationClause} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const notes = await this.db.query<Note>(query, params);
      notes.forEach(note => NoteService.convertNoteDates(note));

      return notes;
    } catch (error) {
      logger.error('Failed to get notes', { error, options });
      throw NoteService.createError('NOTES_FETCH_FAILED', 'Failed to fetch notes', error);
    }
  }

  /**
   * Retrieves all notes for a specific task
   *
   * @param taskId ID of the task
   * @param options Pagination options
   * @returns Promise resolving to array of task notes
   *
   * @throws {ServiceError} NOTES_FETCH_FAILED - When query fails
   *
   * @example
   * ```typescript
   * const taskNotes = await noteService.getTaskNotes('task-123', {
   *   sortBy: 'created_at',
   *   sortOrder: 'asc'
   * });
   * ```
   */
  async getTaskNotes(taskId: string, options: PaginationOptions = {}): Promise<Note[]> {
    return this.getNotes({
      ...options,
      task_id: taskId,
    });
  }

  /**
   * Retrieves all pinned notes with optional scope filtering
   *
   * @param options Filtering and pagination options
   * @returns Promise resolving to array of pinned notes
   *
   * @throws {ServiceError} NOTES_FETCH_FAILED - When query fails
   *
   * @example
   * ```typescript
   * // Get pinned notes for a board
   * const pinnedNotes = await noteService.getPinnedNotes({
   *   board_id: 'board-123'
   * });
   * ```
   */
  async getPinnedNotes(
    options: PaginationOptions & { task_id?: string; board_id?: string } = {}
  ): Promise<Note[]> {
    return this.getNotes({
      ...options,
      pinned: true,
    });
  }

  /**
   * Updates an existing note
   *
   * @param id Unique note identifier
   * @param data Partial note data to update (only provided fields will be changed)
   * @returns Promise resolving to the updated note
   *
   * @throws {ServiceError} NOTE_NOT_FOUND - When note doesn't exist
   * @throws {ServiceError} NOTE_UPDATE_FAILED - When update operation fails
   *
   * @example
   * ```typescript
   * const updated = await noteService.updateNote('note-123', {
   *   content: 'Updated: Implementation completed and tested',
   *   category: 'progress',
   *   pinned: true
   * });
   * ```
   */
  async updateNote(id: string, data: UpdateNoteRequest): Promise<Note> {
    try {
      const existingNote = await this.getNoteById(id);
      if (!existingNote) {
        throw NoteService.createError('NOTE_NOT_FOUND', 'Note not found', { id });
      }

      const updates: string[] = [];
      const params: QueryParameters = [];

      if (data.content !== undefined) {
        updates.push('content = ?');
        params.push(data.content);
      }
      if (data.category !== undefined) {
        updates.push('category = ?');
        params.push(data.category);
      }
      if (data.pinned !== undefined) {
        updates.push('pinned = ?');
        params.push(data.pinned);
      }

      if (updates.length === 0) {
        return existingNote;
      }

      updates.push('updated_at = ?');
      params.push(new Date());
      params.push(id);

      await this.db.execute(
        `
        UPDATE notes 
        SET ${String(String(updates.join(', ')))}
        WHERE id = ?
      `,
        params
      );

      const updatedNote = await this.getNoteById(id);
      if (!updatedNote) {
        throw NoteService.createError('NOTE_UPDATE_FAILED', 'Note disappeared after update');
      }

      logger.info('Note updated successfully', { noteId: id });
      return updatedNote;
    } catch (error) {
      if (error instanceof Error && error.message.includes('NOTE_')) {
        throw error;
      }
      logger.error('Failed to update note', { error, id, data });
      throw NoteService.createError('NOTE_UPDATE_FAILED', 'Failed to update note', error);
    }
  }

  /**
   * Permanently deletes a note
   *
   * @param id Unique note identifier
   * @returns Promise that resolves when deletion is complete
   *
   * @throws {ServiceError} NOTE_NOT_FOUND - When note doesn't exist
   * @throws {ServiceError} NOTE_DELETE_FAILED - When deletion fails
   *
   * @example
   * ```typescript
   * await noteService.deleteNote('note-123');
   * ```
   */
  async deleteNote(id: string): Promise<void> {
    try {
      const note = await this.getNoteById(id);
      if (!note) {
        throw NoteService.createError('NOTE_NOT_FOUND', 'Note not found', { id });
      }

      const result = await this.db.execute('DELETE FROM notes WHERE id = ?', [id]);

      if (result.changes === 0) {
        throw NoteService.createError('NOTE_DELETE_FAILED', 'Failed to delete note');
      }

      logger.info('Note deleted successfully', { noteId: id });
    } catch (error) {
      if (error instanceof Error && error.message.includes('NOTE_')) {
        throw error;
      }
      logger.error('Failed to delete note', { error, id });
      throw NoteService.createError('NOTE_DELETE_FAILED', 'Failed to delete note', error);
    }
  }

  /**
   * Searches notes with relevance scoring and optional highlighting
   *
   * @param options Search parameters including query and filters
   * @returns Promise resolving to array of search results with context
   *
   * @throws {ServiceError} NOTE_SEARCH_FAILED - When search fails
   *
   * @description Performs full-text search across note content with:
   * - Relevance scoring based on match quality
   * - Optional content highlighting
   * - Task and board context inclusion
   *
   * @example
   * ```typescript
   * const results = await noteService.searchNotes({
   *   query: 'authentication',
   *   board_id: 'board-123',
   *   category: 'decision',
   *   highlight: true,
   *   limit: 10
   * });
   *
   * results.forEach(result => {
   *   logger.log(`${String(String(result.task_title))}: ${String(String(result.highlighted_content))}`);
   * });
   * ```
   */
  async searchNotes(options: NoteSearchOptions): Promise<NoteSearchResult[]> {
    const {
      query,
      limit = 50,
      offset = 0,
      sortBy = 'relevance',
      sortOrder = 'desc',
      task_id,
      board_id,
      category,
      pinned_only,
      highlight = true,
    } = options;

    try {
      let sql = `
        SELECT 
          n.*,
          t.title as task_title,
          b.name as board_name,
          CASE 
            WHEN n.content LIKE ? THEN 10
            WHEN n.content LIKE ? THEN 5
            ELSE 1 
          END as relevance_score
        FROM notes n
        INNER JOIN tasks t ON n.task_id = t.id
        INNER JOIN boards b ON t.board_id = b.id
        WHERE n.content LIKE ?
      `;

      const searchTerm = `%${String(query)}%`;
      const exactMatch = `%${String(query)}%`;
      const wordBoundary = `% ${String(query)} %`;

      const params: QueryParameters = [exactMatch, wordBoundary, searchTerm];
      const conditions: string[] = [];

      if (task_id) {
        conditions.push('n.task_id = ?');
        params.push(task_id);
      }

      if (board_id) {
        conditions.push('b.id = ?');
        params.push(board_id);
      }

      if (category) {
        conditions.push('n.category = ?');
        params.push(category);
      }

      if (pinned_only) {
        conditions.push('n.pinned = TRUE');
      }

      if (conditions.length > 0) {
        sql += ` AND ${String(String(conditions.join(' AND ')))}`;
      }

      if (sortBy === 'relevance') {
        sql += ' ORDER BY relevance_score DESC, n.updated_at DESC';
      } else {
        // Use secure pagination to prevent ORDER BY injection
        const paginationClause = validatePagination(sortBy, sortOrder, 'notes', 'n');
        sql += ` ${paginationClause.replace('ORDER BY', '')}`;
      }

      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const results = await this.db.query<
        NoteSearchResult & {
          task_title: string;
          board_name: string;
          relevance_score: number;
        }
      >(sql, params);

      return results.map(result => {
        const processedResult = { ...result };
        NoteService.convertNoteDates(processedResult);

        if (highlight) {
          processedResult.highlighted_content = NoteService.highlightSearchTerm(
            result.content,
            query
          );
        }

        return {
          ...processedResult,
          task_title: result.task_title,
          board_name: result.board_name,
          relevance_score: result.relevance_score,
        };
      });
    } catch (error) {
      logger.error('Failed to search notes', { error, options });
      throw NoteService.createError('NOTE_SEARCH_FAILED', 'Failed to search notes', error);
    }
  }

  /**
   * Retrieves notes created within a recent time period
   *
   * @param options Options including time period and board filter
   * @returns Promise resolving to array of recent notes
   *
   * @throws {ServiceError} NOTES_FETCH_FAILED - When query fails
   *
   * @example
   * ```typescript
   * // Get notes from last 3 days
   * const recentNotes = await noteService.getRecentNotes({
   *   days: 3,
   *   board_id: 'board-123'
   * });
   * ```
   */
  async getRecentNotes(
    options: PaginationOptions & { days?: number; board_id?: string } = {}
  ): Promise<Note[]> {
    const { days = 7, board_id, ...paginationOptions } = options;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    return this.getNotes({
      ...paginationOptions,
      ...(board_id ? { board_id } : {}),
      date_from: dateFrom,
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
  }

  /**
   * Retrieves all notes of a specific category
   *
   * @param category Note category to filter by
   * @param options Additional filtering and pagination options
   * @returns Promise resolving to array of notes in the category
   *
   * @throws {ServiceError} NOTES_FETCH_FAILED - When query fails
   *
   * @example
   * ```typescript
   * // Get all blocker notes
   * const blockers = await noteService.getNotesByCategory('blocker', {
   *   board_id: 'board-123',
   *   sortBy: 'created_at',
   *   sortOrder: 'desc'
   * });
   * ```
   */
  async getNotesByCategory(
    category: Note['category'],
    options: PaginationOptions & { board_id?: string } = {}
  ): Promise<Note[]> {
    return this.getNotes({
      ...options,
      category,
    });
  }

  /**
   * Retrieves all notes for a specific board
   *
   * @param boardId ID of the board
   * @param options Additional filtering and pagination options
   * @returns Promise resolving to array of board notes
   *
   * @throws {ServiceError} NOTES_FETCH_FAILED - When query fails
   *
   * @example
   * ```typescript
   * const boardNotes = await noteService.getNotesForBoard('board-123', {
   *   category: 'decision',
   *   pinned: true
   * });
   * ```
   */
  async getNotesForBoard(
    boardId: string,
    options: PaginationOptions & NoteFilters = {}
  ): Promise<Note[]> {
    return this.getNotes({
      ...options,
      board_id: boardId,
    });
  }

  /**
   * Pins a note for priority visibility
   *
   * @param id Unique note identifier
   * @returns Promise resolving to the updated note
   *
   * @throws {ServiceError} NOTE_NOT_FOUND - When note doesn't exist
   * @throws {ServiceError} NOTE_UPDATE_FAILED - When update fails
   *
   * @example
   * ```typescript
   * const pinnedNote = await noteService.pinNote('note-123');
   * ```
   */
  async pinNote(id: string): Promise<Note> {
    return this.updateNote(id, { pinned: true });
  }

  /**
   * Unpins a previously pinned note
   *
   * @param id Unique note identifier
   * @returns Promise resolving to the updated note
   *
   * @throws {ServiceError} NOTE_NOT_FOUND - When note doesn't exist
   * @throws {ServiceError} NOTE_UPDATE_FAILED - When update fails
   *
   * @example
   * ```typescript
   * const unpinnedNote = await noteService.unpinNote('note-123');
   * ```
   */
  async unpinNote(id: string): Promise<Note> {
    return this.updateNote(id, { pinned: false });
  }

  /**
   * Creates a duplicate of an existing note
   *
   * @param id ID of the note to duplicate
   * @param newTaskId Optional different task ID for the duplicate
   * @returns Promise resolving to the duplicated note
   *
   * @throws {ServiceError} NOTE_NOT_FOUND - When original note doesn't exist
   * @throws {ServiceError} NOTE_DUPLICATE_FAILED - When duplication fails
   *
   * @description Creates a copy of the note with:
   * - Same content and category
   * - Reset pinned status to false
   * - New timestamps
   * - Optional different task association
   *
   * @example
   * ```typescript
   * // Duplicate to same task
   * const duplicate = await noteService.duplicateNote('note-123');
   *
   * // Duplicate to different task
   * const crossTaskDuplicate = await noteService.duplicateNote('note-123', 'task-456');
   * ```
   */
  async duplicateNote(id: string, newTaskId?: string): Promise<Note> {
    try {
      const originalNote = await this.getNoteById(id);
      if (!originalNote) {
        throw NoteService.createError('NOTE_NOT_FOUND', 'Note not found', { id });
      }

      const duplicatedNote = await this.createNote({
        task_id: newTaskId ?? originalNote.task_id,
        content: originalNote.content,
        category: originalNote.category,
        pinned: false, // Don't duplicate pin status
      });

      logger.info('Note duplicated successfully', { originalId: id, newId: duplicatedNote.id });
      return duplicatedNote;
    } catch (error) {
      if (error instanceof Error && error.message.includes('NOTE_')) {
        throw error;
      }
      logger.error('Failed to duplicate note', { error, id });
      throw NoteService.createError('NOTE_DUPLICATE_FAILED', 'Failed to duplicate note', error);
    }
  }

  /**
   * Retrieves comprehensive note statistics
   *
   * @param options Scope filters for statistics calculation
   * @returns Promise resolving to note statistics object
   *
   * @throws {ServiceError} NOTE_STATS_FAILED - When statistics calculation fails
   *
   * @example
   * ```typescript
   * // Get board-wide note statistics
   * const stats = await noteService.getNoteStats({
   *   board_id: 'board-123',
   *   days: 30
   * });
   *
   * logger.log(`Total notes: ${String(String(stats.total))}`);
   * logger.log(`Blockers: ${String(String(stats.by_category.blocker))}`);
   * logger.log(`Recent notes (30 days): ${String(String(stats.recent))}`);
   * ```
   */
  async getNoteStats(
    options: { board_id?: string; task_id?: string; days?: number } = {}
  ): Promise<{
    total: number;
    by_category: Record<Note['category'], number>;
    pinned: number;
    recent: number;
  }> {
    const { board_id, task_id, days = 7 } = options;

    try {
      let baseQuery = 'FROM notes n';
      const params: unknown[] = [];
      const conditions: string[] = [];

      if (board_id) {
        baseQuery += ' INNER JOIN tasks t ON n.task_id = t.id';
        conditions.push('t.board_id = ?');
        params.push(board_id);
      }

      if (task_id) {
        conditions.push('n.task_id = ?');
        params.push(task_id);
      }

      const whereClause =
        conditions.length > 0 ? ` WHERE ${String(String(conditions.join(' AND ')))}` : '';

      const [totalResult, categoryStats, pinnedResult, recentResult] = await Promise.all([
        this.db.queryOne<{ count: number }>(
          `SELECT COUNT(*) as count ${String(baseQuery)}${String(whereClause)}`,
          params
        ),
        this.db.query<{ category: Note['category']; count: number }>(
          `
          SELECT category, COUNT(*) as count 
          ${String(baseQuery)}${String(whereClause)}
          GROUP BY category
        `,
          params
        ),
        this.db.queryOne<{ count: number }>(
          `
          SELECT COUNT(*) as count 
          ${String(baseQuery)}${String(whereClause)}${String(String(conditions.length > 0 ? ' AND' : ' WHERE'))} n['pinned'] = TRUE
        `,
          params
        ),
        this.db.queryOne<{ count: number }>(
          `
          SELECT COUNT(*) as count 
          ${String(baseQuery)}${String(whereClause)}${String(String(conditions.length > 0 ? ' AND' : ' WHERE'))} n.created_at >= ?
        `,
          [...params, new Date(Date.now() - days * 24 * 60 * 60 * 1000)]
        ),
      ]);

      const by_category: Record<
        'general' | 'implementation' | 'research' | 'blocker' | 'idea',
        number
      > = {
        general: 0,
        implementation: 0,
        research: 0,
        blocker: 0,
        idea: 0,
      };

      categoryStats.forEach(stat => {
        by_category[stat.category] = stat.count;
      });

      return {
        total: totalResult?.count ?? 0,
        by_category,
        pinned: pinnedResult?.count ?? 0,
        recent: recentResult?.count ?? 0,
      };
    } catch (error) {
      logger.error('Failed to get note stats', { error, options });
      throw NoteService.createError('NOTE_STATS_FAILED', 'Failed to get note statistics', error);
    }
  }

  /**
   * Retrieves note category distribution with percentages
   *
   * @param filters Scope filters for category analysis
   * @returns Promise resolving to array of category statistics
   *
   * @throws {ServiceError} NOTE_CATEGORIES_FAILED - When category analysis fails
   *
   * @example
   * ```typescript
   * const categories = await noteService.getNoteCategories({
   *   board_id: 'board-123'
   * });
   *
   * categories.forEach(cat => {
   *   logger.log(`${String(String(cat.category))}: ${String(String(cat.count))} notes (${String(String(cat.percentage.toFixed(1)))}%)`);
   * });
   * ```
   */
  async getNoteCategories(filters: { task_id?: string; board_id?: string } = {}): Promise<
    Array<{
      category: Note['category'];
      count: number;
      percentage: number;
    }>
  > {
    const { task_id, board_id } = filters;

    try {
      let baseQuery = 'FROM notes n';
      const params: QueryParameters = [];
      const conditions: string[] = [];

      if (board_id) {
        baseQuery += ' INNER JOIN tasks t ON n.task_id = t.id';
        conditions.push('t.board_id = ?');
        params.push(board_id);
      }

      if (task_id) {
        conditions.push('n.task_id = ?');
        params.push(task_id);
      }

      const whereClause =
        conditions.length > 0 ? ` WHERE ${String(String(conditions.join(' AND ')))}` : '';

      const [totalResult, categoryStats] = await Promise.all([
        this.db.queryOne<{ count: number }>(
          `SELECT COUNT(*) as count ${String(baseQuery)}${String(whereClause)}`,
          params
        ),
        this.db.query<{ category: Note['category']; count: number }>(
          `
          SELECT category, COUNT(*) as count 
          ${String(baseQuery)}${String(whereClause)}
          GROUP BY category
          ORDER BY count DESC
        `,
          params
        ),
      ]);

      const total = totalResult?.count ?? 0;

      return categoryStats.map(stat => ({
        category: stat.category,
        count: stat.count,
        percentage: total > 0 ? (stat.count / total) * 100 : 0,
      }));
    } catch (error) {
      logger.error('Failed to get note categories', { error, filters });
      throw NoteService.createError(
        'NOTE_CATEGORIES_FAILED',
        'Failed to get note categories',
        error
      );
    }
  }

  /**
   * Highlights search terms in content using HTML markup
   *
   * @private
   * @param content Original content
   * @param searchTerm Term to highlight
   * @returns Content with search terms wrapped in <mark> tags
   */
  private static highlightSearchTerm(content: string, searchTerm: string): string {
    if (!searchTerm.trim()) return content;

    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
    return content.replace(regex, '<mark>$1</mark>');
  }

  /**
   * Converts string date fields to Date objects
   *
   * @private
   * @param note Note object with potentially string-based dates
   */
  private static convertNoteDates(note: Note): void {
    if (typeof note.created_at === 'string') {
      const createdDate = new Date(note.created_at);
      note.created_at = createdDate;
    }
    if (typeof note.updated_at === 'string') {
      const updatedDate = new Date(note.updated_at);
      note.updated_at = updatedDate;
    }
  }

  /**
   * Creates a standardized service error
   *
   * @private
   * @param code Error code identifier
   * @param message Human-readable error message
   * @param originalError Optional original error for debugging
   * @returns Standardized ServiceError with status code
   */
  private static createError(code: string, message: string, originalError?: unknown): ServiceError {
    const error = new Error(message) as ServiceError;
    error.code = code;
    error.statusCode = NoteService.getStatusCodeForError(code);
    error.details = originalError as ServiceError['details'];
    return error;
  }

  /**
   * Maps error codes to HTTP status codes
   *
   * @private
   * @param code Error code
   * @returns HTTP status code
   */
  private static getStatusCodeForError(code: string): number {
    switch (code) {
      case 'NOTE_NOT_FOUND':
        return 404;
      case 'NOTE_CREATE_FAILED':
      case 'NOTE_UPDATE_FAILED':
      case 'NOTE_DELETE_FAILED':
      case 'NOTE_DUPLICATE_FAILED':
      case 'NOTE_SEARCH_FAILED':
      case 'NOTE_STATS_FAILED':
        return 500;
      case 'NOTE_FETCH_FAILED':
      case 'NOTES_FETCH_FAILED':
        return 500;
      default:
        return 500;
    }
  }
}
