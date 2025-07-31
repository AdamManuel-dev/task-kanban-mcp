/**
 * @fileoverview Create task handler
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Task creation, validation, permission checking
 * Main APIs: createTaskHandler()
 * Constraints: Requires authentication, write permission
 * Patterns: Request validation, service delegation, response formatting
 */

import { requirePermission } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import type { CreateTaskRequest } from '@/services/TaskService';
import type { Note, Task, TaskTag } from '@/types';
import { logger } from '@/utils/logger';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

interface CreateNoteRequest {
  task_id: string;
  content: string;
  category?: string;
  created_by?: string;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    permissions: string[];
  };
}

interface Services {
  taskService: {
    createTask: (data: CreateTaskRequest) => Promise<Task>;
    getTaskById: (
      id: string,
      options?: { notes?: boolean; tags?: boolean }
    ) => Promise<Task | null>;
  };
  tagService: {
    addTagToTask: (taskId: string, tagId: string) => Promise<TaskTag>;
  };
  noteService: {
    createNote: (data: CreateNoteRequest) => Promise<Note>;
  };
}

// Request body schema
const createTaskBodySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  board_id: z.string().uuid(),
  column_id: z.string().uuid().optional(),
  parent_id: z.string().uuid().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'blocked', 'archived']).optional(),
  priority: z.number().int().min(1).max(10).optional(),
  assignee: z.string().optional(),
  due_date: z.string().datetime().optional(),
  progress: z.number().min(0).max(100).optional(),
  position: z.number().int().min(0).optional(),
  tags: z.array(z.string()).optional(),
  notes: z
    .array(
      z.object({
        content: z.string().min(1),
        category: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * Create a new task
 */
export const createTaskHandler = (services: Services): RequestHandler[] => [
  requirePermission('write'),
  validateRequest(createTaskBodySchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const taskData = req.body;

      // Add creator information
      taskData.created_by = req.user?.id;

      logger.debug('Creating task', { taskData, userId: req.user?.id });

      // Create the task
      const task = await services.taskService.createTask(taskData);

      // Handle tags if provided
      if (taskData.tags && taskData.tags.length > 0) {
        for (const tagId of taskData.tags) {
          await services.tagService.addTagToTask(task.id, tagId);
        }
      }

      // Handle notes if provided
      if (taskData.notes && taskData.notes.length > 0) {
        for (const noteData of taskData.notes) {
          await services.noteService.createNote({
            task_id: task.id,
            content: noteData.content,
            category: noteData.category || 'general',
            created_by: req.user?.id,
          });
        }
      }

      // Fetch the complete task with relations
      const completeTask = await services.taskService.getTaskById(task.id, {
        notes: true,
        tags: true,
      });

      res.status(201).json({
        success: true,
        data: completeTask,
      });
    } catch (error) {
      logger.error('Error creating task', { error, taskData: req.body, userId: req.user?.id });
      next(error);
    }
  },
];
