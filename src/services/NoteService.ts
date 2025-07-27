import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import type { Note, ServiceError, PaginationOptions, FilterOptions } from '@/types';

export interface CreateNoteRequest {
  task_id: string;
  content: string;
  category?: Note['category'];
  pinned?: boolean;
}

export interface UpdateNoteRequest {
  content?: string;
  category?: Note['category'];
  pinned?: boolean;
}

export interface NoteFilters extends FilterOptions {
  task_id?: string;
  category?: Note['category'];
  pinned?: boolean;
  content_search?: string;
  board_id?: string;
  date_from?: Date;
  date_to?: Date;
}

export interface NoteSearchOptions extends PaginationOptions {
  query: string;
  task_id?: string;
  board_id?: string;
  category?: Note['category'];
  pinned_only?: boolean;
  highlight?: boolean;
}

export interface NoteSearchResult extends Note {
  task_title?: string;
  board_name?: string;
  relevance_score?: number;
  highlighted_content?: string;
}

export class NoteService {
  constructor(private readonly db: DatabaseConnection) {}

  async createNote(data: CreateNoteRequest): Promise<Note> {
    const id = uuidv4();
    const now = new Date();

    const note: Note = {
      id,
      task_id: data.task_id,
      content: data.content,
      category: data.category || 'general',
      pinned: data.pinned || false,
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
      throw this.createError('NOTE_CREATE_FAILED', 'Failed to create note', error);
    }
  }

  async getNoteById(id: string): Promise<Note | null> {
    try {
      const note = await this.db.queryOne<Note>(
        `
        SELECT * FROM notes WHERE id = ?
      `,
        [id]
      );

      if (note) {
        this.convertNoteDates(note);
      }

      return note || null;
    } catch (error) {
      logger.error('Failed to get note by ID', { error, id });
      throw this.createError('NOTE_FETCH_FAILED', 'Failed to fetch note', error);
    }
  }

  async getNotes(options: PaginationOptions & NoteFilters = {}): Promise<Note[]> {
    const {
      limit = 50,
      offset = 0,
      sortBy = 'updated_at',
      sortOrder = 'desc',
      task_id,
      category,
      pinned,
      content_search,
      board_id,
      date_from,
      date_to,
    } = options;

    try {
      let query = 'SELECT n.* FROM notes n';
      const params: any[] = [];
      const conditions: string[] = [];

      if (board_id) {
        query += ' INNER JOIN tasks t ON n.task_id = t.id';
        conditions.push('t.board_id = ?');
        params.push(board_id);
      }

      if (task_id) {
        conditions.push('n.task_id = ?');
        params.push(task_id);
      }

      if (category) {
        conditions.push('n.category = ?');
        params.push(category);
      }

      if (pinned !== undefined) {
        conditions.push('n.pinned = ?');
        params.push(pinned);
      }

      if (content_search) {
        conditions.push('n.content LIKE ?');
        params.push(`%${content_search}%`);
      }

      if (date_from) {
        conditions.push('n.created_at >= ?');
        params.push(date_from);
      }

      if (date_to) {
        conditions.push('n.created_at <= ?');
        params.push(date_to);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` ORDER BY n.${sortBy} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const notes = await this.db.query<Note>(query, params);
      notes.forEach(note => this.convertNoteDates(note));

      return notes;
    } catch (error) {
      logger.error('Failed to get notes', { error, options });
      throw this.createError('NOTES_FETCH_FAILED', 'Failed to fetch notes', error);
    }
  }

  async getTaskNotes(taskId: string, options: PaginationOptions = {}): Promise<Note[]> {
    return this.getNotes({
      ...options,
      task_id: taskId,
    });
  }

  async getPinnedNotes(
    options: PaginationOptions & { task_id?: string; board_id?: string } = {}
  ): Promise<Note[]> {
    return this.getNotes({
      ...options,
      pinned: true,
    });
  }

  async updateNote(id: string, data: UpdateNoteRequest): Promise<Note> {
    try {
      const existingNote = await this.getNoteById(id);
      if (!existingNote) {
        throw this.createError('NOTE_NOT_FOUND', 'Note not found', { id });
      }

      const updates: string[] = [];
      const params: any[] = [];

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
        SET ${updates.join(', ')}
        WHERE id = ?
      `,
        params
      );

      const updatedNote = await this.getNoteById(id);
      if (!updatedNote) {
        throw this.createError('NOTE_UPDATE_FAILED', 'Note disappeared after update');
      }

      logger.info('Note updated successfully', { noteId: id });
      return updatedNote;
    } catch (error) {
      if (error instanceof Error && error.message.includes('NOTE_')) {
        throw error;
      }
      logger.error('Failed to update note', { error, id, data });
      throw this.createError('NOTE_UPDATE_FAILED', 'Failed to update note', error);
    }
  }

  async deleteNote(id: string): Promise<void> {
    try {
      const note = await this.getNoteById(id);
      if (!note) {
        throw this.createError('NOTE_NOT_FOUND', 'Note not found', { id });
      }

      const result = await this.db.execute('DELETE FROM notes WHERE id = ?', [id]);

      if (result.changes === 0) {
        throw this.createError('NOTE_DELETE_FAILED', 'Failed to delete note');
      }

      logger.info('Note deleted successfully', { noteId: id });
    } catch (error) {
      if (error instanceof Error && error.message.includes('NOTE_')) {
        throw error;
      }
      logger.error('Failed to delete note', { error, id });
      throw this.createError('NOTE_DELETE_FAILED', 'Failed to delete note', error);
    }
  }

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

      const searchTerm = `%${query}%`;
      const exactMatch = `%${query}%`;
      const wordBoundary = `% ${query} %`;

      const params: any[] = [exactMatch, wordBoundary, searchTerm];
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
        sql += ` AND ${conditions.join(' AND ')}`;
      }

      if (sortBy === 'relevance') {
        sql += ' ORDER BY relevance_score DESC, n.updated_at DESC';
      } else {
        sql += ` ORDER BY n.${sortBy} ${sortOrder.toUpperCase()}`;
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
        this.convertNoteDates(result);

        if (highlight) {
          result.highlighted_content = this.highlightSearchTerm(result.content, query);
        }

        return {
          ...result,
          task_title: result.task_title,
          board_name: result.board_name,
          relevance_score: result.relevance_score,
        };
      });
    } catch (error) {
      logger.error('Failed to search notes', { error, options });
      throw this.createError('NOTE_SEARCH_FAILED', 'Failed to search notes', error);
    }
  }

  async getRecentNotes(
    options: PaginationOptions & { days?: number; board_id?: string } = {}
  ): Promise<Note[]> {
    const { days = 7, board_id, ...paginationOptions } = options;
    const date_from = new Date();
    date_from.setDate(date_from.getDate() - days);

    return this.getNotes({
      ...paginationOptions,
      ...(board_id ? { board_id } : {}),
      date_from,
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
  }

  async getNotesByCategory(
    category: Note['category'],
    options: PaginationOptions & { board_id?: string } = {}
  ): Promise<Note[]> {
    return this.getNotes({
      ...options,
      category,
    });
  }

  async getNotesForBoard(
    boardId: string,
    options: PaginationOptions & NoteFilters = {}
  ): Promise<Note[]> {
    return this.getNotes({
      ...options,
      board_id: boardId,
    });
  }

  async pinNote(id: string): Promise<Note> {
    return this.updateNote(id, { pinned: true });
  }

  async unpinNote(id: string): Promise<Note> {
    return this.updateNote(id, { pinned: false });
  }

  async duplicateNote(id: string, newTaskId?: string): Promise<Note> {
    try {
      const originalNote = await this.getNoteById(id);
      if (!originalNote) {
        throw this.createError('NOTE_NOT_FOUND', 'Note not found', { id });
      }

      const duplicatedNote = await this.createNote({
        task_id: newTaskId || originalNote.task_id,
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
      throw this.createError('NOTE_DUPLICATE_FAILED', 'Failed to duplicate note', error);
    }
  }

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
      const params: any[] = [];
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

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      const [totalResult, categoryStats, pinnedResult, recentResult] = await Promise.all([
        this.db.queryOne<{ count: number }>(
          `SELECT COUNT(*) as count ${baseQuery}${whereClause}`,
          params
        ),
        this.db.query<{ category: Note['category']; count: number }>(
          `
          SELECT category, COUNT(*) as count 
          ${baseQuery}${whereClause}
          GROUP BY category
        `,
          params
        ),
        this.db.queryOne<{ count: number }>(
          `
          SELECT COUNT(*) as count 
          ${baseQuery}${whereClause}${conditions.length > 0 ? ' AND' : ' WHERE'} n.pinned = TRUE
        `,
          params
        ),
        this.db.queryOne<{ count: number }>(
          `
          SELECT COUNT(*) as count 
          ${baseQuery}${whereClause}${conditions.length > 0 ? ' AND' : ' WHERE'} n.created_at >= ?
        `,
          [...params, new Date(Date.now() - days * 24 * 60 * 60 * 1000)]
        ),
      ]);

      const by_category: Record<Note['category'], number> = {
        general: 0,
        progress: 0,
        blocker: 0,
        decision: 0,
        question: 0,
      };

      categoryStats.forEach(stat => {
        by_category[stat.category] = stat.count;
      });

      return {
        total: totalResult?.count || 0,
        by_category,
        pinned: pinnedResult?.count || 0,
        recent: recentResult?.count || 0,
      };
    } catch (error) {
      logger.error('Failed to get note stats', { error, options });
      throw this.createError('NOTE_STATS_FAILED', 'Failed to get note statistics', error);
    }
  }

  async getNoteCategories(filters: { task_id?: string; board_id?: string } = {}): Promise<
    {
      category: Note['category'];
      count: number;
      percentage: number;
    }[]
  > {
    const { task_id, board_id } = filters;

    try {
      let baseQuery = 'FROM notes n';
      const params: any[] = [];
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

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      const [totalResult, categoryStats] = await Promise.all([
        this.db.queryOne<{ count: number }>(
          `SELECT COUNT(*) as count ${baseQuery}${whereClause}`,
          params
        ),
        this.db.query<{ category: Note['category']; count: number }>(
          `
          SELECT category, COUNT(*) as count 
          ${baseQuery}${whereClause}
          GROUP BY category
          ORDER BY count DESC
        `,
          params
        ),
      ]);

      const total = totalResult?.count || 0;

      return categoryStats.map(stat => ({
        category: stat.category,
        count: stat.count,
        percentage: total > 0 ? (stat.count / total) * 100 : 0,
      }));
    } catch (error) {
      logger.error('Failed to get note categories', { error, filters });
      throw this.createError('NOTE_CATEGORIES_FAILED', 'Failed to get note categories', error);
    }
  }

  private highlightSearchTerm(content: string, searchTerm: string): string {
    if (!searchTerm.trim()) return content;

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return content.replace(regex, '<mark>$1</mark>');
  }

  private convertNoteDates(note: Note): void {
    note.created_at = new Date(note.created_at);
    note.updated_at = new Date(note.updated_at);
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
