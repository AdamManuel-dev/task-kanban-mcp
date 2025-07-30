/**
 * @fileoverview Task notes route handlers
 * @lastmodified 2025-07-28T05:15:00Z
 * 
 * Features: Task note operations, CRUD for task-specific notes
 * Main APIs: taskNotesRoutes - Express router for task notes
 * Constraints: Requires valid task ID, note validation
 * Patterns: RESTful routes under /tasks/:id/notes
 */

import { Router } from 'express';
import { NoteService } from '@/services/NoteService';
import { logger } from '@/utils/logger';
import { createServiceErrorHandler } from '@/utils/errors';

export const taskNotesRoutes = Router({ mergeParams: true });

/**
 * GET /tasks/:id/notes - Get all notes for a task
 */
taskNotesRoutes.get('/', async (req, res) => {
  const errorHandler = createServiceErrorHandler('getTaskNotes', logger);
  
  try {
    const taskId = req.params.id;
    const noteService = new NoteService();
    const result = await noteService.getNotesByTask(taskId);
    
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error, req, res);
  }
});

/**
 * POST /tasks/:id/notes - Create a note for a task
 */
taskNotesRoutes.post('/', async (req, res) => {
  const errorHandler = createServiceErrorHandler('createTaskNote', logger);
  
  try {
    const taskId = req.params.id;
    const noteData = { ...req.body, task_id: taskId };
    
    const noteService = new NoteService();
    const result = await noteService.createNote(noteData);
    
    if (result.success) {
      res.status(201).json({ success: true, data: result.data });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error, req, res);
  }
});