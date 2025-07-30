/**
 * @fileoverview Task subtasks route handlers
 * @lastmodified 2025-07-28T05:15:00Z
 * 
 * Features: Subtask operations, hierarchical task management
 * Main APIs: taskSubtaskRoutes - Express router for subtasks
 * Constraints: Validates parent-child relationships, prevents cycles
 * Patterns: RESTful routes under /tasks/:id/subtasks
 */

import { Router } from 'express';
import { TaskService } from '@/services/TaskService';
import { logger } from '@/utils/logger';
import { createServiceErrorHandler } from '@/utils/errors';

export const taskSubtaskRoutes = Router({ mergeParams: true });

/**
 * GET /tasks/:id/subtasks - Get all subtasks for a task
 */
taskSubtaskRoutes.get('/', async (req, res) => {
  const errorHandler = createServiceErrorHandler('getTaskSubtasks', logger);
  
  try {
    const taskId = req.params.id;
    const taskService = new TaskService();
    const result = await taskService.getSubtasks(taskId);
    
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
 * POST /tasks/:id/subtasks - Create a subtask under parent task
 */
taskSubtaskRoutes.post('/', async (req, res) => {
  const errorHandler = createServiceErrorHandler('createSubtask', logger);
  
  try {
    const parentTaskId = req.params.id;
    const subtaskData = { ...req.body, parent_task_id: parentTaskId };
    
    const taskService = new TaskService();
    const result = await taskService.createTask(subtaskData);
    
    if (result.success) {
      res.status(201).json({ success: true, data: result.data });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error, req, res);
  }
});

/**
 * PUT /tasks/:id/subtasks/:subtaskId - Update a subtask
 */
taskSubtaskRoutes.put('/:subtaskId', async (req, res) => {
  const errorHandler = createServiceErrorHandler('updateSubtask', logger);
  
  try {
    const { subtaskId } = req.params;
    const updates = req.body;
    
    const taskService = new TaskService();
    const result = await taskService.updateTask(subtaskId, updates);
    
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
 * DELETE /tasks/:id/subtasks/:subtaskId - Delete a subtask
 */
taskSubtaskRoutes.delete('/:subtaskId', async (req, res) => {
  const errorHandler = createServiceErrorHandler('deleteSubtask', logger);
  
  try {
    const { subtaskId } = req.params;
    const taskService = new TaskService();
    const result = await taskService.deleteTask(subtaskId);
    
    if (result.success) {
      res.json({ success: true, message: 'Subtask deleted successfully' });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    errorHandler(error, req, res);
  }
});