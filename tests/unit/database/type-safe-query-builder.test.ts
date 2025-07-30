/**
 * @fileoverview Type-safe query builder tests
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Query builder testing, type safety validation, SQL generation
 * Main APIs: TypeSafeQueryBuilder test suite
 * Constraints: Integration tests, requires database setup
 * Patterns: Test isolation, comprehensive validation, error handling
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs/promises';
import {
  TypeSafeQueryBuilder,
  DefaultSchema,
  sql,
  createQueryBuilder,
  type TableSchema,
} from '../../../src/database/TypeSafeQueryBuilder';

describe('TypeSafeQueryBuilder', () => {
  let db: sqlite3.Database;
  let queryBuilder: TypeSafeQueryBuilder;
  let tempDbPath: string;

  beforeAll(async () => {
    // Create temporary database for testing
    tempDbPath = path.join(__dirname, 'test-query-builder.db');

    // Remove existing test database
    try {
      await fs.unlink(tempDbPath);
    } catch {
      // File doesn't exist, ignore
    }

    db = new sqlite3.Database(tempDbPath);
    queryBuilder = createQueryBuilder(db, DefaultSchema);

    // Create test tables
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL,
            column_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'todo',
            priority INTEGER,
            assignee TEXT,
            due_date DATETIME,
            position INTEGER NOT NULL DEFAULT 0,
            parent_task_id TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(
          `
          CREATE TABLE boards (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `,
          err => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });
  });

  afterAll(async () => {
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

  beforeEach(async () => {
    // Clean up data before each test
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM tasks');
        db.run('DELETE FROM boards', err => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  });

  describe('Schema Validation', () => {
    test('should validate column existence', async () => {
      expect(() => {
        queryBuilder.select('tasks', ['id', 'title', 'nonexistent_column' as any]);
      }).toThrow("Column 'nonexistent_column' does not exist in table 'tasks'");
    });

    test('should validate table existence', async () => {
      expect(() => {
        queryBuilder.select('nonexistent_table' as any);
      }).toThrow();
    });
  });

  describe('SELECT Queries', () => {
    beforeEach(async () => {
      // Insert test data
      await queryBuilder
        .insert('boards', {
          id: 'board-1',
          name: 'Test Board',
          description: 'Test board description',
        })
        .execute();

      await queryBuilder
        .insert('tasks', {
          id: 'task-1',
          board_id: 'board-1',
          column_id: 'todo',
          title: 'Task 1',
          description: 'First task',
          status: 'todo',
          priority: 5,
        })
        .execute();

      await queryBuilder
        .insert('tasks', {
          id: 'task-2',
          board_id: 'board-1',
          column_id: 'in_progress',
          title: 'Task 2',
          description: 'Second task',
          status: 'in_progress',
          priority: 8,
        })
        .execute();
    });

    test('should select all columns', async () => {
      const result = await queryBuilder.select('tasks').execute();

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toHaveProperty('id');
      expect(result.rows[0]).toHaveProperty('title');
      expect(result.rows[0]).toHaveProperty('status');
    });

    test('should select specific columns', async () => {
      const result = await queryBuilder.select('tasks', ['id', 'title', 'status']).execute();

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toHaveProperty('id');
      expect(result.rows[0]).toHaveProperty('title');
      expect(result.rows[0]).toHaveProperty('status');
      expect(result.rows[0]).not.toHaveProperty('description');
    });

    test('should apply WHERE conditions', async () => {
      const result = await queryBuilder
        .select('tasks')
        .where(w => w.equals('status', 'todo'))
        .execute();

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('todo');
    });

    test('should apply multiple WHERE conditions', async () => {
      const result = await queryBuilder
        .select('tasks')
        .where(w => w.equals('board_id', 'board-1').and().equals('status', 'in_progress'))
        .execute();

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('in_progress');
    });

    test('should apply LIKE conditions', async () => {
      const result = await queryBuilder
        .select('tasks')
        .where(w => w.like('title', '%Task%'))
        .execute();

      expect(result.rows).toHaveLength(2);
    });

    test('should apply IN conditions', async () => {
      const result = await queryBuilder
        .select('tasks')
        .where(w => w.in('status', ['todo', 'done']))
        .execute();

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('todo');
    });

    test('should apply range conditions', async () => {
      const result = await queryBuilder
        .select('tasks')
        .where(w => w.between('priority', 1, 6))
        .execute();

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].priority).toBe(5);
    });

    test('should apply ORDER BY', async () => {
      const result = await queryBuilder.select('tasks').orderBy('priority', 'DESC').execute();

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].priority).toBe(8);
      expect(result.rows[1].priority).toBe(5);
    });

    test('should apply LIMIT and OFFSET', async () => {
      const result = await queryBuilder
        .select('tasks')
        .orderBy('id', 'ASC')
        .limit(1)
        .offset(1)
        .execute();

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe('task-2');
    });

    test('should get first row', async () => {
      const task = await queryBuilder
        .select('tasks')
        .where(w => w.equals('id', 'task-1'))
        .first();

      expect(task).toBeDefined();
      expect(task?.id).toBe('task-1');
    });

    test('should return null when no rows found', async () => {
      const task = await queryBuilder
        .select('tasks')
        .where(w => w.equals('id', 'nonexistent'))
        .first();

      expect(task).toBeNull();
    });

    test('should support JOINs', async () => {
      const result = await queryBuilder
        .select('tasks', ['title'])
        .join('boards', 'tasks.board_id = boards.id')
        .execute();

      expect(result.rows).toHaveLength(2);
    });
  });

  describe('INSERT Queries', () => {
    test('should insert new record', async () => {
      const result = await queryBuilder
        .insert('tasks', {
          id: 'new-task',
          board_id: 'board-1',
          column_id: 'todo',
          title: 'New Task',
          status: 'todo',
        })
        .execute();

      expect(result.changes).toBe(1);

      // Verify insertion
      const task = await queryBuilder
        .select('tasks')
        .where(w => w.equals('id', 'new-task'))
        .first();

      expect(task).toBeDefined();
      expect(task?.title).toBe('New Task');
    });

    test('should validate column names', async () => {
      await expect(
        queryBuilder
          .insert('tasks', {
            id: 'test',
            invalid_column: 'value',
          } as any)
          .execute()
      ).rejects.toThrow("Column 'invalid_column' does not exist in table 'tasks'");
    });
  });

  describe('UPDATE Queries', () => {
    beforeEach(async () => {
      await queryBuilder
        .insert('tasks', {
          id: 'update-task',
          board_id: 'board-1',
          column_id: 'todo',
          title: 'Original Title',
          status: 'todo',
        })
        .execute();
    });

    test('should update existing record', async () => {
      const result = await queryBuilder
        .update('tasks', {
          title: 'Updated Title',
          status: 'in_progress',
        })
        .where(w => w.equals('id', 'update-task'))
        .execute();

      expect(result.changes).toBe(1);

      // Verify update
      const task = await queryBuilder
        .select('tasks')
        .where(w => w.equals('id', 'update-task'))
        .first();

      expect(task?.title).toBe('Updated Title');
      expect(task?.status).toBe('in_progress');
    });

    test('should validate column names', async () => {
      await expect(
        queryBuilder
          .update('tasks', {
            invalid_column: 'value',
          } as any)
          .where(w => w.equals('id', 'update-task'))
          .execute()
      ).rejects.toThrow("Column 'invalid_column' does not exist in table 'tasks'");
    });
  });

  describe('DELETE Queries', () => {
    beforeEach(async () => {
      await queryBuilder
        .insert('tasks', {
          id: 'delete-task',
          board_id: 'board-1',
          column_id: 'todo',
          title: 'To Delete',
          status: 'todo',
        })
        .execute();
    });

    test('should delete existing record', async () => {
      const result = await queryBuilder
        .delete('tasks')
        .where(w => w.equals('id', 'delete-task'))
        .execute();

      expect(result.changes).toBe(1);

      // Verify deletion
      const task = await queryBuilder
        .select('tasks')
        .where(w => w.equals('id', 'delete-task'))
        .first();

      expect(task).toBeNull();
    });

    test('should require WHERE clause', async () => {
      await expect(queryBuilder.delete('tasks').execute()).rejects.toThrow(
        'DELETE queries must include a WHERE clause for safety'
      );
    });
  });

  describe('SQL Template Literals', () => {
    test('should create parameterized query', () => {
      const taskId = 'test-task';
      const status = 'done';

      const { query, parameters } = sql`
        SELECT * FROM tasks 
        WHERE id = ${taskId} AND status = ${status}
      `;

      expect(query.trim()).toBe('SELECT * FROM tasks \n        WHERE id = ? AND status = ?');
      expect(parameters).toEqual([taskId, status]);
    });

    test('should handle empty parameters', () => {
      const { query, parameters } = sql`SELECT * FROM tasks`;

      expect(query).toBe('SELECT * FROM tasks');
      expect(parameters).toEqual([]);
    });
  });

  describe('Raw Queries', () => {
    beforeEach(async () => {
      await queryBuilder
        .insert('tasks', {
          id: 'raw-task',
          board_id: 'board-1',
          column_id: 'todo',
          title: 'Raw Query Task',
          status: 'todo',
        })
        .execute();
    });

    test('should execute raw SQL', async () => {
      const result = await queryBuilder.raw(
        'SELECT COUNT(*) as count FROM tasks WHERE status = ?',
        ['todo']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].count).toBe(1);
    });

    test('should track execution time', async () => {
      const result = await queryBuilder.raw('SELECT 1');

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid SQL', async () => {
      await expect(queryBuilder.raw('INVALID SQL STATEMENT')).rejects.toThrow();
    });

    test('should handle database constraint violations', async () => {
      // Try to insert duplicate primary key
      await queryBuilder
        .insert('tasks', {
          id: 'duplicate-task',
          board_id: 'board-1',
          column_id: 'todo',
          title: 'First Task',
          status: 'todo',
        })
        .execute();

      await expect(
        queryBuilder
          .insert('tasks', {
            id: 'duplicate-task',
            board_id: 'board-1',
            column_id: 'todo',
            title: 'Duplicate Task',
            status: 'todo',
          })
          .execute()
      ).rejects.toThrow();
    });
  });

  describe('Type Safety', () => {
    test('should prevent LIKE on non-text columns', async () => {
      expect(() => {
        queryBuilder.select('tasks').where(w => w.like('priority' as any, '%5%'));
      }).toThrow("LIKE operation requires TEXT column, but 'priority' is INTEGER");
    });

    test('should validate IN condition parameters', async () => {
      expect(() => {
        queryBuilder.select('tasks').where(w => w.in('status', []));
      }).toThrow('IN condition requires at least one value');
    });

    test('should validate LIMIT parameter', async () => {
      expect(() => {
        queryBuilder.select('tasks').limit(0);
      }).toThrow('LIMIT must be a positive number');
    });

    test('should validate OFFSET parameter', async () => {
      expect(() => {
        queryBuilder.select('tasks').offset(-1);
      }).toThrow('OFFSET must be non-negative');
    });
  });
});
