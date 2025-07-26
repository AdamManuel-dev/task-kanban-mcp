/**
 * Simple TaskService test to debug basic functionality
 */

import { TaskService } from '@/services/TaskService';
import { DatabaseConnection } from '@/database/connection';
import { logger } from '@/utils/logger';

// Mock the logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('TaskService - Simple Tests', () => {
  let dbConnection: DatabaseConnection;
  let taskService: TaskService;

  beforeAll(async () => {
    // Create fresh database connection
    dbConnection = DatabaseConnection.getInstance();
    
    if (dbConnection.isConnected()) {
      await dbConnection.close();
    }
    
    // Initialize with schema creation enabled (default)
    await dbConnection.initialize();
    taskService = new TaskService(dbConnection);

    // Check if schema exists, if not create it
    const schemaManager = dbConnection.getSchemaManager();
    if (!await schemaManager.schemaExists()) {
      await schemaManager.createSchema();
    }

    // Set up test data - create a board and column manually
    await dbConnection.execute(
      'INSERT OR IGNORE INTO boards (id, name, description) VALUES (?, ?, ?)',
      ['test-board', 'Test Board', 'Test board for TaskService tests']
    );

    await dbConnection.execute(
      'INSERT OR IGNORE INTO columns (id, board_id, name, position) VALUES (?, ?, ?, ?)',
      ['todo', 'test-board', 'To Do', 1]
    );
  });

  afterAll(async () => {
    if (dbConnection.isConnected()) {
      await dbConnection.close();
    }
  });

  it('should create a simple task without positioning', async () => {
    // Manually insert a task to test basic database operations
    const taskId = 'manual-task-1';
    
    await dbConnection.execute(`
      INSERT INTO tasks (
        id, title, description, board_id, column_id, position, priority, status, 
        created_at, updated_at, archived
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      taskId, 'Manual Task', 'Test task', 'test-board', 'todo', 
      1, 1, 'todo', new Date(), new Date(), false
    ]);

    // Try to retrieve it
    const task = await taskService.getTaskById(taskId);
    
    expect(task).toBeDefined();
    expect(task?.title).toBe('Manual Task');
  });

  it('should be able to fetch tasks', async () => {
    const tasks = await taskService.getTasks();
    expect(Array.isArray(tasks)).toBe(true);
  });
});