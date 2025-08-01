/**
 * @fileoverview Task Dependency Management Service
 * @lastmodified 2025-07-31T12:00:00Z
 *
 * Features: Dependency creation/removal, circular dependency detection, dependency validation
 * Main APIs: addDependency(), removeDependency(), getTaskDependencies(), bulkDependencyOperations()
 * Constraints: Prevents circular dependencies, validates task existence
 * Patterns: All throw ServiceError, transactional operations, comprehensive validation
 */

import type { DatabaseConnection } from '../database/connection';
import type { TaskDependency } from '../types';
import { logger } from '../utils/logger';
import { TaskHistoryService } from './TaskHistoryService';

export interface BulkDependencyOperation {
  taskId: string;
  dependsOnTaskId: string;
  action: 'add' | 'remove';
}

export interface BulkDependencyResult {
  successful: Array<{ taskId: string; dependsOnTaskId: string; action: string }>;
  failed: Array<{ taskId: string; dependsOnTaskId: string; action: string; error: string }>;
}

/**
 * Service responsible for managing task dependencies
 *
 * Handles creation, removal, and validation of task dependencies while ensuring
 * no circular dependencies are created. Provides bulk operations and dependency
 * analysis functionality.
 */
export class TaskDependencyService {
  private readonly taskHistoryService = new TaskHistoryService();

  constructor(private readonly db: DatabaseConnection) {
    // eslint-disable-next-line no-useless-constructor
    console.log('TaskDependencyService constructor');
  }

  /**
   * Add a dependency between two tasks
   *
   * Creates a dependency relationship where taskId depends on dependsOnTaskId.
   * Validates that both tasks exist and that the dependency won't create a circular reference.
   *
   * @param taskId - ID of the task that will depend on another
   * @param dependsOnTaskId - ID of the task that must be completed first
   * @param metadata - Optional metadata about the dependency
   * @throws ServiceError when tasks don't exist or circular dependency would be created
   */
  async addDependency(
    taskId: string,
    dependsOnTaskId: string,
    metadata?: Record<string, unknown>
  ): Promise<TaskDependency> {
    if (taskId === dependsOnTaskId) {
      throw new Error('Task cannot depend on itself');
    }

    // Check if both tasks exist
    const [task, dependsOnTask] = await Promise.all([
      this.db.queryOne('SELECT id FROM tasks WHERE id = ?', [taskId]),
      this.db.queryOne('SELECT id FROM tasks WHERE id = ?', [dependsOnTaskId]),
    ]);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }
    if (!dependsOnTask) {
      throw new Error(`Dependency task with ID ${dependsOnTaskId} not found`);
    }

    // Check if dependency already exists
    const existingDependency = await this.db.queryOne(
      'SELECT id FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?',
      [taskId, dependsOnTaskId]
    );

    if (existingDependency) {
      throw new Error('Dependency already exists');
    }

    // Check for circular dependencies
    const wouldCreateCircular = await this.wouldCreateCircularDependency(taskId, dependsOnTaskId);
    if (wouldCreateCircular) {
      throw new Error('Cannot create dependency: would result in circular dependency');
    }

    const dependencyId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db.execute(
      `INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [dependencyId, taskId, dependsOnTaskId, now, metadata ? JSON.stringify(metadata) : null]
    );

    // Record in task history
    await this.taskHistoryService.recordChange({
      task_id: taskId,
      field_name: 'dependency_added',
      old_value: null,
      new_value: dependsOnTaskId,
      changed_by: 'system',
    });

    const dependency = await this.db.queryOne(`SELECT * FROM task_dependencies WHERE id = ?`, [
      dependencyId,
    ]);

    logger.info('Task dependency added', {
      taskId,
      dependsOnTaskId,
      dependencyId,
    });

    return dependency as TaskDependency;
  }

  /**
   * Remove a dependency between two tasks
   *
   * @param taskId - ID of the dependent task
   * @param dependsOnTaskId - ID of the dependency task
   * @throws ServiceError when dependency doesn't exist
   */
  async removeDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    const dependency = await this.db.queryOne(
      'SELECT id FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?',
      [taskId, dependsOnTaskId]
    );

    if (!dependency) {
      throw new Error('Dependency not found');
    }

    await this.db.execute(
      'DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?',
      [taskId, dependsOnTaskId]
    );

    // Record in task history
    await this.taskHistoryService.recordChange({
      task_id: taskId,
      field_name: 'dependency_removed',
      old_value: dependsOnTaskId,
      new_value: null,
      changed_by: 'system',
    });

    logger.info('Task dependency removed', {
      taskId,
      dependsOnTaskId,
    });
  }

  /**
   * Get all dependencies for a task
   *
   * @param taskId - ID of the task to get dependencies for
   * @returns Array of task dependencies
   */
  async getTaskDependencies(taskId: string): Promise<TaskDependency[]> {
    const dependencies = await this.db.query(
      `SELECT td.*, t.title as depends_on_title, t.status as depends_on_status
       FROM task_dependencies td
       JOIN tasks t ON td.depends_on_task_id = t.id
       WHERE td.task_id = ?
       ORDER BY td.created_at ASC`,
      [taskId]
    );

    return dependencies as TaskDependency[];
  }

  /**
   * Perform bulk dependency operations
   *
   * @param operations - Array of dependency operations to perform
   * @returns Result containing successful and failed operations
   */
  async bulkDependencyOperations(
    operations: BulkDependencyOperation[]
  ): Promise<BulkDependencyResult> {
    const successful: BulkDependencyResult['successful'] = [];
    const failed: BulkDependencyResult['failed'] = [];

    for (const operation of operations) {
      try {
        if (operation.action === 'add') {
          await this.addDependency(operation.taskId, operation.dependsOnTaskId);
        } else {
          await this.removeDependency(operation.taskId, operation.dependsOnTaskId);
        }

        successful.push({
          taskId: operation.taskId,
          dependsOnTaskId: operation.dependsOnTaskId,
          action: operation.action,
        });
      } catch (error) {
        failed.push({
          taskId: operation.taskId,
          dependsOnTaskId: operation.dependsOnTaskId,
          action: operation.action,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('Bulk dependency operations completed', {
      totalOperations: operations.length,
      successful: successful.length,
      failed: failed.length,
    });

    return { successful, failed };
  }

  /**
   * Check if adding a dependency would create a circular reference
   *
   * @param taskId - Task that would depend on another
   * @param dependsOnTaskId - Task that would be depended upon
   * @returns True if circular dependency would be created
   */
  private async wouldCreateCircularDependency(
    taskId: string,
    dependsOnTaskId: string
  ): Promise<boolean> {
    const visitedTasks = new Set<string>();

    const checkCircular = async (currentTaskId: string, targetTaskId: string): Promise<boolean> => {
      if (currentTaskId === targetTaskId) {
        return true;
      }

      if (visitedTasks.has(currentTaskId)) {
        return false;
      }

      visitedTasks.add(currentTaskId);

      const dependencies = await this.db.query<{ depends_on_task_id: string }>(
        'SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?',
        [currentTaskId]
      );

      for (const dependency of dependencies) {
        if (await checkCircular(dependency.depends_on_task_id, targetTaskId)) {
          return true;
        }
      }

      return false;
    };

    return checkCircular(dependsOnTaskId, taskId);
  }
}
