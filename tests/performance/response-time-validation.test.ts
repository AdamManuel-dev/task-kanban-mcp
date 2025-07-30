/**
 * @fileoverview Command response time validation tests
 * @lastmodified 2025-07-28T10:30:00Z
 * 
 * Features: Response time benchmarking, performance thresholds, operation timing
 * Main APIs: CLI commands, API endpoints, service operations
 * Constraints: < 500ms for basic operations, accurate timing measurement
 * Patterns: Performance testing, timing analysis, threshold validation
 */

import { performance } from 'perf_hooks';
import request from 'supertest';
import { DatabaseConnection } from '@/database/connection';
import { TaskService } from '@/services/TaskService';
import { BoardService } from '@/services/BoardService';
import { NoteService } from '@/services/NoteService';
import { app } from '@/server';

interface TimingResult {
  operation: string;
  duration: number;
  threshold: number;
  passed: boolean;
  details?: any;
}

describe('Command Response Time Validation', () => {
  let connection: DatabaseConnection;
  let taskService: TaskService;
  let boardService: BoardService;
  let noteService: NoteService;

  const BASIC_OPERATION_THRESHOLD_MS = 500;
  const COMPLEX_OPERATION_THRESHOLD_MS = 2000;
  const API_ENDPOINT_THRESHOLD_MS = 1000;

  beforeAll(async () => {
    connection = DatabaseConnection.getInstance();
    await connection.initialize({ skipSchema: false });
    
    taskService = new TaskService(connection);
    boardService = new BoardService(connection);
    noteService = new NoteService(connection);
  });

  beforeEach(async () => {
    // Clean up test data
    await connection.execute('DELETE FROM tasks WHERE title LIKE "%Response Time Test%"');
    await connection.execute('DELETE FROM columns WHERE board_id IN (SELECT id FROM boards WHERE name LIKE "%Response Time Test%")');
    await connection.execute('DELETE FROM boards WHERE name LIKE "%Response Time Test%"');
  });

  afterAll(async () => {
    await connection.close();
  });

  /**
   * Measures operation execution time
   */
  const measureOperation = async <T>(
    operation: string,
    fn: () => Promise<T>,
    threshold: number = BASIC_OPERATION_THRESHOLD_MS
  ): Promise<TimingResult> => {
    const start = performance.now();
    
    try {
      const result = await fn();
      const end = performance.now();
      const duration = end - start;
      
      return {
        operation,
        duration,
        threshold,
        passed: duration < threshold,
        details: { success: true, resultType: typeof result }
      };
    } catch (error) {
      const end = performance.now();
      const duration = end - start;
      
      return {
        operation,
        duration,
        threshold,
        passed: false,
        details: { success: false, error: (error as Error).message }
      };
    }
  };

  /**
   * Logs timing results
   */
  const logTiming = (result: TimingResult): void => {
    const status = result.passed ? '✅' : '❌';
    const duration = `${result.duration.toFixed(2)}ms`;
    const threshold = `(threshold: ${result.threshold}ms)`;
    
    console.log(`${status} ${result.operation}: ${duration} ${threshold}`);
    
    if (!result.passed && result.details?.error) {
      console.log(`   Error: ${result.details.error}`);
    }
  };

  describe('Service Operation Response Times', () => {
    test('board creation should complete within 500ms', async () => {
      const result = await measureOperation(
        'Board Creation',
        () => boardService.createBoard({
          name: 'Response Time Test Board',
          description: 'Testing board creation performance',
        }),
        BASIC_OPERATION_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(BASIC_OPERATION_THRESHOLD_MS);
    });

    test('task creation should complete within 500ms', async () => {
      // Create board first
      const board = await boardService.createBoard({
        name: 'Response Time Test Board',
        description: 'For task creation timing',
      });

      const result = await measureOperation(
        'Task Creation',
        async () => {
          const boardWithColumns = await boardService.getBoardWithColumns(board.id);
          const todoColumn = boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];
          return taskService.createTask({
            title: 'Response Time Test Task',
            description: 'Testing task creation performance',
            board_id: board.id,
            column_id: todoColumn?.id,
            status: 'todo',
          } as any);
        },
        BASIC_OPERATION_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(BASIC_OPERATION_THRESHOLD_MS);
    });

    test('task retrieval should complete within 500ms', async () => {
      // Setup test data
      const board = await boardService.createBoard({
        name: 'Response Time Test Board',
        description: 'For task retrieval timing',
      });

      const boardWithColumns = await boardService.getBoardWithColumns(board.id);
      const todoColumn = boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];
      
      await taskService.createTask({
        title: 'Response Time Test Task',
        description: 'Testing task retrieval performance',
        board_id: board.id,
        column_id: todoColumn?.id,
        status: 'todo',
      } as any);

      const result = await measureOperation(
        'Task Retrieval',
        () => taskService.getTasks({ board_id: board.id }),
        BASIC_OPERATION_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(BASIC_OPERATION_THRESHOLD_MS);
    });

    test('board retrieval should complete within 500ms', async () => {
      const board = await boardService.createBoard({
        name: 'Response Time Test Board',
        description: 'For board retrieval timing',
      });

      const result = await measureOperation(
        'Board Retrieval',
        () => boardService.getBoardById(board.id),
        BASIC_OPERATION_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(BASIC_OPERATION_THRESHOLD_MS);
    });

    test('task update should complete within 500ms', async () => {
      // Setup test data
      const board = await boardService.createBoard({
        name: 'Response Time Test Board',
        description: 'For task update timing',
      });

      const boardWithColumns = await boardService.getBoardWithColumns(board.id);
      const todoColumn = boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];
      
      const task = await taskService.createTask({
        title: 'Response Time Test Task',
        description: 'Testing task update performance',
        board_id: board.id,
        column_id: todoColumn?.id,
        status: 'todo',
      } as any);

      const result = await measureOperation(
        'Task Update',
        () => taskService.updateTask(task.id, {
          title: 'Updated Response Time Test Task',
          status: 'in_progress',
        }),
        BASIC_OPERATION_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(BASIC_OPERATION_THRESHOLD_MS);
    });

    test('task deletion should complete within 500ms', async () => {
      // Setup test data
      const board = await boardService.createBoard({
        name: 'Response Time Test Board',
        description: 'For task deletion timing',
      });

      const boardWithColumns = await boardService.getBoardWithColumns(board.id);
      const todoColumn = boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];
      
      const task = await taskService.createTask({
        title: 'Response Time Test Task',
        description: 'Testing task deletion performance',
        board_id: board.id,
        column_id: todoColumn?.id,
        status: 'todo',
      } as any);

      const result = await measureOperation(
        'Task Deletion',
        () => taskService.deleteTask(task.id),
        BASIC_OPERATION_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(BASIC_OPERATION_THRESHOLD_MS);
    });
  });

  describe.skip('API Endpoint Response Times', () => {
    test('health endpoint should respond within 500ms', async () => {
      const result = await measureOperation(
        'Health Endpoint',
        async () => {
          const response = await request(app).get('/api/health');
          return response.status;
        },
        BASIC_OPERATION_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(BASIC_OPERATION_THRESHOLD_MS);
    });

    test('boards list endpoint should respond within 1000ms', async () => {
      const result = await measureOperation(
        'Boards List Endpoint',
        async () => {
          const response = await request(app).get('/api/boards');
          return response.status;
        },
        API_ENDPOINT_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(API_ENDPOINT_THRESHOLD_MS);
    });

    test('tasks list endpoint should respond within 1000ms', async () => {
      const result = await measureOperation(
        'Tasks List Endpoint',
        async () => {
          const response = await request(app).get('/api/tasks');
          return response.status;
        },
        API_ENDPOINT_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(API_ENDPOINT_THRESHOLD_MS);
    });

    test('board creation endpoint should respond within 1000ms', async () => {
      const result = await measureOperation(
        'Board Creation Endpoint',
        async () => {
          const response = await request(app)
            .post('/api/boards')
            .send({
              name: 'API Response Time Test Board',
              description: 'Testing API response time',
            });
          return response.status;
        },
        API_ENDPOINT_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(API_ENDPOINT_THRESHOLD_MS);
    });

    test('task creation endpoint should respond within 1000ms', async () => {
      // Create board first
      const boardResponse = await request(app)
        .post('/api/boards')
        .send({
          name: 'API Response Time Test Board',
          description: 'For task creation',
        });

      const boardId = boardResponse.body.data.id;

      const result = await measureOperation(
        'Task Creation Endpoint',
        async () => {
          const response = await request(app)
            .post('/api/tasks')
            .send({
              title: 'API Response Time Test Task',
              description: 'Testing API task creation',
              boardId: boardId,
              status: 'todo',
            });
          return response.status;
        },
        API_ENDPOINT_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(API_ENDPOINT_THRESHOLD_MS);
    });
  });

  describe('Complex Operation Response Times', () => {
    test('bulk task creation should complete within 2000ms', async () => {
      const board = await boardService.createBoard({
        name: 'Bulk Response Time Test Board',
        description: 'For bulk operations timing',
      });

      const result = await measureOperation(
        'Bulk Task Creation (10 tasks)',
        async () => {
          const boardWithColumns = await boardService.getBoardWithColumns(board.id);
          const todoColumn = boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];
          
          const promises = Array.from({ length: 10 }, (_, i) =>
            taskService.createTask({
              title: `Bulk Response Time Test Task ${i + 1}`,
              description: `Task ${i + 1} for bulk creation timing`,
              board_id: board.id,
              column_id: todoColumn?.id,
              status: 'todo',
            } as any)
          );
          return Promise.all(promises);
        },
        COMPLEX_OPERATION_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(COMPLEX_OPERATION_THRESHOLD_MS);
    });

    test('board with tasks retrieval should complete within 2000ms', async () => {
      // Setup test data
      const board = await boardService.createBoard({
        name: 'Complex Response Time Test Board',
        description: 'For complex retrieval timing',
      });

      // Get column for tasks
      const boardWithColumns = await boardService.getBoardWithColumns(board.id);
      const todoColumn = boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];
      
      // Create multiple tasks
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          taskService.createTask({
            title: `Complex Response Time Test Task ${i + 1}`,
            description: `Task ${i + 1} for complex retrieval timing`,
            board_id: board.id,
            column_id: todoColumn?.id,
            status: i % 3 === 0 ? 'todo' : i % 3 === 1 ? 'in_progress' : 'done',
          } as any)
        )
      );

      const result = await measureOperation(
        'Board with Tasks Retrieval',
        () => boardService.getBoardWithStats(board.id),
        COMPLEX_OPERATION_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(COMPLEX_OPERATION_THRESHOLD_MS);
    });

    test('task search should complete within 1000ms', async () => {
      // Setup test data
      const board = await boardService.createBoard({
        name: 'Search Response Time Test Board',
        description: 'For search timing',
      });

      const boardWithColumns = await boardService.getBoardWithColumns(board.id);
      const todoColumn = boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];
      
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          taskService.createTask({
            title: `Search Test Task ${i + 1}`,
            description: `Searchable task description ${i + 1}`,
            board_id: board.id,
            column_id: todoColumn?.id,
            status: 'todo',
          } as any)
        )
      );

      const result = await measureOperation(
        'Task Search',
        () => taskService.getTasks({ 
          board_id: board.id,
          search: 'Search Test'
        }),
        API_ENDPOINT_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(API_ENDPOINT_THRESHOLD_MS);
    });
  });

  describe('Database Operation Response Times', () => {
    test('database health check should complete within 100ms', async () => {
      const result = await measureOperation(
        'Database Health Check',
        () => connection.execute('SELECT 1 as health'),
        100 // Very fast threshold for simple query
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(100);
    });

    test('database statistics query should complete within 500ms', async () => {
      const result = await measureOperation(
        'Database Statistics Query',
        () => connection.execute(`
          SELECT 
            (SELECT COUNT(*) FROM tasks) as task_count,
            (SELECT COUNT(*) FROM boards) as board_count,
            (SELECT COUNT(*) FROM notes) as note_count
        `),
        BASIC_OPERATION_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(BASIC_OPERATION_THRESHOLD_MS);
    });

    test('complex join query should complete within 1000ms', async () => {
      const result = await measureOperation(
        'Complex Join Query',
        () => connection.execute(`
          SELECT 
            b.name as board_name,
            COUNT(t.id) as task_count,
            COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_count
          FROM boards b
          LEFT JOIN tasks t ON b.id = t.board_id
          GROUP BY b.id, b.name
          ORDER BY task_count DESC
        `),
        API_ENDPOINT_THRESHOLD_MS
      );

      logTiming(result);
      expect(result.passed).toBe(true);
      expect(result.duration).toBeLessThan(API_ENDPOINT_THRESHOLD_MS);
    });
  });

  describe('Performance Under Load', () => {
    test('concurrent basic operations should maintain response times', async () => {
      const board = await boardService.createBoard({
        name: 'Concurrent Response Time Test Board',
        description: 'For concurrent operations timing',
      });

      // Run 5 concurrent operations
      const operations = [
        measureOperation('Concurrent Task Creation 1', async () => {
          const boardWithColumns = await boardService.getBoardWithColumns(board.id);
          const todoColumn = boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];
          return taskService.createTask({
            title: 'Concurrent Test Task 1',
            description: 'Testing concurrent performance',
            board_id: board.id,
            column_id: todoColumn?.id,
            status: 'todo',
          } as any);
        }),
        measureOperation('Concurrent Task Creation 2', async () => {
          const boardWithColumns = await boardService.getBoardWithColumns(board.id);
          const todoColumn = boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];
          return taskService.createTask({
            title: 'Concurrent Test Task 2',
            description: 'Testing concurrent performance',
            board_id: board.id,
            column_id: todoColumn?.id,
            status: 'todo',
          } as any);
        }),
        measureOperation('Concurrent Board Retrieval', () =>
          boardService.getBoardById(board.id)
        ),
        measureOperation('Concurrent Task List', () =>
          taskService.getTasks({ board_id: board.id })
        ),
        measureOperation('Concurrent Board List', () =>
          boardService.getBoards({})
        ),
      ];

      const results = await Promise.all(operations);

      results.forEach(result => {
        logTiming(result);
        expect(result.passed).toBe(true);
        expect(result.duration).toBeLessThan(BASIC_OPERATION_THRESHOLD_MS);
      });

      // Average response time should be reasonable
      const averageTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      console.log(`Average concurrent operation time: ${averageTime.toFixed(2)}ms`);
      expect(averageTime).toBeLessThan(BASIC_OPERATION_THRESHOLD_MS * 0.8); // 80% of threshold
    }, 10000);
  });
});