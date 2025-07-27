/**
 * Unit tests for database schema management
 */

import type { SchemaManager } from '@/database/schema';
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

describe('SchemaManager', () => {
  let dbConnection: DatabaseConnection;
  let schemaManager: SchemaManager;

  beforeEach(async () => {
    // Create a fresh database connection for each test
    dbConnection = DatabaseConnection.getInstance();

    // First close any existing connection
    if (dbConnection.isConnected()) {
      await dbConnection.close();
    }

    await dbConnection.initialize({ skipSchema: true });
    schemaManager = dbConnection.getSchemaManager();
  });

  afterEach(async () => {
    // Clean up after each test
    if (dbConnection.isConnected()) {
      try {
        await schemaManager.dropSchema();
      } catch (error) {
        // Ignore cleanup errors
      }
      await dbConnection.close();
    }
  });

  describe('Schema Creation', () => {
    it('should create complete database schema', async () => {
      expect(await schemaManager.schemaExists()).toBe(false);

      await schemaManager.createSchema();

      expect(await schemaManager.schemaExists()).toBe(true);

      // Verify core tables exist
      const tables = await dbConnection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('boards');
      expect(tableNames).toContain('tasks');
      expect(tableNames).toContain('columns');
      expect(tableNames).toContain('notes');
      expect(tableNames).toContain('tags');
      expect(tableNames).toContain('task_tags');
      expect(tableNames).toContain('task_dependencies');
      expect(tableNames).toContain('schema_info');
    });

    it('should create FTS tables', async () => {
      await schemaManager.createSchema();

      const ftsTables = await dbConnection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE '%_fts'
        ORDER BY name
      `);

      const ftsTableNames = ftsTables.map(t => t.name);
      expect(ftsTableNames).toContain('tasks_fts');
      expect(ftsTableNames).toContain('notes_fts');
    });

    it('should create indexes for performance', async () => {
      await schemaManager.createSchema();

      const indexes = await dbConnection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const indexNames = indexes.map(i => i.name);
      expect(indexNames.length).toBeGreaterThan(10); // Should have many indexes
      expect(indexNames).toContain('idx_tasks_board_id');
      expect(indexNames).toContain('idx_tasks_column_id');
      expect(indexNames).toContain('idx_tasks_priority');
    });

    it('should create useful views', async () => {
      await schemaManager.createSchema();

      const views = await dbConnection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='view'
        ORDER BY name
      `);

      const viewNames = views.map(v => v.name);
      expect(viewNames).toContain('active_tasks');
      expect(viewNames).toContain('task_dependency_graph');
      expect(viewNames).toContain('board_stats');
    });

    it('should create triggers', async () => {
      await schemaManager.createSchema();

      const triggers = await dbConnection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='trigger'
        ORDER BY name
      `);

      const triggerNames = triggers.map(t => t.name);
      expect(triggerNames.length).toBeGreaterThan(5);
      expect(triggerNames).toContain('tasks_fts_insert');
      expect(triggerNames).toContain('update_tasks_timestamp');
      expect(triggerNames).toContain('increment_tag_usage');
    });

    it('should record schema version', async () => {
      await schemaManager.createSchema();

      const schemaInfo = await schemaManager.getSchemaInfo();
      expect(schemaInfo.version).toMatch(/^\d+\.\d+\.\d+$/); // Semver format
    });

    it('should handle creation errors gracefully', async () => {
      // Mock a database error
      const originalExecute = dbConnection.execute;
      dbConnection.execute = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(schemaManager.createSchema()).rejects.toThrow('Schema creation failed');

      // Restore original method
      dbConnection.execute = originalExecute;
    });
  });

  describe('Schema Validation', () => {
    beforeEach(async () => {
      await schemaManager.createSchema();
    });

    it('should validate complete schema as valid', async () => {
      const validation = await schemaManager.validateSchema();

      expect(validation.isValid).toBe(true);
      expect(validation.missingTables).toHaveLength(0);
      expect(validation.missingIndexes).toHaveLength(0);
      expect(validation.missingViews).toHaveLength(0);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing tables', async () => {
      // Drop a table
      await dbConnection.execute('DROP TABLE boards');

      const validation = await schemaManager.validateSchema();

      expect(validation.isValid).toBe(false);
      expect(validation.missingTables).toContain('boards');
    });

    it('should detect missing indexes', async () => {
      // Drop an index
      await dbConnection.execute('DROP INDEX IF EXISTS idx_tasks_board_id');

      const validation = await schemaManager.validateSchema();

      expect(validation.isValid).toBe(false);
      expect(validation.missingIndexes).toContain('idx_tasks_board_id');
    });

    it('should detect missing views', async () => {
      // Drop a view
      await dbConnection.execute('DROP VIEW IF EXISTS active_tasks');

      const validation = await schemaManager.validateSchema();

      expect(validation.isValid).toBe(false);
      expect(validation.missingViews).toContain('active_tasks');
    });

    it('should handle validation errors gracefully', async () => {
      // Mock a database error
      const originalQuery = dbConnection.query;
      dbConnection.query = jest.fn().mockRejectedValue(new Error('Database error'));

      const validation = await schemaManager.validateSchema();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Database error');

      // Restore original method
      dbConnection.query = originalQuery;
    });
  });

  describe('Schema Information', () => {
    beforeEach(async () => {
      await schemaManager.createSchema();
    });

    it('should return schema information', async () => {
      const schemaInfo = await schemaManager.getSchemaInfo();

      expect(schemaInfo.version).toBeDefined();
      expect(schemaInfo.tables.length).toBeGreaterThan(5);
      expect(schemaInfo.indexes.length).toBeGreaterThan(10);
      expect(schemaInfo.views.length).toBeGreaterThan(2);
      expect(schemaInfo.triggers.length).toBeGreaterThan(5);
    });

    it('should detect schema existence', async () => {
      expect(await schemaManager.schemaExists()).toBe(true);

      await schemaManager.dropSchema();

      expect(await schemaManager.schemaExists()).toBe(false);
    });

    it('should return database statistics', async () => {
      const stats = await schemaManager.getDatabaseStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('pageCount');
      expect(stats).toHaveProperty('tableCounts');
      expect(stats).toHaveProperty('totalRecords');

      expect(typeof stats.size).toBe('number');
      expect(typeof stats.totalRecords).toBe('number');
      expect(stats.tableCounts).toHaveProperty('boards');
      expect(stats.tableCounts).toHaveProperty('tasks');
    });
  });

  describe('Schema Management', () => {
    it('should drop schema completely', async () => {
      await schemaManager.createSchema();
      expect(await schemaManager.schemaExists()).toBe(true);

      await schemaManager.dropSchema();

      expect(await schemaManager.schemaExists()).toBe(false);

      // Verify no user tables remain (excluding FTS shadow tables)
      const tables = await dbConnection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        AND name NOT LIKE 'sqlite_%'
        AND name NOT LIKE '%_fts%'
      `);
      expect(tables).toHaveLength(0);
    });

    it('should handle drop errors gracefully', async () => {
      // Try to drop non-existent schema
      await expect(schemaManager.dropSchema()).resolves.not.toThrow();
    });
  });

  describe('Data Integrity', () => {
    beforeEach(async () => {
      await schemaManager.createSchema();
    });

    it('should enforce foreign key constraints', async () => {
      // Try to insert task with invalid board_id
      await expect(
        dbConnection.execute(`
          INSERT INTO tasks (id, board_id, column_id, title)
          VALUES ('test', 'invalid-board', 'invalid-column', 'Test Task')
        `)
      ).rejects.toThrow();
    });

    it('should enforce unique constraints', async () => {
      // Create a board
      await dbConnection.execute(`
        INSERT INTO boards (id, name) VALUES ('board1', 'Test Board')
      `);

      // Try to create another board with same name
      await expect(
        dbConnection.execute(`
          INSERT INTO boards (id, name) VALUES ('board2', 'Test Board')
        `)
      ).rejects.toThrow();
    });

    it('should enforce check constraints', async () => {
      // Create test data
      await dbConnection.execute(`
        INSERT INTO boards (id, name) VALUES ('board1', 'Test Board')
      `);
      await dbConnection.execute(`
        INSERT INTO columns (id, board_id, name, position) VALUES ('col1', 'board1', 'Todo', 1)
      `);

      // Try to insert task with invalid priority
      await expect(
        dbConnection.execute(`
          INSERT INTO tasks (id, board_id, column_id, title, priority)
          VALUES ('task1', 'board1', 'col1', 'Test Task', 'invalid')
        `)
      ).rejects.toThrow();
    });
  });

  describe('Full-Text Search Setup', () => {
    beforeEach(async () => {
      await schemaManager.createSchema();
    });

    it('should set up FTS triggers for tasks', async () => {
      // Create test data
      await dbConnection.execute(`
        INSERT INTO boards (id, name) VALUES ('board1', 'Test Board')
      `);
      await dbConnection.execute(`
        INSERT INTO columns (id, board_id, name, position) VALUES ('col1', 'board1', 'Todo', 1)
      `);

      // Insert a task with all required fields
      await dbConnection.execute(`
        INSERT INTO tasks (id, board_id, column_id, title, description, position)
        VALUES ('task1', 'board1', 'col1', 'Test Task', 'This is a test description', 1)
      `);

      // Verify FTS table was populated
      const ftsResults = await dbConnection.query(`
        SELECT * FROM tasks_fts WHERE tasks_fts MATCH 'test'
      `);
      expect(ftsResults.length).toBeGreaterThan(0);
    });

    it('should set up FTS triggers for notes', async () => {
      // Create test data
      await dbConnection.execute(`
        INSERT INTO boards (id, name) VALUES ('board1', 'Test Board')
      `);

      // Insert a note
      await dbConnection.execute(`
        INSERT INTO notes (id, board_id, title, content)
        VALUES ('note1', 'board1', 'Test Note', 'This is searchable content')
      `);

      // Verify FTS table was populated
      const ftsResults = await dbConnection.query(`
        SELECT * FROM notes_fts WHERE notes_fts MATCH 'searchable'
      `);
      expect(ftsResults.length).toBeGreaterThan(0);
    });
  });
});
