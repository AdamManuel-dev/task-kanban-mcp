/**
 * Unit tests for TaskService
 *
 * @description Comprehensive test suite covering all TaskService functionality
 * including CRUD operations, dependencies, priorities, and edge cases.
 */

import { TaskService } from '@/services/TaskService';
import { DatabaseConnection } from '@/database/connection';
import { logger } from '@/utils/logger';

// Mock the logger to avoid console output during tests
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('TaskService', () => {
  let dbConnection: DatabaseConnection;
  let taskService: TaskService;
  let boardId: string;
  let columnId: string;

  beforeEach(async () => {
    // Force a new database instance for testing
    (DatabaseConnection as any).instance = null;
    dbConnection = DatabaseConnection.getInstance();

    if (dbConnection.isConnected()) {
      await dbConnection.close();
    }

    // Use test-specific database file
    process.env.DATABASE_PATH = './data/kanban-test.db';

    await dbConnection.initialize();
    taskService = new TaskService(dbConnection);

    // Set up test data
    boardId = 'test-board-1';
    columnId = 'todo';

    // Create test board and column
    await dbConnection.execute('INSERT INTO boards (id, name, description) VALUES (?, ?, ?)', [
      boardId,
      'Test Board',
      'Test board for TaskService tests',
    ]);

    await dbConnection.execute(
      'INSERT INTO columns (id, board_id, name, position) VALUES (?, ?, ?, ?)',
      [columnId, boardId, 'To Do', 1]
    );
  });

  afterEach(async () => {
    if (dbConnection.isConnected()) {
      try {
        // Clean up test data
        await dbConnection.execute('DELETE FROM task_dependencies');
        await dbConnection.execute('DELETE FROM tasks');
        await dbConnection.execute('DELETE FROM columns');
        await dbConnection.execute('DELETE FROM boards');
      } catch (error) {
        // Ignore cleanup errors
      }
      await dbConnection.close();
    }

    // Clean up test database
    const fs = require('fs');
    const testDbPath = './data/kanban-test.db';
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('1. Task Creation (Foundation)', () => {
    it('should create a basic task successfully', async () => {
      const taskData = {
        title: 'Test Task',
        description: 'Test task description',
        board_id: boardId,
        column_id: columnId,
        priority: 5,
      };

      const task = await taskService.createTask(taskData);

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.title).toBe(taskData.title);
      expect(task.description).toBe(taskData.description);
      expect(task.board_id).toBe(taskData.board_id);
      expect(task.column_id).toBe(taskData.column_id);
      expect(task.priority).toBe(taskData.priority);
      expect(task.status).toBe('todo');
      expect(task.position).toBe(1);
      expect(task.created_at).toBeDefined();
      expect(task.updated_at).toBeDefined();
    });

    it('should create task with minimal required fields', async () => {
      const taskData = {
        title: 'Minimal Task',
        board_id: boardId,
        column_id: columnId,
      };

      const task = await taskService.createTask(taskData);

      expect(task).toBeDefined();
      expect(task.title).toBe(taskData.title);
      expect(task.board_id).toBe(taskData.board_id);
      expect(task.column_id).toBe(taskData.column_id);
      expect(task.priority).toBe(1); // Default priority
      expect(task.status).toBe('todo'); // Default status
      expect(task.position).toBe(1); // First task position
    });

    it('should handle task creation with custom position', async () => {
      // Create first task
      await taskService.createTask({
        title: 'First Task',
        board_id: boardId,
        column_id: columnId,
      });

      // Create second task with specific position
      const task = await taskService.createTask({
        title: 'Second Task',
        board_id: boardId,
        column_id: columnId,
        position: 1, // Should be inserted at position 1, moving first task to position 2
      });

      expect(task.position).toBe(1);

      // Verify positions were updated correctly
      const tasks = await taskService.getTasks({ board_id: boardId, column_id: columnId });
      expect(tasks.length).toBe(2);

      const firstTask = tasks.find(t => t.title === 'First Task');
      const secondTask = tasks.find(t => t.title === 'Second Task');

      expect(firstTask?.position).toBe(2);
      expect(secondTask?.position).toBe(1);
    });

    it('should throw error for invalid board_id', async () => {
      const taskData = {
        title: 'Invalid Task',
        board_id: 'invalid-board',
        column_id: columnId,
      };

      await expect(taskService.createTask(taskData)).rejects.toThrow();
    });

    it('should throw error for invalid column_id', async () => {
      const taskData = {
        title: 'Invalid Task',
        board_id: boardId,
        column_id: 'invalid-column',
      };

      await expect(taskService.createTask(taskData)).rejects.toThrow();
    });

    it('should handle task creation with parent task', async () => {
      // Create parent task first
      const parentTask = await taskService.createTask({
        title: 'Parent Task',
        board_id: boardId,
        column_id: columnId,
      });

      // Create subtask
      const subtask = await taskService.createTask({
        title: 'Subtask',
        board_id: boardId,
        column_id: columnId,
        parent_task_id: parentTask.id,
      });

      expect(subtask.parent_task_id).toBe(parentTask.id);

      // Verify subtask relationship
      const subtasks = await taskService.getSubtasks(parentTask.id);
      expect(subtasks).toHaveLength(1);
      expect(subtasks[0].id).toBe(subtask.id);
    });
  });

  describe('2. Task Retrieval (Basic Operations)', () => {
    beforeEach(async () => {
      // Create test tasks
      await taskService.createTask({
        title: 'Task 1',
        description: 'First test task',
        board_id: boardId,
        column_id: columnId,
        priority: 5,
        status: 'in_progress',
      });

      await taskService.createTask({
        title: 'Task 2',
        description: 'Second test task',
        board_id: boardId,
        column_id: columnId,
        priority: 3,
        status: 'todo',
      });
    });

    it('should get task by ID', async () => {
      const tasks = await taskService.getTasks({ board_id: boardId });
      const taskId = tasks[0].id;

      const task = await taskService.getTaskById(taskId);

      expect(task).toBeDefined();
      expect(task.id).toBe(taskId);
      expect(task.title).toBeDefined();
    });

    it('should return null for non-existent task ID', async () => {
      const task = await taskService.getTaskById('non-existent-id');
      expect(task).toBeNull();
    });

    it('should get all tasks without filters', async () => {
      const tasks = await taskService.getTasks();

      expect(tasks).toHaveLength(2);
      expect(tasks.every(task => task.board_id === boardId)).toBe(true);
    });

    it('should filter tasks by board_id', async () => {
      const tasks = await taskService.getTasks({ board_id: boardId });

      expect(tasks).toHaveLength(2);
      expect(tasks.every(task => task.board_id === boardId)).toBe(true);
    });

    it('should filter tasks by status', async () => {
      const inProgressTasks = await taskService.getTasks({ status: 'in_progress' });
      const todoTasks = await taskService.getTasks({ status: 'todo' });

      expect(inProgressTasks).toHaveLength(1);
      expect(todoTasks).toHaveLength(1);
      expect(inProgressTasks[0].status).toBe('in_progress');
      expect(todoTasks[0].status).toBe('todo');
    });

    it('should handle pagination', async () => {
      // Create more tasks for pagination test
      for (let i = 3; i <= 5; i++) {
        await taskService.createTask({
          title: `Task ${String(i)}`,
          board_id: boardId,
          column_id: columnId,
        });
      }

      const firstPage = await taskService.getTasks({
        board_id: boardId,
        limit: 2,
        offset: 0,
      });

      const secondPage = await taskService.getTasks({
        board_id: boardId,
        limit: 2,
        offset: 2,
      });

      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      expect(firstPage[0].id).not.toBe(secondPage[0].id);
    });

    it('should sort tasks by priority', async () => {
      const tasks = await taskService.getTasks({
        board_id: boardId,
        sort_by: 'priority',
        sort_order: 'desc',
      });

      expect(tasks).toHaveLength(2);
      expect(tasks[0].priority).toBeGreaterThanOrEqual(tasks[1].priority);
    });
  });

  describe('3. Task Updates (Lifecycle Management)', () => {
    let taskId: string;

    beforeEach(async () => {
      const task = await taskService.createTask({
        title: 'Update Test Task',
        description: 'Task for update testing',
        board_id: boardId,
        column_id: columnId,
        priority: 3,
        status: 'todo',
      });
      taskId = task.id;
    });

    it('should update task title', async () => {
      const updatedTask = await taskService.updateTask(taskId, {
        title: 'Updated Title',
      });

      expect(updatedTask.title).toBe('Updated Title');
      expect(updatedTask.id).toBe(taskId);

      // Verify in database
      const dbTask = await taskService.getTaskById(taskId);
      expect(dbTask?.title).toBe('Updated Title');
    });

    it('should update task status', async () => {
      const updatedTask = await taskService.updateTask(taskId, {
        status: 'done',
      });

      expect(updatedTask.status).toBe('done');
      expect(updatedTask.completed_at).toBeDefined();
    });

    it('should update task priority', async () => {
      const updatedTask = await taskService.updateTask(taskId, {
        priority: 8,
      });

      expect(updatedTask.priority).toBe(8);
    });

    it('should handle partial updates', async () => {
      const originalTask = await taskService.getTaskById(taskId);

      const updatedTask = await taskService.updateTask(taskId, {
        description: 'Updated description only',
      });

      expect(updatedTask.description).toBe('Updated description only');
      expect(updatedTask.title).toBe(originalTask?.title); // Should remain unchanged
      expect(updatedTask.priority).toBe(originalTask?.priority); // Should remain unchanged
    });

    it.skip('should update updated_at timestamp', async () => {
      const originalTask = await taskService.getTaskById(taskId);
      expect(originalTask).toBeDefined();
      const originalUpdatedAt = originalTask!.updated_at;
      expect(originalUpdatedAt).toBeDefined();

      // Ensure we have a valid timestamp
      const originalTime =
        originalUpdatedAt instanceof Date
          ? originalUpdatedAt.getTime()
          : new Date(originalUpdatedAt).getTime();
      expect(originalTime).not.toBeNaN();

      // Wait a bit to ensure timestamp difference
      await new Promise<void>(resolve => {
        setTimeout(resolve, 10);
      });

      const updatedTask = await taskService.updateTask(taskId, {
        title: 'New timestamp test',
      });

      expect(updatedTask.updated_at).not.toBe(originalUpdatedAt);

      const updatedTime =
        updatedTask.updated_at instanceof Date
          ? updatedTask.updated_at.getTime()
          : new Date(updatedTask.updated_at).getTime();

      expect(updatedTime).not.toBeNaN();
      expect(updatedTime).toBeGreaterThan(originalTime);
    });

    it('should throw error for non-existent task', async () => {
      await expect(
        taskService.updateTask('non-existent-id', {
          title: 'Should fail',
        })
      ).rejects.toThrow();
    });
  });

  describe('4. Task Positioning (Organization)', () => {
    beforeEach(async () => {
      // Create tasks in sequence
      await taskService.createTask({
        title: 'Task 1',
        board_id: boardId,
        column_id: columnId,
        position: 1,
      });

      await taskService.createTask({
        title: 'Task 2',
        board_id: boardId,
        column_id: columnId,
        position: 2,
      });

      await taskService.createTask({
        title: 'Task 3',
        board_id: boardId,
        column_id: columnId,
        position: 3,
      });
    });

    it.skip('should move task to new position within same column', async () => {
      const tasks = await taskService.getTasks({
        board_id: boardId,
        column_id: columnId,
        sort_by: 'position',
      });

      // Move task from position 3 to position 1
      const movedTask = await taskService.updateTask(tasks[2].id, {
        position: 1,
      });

      expect(movedTask.position).toBe(1);

      // Verify all positions are correct
      const updatedTasks = await taskService.getTasks({
        board_id: boardId,
        column_id: columnId,
        sort_by: 'position',
      });

      expect(updatedTasks[0].title).toBe('Task 3'); // Moved to position 1
      expect(updatedTasks[1].title).toBe('Task 1'); // Moved to position 2
      expect(updatedTasks[2].title).toBe('Task 2'); // Moved to position 3
    });
  });

  describe('5. Subtask Management (Hierarchical Structure)', () => {
    let parentTaskId: string;

    beforeEach(async () => {
      const parentTask = await taskService.createTask({
        title: 'Parent Task',
        description: 'Task with subtasks',
        board_id: boardId,
        column_id: columnId,
      });
      parentTaskId = parentTask.id;
    });

    it('should create subtask', async () => {
      const subtask = await taskService.createTask({
        title: 'Subtask 1',
        board_id: boardId,
        column_id: columnId,
        parent_task_id: parentTaskId,
      });

      expect(subtask.parent_task_id).toBe(parentTaskId);

      const subtasks = await taskService.getSubtasks(parentTaskId);
      expect(subtasks).toHaveLength(1);
      expect(subtasks[0].id).toBe(subtask.id);
    });

    it('should get subtasks for parent task', async () => {
      await taskService.createTask({
        title: 'Subtask 1',
        board_id: boardId,
        column_id: columnId,
        parent_task_id: parentTaskId,
      });

      await taskService.createTask({
        title: 'Subtask 2',
        board_id: boardId,
        column_id: columnId,
        parent_task_id: parentTaskId,
      });

      const subtasks = await taskService.getSubtasks(parentTaskId);
      expect(subtasks).toHaveLength(2);
      expect(subtasks.every(st => st.parent_task_id === parentTaskId)).toBe(true);
    });

    it('should return empty array for task with no subtasks', async () => {
      const subtasks = await taskService.getSubtasks(parentTaskId);
      expect(subtasks).toHaveLength(0);
    });
  });

  describe('6. Task Dependencies (Workflow Management)', () => {
    let task1Id: string;
    let task2Id: string;
    let task3Id: string;

    beforeEach(async () => {
      const task1 = await taskService.createTask({
        title: 'Task 1',
        board_id: boardId,
        column_id: columnId,
      });
      task1Id = task1.id;

      const task2 = await taskService.createTask({
        title: 'Task 2',
        board_id: boardId,
        column_id: columnId,
      });
      task2Id = task2.id;

      const task3 = await taskService.createTask({
        title: 'Task 3',
        board_id: boardId,
        column_id: columnId,
      });
      task3Id = task3.id;
    });

    it('should add task dependency', async () => {
      await taskService.addTaskDependency(task2Id, task1Id);

      const dependencies = await taskService.getTaskDependencies(task2Id);
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].depends_on_task_id).toBe(task1Id);
    });

    it('should get task dependencies', async () => {
      await taskService.addTaskDependency(task2Id, task1Id);
      await taskService.addTaskDependency(task3Id, task2Id);

      const task2Dependencies = await taskService.getTaskDependencies(task2Id);
      const task3Dependencies = await taskService.getTaskDependencies(task3Id);

      expect(task2Dependencies).toHaveLength(1);
      expect(task3Dependencies).toHaveLength(1);
      expect(task2Dependencies[0].depends_on_task_id).toBe(task1Id);
      expect(task3Dependencies[0].depends_on_task_id).toBe(task2Id);
    });

    it('should remove task dependency', async () => {
      await taskService.addTaskDependency(task2Id, task1Id);

      let dependencies = await taskService.getTaskDependencies(task2Id);
      expect(dependencies).toHaveLength(1);

      await taskService.removeTaskDependency(task2Id, task1Id);

      dependencies = await taskService.getTaskDependencies(task2Id);
      expect(dependencies).toHaveLength(0);
    });

    it('should prevent circular dependencies', async () => {
      await taskService.addTaskDependency(task2Id, task1Id);
      await taskService.addTaskDependency(task3Id, task2Id);

      // This should throw an error as it creates a circular dependency
      await expect(taskService.addTaskDependency(task1Id, task3Id)).rejects.toThrow();
    });

    it('should prevent self-dependency', async () => {
      await expect(taskService.addTaskDependency(task1Id, task1Id)).rejects.toThrow();
    });
  });

  describe('7. Task Search (Advanced Queries)', () => {
    beforeEach(async () => {
      await taskService.createTask({
        title: 'Implement authentication system',
        description: 'Add JWT-based authentication',
        board_id: boardId,
        column_id: columnId,
      });

      await taskService.createTask({
        title: 'Design user interface',
        description: 'Create mockups and wireframes',
        board_id: boardId,
        column_id: columnId,
      });

      await taskService.createTask({
        title: 'Setup database schema',
        description: 'Design and implement database structure',
        board_id: boardId,
        column_id: columnId,
      });
    });

    it('should search tasks by title', async () => {
      const results = await taskService.searchTasks('authentication');

      expect(results).toHaveLength(1);
      expect(results[0].title).toContain('authentication');
    });

    it('should search tasks by description', async () => {
      const results = await taskService.searchTasks('JWT');

      expect(results).toHaveLength(1);
      expect(results[0].description).toContain('JWT');
    });

    it('should return empty array for no matches', async () => {
      const results = await taskService.searchTasks('nonexistent');

      expect(results).toHaveLength(0);
    });

    it('should handle case-insensitive search', async () => {
      const results = await taskService.searchTasks('AUTHENTICATION');

      expect(results).toHaveLength(1);
    });
  });

  describe('8. Task Deletion (Cleanup)', () => {
    let taskId: string;

    beforeEach(async () => {
      const task = await taskService.createTask({
        title: 'Delete Test Task',
        board_id: boardId,
        column_id: columnId,
      });
      taskId = task.id;
    });

    it('should delete task successfully', async () => {
      await taskService.deleteTask(taskId);

      const deletedTask = await taskService.getTaskById(taskId);
      expect(deletedTask).toBeNull();
    });

    it('should throw error for non-existent task', async () => {
      await expect(taskService.deleteTask('non-existent-id')).rejects.toThrow();
    });

    it('should handle deletion of task with subtasks', async () => {
      // Create subtask
      const subtask = await taskService.createTask({
        title: 'Subtask to be orphaned',
        board_id: boardId,
        column_id: columnId,
        parent_task_id: taskId,
      });

      await taskService.deleteTask(taskId);

      // Verify parent task is deleted
      const deletedParent = await taskService.getTaskById(taskId);
      expect(deletedParent).toBeNull();

      // Verify subtask still exists but parent_task_id is cleared
      const orphanedSubtask = await taskService.getTaskById(subtask.id);
      expect(orphanedSubtask).toBeDefined();
      expect(orphanedSubtask?.parent_task_id).toBeNull();
    });
  });

  describe('9. Error Handling & Edge Cases', () => {
    it('should handle database connection errors gracefully', async () => {
      // Close database connection to simulate error
      await dbConnection.close();

      await expect(taskService.getTasks()).rejects.toThrow();
    });

    it('should validate required fields', async () => {
      await expect(
        taskService.createTask({
          title: '',
          board_id: boardId,
          column_id: columnId,
        })
      ).rejects.toThrow();
    });

    it('should handle invalid status values', async () => {
      const task = await taskService.createTask({
        title: 'Test Task',
        board_id: boardId,
        column_id: columnId,
      });

      await expect(
        taskService.updateTask(task.id, {
          status: 'invalid_status' as any,
        })
      ).rejects.toThrow();
    });
  });
});
