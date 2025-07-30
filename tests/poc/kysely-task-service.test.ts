/**
 * @fileoverview Kysely TaskService Proof of Concept Tests
 * @lastmodified 2025-07-28T10:30:00Z
 * 
 * Features: Type-safe query testing, integration tests, performance validation
 * Main APIs: TaskServiceKysely testing, query result validation
 * Constraints: Requires database setup, integration test environment
 * Patterns: Test setup/teardown, mock data, assertion patterns
 */

import { TaskServiceKysely } from '../../src/services/TaskService.kysely-poc';
import { DatabaseConnection } from '../../src/database/connection';
import { resetKyselyDb } from '../../src/database/kysely-connection';

describe('Kysely TaskService Proof of Concept', () => {
  let taskService: TaskServiceKysely;
  let dbConnection: DatabaseConnection;

  beforeAll(async () => {
    // Initialize database connection
    dbConnection = DatabaseConnection.getInstance();
    await dbConnection.initialize({ skipSchema: false });
    
    // Initialize TaskService
    taskService = new TaskServiceKysely();
  });

  afterAll(async () => {
    await dbConnection.close();
    resetKyselyDb();
  });

  beforeEach(async () => {
    // Clean up tasks table before each test
    const db = dbConnection.getDatabase();
    await db.run('DELETE FROM tasks');
    await db.run('DELETE FROM boards');
    
    // Insert test board
    await db.run(
      'INSERT INTO boards (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['test-board-1', 'Test Board', 'Test description', new Date().toISOString(), new Date().toISOString()]
    );
  });

  describe('Type Safety Validation', () => {
    test('should provide compile-time type checking for queries', async () => {
      // This test mainly validates that TypeScript compilation succeeds
      // The real value is in the IDE experience and compile-time errors
      
      const tasks = await taskService.getTasks({
        board_id: 'test-board-1',
        status: 'todo', // TypeScript ensures this is a valid status
        priority_min: 1,
        priority_max: 10,
        limit: 10,
        offset: 0,
        sortBy: 'created_at', // TypeScript ensures this is a valid column
        sortOrder: 'desc'
      });

      expect(Array.isArray(tasks)).toBe(true);
    });

    test('should create task with type-safe data', async () => {
      const taskData = {
        board_id: 'test-board-1',
        column_id: 'todo',
        title: 'Test Task',
        description: 'Test description',
        status: 'todo' as const, // TypeScript ensures type safety
        priority: 5,
        position: 0,
      };

      const task = await taskService.createTask(taskData);

      expect(task).toMatchObject({
        board_id: 'test-board-1',
        title: 'Test Task',
        status: 'todo',
        priority: 5,
      });
      expect(task.id).toBeDefined();
      expect(task.created_at).toBeDefined();
      expect(task.updated_at).toBeDefined();
    });
  });

  describe('Query Building', () => {
    test('should build complex filtered queries', async () => {
      // Create test tasks with different properties
      await taskService.createTask({
        board_id: 'test-board-1',
        column_id: 'todo',
        title: 'High Priority Task',
        priority: 9,
        status: 'todo',
        position: 0,
      });

      await taskService.createTask({
        board_id: 'test-board-1',
        column_id: 'in_progress',
        title: 'Medium Priority Task',
        priority: 5,
        status: 'in_progress',
        position: 0,
      });

      await taskService.createTask({
        board_id: 'test-board-1',
        column_id: 'done',
        title: 'Low Priority Task',
        priority: 2,
        status: 'done',
        position: 0,
      });

      // Test complex filtering
      const highPriorityTasks = await taskService.getTasks({
        board_id: 'test-board-1',
        priority_min: 8,
        status: 'todo',
      });

      expect(highPriorityTasks).toHaveLength(1);
      expect(highPriorityTasks[0].title).toBe('High Priority Task');

      // Test search functionality
      const searchResults = await taskService.getTasks({
        search: 'Medium',
      });

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].title).toBe('Medium Priority Task');
    });

    test('should handle joins correctly', async () => {
      const task = await taskService.createTask({
        board_id: 'test-board-1',
        column_id: 'todo',
        title: 'Parent Task',
        priority: 7,
        status: 'todo',
        position: 0,
      });

      // Create subtask
      await taskService.createTask({
        board_id: 'test-board-1',
        column_id: 'todo',
        title: 'Subtask',
        parent_task_id: task.id,
        priority: 5,
        status: 'todo',
        position: 0,
      });

      const taskWithSubtasks = await taskService.getTaskWithSubtasks(task.id);

      expect(taskWithSubtasks).toBeDefined();
      expect(taskWithSubtasks!.subtasks).toHaveLength(1);
      expect(taskWithSubtasks!.subtasks[0].title).toBe('Subtask');
    });
  });

  describe('Performance Comparison', () => {
    test('should demonstrate query performance', async () => {
      // Create multiple tasks for performance testing
      const createPromises = [];
      for (let i = 0; i < 100; i++) {
        createPromises.push(
          taskService.createTask({
            board_id: 'test-board-1',
            column_id: 'todo',
            title: `Task ${i}`,
            priority: Math.floor(Math.random() * 10) + 1,
            status: i % 3 === 0 ? 'todo' : i % 3 === 1 ? 'in_progress' : 'done',
            position: i,
          })
        );
      }

      await Promise.all(createPromises);

      // Measure query performance
      const startTime = Date.now();
      
      const tasks = await taskService.getTasks({
        board_id: 'test-board-1',
        priority_min: 5,
        limit: 20,
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(tasks.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should be fast
      
      console.log(`Kysely query took ${duration}ms for ${tasks.length} results`);
    });
  });

  describe('Transaction Support', () => {
    test('should handle transactions correctly', async () => {
      const task = await taskService.createTask({
        board_id: 'test-board-1',
        column_id: 'todo',
        title: 'Task to Move',
        status: 'todo',
        position: 0,
      });

      // Create another board
      const db = dbConnection.getDatabase();
      await db.run(
        'INSERT INTO boards (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['test-board-2', 'Test Board 2', 'Second board', new Date().toISOString(), new Date().toISOString()]
      );

      // Move task to different board using transaction
      const movedTask = await taskService.moveTaskToBoard(task.id, 'test-board-2', 'in_progress');

      expect(movedTask.board_id).toBe('test-board-2');
      expect(movedTask.column_id).toBe('in_progress');
      expect(movedTask.position).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent records gracefully', async () => {
      const task = await taskService.getTaskById('non-existent-id');
      expect(task).toBeNull();
    });

    test('should throw appropriate errors for invalid operations', async () => {
      await expect(
        taskService.updateTask('non-existent-id', { title: 'Updated' })
      ).rejects.toThrow('Task with id non-existent-id not found');
    });
  });
});