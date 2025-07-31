/**
 * @fileoverview Task note handlers - separated for complexity reduction
 * @lastmodified 2025-07-31T12:00:00Z
 *
 * Features: Task note CRUD operations, note management
 * Main APIs: getTaskNotes(), addTaskNote(), updateTaskNote(), deleteTaskNote()
 * Constraints: Requires authentication, valid task ID
 * Patterns: All handlers use try/catch, return Promise<void>
 */

import type { Request, Response, NextFunction } from 'express';
import type { NoteService } from '@/services/NoteService';
import { ValidationError } from '@/utils/errors';
import { validateInput, NoteValidation } from '@/utils/validation';

export async function getTaskNotes(
  req: Request,
  res: Response,
  next: NextFunction,
  noteService: NoteService
): Promise<void> {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0, category, pinned } = req.query;

    const options = {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      category: category as unknown,
      pinned: (() => {
        if (pinned === 'true') return true;
        if (pinned === 'false') return false;
        return undefined;
      })(),
    };

    if (!id) {
      throw new ValidationError('Task ID is required');
    }
    const notes = await noteService.getTaskNotes(id, options);
    res.apiSuccess(notes);
  } catch (error) {
    next(error);
  }
}

export async function addTaskNote(
  req: Request,
  res: Response,
  next: NextFunction,
  noteService: NoteService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new ValidationError('Task ID is required');
    }
    const validatedBody = validateInput(NoteValidation.create, req.body);
    const noteData = {
      task_id: id,
      content: validatedBody.content,
      ...(validatedBody.category ? { category: validatedBody.category } : {}),
      ...(validatedBody.pinned !== undefined ? { pinned: validatedBody.pinned } : {}),
    };

    const note = await noteService.createNote(noteData);
    res.status(201).apiSuccess(note);
  } catch (error) {
    next(error);
  }
}

export async function updateTaskNote(
  req: Request,
  res: Response,
  next: NextFunction,
  noteService: NoteService
): Promise<void> {
  try {
    const { noteId } = req.params;
    const updateData = req.body;
    const note = await noteService.updateNote(noteId, updateData);
    res.apiSuccess(note, 'Task note updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteTaskNote(
  req: Request,
  res: Response,
  next: NextFunction,
  noteService: NoteService
): Promise<void> {
  try {
    const { noteId } = req.params;
    await noteService.deleteNote(noteId);
    res.apiSuccess(null, 'Task note deleted successfully');
  } catch (error) {
    next(error);
  }
}
