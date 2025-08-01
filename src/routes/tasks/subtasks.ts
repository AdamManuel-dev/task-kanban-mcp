/**
 * @fileoverview Task subtasks route handlers
 * @lastmodified 2025-07-28T05:15:00Z
 *
 * Features: Subtask operations, hierarchical task management
 * Main APIs: taskSubtaskRoutes - Express router for subtasks
 * Constraints: Validates parent-child relationships, prevents cycles
 * Patterns: RESTful routes under /tasks/:id/subtasks
 */

import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { TaskService } from '@/services/TaskService';
import { DatabaseConnection } from '@/database/connection';
import { logger } from '@/utils/logger';

export const taskSubtaskRoutes = Router({ mergeParams: true });

/**
 * GET /tasks/:id/subtasks - Get all subtasks for a task
 */
taskSubtaskRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.id;
    const db = await DatabaseConnection.getInstance();
    const taskService = new TaskService(db);
    const result = await taskService.getSubtasks(taskId);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/subtasks - Create a subtask under parent task
 */
taskSubtaskRoutes.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parentTaskId = req.params.id;
    const subtaskData = { ...req.body, parent_task_id: parentTaskId };

    const db = await DatabaseConnection.getInstance();
    const taskService = new TaskService(db);
    const result = await taskService.createTask(subtaskData);

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /tasks/:id/subtasks/:subtaskId - Update a subtask
 */
taskSubtaskRoutes.put('/:subtaskId', async (req, res, next) => {
  // Error handler for updateSubtask

  try {
    const { subtaskId } = req.params;
    const updates = req.body;

    const db = await DatabaseConnection.getInstance();
    const taskService = new TaskService(db);
    const result = await taskService.updateTask(subtaskId, updates);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /tasks/:id/subtasks/:subtaskId - Delete a subtask
 */
taskSubtaskRoutes.delete('/:subtaskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subtaskId } = req.params;
    const db = await DatabaseConnection.getInstance();
    const taskService = new TaskService(db);
    await taskService.deleteTask(subtaskId);

    res.json({ success: true, message: 'Subtask deleted successfully' });
  } catch (error) {
    next(error);
  }
});
