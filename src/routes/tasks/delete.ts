/**
 * @fileoverview Task deletion route handler
 * @lastmodified 2025-07-28T05:15:00Z
 *
 * Features: Task deletion operations, soft delete support
 * Main APIs: deleteTaskHandler(req, res) - Deletes task by ID
 * Constraints: Requires valid task ID, handles cascade operations
 * Patterns: Returns 200 with deletion confirmation or error
 */

import type { Request, Response, NextFunction } from 'express';
import { TaskService } from '@/services/TaskService';
import { logger } from '@/utils/logger';
import { dbConnection } from '@/database/connection';

/**
 * Deletes a task by ID
 */
export const deleteTaskHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const taskId = req.params.id;

    const taskService = new TaskService(dbConnection);
    await taskService.deleteTask(taskId);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    next(error);
  }
};
