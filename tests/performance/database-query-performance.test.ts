/**
 * @fileoverview Database query performance testing (< 50ms for simple queries)
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Query performance benchmarking, SQL timing analysis, performance thresholds
 * Main APIs: Database connection, SQL queries, performance measurement
 * Constraints: < 50ms for simple queries, < 200ms for complex queries
 * Patterns: Performance testing, SQL optimization, timing validation
 */

import { performance } from 'perf_hooks';
import { DatabaseConnection } from '@/database/connection';
import { TaskService } from '@/services/TaskService';
import { BoardService } from '@/services/BoardService';

interface QueryResult {
  query: string;
  duration: number;
  threshold: number;
  passed: boolean;
  rowCount?: number;
  type: 'simple' | 'complex' | 'join';
}

describe('Database Query Performance Testing', () => {
  let connection: DatabaseConnection;
  let taskService: TaskService;
  let boardService: BoardService;

  const SIMPLE_QUERY_THRESHOLD_MS = 50;
  const COMPLEX_QUERY_THRESHOLD_MS = 200;
  const JOIN_QUERY_THRESHOLD_MS = 150;

  beforeAll(async () => {
    connection = DatabaseConnection.getInstance();
    await connection.initialize({ skipSchema: false });

    taskService = new TaskService(connection);
    boardService = new BoardService(connection);

    // Create test data for performance testing
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await connection.close();
  });

  /**
   * Sets up test data for performance testing
   */
  const setupTestData = async (): Promise<void> => {
    // Create test boards
    for (let i = 1; i <= 5; i++) {
      await connection.execute(
        `INSERT OR REPLACE INTO boards (id, name, description, color, created_at, updated_at) 
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [`perf-board-${i}`, `Performance Test Board ${i}`, `Test board ${i}`, '#2196F3']
      );

      // Create columns for each board
      const columns = ['Todo', 'In Progress', 'Done'];
      for (const [index, columnName] of columns.entries()) {
        await connection.execute(
          `INSERT OR REPLACE INTO columns (id, board_id, name, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [`perf-col-${i}-${index}`, `perf-board-${i}`, columnName, index]
        );
      }
    }

    // Create test tasks (100 tasks across boards)
    for (let i = 1; i <= 100; i++) {
      const boardId = `perf-board-${(i % 5) + 1}`;
      const columnId = `perf-col-${(i % 5) + 1}-${i % 3}`; // Map to existing columns
      const status = ['todo', 'in_progress', 'done'][i % 3];

      await connection.execute(
        `INSERT OR REPLACE INTO tasks (id, board_id, column_id, title, description, status, priority, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          `perf-task-${i}`,
          boardId,
          columnId,
          `Performance Test Task ${i}`,
          `Description for performance test task ${i}`,
          status,
          (i % 5) + 1,
          i, // position within column
        ]
      );
    }

    // Create test notes
    for (let i = 1; i <= 50; i++) {
      const taskId = `perf-task-${i}`;
      await connection.execute(
        `INSERT OR REPLACE INTO notes (id, task_id, content, category, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [`perf-note-${i}`, taskId, `Performance test note content ${i}`, 'general']
      );
    }
  };

  /**
   * Cleans up test data
   */
  const cleanupTestData = async (): Promise<void> => {
    await connection.execute(`DELETE FROM notes WHERE id LIKE 'perf-note-%'`);
    await connection.execute(`DELETE FROM tasks WHERE id LIKE 'perf-task-%'`);
    await connection.execute(`DELETE FROM columns WHERE id LIKE 'perf-col-%'`);
    await connection.execute(`DELETE FROM boards WHERE id LIKE 'perf-board-%'`);
  };

  /**
   * Measures query execution time
   */
  const measureQuery = async (
    query: string,
    params: unknown[] = [],
    threshold: number = SIMPLE_QUERY_THRESHOLD_MS,
    type: 'simple' | 'complex' | 'join' = 'simple'
  ): Promise<QueryResult> => {
    const start = performance.now();

    try {
      const result = await connection.execute(query, params);
      const end = performance.now();
      const duration = end - start;

      return {
        query: `${query.replace(/\s+/g, ' ').trim().substring(0, 100)}...`,
        duration,
        threshold,
        passed: duration < threshold,
        rowCount: Array.isArray(result) ? result.length : 1,
        type,
      };
    } catch (error) {
      const end = performance.now();
      const duration = end - start;

      return {
        query: `${query.replace(/\s+/g, ' ').trim().substring(0, 100)}...`,
        duration,
        threshold,
        passed: false,
        type,
      };
    }
  };

  /**
   * Logs query performance results
   */
  const logQueryResult = (result: QueryResult): void => {
    const status = result.passed ? '✅' : '❌';
    const duration = `${result.duration.toFixed(2)}ms`;
    const threshold = `(< ${result.threshold}ms)`;
    const rows = result.rowCount ? ` [${result.rowCount} rows]` : '';

    console.log(`${status} ${result.type.toUpperCase()}: ${duration} ${threshold}${rows}`);
    console.log(`   Query: ${result.query}`);
  };

  describe('Simple Query Performance (< 50ms)', () => {
    test('SELECT single row by ID should complete under 50ms', async () => {
      const result = await measureQuery(
        'SELECT * FROM boards WHERE id = ?',
        ['perf-board-1'],
        SIMPLE_QUERY_THRESHOLD_MS,
        'simple'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(SIMPLE_QUERY_THRESHOLD_MS);
    });

    test('COUNT query should complete under 50ms', async () => {
      const result = await measureQuery(
        'SELECT COUNT(*) as count FROM tasks',
        [],
        SIMPLE_QUERY_THRESHOLD_MS,
        'simple'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(SIMPLE_QUERY_THRESHOLD_MS);
    });

    test('Simple INSERT should complete under 50ms', async () => {
      const result = await measureQuery(
        `INSERT INTO boards (id, name, description, color, created_at, updated_at) 
         VALUES ('perf-test-board', 'Test Board', 'Test Description', '#FF0000', datetime('now'), datetime('now'))`,
        [],
        SIMPLE_QUERY_THRESHOLD_MS,
        'simple'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(SIMPLE_QUERY_THRESHOLD_MS);

      // Cleanup
      await connection.execute('DELETE FROM boards WHERE id = ?', ['perf-test-board']);
    });

    test('Simple UPDATE should complete under 50ms', async () => {
      const result = await measureQuery(
        'UPDATE tasks SET title = ? WHERE id = ?',
        ['Updated Performance Test Task', 'perf-task-1'],
        SIMPLE_QUERY_THRESHOLD_MS,
        'simple'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(SIMPLE_QUERY_THRESHOLD_MS);
    });

    test('Simple DELETE should complete under 50ms', async () => {
      // Create temporary record for deletion test
      await connection.execute(
        `INSERT INTO tasks (id, board_id, title, description, status, created_at, updated_at)
         VALUES ('temp-delete-task', 'perf-board-1', 'Temp Task', 'For deletion test', 'todo', datetime('now'), datetime('now'))`
      );

      const result = await measureQuery(
        'DELETE FROM tasks WHERE id = ?',
        ['temp-delete-task'],
        SIMPLE_QUERY_THRESHOLD_MS,
        'simple'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(SIMPLE_QUERY_THRESHOLD_MS);
    });

    test('Indexed lookup should complete under 50ms', async () => {
      const result = await measureQuery(
        'SELECT * FROM tasks WHERE board_id = ? LIMIT 10',
        ['perf-board-1'],
        SIMPLE_QUERY_THRESHOLD_MS,
        'simple'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(SIMPLE_QUERY_THRESHOLD_MS);
    });

    test('Status filter query should complete under 50ms', async () => {
      const result = await measureQuery(
        'SELECT * FROM tasks WHERE status = ? LIMIT 10',
        ['todo'],
        SIMPLE_QUERY_THRESHOLD_MS,
        'simple'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(SIMPLE_QUERY_THRESHOLD_MS);
    });
  });

  describe('Join Query Performance (< 150ms)', () => {
    test('Board with tasks join should complete under 150ms', async () => {
      const result = await measureQuery(
        `SELECT b.*, COUNT(t.id) as task_count 
         FROM boards b 
         LEFT JOIN tasks t ON b.id = t.board_id 
         WHERE b.id = ? 
         GROUP BY b.id`,
        ['perf-board-1'],
        JOIN_QUERY_THRESHOLD_MS,
        'join'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(JOIN_QUERY_THRESHOLD_MS);
    });

    test('Tasks with notes join should complete under 150ms', async () => {
      const result = await measureQuery(
        `SELECT t.*, COUNT(n.id) as note_count 
         FROM tasks t 
         LEFT JOIN notes n ON t.id = n.task_id 
         WHERE t.board_id = ? 
         GROUP BY t.id 
         LIMIT 20`,
        ['perf-board-1'],
        JOIN_QUERY_THRESHOLD_MS,
        'join'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(JOIN_QUERY_THRESHOLD_MS);
    });

    test('Board statistics query should complete under 150ms', async () => {
      const result = await measureQuery(
        `SELECT 
           b.id,
           b.name,
           COUNT(t.id) as total_tasks,
           COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks,
           COUNT(CASE WHEN t.status = 'todo' THEN 1 END) as todo_tasks
         FROM boards b
         LEFT JOIN tasks t ON b.id = t.board_id
         WHERE b.id LIKE 'perf-board-%'
         GROUP BY b.id, b.name`,
        [],
        JOIN_QUERY_THRESHOLD_MS,
        'join'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(JOIN_QUERY_THRESHOLD_MS);
    });

    test('Complex task search with joins should complete under 150ms', async () => {
      const result = await measureQuery(
        `SELECT DISTINCT t.*, b.name as board_name
         FROM tasks t
         JOIN boards b ON t.board_id = b.id
         LEFT JOIN notes n ON t.id = n.task_id
         WHERE (t.title LIKE ? OR t.description LIKE ? OR n.content LIKE ?)
         ORDER BY t.created_at DESC
         LIMIT 10`,
        ['%Performance%', '%Performance%', '%Performance%'],
        JOIN_QUERY_THRESHOLD_MS,
        'join'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(JOIN_QUERY_THRESHOLD_MS);
    });
  });

  describe('Complex Query Performance (< 200ms)', () => {
    test('Full-text search should complete under 200ms', async () => {
      // First ensure FTS table is populated
      await connection.execute(
        'INSERT INTO tasks_fts SELECT id, title, description FROM tasks WHERE id LIKE "perf-task-%"'
      );

      const result = await measureQuery(
        `SELECT t.* FROM tasks t
         JOIN tasks_fts fts ON t.id = fts.id
         WHERE tasks_fts MATCH ?
         ORDER BY rank
         LIMIT 10`,
        ['Performance'],
        COMPLEX_QUERY_THRESHOLD_MS,
        'complex'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(COMPLEX_QUERY_THRESHOLD_MS);
    });

    test('Aggregation query with multiple conditions should complete under 200ms', async () => {
      const result = await measureQuery(
        `SELECT 
           status,
           priority,
           COUNT(*) as count,
           AVG(priority) as avg_priority,
           MIN(created_at) as earliest,
           MAX(created_at) as latest
         FROM tasks 
         WHERE board_id LIKE 'perf-board-%'
         GROUP BY status, priority
         HAVING count > 1
         ORDER BY status, priority`,
        [],
        COMPLEX_QUERY_THRESHOLD_MS,
        'complex'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(COMPLEX_QUERY_THRESHOLD_MS);
    });

    test('Subquery with EXISTS should complete under 200ms', async () => {
      const result = await measureQuery(
        `SELECT b.* 
         FROM boards b 
         WHERE EXISTS (
           SELECT 1 FROM tasks t 
           WHERE t.board_id = b.id 
           AND t.status = 'done'
         )
         AND EXISTS (
           SELECT 1 FROM tasks t2 
           WHERE t2.board_id = b.id 
           AND t2.status = 'todo'
         )`,
        [],
        COMPLEX_QUERY_THRESHOLD_MS,
        'complex'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(COMPLEX_QUERY_THRESHOLD_MS);
    });

    test('Window function query should complete under 200ms', async () => {
      const result = await measureQuery(
        `SELECT 
           t.*,
           ROW_NUMBER() OVER (PARTITION BY t.board_id ORDER BY t.priority DESC, t.created_at) as priority_rank,
           COUNT(*) OVER (PARTITION BY t.board_id) as board_task_count
         FROM tasks t
         WHERE t.board_id LIKE 'perf-board-%'
         ORDER BY t.board_id, priority_rank
         LIMIT 50`,
        [],
        COMPLEX_QUERY_THRESHOLD_MS,
        'complex'
      );

      logQueryResult(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(COMPLEX_QUERY_THRESHOLD_MS);
    });
  });

  describe('Bulk Operation Performance', () => {
    test('Bulk INSERT should complete under 200ms', async () => {
      const insertPromises = [];
      for (let i = 1; i <= 20; i++) {
        insertPromises.push(
          connection.execute(
            `INSERT INTO tasks (id, board_id, column_id, title, description, status, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [
              `bulk-task-${i}`,
              'perf-board-1',
              'perf-col-1-0', // Todo column
              `Bulk Task ${i}`,
              `Bulk task description ${i}`,
              'todo',
              i + 1000, // position
            ]
          )
        );
      }

      const start = performance.now();
      await Promise.all(insertPromises);
      const end = performance.now();
      const duration = end - start;

      console.log(`✅ BULK INSERT: ${duration.toFixed(2)}ms (< 200ms) [20 tasks]`);

      expect(duration).toBeLessThan(COMPLEX_QUERY_THRESHOLD_MS);

      // Cleanup
      await connection.execute(`DELETE FROM tasks WHERE id LIKE 'bulk-task-%'`);
    });

    test('Bulk UPDATE should complete under 200ms', async () => {
      const start = performance.now();

      await connection.execute(
        `UPDATE tasks 
         SET description = 'Bulk updated description: ' || description,
             updated_at = datetime('now')
         WHERE id LIKE 'perf-task-%' 
         AND status = 'todo'`
      );

      const end = performance.now();
      const duration = end - start;

      console.log(`✅ BULK UPDATE: ${duration.toFixed(2)}ms (< 200ms)`);

      expect(duration).toBeLessThan(COMPLEX_QUERY_THRESHOLD_MS);
    });

    test('Transaction with multiple operations should complete under 200ms', async () => {
      const start = performance.now();

      await connection.transaction(async () => {
        await connection.execute(
          `INSERT INTO boards (id, name, description, color, created_at, updated_at)
           VALUES ('transaction-board', 'Transaction Test', 'Test Description', '#00FF00', datetime('now'), datetime('now'))`
        );

        // First create a column for the transaction board
        await connection.execute(
          `INSERT INTO columns (id, board_id, name, position, created_at, updated_at)
           VALUES ('transaction-col', 'transaction-board', 'Todo', 0, datetime('now'), datetime('now'))`
        );

        await connection.execute(
          `INSERT INTO tasks (id, board_id, column_id, title, description, status, position, created_at, updated_at)
           VALUES ('transaction-task', 'transaction-board', 'transaction-col', 'Transaction Task', 'Task Description', 'todo', 1, datetime('now'), datetime('now'))`
        );

        await connection.execute(
          `UPDATE boards SET description = 'Updated in transaction' WHERE id = 'transaction-board'`
        );
      });

      const end = performance.now();
      const duration = end - start;

      console.log(`✅ TRANSACTION: ${duration.toFixed(2)}ms (< 200ms)`);

      expect(duration).toBeLessThan(COMPLEX_QUERY_THRESHOLD_MS);

      // Cleanup
      await connection.execute('DELETE FROM tasks WHERE id = ?', ['transaction-task']);
      await connection.execute('DELETE FROM columns WHERE id = ?', ['transaction-col']);
      await connection.execute('DELETE FROM boards WHERE id = ?', ['transaction-board']);
    });
  });

  describe('Performance Under Load', () => {
    test('concurrent simple queries should maintain performance', async () => {
      const queries = Array.from({ length: 10 }, async (_, i) =>
        measureQuery(
          'SELECT * FROM tasks WHERE board_id = ? LIMIT 5',
          [`perf-board-${(i % 5) + 1}`],
          SIMPLE_QUERY_THRESHOLD_MS,
          'simple'
        )
      );

      const results = await Promise.all(queries);

      results.forEach((result, index) => {
        console.log(`Concurrent Query ${index + 1}: ${result.duration.toFixed(2)}ms`);
        expect(result.passed).toBe(true);
        expect(result.duration).toBeLessThan(SIMPLE_QUERY_THRESHOLD_MS);
      });

      const averageTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      console.log(`Average concurrent query time: ${averageTime.toFixed(2)}ms`);
      expect(averageTime).toBeLessThan(SIMPLE_QUERY_THRESHOLD_MS * 0.8);
    }, 10000);

    test('query performance should not degrade with multiple executions', async () => {
      const iterations = 20;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const result = await measureQuery(
          'SELECT COUNT(*) FROM tasks WHERE status = ?',
          ['todo'],
          SIMPLE_QUERY_THRESHOLD_MS,
          'simple'
        );

        durations.push(result.duration);
        expect(result.passed).toBe(true);
      }

      const firstHalf = durations.slice(0, 10);
      const secondHalf = durations.slice(10);

      const firstAvg = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b) / secondHalf.length;

      console.log(`First 10 queries average: ${firstAvg.toFixed(2)}ms`);
      console.log(`Last 10 queries average: ${secondAvg.toFixed(2)}ms`);

      // Performance should not degrade by more than 50%
      expect(secondAvg).toBeLessThan(firstAvg * 1.5);
    }, 15000);
  });
});
