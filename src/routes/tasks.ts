/**
 * @module routes/tasks
 * @description RESTful API routes for task management.
 *
 * This module provides comprehensive task operations including CRUD operations,
 * dependency management, subtask handling, notes, and tags. All routes require
 * authentication and appropriate permissions.
 *
 * Base path: `/api/v1/tasks`
 *
 * @example
 * ```typescript
 * // Client usage example
 * const response = await fetch('/api/v1/tasks', {
 *   method: 'GET',
 *   headers: {
 *     'X-API-Key': 'your-api-key',
 *     'Content-Type': 'application/json'
 *   }
 * });
 * ```
 */

import { Router } from 'express';
import { TaskService, type CreateTaskRequest } from '@/services/TaskService';
import { NoteService } from '@/services/NoteService';
import { TagService } from '@/services/TagService';
import { dbConnection } from '@/database/connection';
import { requirePermission } from '@/middleware/auth';
import { TaskValidation, NoteValidation, validateInput } from '@/utils/validation';
import type { Task } from '@/types';
import { NotFoundError, ValidationError } from '@/utils/errors';

/**
 * Create and configure task routes.
 *
 * @returns Express router with all task endpoints configured
 */
export function taskRoutes(): Router {
  const router = Router();

  const taskService = new TaskService(dbConnection);
  const noteService = new NoteService(dbConnection);
  const tagService = new TagService(dbConnection);

  /**
   * List tasks with filtering, sorting, and pagination.
   *
   * @route GET /api/v1/tasks
   * @auth Required - Read permission
   *
   * @queryparam {number} limit - Maximum tasks to return (default: 50)
   * @queryparam {number} offset - Pagination offset (default: 0)
   * @queryparam {string} sortBy - Field to sort by: updated_at, created_at, priority, due_date (default: updated_at)
   * @queryparam {string} sortOrder - Sort direction: asc or desc (default: desc)
   * @queryparam {string} board_id - Filter by board ID
   * @queryparam {string} column_id - Filter by column ID
   * @queryparam {string} status - Filter by status: todo, in_progress, done, blocked, archived
   * @queryparam {string} assignee - Filter by assignee
   * @queryparam {string} parent_task_id - Filter by parent task (for subtasks)
   * @queryparam {string} search - Search in title and description
   * @queryparam {number} priority_min - Minimum priority (inclusive)
   * @queryparam {number} priority_max - Maximum priority (inclusive)
   * @queryparam {boolean} overdue - Filter overdue tasks (true/false)
   *
   * @response 200 - Success
   * ```json
   * {
   *   "success": true,
   *   "data": [
   *     {
   *       "id": "task123",
   *       "title": "Implement feature",
   *       "status": "in_progress",
   *       "priority": 8,
   *       "created_at": "2024-01-20T10:00:00Z"
   *     }
   *   ],
   *   "pagination": {
   *     "page": 1,
   *     "limit": 50,
   *     "total": 123,
   *     "totalPages": 3
   *   }
   * }
   * ```
   *
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   */
  // GET /api/v1/tasks - List tasks with filters
  router.get('/', requirePermission('read'), async (req, res, next): Promise<void> => {
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

  /**
   * Create a new task.
   *
   * @route POST /api/v1/tasks
   * @auth Required - Write permission
   *
   * @bodyparam {string} title - Task title (required)
   * @bodyparam {string} [description] - Task description
   * @bodyparam {string} board_id - Board ID (required)
   * @bodyparam {string} [column_id] - Column ID
   * @bodyparam {string} [status] - Initial status: todo, in_progress, done, blocked
   * @bodyparam {number} [priority] - Priority 1-10 (default: 5)
   * @bodyparam {string} [assignee] - Assignee identifier
   * @bodyparam {string} [due_date] - Due date in ISO format
   * @bodyparam {string[]} [tags] - Array of tag IDs
   * @bodyparam {string} [parent_task_id] - Parent task ID for subtasks
   * @bodyparam {number} [position] - Position in column
   *
   * @response 201 - Task created successfully
   * ```json
   * {
   *   "success": true,
   *   "data": {
   *     "id": "task456",
   *     "title": "New task",
   *     "board_id": "board123",
   *     "status": "todo",
   *     "priority": 5,
   *     "created_at": "2024-01-20T10:00:00Z"
   *   }
   * }
   * ```
   *
   * @response 400 - Invalid input data
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   */
  // POST /api/v1/tasks - Create task
  router.post('/', requirePermission('write'), async (req, res, next): Promise<void> => {
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

  /**
   * Get detailed information about a specific task.
   *
   * @route GET /api/v1/tasks/:id
   * @auth Required - Read permission
   *
   * @param {string} id - Task ID
   * @queryparam {string} [include] - Include related data: 'subtasks' or 'dependencies'
   *
   * @response 200 - Success
   * ```json
   * {
   *   "success": true,
   *   "data": {
   *     "id": "task123",
   *     "title": "Task title",
   *     "description": "Detailed description",
   *     "status": "in_progress",
   *     "priority": 8,
   *     "assignee": "user123",
   *     "due_date": "2024-12-31T00:00:00Z",
   *     "tags": ["bug", "urgent"],
   *     "created_at": "2024-01-20T10:00:00Z",
   *     "updated_at": "2024-01-21T14:30:00Z",
   *     "subtasks": [],  // If include=subtasks
   *     "dependencies": [],  // If include=dependencies
   *     "dependents": []  // If include=dependencies
   *   }
   * }
   * ```
   *
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Task not found
   */
  // GET /api/v1/tasks/:id - Get task details
  router.get('/:id', requirePermission('read'), async (req, res, next): Promise<void> => {
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

  /**
   * Update task properties.
   *
   * @route PATCH /api/v1/tasks/:id
   * @auth Required - Write permission
   *
   * @param {string} id - Task ID
   * @bodyparam {string} [title] - New title
   * @bodyparam {string} [description] - New description
   * @bodyparam {string} [status] - New status: todo, in_progress, done, blocked, archived
   * @bodyparam {number} [priority] - New priority 1-10
   * @bodyparam {string} [assignee] - New assignee
   * @bodyparam {string} [due_date] - New due date in ISO format
   * @bodyparam {number} [position] - New position in column
   *
   * @response 200 - Task updated successfully
   * ```json
   * {
   *   "success": true,
   *   "data": {
   *     "id": "task123",
   *     "title": "Updated title",
   *     "status": "completed",
   *     "updated_at": "2024-01-21T15:00:00Z"
   *   }
   * }
   * ```
   *
   * @response 400 - Invalid input data
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Task not found
   */
  // PATCH /api/v1/tasks/:id - Update task
  router.patch('/:id', requirePermission('write'), async (req, res, next): Promise<void> => {
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

  /**
   * Delete a task permanently.
   *
   * @route DELETE /api/v1/tasks/:id
   * @auth Required - Write permission
   *
   * @param {string} id - Task ID to delete
   *
   * @response 204 - Task deleted successfully (no content)
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Task not found
   *
   * @warning This permanently deletes the task and all associated data
   * (subtasks, notes, tags, dependencies). This action cannot be undone.
   */
  // DELETE /api/v1/tasks/:id - Delete task
  router.delete('/:id', requirePermission('write'), async (req, res, next): Promise<void> => {
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

  /**
   * Add a dependency relationship between tasks.
   *
   * @route POST /api/v1/tasks/:id/dependencies
   * @auth Required - Write permission
   *
   * @param {string} id - Task ID that depends on another task
   * @bodyparam {string} depends_on_task_id - Task ID that this task depends on
   * @bodyparam {string} [dependency_type] - Type: blocks, required, related (default: blocks)
   *
   * @response 201 - Dependency created
   * ```json
   * {
   *   "success": true,
   *   "data": {
   *     "task_id": "task123",
   *     "depends_on_task_id": "task456",
   *     "dependency_type": "blocks",
   *     "created_at": "2024-01-20T10:00:00Z"
   *   }
   * }
   * ```
   *
   * @response 400 - Invalid dependency (e.g., circular dependency)
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Task not found
   */
  // POST /api/v1/tasks/:id/dependencies - Add dependency
  router.post('/:id/dependencies', requirePermission('write'), async (req, res, next): Promise<void> => {
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
    async (req, res, next): Promise<void> => {
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
  router.get('/:id/dependencies', requirePermission('read'), async (req, res, next): Promise<void> => {
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

  // GET /api/v1/dependencies/graph - Get dependency graph
  router.get('/dependencies/graph', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { board_id } = req.query;
      
      // Import the DependencyVisualizationService
      const { DependencyVisualizationService } = await import('@/services/DependencyVisualizationService');
      const depService = DependencyVisualizationService.getInstance();
      
      const graph = await depService.getDependencyGraph(board_id as string);
      
      // Convert Map to Object for JSON serialization
      const nodes = Object.fromEntries(graph.nodes);
      
      return res.apiSuccess({
        nodes,
        edges: graph.edges,
        roots: graph.roots,
        leaves: graph.leaves,
        summary: {
          totalNodes: graph.nodes.size,
          totalEdges: graph.edges.length,
          rootCount: graph.roots.length,
          leafCount: graph.leaves.length
        }
      });
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/dependencies/critical-path - Get critical path
  router.get('/dependencies/critical-path', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { board_id } = req.query;
      
      // Import the DependencyVisualizationService
      const { DependencyVisualizationService } = await import('@/services/DependencyVisualizationService');
      const depService = DependencyVisualizationService.getInstance();
      
      const criticalPath = await depService.findCriticalPath(board_id as string);
      
      return res.apiSuccess(criticalPath);
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/tasks/:id/subtasks - Create subtask
  router.post('/:id/subtasks', requirePermission('write'), async (req, res, next): Promise<void> => {
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
  router.get('/:id/subtasks', requirePermission('read'), async (req, res, next): Promise<void> => {
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

  // PATCH /api/v1/subtasks/:id - Update subtask
  router.patch('/subtasks/:id', requirePermission('write'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new ValidationError('Subtask ID is required');
      }

      // First verify this is actually a subtask (has parent_task_id)
      const existingTask = await taskService.getTask(id);
      if (!existingTask) {
        throw new NotFoundError('Subtask', id);
      }
      if (!existingTask.parent_task_id) {
        throw new ValidationError('Task is not a subtask');
      }

      const validatedBody = validateInput(TaskValidation.update, req.body);
      
      // Filter out undefined values to comply with exactOptionalPropertyTypes
      const updateData = Object.fromEntries(
        Object.entries(validatedBody).filter(([, value]) => value !== undefined)
      );

      const updatedSubtask = await taskService.updateTask(id, updateData as any);
      return res.apiSuccess(updatedSubtask);
    } catch (error) {
      return next(error);
    }
  });

  // DELETE /api/v1/subtasks/:id - Delete subtask
  router.delete('/subtasks/:id', requirePermission('write'), async (req, res, next): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new ValidationError('Subtask ID is required');
      }

      // First verify this is actually a subtask (has parent_task_id)
      const existingTask = await taskService.getTask(id);
      if (!existingTask) {
        throw new NotFoundError('Subtask', id);
      }
      if (!existingTask.parent_task_id) {
        throw new ValidationError('Task is not a subtask');
      }

      await taskService.deleteTask(id);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Add a note to a task.
   *
   * @route POST /api/v1/tasks/:id/notes
   * @auth Required - Write permission
   *
   * @param {string} id - Task ID
   * @bodyparam {string} content - Note content (required)
   * @bodyparam {string} [category] - Note category: comment, update, reminder, technical
   * @bodyparam {boolean} [pinned] - Pin note to top (default: false)
   *
   * @response 201 - Note created
   * ```json
   * {
   *   "success": true,
   *   "data": {
   *     "id": "note123",
   *     "task_id": "task456",
   *     "content": "Implementation note",
   *     "category": "technical",
   *     "pinned": false,
   *     "created_at": "2024-01-20T10:00:00Z"
   *   }
   * }
   * ```
   *
   * @response 400 - Invalid input data
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Task not found
   */
  // POST /api/v1/tasks/:id/notes - Add note to task
  router.post('/:id/notes', requirePermission('write'), async (req, res, next): Promise<void> => {
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
  router.get('/:id/notes', requirePermission('read'), async (req, res, next): Promise<void> => {
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

  /**
   * Add tags to a task.
   *
   * @route POST /api/v1/tasks/:id/tags
   * @auth Required - Write permission
   *
   * @param {string} id - Task ID
   * @bodyparam {string[]} tag_ids - Array of tag IDs to add
   *
   * @response 201 - Tags added successfully
   * ```json
   * {
   *   "success": true,
   *   "data": [
   *     {
   *       "task_id": "task123",
   *       "tag_id": "tag456",
   *       "created_at": "2024-01-20T10:00:00Z"
   *     }
   *   ]
   * }
   * ```
   *
   * @response 400 - Invalid input (not an array)
   * @response 401 - Missing or invalid API key
   * @response 403 - Insufficient permissions
   * @response 404 - Task or tag not found
   */
  // POST /api/v1/tasks/:id/tags - Add tags to task
  router.post('/:id/tags', requirePermission('write'), async (req, res, next): Promise<void> => {
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
      await Promise.all(
        tag_ids.map(async tagId => {
          await tagService.addTagToTask(id, tagId);
        })
      );

      return res.status(201).apiSuccess(assignedTags);
    } catch (error) {
      return next(error);
    }
  });

  // DELETE /api/v1/tasks/:id/tags/:tagId - Remove tag from task
  router.delete('/:id/tags/:tagId', requirePermission('write'), async (req, res, next): Promise<void> => {
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
  router.get('/:id/tags', requirePermission('read'), async (req, res, next): Promise<void> => {
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
  router.get('/blocked', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { board_id } = req.query;
      const blockedTasks = await taskService.getBlockedTasks(board_id as string);
      return res.apiSuccess(blockedTasks);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tasks/overdue - Get overdue tasks
  router.get('/overdue', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { board_id } = req.query;
      const overdueTasks = await taskService.getOverdueTasks(board_id as string);
      return res.apiSuccess(overdueTasks);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/tasks/next - Get next recommended task
  router.get('/next', requirePermission('read'), async (req, res, next): Promise<void> => {
    try {
      const { board_id, assignee, skill_context, exclude_blocked = 'true' } = req.query;

      // Build filters for the next task recommendation
      const filters = {
        board_id: board_id as string,
        assignee: assignee as string,
        skill_context: skill_context as string,
        exclude_blocked: exclude_blocked === 'true',
      };

      // Get all tasks with filters
      const tasks = await taskService.getTasks({
        board_id: filters.board_id,
        assignee: filters.assignee,
        limit: 50,
      });

      // Filter out completed/archived tasks
      let availableTasks = tasks.filter(
        task => task.status !== 'done' && task.status !== 'archived'
      );

      // Exclude blocked tasks if requested
      if (filters.exclude_blocked) {
        availableTasks = availableTasks.filter(task => task.status !== 'blocked');
      }

      // Filter by skill context if provided
      if (filters.skill_context) {
        availableTasks = availableTasks.filter(
          task =>
            task.title.toLowerCase().includes(filters.skill_context.toLowerCase()) ||
            (task.description &&
              task.description.toLowerCase().includes(filters.skill_context.toLowerCase()))
        );
      }

      if (availableTasks.length === 0) {
        return res.apiSuccess({
          next_task: null,
          reasoning: 'No available tasks found matching the criteria',
        });
      }

      // Sort by priority (highest first), then by due date
      availableTasks.sort((a, b) => {
        const priorityDiff = (b.priority ?? 1) - (a.priority ?? 1);
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
      let reasoning = `Highest priority available task (Priority: ${String(nextTask.priority ?? 1)})`;

      if (nextTask.due_date) {
        const dueDate = new Date(nextTask.due_date);
        const now = new Date();
        const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        reasoning += `, Due in ${String(daysUntilDue)} days`;
      }

      if (filters.skill_context) {
        reasoning += `, Matches skill context: ${String(filters.skill_context)}`;
      }

      return res.apiSuccess({
        next_task: nextTask,
        reasoning,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
