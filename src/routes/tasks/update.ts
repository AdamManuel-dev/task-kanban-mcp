/**
 * @fileoverview Task update route handler
 * @lastmodified 2025-07-28T05:15:00Z
 * 
 * Features: Task update operations, validation, status transitions
 * Main APIs: updateTaskHandler(req, res) - Updates existing task
 * Constraints: Requires valid task ID, validates update data
 * Patterns: Returns 200 with updated task or error response
 */

import { Request, Response } from 'express';
import { TaskService } from '@/services/TaskService';
import { logger } from '@/utils/logger';
import { createServiceErrorHandler } from '@/utils/errors';

/**
 * Updates an existing task
 */
export const updateTaskHandler = async (req: Request, res: Response): Promise<void> => {
  const errorHandler = createServiceErrorHandler('updateTaskHandler', logger);
  
  try {
    const taskId = req.params.id;
    const updates = req.body;
    
    const taskService = new TaskService();
    const result = await taskService.updateTask(taskId, updates);
    
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error, req, res);
  }
};