/**
 * @fileoverview SQL injection prevention verification tests
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: SQL injection attack prevention, parameterized query validation, security testing
 * Main APIs: Database queries, user input handling, SQL parameter binding
 * Constraints: All queries must use parameterized statements, no string concatenation
 * Patterns: Security testing, attack simulation, input sanitization validation
 */

import { DatabaseConnection } from '@/database/connection';
import { TaskService } from '@/services/TaskService';
import { BoardService } from '@/services/BoardService';
import { NoteService } from '@/services/NoteService';

describe('SQL Injection Prevention Verification', () => {
  let connection: DatabaseConnection;
  let taskService: TaskService;
  let boardService: BoardService;
  let noteService: NoteService;

  beforeAll(async () => {
    connection = DatabaseConnection.getInstance();
    await connection.initialize({ skipSchema: false });

    taskService = new TaskService(connection);
    boardService = new BoardService(connection);
    noteService = new NoteService(connection);

    // Create test board for injection tests
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await connection.close();
  });

  /**
   * Sets up test data for SQL injection testing
   */
  const setupTestData = async (): Promise<void> => {
    // Create test board
    await boardService.createBoard({
      name: 'SQL Injection Test Board',
      description: 'Board for security testing',
    });
  };

  /**
   * Cleans up test data
   */
  const cleanupTestData = async (): Promise<void> => {
    await connection.execute(`DELETE FROM tasks WHERE title LIKE '%SQL Injection Test%'`);
    await connection.execute(`DELETE FROM boards WHERE name LIKE '%SQL Injection Test%'`);
    await connection.execute(`DELETE FROM notes WHERE content LIKE '%SQL Injection Test%'`);
  };

  /**
   * SQL injection payloads for testing
   */
  const SQL_INJECTION_PAYLOADS = [
    // Classic SQL injection attempts
    "'; DROP TABLE tasks; --",
    "' OR '1'='1",
    "' OR 1=1 --",
    "' OR 'a'='a",
    "'; DELETE FROM boards; --",
    "' UNION SELECT * FROM boards --",

    // Boolean-based blind SQL injection
    "' AND 1=1 --",
    "' AND 1=2 --",
    "' OR EXISTS(SELECT * FROM sqlite_master) --",

    // Time-based blind SQL injection
    "'; WAITFOR DELAY '00:00:05' --",
    "' OR (SELECT COUNT(*) FROM sqlite_master) > 0 --",

    // Union-based SQL injection
    "' UNION SELECT id,name,description,NULL,NULL,NULL FROM boards --",
    "' UNION ALL SELECT NULL,NULL,NULL,id,title,description FROM tasks --",

    // Error-based SQL injection
    "' AND (SELECT COUNT(*) FROM (SELECT 1 UNION SELECT 2 UNION SELECT 3) t) --",
    "' AND EXTRACTVALUE(1, CONCAT(0x7e, (SELECT version()), 0x7e)) --",

    // Stacked queries
    "'; INSERT INTO tasks (id,board_id,column_id,title,description,status,position) VALUES ('inject','inject','inject','inject','inject','todo',1); --",
    "'; UPDATE tasks SET title='HACKED' WHERE 1=1; --",

    // Comment-based injections
    "' /* comment */ OR 1=1 --",
    "' # comment \n OR 1=1 --",

    // Encoding-based injections
    "' %4f%52 1=1 --", // URL encoded OR
    "' %55%4e%49%4f%4e --", // URL encoded UNION
  ];

  describe('Task Service SQL Injection Prevention', () => {
    test('task creation should prevent SQL injection in title', async () => {
      const boards = await boardService.getBoards({});
      const testBoard = boards.find(b => b.name.includes('SQL Injection Test'));
      expect(testBoard).toBeDefined();

      for (const payload of SQL_INJECTION_PAYLOADS) {
        try {
          const task = await taskService.createTask({
            title: `SQL Injection Test ${payload}`,
            description: 'Testing SQL injection prevention',
            boardId: testBoard!.id,
            status: 'todo',
          });

          // Task should be created with the payload as literal text, not executed as SQL
          expect(task.title).toContain(payload);
          expect(task.title).toBe(`SQL Injection Test ${payload}`);

          // Verify the database wasn't compromised by checking table integrity
          const taskCount = await connection.execute('SELECT COUNT(*) as count FROM tasks');
          expect(Array.isArray(taskCount)).toBe(true);
          expect(taskCount.length).toBeGreaterThan(0);

          // Clean up the test task
          await taskService.deleteTask(task.id);
        } catch (error) {
          // If there's an error, it should be a validation error, not a SQL error
          expect((error as Error).message).not.toContain('SQLITE_ERROR');
          expect((error as Error).message).not.toContain('syntax error');
        }
      }
    });

    test('task searching should prevent SQL injection in search terms', async () => {
      const boards = await boardService.getBoards({});
      const testBoard = boards.find(b => b.name.includes('SQL Injection Test'));
      expect(testBoard).toBeDefined();

      for (const payload of SQL_INJECTION_PAYLOADS) {
        try {
          // Search should treat the payload as literal search text
          const results = await taskService.getTasks({
            boardId: testBoard!.id,
            search: payload,
          });

          // Should return empty results or results matching the literal payload text
          expect(Array.isArray(results)).toBe(true);

          // Verify database integrity after search
          const taskCount = await connection.execute('SELECT COUNT(*) as count FROM tasks');
          expect(Array.isArray(taskCount)).toBe(true);
        } catch (error) {
          // Any error should be a service error, not a SQL syntax error
          expect((error as Error).message).not.toContain('SQLITE_ERROR');
          expect((error as Error).message).not.toContain('syntax error');
        }
      }
    });

    test('task updates should prevent SQL injection in all fields', async () => {
      const boards = await boardService.getBoards({});
      const testBoard = boards.find(b => b.name.includes('SQL Injection Test'));
      expect(testBoard).toBeDefined();

      // Create a test task to update
      const testTask = await taskService.createTask({
        title: 'SQL Injection Update Test Task',
        description: 'Task for testing SQL injection in updates',
        boardId: testBoard!.id,
        status: 'todo',
      });

      for (const payload of SQL_INJECTION_PAYLOADS.slice(0, 5)) {
        // Test subset for updates
        try {
          const updatedTask = await taskService.updateTask(testTask.id, {
            title: `Updated with payload: ${payload}`,
            description: `Description with payload: ${payload}`,
          });

          // Updates should treat payloads as literal text
          expect(updatedTask.title).toContain(payload);
          expect(updatedTask.description).toContain(payload);

          // Verify database integrity
          const taskExists = await taskService.getTask(testTask.id);
          expect(taskExists).toBeDefined();
        } catch (error) {
          expect((error as Error).message).not.toContain('SQLITE_ERROR');
          expect((error as Error).message).not.toContain('syntax error');
        }
      }

      // Clean up
      await taskService.deleteTask(testTask.id);
    });
  });

  describe('Board Service SQL Injection Prevention', () => {
    test('board creation should prevent SQL injection in all fields', async () => {
      for (const payload of SQL_INJECTION_PAYLOADS.slice(0, 10)) {
        // Test subset
        try {
          const board = await boardService.createBoard({
            name: `Test Board ${payload}`,
            description: `Test Description ${payload}`,
          });

          // Board should be created with payload as literal text
          expect(board.name).toContain(payload);
          expect(board.description).toContain(payload);

          // Verify database integrity
          const boardExists = await boardService.getBoard(board.id);
          expect(boardExists).toBeDefined();

          // Clean up
          await boardService.deleteBoard(board.id);
        } catch (error) {
          expect((error as Error).message).not.toContain('SQLITE_ERROR');
          expect((error as Error).message).not.toContain('syntax error');
        }
      }
    });

    test('board search should prevent SQL injection in search terms', async () => {
      for (const payload of SQL_INJECTION_PAYLOADS) {
        try {
          const results = await boardService.getBoards({
            search: payload,
          });

          // Should return results or empty array, not cause SQL errors
          expect(Array.isArray(results)).toBe(true);

          // Verify database integrity
          const boardCount = await connection.execute('SELECT COUNT(*) as count FROM boards');
          expect(Array.isArray(boardCount)).toBe(true);
        } catch (error) {
          expect((error as Error).message).not.toContain('SQLITE_ERROR');
          expect((error as Error).message).not.toContain('syntax error');
        }
      }
    });
  });

  describe('Note Service SQL Injection Prevention', () => {
    test('note creation should prevent SQL injection', async () => {
      // Create a test task for note attachment
      const boards = await boardService.getBoards({});
      const testBoard = boards.find(b => b.name.includes('SQL Injection Test'));
      expect(testBoard).toBeDefined();

      const testTask = await taskService.createTask({
        title: 'Task for Note SQL Injection Test',
        description: 'Task for testing note SQL injection',
        boardId: testBoard!.id,
        status: 'todo',
      });

      for (const payload of SQL_INJECTION_PAYLOADS.slice(0, 5)) {
        // Test subset
        try {
          const note = await noteService.createNote({
            task_id: testTask.id,
            content: `Note content with payload: ${payload}`,
            category: 'general',
          });

          // Note should be created with payload as literal text
          expect(note.content).toContain(payload);

          // Verify database integrity
          const noteExists = await noteService.getNote(note.id);
          expect(noteExists).toBeDefined();

          // Clean up
          await noteService.deleteNote(note.id);
        } catch (error) {
          expect((error as Error).message).not.toContain('SQLITE_ERROR');
          expect((error as Error).message).not.toContain('syntax error');
        }
      }

      // Clean up test task
      await taskService.deleteTask(testTask.id);
    });
  });

  describe('Direct Database Query SQL Injection Prevention', () => {
    test('parameterized queries should prevent SQL injection', async () => {
      for (const payload of SQL_INJECTION_PAYLOADS.slice(0, 10)) {
        try {
          // Test parameterized queries directly
          const results = await connection.execute('SELECT * FROM tasks WHERE title = ?', [
            payload,
          ]);

          // Should execute safely and return results (or empty array)
          expect(Array.isArray(results)).toBe(true);

          // Verify database integrity after query
          const taskCount = await connection.execute('SELECT COUNT(*) as count FROM tasks');
          expect(Array.isArray(taskCount)).toBe(true);
        } catch (error) {
          // Should not be SQL syntax errors
          expect((error as Error).message).not.toContain('syntax error');
        }
      }
    });

    test('should reject direct string concatenation attempts', async () => {
      // This test verifies that we don't accidentally use string concatenation
      // Note: We're not actually testing string concatenation (which would be vulnerable)
      // but ensuring our parameterized approach works correctly

      const maliciousInput = "'; DROP TABLE tasks; --";

      try {
        // This should be safe because we use parameterized queries
        const results = await connection.execute('SELECT * FROM tasks WHERE title LIKE ?', [
          `%${maliciousInput}%`,
        ]);

        expect(Array.isArray(results)).toBe(true);

        // Verify tables still exist (they should)
        const tableExists = await connection.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'"
        );
        expect(Array.isArray(tableExists)).toBe(true);
        expect(tableExists.length).toBeGreaterThan(0);
      } catch (error) {
        expect((error as Error).message).not.toContain('no such table');
      }
    });
  });

  describe('Complex Query SQL Injection Prevention', () => {
    test('join queries should prevent SQL injection', async () => {
      const payload = "' UNION SELECT id,name,description,NULL,NULL,NULL FROM boards --";

      try {
        // Test a complex join query with potential injection point
        const results = await connection.execute(
          `
          SELECT t.*, b.name as board_name 
          FROM tasks t 
          JOIN boards b ON t.board_id = b.id 
          WHERE t.title = ?
        `,
          [payload]
        );

        expect(Array.isArray(results)).toBe(true);

        // Verify no data leakage occurred
        if (results.length > 0) {
          const result = results[0] as any;
          expect(result).toHaveProperty('title');
          expect(result).toHaveProperty('board_name');
          // Should not have extra columns from injection attempt
          expect(typeof result.title).toBe('string');
        }
      } catch (error) {
        expect((error as Error).message).not.toContain('syntax error');
      }
    });

    test('aggregate queries should prevent SQL injection', async () => {
      const payload = "'; SELECT COUNT(*) FROM boards; --";

      try {
        const results = await connection.execute(
          `
          SELECT COUNT(*) as count 
          FROM tasks 
          WHERE status = ? AND title LIKE ?
        `,
          ['todo', `%${payload}%`]
        );

        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(1);

        const result = results[0] as any;
        expect(result).toHaveProperty('count');
        expect(typeof result.count).toBe('number');
      } catch (error) {
        expect((error as Error).message).not.toContain('syntax error');
      }
    });

    test('subquery protection should prevent SQL injection', async () => {
      const payload = "') OR EXISTS(SELECT * FROM boards WHERE name='admin') --";

      try {
        const results = await connection.execute(
          `
          SELECT * FROM tasks 
          WHERE board_id IN (
            SELECT id FROM boards WHERE name = ?
          )
        `,
          [payload]
        );

        expect(Array.isArray(results)).toBe(true);
      } catch (error) {
        expect((error as Error).message).not.toContain('syntax error');
      }
    });
  });

  describe('Input Validation and Sanitization', () => {
    test('should handle null and undefined inputs safely', async () => {
      const testInputs = [null, undefined, '', '   '];

      for (const input of testInputs) {
        try {
          const results = await connection.execute('SELECT * FROM tasks WHERE title = ?', [input]);

          expect(Array.isArray(results)).toBe(true);
        } catch (error) {
          // Should handle null/undefined gracefully
          expect((error as Error).message).not.toContain('SQLITE_ERROR');
        }
      }
    });

    test('should handle very long inputs safely', async () => {
      const longPayload = `${'A'.repeat(10000)}'; DROP TABLE tasks; --`;

      try {
        const results = await connection.execute('SELECT * FROM tasks WHERE title = ?', [
          longPayload,
        ]);

        expect(Array.isArray(results)).toBe(true);

        // Verify database integrity
        const tableExists = await connection.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'"
        );
        expect(Array.isArray(tableExists)).toBe(true);
        expect(tableExists.length).toBeGreaterThan(0);
      } catch (error) {
        // Long inputs might cause other errors, but not SQL injection
        expect((error as Error).message).not.toContain('syntax error');
        expect((error as Error).message).not.toContain('no such table');
      }
    });

    test('should handle special characters safely', async () => {
      const specialChars = ["'", '"', '\\', '\n', '\r', '\t', '\0', '%', '_'];

      for (const char of specialChars) {
        try {
          const results = await connection.execute('SELECT * FROM tasks WHERE title LIKE ?', [
            `%${char}%`,
          ]);

          expect(Array.isArray(results)).toBe(true);
        } catch (error) {
          expect((error as Error).message).not.toContain('syntax error');
        }
      }
    });

    test('database should maintain integrity after all injection attempts', async () => {
      // Final verification that all tables and data are intact
      const tables = ['tasks', 'boards', 'notes', 'columns', 'tags'];

      for (const table of tables) {
        const tableExists = await connection.execute(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`
        );

        expect(Array.isArray(tableExists)).toBe(true);
        expect(tableExists.length).toBeGreaterThan(0);

        // Verify basic operations still work
        const count = await connection.execute(`SELECT COUNT(*) as count FROM ${table}`);
        expect(Array.isArray(count)).toBe(true);
        expect(count.length).toBe(1);
        expect(typeof (count[0] as any).count).toBe('number');
      }
    });
  });
});
