/**
 * @fileoverview Refactored Task Service - Core CRUD operations only
 * @lastmodified 2025-07-31T12:00:00Z
 *
 * Features: Core task CRUD operations, basic task management, service delegation
 * Main APIs: createTask(), getTaskById(), getTasks(), updateTask(), deleteTask()
 * Constraints: Delegates complex operations to specialized services
 * Patterns: Service composition, focused responsibility, clean separation of concerns
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseConnection } from '../database/connection';
import type { FilterOptions, PaginationOptions, Task } from '../types';
import { logger } from '../utils/logger';
import { TrackPerformance } from '../utils/service-metrics';
import { TaskDependencyService } from './TaskDependencyService';
import { TaskHistoryService } from './TaskHistoryService';
import { TaskPositionService } from './TaskPositionService';
import { TaskProgressService } from './TaskProgressService';

// Extend FilterOptions for task-specific filtering
interface TaskFilterOptions extends FilterOptions {
  board_id?: string;
  column_id?: string;
  status?: Task['status'];
  assignee?: string;
  priority?: number;
}

// Cache duration constants
const CACHE_DURATIONS = {
  TASK_CACHE_MS: 2 * 60 * 1000, // 2 minutes
  NULL_RESULT_CACHE_MS: 30 * 1000, // 30 seconds
} as const;

/**
 * Request interface for creating new tasks
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
 * Refactored Task Service with focused responsibilities
 *
 * This service now focuses on core CRUD operations and delegates specialized
 * functionality to dedicated services. This improves maintainability and
 * follows the single responsibility principle.
 */
export class TaskService {
  private readonly taskHistoryService = new TaskHistoryService();

  private readonly dependencyService: TaskDependencyService;

  private readonly positionService: TaskPositionService;

  private readonly progressService: TaskProgressService;

  constructor(private readonly db: DatabaseConnection) {
    this.dependencyService = new TaskDependencyService(db);
    this.positionService = new TaskPositionService(db);
    this.progressService = new TaskProgressService(db);
  }

  /**
   * Create a new task
   *
   * Creates a new task with the provided data. Handles position assignment,
   * validates required fields, and records the creation in task history.
   *
   * @param taskData - Task creation data
   * @returns Created task object
   * @throws Error when validation fails or database operation fails
   */
  @TrackPerformance('task-create')
  async createTask(taskData: CreateTaskRequest): Promise<Task> {
    const taskId = uuidv4();
    const now = new Date().toISOString();

    // Validate required fields
    if (!taskData.title.trim()) {
      throw new Error('Task title is required');
    }

    if (!taskData.board_id || !taskData.column_id) {
      throw new Error('Board ID and Column ID are required');
    }

    // Get position for new task
    const position =
      taskData.position ?? (await this.positionService.getNextPosition(taskData.column_id));

    // Adjust positions if inserting at specific position
    if (taskData.position !== undefined) {
      await this.positionService.adjustPositionsForInsertion(taskData.column_id, position);
    }

    const dbValues = {
      id: taskId,
      title: taskData.title.trim(),
      description: taskData.description?.trim(),
      board_id: taskData.board_id,
      column_id: taskData.column_id,
      position,
      priority: taskData.priority ?? 1,
      status: taskData.status ?? 'todo',
      assignee: taskData.assignee,
      due_date: taskData.due_date?.toISOString(),
      estimated_hours: taskData.estimated_hours,
      parent_task_id: taskData.parent_task_id,
      metadata: taskData.metadata,
      created_at: now,
      updated_at: now,
    };

    await this.db.run(
      `INSERT INTO tasks (
        id, title, description, board_id, column_id, position, priority, status,
        assignee, due_date, estimated_hours, parent_task_id, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dbValues.id,
        dbValues.title,
        dbValues.description,
        dbValues.board_id,
        dbValues.column_id,
        dbValues.position,
        dbValues.priority,
        dbValues.status,
        dbValues.assignee,
        dbValues.due_date,
        dbValues.estimated_hours,
        dbValues.parent_task_id,
        dbValues.metadata,
        dbValues.created_at,
        dbValues.updated_at,
      ]
    );

    // Record task creation in history
    await this.taskHistoryService.recordChange({
      task_id: taskId,
      field_name: 'created',
      old_value: null,
      new_value: JSON.stringify(taskData),
      changed_by: 'system',
      reason: 'Task created',
    });

    // Update parent progress if this is a subtask
    if (dbValues.parent_task_id) {
      await this.progressService.updateParentProgressOnSubtaskChange(taskId);
    }

    const createdTask = await this.getTaskById(taskId);
    if (!createdTask) {
      throw new Error('Failed to retrieve created task');
    }

    logger.info('Task created successfully', {
      taskId,
      title: task.title,
      boardId: task.board_id,
      columnId: task.column_id,
    });

    return createdTask;
  }

  /**
   * Get a task by its ID
   *
   * @param taskId - ID of the task to retrieve
   * @returns Task object or null if not found
   */
  @TrackPerformance('task-get-by-id')
  async getTaskById(taskId: string): Promise<Task | null> {
    const task = await this.db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);

    if (!task) {
      return null;
    }

    return this.convertTaskDates(task);
  }

  /**
   * Get multiple tasks with filtering and pagination
   *
   * @param options - Filtering and pagination options
   * @returns Array of tasks matching the criteria
   */
  @TrackPerformance('task-get-multiple')
  async getTasks(options: PaginationOptions & FilterOptions = {}): Promise<Task[]> {
    const { conditions, params } = this.buildTaskQueryConditions(options);

    let query = 'SELECT * FROM tasks';
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY position ASC';

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }
    }

    const tasks = await this.db.all(query, params);
    return tasks.map(task => this.convertTaskDates(task));
  }

  /**
   * Update an existing task
   *
   * @param taskId - ID of task to update
   * @param updateData - Fields to update
   * @returns Updated task object
   */
  @TrackPerformance('task-update')
  async updateTask(taskId: string, updateData: UpdateTaskRequest): Promise<Task> {
    const existingTask = await this.getTaskById(taskId);
    if (!existingTask) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const { fields, values } = this.buildFieldUpdates(updateData);

    if (fields.length === 0) {
      return existingTask; // No changes to make
    }

    // Handle position changes
    if (updateData.column_id !== undefined || updateData.position !== undefined) {
      await this.handlePositionUpdates(taskId, existingTask, updateData);
    }

    // Add updated_at timestamp
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(taskId);

    await this.db.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);

    // Record task update in history
    for (const [field, newValue] of Object.entries(updateData)) {
      const oldValue = (existingTask as unknown)[field];
      if (oldValue !== newValue) {
        await this.taskHistoryService.recordChange({
          task_id: taskId,
          field_name: field,
          old_value: oldValue != null ? String(oldValue) : null,
          new_value: newValue != null ? String(newValue) : null,
          changed_by: 'system',
          reason: 'Task updated',
        });
      }
    }

    // Handle post-update operations
    await this.handlePostUpdateOperations(taskId, existingTask, updateData);

    const updatedTask = await this.getTaskById(taskId);
    if (!updatedTask) {
      throw new Error('Failed to retrieve updated task');
    }

    logger.info('Task updated successfully', {
      taskId,
      updatedFields: Object.keys(updateData),
    });

    return updatedTask;
  }

  /**
   * Delete a task
   *
   * @param taskId - ID of task to delete
   */
  @TrackPerformance('task-delete')
  async deleteTask(taskId: string): Promise<void> {
    const task = await this.getTaskById(taskId);
    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    // Check for subtasks
    const subtasks = await this.db.all('SELECT id FROM tasks WHERE parent_task_id = ?', [taskId]);

    if (subtasks.length > 0) {
      throw new Error('Cannot delete task with existing subtasks');
    }

    // Remove all dependencies
    await this.db.run('DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_task_id = ?', [
      taskId,
      taskId,
    ]);

    // Adjust positions after deletion
    await this.positionService.adjustPositionsForRemoval(task.column_id, task.position);

    // Record deletion in history before deleting
    await this.taskHistoryService.recordChange({
      task_id: taskId,
      field_name: 'deleted',
      old_value: JSON.stringify(task),
      new_value: null,
      changed_by: 'system',
      reason: 'Task deleted',
    });

    // Delete the task
    await this.db.run('DELETE FROM tasks WHERE id = ?', [taskId]);

    // Update parent progress if this was a subtask
    if (task.parent_task_id) {
      await this.progressService.updateParentProgressOnSubtaskChange(taskId);
    }

    logger.info('Task deleted successfully', {
      taskId,
      title: task.title,
    });
  }

  // Delegation methods to specialized services

  /**
   * Add a dependency between tasks (delegates to TaskDependencyService)
   */
  async addDependency(taskId: string, dependsOnTaskId: string, metadata?: Record<string, unknown>) {
    return this.dependencyService.addDependency(taskId, dependsOnTaskId, metadata);
  }

  /**
   * Remove a dependency between tasks (delegates to TaskDependencyService)
   */
  async removeDependency(taskId: string, dependsOnTaskId: string) {
    return this.dependencyService.removeDependency(taskId, dependsOnTaskId);
  }

  /**
   * Get task dependencies (delegates to TaskDependencyService)
   */
  async getTaskDependencies(taskId: string) {
    return this.dependencyService.getTaskDependencies(taskId);
  }

  /**
   * Calculate parent task progress (delegates to TaskProgressService)
   */
  async calculateParentTaskProgress(parentTaskId: string) {
    return this.progressService.calculateParentTaskProgress(parentTaskId);
  }

  /**
   * Get subtask hierarchy (delegates to TaskProgressService)
   */
  async getSubtaskHierarchy(parentTaskId: string, maxDepth?: number) {
    return this.progressService.getSubtaskHierarchy(parentTaskId, maxDepth);
  }

  // Private helper methods

  private buildTaskQueryConditions(options: FilterOptions): {
    conditions: string[];
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.board_id) {
      conditions.push('board_id = ?');
      params.push(options.board_id);
    }

    if (options.column_id) {
      conditions.push('column_id = ?');
      params.push(options.column_id);
    }

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.assignee) {
      conditions.push('assignee = ?');
      params.push(options.assignee);
    }

    if (options.priority !== undefined) {
      conditions.push('priority = ?');
      params.push(options.priority);
    }

    return { conditions, params };
  }

  private buildFieldUpdates(updateData: UpdateTaskRequest): {
    fields: string[];
    values: unknown[];
  } {
    const fields: string[] = [];
    const values: unknown[] = [];

    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined && key !== 'position' && key !== 'column_id') {
        fields.push(`${key} = ?`);
        values.push(value instanceof Date ? value.toISOString() : value);
      }
    });

    return { fields, values };
  }

  private async handlePositionUpdates(
    taskId: string,
    existingTask: Task,
    updateData: UpdateTaskRequest
  ): Promise<void> {
    const newColumnId = updateData.column_id ?? existingTask.column_id;
    const newPosition = updateData.position ?? existingTask.position;

    if (newColumnId !== existingTask.column_id || newPosition !== existingTask.position) {
      await this.positionService.adjustPositionsForMove(
        taskId,
        existingTask.column_id,
        newColumnId,
        existingTask.position,
        newPosition
      );
    }
  }

  private async handlePostUpdateOperations(
    taskId: string,
    existingTask: Task,
    updateData: UpdateTaskRequest
  ): Promise<void> {
    // Update parent progress if status changed and task is a subtask
    if (
      updateData.status &&
      updateData.status !== existingTask.status &&
      existingTask.parent_task_id
    ) {
      await this.progressService.updateParentProgressOnSubtaskChange(taskId);
    }

    // Handle priority history if priority changed
    if (updateData.priority && updateData.priority !== existingTask.priority) {
      // This would be handled by a PriorityHistoryService if needed
      logger.debug('Priority changed', {
        taskId,
        oldPriority: existingTask.priority,
        newPriority: updateData.priority,
      });
    }
  }

  private convertTaskDates(task: unknown): Task {
    const typedTask = task as Task;
    return {
      ...typedTask,
      due_date: typedTask.due_date ? new Date(typedTask.due_date) : undefined,
      created_at: new Date(typedTask.created_at),
      updated_at: new Date(typedTask.updated_at),
    };
  }
}
