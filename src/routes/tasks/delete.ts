/**
 * @fileoverview Task deletion route handler
 * @lastmodified 2025-07-28T05:15:00Z
 * 
 * Features: Task deletion operations, soft delete support
 * Main APIs: deleteTaskHandler(req, res) - Deletes task by ID
 * Constraints: Requires valid task ID, handles cascade operations
 * Patterns: Returns 200 with deletion confirmation or error
 */

import { Request, Response } from 'express';
import { TaskService } from '@/services/TaskService';
import { logger } from '@/utils/logger';
import { createServiceErrorHandler } from '@/utils/errors';

/**
 * Deletes a task by ID
 */
export const deleteTaskHandler = async (req: Request, res: Response): Promise<void> => {
  const errorHandler = createServiceErrorHandler('deleteTaskHandler', logger);
  
  try {
    const taskId = req.params.id;
    
    const taskService = new TaskService();
    const result = await taskService.deleteTask(taskId);
    
    if (result.success) {
      res.json({ success: true, message: 'Task deleted successfully' });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error, req, res);
  }
};