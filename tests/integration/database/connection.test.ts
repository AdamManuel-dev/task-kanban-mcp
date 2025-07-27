/**
 * Database Connection Integration Tests
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { dbConnection } from '../../src/database/connection';

describe('Database Connection Integration Tests', () => {
  const testDbPath = path.join(__dirname, `test-${String(uuidv4())}.db`);

  afterEach(async () => {
    await dbConnection.close();
    // Clean up test database file
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Connection Management', () => {
    it('should initialize database with schema', async () => {
      await dbConnection.initialize({
        path: testDbPath,
        skipSchema: false,
      });

      const db = dbConnection.getDatabase();
      expect(db).toBeDefined();

      // Verify tables were created
      const tables = await dbConnection.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      );

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('boards');
      expect(tableNames).toContain('tasks');
      expect(tableNames).toContain('columns');
      expect(tableNames).toContain('tags');
      expect(tableNames).toContain('notes');

      // Check for any migration-related table (might be named differently)
      const hasMigrationTable = tableNames.some(
        name => name.includes('migration') || name.includes('knex') || name.includes('schema')
      );
      expect(hasMigrationTable).toBe(true);
    });

    it('should handle in-memory database', async () => {
      await dbConnection.initialize({
        path: ':memory:',
        skipSchema: false,
      });

      const db = dbConnection.getDatabase();
      expect(db).toBeDefined();

      // Should be able to perform operations
      const boardId = uuidv4();
      await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
        boardId,
        'Test Board',
        new Date().toISOString(),
      ]);

      // Create column first
      const columnId = uuidv4();
      await dbConnection.execute(
        'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
        [columnId, boardId, 'To Do', 0, new Date().toISOString()]
      );

      const result = await dbConnection.queryOne('SELECT * FROM boards WHERE id = ?', [boardId]);

      expect(result?.id).toBe(boardId);
      expect(result?.name).toBe('Test Board');
    });

    it('should handle connection pooling', async () => {
      await dbConnection.initialize({ path: testDbPath });

      // Multiple operations should use the same connection
      const boardIds = await Promise.all(
        Array.from({ length: 10 }, async (_, i) => {
          const boardId = uuidv4();
          await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
            boardId,
            `Board ${String(i)}`,
            new Date().toISOString(),
          ]);
          return boardId;
        })
      );

      // Create columns for each board
      await Promise.all(
        boardIds.map(async boardId => {
          await dbConnection.execute(
            'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
            [uuidv4(), boardId, 'To Do', 0, new Date().toISOString()]
          );
        })
      );

      const boards = await dbConnection.query('SELECT COUNT(*) as count FROM boards');
      expect(boards[0].count).toBe(10);
    });

    it('should close connection properly', async () => {
      await dbConnection.initialize({ path: testDbPath });

      const boardId = uuidv4();
      await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
        boardId,
        'Test Board',
        new Date().toISOString(),
      ]);

      const columnId = uuidv4();
      await dbConnection.execute(
        'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
        [columnId, boardId, 'To Do', 0, new Date().toISOString()]
      );

      await dbConnection.close();

      // Attempting to use closed connection should fail
      await expect(dbConnection.query('SELECT * FROM boards')).rejects.toThrow();
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      await dbConnection.initialize({
        path: ':memory:',
        skipSchema: false,
      });
    });

    it('should handle parameterized queries', async () => {
      const boardId = uuidv4();
      const boardName = "Board's Name"; // Test SQL injection protection

      await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
        boardId,
        boardName,
        new Date().toISOString(),
      ]);

      const result = await dbConnection.queryOne('SELECT * FROM boards WHERE name = ?', [
        boardName,
      ]);

      expect(result?.id).toBe(boardId);
      expect(result?.name).toBe(boardName);
    });

    it('should handle NULL values correctly', async () => {
      const boardId = uuidv4();
      const columnId = uuidv4();
      const taskId = uuidv4();

      // Create board and column first
      await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
        boardId,
        'Test Board',
        new Date().toISOString(),
      ]);

      await dbConnection.execute(
        'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
        [columnId, boardId, 'To Do', 0, new Date().toISOString()]
      );

      await dbConnection.execute(
        `INSERT INTO tasks (id, title, description, board_id, column_id, status, position, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [taskId, 'Test Task', null, boardId, columnId, 'todo', 0, new Date().toISOString()]
      );

      const result = await dbConnection.queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);

      expect(result?.description).toBeNull();
    });

    it('should handle boolean values (SQLite 0/1)', async () => {
      const boardId = uuidv4();

      await dbConnection.execute(
        `INSERT INTO boards (id, name, archived, created_at) 
         VALUES (?, ?, ?, ?)`,
        [boardId, 'Archived Board', 1, new Date().toISOString()]
      );

      const result = await dbConnection.queryOne('SELECT * FROM boards WHERE id = ?', [boardId]);

      // SQLite stores booleans as 0/1
      expect(result?.archived).toBe(1);
    });
  });

  describe('Transactions', () => {
    beforeEach(async () => {
      await dbConnection.initialize({
        path: ':memory:',
        skipSchema: false,
      });
    });

    it('should commit successful transactions', async () => {
      const boardId = uuidv4();
      const columnId = uuidv4();
      const taskIds = [uuidv4(), uuidv4()];

      await dbConnection.transaction(async () => {
        // Create board
        await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
          boardId,
          'Transaction Board',
          new Date().toISOString(),
        ]);

        // Create column
        await dbConnection.execute(
          'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
          [columnId, boardId, 'To Do', 0, new Date().toISOString()]
        );

        // Create tasks
        // eslint-disable-next-line no-await-in-loop
        for (let i = 0; i < taskIds.length; i++) {
          // eslint-disable-next-line no-await-in-loop
          await dbConnection.execute(
            `INSERT INTO tasks (id, title, board_id, column_id, status, position, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              taskIds[i],
              `Task ${String(i)}`,
              boardId,
              columnId,
              'todo',
              i,
              new Date().toISOString(),
            ]
          );
        }
      });

      // Verify all data was committed
      const board = await dbConnection.queryOne('SELECT * FROM boards WHERE id = ?', [boardId]);
      expect(board).toBeDefined();

      const tasks = await dbConnection.query('SELECT * FROM tasks WHERE board_id = ?', [boardId]);
      expect(tasks).toHaveLength(2);
    });

    it('should rollback failed transactions', async () => {
      const boardId = uuidv4();

      try {
        await dbConnection.transaction(async () => {
          // Create board
          await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
            boardId,
            'Rollback Board',
            new Date().toISOString(),
          ]);

          // This should fail due to foreign key constraint (invalid board_id)
          await dbConnection.execute(
            `INSERT INTO tasks (id, title, board_id, column_id, status, position, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(),
              'Test Task',
              'invalid-board-id',
              uuidv4(),
              'todo',
              0,
              new Date().toISOString(),
            ]
          );
        });
      } catch (error) {
        // Expected to fail
      }

      // Verify board was not created due to rollback
      const board = await dbConnection.queryOne('SELECT * FROM boards WHERE id = ?', [boardId]);
      expect(board).toBeUndefined();
    });

    it('should handle sequential transactions', async () => {
      const boardId = uuidv4();
      const columnId = uuidv4();

      // First transaction
      await dbConnection.transaction(async () => {
        await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
          boardId,
          'Sequential Transaction Board',
          new Date().toISOString(),
        ]);
      });

      // Second transaction
      await dbConnection.transaction(async () => {
        await dbConnection.execute(
          'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
          [columnId, boardId, 'Test Column', 0, new Date().toISOString()]
        );
      });

      // Verify both were created
      const board = await dbConnection.queryOne('SELECT * FROM boards WHERE id = ?', [boardId]);
      const column = await dbConnection.queryOne('SELECT * FROM columns WHERE id = ?', [columnId]);

      expect(board).toBeDefined();
      expect(column).toBeDefined();
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      await dbConnection.initialize({
        path: ':memory:',
        skipSchema: false,
      });
    });

    it('should handle bulk inserts efficiently', async () => {
      const startTime = Date.now();
      const recordCount = 1000;

      await dbConnection.transaction(async () => {
        // eslint-disable-next-line no-await-in-loop
        for (let i = 0; i < recordCount; i++) {
          // eslint-disable-next-line no-await-in-loop
          await dbConnection.execute('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', [
            uuidv4(),
            `Tag ${i}`,
            new Date().toISOString(),
          ]);
        }
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 5 seconds for 1000 records)
      expect(duration).toBeLessThan(5000);

      const count = await dbConnection.queryOne('SELECT COUNT(*) as count FROM tags');
      expect(count?.count).toBe(recordCount);
    });

    it('should use indexes efficiently', async () => {
      // Insert test data
      const boardId = uuidv4();
      const columnId = uuidv4();

      // Create board and column first
      await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
        boardId,
        'Performance Test Board',
        new Date().toISOString(),
      ]);

      await dbConnection.execute(
        'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
        [columnId, boardId, 'To Do', 0, new Date().toISOString()]
      );

      // eslint-disable-next-line no-await-in-loop
      for (let i = 0; i < 100; i++) {
        // eslint-disable-next-line no-await-in-loop
        await dbConnection.execute(
          `INSERT INTO tasks (id, title, board_id, column_id, status, position, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            `Task ${i}`,
            boardId,
            columnId,
            i % 2 === 0 ? 'todo' : 'done',
            i,
            new Date().toISOString(),
          ]
        );
      }

      // Query using indexed columns should be fast
      const startTime = Date.now();

      const tasks = await dbConnection.query(
        'SELECT * FROM tasks WHERE board_id = ? AND status = ?',
        [boardId, 'todo']
      );

      const duration = Date.now() - startTime;

      expect(tasks).toHaveLength(50);
      expect(duration).toBeLessThan(100); // Should be very fast with indexes
    });
  });

  describe('Schema Validation', () => {
    beforeEach(async () => {
      await dbConnection.initialize({
        path: ':memory:',
        skipSchema: false,
      });
    });

    it('should enforce foreign key constraints', async () => {
      const invalidBoardId = uuidv4();
      const invalidColumnId = uuidv4();

      await expect(
        dbConnection.execute(
          `INSERT INTO tasks (id, title, board_id, column_id, status, position, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            'Orphan Task',
            invalidBoardId,
            invalidColumnId,
            'todo',
            0,
            new Date().toISOString(),
          ]
        )
      ).rejects.toThrow();
    });

    it('should enforce unique constraints', async () => {
      const boardId = uuidv4();

      await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
        boardId,
        'Unique Board',
        new Date().toISOString(),
      ]);

      // Try to insert duplicate ID
      await expect(
        dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
          boardId,
          'Duplicate Board',
          new Date().toISOString(),
        ])
      ).rejects.toThrow();
    });

    it('should handle cascade deletes', async () => {
      const boardId = uuidv4();
      const columnId = uuidv4();
      const taskId = uuidv4();

      // Create board, column and task
      await dbConnection.execute('INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)', [
        boardId,
        'Cascade Test Board',
        new Date().toISOString(),
      ]);

      await dbConnection.execute(
        'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
        [columnId, boardId, 'To Do', 0, new Date().toISOString()]
      );

      await dbConnection.execute(
        `INSERT INTO tasks (id, title, board_id, column_id, status, position, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [taskId, 'Cascade Test Task', boardId, columnId, 'todo', 0, new Date().toISOString()]
      );

      // Delete board should cascade to tasks
      await dbConnection.execute('DELETE FROM boards WHERE id = ?', [boardId]);

      const task = await dbConnection.queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
      expect(task).toBeUndefined();
    });
  });
});
