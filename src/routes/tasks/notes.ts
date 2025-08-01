/**
 * @fileoverview Task notes route handlers
 * @lastmodified 2025-07-28T05:15:00Z
 *
 * Features: Task note operations, CRUD for task-specific notes
 * Main APIs: taskNotesRoutes - Express router for task notes
 * Constraints: Requires valid task ID, note validation
 * Patterns: RESTful routes under /tasks/:id/notes
 */

import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { NoteService } from '@/services/NoteService';
import { DatabaseConnection } from '@/database/connection';
import { logger } from '@/utils/logger';

export const taskNotesRoutes = Router({ mergeParams: true });

/**
 * GET /tasks/:id/notes - Get all notes for a task
 */
taskNotesRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.id;
    const db = await DatabaseConnection.getInstance();
    const noteService = new NoteService(db);
    const notes = await noteService.getTaskNotes(taskId);
    res.json({ success: true, data: notes });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/notes - Create a note for a task
 */
taskNotesRoutes.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.id;
    const noteData = { ...req.body, task_id: taskId };

    const db = await DatabaseConnection.getInstance();
    const noteService = new NoteService(db);
    const result = await noteService.createNote(noteData);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
