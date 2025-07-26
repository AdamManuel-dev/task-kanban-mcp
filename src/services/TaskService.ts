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

export interface TaskWithSubtasks extends Task {
  subtasks: Task[];
}

export interface TaskWithDependencies extends Task {
  dependencies: TaskDependency[];
  dependents: TaskDependency[];
}

export class TaskService {
  constructor(private db: DatabaseConnection) {}

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

  private async getNextPosition(columnId: string): Promise<number> {
    const result = await this.db.queryOne<{ max_position: number }>(`
      SELECT COALESCE(MAX(position), -1) + 1 as max_position 
      FROM tasks 
      WHERE column_id = ? AND archived = FALSE
    `, [columnId]);
    
    return result?.max_position || 0;
  }

  private async adjustPositionsForInsertion(columnId: string, position: number): Promise<void> {
    await this.db.execute(`
      UPDATE tasks 
      SET position = position + 1 
      WHERE column_id = ? AND position >= ? AND archived = FALSE
    `, [columnId, position]);
  }

  private async adjustPositionsForRemoval(columnId: string, position: number): Promise<void> {
    await this.db.execute(`
      UPDATE tasks 
      SET position = position - 1 
      WHERE column_id = ? AND position > ? AND archived = FALSE
    `, [columnId, position]);
  }

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

  private convertTaskDates(task: Task): void {
    task.created_at = new Date(task.created_at);
    task.updated_at = new Date(task.updated_at);
    if (task.due_date) task.due_date = new Date(task.due_date);
    if (task.completed_at) task.completed_at = new Date(task.completed_at);
  }

  private createError(code: string, message: string, originalError?: any): ServiceError {
    const error = new Error(message) as ServiceError;
    error.code = code;
    error.statusCode = this.getStatusCodeForError(code);
    error.details = originalError;
    return error;
  }

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