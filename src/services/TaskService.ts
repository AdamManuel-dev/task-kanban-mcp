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
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import type {
  Task,
  TaskDependency,
  ServiceError,
  PaginationOptions,
  FilterOptions,
} from '@/types';

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
  title?: string;
  description?: string;
  column_id?: string;
  position?: number;
  priority?: number;
  status?: Task['status'];
  assignee?: string;
  due_date?: Date;
  estimated_hours?: number;
  actual_hours?: number;
  parent_task_id?: string;
  metadata?: string;
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
  constructor(private db: DatabaseConnection) {}

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
    const id = uuidv4();
    const now = new Date();
    
    const position = data.position !== undefined ? data.position : await this.getNextPosition(data.column_id);
    
    const task: Task = {
      id,
      title: data.title,
      description: data.description,
      board_id: data.board_id,
      column_id: data.column_id,
      position,
      priority: data.priority || 0,
      status: data.status || 'todo',
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
      await this.db.transaction(async (db) => {
        if (data.parent_task_id) {
          const parentExists = await db.get('SELECT id FROM tasks WHERE id = ?', [data.parent_task_id]);
          if (!parentExists) {
            throw new Error('Parent task not found');
          }
        }

        await this.adjustPositionsForInsertion(data.column_id, position);

        await db.run(`
          INSERT INTO tasks (
            id, title, description, board_id, column_id, position, priority, status, 
            assignee, due_date, estimated_hours, actual_hours, parent_task_id, 
            created_at, updated_at, completed_at, archived, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          task.id, task.title, task.description, task.board_id, task.column_id, 
          task.position, task.priority, task.status, task.assignee, task.due_date, 
          task.estimated_hours, task.actual_hours, task.parent_task_id, 
          task.created_at, task.updated_at, task.completed_at, task.archived, task.metadata
        ]);
      });

      logger.info('Task created successfully', { taskId: task.id, title: task.title });
      return task;
    } catch (error) {
      logger.error('Failed to create task', { error, data });
      throw this.createError('TASK_CREATE_FAILED', 'Failed to create task', error);
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
   *   console.log(`Task: ${task.title}`);
   * }
   * ```
   */
  async getTaskById(id: string): Promise<Task | null> {
    try {
      const task = await this.db.queryOne<Task>(`
        SELECT * FROM tasks WHERE id = ? AND archived = FALSE
      `, [id]);

      if (task) {
        this.convertTaskDates(task);
      }

      return task || null;
    } catch (error) {
      logger.error('Failed to get task by ID', { error, id });
      throw this.createError('TASK_FETCH_FAILED', 'Failed to fetch task', error);
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
   *   console.log(`Task has ${taskWithSubs.subtasks.length} subtasks`);
   * }
   * ```
   */
  async getTaskWithSubtasks(id: string): Promise<TaskWithSubtasks | null> {
    try {
      const task = await this.getTaskById(id);
      if (!task) return null;

      const subtasks = await this.db.query<Task>(`
        SELECT * FROM tasks 
        WHERE parent_task_id = ? AND archived = FALSE
        ORDER BY position ASC
      `, [id]);

      subtasks.forEach(subtask => this.convertTaskDates(subtask));

      return {
        ...task,
        subtasks,
      };
    } catch (error) {
      logger.error('Failed to get task with subtasks', { error, id });
      throw this.createError('TASK_FETCH_FAILED', 'Failed to fetch task with subtasks', error);
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
   *   console.log(`Depends on ${taskWithDeps.dependencies.length} tasks`);
   *   console.log(`${taskWithDeps.dependents.length} tasks depend on this`);
   * }
   * ```
   */
  async getTaskWithDependencies(id: string): Promise<TaskWithDependencies | null> {
    try {
      const task = await this.getTaskById(id);
      if (!task) return null;

      const [dependencies, dependents] = await Promise.all([
        this.db.query<TaskDependency>(`
          SELECT * FROM task_dependencies WHERE task_id = ?
        `, [id]),
        this.db.query<TaskDependency>(`
          SELECT * FROM task_dependencies WHERE depends_on_task_id = ?
        `, [id])
      ]);

      dependencies.forEach(dep => dep.created_at = new Date(dep.created_at));
      dependents.forEach(dep => dep.created_at = new Date(dep.created_at));

      return {
        ...task,
        dependencies,
        dependents,
      };
    } catch (error) {
      logger.error('Failed to get task with dependencies', { error, id });
      throw this.createError('TASK_FETCH_FAILED', 'Failed to fetch task with dependencies', error);
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
      const params: any[] = [];
      const conditions: string[] = ['t.archived = ?'];
      params.push(archived);

      if (search) {
        conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
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
      tasks.forEach(task => this.convertTaskDates(task));

      return tasks;
    } catch (error) {
      logger.error('Failed to get tasks', { error, options });
      throw this.createError('TASKS_FETCH_FAILED', 'Failed to fetch tasks', error);
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
        throw this.createError('TASK_NOT_FOUND', 'Task not found', { id });
      }

      const updates: string[] = [];
      const params: any[] = [];

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

      await this.db.transaction(async (db) => {
        if (data.column_id !== undefined && data.column_id !== existingTask.column_id) {
          const newPosition = data.position !== undefined ? data.position : await this.getNextPosition(data.column_id);
          
          await this.adjustPositionsForRemoval(existingTask.column_id, existingTask.position);
          await this.adjustPositionsForInsertion(data.column_id, newPosition);
          
          updates.push('column_id = ?', 'position = ?');
          params.push(data.column_id, newPosition);
        } else if (data.position !== undefined && data.position !== existingTask.position) {
          await this.adjustPositionsForMove(existingTask.column_id, existingTask.position, data.position);
          updates.push('position = ?');
          params.push(data.position);
        }

        if (updates.length > 0) {
          updates.push('updated_at = ?');
          params.push(new Date());
          params.push(id);

          await db.run(`
            UPDATE tasks 
            SET ${updates.join(', ')}
            WHERE id = ?
          `, params);
        }
      });

      const updatedTask = await this.getTaskById(id);
      if (!updatedTask) {
        throw this.createError('TASK_UPDATE_FAILED', 'Task disappeared after update');
      }

      logger.info('Task updated successfully', { taskId: id });
      return updatedTask;
    } catch (error) {
      if (error instanceof Error && error.message.includes('TASK_')) {
        throw error;
      }
      logger.error('Failed to update task', { error, id, data });
      throw this.createError('TASK_UPDATE_FAILED', 'Failed to update task', error);
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
        throw this.createError('TASK_NOT_FOUND', 'Task not found', { id });
      }

      await this.db.transaction(async (db) => {
        await db.run('UPDATE tasks SET parent_task_id = ? WHERE parent_task_id = ?', [task.parent_task_id, id]);
        await db.run('DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_task_id = ?', [id, id]);
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
      throw this.createError('TASK_DELETE_FAILED', 'Failed to delete task', error);
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
  async addDependency(taskId: string, dependsOnTaskId: string, dependencyType: TaskDependency['dependency_type'] = 'blocks'): Promise<TaskDependency> {
    const id = uuidv4();
    const now = new Date();

    try {
      await this.db.transaction(async (db) => {
        const [task, dependentTask] = await Promise.all([
          db.get('SELECT id FROM tasks WHERE id = ?', [taskId]),
          db.get('SELECT id FROM tasks WHERE id = ?', [dependsOnTaskId])
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

        await db.run(`
          INSERT INTO task_dependencies (id, task_id, depends_on_task_id, dependency_type, created_at)
          VALUES (?, ?, ?, ?, ?)
        `, [id, taskId, dependsOnTaskId, dependencyType, now]);
      });

      const dependency: TaskDependency = {
        id,
        task_id: taskId,
        depends_on_task_id: dependsOnTaskId,
        dependency_type: dependencyType,
        created_at: now,
      };

      logger.info('Task dependency added successfully', { taskId, dependsOnTaskId, dependencyType });
      return dependency;
    } catch (error) {
      logger.error('Failed to add task dependency', { error, taskId, dependsOnTaskId });
      throw this.createError('DEPENDENCY_ADD_FAILED', 'Failed to add task dependency', error);
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
      const result = await this.db.execute(`
        DELETE FROM task_dependencies 
        WHERE task_id = ? AND depends_on_task_id = ?
      `, [taskId, dependsOnTaskId]);

      if (result.changes === 0) {
        throw this.createError('DEPENDENCY_NOT_FOUND', 'Dependency not found');
      }

      logger.info('Task dependency removed successfully', { taskId, dependsOnTaskId });
    } catch (error) {
      if (error instanceof Error && error.message.includes('DEPENDENCY_')) {
        throw error;
      }
      logger.error('Failed to remove task dependency', { error, taskId, dependsOnTaskId });
      throw this.createError('DEPENDENCY_REMOVE_FAILED', 'Failed to remove task dependency', error);
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
      const params: any[] = [];

      if (boardId) {
        query += ' AND t.board_id = ?';
        params.push(boardId);
      }

      query += ' ORDER BY t.priority DESC, t.created_at ASC';

      const tasks = await this.db.query<Task>(query, params);
      tasks.forEach(task => this.convertTaskDates(task));

      return tasks;
    } catch (error) {
      logger.error('Failed to get blocked tasks', { error, boardId });
      throw this.createError('TASKS_FETCH_FAILED', 'Failed to fetch blocked tasks', error);
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
      const params: any[] = [new Date()];

      if (boardId) {
        query += ' AND board_id = ?';
        params.push(boardId);
      }

      query += ' ORDER BY due_date ASC, priority DESC';

      const tasks = await this.db.query<Task>(query, params);
      tasks.forEach(task => this.convertTaskDates(task));

      return tasks;
    } catch (error) {
      logger.error('Failed to get overdue tasks', { error, boardId });
      throw this.createError('TASKS_FETCH_FAILED', 'Failed to fetch overdue tasks', error);
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
    const result = await this.db.queryOne<{ max_position: number }>(`
      SELECT COALESCE(MAX(position), -1) + 1 as max_position 
      FROM tasks 
      WHERE column_id = ? AND archived = FALSE
    `, [columnId]);
    
    return result?.max_position || 0;
  }

  /**
   * Adjusts positions of existing tasks to make room for insertion at specified position
   * 
   * @private
   * @param columnId Column identifier
   * @param position Position where new task will be inserted
   */
  private async adjustPositionsForInsertion(columnId: string, position: number): Promise<void> {
    await this.db.execute(`
      UPDATE tasks 
      SET position = position + 1 
      WHERE column_id = ? AND position >= ? AND archived = FALSE
    `, [columnId, position]);
  }

  /**
   * Adjusts positions of tasks after a task is removed from specified position
   * 
   * @private
   * @param columnId Column identifier
   * @param position Position of the removed task
   */
  private async adjustPositionsForRemoval(columnId: string, position: number): Promise<void> {
    await this.db.execute(`
      UPDATE tasks 
      SET position = position - 1 
      WHERE column_id = ? AND position > ? AND archived = FALSE
    `, [columnId, position]);
  }

  /**
   * Adjusts positions when a task is moved within the same column
   * 
   * @private
   * @param columnId Column identifier
   * @param oldPosition Current position of the task
   * @param newPosition Target position for the task
   */
  private async adjustPositionsForMove(columnId: string, oldPosition: number, newPosition: number): Promise<void> {
    if (oldPosition === newPosition) return;

    if (oldPosition < newPosition) {
      await this.db.execute(`
        UPDATE tasks 
        SET position = position - 1 
        WHERE column_id = ? AND position > ? AND position <= ? AND archived = FALSE
      `, [columnId, oldPosition, newPosition]);
    } else {
      await this.db.execute(`
        UPDATE tasks 
        SET position = position + 1 
        WHERE column_id = ? AND position >= ? AND position < ? AND archived = FALSE
      `, [columnId, newPosition, oldPosition]);
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
  private async wouldCreateCircularDependency(taskId: string, dependsOnTaskId: string): Promise<boolean> {
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

      const dependencies = await this.db.query<{ depends_on_task_id: string }>(`
        SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?
      `, [currentTaskId]);

      for (const dep of dependencies) {
        stack.push(dep.depends_on_task_id);
      }
    }

    return false;
  }

  /**
   * Converts string date fields to Date objects for a task
   * 
   * @private
   * @param task Task object with potentially string-based dates
   * 
   * @description SQLite stores dates as strings, so this method ensures
   * proper Date object conversion for JavaScript usage.
   */
  private convertTaskDates(task: Task): void {
    task.created_at = new Date(task.created_at);
    task.updated_at = new Date(task.updated_at);
    if (task.due_date) task.due_date = new Date(task.due_date);
    if (task.completed_at) task.completed_at = new Date(task.completed_at);
  }

  /**
   * Creates a standardized service error with proper error codes and status codes
   * 
   * @private
   * @param code Error code identifier for categorization
   * @param message Human-readable error message
   * @param originalError Optional original error for debugging context
   * @returns Standardized ServiceError with status code and details
   */
  private createError(code: string, message: string, originalError?: any): ServiceError {
    const error = new Error(message) as ServiceError;
    error.code = code;
    error.statusCode = this.getStatusCodeForError(code);
    error.details = originalError;
    return error;
  }

  /**
   * Maps error codes to appropriate HTTP status codes
   * 
   * @private
   * @param code Error code identifier
   * @returns HTTP status code (404 for not found, 500 for server errors)
   */
  private getStatusCodeForError(code: string): number {
    switch (code) {
      case 'TASK_NOT_FOUND':
      case 'DEPENDENCY_NOT_FOUND':
        return 404;
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
}