/**
 * Task Service - Core business logic for task management
 *
 * @module services/TaskService
 * @description Provides comprehensive task management functionality including CRUD operations,
 * dependencies, priorities, and advanced querying. Handles task positioning, subtask relationships,
 * and dependency validation to maintain data integrity.
 *
 * @example
 * ```typescript
 * import { TaskService } from '@/services/TaskService';
 * import { dbConnection } from '@/database/connection';
 *
 * const taskService = new TaskService(dbConnection);
 *
 * // Create a new task
 * const task = await taskService.createTask({
 *   title: 'Implement user authentication',
 *   description: 'Add JWT-based authentication system',
 *   board_id: 'board-123',
 *   column_id: 'todo',
 *   priority: 5
 * });
 *
 * // Get tasks with filtering
 * const tasks = await taskService.getTasks({
 *   board_id: 'board-123',
 *   status: 'in_progress',
 *   limit: 10
 * });
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type { DatabaseConnection, QueryParameters } from '../database/connection';
import type {
  Task,
  TaskDependency,
  ServiceError,
  PaginationOptions,
  FilterOptions,
  CriticalPathResult,
  TaskImpactAnalysis,
  ProgressCalculationResult,
  SubtaskHierarchy,
} from '../types';
import { TaskHistoryService } from './TaskHistoryService';

/**
 * Request interface for creating new tasks
 *
 * @interface CreateTaskRequest
 * @description Defines the structure for task creation requests with all optional and required fields
 */
export interface CreateTaskRequest {
  title: string;
  description?: string;
  board_id: string;
  column_id: string;
  position?: number;
  priority?: number;
  status?: Task['status'];
  assignee?: string;
  due_date?: Date;
  estimated_hours?: number;
  parent_task_id?: string;
  metadata?: string;
}

/**
 * Request interface for updating existing tasks
 *
 * @interface UpdateTaskRequest
 * @description All fields are optional to support partial updates. Position and column changes
 * are handled automatically with proper repositioning logic.
 */
export interface UpdateTaskRequest {
  title?: string | undefined;
  description?: string | undefined;
  column_id?: string | undefined;
  position?: number | undefined;
  priority?: number | undefined;
  status?: Task['status'] | undefined;
  assignee?: string | undefined;
  due_date?: Date | undefined;
  estimated_hours?: number | undefined;
  actual_hours?: number | undefined;
  parent_task_id?: string | undefined;
  metadata?: string | undefined;
  progress?: number | undefined;
  change_reason?: string | undefined; // Optional reason for the change
}

/**
 * Advanced filtering options for task queries
 *
 * @interface TaskFilters
 * @extends FilterOptions
 * @description Provides comprehensive filtering capabilities for task searches including
 * board/column filtering, status filtering, dependency checks, and date-based filtering.
 */
export interface TaskFilters extends FilterOptions {
  board_id?: string;
  column_id?: string;
  status?: Task['status'];
  assignee?: string;
  parent_task_id?: string;
  has_dependencies?: boolean;
  overdue?: boolean;
  priority_min?: number;
  priority_max?: number;
}

/**
 * Task with loaded subtask relationships
 *
 * @interface TaskWithSubtasks
 * @extends Task
 * @description Represents a task with all its subtasks loaded and sorted by position
 */
export interface TaskWithSubtasks extends Task {
  subtasks: Task[];
}

/**
 * Task with loaded dependency relationships
 *
 * @interface TaskWithDependencies
 * @extends Task
 * @description Represents a task with both its dependencies (tasks it depends on)
 * and dependents (tasks that depend on it) loaded
 */
export interface TaskWithDependencies extends Task {
  dependencies: TaskDependency[];
  dependents: TaskDependency[];
}

/**
 * Task Service - Manages all task-related operations
 *
 * @class TaskService
 * @description Core service class providing comprehensive task management functionality.
 * Handles task CRUD operations, dependency management, positioning, and advanced querying
 * with proper transaction handling and error recovery.
 */
export class TaskService {
  /**
   * Creates a new TaskService instance
   *
   * @param db Database connection instance for task operations
   */
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Creates a new task with proper positioning and validation
   *
   * @param data Task creation data including title, board, column, and optional metadata
   * @returns Promise resolving to the created task with generated ID and timestamps
   *
   * @throws {ServiceError} TASK_CREATE_FAILED - When task creation fails due to database errors
   * @throws {Error} Parent task not found - When specified parent_task_id doesn't exist
   *
   * @example
   * ```typescript
   * const task = await taskService.createTask({
   *   title: 'Fix login bug',
   *   description: 'Users cannot login with special characters in password',
   *   board_id: 'board-123',
   *   column_id: 'backlog',
   *   priority: 8,
   *   assignee: 'dev@example.com',
   *   due_date: new Date('2024-01-15')
   * });
   * ```
   */
  async createTask(data: CreateTaskRequest): Promise<Task> {
    // Validate required fields
    if (!data.title || data.title.trim().length === 0) {
      throw TaskService.createError('INVALID_TITLE', 'Task title is required and cannot be empty');
    }

    // Validate board_id exists
    const boardExists = await this.db.queryOne('SELECT id FROM boards WHERE id = ?', [
      data.board_id,
    ]);
    if (!boardExists) {
      throw TaskService.createError('INVALID_BOARD_ID', 'Board not found', {
        board_id: data.board_id,
      });
    }

    // Validate column_id exists
    const columnExists = await this.db.queryOne('SELECT id FROM columns WHERE id = ?', [
      data.column_id,
    ]);
    if (!columnExists) {
      throw TaskService.createError('INVALID_COLUMN_ID', 'Column not found', {
        column_id: data.column_id,
      });
    }

    const id = uuidv4();
    const now = new Date();

    const position =
      data.position !== undefined ? data.position : await this.getNextPosition(data.column_id);

    const task: Task = {
      id,
      title: data.title,
      description: data.description,
      board_id: data.board_id,
      column_id: data.column_id,
      position,
      priority: data.priority ?? 1,
      status: data.status ?? 'todo',
      assignee: data.assignee,
      due_date: data.due_date,
      estimated_hours: data.estimated_hours,
      actual_hours: undefined,
      parent_task_id: data.parent_task_id,
      created_at: now,
      updated_at: now,
      completed_at: undefined,
      archived: false,
      metadata: data.metadata,
    };

    try {
      await this.db.transaction(async db => {
        if (data.parent_task_id) {
          const parentExists = await db.get('SELECT id FROM tasks WHERE id = ?', [
            data.parent_task_id,
          ]);
          if (!parentExists) {
            throw new Error('Parent task not found');
          }
        }

        await this.adjustPositionsForInsertion(data.column_id, position);

        await db.run(
          `
          INSERT INTO tasks (
            id, title, description, board_id, column_id, position, priority, status, 
            assignee, due_date, estimated_hours, actual_hours, parent_task_id, 
            created_at, updated_at, completed_at, archived, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            task.id,
            task.title,
            task.description,
            task.board_id,
            task.column_id,
            task.position,
            task.priority,
            task.status,
            task.assignee,
            task.due_date,
            task.estimated_hours,
            task.actual_hours,
            task.parent_task_id,
            task.created_at,
            task.updated_at,
            task.completed_at,
            task.archived,
            task.metadata,
          ]
        );
      });

      logger.info('Task created successfully', { taskId: task.id, title: task.title });
      return task;
    } catch (error) {
      logger.error('Failed to create task', { error, data });
      throw TaskService.createError('TASK_CREATE_FAILED', 'Failed to create task', error);
    }
  }

  /**
   * Retrieves a single task by its ID
   *
   * @param id Unique task identifier
   * @returns Promise resolving to the task if found, null if not found or archived
   *
   * @throws {ServiceError} TASK_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * const task = await taskService.getTaskById('task-123');
   * if (task) {
   *   logger.log(`Task: ${String(String(task.title))}`);
   * }
   * ```
   */
  async getTaskById(id: string): Promise<Task | null> {
    try {
      const task = await this.db.queryOne<Task>(
        `
        SELECT * FROM tasks WHERE id = ? AND archived = FALSE
      `,
        [id]
      );

      if (task) {
        TaskService.convertTaskDates(task);
      }

      return task ?? null;
    } catch (error) {
      logger.error('Failed to get task by ID', { error, id });
      throw TaskService.createError('TASK_FETCH_FAILED', 'Failed to fetch task', error);
    }
  }

  /**
   * Retrieves a task with all its subtasks loaded
   *
   * @param id Unique task identifier
   * @returns Promise resolving to task with subtasks array, or null if not found
   *
   * @throws {ServiceError} TASK_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * const taskWithSubs = await taskService.getTaskWithSubtasks('task-123');
   * if (taskWithSubs) {
   *   logger.log(`Task has ${String(String(taskWithSubs.subtasks.length))} subtasks`);
   * }
   * ```
   */
  async getTaskWithSubtasks(id: string): Promise<TaskWithSubtasks | null> {
    try {
      const task = await this.getTaskById(id);
      if (!task) return null;

      const subtasks = await this.db.query<Task>(
        `
        SELECT * FROM tasks 
        WHERE parent_task_id = ? AND archived = FALSE
        ORDER BY position ASC
      `,
        [id]
      );

      subtasks.forEach(subtask => TaskService.convertTaskDates(subtask));

      return {
        ...task,
        subtasks,
      };
    } catch (error) {
      logger.error('Failed to get task with subtasks', { error, id });
      throw TaskService.createError(
        'TASK_FETCH_FAILED',
        'Failed to fetch task with subtasks',
        error
      );
    }
  }

  /**
   * Retrieves a task with all its dependency relationships
   *
   * @param id Unique task identifier
   * @returns Promise resolving to task with dependencies and dependents arrays
   *
   * @throws {ServiceError} TASK_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * const taskWithDeps = await taskService.getTaskWithDependencies('task-123');
   * if (taskWithDeps) {
   *   logger.log(`Depends on ${String(String(taskWithDeps.dependencies.length))} tasks`);
   *   logger.log(`${String(String(taskWithDeps.dependents.length))} tasks depend on this`);
   * }
   * ```
   */
  async getTaskWithDependencies(id: string): Promise<TaskWithDependencies | null> {
    try {
      const task = await this.getTaskById(id);
      if (!task) return null;

      const [dependencies, dependents] = await Promise.all([
        this.db.query<TaskDependency>(
          `
          SELECT * FROM task_dependencies WHERE task_id = ?
        `,
          [id]
        ),
        this.db.query<TaskDependency>(
          `
          SELECT * FROM task_dependencies WHERE depends_on_task_id = ?
        `,
          [id]
        ),
      ]);

      dependencies.forEach(dep => (dep.created_at = new Date(dep.created_at)));
      dependents.forEach(dep => (dep.created_at = new Date(dep.created_at)));

      return {
        ...task,
        dependencies,
        dependents,
      };
    } catch (error) {
      logger.error('Failed to get task with dependencies', { error, id });
      throw TaskService.createError(
        'TASK_FETCH_FAILED',
        'Failed to fetch task with dependencies',
        error
      );
    }
  }

  /**
   * Retrieves tasks with advanced filtering, pagination, and sorting
   *
   * @param options Comprehensive options for filtering, pagination, and sorting
   * @returns Promise resolving to array of tasks matching the criteria
   *
   * @throws {ServiceError} TASKS_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * // Get recent high-priority tasks
   * const tasks = await taskService.getTasks({
   *   board_id: 'board-123',
   *   priority_min: 7,
   *   sortBy: 'updated_at',
   *   sortOrder: 'desc',
   *   limit: 20
   * });
   *
   * // Search for overdue tasks
   * const overdue = await taskService.getTasks({
   *   overdue: true,
   *   status: 'in_progress'
   * });
   * ```
   */
  async getTasks(options: PaginationOptions & TaskFilters = {}): Promise<Task[]> {
    const {
      limit = 50,
      offset = 0,
      sortBy = 'updated_at',
      sortOrder = 'desc',
      archived = false,
      search,
      board_id,
      column_id,
      status,
      assignee,
      parent_task_id,
      has_dependencies,
      overdue,
      priority_min,
      priority_max,
    } = options;

    try {
      let query = 'SELECT DISTINCT t.* FROM tasks t';
      const params: QueryParameters = [];
      const conditions: string[] = ['t.archived = ?'];
      params.push(archived);

      if (search) {
        conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
        params.push(`%${String(search)}%`, `%${String(search)}%`);
      }

      if (board_id) {
        conditions.push('t.board_id = ?');
        params.push(board_id);
      }

      if (column_id) {
        conditions.push('t.column_id = ?');
        params.push(column_id);
      }

      if (status) {
        conditions.push('t.status = ?');
        params.push(status);
      }

      if (assignee) {
        conditions.push('t.assignee = ?');
        params.push(assignee);
      }

      if (parent_task_id !== undefined) {
        if (parent_task_id === null) {
          conditions.push('t.parent_task_id IS NULL');
        } else {
          conditions.push('t.parent_task_id = ?');
          params.push(parent_task_id);
        }
      }

      if (has_dependencies !== undefined) {
        if (has_dependencies) {
          query += ' LEFT JOIN task_dependencies td ON t.id = td.task_id';
          conditions.push('td.task_id IS NOT NULL');
        } else {
          query += ' LEFT JOIN task_dependencies td ON t.id = td.task_id';
          conditions.push('td.task_id IS NULL');
        }
      }

      if (overdue) {
        conditions.push('t.due_date < ? AND t.status != ?');
        params.push(new Date(), 'done');
      }

      if (priority_min !== undefined) {
        conditions.push('t.priority >= ?');
        params.push(priority_min);
      }

      if (priority_max !== undefined) {
        conditions.push('t.priority <= ?');
        params.push(priority_max);
      }

      query += ` WHERE ${conditions.join(' AND ')}`;
      query += ` ORDER BY t.${sortBy} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const tasks = await this.db.query<Task>(query, params);
      tasks.forEach(task => TaskService.convertTaskDates(task));

      return tasks;
    } catch (error) {
      logger.error('Failed to get tasks', { error, options });
      throw TaskService.createError('TASKS_FETCH_FAILED', 'Failed to fetch tasks', error);
    }
  }

  /**
   * Updates an existing task with automatic position handling
   *
   * @param id Unique task identifier
   * @param data Partial task data to update (only provided fields will be changed)
   * @returns Promise resolving to the updated task
   *
   * @throws {ServiceError} TASK_NOT_FOUND - When task doesn't exist
   * @throws {ServiceError} TASK_UPDATE_FAILED - When update operation fails
   *
   * @example
   * ```typescript
   * // Update task status and completion
   * const updated = await taskService.updateTask('task-123', {
   *   status: 'done',
   *   actual_hours: 8.5
   * });
   *
   * // Move task to different column
   * await taskService.updateTask('task-123', {
   *   column_id: 'in_progress',
   *   position: 0 // Move to top of column
   * });
   * ```
   */
  async updateTask(id: string, data: UpdateTaskRequest): Promise<Task> {
    try {
      const existingTask = await this.getTaskById(id);
      if (!existingTask) {
        throw TaskService.createError('TASK_NOT_FOUND', 'Task not found', { id });
      }

      const updates: string[] = [];
      const params: QueryParameters = [];

      if (data.title !== undefined) {
        updates.push('title = ?');
        params.push(data.title);
      }
      if (data.description !== undefined) {
        updates.push('description = ?');
        params.push(data.description);
      }
      if (data.priority !== undefined) {
        updates.push('priority = ?');
        params.push(data.priority);
      }
      if (data.status !== undefined) {
        updates.push('status = ?');
        params.push(data.status);

        if (data.status === 'done' && existingTask.status !== 'done') {
          updates.push('completed_at = ?');
          params.push(new Date());
        } else if (data.status !== 'done' && existingTask.status === 'done') {
          updates.push('completed_at = ?');
          params.push(null);
        }
      }
      if (data.assignee !== undefined) {
        updates.push('assignee = ?');
        params.push(data.assignee);
      }
      if (data.due_date !== undefined) {
        updates.push('due_date = ?');
        params.push(data.due_date);
      }
      if (data.estimated_hours !== undefined) {
        updates.push('estimated_hours = ?');
        params.push(data.estimated_hours);
      }
      if (data.actual_hours !== undefined) {
        updates.push('actual_hours = ?');
        params.push(data.actual_hours);
      }
      if (data.progress !== undefined) {
        updates.push('progress = ?');
        params.push(data.progress);
      }
      if (data.parent_task_id !== undefined) {
        updates.push('parent_task_id = ?');
        params.push(data.parent_task_id);
      }
      if (data.metadata !== undefined) {
        updates.push('metadata = ?');
        params.push(data.metadata);
      }

      if (updates.length === 0 && data.column_id === undefined && data.position === undefined) {
        return existingTask;
      }

      await this.db.transaction(async db => {
        if (data.column_id !== undefined && data.column_id !== existingTask.column_id) {
          const newPosition =
            data.position !== undefined
              ? data.position
              : await this.getNextPosition(data.column_id);

          await this.adjustPositionsForRemoval(existingTask.column_id, existingTask.position);
          await this.adjustPositionsForInsertion(data.column_id, newPosition);

          updates.push('column_id = ?', 'position = ?');
          params.push(data.column_id, newPosition);
        } else if (data.position !== undefined && data.position !== existingTask.position) {
          await this.adjustPositionsForMove(
            existingTask.column_id,
            existingTask.position,
            data.position
          );
          updates.push('position = ?');
          params.push(data.position);
        }

        if (updates.length > 0) {
          updates.push('updated_at = ?');
          params.push(new Date());
          params.push(id);

          await db.run(
            `
            UPDATE tasks 
            SET ${String(String(updates.join(', ')))}
            WHERE id = ?
          `,
            params
          );
        }
      });

      const updatedTask = await this.getTaskById(id);
      if (!updatedTask) {
        throw TaskService.createError('TASK_UPDATE_FAILED', 'Task disappeared after update');
      }

      // Record history for changed fields
      await this.recordTaskHistory(existingTask, data);

      // Auto-update parent task progress if this is a subtask and status changed
      if (
        (data.status !== undefined || data.progress !== undefined) &&
        existingTask.parent_task_id
      ) {
        this.updateParentProgressOnSubtaskChange(id).catch(error =>
          logger.error('Failed to update parent progress on subtask change', { error, taskId: id })
        );
      }

      logger.info('Task updated successfully', { taskId: id });
      return updatedTask;
    } catch (error) {
      if (error instanceof Error && error.message.includes('TASK_')) {
        throw error;
      }
      logger.error('Failed to update task', { error, id, data });
      throw TaskService.createError('TASK_UPDATE_FAILED', 'Failed to update task', error);
    }
  }

  /**
   * Permanently deletes a task and cleans up all related data
   *
   * @param id Unique task identifier
   * @returns Promise that resolves when deletion is complete
   *
   * @throws {ServiceError} TASK_NOT_FOUND - When task doesn't exist
   * @throws {ServiceError} TASK_DELETE_FAILED - When deletion fails
   *
   * @description This method:
   * - Moves subtasks to the deleted task's parent (or makes them top-level)
   * - Removes all task dependencies
   * - Deletes all associated notes and tags
   * - Adjusts positions of remaining tasks in the column
   *
   * @example
   * ```typescript
   * await taskService.deleteTask('task-123');
   * ```
   */
  async deleteTask(id: string): Promise<void> {
    try {
      const task = await this.getTaskById(id);
      if (!task) {
        throw TaskService.createError('TASK_NOT_FOUND', 'Task not found', { id });
      }

      await this.db.transaction(async db => {
        await db.run('UPDATE tasks SET parent_task_id = ? WHERE parent_task_id = ?', [
          task.parent_task_id,
          id,
        ]);
        await db.run('DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_task_id = ?', [
          id,
          id,
        ]);
        await db.run('DELETE FROM notes WHERE task_id = ?', [id]);
        await db.run('DELETE FROM task_tags WHERE task_id = ?', [id]);
        await db.run('DELETE FROM tasks WHERE id = ?', [id]);

        await this.adjustPositionsForRemoval(task.column_id, task.position);
      });

      logger.info('Task deleted successfully', { taskId: id });
    } catch (error) {
      if (error instanceof Error && error.message.includes('TASK_')) {
        throw error;
      }
      logger.error('Failed to delete task', { error, id });
      throw TaskService.createError('TASK_DELETE_FAILED', 'Failed to delete task', error);
    }
  }

  /**
   * Adds a dependency relationship between two tasks
   *
   * @param taskId ID of the task that depends on another
   * @param dependsOnTaskId ID of the task that this task depends on
   * @param dependencyType Type of dependency relationship (default: 'blocks')
   * @returns Promise resolving to the created dependency relationship
   *
   * @throws {ServiceError} DEPENDENCY_ADD_FAILED - When dependency creation fails
   * @throws {Error} Task not found - When either task doesn't exist
   * @throws {Error} Would create circular dependency - When dependency would create a cycle
   *
   * @example
   * ```typescript
   * // Task B blocks task A (A depends on B)
   * const dependency = await taskService.addDependency(
   *   'task-a',
   *   'task-b',
   *   'blocks'
   * );
   * ```
   */
  async addDependency(
    taskId: string,
    dependsOnTaskId: string,
    dependencyType: TaskDependency['dependency_type'] = 'blocks'
  ): Promise<TaskDependency> {
    const id = uuidv4();
    const now = new Date();

    try {
      await this.db.transaction(async db => {
        const [task, dependentTask] = await Promise.all([
          db.get('SELECT id FROM tasks WHERE id = ?', [taskId]),
          db.get('SELECT id FROM tasks WHERE id = ?', [dependsOnTaskId]),
        ]);

        if (!task) {
          throw new Error('Task not found');
        }
        if (!dependentTask) {
          throw new Error('Dependent task not found');
        }

        if (await this.wouldCreateCircularDependency(taskId, dependsOnTaskId)) {
          throw new Error('Would create circular dependency');
        }

        await db.run(
          `
          INSERT INTO task_dependencies (id, task_id, depends_on_task_id, dependency_type, created_at)
          VALUES (?, ?, ?, ?, ?)
        `,
          [id, taskId, dependsOnTaskId, dependencyType, now]
        );
      });

      const dependency: TaskDependency = {
        id,
        task_id: taskId,
        depends_on_task_id: dependsOnTaskId,
        dependency_type: dependencyType,
        created_at: now,
      };

      logger.info('Task dependency added successfully', {
        taskId,
        dependsOnTaskId,
        dependencyType,
      });
      return dependency;
    } catch (error) {
      logger.error('Failed to add task dependency', { error, taskId, dependsOnTaskId });
      throw TaskService.createError(
        'DEPENDENCY_ADD_FAILED',
        'Failed to add task dependency',
        error
      );
    }
  }

  /**
   * Removes a dependency relationship between two tasks
   *
   * @param taskId ID of the dependent task
   * @param dependsOnTaskId ID of the task being depended upon
   * @returns Promise that resolves when dependency is removed
   *
   * @throws {ServiceError} DEPENDENCY_NOT_FOUND - When dependency doesn't exist
   * @throws {ServiceError} DEPENDENCY_REMOVE_FAILED - When removal fails
   *
   * @example
   * ```typescript
   * await taskService.removeDependency('task-a', 'task-b');
   * ```
   */
  async removeDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    try {
      const result = await this.db.execute(
        `
        DELETE FROM task_dependencies 
        WHERE task_id = ? AND depends_on_task_id = ?
      `,
        [taskId, dependsOnTaskId]
      );

      if (result.changes === 0) {
        throw TaskService.createError('DEPENDENCY_NOT_FOUND', 'Dependency not found');
      }

      logger.info('Task dependency removed successfully', { taskId, dependsOnTaskId });
    } catch (error) {
      if (error instanceof Error && error.message.includes('DEPENDENCY_')) {
        throw error;
      }
      logger.error('Failed to remove task dependency', { error, taskId, dependsOnTaskId });
      throw TaskService.createError(
        'DEPENDENCY_REMOVE_FAILED',
        'Failed to remove task dependency',
        error
      );
    }
  }

  /**
   * Retrieves all tasks that are blocked by incomplete dependencies
   *
   * @param boardId Optional board ID to filter results to a specific board
   * @returns Promise resolving to array of blocked tasks sorted by priority
   *
   * @throws {ServiceError} TASKS_FETCH_FAILED - When query fails
   *
   * @example
   * ```typescript
   * // Get all blocked tasks
   * const blocked = await taskService.getBlockedTasks();
   *
   * // Get blocked tasks for a specific board
   * const boardBlocked = await taskService.getBlockedTasks('board-123');
   * ```
   */
  async getBlockedTasks(boardId?: string): Promise<Task[]> {
    try {
      let query = `
        SELECT DISTINCT t.* FROM tasks t
        INNER JOIN task_dependencies td ON t.id = td.task_id
        INNER JOIN tasks blocking_task ON td.depends_on_task_id = blocking_task.id
        WHERE blocking_task.status != 'done' AND t.archived = FALSE
      `;
      const params: QueryParameters = [];

      if (boardId) {
        query += ' AND t.board_id = ?';
        params.push(boardId);
      }

      query += ' ORDER BY t.priority DESC, t.created_at ASC';

      const tasks = await this.db.query<Task>(query, params);
      tasks.forEach(task => TaskService.convertTaskDates(task));

      return tasks;
    } catch (error) {
      logger.error('Failed to get blocked tasks', { error, boardId });
      throw TaskService.createError('TASKS_FETCH_FAILED', 'Failed to fetch blocked tasks', error);
    }
  }

  /**
   * Retrieves all tasks that are past their due date and not completed
   *
   * @param boardId Optional board ID to filter results to a specific board
   * @returns Promise resolving to array of overdue tasks sorted by due date
   *
   * @throws {ServiceError} TASKS_FETCH_FAILED - When query fails
   *
   * @example
   * ```typescript
   * // Get all overdue tasks
   * const overdue = await taskService.getOverdueTasks();
   *
   * // Get overdue tasks for a specific board
   * const boardOverdue = await taskService.getOverdueTasks('board-123');
   * ```
   */
  async getOverdueTasks(boardId?: string): Promise<Task[]> {
    try {
      let query = `
        SELECT * FROM tasks 
        WHERE due_date < ? AND status != 'done' AND archived = FALSE
      `;
      const params: QueryParameters = [new Date()];

      if (boardId) {
        query += ' AND board_id = ?';
        params.push(boardId);
      }

      query += ' ORDER BY due_date ASC, priority DESC';

      const tasks = await this.db.query<Task>(query, params);
      tasks.forEach(task => TaskService.convertTaskDates(task));

      return tasks;
    } catch (error) {
      logger.error('Failed to get overdue tasks', { error, boardId });
      throw TaskService.createError('TASKS_FETCH_FAILED', 'Failed to fetch overdue tasks', error);
    }
  }

  /**
   * Calculates the next available position in a column
   *
   * @private
   * @param columnId Column identifier
   * @returns Promise resolving to the next position number (0-based)
   */
  private async getNextPosition(columnId: string): Promise<number> {
    const result = await this.db.queryOne<{ max_position: number }>(
      `
      SELECT COALESCE(MAX(position), 0) + 1 as max_position 
      FROM tasks 
      WHERE column_id = ? AND archived = FALSE
    `,
      [columnId]
    );

    return result?.max_position ?? 1;
  }

  /**
   * Adjusts positions of existing tasks to make room for insertion at specified position
   *
   * @private
   * @param columnId Column identifier
   * @param position Position where new task will be inserted
   */
  private async adjustPositionsForInsertion(columnId: string, position: number): Promise<void> {
    await this.db.execute(
      `
      UPDATE tasks 
      SET position = position + 1 
      WHERE column_id = ? AND position >= ? AND archived = FALSE
    `,
      [columnId, position]
    );
  }

  /**
   * Adjusts positions of tasks after a task is removed from specified position
   *
   * @private
   * @param columnId Column identifier
   * @param position Position of the removed task
   */
  private async adjustPositionsForRemoval(columnId: string, position: number): Promise<void> {
    await this.db.execute(
      `
      UPDATE tasks 
      SET position = position - 1 
      WHERE column_id = ? AND position > ? AND archived = FALSE
    `,
      [columnId, position]
    );
  }

  /**
   * Adjusts positions when a task is moved within the same column
   *
   * @private
   * @param columnId Column identifier
   * @param oldPosition Current position of the task
   * @param newPosition Target position for the task
   */
  private async adjustPositionsForMove(
    columnId: string,
    oldPosition: number,
    newPosition: number
  ): Promise<void> {
    if (oldPosition === newPosition) return;

    if (oldPosition < newPosition) {
      // Moving down: shift tasks between old and new position up by 1
      await this.db.execute(
        `
        UPDATE tasks 
        SET position = position - 1 
        WHERE column_id = ? AND position > ? AND position <= ? AND archived = FALSE
      `,
        [columnId, oldPosition, newPosition]
      );
    } else {
      // Moving up: shift tasks between new and old position down by 1
      await this.db.execute(
        `
        UPDATE tasks 
        SET position = position + 1 
        WHERE column_id = ? AND position >= ? AND position < ? AND archived = FALSE
      `,
        [columnId, newPosition, oldPosition]
      );
    }
  }

  /**
   * Checks if adding a dependency would create a circular dependency chain
   *
   * @private
   * @param taskId ID of the task that would depend on another
   * @param dependsOnTaskId ID of the task to depend on
   * @returns Promise resolving to true if circular dependency would be created
   *
   * @description Uses depth-first search to detect cycles in the dependency graph.
   * This prevents infinite loops and ensures dependency integrity.
   */
  private async wouldCreateCircularDependency(
    taskId: string,
    dependsOnTaskId: string
  ): Promise<boolean> {
    const visited = new Set<string>();
    const stack = [dependsOnTaskId];

    while (stack.length > 0) {
      const currentTaskId = stack.pop()!;

      if (currentTaskId === taskId) {
        return true;
      }

      if (visited.has(currentTaskId)) {
        continue;
      }

      visited.add(currentTaskId);

      // eslint-disable-next-line no-await-in-loop
      const dependencies = await this.db.query<{ depends_on_task_id: string }>(
        `
        SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?
      `,
        [currentTaskId]
      );

      // Add all dependencies to the stack for processing
      for (const dep of dependencies) {
        stack.push(dep.depends_on_task_id);
      }
    }
    return false;
  }

  /**
   * Retrieves all subtasks of a given parent task
   *
   * @param parentTaskId ID of the parent task
   * @returns Promise resolving to array of subtasks
   *
   * @throws {ServiceError} TASKS_FETCH_FAILED - When query fails
   *
   * @example
   * ```typescript
   * const subtasks = await taskService.getSubtasks('parent-task-123');
   * ```
   */
  async getSubtasks(parentTaskId: string): Promise<Task[]> {
    try {
      const query = `
        SELECT t.* FROM tasks t
        WHERE t.parent_task_id = ? AND t.archived = FALSE
        ORDER BY t.position ASC, t.created_at ASC
      `;

      const tasks = await this.db.query<Task>(query, [parentTaskId]);
      tasks.forEach(task => TaskService.convertTaskDates(task));

      return tasks;
    } catch (error) {
      logger.error('Failed to get subtasks', { error, parentTaskId });
      throw TaskService.createError('TASKS_FETCH_FAILED', 'Failed to fetch subtasks', error);
    }
  }

  /**
   * Adds a dependency relationship between two tasks
   *
   * @param taskId ID of the task that depends on another
   * @param dependsOnTaskId ID of the task to depend on
   *
   * @throws {ServiceError} TASK_NOT_FOUND - When either task doesn't exist
   * @throws {ServiceError} CIRCULAR_DEPENDENCY - When adding would create a cycle
   * @throws {ServiceError} SELF_DEPENDENCY - When trying to depend on self
   * @throws {ServiceError} DEPENDENCY_ADD_FAILED - When creation fails
   *
   * @example
   * ```typescript
   * // Task B depends on Task A
   * await taskService.addTaskDependency('task-b-id', 'task-a-id');
   * ```
   */
  async addTaskDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    try {
      // Prevent self-dependency
      if (taskId === dependsOnTaskId) {
        throw TaskService.createError('SELF_DEPENDENCY', 'A task cannot depend on itself');
      }

      // Verify both tasks exist
      const [task, dependsOnTask] = await Promise.all([
        this.getTaskById(taskId),
        this.getTaskById(dependsOnTaskId),
      ]);

      if (!task) {
        throw TaskService.createError('TASK_NOT_FOUND', 'Task not found', { taskId });
      }

      if (!dependsOnTask) {
        throw TaskService.createError('TASK_NOT_FOUND', 'Dependency task not found', {
          dependsOnTaskId,
        });
      }

      // Check for circular dependencies
      if (await this.wouldCreateCircularDependency(taskId, dependsOnTaskId)) {
        throw TaskService.createError(
          'CIRCULAR_DEPENDENCY',
          'Adding this dependency would create a circular dependency'
        );
      }

      // Check if dependency already exists
      const existing = await this.db.query<{ id: string }>(
        `
        SELECT id FROM task_dependencies 
        WHERE task_id = ? AND depends_on_task_id = ?
      `,
        [taskId, dependsOnTaskId]
      );

      if (existing.length > 0) {
        return; // Dependency already exists, no need to add
      }

      await this.db.execute(
        `
        INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at)
        VALUES (?, ?, ?, ?)
      `,
        [uuidv4(), taskId, dependsOnTaskId, new Date()]
      );

      logger.info('Task dependency added successfully', { taskId, dependsOnTaskId });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('TASK_') ||
          error.message.includes('CIRCULAR_') ||
          error.message.includes('SELF_'))
      ) {
        throw error;
      }
      logger.error('Failed to add task dependency', { error, taskId, dependsOnTaskId });
      throw TaskService.createError(
        'DEPENDENCY_ADD_FAILED',
        'Failed to add task dependency',
        error
      );
    }
  }

  /**
   * Removes a dependency relationship between two tasks
   *
   * @param taskId ID of the task that currently depends on another
   * @param dependsOnTaskId ID of the task to remove dependency on
   *
   * @throws {ServiceError} DEPENDENCY_REMOVE_FAILED - When removal fails
   *
   * @example
   * ```typescript
   * // Remove dependency from Task B to Task A
   * await taskService.removeTaskDependency('task-b-id', 'task-a-id');
   * ```
   */
  async removeTaskDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    try {
      const result = await this.db.execute(
        `
        DELETE FROM task_dependencies 
        WHERE task_id = ? AND depends_on_task_id = ?
      `,
        [taskId, dependsOnTaskId]
      );

      logger.info('Task dependency removed', {
        taskId,
        dependsOnTaskId,
        found: result.changes > 0,
      });
    } catch (error) {
      logger.error('Failed to remove task dependency', { error, taskId, dependsOnTaskId });
      throw TaskService.createError(
        'DEPENDENCY_REMOVE_FAILED',
        'Failed to remove task dependency',
        error
      );
    }
  }

  /**
   * Gets all dependencies for a specific task
   *
   * @param taskId ID of the task to get dependencies for
   * @returns Promise resolving to array of task dependencies with related task info
   *
   * @throws {ServiceError} TASKS_FETCH_FAILED - When fetching dependencies fails
   *
   * @example
   * ```typescript
   * const dependencies = await taskService.getTaskDependencies('task-123');
   * logger.log(`Task depends on ${String(String(dependencies.length))} other tasks`);
   * ```
   */
  async getTaskDependencies(taskId: string): Promise<TaskDependency[]> {
    try {
      const query = `
        SELECT 
          td.*,
          t.title as depends_on_title,
          t.status as depends_on_status,
          t.board_id as depends_on_board_id
        FROM task_dependencies td
        JOIN tasks t ON td.depends_on_task_id = t.id
        WHERE td.task_id = ? AND t.archived = FALSE
        ORDER BY td.created_at ASC
      `;

      const dependencies = await this.db.query<TaskDependency>(query, [taskId]);
      dependencies.forEach(dep => {
        dep.created_at = new Date(dep.created_at);
      });

      return dependencies;
    } catch (error) {
      logger.error('Failed to get task dependencies', { error, taskId });
      throw TaskService.createError(
        'TASKS_FETCH_FAILED',
        'Failed to fetch task dependencies',
        error
      );
    }
  }

  /**
   * Searches tasks by title and description using full-text search
   *
   * @param query Search query string
   * @param options Optional filtering and pagination options
   * @returns Promise resolving to array of matching tasks
   *
   * @throws {ServiceError} TASKS_FETCH_FAILED - When search fails
   *
   * @example
   * ```typescript
   * // Search for authentication-related tasks
   * const results = await taskService.searchTasks('authentication jwt');
   *
   * // Search with additional filters
   * const results = await taskService.searchTasks('bug fix', {
   *   board_id: 'board-123',
   *   status: 'todo'
   * });
   * ```
   */
  async searchTasks(
    query: string,
    options: Partial<TaskFilters & PaginationOptions> = {}
  ): Promise<Task[]> {
    try {
      const { board_id, column_id, status, limit = 50, offset = 0 } = options;

      let sql = `
        SELECT t.*, 
               ts.rank
        FROM tasks_fts ts
        JOIN tasks t ON ts.rowid = t.rowid
        WHERE ts.tasks_fts MATCH ?
          AND t.archived = FALSE
      `;

      const params: QueryParameters = [query];

      if (board_id) {
        sql += ' AND t.board_id = ?';
        params.push(board_id);
      }

      if (column_id) {
        sql += ' AND t.column_id = ?';
        params.push(column_id);
      }

      if (status) {
        sql += ' AND t.status = ?';
        params.push(status);
      }

      sql += ` ORDER BY ts.rank, t.priority DESC, t.created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const tasks = await this.db.query<Task>(sql, params);
      tasks.forEach(task => TaskService.convertTaskDates(task));

      return tasks;
    } catch (error) {
      logger.error('Failed to search tasks', { error, query, options });
      throw TaskService.createError('TASKS_FETCH_FAILED', 'Failed to search tasks', error);
    }
  }

  /**
   * Converts string date fields to Date objects
   *
   * @private
   * @param task Task object with potentially string-based dates
   */
  private static convertTaskDates(task: Task): void {
    task.created_at = new Date(task.created_at);
    task.updated_at = new Date(task.updated_at);
    if (task.due_date) {
      task.due_date = new Date(task.due_date);
    }
  }

  /**
   * Creates a standardized service error
   *
   * @private
   * @param code Error code identifier
   * @param message Human-readable error message
   * @param originalError Optional original error for debugging
   * @returns ServiceError instance
   */
  private static createError(code: string, message: string, originalError?: unknown): ServiceError {
    const error = new Error(message) as ServiceError;
    error.code = code;
    error.statusCode = TaskService.getStatusCodeForError(code);
    error.details = originalError ? { originalError: String(originalError) } : undefined;
    return error;
  }

  /**
   * Maps error codes to appropriate HTTP status codes
   *
   * @private
   * @param code Error code identifier
   * @returns HTTP status code (404 for not found, 500 for server errors)
   */
  private static getStatusCodeForError(code: string): number {
    switch (code) {
      case 'TASK_NOT_FOUND':
      case 'DEPENDENCY_NOT_FOUND':
        return 404;
      case 'CIRCULAR_DEPENDENCY':
      case 'SELF_DEPENDENCY':
      case 'INVALID_TITLE':
        return 400;
      case 'TASK_CREATE_FAILED':
      case 'TASK_UPDATE_FAILED':
      case 'TASK_DELETE_FAILED':
      case 'DEPENDENCY_ADD_FAILED':
      case 'DEPENDENCY_REMOVE_FAILED':
        return 500;
      case 'TASK_FETCH_FAILED':
      case 'TASKS_FETCH_FAILED':
        return 500;
      default:
        return 500;
    }
  }

  /**
   * Calculate progress for a parent task based on subtask completion
   *
   * @param {string} parentTaskId - Parent task ID
   * @returns {Promise<number>} Progress percentage (0-100)
   *
   * @description Calculates weighted progress based on subtask status:
   * - 'done' subtasks contribute 100%
   * - 'in_progress' subtasks contribute 50%
   * - Other statuses contribute 0%
   */
  async calculateParentTaskProgress(parentTaskId: string): Promise<number> {
    try {
      const subtasks = await this.getSubtasks(parentTaskId);

      if (subtasks.length === 0) {
        return 0; // No subtasks, progress remains as set manually
      }

      const totalWeight = subtasks.length;
      let completedWeight = 0;

      for (const subtask of subtasks) {
        switch (subtask.status) {
          case 'done':
            completedWeight += 1;
            break;
          case 'in_progress':
            completedWeight += 0.5;
            break;
          default:
            // 'todo', 'blocked', 'archived' contribute 0
            break;
        }
      }

      const progress = Math.round((completedWeight / totalWeight) * 100);

      // Update the parent task's progress
      await this.updateTask(parentTaskId, { progress });

      logger.info('Parent task progress calculated', {
        parentTaskId,
        subtaskCount: subtasks.length,
        progress,
      });

      return progress;
    } catch (error) {
      logger.error('Failed to calculate parent task progress', { parentTaskId, error });
      throw TaskService.createError('TASK_UPDATE_FAILED', 'Failed to calculate progress');
    }
  }

  /**
   * Get critical path analysis for a set of tasks
   *
   * @param {string} boardId - Board ID to analyze
   * @returns {Promise<CriticalPathResult>} Critical path analysis
   *
   * @description Analyzes task dependencies to find the critical path
   * that determines the minimum time to complete all tasks
   */
  async getCriticalPath(boardId: string): Promise<CriticalPathResult> {
    try {
      // Get all tasks and dependencies for the board
      const tasks = await this.getTasks({ board_id: boardId });
      const allDependencies = await this.db.query<TaskDependency>(
        `
        SELECT td.* FROM task_dependencies td
        JOIN tasks t ON td.task_id = t.id
        WHERE t.board_id = ?
      `,
        [boardId]
      );

      // Build dependency graph
      const dependencyMap = new Map<string, string[]>();
      const dependentsMap = new Map<string, string[]>();

      for (const dep of allDependencies) {
        // task_id depends on depends_on_task_id
        if (!dependencyMap.has(dep.task_id)) {
          dependencyMap.set(dep.task_id, []);
        }
        dependencyMap.get(dep.task_id)!.push(dep.depends_on_task_id);

        // depends_on_task_id has dependent task_id
        if (!dependentsMap.has(dep.depends_on_task_id)) {
          dependentsMap.set(dep.depends_on_task_id, []);
        }
        dependentsMap.get(dep.depends_on_task_id)!.push(dep.task_id);
      }

      // Calculate estimated duration for each task (use estimated_hours or default)
      const taskDurations = new Map<string, number>();
      for (const task of tasks) {
        taskDurations.set(task.id, task.estimated_hours ?? 8); // Default 8 hours
      }

      // Find tasks with no dependencies (starting points)
      const startingTasks = tasks.filter(
        task => !dependencyMap.has(task.id) || dependencyMap.get(task.id)!.length === 0
      );

      // Find tasks with no dependents (ending points)
      const endingTasks = tasks.filter(
        task => !dependentsMap.has(task.id) || dependentsMap.get(task.id)!.length === 0
      );

      // Calculate critical path using topological sort and longest path
      const criticalPath = this.findLongestPath(tasks, dependencyMap, dependentsMap, taskDurations);

      const result: CriticalPathResult = {
        critical_path: criticalPath.path,
        total_duration: criticalPath.duration,
        starting_tasks: startingTasks,
        ending_tasks: endingTasks,
        bottlenecks: this.identifyBottlenecks(dependentsMap, tasks),
        dependency_count: allDependencies.length,
      };

      logger.info('Critical path calculated', {
        boardId,
        pathLength: criticalPath.path.length,
        totalDuration: criticalPath.duration,
      });

      return result;
    } catch (error) {
      logger.error('Failed to calculate critical path', { boardId, error });
      throw TaskService.createError('TASK_FETCH_FAILED', 'Failed to calculate critical path');
    }
  }

  /**
   * Find the longest path through the dependency graph (critical path)
   *
   * @private
   */
  private findLongestPath(
    tasks: Task[],
    dependencyMap: Map<string, string[]>,
    dependentsMap: Map<string, string[]>,
    taskDurations: Map<string, number>
  ): { path: Task[]; duration: number } {
    const visited = new Set<string>();
    const distances = new Map<string, number>();
    const predecessors = new Map<string, string | null>();

    // Initialize distances
    for (const task of tasks) {
      distances.set(task.id, 0);
      predecessors.set(task.id, null);
    }

    // Topological sort using DFS
    const sortedTasks: string[] = [];
    const visit = (taskId: string): void => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const dependencies = dependencyMap.get(taskId) ?? [];
      for (const depId of dependencies) {
        visit(depId);
      }
      sortedTasks.push(taskId);
    };

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        visit(task.id);
      }
    }

    // Calculate longest distances (critical path)
    for (const taskId of sortedTasks) {
      const dependencies = dependencyMap.get(taskId) ?? [];
      for (const depId of dependencies) {
        const newDistance = (distances.get(depId) ?? 0) + (taskDurations.get(taskId) ?? 0);
        if (newDistance > (distances.get(taskId) ?? 0)) {
          distances.set(taskId, newDistance);
          predecessors.set(taskId, depId);
        }
      }
    }

    // Find the task with maximum distance (end of critical path)
    let maxDistance = 0;
    let endTask = '';
    for (const [taskId, distance] of Array.from(distances.entries())) {
      if (distance > maxDistance) {
        maxDistance = distance;
        endTask = taskId;
      }
    }

    // Reconstruct the critical path
    const pathIds: string[] = [];
    let current: string | null = endTask;
    while (current) {
      pathIds.unshift(current);
      current = predecessors.get(current) ?? null;
    }

    // Convert task IDs to Task objects
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const path = pathIds.map(id => taskMap.get(id)!).filter(Boolean);

    return { path, duration: maxDistance };
  }

  /**
   * Identify bottleneck tasks that block many other tasks
   *
   * @private
   */
  private identifyBottlenecks(dependentsMap: Map<string, string[]>, tasks: Task[]): Task[] {
    const bottleneckThreshold = 2; // Tasks blocking 2+ other tasks are bottlenecks

    const bottlenecks = tasks.filter(task => {
      const dependentCount = dependentsMap.get(task.id)?.length ?? 0;
      return dependentCount >= bottleneckThreshold && task.status !== 'done';
    });

    // Sort by number of dependents (most blocking first)
    bottlenecks.sort((a, b) => {
      const aCount = dependentsMap.get(a.id)?.length ?? 0;
      const bCount = dependentsMap.get(b.id)?.length ?? 0;
      return bCount - aCount;
    });

    return bottlenecks;
  }

  /**
   * Get impact analysis for a task (what would be affected if this task changes)
   *
   * @param {string} taskId - Task ID to analyze
   * @returns {Promise<TaskImpactAnalysis>} Impact analysis result
   */
  async getTaskImpactAnalysis(taskId: string): Promise<TaskImpactAnalysis> {
    try {
      const task = await this.getTaskById(taskId);
      if (!task) {
        throw TaskService.createError('TASK_NOT_FOUND', 'Task not found');
      }

      // Get all tasks that depend on this task (direct and indirect)
      const impactedTasks = await this.getDownstreamTasks(taskId);

      // Get all tasks this task depends on
      const dependencyTasks = await this.getUpstreamTasks(taskId);

      // Calculate impact score based on how many tasks would be affected
      const impactScore = this.calculateImpactScore(impactedTasks, task);

      const result: TaskImpactAnalysis = {
        task,
        directly_impacted: impactedTasks.direct,
        indirectly_impacted: impactedTasks.indirect,
        total_impacted_count: impactedTasks.direct.length + impactedTasks.indirect.length,
        upstream_dependencies: dependencyTasks,
        impact_score: impactScore,
        risk_level: ((): 'low' | 'medium' | 'high' => {
          if (impactScore > 10) return 'high';
          if (impactScore > 5) return 'medium';
          return 'low';
        })(),
      };

      logger.info('Task impact analysis completed', {
        taskId,
        totalImpacted: result.total_impacted_count,
        riskLevel: result.risk_level,
      });

      return result;
    } catch (error) {
      logger.error('Failed to analyze task impact', { taskId, error });
      throw TaskService.createError('TASK_FETCH_FAILED', 'Failed to analyze task impact');
    }
  }

  /**
   * Get all tasks downstream from a given task (tasks that depend on this task)
   *
   * @private
   */
  private async getDownstreamTasks(taskId: string): Promise<{ direct: Task[]; indirect: Task[] }> {
    const visited = new Set<string>();
    const direct: Task[] = [];
    const indirect: Task[] = [];

    const findDownstream = async (currentTaskId: string, depth: number = 0): Promise<void> => {
      if (visited.has(currentTaskId)) return;
      visited.add(currentTaskId);

      const dependents = await this.db.query<TaskDependency>(
        'SELECT * FROM task_dependencies WHERE depends_on_task_id = ?',
        [currentTaskId]
      );

      for (const dep of dependents) {
        const dependentTask = await this.getTaskById(dep.task_id);
        if (dependentTask) {
          if (depth === 0) {
            direct.push(dependentTask);
          } else {
            indirect.push(dependentTask);
          }
          await findDownstream(dep.task_id, depth + 1);
        }
      }
    };

    await findDownstream(taskId);
    return { direct, indirect };
  }

  /**
   * Get all tasks upstream from a given task (tasks this task depends on)
   *
   * @private
   */
  private async getUpstreamTasks(taskId: string): Promise<Task[]> {
    const visited = new Set<string>();
    const upstream: Task[] = [];

    const findUpstream = async (currentTaskId: string): Promise<void> => {
      if (visited.has(currentTaskId)) return;
      visited.add(currentTaskId);

      const dependencies = await this.db.query<TaskDependency>(
        'SELECT * FROM task_dependencies WHERE task_id = ?',
        [currentTaskId]
      );

      for (const dep of dependencies) {
        const dependencyTask = await this.getTaskById(dep.depends_on_task_id);
        if (dependencyTask) {
          upstream.push(dependencyTask);
          await findUpstream(dep.depends_on_task_id);
        }
      }
    };

    await findUpstream(taskId);
    return upstream;
  }

  /**
   * Calculate impact score for a task based on various factors
   *
   * @private
   */
  private calculateImpactScore(
    impactedTasks: { direct: Task[]; indirect: Task[] },
    task: Task
  ): number {
    let score = 0;

    // Base score from number of impacted tasks
    score += impactedTasks.direct.length * 3; // Direct impact is more significant
    score += impactedTasks.indirect.length * 1;

    // Priority multiplier
    const priorityMultiplier = (task.priority ?? 1) / 5;
    score *= 1 + priorityMultiplier;

    // Due date urgency (if task is overdue or due soon)
    if (task.due_date) {
      const dueDate = new Date(task.due_date);
      const now = new Date();
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilDue < 0) {
        score *= 1.5; // Overdue tasks have higher impact
      } else if (daysUntilDue <= 3) {
        score *= 1.3; // Due soon
      }
    }

    return Math.round(score);
  }

  /**
   * Auto-update parent task progress when subtask status changes
   *
   * @param {string} subtaskId - Subtask that was updated
   * @returns {Promise<void>}
   */
  async updateParentProgressOnSubtaskChange(subtaskId: string): Promise<void> {
    try {
      const subtask = await this.getTaskById(subtaskId);
      if (!subtask?.parent_task_id) {
        return; // Not a subtask or subtask not found
      }

      await this.calculateParentTaskProgress(subtask.parent_task_id);

      logger.info('Parent task progress updated after subtask change', {
        subtaskId,
        parentTaskId: subtask.parent_task_id,
      });
    } catch (error) {
      logger.error('Failed to update parent progress on subtask change', { subtaskId, error });
      // Don't throw error - this is a background update that shouldn't fail the main operation
    }
  }

  /**
   * Record task history for changed fields
   *
   * @private
   * @param {Task} existingTask - Task before changes
   * @param {UpdateTaskRequest} updateData - Update request data
   */
  private async recordTaskHistory(
    existingTask: Task,
    updateData: UpdateTaskRequest
  ): Promise<void> {
    try {
      const historyService = TaskHistoryService.getInstance();
      const trackableFields = [
        'title',
        'description',
        'priority',
        'status',
        'assignee',
        'due_date',
        'estimated_hours',
        'actual_hours',
        'progress',
      ];

      for (const field of trackableFields) {
        const fieldKey = field as keyof UpdateTaskRequest;

        if (updateData[fieldKey] !== undefined) {
          const oldValue = existingTask[field as keyof Task];
          const newValue = updateData[fieldKey];

          // Only record if value actually changed
          if (oldValue !== newValue) {
            await historyService.recordChange({
              task_id: existingTask.id,
              field_name: field,
              old_value: oldValue,
              new_value: newValue,
              changed_by: updateData.change_reason ? 'system' : 'user',
              reason: updateData.change_reason,
            });

            logger.debug('Task history recorded', {
              taskId: existingTask.id,
              field,
              oldValue,
              newValue,
              reason: updateData.change_reason,
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to record task history', {
        taskId: existingTask.id,
        error,
      });
      // Don't throw error - history recording shouldn't fail the main operation
    }
  }

  // ==============================================
  // ENHANCED SUBTASK PROGRESS METHODS
  // ==============================================

  /**
   * Calculates weighted parent task progress using advanced algorithms
   *
   * @param {string} parentTaskId - Parent task identifier
   * @param {SubtaskWeight[]} weights - Optional custom weights for subtasks
   * @returns {Promise<ProgressCalculationResult>} Detailed progress calculation result
   */
  async calculateWeightedParentProgress(
    parentTaskId: string,
    weights?: Array<{ subtask_id: string; weight_factor: number; weight_type: string }>
  ): Promise<ProgressCalculationResult> {
    try {
      const subtasks = await this.getSubtasks(parentTaskId);

      if (subtasks.length === 0) {
        return {
          parent_task_id: parentTaskId,
          calculated_progress: 0,
          subtask_breakdown: [],
          total_weight: 0,
          auto_complete_eligible: false,
        };
      }

      const subtaskBreakdown: ProgressCalculationResult['subtask_breakdown'] = [];
      let totalWeightedProgress = 0;
      let totalWeight = 0;

      for (const subtask of subtasks) {
        // Determine weight factor
        let weightFactor = 1; // Default equal weight
        const customWeight = weights?.find(w => w.subtask_id === subtask.id);

        if (customWeight) {
          weightFactor = customWeight.weight_factor;
        } else {
          // Auto-calculate weight based on available data
          weightFactor = this.calculateAutoWeight(subtask);
        }

        // Calculate individual progress
        const individualProgress = this.calculateIndividualTaskProgress(subtask);

        // Calculate weighted contribution
        const weightedContribution = (individualProgress / 100) * weightFactor;

        subtaskBreakdown.push({
          subtask_id: subtask.id,
          title: subtask.title,
          status: subtask.status,
          individual_progress: individualProgress,
          weight_factor: weightFactor,
          weighted_contribution: weightedContribution,
        });

        totalWeightedProgress += weightedContribution;
        totalWeight += weightFactor;
      }

      // Calculate final progress percentage
      const calculatedProgress =
        totalWeight > 0 ? Math.round((totalWeightedProgress / totalWeight) * 100) : 0;

      // Check auto-completion eligibility
      const autoCompleteEligible = this.checkAutoCompleteEligibility(subtaskBreakdown);

      const result: ProgressCalculationResult = {
        parent_task_id: parentTaskId,
        calculated_progress: calculatedProgress,
        subtask_breakdown: subtaskBreakdown,
        total_weight: totalWeight,
        auto_complete_eligible: autoCompleteEligible,
      };

      // Update parent task progress
      await this.updateTask(parentTaskId, { progress: calculatedProgress });

      logger.info('Weighted parent task progress calculated', {
        parentTaskId,
        subtaskCount: subtasks.length,
        calculatedProgress,
        totalWeight,
        autoCompleteEligible,
      });

      return result;
    } catch (error) {
      logger.error('Failed to calculate weighted parent progress', { parentTaskId, error });
      throw error;
    }
  }

  /**
   * Calculates hierarchical progress for multi-level subtask structures
   *
   * @param {string} rootTaskId - Root task identifier
   * @param {number} maxDepth - Maximum depth to traverse (default: 10)
   * @returns {Promise<ProgressCalculationResult>} Hierarchical progress result
   */
  async calculateHierarchicalProgress(
    rootTaskId: string,
    maxDepth: number = 10
  ): Promise<ProgressCalculationResult> {
    try {
      const result = await this.calculateHierarchicalProgressRecursive(
        rootTaskId,
        0,
        maxDepth,
        new Set()
      );

      logger.info('Hierarchical progress calculated', {
        rootTaskId,
        maxDepth,
        finalProgress: result.calculated_progress,
      });

      return result;
    } catch (error) {
      logger.error('Failed to calculate hierarchical progress', { rootTaskId, error });
      throw error;
    }
  }

  /**
   * Gets detailed subtask hierarchy information
   *
   * @param {string} rootTaskId - Root task identifier
   * @returns {Promise<SubtaskHierarchy>} Hierarchical structure
   */
  async getSubtaskHierarchy(rootTaskId: string): Promise<SubtaskHierarchy> {
    try {
      const hierarchy = await this.buildSubtaskHierarchy(rootTaskId, [], 0);

      logger.info('Subtask hierarchy retrieved', {
        rootTaskId,
        depth: hierarchy.depth,
        totalDescendants: hierarchy.total_descendants,
      });

      return hierarchy;
    } catch (error) {
      logger.error('Failed to get subtask hierarchy', { rootTaskId, error });
      throw error;
    }
  }

  /**
   * Sets custom weight for a subtask in progress calculations
   *
   * @param {string} subtaskId - Subtask identifier
   * @param {number} weightFactor - Weight factor (0.1 to 5.0)
   * @param {'hours' | 'priority' | 'custom'} weightType - Type of weighting
   * @returns {Promise<void>}
   */
  async setSubtaskWeight(
    subtaskId: string,
    weightFactor: number,
    weightType: 'hours' | 'priority' | 'custom' = 'custom'
  ): Promise<void> {
    try {
      if (weightFactor < 0.1 || weightFactor > 5.0) {
        throw new Error('Weight factor must be between 0.1 and 5.0');
      }

      // Store weight configuration in task metadata
      const subtask = await this.getTaskById(subtaskId);
      if (!subtask) {
        throw new Error('Subtask not found');
      }

      const metadata = subtask.metadata ? JSON.parse(subtask.metadata) : {};
      metadata.weight_config = {
        weight_factor: weightFactor,
        weight_type: weightType,
        updated_at: new Date().toISOString(),
      };

      await this.updateTask(subtaskId, {
        metadata: JSON.stringify(metadata),
      });

      // Recalculate parent progress if this is a subtask
      if (subtask.parent_task_id) {
        await this.calculateWeightedParentProgress(subtask.parent_task_id);
      }

      logger.info('Subtask weight updated', {
        subtaskId,
        weightFactor,
        weightType,
        parentTaskId: subtask.parent_task_id,
      });
    } catch (error) {
      logger.error('Failed to set subtask weight', { subtaskId, weightFactor, error });
      throw error;
    }
  }

  // ==============================================
  // PRIVATE HELPER METHODS FOR SUBTASK PROGRESS
  // ==============================================

  /**
   * Calculates automatic weight based on task properties
   *
   * @private
   * @param {Task} task - Task to calculate weight for
   * @returns {number} Calculated weight factor
   */
  private calculateAutoWeight(task: Task): number {
    // Check for custom weight in metadata
    if (task.metadata) {
      try {
        const metadata = JSON.parse(task.metadata);
        if (metadata.weight_config?.weight_factor) {
          return metadata.weight_config.weight_factor;
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    // Auto-calculate based on estimated hours and priority
    let weight = 1;

    // Factor in estimated hours (normalize to reasonable range)
    if (task.estimated_hours && task.estimated_hours > 0) {
      weight = Math.min(task.estimated_hours / 8, 3); // Max 3x weight for effort
    }

    // Factor in priority (1-5 scale)
    if (task.priority && task.priority > 0) {
      const priorityMultiplier = 1 + (task.priority - 1) * 0.2; // 1.0 to 1.8 multiplier
      weight *= priorityMultiplier;
    }

    // Ensure weight is within reasonable bounds
    return Math.max(0.1, Math.min(weight, 5.0));
  }

  /**
   * Calculates individual task progress considering status and custom progress
   *
   * @private
   * @param {Task} task - Task to calculate progress for
   * @returns {number} Progress percentage (0-100)
   */
  private calculateIndividualTaskProgress(task: Task): number {
    // Use explicit progress if set
    if (task.progress !== undefined && task.progress !== null) {
      return Math.min(100, Math.max(0, task.progress));
    }

    // Fall back to status-based progress
    switch (task.status) {
      case 'done':
        return 100;
      case 'in_progress':
        return 50; // Default for in-progress without explicit progress
      case 'blocked':
        return 25; // Some credit for blocked tasks that have been started
      case 'todo':
      case 'archived':
      default:
        return 0;
    }
  }

  /**
   * Checks if parent task is eligible for auto-completion
   *
   * @private
   * @param {ProgressCalculationResult['subtask_breakdown']} breakdown - Subtask breakdown
   * @returns {boolean} True if eligible for auto-completion
   */
  private checkAutoCompleteEligibility(
    breakdown: ProgressCalculationResult['subtask_breakdown']
  ): boolean {
    // Auto-complete if all subtasks are done
    return breakdown.every(item => item.status === 'done');
  }

  /**
   * Recursively calculates hierarchical progress
   *
   * @private
   * @param {string} taskId - Current task identifier
   * @param {number} currentDepth - Current recursion depth
   * @param {number} maxDepth - Maximum depth allowed
   * @param {Set<string>} visited - Set of visited task IDs
   * @returns {Promise<ProgressCalculationResult>} Progress calculation result
   */
  private async calculateHierarchicalProgressRecursive(
    taskId: string,
    currentDepth: number,
    maxDepth: number,
    visited: Set<string>
  ): Promise<ProgressCalculationResult> {
    if (currentDepth >= maxDepth || visited.has(taskId)) {
      // Return basic progress for leaf nodes or cycle prevention
      const task = await this.getTaskById(taskId);
      return {
        parent_task_id: taskId,
        calculated_progress: task ? this.calculateIndividualTaskProgress(task) : 0,
        subtask_breakdown: [],
        total_weight: 1,
        auto_complete_eligible: task?.status === 'done',
      };
    }

    visited.add(taskId);

    // Get direct subtasks
    const subtasks = await this.getSubtasks(taskId);

    if (subtasks.length === 0) {
      // Leaf task - return individual progress
      const task = await this.getTaskById(taskId);
      return {
        parent_task_id: taskId,
        calculated_progress: task ? this.calculateIndividualTaskProgress(task) : 0,
        subtask_breakdown: [],
        total_weight: 1,
        auto_complete_eligible: task?.status === 'done',
      };
    }

    // Recursively calculate progress for each subtask
    const subtaskResults: ProgressCalculationResult[] = [];
    for (const subtask of subtasks) {
      const subtaskResult = await this.calculateHierarchicalProgressRecursive(
        subtask.id,
        currentDepth + 1,
        maxDepth,
        new Set(visited)
      );
      subtaskResults.push(subtaskResult);
    }

    // Aggregate results
    let totalWeightedProgress = 0;
    let totalWeight = 0;
    const subtaskBreakdown: ProgressCalculationResult['subtask_breakdown'] = [];

    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      const result = subtaskResults[i];
      const weight = this.calculateAutoWeight(subtask);

      subtaskBreakdown.push({
        subtask_id: subtask.id,
        title: subtask.title,
        status: subtask.status,
        individual_progress: result.calculated_progress,
        weight_factor: weight,
        weighted_contribution: (result.calculated_progress / 100) * weight,
      });

      totalWeightedProgress += (result.calculated_progress / 100) * weight;
      totalWeight += weight;
    }

    const calculatedProgress =
      totalWeight > 0 ? Math.round((totalWeightedProgress / totalWeight) * 100) : 0;

    visited.delete(taskId);

    return {
      parent_task_id: taskId,
      calculated_progress: calculatedProgress,
      subtask_breakdown: subtaskBreakdown,
      total_weight: totalWeight,
      auto_complete_eligible: subtaskBreakdown.every(item => item.status === 'done'),
    };
  }

  /**
   * Builds hierarchical subtask structure
   *
   * @private
   * @param {string} taskId - Current task identifier
   * @param {string[]} path - Current path from root
   * @param {number} depth - Current depth
   * @returns {Promise<SubtaskHierarchy>} Hierarchical structure
   */
  private async buildSubtaskHierarchy(
    taskId: string,
    path: string[],
    depth: number
  ): Promise<SubtaskHierarchy> {
    const subtasks = await this.getSubtasks(taskId);
    const children: SubtaskHierarchy[] = [];
    let totalDescendants = subtasks.length;

    for (const subtask of subtasks) {
      const childHierarchy = await this.buildSubtaskHierarchy(
        subtask.id,
        [...path, taskId],
        depth + 1
      );
      children.push(childHierarchy);
      totalDescendants += childHierarchy.total_descendants;
    }

    const parentTaskId = path.length > 0 ? path[path.length - 1] : undefined;

    return {
      task_id: taskId,
      parent_task_id: parentTaskId,
      depth,
      path,
      children,
      total_descendants: totalDescendants,
    };
  }

  // ==============================================
  // ENHANCED DEPENDENCY ANALYSIS METHODS
  // ==============================================

  /**
   * Gets tasks that can be executed in parallel (no dependency conflicts)
   *
   * @param {string} boardId - Board identifier
   * @returns {Promise<Task[][]>} Array of parallel execution groups
   * @description Analyzes the dependency graph to identify groups of tasks
   * that can be executed simultaneously without conflicts
   */
  async getParallelExecutableTasks(boardId: string): Promise<Task[][]> {
    try {
      const todoTasks = await this.getTasks({
        board_id: boardId,
        status: 'todo',
      });
      const inProgressTasks = await this.getTasks({
        board_id: boardId,
        status: 'in_progress',
      });
      const tasks = [...todoTasks, ...inProgressTasks];

      const parallelGroups: Task[][] = [];
      const processedTasks = new Set<string>();

      for (const task of tasks) {
        if (processedTasks.has(task.id)) continue;

        const currentGroup: Task[] = [task];
        processedTasks.add(task.id);

        // Find other tasks that don't depend on this task or vice versa
        for (const otherTask of tasks) {
          if (processedTasks.has(otherTask.id)) continue;

          const hasConflict = await this.hasDependencyConflict(task.id, otherTask.id);
          if (!hasConflict) {
            currentGroup.push(otherTask);
            processedTasks.add(otherTask.id);
          }
        }

        parallelGroups.push(currentGroup);
      }

      logger.info('Generated parallel execution groups', {
        boardId,
        groupCount: parallelGroups.length,
        totalTasks: tasks.length,
      });

      return parallelGroups;
    } catch (error) {
      logger.error('Failed to get parallel executable tasks', { boardId, error });
      throw error;
    }
  }

  /**
   * Gets tasks filtered by dependency depth from root tasks
   *
   * @param {string} boardId - Board identifier
   * @param {number} maxDepth - Maximum dependency depth
   * @returns {Promise<Task[]>} Tasks within the specified depth
   */
  async getTasksByDependencyDepth(boardId: string, maxDepth: number): Promise<Task[]> {
    try {
      const allTasks = await this.getTasks({ board_id: boardId });
      const tasksWithDepth: Array<{ task: Task; depth: number }> = [];

      for (const task of allTasks) {
        const depth = await this.calculateDependencyDepth(task.id);
        if (depth <= maxDepth) {
          tasksWithDepth.push({ task, depth });
        }
      }

      // Sort by depth, then by priority
      tasksWithDepth.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return (b.task.priority ?? 0) - (a.task.priority ?? 0);
      });

      logger.info('Retrieved tasks by dependency depth', {
        boardId,
        maxDepth,
        resultCount: tasksWithDepth.length,
      });

      return tasksWithDepth.map(item => item.task);
    } catch (error) {
      logger.error('Failed to get tasks by dependency depth', { boardId, maxDepth, error });
      throw error;
    }
  }

  /**
   * Calculates the dependency chain length for a task
   *
   * @param {string} taskId - Task identifier
   * @returns {Promise<number>} Length of the longest dependency chain
   */
  async getDependencyChainLength(taskId: string): Promise<number> {
    try {
      const visited = new Set<string>();
      return await this.calculateMaxDepthRecursive(taskId, visited);
    } catch (error) {
      logger.error('Failed to get dependency chain length', { taskId, error });
      throw error;
    }
  }

  /**
   * Gets all tasks that are part of the critical path
   *
   * @param {string} boardId - Board identifier
   * @returns {Promise<Set<string>>} Set of task IDs in critical path
   */
  async getTasksInCriticalPath(boardId: string): Promise<Set<string>> {
    try {
      const criticalPath = await this.getCriticalPath(boardId);
      const criticalTaskIds = new Set<string>();

      criticalPath.critical_path.forEach(task => {
        criticalTaskIds.add(task.id);
      });

      logger.info('Retrieved critical path task IDs', {
        boardId,
        criticalTaskCount: criticalTaskIds.size,
      });

      return criticalTaskIds;
    } catch (error) {
      logger.error('Failed to get tasks in critical path', { boardId, error });
      throw error;
    }
  }

  /**
   * Calculates optimal earliest start dates for tasks based on dependencies
   *
   * @param {string[]} taskIds - Array of task identifiers
   * @returns {Promise<Map<string, Date>>} Map of task ID to earliest start date
   */
  async getEarliestStartDates(taskIds: string[]): Promise<Map<string, Date>> {
    try {
      const startDates = new Map<string, Date>();
      const now = new Date();

      for (const taskId of taskIds) {
        const earliestStart = await this.calculateEarliestStartDate(taskId, now);
        startDates.set(taskId, earliestStart);
      }

      logger.info('Calculated earliest start dates', {
        taskCount: taskIds.length,
        calculatedDates: startDates.size,
      });

      return startDates;
    } catch (error) {
      logger.error('Failed to get earliest start dates', { taskIds, error });
      throw error;
    }
  }

  /**
   * Performs bulk dependency operations with validation
   *
   * @param {Array<{taskId: string; dependsOnTaskId: string; operation: 'add' | 'remove'}>} operations
   * @returns {Promise<void>}
   */
  async bulkDependencyOperations(
    operations: Array<{ taskId: string; dependsOnTaskId: string; operation: 'add' | 'remove' }>
  ): Promise<void> {
    try {
      // Validate all operations first
      for (const op of operations) {
        if (op.operation === 'add') {
          const wouldCreateCycle = await this.wouldCreateCircularDependency(
            op.taskId,
            op.dependsOnTaskId
          );
          if (wouldCreateCycle) {
            throw new Error(
              `Operation would create circular dependency: ${op.taskId} -> ${op.dependsOnTaskId}`
            );
          }
        }
      }

      // Execute all operations
      for (const op of operations) {
        if (op.operation === 'add') {
          await this.addDependency(op.taskId, op.dependsOnTaskId, 'blocks');
        } else {
          await this.removeDependency(op.taskId, op.dependsOnTaskId);
        }
      }

      logger.info('Completed bulk dependency operations', {
        operationCount: operations.length,
        addOperations: operations.filter(op => op.operation === 'add').length,
        removeOperations: operations.filter(op => op.operation === 'remove').length,
      });
    } catch (error) {
      logger.error('Failed to execute bulk dependency operations', { operations, error });
      throw error;
    }
  }

  // ==============================================
  // PRIVATE HELPER METHODS FOR ENHANCED FEATURES
  // ==============================================

  /**
   * Checks if two tasks have a dependency conflict (direct or indirect)
   *
   * @private
   * @param {string} taskId1 - First task ID
   * @param {string} taskId2 - Second task ID
   * @returns {Promise<boolean>} True if there's a dependency conflict
   */
  private async hasDependencyConflict(taskId1: string, taskId2: string): Promise<boolean> {
    try {
      // Check if either task depends on the other (direct or indirect)
      const task1Dependencies = await this.getUpstreamTasks(taskId1);
      const task2Dependencies = await this.getUpstreamTasks(taskId2);

      const task1DepIds = new Set(task1Dependencies.map(t => t.id));
      const task2DepIds = new Set(task2Dependencies.map(t => t.id));
      return task1DepIds.has(taskId2) || task2DepIds.has(taskId1);
    } catch (error) {
      logger.error('Failed to check dependency conflict', { taskId1, taskId2, error });
      return true; // Err on the side of caution
    }
  }

  /**
   * Calculates the dependency depth of a task (distance from root tasks)
   *
   * @private
   * @param {string} taskId - Task identifier
   * @returns {Promise<number>} Dependency depth
   */
  private async calculateDependencyDepth(taskId: string): Promise<number> {
    try {
      const visited = new Set<string>();
      return await this.calculateDepthFromRoot(taskId, visited, 0);
    } catch (error) {
      logger.error('Failed to calculate dependency depth', { taskId, error });
      return 0;
    }
  }

  /**
   * Recursively calculates maximum dependency depth
   *
   * @private
   * @param {string} taskId - Task identifier
   * @param {Set<string>} visited - Set of visited task IDs
   * @returns {Promise<number>} Maximum depth
   */
  private async calculateMaxDepthRecursive(taskId: string, visited: Set<string>): Promise<number> {
    if (visited.has(taskId)) return 0;
    visited.add(taskId);

    const dependencies = await this.getTaskDependencies(taskId);
    if (dependencies.length === 0) return 1;

    let maxDepth = 0;
    for (const dep of dependencies) {
      const depth = await this.calculateMaxDepthRecursive(dep.depends_on_task_id, visited);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth + 1;
  }

  /**
   * Recursively calculates depth from root tasks
   *
   * @private
   * @param {string} taskId - Task identifier
   * @param {Set<string>} visited - Set of visited task IDs
   * @param {number} currentDepth - Current depth level
   * @returns {Promise<number>} Depth from root
   */
  private async calculateDepthFromRoot(
    taskId: string,
    visited: Set<string>,
    currentDepth: number
  ): Promise<number> {
    if (visited.has(taskId)) return currentDepth;
    visited.add(taskId);

    const dependencies = await this.getTaskDependencies(taskId);
    if (dependencies.length === 0) return currentDepth; // Root task

    let minDepth = Infinity;
    for (const dep of dependencies) {
      const depth = await this.calculateDepthFromRoot(
        dep.depends_on_task_id,
        new Set(visited),
        currentDepth + 1
      );
      minDepth = Math.min(minDepth, depth);
    }

    return minDepth === Infinity ? currentDepth : minDepth;
  }

  /**
   * Calculates the earliest possible start date for a task
   *
   * @private
   * @param {string} taskId - Task identifier
   * @param {Date} projectStart - Project start date
   * @returns {Promise<Date>} Earliest start date
   */
  private async calculateEarliestStartDate(taskId: string, projectStart: Date): Promise<Date> {
    try {
      const dependencies = await this.getTaskDependencies(taskId);
      if (dependencies.length === 0) {
        return projectStart; // No dependencies, can start immediately
      }

      let latestFinish = projectStart;

      for (const dep of dependencies) {
        const depTask = await this.getTaskById(dep.depends_on_task_id);
        if (!depTask) continue;

        // Recursively calculate earliest start for dependency
        const depEarliestStart = await this.calculateEarliestStartDate(
          dep.depends_on_task_id,
          projectStart
        );

        // Add estimated duration to get finish date
        const estimatedDays = depTask.estimated_hours ? Math.ceil(depTask.estimated_hours / 8) : 1;
        const depFinish = new Date(depEarliestStart);
        depFinish.setDate(depFinish.getDate() + estimatedDays);

        if (depFinish > latestFinish) {
          latestFinish = depFinish;
        }
      }

      return latestFinish;
    } catch (error) {
      logger.error('Failed to calculate earliest start date', { taskId, error });
      return projectStart;
    }
  }
}
