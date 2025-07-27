/**
 * Database Performance Testing Suite
 *
 * Tests database operations under load to identify performance bottlenecks,
 * optimize queries, and ensure efficient data access patterns.
 */

import { dbConnection } from '../../src/database/connection';
import { TaskService } from '../../src/services/TaskService';
import { BoardService } from '../../src/services/BoardService';
import { NoteService } from '../../src/services/NoteService';
import { TagService } from '../../src/services/TagService';
import { v4 as uuidv4 } from 'uuid';
import type { Task, Board } from '../../src/types';

describe('Database Performance Tests', () => {
  let taskService: TaskService;
  let boardService: BoardService;
  let noteService: NoteService;
  let tagService: TagService;
  let testBoard: Board;
  let testColumnId: string;

  beforeAll(async () => {
    // Initialize database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Initialize services
    taskService = new TaskService(dbConnection);
    boardService = new BoardService(dbConnection);
    noteService = new NoteService(dbConnection);
    tagService = new TagService(dbConnection);

    // Create test board and column
    testBoard = await boardService.createBoard({
      name: 'Performance Test Board',
      description: 'Board for database performance testing',
    });

    // Get the default column created with the board
    const columns = await dbConnection.query(
      'SELECT id FROM columns WHERE board_id = ? ORDER BY position LIMIT 1',
      [testBoard.id]
    );
    testColumnId = columns[0].id;
  }, 30000);

  afterAll(async () => {
    await dbConnection.close();
  });

  async function seedTasks(count: number, batchSize: number = 100): Promise<Task[]> {
    const tasks: Task[] = [];
    const startTime = Date.now();

    // Create tasks in batches for better performance
    for (let i = 0; i < count; i += batchSize) {
      const batch: Array<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> = [];
      const currentBatchSize = Math.min(batchSize, count - i);

      for (let j = 0; j < currentBatchSize; j++) {
        batch.push({
          title: `Performance Test Task ${String(i + j + 1)}`,
          description: `Description for performance test task ${String(i + j + 1)}`,
          board_id: testBoard.id,
          status: 'todo',
          position: i + j + 1,
        });
      }

      // Use database transaction for batch insert
      await dbConnection.transaction(async db => {
        await Promise.all(
  batch.map(async (taskData) => {
    await taskService.createTask(taskData);
  })
);
      });
    }

    const endTime = Date.now();
    logger.log(
      `✓ Seeded ${String(count)} tasks in ${String(endTime - startTime)}ms (${String(String(Math.round(count / ((endTime - startTime) / 1000))))} tasks/sec)`
    );

    return tasks;
  }

  describe('Bulk Operations Performance', () => {
    it('should handle bulk task creation efficiently', async () => {
      const taskCount = 1000;
      const startTime = Date.now();

      await dbConnection.transaction(async db => {
        Array.from({ length: taskCount }, (_, i) => i).forEach(async (i) => {
          await db.run(
            `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, position, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(),
              `Bulk Task ${String(i + 1)}`,
              `Bulk creation test task ${String(i + 1)}`,
              testBoard.id,
              testColumnId,
              'todo',
              5,
              i,
              new Date().toISOString(),
            ]
          );
        });
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      logger.log(`✓ Bulk created ${String(taskCount)} tasks in ${String(duration)}ms`);
      logger.log(`✓ Throughput: ${String(String(Math.round(taskCount / (duration / 1000))))} tasks/sec`);
    });

    it('should handle bulk updates efficiently', async () => {
      // First create tasks to update
      const tasks = await seedTasks(500);
      const updateCount = tasks.length;
      const startTime = Date.now();

      await dbConnection.transaction(async db => {
        await Promise.all(
  tasks.map(async (task) => {
    await db.run('UPDATE tasks SET title = ?, priority = ?, updated_at = ? WHERE id = ?', [
            `Updated ${String(String(task.title))}`,
            (task.priority || 0) + 1,
            new Date().toISOString(),
            task.id,
          ]);
  })
);
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(8000); // Should complete within 8 seconds
      logger.log(`✓ Bulk updated ${String(updateCount)} tasks in ${String(duration)}ms`);
      logger.log(
        `✓ Update throughput: ${String(String(Math.round(updateCount / (duration / 1000))))} updates/sec`
      );
    });

    it('should handle bulk deletes efficiently', async () => {
      // Create tasks to delete
      const tasks = await seedTasks(300);
      const deleteCount = tasks.length;
      const taskIds = tasks.map(t => t.id);

      const startTime = Date.now();

      await dbConnection.transaction(async db => {
        // Delete in batches to avoid SQL parameter limits
        const batchSize = 50;
        for (let i = 0; i < taskIds.length; i += batchSize) {
          const batch = taskIds.slice(i, i + batchSize);
          const placeholders = batch.map(() => '?').join(',');
          await db.run(`DELETE FROM tasks WHERE id IN (${String(placeholders)})`, batch);
        }
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      logger.log(`✓ Bulk deleted ${String(deleteCount)} tasks in ${String(duration)}ms`);
      logger.log(
        `✓ Delete throughput: ${String(String(Math.round(deleteCount / (duration / 1000))))} deletes/sec`
      );
    });
  });

  describe('Query Performance', () => {
    beforeAll(async () => {
      // Seed substantial data for query testing
      await seedTasks(2000);
    });

    it('should perform simple queries efficiently', async () => {
      const iterations = 100;
      const startTime = Date.now();

      Array.from({ length: iterations }, (_, i) => i).forEach(async () => {
        await dbConnection.query(
          'SELECT id, title, status, priority FROM tasks WHERE board_id = ? LIMIT 10',
          [testBoard.id]
        );
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      logger.log(`✓ ${String(iterations)} simple queries completed in ${String(duration)}ms`);
      logger.log(`✓ Average query time: ${String(String(Math.round(duration / iterations)))}ms`);
    });

    it('should perform complex JOIN queries efficiently', async () => {
      const iterations = 50;
      const startTime = Date.now();

      Array.from({ length: iterations }, (_, i) => i).forEach(async () => {
        await dbConnection.query(
          `
          SELECT t.id, t.title, t.status, t.priority, 
                 b.name as board_name, 
                 c.name as column_name,
                 COUNT(n.id) as note_count
          FROM tasks t
          LEFT JOIN boards b ON t.board_id = b.id
          LEFT JOIN columns c ON t.column_id = c.id
          LEFT JOIN notes n ON t.id = n.task_id
          WHERE t.board_id = ?
          GROUP BY t.id, b.name, c.name
          ORDER BY t.priority DESC, t.created_at DESC
          LIMIT 20
        `,
          [testBoard.id]
        );
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      logger.log(`✓ ${String(iterations)} complex JOIN queries completed in ${String(duration)}ms`);
      logger.log(`✓ Average complex query time: ${String(String(Math.round(duration / iterations)))}ms`);
    });

    it('should handle full-text search efficiently', async () => {
      const searchTerms = ['test', 'performance', 'task', 'description'];
      const iterations = 25;
      const startTime = Date.now();

      await Promise.all(
        searchTerms.map(async (term) => {
          await dbConnection.query(
            `
            SELECT id, title, description, status
            FROM tasks 
            WHERE (title LIKE ? OR description LIKE ?)
            AND board_id = ?
            ORDER BY 
              CASE 
                WHEN title LIKE ? THEN 1 
                WHEN description LIKE ? THEN 2 
                ELSE 3 
              END,
              created_at DESC
            LIMIT 50
          `,
            [`%${String(term)}%`, `%${String(term)}%`, testBoard.id, `%${String(term)}%`, `%${String(term)}%`]
          );
        })
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
      logger.log(`✓ ${String(iterations)} text searches completed in ${String(duration)}ms`);
    });

    it('should handle filtering and sorting efficiently', async () => {
      const filterCombinations = [
        { status: 'todo', priority_min: 5 },
        { status: 'in_progress', priority_max: 7 },
        { priority_min: 3, priority_max: 8 },
        { status: 'done' },
      ];

      const startTime = Date.now();
      const iterations = filterCombinations.length;

      await Promise.all(
        filterCombinations.map(async (filters) => {
          const whereClause = Object.keys(filters).length > 0 
            ? 'WHERE ' + Object.entries(filters).map(([key, value]) => `${key} = ?`).join(' AND ')
            : '';
          const params = Object.values(filters);
          
          await dbConnection.query(
            `
            SELECT id, title, status, priority, created_at
            FROM tasks 
            ${whereClause}
            ORDER BY priority DESC, created_at DESC
            LIMIT 100
          `,
            params
          );
        })
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      logger.log(
        `✓ ${String(iterations)} filtered queries completed in ${String(duration)}ms`
      );
    });
  });

  describe('Service Layer Performance', () => {
    it('should handle high-volume task operations through services', async () => {
      const operationCount = 200;
      const startTime = Date.now();

      // Mix of operations through service layer
      const operations = [];

      for (let i = 0; i < operationCount; i++) {
        const operation = i % 4;

        switch (operation) {
          case 0: // Create
            operations.push(
              taskService.createTask({
                title: `Service Test Task ${String(i)}`,
                description: `Created through service layer`,
                board_id: testBoard.id,
                column_id: testColumnId,
                status: 'todo',
                priority: Math.floor(Math.random() * 10),
                position: i,
              })
            );
            break;

          case 1: // Get tasks
            operations.push(
              taskService.getTasks({
                limit: 10,
                offset: 0,
                board_id: testBoard.id,
                sortBy: 'created_at',
                sortOrder: 'desc',
                overdue: false,
              })
            );
            break;

          case 2: // Search
            operations.push(
              taskService.getTasks({
                search: 'test',
                limit: 20,
                offset: 0,
                board_id: testBoard.id,
                sortBy: 'priority',
                sortOrder: 'desc',
                overdue: false,
              })
            );
            break;

          case 3: // Get with filters
            operations.push(
              taskService.getTasks({
                status: 'todo',
                priority_min: 3,
                limit: 15,
                offset: 0,
                board_id: testBoard.id,
                sortBy: 'priority',
                sortOrder: 'desc',
                overdue: false,
              })
            );
            break;
          default:
            break;
        }
      }

      await Promise.all(operations);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      logger.log(`✓ ${String(operationCount)} mixed service operations completed in ${String(duration)}ms`);
      logger.log(`✓ Average operation time: ${String(String(Math.round(duration / operationCount)))}ms`);
    });

    it('should handle concurrent service operations', async () => {
      const concurrentBatches = 20;
      const operationsPerBatch = 10;
      const startTime = Date.now();

      const batchPromises = Array.from({ length: concurrentBatches }, async (_, batchIndex) => {
        const batchOperations = [];

        for (let i = 0; i < operationsPerBatch; i++) {
          batchOperations.push(
            taskService.createTask({
              title: `Concurrent Task B${String(batchIndex)}-${String(i)}`,
              description: `Concurrent operation test`,
              board_id: testBoard.id,
              column_id: testColumnId,
              status: 'todo',
              priority: Math.floor(Math.random() * 10),
              position: batchIndex * operationsPerBatch + i,
            })
          );
        }

        return Promise.all(batchOperations);
      });

      const results = await Promise.all(batchPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      const totalOperations = concurrentBatches * operationsPerBatch;
      expect(duration).toBeLessThan(20000); // Should complete within 20 seconds
      expect(results.length).toBe(concurrentBatches);

      logger.log(`✓ ${String(totalOperations)} concurrent operations completed in ${String(duration)}ms`);
      logger.log(
        `✓ Concurrent throughput: ${String(String(Math.round(totalOperations / (duration / 1000))))} ops/sec`
      );
    });
  });

  describe('Connection and Transaction Performance', () => {
    it('should handle many short transactions efficiently', async () => {
      const transactionCount = 100;
      const startTime = Date.now();

      for (let i = 0; i < transactionCount; i++) {
        await dbConnection.transaction(async db => {
          // Simple transaction with multiple operations
          await db.run('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', [
            uuidv4(),
            `Transaction Tag ${String(i)}`,
            new Date().toISOString(),
          ]);

          await db.all('SELECT COUNT(*) as count FROM tags WHERE name LIKE ?', [
            'Transaction Tag%',
          ]);
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(8000); // Should complete within 8 seconds
      logger.log(`✓ ${String(transactionCount)} short transactions completed in ${String(duration)}ms`);
      logger.log(`✓ Average transaction time: ${String(String(Math.round(duration / transactionCount)))}ms`);
    });

    it('should handle long transactions with many operations', async () => {
      const longTransactionCount = 5;
      const operationsPerTransaction = 50;
      const startTime = Date.now();

      for (let i = 0; i < longTransactionCount; i++) {
        await dbConnection.transaction(async () => {
          for (let j = 0; j < operationsPerTransaction; j++) {
            await dbConnection.execute(
              'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)',
              [
                uuidv4(),
                `Long Transaction Tag ${String(i)}-${String(j)}`,
                `#${String(String(Math.floor(Math.random() * 16777215)
                  .toString(16)
                  .padStart(6, '0')))}`,
                new Date().toISOString(),
              ]
            );
          }
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      const totalOperations = longTransactionCount * operationsPerTransaction;
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      logger.log(
        `✓ ${String(longTransactionCount)} long transactions (${String(totalOperations)} ops) completed in ${String(duration)}ms`
      );
    });

    it('should maintain performance under connection pressure', async () => {
      const simultaneousQueries = 50;
      const startTime = Date.now();

      // Execute many queries simultaneously to test connection handling
      const queryPromises = Array.from({ length: simultaneousQueries }, (_, i) =>
        dbConnection.query(
          `
          SELECT t.id, t.title, t.status, COUNT(n.id) as note_count
          FROM tasks t
          LEFT JOIN notes n ON t.id = n.task_id
          WHERE t.board_id = ?
          GROUP BY t.id
          LIMIT 20
          OFFSET ?
        `,
          [testBoard.id, i * 5]
        )
      );

      const results = await Promise.all(queryPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(results.length).toBe(simultaneousQueries);

      logger.log(`✓ ${String(simultaneousQueries)} simultaneous queries completed in ${String(duration)}ms`);
      logger.log(
        `✓ Average query time under pressure: ${String(String(Math.round(duration / simultaneousQueries)))}ms`
      );
    });
  });

  describe('Memory and Resource Efficiency', () => {
    it('should handle large result sets without excessive memory usage', async () => {
      // Seed a large dataset
      await seedTasks(1000);

      const initialMemory = process.memoryUsage();
      const startTime = Date.now();

      // Query for large result sets multiple times
      for (let i = 0; i < 10; i++) {
        const results = await dbConnection.query(
          `
          SELECT id, title, description, status, priority, created_at, updated_at
          FROM tasks 
          WHERE board_id = ?
          ORDER BY created_at DESC
          LIMIT 500
        `,
          [testBoard.id]
        );

        expect(results.length).toBeGreaterThan(0);
        expect(results.length).toBeLessThanOrEqual(500);

        // Process results to simulate real usage
        results.forEach(row => {
          expect(row.id).toBeDefined();
          expect(row.title).toBeDefined();
        });
      }

      const endTime = Date.now();

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const duration = endTime - startTime;
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(duration).toBeLessThan(5000);
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase

      logger.log(`✓ Large result set queries completed in ${String(duration)}ms`);
      logger.log(`✓ Memory increase: ${String(String(Math.round(memoryIncrease / 1024 / 1024)))}MB`);
    });

    it('should efficiently clean up resources after operations', async () => {
      const operationCount = 200;
      const initialMemory = process.memoryUsage();

      // Perform many operations that could potentially leak resources
      for (let i = 0; i < operationCount; i++) {
        // Create and immediately query
        const taskId = uuidv4();
        await dbConnection.execute(
          'INSERT INTO tasks (id, title, board_id, column_id, status, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            taskId,
            `Cleanup Test ${String(i)}`,
            testBoard.id,
            testColumnId,
            'todo',
            i,
            new Date().toISOString(),
          ]
        );

        await dbConnection.queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);

        // Delete to test cleanup
        await dbConnection.execute('DELETE FROM tasks WHERE id = ?', [taskId]);
      }

      // Force garbage collection
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase

      logger.log(`✓ ${String(operationCount)} create/query/delete cycles completed`);
      logger.log(`✓ Memory increase after cleanup: ${String(String(Math.round(memoryIncrease / 1024 / 1024)))}MB`);
    });
  });

  describe('Index and Query Optimization', () => {
    beforeAll(async () => {
      // Ensure we have enough data to test index effectiveness
      await seedTasks(1500);
    });

    it('should use indexes effectively for common queries', async () => {
      const indexedQueries = [
        // Primary key lookup (should be fastest)
        {
          name: 'Primary key lookup',
          query: 'SELECT * FROM tasks WHERE id = ?',
          maxTime: 50,
        },
        // Board filtering (should use board_id index)
        {
          name: 'Board filtering',
          query: 'SELECT id, title FROM tasks WHERE board_id = ? LIMIT 100',
          maxTime: 100,
        },
        // Status filtering (should use compound index)
        {
          name: 'Status + Board filtering',
          query: 'SELECT id, title FROM tasks WHERE board_id = ? AND status = ? LIMIT 50',
          maxTime: 150,
        },
        // Date range queries (should use created_at index)
        {
          name: 'Date range query',
          query: 'SELECT id, title FROM tasks WHERE created_at > ? LIMIT 100',
          maxTime: 200,
        },
      ];

      // Test each query type
      for (const { name, query, maxTime } of indexedQueries) {
        const iterations = 20;
        const startTime = Date.now();

        for (let i = 0; i < iterations; i++) {
          let params: any[];

          if (query.includes('id = ?')) {
            // Get a random task ID
            const tasks = await dbConnection.query('SELECT id FROM tasks LIMIT 1 OFFSET ?', [
              Math.floor(Math.random() * 100),
            ]);
            params = [tasks[0]?.id || uuidv4()];
          } else if (query.includes('status = ?')) {
            params = [testBoard.id, 'todo'];
          } else if (query.includes('created_at >')) {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            params = [yesterday];
          } else {
            params = [testBoard.id];
          }

          await dbConnection.query(query, params);
        }

        const endTime = Date.now();
        const duration = endTime - startTime;
        const avgTime = duration / iterations;

        expect(avgTime).toBeLessThan(maxTime);
        logger.log(
          `✓ ${String(name)}: ${String(iterations)} queries, avg ${String(String(Math.round(avgTime)))}ms (max ${String(maxTime)}ms)`
        );
      }
    });

    it('should maintain query performance with concurrent access', async () => {
      const concurrentQueries = 30;
      const queriesPerThread = 10;
      const startTime = Date.now();

      const queryPromises = Array.from({ length: concurrentQueries }, async (_, threadIndex) => {
        const threadTimes: number[] = [];

        for (let i = 0; i < queriesPerThread; i++) {
          const queryStart = Date.now();

          await dbConnection.query(
            `
            SELECT t.id, t.title, t.status, t.priority
            FROM tasks t
            WHERE t.board_id = ? 
            AND t.status IN ('todo', 'in_progress')
            ORDER BY t.priority DESC, t.created_at DESC
            LIMIT 20
            OFFSET ?
          `,
            [testBoard.id, threadIndex * 5 + i]
          );

          threadTimes.push(Date.now() - queryStart);
        }

        return threadTimes;
      });

      const allTimes = (await Promise.all(queryPromises)).flat();
      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      const avgTime = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
      const maxTime = Math.max(...allTimes);
      const totalQueries = concurrentQueries * queriesPerThread;

      expect(avgTime).toBeLessThan(200); // Average should be under 200ms
      expect(maxTime).toBeLessThan(1000); // No single query should take over 1 second
      expect(totalDuration).toBeLessThan(10000); // All queries should complete within 10 seconds

      logger.log(`✓ ${String(totalQueries)} concurrent queries completed in ${String(totalDuration)}ms`);
      logger.log(`✓ Average time: ${String(String(Math.round(avgTime)))}ms, Max time: ${String(maxTime)}ms`);
      logger.log(`✓ Throughput: ${String(String(Math.round(totalQueries / (totalDuration / 1000))))} queries/sec`);
    });
  });
});
