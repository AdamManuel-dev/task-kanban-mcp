import { Router } from 'express';
import { TaskService } from '@/services/TaskService';
import { NoteService } from '@/services/NoteService';
import { TagService } from '@/services/TagService';
import { dbConnection } from '@/database/connection';
import { requirePermission } from '@/middleware/auth';
import { TaskValidation, NoteValidation, TagValidation, validateInput } from '@/utils/validation';
import { NotFoundError } from '@/utils/errors';

export async function taskRoutes() {
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

      const options = {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        board_id: board_id as string,
        column_id: column_id as string,
        status: status as any,
        assignee: assignee as string,
        parent_task_id: parent_task_id as string,
        search: search as string,
        priority_min: priority_min ? parseInt(priority_min as string, 10) : undefined,
        priority_max: priority_max ? parseInt(priority_max as string, 10) : undefined,
        overdue: overdue === 'true',
      };

      const tasks = await taskService.getTasks(options);
      
      // Get total count for pagination
      const totalTasks = await taskService.getTasks({ ...options, limit: undefined, offset: undefined });
      const total = totalTasks.length;

      res.apiPagination(tasks, Math.floor(options.offset / options.limit) + 1, options.limit, total);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/tasks - Create task
  router.post('/', requirePermission('write'), async (req, res, next) => {
    try {
      const taskData = validateInput(TaskValidation.create, req.body);
      const task = await taskService.createTask(taskData);
      res.status(201).apiSuccess(task);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tasks/:id - Get task details
  router.get('/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
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

      res.apiSuccess(task);
    } catch (error) {
      next(error);
    }
  });

  // PATCH /api/v1/tasks/:id - Update task
  router.patch('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = validateInput(TaskValidation.update, req.body);
      const task = await taskService.updateTask(id, updateData);
      res.apiSuccess(task);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/v1/tasks/:id - Delete task
  router.delete('/:id', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      await taskService.deleteTask(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/tasks/:id/dependencies - Add dependency
  router.post('/:id/dependencies', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const dependencyData = validateInput(TaskValidation.dependency, {
        task_id: id,
        ...req.body,
      });
      
      const dependency = await taskService.addDependency(
        dependencyData.task_id,
        dependencyData.depends_on_task_id,
        dependencyData.dependency_type
      );
      
      res.status(201).apiSuccess(dependency);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/v1/tasks/:id/dependencies/:dependsOnId - Remove dependency
  router.delete('/:id/dependencies/:dependsOnId', requirePermission('write'), async (req, res, next) => {
    try {
      const { id, dependsOnId } = req.params;
      await taskService.removeDependency(id, dependsOnId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tasks/:id/dependencies - Get task dependencies
  router.get('/:id/dependencies', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const taskWithDeps = await taskService.getTaskWithDependencies(id);
      
      if (!taskWithDeps) {
        throw new NotFoundError('Task', id);
      }

      res.apiSuccess({
        dependencies: taskWithDeps.dependencies,
        dependents: taskWithDeps.dependents,
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/tasks/:id/subtasks - Create subtask
  router.post('/:id/subtasks', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const subtaskData = validateInput(TaskValidation.create, {
        ...req.body,
        parent_task_id: id,
      });
      
      const subtask = await taskService.createTask(subtaskData);
      res.status(201).apiSuccess(subtask);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tasks/:id/subtasks - List subtasks
  router.get('/:id/subtasks', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Task', id);
      }
      const taskWithSubtasks = await taskService.getTaskWithSubtasks(id);
      
      if (!taskWithSubtasks) {
        throw new NotFoundError('Task', id);
      }

      res.apiSuccess(taskWithSubtasks.subtasks);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/tasks/:id/notes - Add note to task
  router.post('/:id/notes', requirePermission('write'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Task', id);
      }
      const validatedBody = validateInput(NoteValidation.create, req.body);
      const noteData = {
        task_id: id,
        content: validatedBody.content,
        ...(validatedBody.category ? { category: validatedBody.category } : {}),
        ...(validatedBody.pinned !== undefined ? { pinned: validatedBody.pinned } : {}),
      };
      
      const note = await noteService.createNote(noteData);
      res.status(201).apiSuccess(note);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tasks/:id/notes - Get task notes
  router.get('/:id/notes', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const {
        limit = 50,
        offset = 0,
        category,
        pinned,
      } = req.query;

      const options = {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        category: category as any,
        pinned: pinned === 'true' ? true : pinned === 'false' ? false : undefined,
      };

      if (!id) {
        throw new NotFoundError('Task', id);
      }
      const notes = await noteService.getTaskNotes(id, options);
      res.apiSuccess(notes);
    } catch (error) {
      next(error);
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
        throw new NotFoundError('Task', id);
      }
      const assignedTags = [];
      for (const tagId of tag_ids) {
        if (!tagId) {
          throw new NotFoundError('Tag', tagId);
        }
        const assignment = await tagService.addTagToTask(id, tagId);
        assignedTags.push(assignment);
      }

      res.status(201).apiSuccess(assignedTags);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/v1/tasks/:id/tags/:tagId - Remove tag from task
  router.delete('/:id/tags/:tagId', requirePermission('write'), async (req, res, next) => {
    try {
      const { id, tagId } = req.params;
      if (!id) {
        throw new NotFoundError('Task', id);
      }
      if (!tagId) {
        throw new NotFoundError('Tag', tagId);
      }
      await tagService.removeTagFromTask(id, tagId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tasks/:id/tags - Get task tags
  router.get('/:id/tags', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new NotFoundError('Task', id);
      }
      const tags = await tagService.getTaskTags(id);
      res.apiSuccess(tags);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tasks/blocked - Get blocked tasks
  router.get('/blocked', requirePermission('read'), async (req, res, next) => {
    try {
      const { board_id } = req.query;
      const blockedTasks = await taskService.getBlockedTasks(board_id as string);
      res.apiSuccess(blockedTasks);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/tasks/overdue - Get overdue tasks
  router.get('/overdue', requirePermission('read'), async (req, res, next) => {
    try {
      const { board_id } = req.query;
      const overdueTasks = await taskService.getOverdueTasks(board_id as string);
      res.apiSuccess(overdueTasks);
    } catch (error) {
      next(error);
    }
  });

  return router;
}