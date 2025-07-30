/**
 * @fileoverview Refactored task routes with modular structure
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Modular route handlers, reduced function complexity, better separation of concerns
 * Main APIs: taskRoutes(), configureTaskRoutes()
 * Constraints: Express Router, authentication middleware
 * Patterns: Route separation, handler extraction, dependency injection
 */

import { Router } from 'express';
import { TaskService } from '@/services/TaskService';
import { NoteService } from '@/services/NoteService';
import { TagService } from '@/services/TagService';
import { dbConnection } from '@/database/connection';

// Import individual route handlers
import { listTasksHandler } from './list';
import { getTaskHandler } from './get';
import { createTaskHandler } from './create';
import { updateTaskHandler } from './update';
import { deleteTaskHandler } from './delete';
import { taskNotesRoutes } from './notes';
import { taskTagsRoutes } from './tags';
import { taskDependencyRoutes } from './dependencies';
import { taskSubtaskRoutes } from './subtasks';

/**
 * Create and configure task routes with modular handlers
 */
export function taskRoutes(): Router {
  const router = Router();

  // Initialize services
  const services = {
    taskService: new TaskService(dbConnection),
    noteService: new NoteService(dbConnection),
    tagService: new TagService(dbConnection),
  };

  // Main task CRUD operations
  router.get('/', listTasksHandler(services));
  router.get('/:id', getTaskHandler(services));
  router.post('/', createTaskHandler(services));
  router.patch('/:id', updateTaskHandler(services));
  router.delete('/:id', deleteTaskHandler(services));

  // Sub-resource routes
  router.use('/:taskId/notes', taskNotesRoutes(services));
  router.use('/:taskId/tags', taskTagsRoutes(services));
  router.use('/:taskId/dependencies', taskDependencyRoutes(services));
  router.use('/:taskId/subtasks', taskSubtaskRoutes(services));

  return router;
}

// Re-export for backward compatibility
export { taskRoutes as default };
