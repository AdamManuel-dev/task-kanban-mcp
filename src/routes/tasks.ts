import { Router } from 'express';
import {
  TaskService,
  type CreateTaskRequest,
  type UpdateTaskRequest,
} from '@/services/TaskService';
import { NoteService } from '@/services/NoteService';
import { TagService } from '@/services/TagService';
import { dbConnection } from '@/database/connection';
import { requirePermission } from '@/middleware/auth';
import { TaskValidation, NoteValidation, validateInput } from '@/utils/validation';
import type { Task } from '@/types';
import { NotFoundError, ValidationError } from '@/utils/errors';

export async function taskRoutes(): Promise<Router> {
  const router = Router();

  const taskService = new TaskService(dbConnection);
  const noteService = new NoteService(dbConnection);
  const tagService = new TagService(dbConnection);

  // GET /api/v1/tasks - List tasks with filters
  router.get('/', requirePermission('read'), async (req, res, next) => {
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
        priority_min,
        priority_max,
        overdue,
      } = req.query;

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

      const options: TaskListOptions = {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        overdue: overdue === 'true',
      };

      // Add optional properties only if they have values
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
      if (priority_min) options.priority_min = parseInt(priority_min as string, 10);
      if (priority_max) options.priority_max = parseInt(priority_max as string, 10);

      const tasks = await taskService.getTasks(options);

      // Get total count for pagination
      const { limit: _, offset: __, ...countOptions } = options;
      const totalTasks = await taskService.getTasks(countOptions);
      const total = totalTasks.length;

      return res.apiPagination(
        tasks,
        Math.floor(options.offset / options.limit) + 1,
        options.limit,
        total
      );
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/tasks - Create task
  router.post('/', requirePermission('write'), async (req, res, next) => {
    try {
      const rawTaskData = validateInput(TaskValidation.create, req.body);
      // Filter out undefined values to comply with exactOptionalPropertyTypes
      const taskData = Object.fromEntries(
        Object.entries(rawTaskData).filter(([, value]) => value !== undefined)
      ) as unknown as CreateTaskRequest;
      const task = await taskService.createTask(taskData);
      return res.status(201).apiSuccess(task);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tasks/:id - Get task details
  router.get('/:id', requirePermission('read'), async (req, res, next) => {
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

      return res.apiSuccess(task);
    } catch (error) {
      return next(error);
    }
  });

  // PATCH /api/v1/tasks/:id - Update task
  router.patch('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Task', 'ID is required');
      }
      const updateData = validateInput(TaskValidation.update, req.body);
      const task = await taskService.updateTask(id, updateData);
      return res.apiSuccess(task);
    } catch (error) {
      return next(error);
    }
  });

  // DELETE /api/v1/tasks/:id - Delete task
  router.delete('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Task', 'ID is required');
      }
      await taskService.deleteTask(id);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/tasks/:id/dependencies - Add dependency
  router.post('/:id/dependencies', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Task', 'ID is required');
      }
      const dependencyData = validateInput(TaskValidation.dependency, {
        task_id: id,
        ...req.body,
      });

      const dependency = await taskService.addDependency(
        dependencyData.task_id,
        dependencyData.depends_on_task_id,
        dependencyData.dependency_type
      );

      return res.status(201).apiSuccess(dependency);
    } catch (error) {
      return next(error);
    }
  });

  // DELETE /api/v1/tasks/:id/dependencies/:dependsOnId - Remove dependency
  router.delete(
    '/:id/dependencies/:dependsOnId',
    requirePermission('write'),
    async (req, res, next) => {
      try {
        const { id, dependsOnId } = req.params;
        if (!id) {
          throw new NotFoundError('Task', 'ID is required');
        }
        if (!dependsOnId) {
          throw new NotFoundError('Dependency', 'Dependency ID is required');
        }
        await taskService.removeDependency(id, dependsOnId);
        return res.status(204).send();
      } catch (error) {
        return next(error);
      }
    }
  );

  // GET /api/v1/tasks/:id/dependencies - Get task dependencies
  router.get('/:id/dependencies', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Task', 'ID is required');
      }
      const taskWithDeps = await taskService.getTaskWithDependencies(id);

      if (!taskWithDeps) {
        throw new NotFoundError('Task', id);
      }

      return res.apiSuccess({
        dependencies: taskWithDeps.dependencies,
        dependents: taskWithDeps.dependents,
      });
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/tasks/:id/subtasks - Create subtask
  router.post('/:id/subtasks', requirePermission('write'), async (req, res, next) => {
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
        Object.entries(rawSubtaskData).filter(([, value]) => value !== undefined)
      );

      const subtask = await taskService.createTask(subtaskData as any);
      return res.status(201).apiSuccess(subtask);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tasks/:id/subtasks - List subtasks
  router.get('/:id/subtasks', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new ValidationError('Task ID is required');
      }
      const taskWithSubtasks = await taskService.getTaskWithSubtasks(id);

      if (!taskWithSubtasks) {
        throw new NotFoundError('Task', id);
      }

      return res.apiSuccess(taskWithSubtasks.subtasks);
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/tasks/:id/notes - Add note to task
  router.post('/:id/notes', requirePermission('write'), async (req, res, next) => {
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
      return res.status(201).apiSuccess(note);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tasks/:id/notes - Get task notes
  router.get('/:id/notes', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0, category, pinned } = req.query;

      const options = {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        category: category as any,
        pinned: pinned === 'true' ? true : pinned === 'false' ? false : undefined,
      };

      if (!id) {
        throw new ValidationError('Task ID is required');
      }
      const notes = await noteService.getTaskNotes(id, options);
      return res.apiSuccess(notes);
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/tasks/:id/tags - Add tags to task
  router.post('/:id/tags', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { tag_ids } = req.body;

      if (!Array.isArray(tag_ids)) {
        return res.status(400).apiError('INVALID_INPUT', 'tag_ids must be an array');
      }

      if (!id) {
        throw new ValidationError('Task ID is required');
      }
      const assignedTags = [];
      for (const tagId of tag_ids) {
        if (!tagId) {
          throw new NotFoundError('Tag', tagId);
        }
        const assignment = await tagService.addTagToTask(id, tagId);
        assignedTags.push(assignment);
      }

      return res.status(201).apiSuccess(assignedTags);
    } catch (error) {
      return next(error);
    }
  });

  // DELETE /api/v1/tasks/:id/tags/:tagId - Remove tag from task
  router.delete('/:id/tags/:tagId', requirePermission('write'), async (req, res, next) => {
    try {
      const { id, tagId } = req.params;
      if (!id) {
        throw new NotFoundError('Task', 'ID is required');
      }
      if (!tagId) {
        throw new NotFoundError('Tag', 'Tag ID is required');
      }
      await tagService.removeTagFromTask(id, tagId);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tasks/:id/tags - Get task tags
  router.get('/:id/tags', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new ValidationError('Task ID is required');
      }
      const tags = await tagService.getTaskTags(id);
      return res.apiSuccess(tags);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tasks/blocked - Get blocked tasks
  router.get('/blocked', requirePermission('read'), async (req, res, next) => {
    try {
      const { board_id } = req.query;
      const blockedTasks = await taskService.getBlockedTasks(board_id as string);
      return res.apiSuccess(blockedTasks);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tasks/overdue - Get overdue tasks
  router.get('/overdue', requirePermission('read'), async (req, res, next) => {
    try {
      const { board_id } = req.query;
      const overdueTasks = await taskService.getOverdueTasks(board_id as string);
      return res.apiSuccess(overdueTasks);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
