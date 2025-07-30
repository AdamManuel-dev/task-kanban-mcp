/**
 * @fileoverview TaskService Kysely Proof of Concept
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Type-safe task queries, CRUD operations, complex filtering
 * Main APIs: getTasks(), getTaskById(), createTask(), updateTask(), deleteTask()
 * Constraints: Requires Kysely setup, compatible with existing TaskService interface
 * Patterns: Type-safe queries, structured error handling, performance optimization
 */

import { v4 as uuidv4 } from 'uuid';
import { getKyselyDb, kyselyTransaction } from '../database/kysely-connection';
import type { Database, Task, NewTask, TaskUpdate } from '../database/schema-types';
import { logger } from '../utils/logger';

/**
 * Task filtering options for getTasks
 */
export interface GetTasksOptions {
  limit?: number;
  offset?: number;
  sortBy?: keyof Task;
  sortOrder?: 'asc' | 'desc';
  board_id?: string;
  column_id?: string;
  status?: Task['status'];
  assignee?: string;
  parent_task_id?: string;
  search?: string;
  priority_min?: number;
  priority_max?: number;
  overdue?: boolean;
}

/**
 * TaskService using Kysely for type-safe database operations
 * This is a proof of concept demonstrating the benefits of type-safe queries
 */
export class TaskServiceKysely {
  private readonly db = getKyselyDb();

  /**
   * Get tasks with filtering, sorting, and pagination
   * Demonstrates type-safe query building with complex conditions
   */
  async getTasks(options: GetTasksOptions = {}): Promise<Task[]> {
    try {
      let query = this.db.selectFrom('tasks').selectAll();

      // Apply filters with type safety
      if (options.board_id) {
        query = query.where('board_id', '=', options.board_id);
      }

      if (options.column_id) {
        query = query.where('column_id', '=', options.column_id);
      }

      if (options.status) {
        query = query.where('status', '=', options.status);
      }

      if (options.assignee) {
        query = query.where('assignee', '=', options.assignee);
      }

      if (options.parent_task_id) {
        query = query.where('parent_task_id', '=', options.parent_task_id);
      }

      // Search in title and description
      if (options.search) {
        query = query.where(eb =>
          eb.or([
            eb('title', 'like', `%${options.search}%`),
            eb('description', 'like', `%${options.search}%`),
          ])
        );
      }

      // Priority range filtering
      if (options.priority_min !== undefined) {
        query = query.where('priority', '>=', options.priority_min);
      }

      if (options.priority_max !== undefined) {
        query = query.where('priority', '<=', options.priority_max);
      }

      // Overdue tasks filtering
      if (options.overdue) {
        const now = new Date().toISOString();
        query = query.where('due_date', '<', now);
      }

      // Apply sorting
      const sortBy = options.sortBy ?? 'updated_at';
      const sortOrder = options.sortOrder ?? 'desc';
      query = query.orderBy(sortBy, sortOrder);

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.offset(options.offset);
      }

      const tasks = await query.execute();

      logger.info('Retrieved tasks with Kysely', {
        count: tasks.length,
        filters: options,
      });

      return tasks;
    } catch (error) {
      logger.error('Failed to get tasks with Kysely', { error, options });
      throw error;
    }
  }

  /**
   * Get a single task by ID
   * Demonstrates simple type-safe query with null handling
   */
  async getTaskById(id: string): Promise<Task | null> {
    try {
      const task = await this.db
        .selectFrom('tasks')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      return task ?? null;
    } catch (error) {
      logger.error('Failed to get task by ID with Kysely', { error, id });
      throw error;
    }
  }

  /**
   * Get tasks with their subtasks (demonstrates joins)
   */
  async getTaskWithSubtasks(id: string): Promise<(Task & { subtasks: Task[] }) | null> {
    try {
      // Get the main task
      const task = await this.getTaskById(id);
      if (!task) return null;

      // Get subtasks using type-safe query
      const subtasks = await this.db
        .selectFrom('tasks')
        .selectAll()
        .where('parent_task_id', '=', id)
        .orderBy('position', 'asc')
        .execute();

      return {
        ...task,
        subtasks,
      };
    } catch (error) {
      logger.error('Failed to get task with subtasks using Kysely', { error, id });
      throw error;
    }
  }

  /**
   * Create a new task
   * Demonstrates type-safe inserts with proper typing
   */
  async createTask(data: Omit<NewTask, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    try {
      const taskId = uuidv4();
      const now = new Date().toISOString();

      const newTask: NewTask = {
        id: taskId,
        ...data,
        position: data.position ?? 0,
        created_at: now,
        updated_at: now,
      };

      // Insert with full type safety
      await this.db.insertInto('tasks').values(newTask).execute();

      // Return the created task
      const task = await this.getTaskById(taskId);
      if (!task) {
        throw new Error('Failed to retrieve created task');
      }

      logger.info('Created task with Kysely', { id: taskId, title: data.title });
      return task;
    } catch (error) {
      logger.error('Failed to create task with Kysely', { error, data });
      throw error;
    }
  }

  /**
   * Update a task
   * Demonstrates type-safe updates with partial data
   */
  async updateTask(id: string, data: TaskUpdate): Promise<Task> {
    try {
      const now = new Date().toISOString();

      // Update with type safety - only valid columns can be updated
      const updateResult = await this.db
        .updateTable('tasks')
        .set({
          ...data,
          updated_at: now,
        })
        .where('id', '=', id)
        .execute();

      if (updateResult.length === 0) {
        throw new Error(`Task with id ${id} not found`);
      }

      // Return updated task
      const task = await this.getTaskById(id);
      if (!task) {
        throw new Error('Failed to retrieve updated task');
      }

      logger.info('Updated task with Kysely', { id, changes: data });
      return task;
    } catch (error) {
      logger.error('Failed to update task with Kysely', { error, id, data });
      throw error;
    }
  }

  /**
   * Delete a task
   * Demonstrates type-safe delete operations
   */
  async deleteTask(id: string): Promise<boolean> {
    try {
      const result = await this.db.deleteFrom('tasks').where('id', '=', id).execute();

      const deleted = result.length > 0;

      if (deleted) {
        logger.info('Deleted task with Kysely', { id });
      } else {
        logger.warn('Task not found for deletion', { id });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to delete task with Kysely', { error, id });
      throw error;
    }
  }

  /**
   * Complex query example: Get tasks by priority with board info
   * Demonstrates joins and complex type-safe queries
   */
  async getHighPriorityTasksWithBoardInfo(
    minPriority = 8
  ): Promise<Array<Task & { board_name: string }>> {
    try {
      const tasks = await this.db
        .selectFrom('tasks')
        .innerJoin('boards', 'tasks.board_id', 'boards.id')
        .select([
          'tasks.id',
          'tasks.title',
          'tasks.description',
          'tasks.status',
          'tasks.priority',
          'tasks.assignee',
          'tasks.due_date',
          'tasks.created_at',
          'tasks.updated_at',
          'tasks.board_id',
          'tasks.column_id',
          'tasks.position',
          'tasks.parent_task_id',
          'boards.name as board_name',
        ])
        .where('tasks.priority', '>=', minPriority)
        .where('tasks.status', '!=', 'archived')
        .orderBy('tasks.priority', 'desc')
        .orderBy('tasks.due_date', 'asc')
        .execute();

      logger.info('Retrieved high priority tasks with board info', {
        count: tasks.length,
        minPriority,
      });

      return tasks;
    } catch (error) {
      logger.error('Failed to get high priority tasks with Kysely', { error, minPriority });
      throw error;
    }
  }

  /**
   * Transaction example: Move task to different board
   * Demonstrates type-safe transactions
   */
  async moveTaskToBoard(taskId: string, newBoardId: string, newColumnId: string): Promise<Task> {
    try {
      return await kyselyTransaction(async trx => {
        // Verify task exists
        const task = await trx
          .selectFrom('tasks')
          .selectAll()
          .where('id', '=', taskId)
          .executeTakeFirst();

        if (!task) {
          throw new Error(`Task ${taskId} not found`);
        }

        // Verify board exists
        const board = await trx
          .selectFrom('boards')
          .select('id')
          .where('id', '=', newBoardId)
          .executeTakeFirst();

        if (!board) {
          throw new Error(`Board ${newBoardId} not found`);
        }

        // Update task
        await trx
          .updateTable('tasks')
          .set({
            board_id: newBoardId,
            column_id: newColumnId,
            position: 0, // Reset position in new column
            updated_at: new Date().toISOString(),
          })
          .where('id', '=', taskId)
          .execute();

        // Return updated task
        const updatedTask = await trx
          .selectFrom('tasks')
          .selectAll()
          .where('id', '=', taskId)
          .executeTakeFirst();

        if (!updatedTask) {
          throw new Error('Failed to retrieve updated task');
        }

        logger.info('Moved task to different board with Kysely transaction', {
          taskId,
          newBoardId,
          newColumnId,
        });

        return updatedTask;
      });
    } catch (error) {
      logger.error('Failed to move task to board with Kysely', { error, taskId, newBoardId });
      throw error;
    }
  }
}
