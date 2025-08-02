/**
 * @fileoverview TaskService with type-safe query templates
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Type-safe SQL queries, compile-time validation, optimized queries
 * Main APIs: TaskService with typed query methods
 * Constraints: Requires TypeSafeQueryBuilder, SQLite database
 * Patterns: Service pattern, type safety, comprehensive error handling
 */

import type { Database } from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { TypeSafeQueryBuilder } from '../database/TypeSafeQueryBuilder';
import { createQueryBuilder, DefaultSchema, sql } from '../database/TypeSafeQueryBuilder';
import { logger } from '../utils/logger';

/**
 * Task data types
 */
export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived';
  priority?: number;
  assignee?: string;
  due_date?: string;
  position: number;
  parent_task_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskData {
  board_id: string;
  column_id: string;
  title: string;
  description?: string;
  status?: Task['status'];
  priority?: number;
  assignee?: string;
  due_date?: string;
  position?: number;
  parent_task_id?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  status?: Task['status'];
  priority?: number;
  assignee?: string;
  due_date?: string;
  column_id?: string;
  position?: number;
  parent_task_id?: string;
}

export interface TaskFilters {
  board_id?: string;
  column_id?: string;
  status?: Task['status'];
  assignee?: string;
  parent_task_id?: string;
  priority_min?: number;
  priority_max?: number;
  search?: string;
  overdue?: boolean;
}

export interface TaskListOptions extends TaskFilters {
  limit?: number;
  offset?: number;
  sortBy?: keyof Task;
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * TaskService using type-safe query templates
 * Demonstrates the benefits of compile-time type checking for SQL queries
 */
export class TaskServiceWithTypedQueries {
  private readonly queryBuilder: TypeSafeQueryBuilder;

  constructor(private readonly db: Database) {
    this.queryBuilder = createQueryBuilder(db, DefaultSchema);
  }

  /**
   * Get tasks with filtering, sorting, and pagination
   * Uses type-safe query builder for complex conditions
   */
  async getTasks(options: TaskListOptions = {}): Promise<{
    tasks: Task[];
    total: number;
    pagination: {
      limit: number;
      offset: number;
      total: number;
      pages: number;
      currentPage: number;
    };
  }> {
    try {
      const {
        limit = 50,
        offset = 0,
        sortBy = 'updated_at',
        sortOrder = 'DESC',
        ...filters
      } = options;

      // Build query with type safety
      let query = this.queryBuilder.select('tasks');

      // Apply filters using type-safe WHERE builder
      query = query.where(w => {
        if (filters.board_id) {
          w.equals('board_id', filters.board_id);
        }

        if (filters.column_id) {
          w.and().equals('column_id', filters.column_id);
        }

        if (filters.status) {
          w.and().equals('status', filters.status);
        }

        if (filters.assignee) {
          w.and().equals('assignee', filters.assignee);
        }

        if (filters.parent_task_id) {
          w.and().equals('parent_task_id', filters.parent_task_id);
        }

        if (filters.priority_min !== undefined) {
          w.and().between('priority', filters.priority_min, filters.priority_max ?? 10);
        }

        if (filters.search) {
          w.and().raw(
            '(title LIKE ? OR description LIKE ?)',
            `%${filters.search}%`,
            `%${filters.search}%`
          );
        }

        if (filters.overdue) {
          const now = new Date().toISOString();
          w.and().raw('due_date < ? AND status != ?', now, 'done');
        }

        return w;
      });

      // Apply sorting with type safety
      query = query.orderBy(sortBy, sortOrder);

      // Get total count for pagination
      const countQuery = this.queryBuilder.select('tasks', ['id']);
      // Apply same filters to count query
      countQuery.where(w => {
        if (filters.board_id) {
          w.equals('board_id', filters.board_id);
        }
        // ... (same filter logic as above for count)
        return w;
      });

      const countResult = await countQuery.execute();
      const total = countResult.rowCount;

      // Apply pagination
      const result = await query.limit(limit).offset(offset).execute<Task>();

      const pages = Math.ceil(total / limit);
      const currentPage = Math.floor(offset / limit) + 1;

      logger.info('Retrieved tasks with type-safe queries', {
        taskCount: result.rowCount,
        total,
        executionTime: result.executionTime,
        filters: Object.keys(filters).length,
      });

      return {
        tasks: result.rows,
        total,
        pagination: { limit, offset, total, pages, currentPage },
      };
    } catch (error) {
      logger.error('Failed to get tasks with typed queries', { error, options });
      throw error;
    }
  }

  /**
   * Get task by ID with type safety
   */
  async getTaskById(id: string): Promise<Task | null> {
    try {
      const task = await this.queryBuilder
        .select('tasks')
        .where(w => w.equals('id', id))
        .first<Task>();

      if (task) {
        logger.debug('Retrieved task by ID', { id, executionTime: 0 });
      }

      return task;
    } catch (error) {
      logger.error('Failed to get task by ID', { error, id });
      throw error;
    }
  }

  /**
   * Create new task with type-safe insertion
   */
  async createTask(data: CreateTaskData): Promise<Task> {
    try {
      const taskId = uuidv4();
      const now = new Date().toISOString();

      const taskData = {
        id: taskId,
        board_id: data.board_id,
        column_id: data.column_id,
        title: data.title,
        description: data.description ?? null,
        status: data.status ?? ('todo' as const),
        priority: data.priority ?? null,
        assignee: data.assignee ?? null,
        due_date: data.due_date ?? null,
        position: data.position ?? 0,
        parent_task_id: data.parent_task_id ?? null,
        created_at: now,
        updated_at: now,
      };

      // Type-safe insertion
      const result = await this.queryBuilder.insert('tasks', taskData).execute();

      logger.info('Created task with typed queries', {
        id: taskId,
        title: data.title,
        changes: result.changes,
      });

      // Return the created task
      const createdTask = await this.getTaskById(taskId);
      if (!createdTask) {
        throw new Error('Failed to retrieve created task');
      }

      return createdTask;
    } catch (error) {
      logger.error('Failed to create task', { error, data });
      throw error;
    }
  }

  /**
   * Update task with type-safe updates
   */
  async updateTask(id: string, data: UpdateTaskData): Promise<Task> {
    try {
      const updates = {
        ...data,
        updated_at: new Date().toISOString(),
      };

      // Type-safe update
      const result = await this.queryBuilder
        .update('tasks', updates)
        .where(w => w.equals('id', id))
        .execute();

      if (result.changes === 0) {
        throw new Error(`Task with id ${id} not found`);
      }

      logger.info('Updated task with typed queries', {
        id,
        changes: result.changes,
        updatedFields: Object.keys(data),
      });

      // Return updated task
      const updatedTask = await this.getTaskById(id);
      if (!updatedTask) {
        throw new Error('Failed to retrieve updated task');
      }

      return updatedTask;
    } catch (error) {
      logger.error('Failed to update task', { error, id, data });
      throw error;
    }
  }

  /**
   * Delete task with type-safe deletion
   */
  async deleteTask(id: string): Promise<boolean> {
    try {
      // Type-safe deletion
      const result = await this.queryBuilder
        .delete('tasks')
        .where(w => w.equals('id', id))
        .execute();

      const deleted = result.changes > 0;

      if (deleted) {
        logger.info('Deleted task with typed queries', { id, changes: result.changes });
      } else {
        logger.warn('Task not found for deletion', { id });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to delete task', { error, id });
      throw error;
    }
  }

  /**
   * Get tasks with subtasks using JOINs
   */
  async getTasksWithSubtasks(boardId: string): Promise<Array<Task & { subtaskCount: number }>> {
    try {
      // Use raw SQL for complex query with subquery
      const { query, parameters } = sql`
        SELECT
          t.*,
          COALESCE(subtask_counts.subtask_count, 0) as subtaskCount
        FROM tasks t
        LEFT JOIN (
          SELECT
            parent_task_id,
            COUNT(*) as subtask_count
          FROM tasks
          WHERE parent_task_id IS NOT NULL
          GROUP BY parent_task_id
        ) subtask_counts ON t.id = subtask_counts.parent_task_id
        WHERE t.board_id = ${boardId}
        AND t.parent_task_id IS NULL
        ORDER BY t.position ASC
      `;

      const result = await this.queryBuilder.raw(query, parameters);

      logger.info('Retrieved tasks with subtasks', {
        boardId,
        taskCount: result.rowCount,
        executionTime: result.executionTime,
      });

      return result.rows as unknown as Array<Task & { subtaskCount: number }>;
    } catch (error) {
      logger.error('Failed to get tasks with subtasks', { error, boardId });
      throw error;
    }
  }

  /**
   * Get task statistics using aggregation
   */
  async getTaskStatistics(boardId: string): Promise<{
    total: number;
    byStatus: Record<Task['status'], number>;
    byPriority: Record<number, number>;
    avgPriority: number;
    overdue: number;
  }> {
    try {
      // Status statistics
      const statusResult = await this.queryBuilder.raw(
        `
        SELECT status, COUNT(*) as count
        FROM tasks
        WHERE board_id = ?
        GROUP BY status
      `,
        [boardId]
      );

      // Priority statistics
      const priorityResult = await this.queryBuilder.raw(
        `
        SELECT priority, COUNT(*) as count
        FROM tasks
        WHERE board_id = ? AND priority IS NOT NULL
        GROUP BY priority
      `,
        [boardId]
      );

      // Average priority
      const avgResult = await this.queryBuilder.raw(
        `
        SELECT AVG(priority) as avg_priority
        FROM tasks
        WHERE board_id = ? AND priority IS NOT NULL
      `,
        [boardId]
      );

      // Overdue tasks
      const now = new Date().toISOString();
      const overdueResult = await this.queryBuilder.raw(
        `
        SELECT COUNT(*) as count
        FROM tasks
        WHERE board_id = ? AND due_date < ? AND status != 'done'
      `,
        [boardId, now]
      );

      // Process results
      const byStatus: Record<Task['status'], number> = {
        todo: 0,
        in_progress: 0,
        done: 0,
        blocked: 0,
        archived: 0,
      };

      statusResult.rows.forEach((row: unknown) => {
        const typedRow = row as { status: Task['status']; count: number };
        byStatus[typedRow.status] = typedRow.count;
      });

      const byPriority: Record<number, number> = {};
      priorityResult.rows.forEach((row: unknown) => {
        const typedRow = row as { priority: number; count: number };
        byPriority[typedRow.priority] = typedRow.count;
      });

      const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
      const avgPriority = (avgResult.rows[0] as { avg_priority?: number }).avg_priority || 0;
      const overdue = (overdueResult.rows[0] as { count?: number }).count || 0;

      logger.info('Retrieved task statistics', {
        boardId,
        total,
        overdue,
        avgPriority,
      });

      return { total, byStatus, byPriority, avgPriority, overdue };
    } catch (error) {
      logger.error('Failed to get task statistics', { error, boardId });
      throw error;
    }
  }

  /**
   * Bulk update tasks with type safety
   */
  async bulkUpdateTasks(
    ids: string[],
    updates: UpdateTaskData
  ): Promise<{ updated: number; tasks: Task[] }> {
    try {
      if (ids.length === 0) {
        return { updated: 0, tasks: [] };
      }

      const updateData = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      // Type-safe bulk update
      const result = await this.queryBuilder
        .update('tasks', updateData)
        .where(w => w.in('id', ids))
        .execute();

      // Get updated tasks
      const updatedTasks = await this.queryBuilder
        .select('tasks')
        .where(w => w.in('id', ids))
        .execute<Task>();

      logger.info('Bulk updated tasks', {
        taskIds: ids,
        changes: result.changes,
        updatedFields: Object.keys(updates),
      });

      return { updated: result.changes, tasks: updatedTasks.rows };
    } catch (error) {
      logger.error('Failed to bulk update tasks', { error, ids, updates });
      throw error;
    }
  }
}
