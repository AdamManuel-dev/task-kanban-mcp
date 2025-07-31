/**
 * @fileoverview Task route handlers - separated for complexity reduction
 * @lastmodified 2025-07-31T12:00:00Z
 *
 * Features: CRUD operations, list, create, update, delete task handlers
 * Main APIs: listTasks(), createTask(), updateTask(), deleteTask()
 * Constraints: Requires authentication, permission validation
 * Patterns: All handlers use try/catch, return Promise<void>
 */

import type { Request, Response, NextFunction } from 'express';
import type {
  TaskService,
  CreateTaskRequest as ServiceCreateTaskRequest,
  UpdateTaskRequest as ServiceUpdateTaskRequest,
} from '@/services/TaskService';
import { NoteService } from '@/services/NoteService';
import { TagService } from '@/services/TagService';
import { type Task } from '@/database/schema';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { validateInput, TaskValidation } from '@/utils/validation';

interface TaskListOptions {
  limit: number;
  offset: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  overdue: boolean;
  board_id?: string;
  column_id?: string;
  status?: Task['status'];
  assignee?: string;
  parent_task_id?: string;
  search?: string;
  priority_min?: number;
  priority_max?: number;
}

export async function listTasks(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const {
      limit = 50,
      offset = 0,
      sortBy = 'updated_at',
      sortOrder = 'desc',
      board_id,
      column_id,
      status,
      assignee,
      parent_task_id,
      search,
      priority_min: priorityMin,
      priority_max: priorityMax,
      overdue,
    } = req.query;

    const options: TaskListOptions = {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
      overdue: overdue === 'true',
    };

    if (board_id) options.board_id = board_id as string;
    if (column_id) options.column_id = column_id as string;
    if (
      status &&
      typeof status === 'string' &&
      ['todo', 'in_progress', 'done', 'blocked', 'archived'].includes(status)
    ) {
      options.status = status as Task['status'];
    }
    if (assignee) options.assignee = assignee as string;
    if (parent_task_id) options.parent_task_id = parent_task_id as string;
    if (search) options.search = search as string;
    if (priorityMin) options.priority_min = parseInt(priorityMin as string, 10);
    if (priorityMax) options.priority_max = parseInt(priorityMax as string, 10);

    const tasks = await taskService.getTasks(options);
    const { limit: _, offset: __, ...countOptions } = options;
    const totalTasks = await taskService.getTasks(countOptions);
    const total = totalTasks.length;

    res.apiPagination({
      data: tasks,
      page: Math.floor(options.offset / options.limit) + 1,
      limit: options.limit,
      total,
    });
  } catch (error) {
    next(error);
  }
}

export async function createTask(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const taskData = req.body;
    const task = await taskService.createTask(taskData);
    res.apiSuccess(task, 'Task created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getTaskById(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new NotFoundError('Task', 'ID is required');
    }

    const { include } = req.query;

    let task;
    if (include === 'subtasks') {
      task = await taskService.getTaskWithSubtasks(id);
    } else if (include === 'dependencies') {
      task = await taskService.getTaskWithDependencies(id);
    } else {
      task = await taskService.getTaskById(id);
    }

    if (!task) {
      throw new NotFoundError('Task', id);
    }

    res.apiSuccess(task, 'Task retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function updateTask(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const task = await taskService.updateTask(id, updateData);
    res.apiSuccess(task, 'Task updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteTask(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new NotFoundError('Task', 'ID is required');
    }
    await taskService.deleteTask(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function updateTaskPriority(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new NotFoundError('Task', 'ID is required');
    }

    const { priority, change_reason, changed_by } = req.body;
    const updateData = {
      priority,
      change_reason,
      changed_by,
    };

    const task = await taskService.updateTask(id, updateData);
    res.apiSuccess(task);
  } catch (error) {
    next(error);
  }
}

export async function createSubtask(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new NotFoundError('Task', 'ID is required');
    }
    const rawSubtaskData = validateInput(TaskValidation.create, {
      ...req.body,
      parent_task_id: id,
    });

    // Filter out undefined values to comply with exactOptionalPropertyTypes
    const subtaskData = Object.fromEntries(
      Object.entries(rawSubtaskData).filter(([, value]) => value != null)
    );

    const subtask = await taskService.createTask(
      subtaskData as unknown as ServiceCreateTaskRequest
    );
    res.status(201).apiSuccess(subtask);
  } catch (error) {
    next(error);
  }
}

export async function getSubtasks(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new ValidationError('Task ID is required');
    }
    const taskWithSubtasks = await taskService.getTaskWithSubtasks(id);

    if (!taskWithSubtasks) {
      throw new NotFoundError('Task', id);
    }

    res.apiSuccess(taskWithSubtasks.subtasks);
  } catch (error) {
    next(error);
  }
}

export async function updateSubtask(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new ValidationError('Subtask ID is required');
    }

    // First verify this is actually a subtask (has parent_task_id)
    const existingTask = await taskService.getTaskById(id);
    if (!existingTask) {
      throw new NotFoundError('Subtask', id);
    }
    if (!existingTask.parent_task_id) {
      throw new ValidationError('Task is not a subtask');
    }

    const validatedBody = validateInput(TaskValidation.update, req.body);

    // Filter out undefined values to comply with exactOptionalPropertyTypes
    const updateData = Object.fromEntries(
      Object.entries(validatedBody).filter(([, value]) => value != null)
    );

    const updatedSubtask = await taskService.updateTask(id, updateData as ServiceUpdateTaskRequest);
    res.apiSuccess(updatedSubtask);
  } catch (error) {
    next(error);
  }
}

export async function deleteSubtask(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new ValidationError('Subtask ID is required');
    }

    // First verify this is actually a subtask (has parent_task_id)
    const existingTask = await taskService.getTaskById(id);
    if (!existingTask) {
      throw new NotFoundError('Subtask', id);
    }
    if (!existingTask.parent_task_id) {
      throw new ValidationError('Task is not a subtask');
    }

    await taskService.deleteTask(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getBlockedTasks(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { board_id } = req.query;
    const blockedTasks = await taskService.getBlockedTasks(board_id as string);
    res.apiSuccess(blockedTasks);
  } catch (error) {
    next(error);
  }
}

export async function getOverdueTasks(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { board_id } = req.query;
    const overdueTasks = await taskService.getOverdueTasks(board_id as string);
    res.apiSuccess(overdueTasks);
  } catch (error) {
    next(error);
  }
}

export async function getNextTask(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { board_id, assignee, skill_context, exclude_blocked = 'true' } = req.query;

    // Build filters for the next task recommendation
    const filters = {
      board_id: board_id as string,
      assignee: assignee as string,
      skillContext: skill_context as string,
      excludeBlocked: exclude_blocked === 'true',
    };

    // Get all tasks with filters
    const tasks = await taskService.getTasks({
      board_id: filters.board_id,
      assignee: filters.assignee,
      limit: 50,
    });

    // Filter out completed/archived tasks
    let availableTasks = tasks.filter(task => task.status !== 'done' && task.status !== 'archived');

    // Exclude blocked tasks if requested
    if (filters.excludeBlocked) {
      availableTasks = availableTasks.filter(task => task.status !== 'blocked');
    }

    // Filter by skill context if provided
    if (filters.skillContext) {
      availableTasks = availableTasks.filter(
        task =>
          task.title.toLowerCase().includes(filters.skillContext.toLowerCase()) ||
          (task.description &&
            task.description.toLowerCase().includes(filters.skillContext.toLowerCase()))
      );
    }

    if (availableTasks.length === 0) {
      res.apiSuccess({
        next_task: null,
        reasoning: 'No available tasks found matching the criteria',
      });
      return;
    }

    // Sort by priority (highest first), then by due date
    availableTasks.sort((a, b) => {
      const priorityDiff = (b.priority || 1) - (a.priority || 1);
      if (priorityDiff !== 0) return priorityDiff;

      // If same priority, sort by due date
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });

    const nextTask = availableTasks[0];

    // Enhanced reasoning with multiple factors
    const reasoningFactors: string[] = [];

    // Priority reasoning
    const priority = nextTask.priority || 1;
    if (priority >= 8) {
      reasoningFactors.push(`🔥 Critical Priority (${priority}/10) - Urgent attention required`);
    } else if (priority >= 6) {
      reasoningFactors.push(`⚡ High Priority (${priority}/10) - Important task`);
    } else if (priority >= 4) {
      reasoningFactors.push(`📈 Medium Priority (${priority}/10) - Standard task`);
    } else {
      reasoningFactors.push(`📝 Low Priority (${priority}/10) - Background task`);
    }

    // Due date reasoning
    if (nextTask.due_date) {
      const dueDate = new Date(nextTask.due_date);
      const now = new Date();
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilDue < 0) {
        reasoningFactors.push(
          `🚨 OVERDUE by ${Math.abs(daysUntilDue)} day(s) - Immediate action needed`
        );
      } else if (daysUntilDue <= 1) {
        reasoningFactors.push(
          `⚠️ Due ${daysUntilDue === 0 ? 'today' : 'tomorrow'} - Time sensitive`
        );
      } else if (daysUntilDue <= 7) {
        reasoningFactors.push(`📅 Due in ${daysUntilDue} days - Approaching deadline`);
      } else {
        reasoningFactors.push(`📅 Due in ${daysUntilDue} days - Adequate time available`);
      }
    }

    // Blocking status reasoning
    if (nextTask.status === 'blocked') {
      reasoningFactors.push(`🚫 Currently blocked - May need dependency resolution first`);
    } else if (nextTask.status === 'in_progress') {
      reasoningFactors.push(`🔄 Already in progress - Continue existing work`);
    } else {
      reasoningFactors.push(`✅ Ready to start - No blocking dependencies`);
    }

    // Skill context reasoning
    if (filters.skillContext) {
      reasoningFactors.push(`🎯 Matches skill context: "${filters.skillContext}"`);
    }

    // Task complexity reasoning based on description length
    if (nextTask.description) {
      const descLength = nextTask.description.length;
      if (descLength > 500) {
        reasoningFactors.push(`📋 Complex task - Detailed requirements specified`);
      } else if (descLength > 100) {
        reasoningFactors.push(`📝 Well-defined task - Clear requirements`);
      } else {
        reasoningFactors.push(`⚡ Simple task - Quick to understand`);
      }
    }

    // Assignee reasoning
    if (nextTask.assignee) {
      if (filters.assignee && nextTask.assignee === filters.assignee) {
        reasoningFactors.push(`👤 Assigned to you - Personal responsibility`);
      } else {
        reasoningFactors.push(
          `👥 Assigned to ${nextTask.assignee} - Team coordination may be needed`
        );
      }
    } else {
      reasoningFactors.push(`🆓 Unassigned - Available for anyone to pick up`);
    }

    // Selection reasoning summary
    const mainReason = reasoningFactors[0]; // Priority is first
    const additionalFactors = reasoningFactors.slice(1);

    let reasoning = `Selected based on: ${mainReason}`;
    if (additionalFactors.length > 0) {
      reasoning += `\n\nAdditional factors:\n• ${additionalFactors.join('\n• ')}`;
    }

    reasoning += `\n\nThis task was chosen from ${availableTasks.length} available task(s) using priority-first sorting with deadline awareness.`;

    res.apiSuccess({
      next_task: nextTask,
      reasoning,
    });
  } catch (error) {
    next(error);
  }
}
