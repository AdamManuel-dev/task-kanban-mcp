/**
 * @fileoverview Task update route handler
 * @lastmodified 2025-07-28T05:15:00Z
 *
 * Features: Task update operations, validation, status transitions
 * Main APIs: updateTaskHandler(req, res) - Updates existing task
 * Constraints: Requires valid task ID, validates update data
 * Patterns: Returns 200 with updated task or error response
 */

import type { Request, Response, NextFunction } from 'express';
import { TaskService } from '@/services/TaskService';
import { logger } from '@/utils/logger';

/**
 * Updates an existing task
 */
export const updateTaskHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {

  try {
    const taskId = req.params.id;
    const updates = req.body;

    const taskService = new TaskService();
    const result = await taskService.updateTask(taskId, updates);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
