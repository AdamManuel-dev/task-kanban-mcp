import { Router } from 'express';
import { NoteService, type NoteSearchOptions, type NoteFilters, type CreateNoteRequest, type UpdateNoteRequest } from '@/services/NoteService';
import type { PaginationOptions, Note } from '@/types';
import { dbConnection } from '@/database/connection';
import { requirePermission } from '@/middleware/auth';
import { NoteValidation, validateInput } from '@/utils/validation';
import { NotFoundError } from '@/utils/errors';

export function noteRoutes(): Router {
  const router = Router();

  const noteService = new NoteService(dbConnection);

  // GET /api/v1/notes/search - Full-text search notes (must be before generic routes)
  router.get('/search', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { query, limit = 50, offset = 0, task_id, board_id, category, pinned } = req.query;

      if (!query) {
        res.apiError({
          code: 'INVALID_INPUT',
          message: 'Search query is required',
          statusCode: 400,
        });
        return;
      }

      const options: NoteSearchOptions = {
        query: query as string,
        limit: parseInt(limit as string, 10) || 50,
        offset: parseInt(offset as string, 10) || 0,
      };

      // Add optional properties only if they have values
      if (task_id) options.task_id = task_id as string;
      if (board_id) options.board_id = board_id as string;
      if (category) options.category = category as 'general' | 'implementation' | 'research' | 'blocker' | 'idea';
      if (pinned === 'true') options.pinned_only = true;
      else if (pinned === 'false') options.pinned_only = false;

      const searchResults = await noteService.searchNotes(options);

      res.apiPagination({
        data: searchResults,
        page: Math.floor((options.offset || 0) / (options.limit || 50)) + 1,
        limit: options.limit || 50,
        total: searchResults.length,
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/notes/categories - Get note categories with counts
  router.get('/categories', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { task_id, board_id } = req.query;

      const filters: { task_id?: string; board_id?: string } = {};
      if (task_id) filters.task_id = task_id as string;
      if (board_id) filters.board_id = board_id as string;

      const categories = await noteService.getNoteCategories(filters);
      res.apiSuccess(categories);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/notes/recent - Get recently updated notes
  router.get('/recent', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { limit = 20, task_id, board_id, days = 7 } = req.query;

      const options: PaginationOptions & { days?: number; board_id?: string; task_id?: string } = {
        limit: parseInt(limit as string, 10),
        days: parseInt(days as string, 10),
      };
      if (task_id) options.task_id = task_id as string;
      if (board_id) options.board_id = board_id as string;

      const recentNotes = await noteService.getRecentNotes(options);
      res.apiSuccess(recentNotes);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/notes/pinned - Get pinned notes
  router.get('/pinned', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { limit = 50, task_id, board_id, category } = req.query;

      const options: PaginationOptions & NoteFilters = {
        limit: parseInt(limit as string, 10),
        pinned: true,
      };
      if (task_id) options.task_id = task_id as string;
      if (board_id) options.board_id = board_id as string;
      if (category) options.category = category as Note['category'];

      const pinnedNotes = await noteService.getNotes(options);
      res.apiSuccess(pinnedNotes);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/notes - List notes with filters
  router.get('/', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const {
        limit = 50,
        offset = 0,
        sortBy = 'updated_at',
        sortOrder = 'desc',
        task_id,
        board_id,
        category,
        pinned,
        search,
      } = req.query;

      const options: PaginationOptions & NoteFilters = {
        limit: parseInt(limit as string, 10) || 50,
        offset: parseInt(offset as string, 10) || 0,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
      };

      if (task_id) options.task_id = task_id as string;
      if (board_id) options.board_id = board_id as string;
      if (category) options.category = category as 'general' | 'implementation' | 'research' | 'blocker' | 'idea';
      if (pinned === 'true') options.pinned = true;
      else if (pinned === 'false') options.pinned = false;

      const notes = await noteService.getNotes(options);

      // Get total count for pagination
      const { limit: _, offset: __, ...countOptions } = options;
      const totalNotes = await noteService.getNotes(countOptions);
      const total = totalNotes.length;

      res.apiPagination({
        data: notes,
        page: Math.floor((options.offset || 0) / (options.limit || 50)) + 1,
        limit: options.limit || 50,
        total,
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/notes - Create note
  router.post('/', requirePermission('write'), async (req, res, next): Promise<void> => {
    try {
      const rawNoteData = validateInput(NoteValidation.create, req.body);
      const noteData: CreateNoteRequest = {
        task_id: rawNoteData.task_id,
        content: rawNoteData.content,
      };

      // Add optional properties only if they have values
      if (rawNoteData.category) noteData.category = rawNoteData.category;
      if (rawNoteData.pinned !== undefined) noteData.pinned = rawNoteData.pinned;

      const note = await noteService.createNote(noteData);
      res.status(201).apiSuccess(note);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/notes/:id - Get note details
  router.get('/:id', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Note ID is required' });
        return;
      }

      const note = await noteService.getNoteById(id);

      if (!note) {
        throw new NotFoundError('Note', id);
      }

      res.apiSuccess(note);
    } catch (error) {
      next(error);
    }
  });

  // PATCH /api/v1/notes/:id - Update note
  router.patch('/:id', requirePermission('write'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Note ID is required' });
        return;
      }

      const rawUpdateData = validateInput(NoteValidation.update, req.body);
      // Filter out undefined values to comply with exactOptionalPropertyTypes
      const updateData = Object.fromEntries(
        Object.entries(rawUpdateData).filter(([, value]) => value !== undefined)
      );
      const note = await noteService.updateNote(id, updateData as UpdateNoteRequest);
      res.apiSuccess(note);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/v1/notes/:id - Delete note
  router.delete('/:id', requirePermission('write'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Note ID is required' });
        return;
      }

      await noteService.deleteNote(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/notes/:id/pin - Pin note
  router.post('/:id/pin', requirePermission('write'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Note ID is required' });
        return;
      }

      const note = await noteService.pinNote(id);
      res.apiSuccess(note);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/v1/notes/:id/pin - Unpin note
  router.delete('/:id/pin', requirePermission('write'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'Note ID is required' });
        return;
      }

      const note = await noteService.unpinNote(id);
      res.apiSuccess(note);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
