import { Router } from 'express';
import { NoteService } from '@/services/NoteService';
import { dbConnection } from '@/database/connection';
import { requirePermission } from '@/middleware/auth';
import { NoteValidation, validateInput } from '@/utils/validation';
import { NotFoundError } from '@/utils/errors';

export async function noteRoutes(): Promise<Router> {
  const router = Router();

  const noteService = new NoteService(dbConnection);

  // GET /api/v1/notes/search - Full-text search notes (must be before generic routes)
  router.get('/search', requirePermission('read'), async (req, res, next) => {
    try {
      const { query, limit = 50, offset = 0, task_id, board_id, category, pinned } = req.query;

      if (!query) {
        return res.status(400).apiError('INVALID_INPUT', 'Search query is required');
      }

      const options: any = {
        query: query as string,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      };

      // Add optional properties only if they have values
      if (task_id) options.task_id = task_id as string;
      if (board_id) options.board_id = board_id as string;
      if (category) options.category = category;
      if (pinned === 'true') options.pinned_only = true;
      else if (pinned === 'false') options.pinned_only = false;

      const searchResults = await noteService.searchNotes(options);

      return res.apiPagination(
        searchResults,
        Math.floor(options.offset / options.limit) + 1,
        options.limit,
        searchResults.length
      );
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/notes/categories - Get note categories with counts
  router.get('/categories', requirePermission('read'), async (req, res, next) => {
    try {
      const { task_id, board_id } = req.query;

      const filters = {
        task_id: task_id as string,
        board_id: board_id as string,
      };

      const categories = await noteService.getNoteCategories(filters);
      return res.apiSuccess(categories);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/notes/recent - Get recently updated notes
  router.get('/recent', requirePermission('read'), async (req, res, next) => {
    try {
      const { limit = 20, task_id, board_id, days = 7 } = req.query;

      const options = {
        limit: parseInt(limit as string, 10),
        task_id: task_id as string,
        board_id: board_id as string,
        days: parseInt(days as string, 10),
      };

      const recentNotes = await noteService.getRecentNotes(options);
      return res.apiSuccess(recentNotes);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/notes/pinned - Get pinned notes
  router.get('/pinned', requirePermission('read'), async (req, res, next) => {
    try {
      const { limit = 50, task_id, board_id, category } = req.query;

      const options = {
        limit: parseInt(limit as string, 10),
        task_id: task_id as string,
        board_id: board_id as string,
        category: category as any,
        pinned: true,
      };

      const pinnedNotes = await noteService.getNotes(options);
      return res.apiSuccess(pinnedNotes);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/notes - List notes with filters
  router.get('/', requirePermission('read'), async (req, res, next) => {
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

      const options: any = {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        search: search as string,
      };

      if (task_id) options.task_id = task_id as string;
      if (board_id) options.board_id = board_id as string;
      if (category) options.category = category;
      if (pinned === 'true') options.pinned = true;
      else if (pinned === 'false') options.pinned = false;

      const notes = await noteService.getNotes(options);

      // Get total count for pagination
      const { limit: _, offset: __, ...countOptions } = options;
      const totalNotes = await noteService.getNotes(countOptions);
      const total = totalNotes.length;

      return res.apiPagination(
        notes,
        Math.floor(options.offset / options.limit) + 1,
        options.limit,
        total
      );
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/notes - Create note
  router.post('/', requirePermission('write'), async (req, res, next) => {
    try {
      const rawNoteData = validateInput(NoteValidation.create, req.body);
      const noteData: any = {
        task_id: rawNoteData.task_id,
        content: rawNoteData.content,
      };

      // Add optional properties only if they have values
      if (rawNoteData.category) noteData.category = rawNoteData.category;
      if (rawNoteData.pinned !== undefined) noteData.pinned = rawNoteData.pinned;

      const note = await noteService.createNote(noteData);
      return res.status(201).apiSuccess(note);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/notes/:id - Get note details
  router.get('/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Note ID is required' });
      }

      const note = await noteService.getNoteById(id);

      if (!note) {
        throw new NotFoundError('Note', id);
      }

      return res.apiSuccess(note);
    } catch (error) {
      return next(error);
    }
  });

  // PATCH /api/v1/notes/:id - Update note
  router.patch('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Note ID is required' });
      }

      const rawUpdateData = validateInput(NoteValidation.update, req.body);
      // Filter out undefined values to comply with exactOptionalPropertyTypes
      const updateData = Object.fromEntries(
        Object.entries(rawUpdateData).filter(([, value]) => value !== undefined)
      );
      const note = await noteService.updateNote(id, updateData);
      return res.apiSuccess(note);
    } catch (error) {
      return next(error);
    }
  });

  // DELETE /api/v1/notes/:id - Delete note
  router.delete('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Note ID is required' });
      }

      await noteService.deleteNote(id);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/notes/:id/pin - Pin note
  router.post('/:id/pin', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Note ID is required' });
      }

      const note = await noteService.pinNote(id);
      return res.apiSuccess(note);
    } catch (error) {
      return next(error);
    }
  });

  // DELETE /api/v1/notes/:id/pin - Unpin note
  router.delete('/:id/pin', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'Note ID is required' });
      }

      const note = await noteService.unpinNote(id);
      return res.apiSuccess(note);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
