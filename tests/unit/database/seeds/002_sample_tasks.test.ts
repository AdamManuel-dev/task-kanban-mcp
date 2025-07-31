/**
 * @fileoverview Test for sample tasks seed migration
 * @lastmodified 2025-07-28T04:40:00Z
 *
 * Features: Task creation validation, subtasks relationships
 * Main APIs: Sample tasks seed testing
 * Constraints: Database integration test
 * Patterns: Migration testing, data validation, relationship testing
 */

import { Database } from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { run, name, description } from '../../../../src/database/seeds/002_sample_tasks';

// Mock database interface to match the sqlite wrapper
interface MockDatabase {
  run: (sql: string, params?: unknown[]) => Promise<unknown>;
  all: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  get: (sql: string, params?: unknown[]) => Promise<unknown>;
}

interface Task {
  id: string;
  title: string;
  description: string;
  board_id: string;
  column_id: string;
  position: number;
  priority: number;
  status: string;
  due_date?: string;
  estimated_hours?: number;
  parent_task_id?: string;
}

describe('002_sample_tasks seed', () => {
  let db: Database;
  let mockDb: MockDatabase;
  let tempDbPath: string;

  beforeEach(async () => {
    // Create temporary database for testing
    tempDbPath = path.join(__dirname, 'test-sample-tasks.db');

    // Remove existing test database
    try {
      await fs.unlink(tempDbPath);
    } catch {
      // File doesn't exist, ignore
    }

    db = new Database(tempDbPath);

    // Create mock database interface that matches the sqlite wrapper
    const dbRun = promisify(db.run.bind(db));
    const all = promisify(db.all.bind(db));
    const get = promisify(db.get.bind(db));

    mockDb = {
      run: async (sql: string, params?: unknown[]) => await dbRun(sql, params || []),
      all: async (sql: string, params?: unknown[]) => await all(sql, params || []),
      get: async (sql: string, params?: unknown[]) => await get(sql, params || []),
    };

    // Create required tables
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE boards (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE columns (
            id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL,
            name TEXT NOT NULL,
            position INTEGER NOT NULL,
            wip_limit INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
          )
        `);

        db.run(
          `
          CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            board_id TEXT NOT NULL,
            column_id TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            priority INTEGER DEFAULT 50,
            status TEXT NOT NULL DEFAULT 'todo',
            due_date DATETIME,
            estimated_hours REAL,
            actual_hours REAL,
            parent_task_id TEXT,
            assignee TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
          )
        `,
          err => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    // Create prerequisite boards and columns for testing
    await mockDb.run(`
      INSERT INTO boards (id, name, description, color) VALUES 
      ('board-1', 'Development Board', 'Main development board', '#2196F3'),
      ('board-2', 'Personal Tasks', 'Personal task management', '#4CAF50'),
      ('board-3', 'Project Planning', 'Long-term planning', '#FF9800')
    `);

    await mockDb.run(`
      INSERT INTO columns (id, board_id, name, position) VALUES 
      ('col-1', 'board-1', 'Backlog', 1),
      ('col-2', 'board-1', 'To Do', 2),
      ('col-3', 'board-1', 'In Progress', 3),
      ('col-4', 'board-1', 'Code Review', 4),
      ('col-5', 'board-1', 'Testing', 5),
      ('col-6', 'board-1', 'Done', 6),
      ('col-7', 'board-2', 'To Do', 1),
      ('col-8', 'board-2', 'Doing', 2),
      ('col-9', 'board-2', 'Done', 3),
      ('col-10', 'board-3', 'Ideas', 1),
      ('col-11', 'board-3', 'Planned', 2),
      ('col-12', 'board-3', 'In Progress', 3),
      ('col-13', 'board-3', 'Completed', 4)
    `);
  });

  afterEach(async () => {
    // Close database and clean up
    await new Promise<void>(resolve => {
      db.close(() => resolve());
    });

    try {
      await fs.unlink(tempDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should have correct metadata', () => {
    expect(name).toBe('Sample Tasks');
    expect(description).toBe(
      'Create sample tasks with various statuses, priorities, and relationships'
    );
  });

  test('should create development board tasks', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify development board tasks
    const devTasks = (await mockDb.all(
      'SELECT * FROM tasks WHERE board_id = ? AND parent_task_id IS NULL ORDER BY id',
      ['board-1']
    )) as Task[];

    expect(devTasks).toHaveLength(7);

    // Check specific tasks
    expect(devTasks[0]).toMatchObject({
      id: 'task-1',
      title: 'Implement user authentication',
      board_id: 'board-1',
      column_id: 'col-3',
      status: 'in_progress',
      priority: 100,
      estimated_hours: 16.0,
    });

    expect(devTasks[1]).toMatchObject({
      id: 'task-2',
      title: 'Design database schema',
      board_id: 'board-1',
      column_id: 'col-6',
      status: 'done',
      priority: 90,
      estimated_hours: 8.0,
    });

    // Verify due dates are set for some tasks
    expect(devTasks[0].due_date).toBeTruthy();
    expect(devTasks[2].due_date).toBeTruthy();
  });

  test('should create personal tasks', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify personal tasks
    const personalTasks = (await mockDb.all('SELECT * FROM tasks WHERE board_id = ? ORDER BY id', [
      'board-2',
    ])) as Task[];

    expect(personalTasks).toHaveLength(3);

    const expectedTasks = [
      {
        id: 'task-10',
        title: 'Exercise routine',
        column_id: 'col-9',
        status: 'done',
        priority: 40,
      },
      {
        id: 'task-8',
        title: 'Buy groceries',
        column_id: 'col-7',
        status: 'todo',
        priority: 50,
      },
      {
        id: 'task-9',
        title: 'Read Node.js book',
        column_id: 'col-8',
        status: 'in_progress',
        priority: 30,
      },
    ];

    expectedTasks.forEach((expected, index) => {
      expect(personalTasks[index]).toMatchObject({
        ...expected,
        board_id: 'board-2',
      });
    });
  });

  test('should create project planning tasks', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify project planning tasks
    const planningTasks = (await mockDb.all(
      'SELECT * FROM tasks WHERE board_id = ? AND parent_task_id IS NULL ORDER BY id',
      ['board-3']
    )) as Task[];

    expect(planningTasks).toHaveLength(3);

    const expectedTasks = [
      {
        id: 'task-11',
        title: 'Mobile app development',
        column_id: 'col-11',
        status: 'todo',
        priority: 90,
        estimated_hours: 160.0,
      },
      {
        id: 'task-12',
        title: 'Integration with Slack',
        column_id: 'col-10',
        status: 'todo',
        priority: 70,
        estimated_hours: 24.0,
      },
      {
        id: 'task-13',
        title: 'Performance optimization',
        column_id: 'col-12',
        status: 'in_progress',
        priority: 80,
        estimated_hours: 32.0,
      },
    ];

    expectedTasks.forEach((expected, index) => {
      expect(planningTasks[index]).toMatchObject({
        ...expected,
        board_id: 'board-3',
      });
    });
  });

  test('should create subtasks with parent relationships', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify subtasks
    const subtasks = (await mockDb.all(
      'SELECT * FROM tasks WHERE parent_task_id IS NOT NULL ORDER BY id'
    )) as Task[];

    expect(subtasks).toHaveLength(4);

    // All subtasks should be children of task-1
    subtasks.forEach(subtask => {
      expect(subtask.parent_task_id).toBe('task-1');
      expect(subtask.board_id).toBe('board-1');
    });

    // Check specific subtasks
    const expectedSubtasks = [
      {
        id: 'task-14',
        title: 'Set up JWT middleware',
        column_id: 'col-3',
        status: 'in_progress',
        estimated_hours: 4.0,
      },
      {
        id: 'task-15',
        title: 'Create login API endpoint',
        column_id: 'col-2',
        status: 'todo',
        estimated_hours: 3.0,
      },
      {
        id: 'task-16',
        title: 'Create logout API endpoint',
        column_id: 'col-2',
        status: 'todo',
        estimated_hours: 2.0,
      },
      {
        id: 'task-17',
        title: 'Add password hashing',
        column_id: 'col-6',
        status: 'done',
        estimated_hours: 2.0,
      },
    ];

    expectedSubtasks.forEach((expected, index) => {
      expect(subtasks[index]).toMatchObject({
        ...expected,
        parent_task_id: 'task-1',
        board_id: 'board-1',
        priority: 100,
      });
    });
  });

  test('should create tasks with proper priorities', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify priority distribution
    const highPriorityTasks = (await mockDb.all(
      'SELECT * FROM tasks WHERE priority >= 90'
    )) as Task[];

    const mediumPriorityTasks = (await mockDb.all(
      'SELECT * FROM tasks WHERE priority >= 60 AND priority < 90'
    )) as Task[];

    const lowPriorityTasks = (await mockDb.all(
      'SELECT * FROM tasks WHERE priority < 60'
    )) as Task[];

    expect(highPriorityTasks.length).toBeGreaterThan(0);
    expect(mediumPriorityTasks.length).toBeGreaterThan(0);
    expect(lowPriorityTasks.length).toBeGreaterThan(0);

    // All subtasks should have priority 100
    const subtasks = (await mockDb.all(
      'SELECT * FROM tasks WHERE parent_task_id IS NOT NULL'
    )) as Task[];

    subtasks.forEach(subtask => {
      expect(subtask.priority).toBe(100);
    });
  });

  test('should create tasks with various statuses', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify status distribution
    const todoTasks = (await mockDb.all('SELECT * FROM tasks WHERE status = ?', [
      'todo',
    ])) as Task[];

    const inProgressTasks = (await mockDb.all('SELECT * FROM tasks WHERE status = ?', [
      'in_progress',
    ])) as Task[];

    const doneTasks = (await mockDb.all('SELECT * FROM tasks WHERE status = ?', [
      'done',
    ])) as Task[];

    expect(todoTasks.length).toBeGreaterThan(0);
    expect(inProgressTasks.length).toBeGreaterThan(0);
    expect(doneTasks.length).toBeGreaterThan(0);

    // Total should be 17 tasks (7 dev + 3 personal + 3 planning + 4 subtasks)
    const totalTasks = todoTasks.length + inProgressTasks.length + doneTasks.length;
    expect(totalTasks).toBe(17);
  });

  test('should create tasks with estimated hours', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify estimated hours are set for appropriate tasks
    const tasksWithEstimates = (await mockDb.all(
      'SELECT * FROM tasks WHERE estimated_hours IS NOT NULL'
    )) as Task[];

    expect(tasksWithEstimates.length).toBeGreaterThan(0);

    // Check some specific values
    const task1 = (await mockDb.get('SELECT * FROM tasks WHERE id = ?', ['task-1'])) as Task;

    expect(task1.estimated_hours).toBe(16.0);

    const task11 = (await mockDb.get('SELECT * FROM tasks WHERE id = ?', ['task-11'])) as Task;

    expect(task11.estimated_hours).toBe(160.0);
  });

  test('should create tasks with due dates', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify some tasks have due dates
    const tasksWithDueDates = (await mockDb.all(
      'SELECT * FROM tasks WHERE due_date IS NOT NULL'
    )) as Task[];

    expect(tasksWithDueDates.length).toBeGreaterThan(0);

    // Due dates should be in the future
    tasksWithDueDates.forEach(task => {
      const dueDate = new Date(task.due_date!);
      const now = new Date();
      expect(dueDate.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  test('should handle duplicate execution gracefully', async () => {
    // Run the seed twice
    await run(mockDb as any);

    // This should fail due to primary key constraints
    await expect(run(mockDb as any)).rejects.toThrow();

    // Verify data integrity - still only 17 tasks
    const allTasks = (await mockDb.all('SELECT * FROM tasks')) as Task[];
    expect(allTasks).toHaveLength(17);
  });

  test('should create all expected tasks total', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify total task count
    const allTasks = (await mockDb.all('SELECT * FROM tasks')) as Task[];
    expect(allTasks).toHaveLength(17); // 7 dev + 3 personal + 3 planning + 4 subtasks

    // Verify all tasks have valid board references
    const boardIds = ['board-1', 'board-2', 'board-3'];
    allTasks.forEach(task => {
      expect(boardIds).toContain(task.board_id);
    });

    // Verify all tasks have valid positions
    allTasks.forEach(task => {
      expect(task.position).toBeGreaterThanOrEqual(0);
    });
  });

  test('should maintain referential integrity', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify all parent_task_id references exist
    const tasksWithParents = (await mockDb.all(
      'SELECT * FROM tasks WHERE parent_task_id IS NOT NULL'
    )) as Task[];

    for (const task of tasksWithParents) {
      const parent = (await mockDb.get('SELECT * FROM tasks WHERE id = ?', [
        task.parent_task_id,
      ])) as Task;

      expect(parent).toBeDefined();
      expect(parent.id).toBe(task.parent_task_id);
    }

    // Verify all board_id references exist
    const allTasks = (await mockDb.all('SELECT DISTINCT board_id FROM tasks')) as Array<{
      board_id: string;
    }>;

    for (const { board_id } of allTasks) {
      const board = await mockDb.get('SELECT * FROM boards WHERE id = ?', [board_id]);

      expect(board).toBeDefined();
    }
  });
});
