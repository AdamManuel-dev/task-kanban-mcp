/**
 * @fileoverview TaskService methods using Result pattern for better error handling
 * @lastmodified 2025-07-28T16:00:00Z
 *
 * Features: Result pattern implementation for TaskService operations
 * Main APIs: createTaskSafe(), updateTaskSafe(), getTaskSafe()
 * Constraints: Uses Result<T, E> pattern, no thrown exceptions
 * Patterns: Railway-oriented programming, explicit error handling
 */

import type { Task } from '../types';
import type { CreateTaskRequest, UpdateTaskRequest } from './TaskService';
import type { DatabaseConnection } from '../database/connection';
import {
  Ok,
  Err,
  createServiceError,
  wrapServiceOperation,
  validateWith,
  validateAll,
  isOk,
  andThen,
} from '../utils/result';
import type { Result, ServiceResult } from '../utils/result';
import { logger } from '../utils/logger';

export class TaskServiceResult {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Create a task using Result pattern - no exceptions thrown
   */
  async createTaskSafe(data: CreateTaskRequest): Promise<ServiceResult<Task>> {
    return wrapServiceOperation(
      async () => {
        // Validate input using Result pattern
        const validationResult = this.validateCreateTaskRequest(data);
        if (!isOk(validationResult)) {
          throw new Error(`Validation failed: ${validationResult.error.join(', ')}`);
        }

        // Check parent task exists if specified
        if (data.parent_task_id) {
          const parentCheckResult = await this.validateParentTaskExists(data.parent_task_id);
          if (!isOk(parentCheckResult)) {
            throw new Error(parentCheckResult.error.message);
          }
        }

        // Create task in transaction
        const task = await this.db.transaction(async db => {
          const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const now = new Date().toISOString();

          const newTask: Task = {
            id: taskId,
            title: data.title,
            description: data.description || '',
            board_id: data.board_id,
            column_id: data.column_id || 'default',
            position: 0,
            priority: data.priority || 5,
            status: data.status || 'todo',
            assignee: data.assignee,
            due_date: data.due_date,
            estimated_hours: undefined,
            actual_hours: undefined,
            parent_task_id: undefined,
            created_at: new Date(now),
            updated_at: new Date(now),
            completed_at: undefined,
            archived: false,
            metadata: '{}',
          };

          await db.run(
            `INSERT INTO tasks (
            id, title, description, board_id, column_id, position, priority, status,
            assignee, due_date, estimated_hours, actual_hours, parent_task_id,
            created_at, updated_at, completed_at, archived, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newTask.id,
              newTask.title,
              newTask.description,
              newTask.board_id,
              newTask.column_id,
              newTask.position,
              newTask.priority,
              newTask.status,
              newTask.assignee,
              newTask.due_date,
              newTask.estimated_hours,
              newTask.actual_hours,
              newTask.parent_task_id,
              newTask.created_at.toISOString(),
              newTask.updated_at.toISOString(),
              newTask.completed_at,
              newTask.archived ? 1 : 0,
              JSON.stringify(newTask.metadata),
            ]
          );

          return newTask;
        });

        logger.info('Task created successfully', { taskId: task.id, title: task.title });
        return task;
      },
      'TASK_CREATE_FAILED',
      'Failed to create task'
    );
  }

  /**
   * Get a task by ID using Result pattern
   */
  async getTaskSafe(taskId: string): Promise<ServiceResult<Task>> {
    return wrapServiceOperation(
      async () => {
        // Validate task ID
        const validationResult = validateWith(
          taskId,
          (id: string) => Boolean(id && id.trim().length > 0),
          'Task ID is required'
        );

        if (!isOk(validationResult)) {
          throw new Error(validationResult.error);
        }

        const row = await this.db.queryOne('SELECT * FROM tasks WHERE id = ? AND archived = 0', [
          taskId,
        ]);

        if (!row) {
          throw new Error(`Task not found: ${taskId}`);
        }

        return this.mapRowToTask(row);
      },
      'TASK_GET_FAILED',
      `Failed to get task: ${taskId}`
    );
  }

  /**
   * Update a task using Result pattern
   */
  async updateTaskSafe(taskId: string, updates: UpdateTaskRequest): Promise<ServiceResult<Task>> {
    return wrapServiceOperation(
      async () => {
        // Validate inputs
        const taskIdValidation = validateWith(
          taskId,
          (id: string) => Boolean(id && id.trim().length > 0),
          'Task ID is required'
        );

        const updatesValidation = validateWith(
          updates,
          (data: object) => Boolean(Object.keys(data).length > 0),
          'No updates provided'
        );

        const fieldsValidation = validateAll(updates, [
          data =>
            data.title
              ? isOk(validateWith(data.title, (t: string) => t.trim().length > 0, 'Title cannot be empty'))
                ? Ok(data)
                : Err('Title cannot be empty')
              : Ok(data),
          data =>
            data.priority !== undefined
              ? isOk(validateWith(data.priority, (p: number) => p >= 1 && p <= 10, 'Priority must be between 1-10'))
                ? Ok(data)
                : Err('Priority must be between 1-10')
              : Ok(data),
        ]);

        if (!isOk(taskIdValidation)) {
          throw new Error(taskIdValidation.error);
        }
        if (!isOk(updatesValidation)) {
          throw new Error(updatesValidation.error);
        }
        if (!isOk(fieldsValidation)) {
          throw new Error(`Validation failed: ${fieldsValidation.error.join(', ')}`);
        }

        // Check task exists
        const existingTaskResult = await this.getTaskSafe(taskId);
        if (!isOk(existingTaskResult)) {
          throw new Error(existingTaskResult.error.message);
        }

        // Perform update
        const updatedTask = await this.db.transaction(async db => {
          const updateFields: string[] = [];
          const updateValues: unknown[] = [];

          Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              updateFields.push(`${key} = ?`);
              updateValues.push(value);
            }
          });

          updateFields.push('updated_at = ?');
          updateValues.push(new Date().toISOString());
          updateValues.push(taskId);

          await db.run(`UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);

          // Get updated task
          const updatedRow = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
          return this.mapRowToTask(updatedRow);
        });

        logger.info('Task updated successfully', { taskId, updates: Object.keys(updates) });
        return updatedTask;
      },
      'TASK_UPDATE_FAILED',
      `Failed to update task: ${taskId}`
    );
  }

  /**
   * Delete a task using Result pattern
   */
  async deleteTaskSafe(taskId: string): Promise<ServiceResult<void>> {
    return wrapServiceOperation(
      async () => {
        // Validate task ID
        const validationResult = validateWith(
          taskId,
          (id: string) => Boolean(id && id.trim().length > 0),
          'Task ID is required'
        );

        if (!isOk(validationResult)) {
          throw new Error(validationResult.error);
        }

        // Check task exists first
        const existingTaskResult = await this.getTaskSafe(taskId);
        if (!isOk(existingTaskResult)) {
          throw new Error(existingTaskResult.error.message);
        }

        await this.db.transaction(async db => {
          // Check for dependencies
          const dependencies = await db.all(
            'SELECT id FROM task_dependencies WHERE task_id = ? OR depends_on_task_id = ?',
            [taskId, taskId]
          );

          if (dependencies.length > 0) {
            throw new Error('Cannot delete task with dependencies. Remove dependencies first.');
          }

          // Soft delete by archiving
          await db.run('UPDATE tasks SET archived = 1, updated_at = ? WHERE id = ?', [
            new Date().toISOString(),
            taskId,
          ]);
        });

        logger.info('Task deleted successfully', { taskId });
      },
      'TASK_DELETE_FAILED',
      `Failed to delete task: ${taskId}`
    );
  }

  /**
   * Validation helpers using Result pattern
   */
  private validateCreateTaskRequest(data: CreateTaskRequest): Result<CreateTaskRequest, string[]> {
    return validateAll(data, [
      req =>
        isOk(validateWith(req.title, (t: string) => Boolean(t && t.trim().length > 0), 'Title is required'))
          ? Ok(req)
          : Err('Title is required'),
      req =>
        isOk(validateWith(req.board_id, (b: string) => Boolean(b && b.trim().length > 0), 'Board ID is required'))
          ? Ok(req)
          : Err('Board ID is required'),
      req =>
        req.priority !== undefined
          ? isOk(validateWith(req.priority, (p: number) => p >= 1 && p <= 10, 'Priority must be between 1-10'))
            ? Ok(req)
            : Err('Priority must be between 1-10')
          : Ok(req),
      req =>
        req.status
          ? isOk(validateWith(
              req.status,
              s => ['todo', 'in_progress', 'done', 'blocked'].includes(s),
              'Invalid status'
            ))
            ? Ok(req)
            : Err('Invalid status')
          : Ok(req),
    ]);
  }

  private async validateParentTaskExists(parentTaskId: string): Promise<ServiceResult<boolean>> {
    return wrapServiceOperation(
      async () => {
        const parent = await this.db.queryOne(
          'SELECT id FROM tasks WHERE id = ? AND archived = 0',
          [parentTaskId]
        );

        if (!parent) {
          throw new Error(`Parent task not found: ${parentTaskId}`);
        }

        return true;
      },
      'PARENT_TASK_CHECK_FAILED',
      'Failed to validate parent task'
    );
  }

  private mapRowToTask(row: Record<string, unknown>): Task {
    return {
      id: String(row.id),
      title: String(row.title),
      description: String(row.description || ''),
      board_id: String(row.board_id),
      column_id: String(row.column_id),
      position: Number(row.position),
      priority: Number(row.priority),
      status: String(row.status) as Task['status'],
      assignee: row.assignee ? String(row.assignee) : undefined,
      due_date: row.due_date ? new Date(String(row.due_date)) : undefined,
      estimated_hours: row.estimated_hours ? Number(row.estimated_hours) : undefined,
      actual_hours: row.actual_hours ? Number(row.actual_hours) : undefined,
      parent_task_id: row.parent_task_id ? String(row.parent_task_id) : undefined,
      created_at: new Date(String(row.created_at)),
      updated_at: new Date(String(row.updated_at)),
      completed_at: row.completed_at ? new Date(String(row.completed_at)) : undefined,
      archived: Boolean(row.archived),
      metadata: row.metadata ? JSON.parse(String(row.metadata)) : {},
    };
  }
}
