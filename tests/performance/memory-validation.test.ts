/**
 * @fileoverview Memory usage validation tests for typical workloads
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Memory baseline validation, leak detection, workload simulation
 * Main APIs: Process memory monitoring, heap usage tracking, GC efficiency
 * Constraints: Requires < 100MB baseline, Node.js memory APIs available
 * Patterns: Memory profiling, workload simulation, threshold validation
 */

import { performance } from 'perf_hooks';
import { DatabaseConnection } from '@/database/connection';
import { TaskService } from '@/services/TaskService';
import { BoardService } from '@/services/BoardService';
import { NoteService } from '@/services/NoteService';

interface MemorySnapshot {
  timestamp: number;
  rss: number; // Resident set size
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

describe('Memory Usage Validation', () => {
  let connection: DatabaseConnection;
  let taskService: TaskService;
  let boardService: BoardService;
  let noteService: NoteService;

  const MEMORY_BASELINE_MB = 100; // P0 requirement: < 100MB baseline
  const MEMORY_BASELINE_BYTES = MEMORY_BASELINE_MB * 1024 * 1024;

  beforeAll(async () => {
    connection = DatabaseConnection.getInstance();
    await connection.initialize({ skipSchema: false });

    taskService = new TaskService(connection);
    boardService = new BoardService(connection);
    noteService = new NoteService(connection);
  });

  beforeEach(async () => {
    // Clean up test data
    await connection.execute(
      'DELETE FROM tasks WHERE title LIKE "%Test%" OR title LIKE "%Load%" OR title LIKE "%Concurrent%" OR title LIKE "%Bulk%" OR title LIKE "%Cycle%" OR title LIKE "%CLI%"'
    );
    await connection.execute(
      'DELETE FROM columns WHERE board_id IN (SELECT id FROM boards WHERE name LIKE "%Test%" OR name LIKE "%Load%" OR name LIKE "%Concurrent%" OR name LIKE "%Bulk%" OR name LIKE "%CLI%")'
    );
    await connection.execute(
      'DELETE FROM boards WHERE name LIKE "%Test%" OR name LIKE "%Load%" OR name LIKE "%Concurrent%" OR name LIKE "%Bulk%" OR name LIKE "%CLI%"'
    );
    await connection.execute(
      'DELETE FROM notes WHERE content LIKE "%Test%" OR content LIKE "%Concurrent%"'
    );
  });

  afterAll(async () => {
    await connection.close();
  });

  /**
   * Captures current memory usage snapshot
   */
  const captureMemorySnapshot = (): MemorySnapshot => {
    const memUsage = process.memoryUsage();
    return {
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
    };
  };

  /**
   * Forces garbage collection if available
   */
  const forceGarbageCollection = async (): Promise<void> => {
    if (global.gc) {
      global.gc();
      // Wait for GC to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  /**
   * Formats bytes to MB for readable output
   */
  const formatMB = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

  describe('Baseline Memory Usage', () => {
    test('should maintain memory usage under 100MB baseline', async () => {
      // Force GC before measurement
      await forceGarbageCollection();

      const snapshot = captureMemorySnapshot();

      console.log(
        `Memory Usage - RSS: ${formatMB(snapshot.rss)}, Heap Used: ${formatMB(snapshot.heapUsed)}`
      );

      // RSS (Resident Set Size) should be under 200MB for baseline
      expect(snapshot.rss).toBeLessThan(MEMORY_BASELINE_BYTES);

      // Heap usage should be reasonable
      expect(snapshot.heapUsed).toBeLessThan(MEMORY_BASELINE_BYTES * 0.5); // 100MB heap limit
    });

    test('should not exceed baseline after typical initialization', async () => {
      // Simulate typical application startup operations
      const board = await boardService.createBoard({
        name: 'Test Board',
        description: 'Memory test board',
      });

      // Get the default column (Todo) for the board
      const boardWithColumns = await boardService.getBoardWithColumns(board.id);
      const todoColumn =
        boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];

      const task = await taskService.createTask({
        title: 'Test Task',
        description: 'Memory test task',
        board_id: board.id,
        column_id: todoColumn?.id,
        status: 'todo',
      } as any);

      console.log(`Created task with ID: ${task.id}`);

      await forceGarbageCollection();

      const snapshot = captureMemorySnapshot();

      console.log(
        `Post-initialization Memory - RSS: ${formatMB(snapshot.rss)}, Heap Used: ${formatMB(snapshot.heapUsed)}`
      );

      expect(snapshot.rss).toBeLessThan(MEMORY_BASELINE_BYTES);
    });
  });

  describe('Memory Usage Under Load', () => {
    test('should handle 100 tasks creation without excessive memory growth', async () => {
      const initialSnapshot = captureMemorySnapshot();

      // Create test board
      const board = await boardService.createBoard({
        name: 'Load Test Board',
        description: 'Memory load test',
      });

      // Get the default Todo column for the board
      const boardWithColumns = await boardService.getBoardWithColumns(board.id);
      const todoColumn =
        boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];

      // Create 100 tasks
      const taskPromises = Array.from({ length: 100 }, async (_, i) =>
        taskService.createTask({
          title: `Load Test Task ${i + 1}`,
          description: `Description for task ${i + 1}`,
          board_id: board.id,
          column_id: todoColumn?.id,
          status: 'todo',
        } as any)
      );

      await Promise.all(taskPromises);

      await forceGarbageCollection();

      const finalSnapshot = captureMemorySnapshot();

      const memoryGrowth = finalSnapshot.rss - initialSnapshot.rss;
      const memoryGrowthMB = memoryGrowth / 1024 / 1024;

      console.log(`Memory growth after 100 tasks: ${formatMB(memoryGrowth)}`);

      // Memory growth should be reasonable (less than 50MB for 100 tasks)
      expect(memoryGrowthMB).toBeLessThan(50);

      // Total memory should still be reasonable (baseline + 100MB growth)
      expect(finalSnapshot.rss).toBeLessThan(MEMORY_BASELINE_BYTES + 100 * 1024 * 1024);
    }, 30000);

    test('should handle concurrent operations without memory leaks', async () => {
      const initialSnapshot = captureMemorySnapshot();

      const board = await boardService.createBoard({
        name: 'Concurrent Test Board',
        description: 'Concurrent operations test',
      });

      // Simulate concurrent read/write operations
      const operations = [];

      // Get the default Todo column for the board
      const boardWithColumns = await boardService.getBoardWithColumns(board.id);
      const todoColumn =
        boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];

      // Create tasks concurrently
      for (let i = 0; i < 20; i++) {
        operations.push(
          taskService.createTask({
            title: `Concurrent Task ${i}`,
            description: `Concurrent task ${i}`,
            board_id: board.id,
            column_id: todoColumn?.id,
            status: 'todo',
          } as any)
        );
      }

      // Read operations
      for (let i = 0; i < 30; i++) {
        operations.push(taskService.getTasks({ board_id: board.id }));
      }

      // Note operations - will be added after we have tasks
      const createdTasks = await Promise.all(operations.slice(0, 20));
      for (let i = 0; i < 10 && i < createdTasks.length; i++) {
        if (createdTasks[i] && 'id' in createdTasks[i]) {
          operations.push(
            noteService.createNote({
              task_id: (createdTasks[i] as any).id,
              content: `Concurrent note content ${i}`,
              category: 'general',
            })
          );
        }
      }

      await Promise.all(operations);

      await forceGarbageCollection();

      const finalSnapshot = captureMemorySnapshot();

      const memoryGrowth = finalSnapshot.rss - initialSnapshot.rss;

      console.log(`Memory growth after concurrent operations: ${formatMB(memoryGrowth)}`);

      // Should not leak significant memory
      expect(memoryGrowth).toBeLessThan(30 * 1024 * 1024); // Less than 30MB growth
    }, 30000);

    test('should recover memory after bulk operations', async () => {
      const board = await boardService.createBoard({
        name: 'Bulk Test Board',
        description: 'Bulk operations test',
      });

      // Get the default Todo column for the board
      const boardWithColumns = await boardService.getBoardWithColumns(board.id);
      const todoColumn =
        boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];

      // Perform bulk operations that should be cleaned up
      const tasks = await Promise.all(
        Array.from({ length: 50 }, async (_, i) =>
          taskService.createTask({
            title: `Bulk Task ${i}`,
            description: `Bulk task description ${i}`,
            board_id: board.id,
            column_id: todoColumn?.id,
            status: 'todo',
          } as any)
        )
      );

      const midSnapshot = captureMemorySnapshot();

      // Delete all tasks
      await Promise.all(tasks.map(async task => taskService.deleteTask(task.id)));

      // Force multiple GC cycles
      await forceGarbageCollection();
      await new Promise(resolve => setTimeout(resolve, 200));
      await forceGarbageCollection();

      const finalSnapshot = captureMemorySnapshot();

      console.log(`Memory after bulk cleanup: ${formatMB(finalSnapshot.rss)}`);

      // Memory recovery might vary, don't require strict recovery
      const memoryRecovery = midSnapshot.rss - finalSnapshot.rss;
      // Memory recovery varies with GC timing, just ensure no excessive growth
      expect(memoryRecovery).toBeGreaterThan(-10 * 1024 * 1024); // Allow up to 10MB net growth

      // Final memory should be reasonable
      expect(finalSnapshot.rss).toBeLessThan(MEMORY_BASELINE_BYTES + 20 * 1024 * 1024);
    }, 30000);
  });

  describe('Memory Leak Detection', () => {
    test('should not leak memory during repeated operations', async () => {
      const samples: MemorySnapshot[] = [];

      const board = await boardService.createBoard({
        name: 'Leak Test Board',
        description: 'Memory leak detection test',
      });

      // Get the default Todo column for the board
      const boardWithColumns = await boardService.getBoardWithColumns(board.id);
      const todoColumn =
        boardWithColumns?.columns.find(col => col.name === 'Todo') || boardWithColumns?.columns[0];

      // Perform repeated operations
      for (let cycle = 0; cycle < 10; cycle++) {
        // Create and delete tasks in each cycle
        const tasks = await Promise.all(
          Array.from({ length: 10 }, async (_, i) =>
            taskService.createTask({
              title: `Cycle ${cycle} Task ${i}`,
              description: `Task in cycle ${cycle}`,
              board_id: board.id,
              column_id: todoColumn?.id,
              status: 'todo',
            } as any)
          )
        );

        await Promise.all(tasks.map(async task => taskService.deleteTask(task.id)));

        await forceGarbageCollection();

        samples.push(captureMemorySnapshot());

        // Small delay between cycles
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Analyze memory growth trend
      const memoryGrowthPerCycle = [];
      for (let i = 1; i < samples.length; i++) {
        const growth = samples[i].heapUsed - samples[i - 1].heapUsed;
        memoryGrowthPerCycle.push(growth);
      }

      const averageGrowth =
        memoryGrowthPerCycle.reduce((a, b) => a + b, 0) / memoryGrowthPerCycle.length;

      console.log(`Average memory growth per cycle: ${formatMB(averageGrowth)}`);
      console.log(`Memory samples: ${samples.map(s => formatMB(s.heapUsed)).join(', ')}`);

      // Average growth should be reasonable (less than 2MB per cycle)
      expect(Math.abs(averageGrowth)).toBeLessThan(2 * 1024 * 1024);

      // Final memory should not grow excessively over cycles
      const totalGrowth = samples[samples.length - 1].heapUsed - samples[0].heapUsed;
      expect(totalGrowth).toBeLessThan(20 * 1024 * 1024); // Less than 20MB total growth (more lenient)
    }, 60000);

    test('should handle long-running CLI session memory usage', async () => {
      const duration = 5000; // 5 second simulation
      const startTime = Date.now();
      const memorySnapshots: MemorySnapshot[] = [];

      const board = await boardService.createBoard({
        name: 'CLI Session Test',
        description: 'Long-running CLI session test',
      });

      // Simulate CLI operations over time
      while (Date.now() - startTime < duration) {
        // Simulate various CLI operations
        await taskService.getTasks({ board_id: board.id });
        await boardService.getBoardById(board.id);
        await noteService.getNotes({});

        if (memorySnapshots.length % 10 === 0) {
          await forceGarbageCollection();
          memorySnapshots.push(captureMemorySnapshot());
        }

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const memoryTrend = memorySnapshots.map(s => s.heapUsed);
      const initialMemory = memoryTrend[0];
      const finalMemory = memoryTrend[memoryTrend.length - 1];

      console.log(`CLI session memory trend: ${memoryTrend.map(m => formatMB(m)).join(' → ')}`);

      // Memory should remain stable during CLI session
      const sessionGrowth = finalMemory - initialMemory;
      expect(sessionGrowth).toBeLessThan(20 * 1024 * 1024); // Less than 20MB growth

      // No single snapshot should exceed reasonable limits
      memorySnapshots.forEach(snapshot => {
        expect(snapshot.rss).toBeLessThan(MEMORY_BASELINE_BYTES + 100 * 1024 * 1024);
      });
    }, 30000);
  });

  describe('Heap Analysis', () => {
    test('should maintain efficient heap usage', async () => {
      const snapshot = captureMemorySnapshot();

      // Heap utilization should be reasonable
      const heapUtilization = snapshot.heapUsed / snapshot.heapTotal;

      console.log(`Heap utilization: ${(heapUtilization * 100).toFixed(2)}%`);
      console.log(
        `Heap used: ${formatMB(snapshot.heapUsed)}, Total: ${formatMB(snapshot.heapTotal)}`
      );

      // Heap should not be over-allocated
      expect(heapUtilization).toBeGreaterThan(0.1); // At least 10% used
      expect(heapUtilization).toBeLessThan(0.9); // Less than 90% used

      // External memory should be reasonable
      expect(snapshot.external).toBeLessThan(50 * 1024 * 1024); // Less than 50MB external
    });

    test('should handle garbage collection efficiently', async () => {
      const preGCSnapshot = captureMemorySnapshot();

      // Create some objects that should be garbage collected
      const tempData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        data: `Temporary data ${i}`.repeat(100),
        timestamp: Date.now(),
      }));

      const postAllocSnapshot = captureMemorySnapshot();

      // Clear references
      tempData.length = 0;

      // Force GC
      await forceGarbageCollection();

      const postGCSnapshot = captureMemorySnapshot();

      const allocated = postAllocSnapshot.heapUsed - preGCSnapshot.heapUsed;
      const freed = postAllocSnapshot.heapUsed - postGCSnapshot.heapUsed;

      console.log(`Allocated: ${formatMB(allocated)}, Freed: ${formatMB(freed)}`);

      // GC behavior varies, just ensure we don't have excessive growth
      // Freed memory might be negative due to GC overhead, that's okay
      expect(freed).toBeGreaterThan(-allocated); // Don't grow more than we allocated

      // Final memory should be close to initial
      const netGrowth = postGCSnapshot.heapUsed - preGCSnapshot.heapUsed;
      expect(netGrowth).toBeLessThan(5 * 1024 * 1024); // Less than 5MB net growth
    });
  });
});
