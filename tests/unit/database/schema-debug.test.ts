/**
 * Debug test to isolate database schema issues
 */

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

describe('Schema Debug Tests', () => {
  let dbConnection: DatabaseConnection;

  beforeAll(async () => {
    // Force a new database instance for testing
    (DatabaseConnection as any).instance = null;
    dbConnection = DatabaseConnection.getInstance();
    
    if (dbConnection.isConnected()) {
      await dbConnection.close();
    }
    
    // Use test-specific database file
    process.env.DATABASE_PATH = './data/kanban-test.db';
    
    await dbConnection.initialize();
  });

  afterAll(async () => {
    if (dbConnection.isConnected()) {
      await dbConnection.close();
    }
    
    // Clean up test database
    const fs = require('fs');
    const testDbPath = './data/kanban-test.db';
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should show current database schema', async () => {
    // Check if tasks table exists
    const tables = await dbConnection.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'"
    );
    
    // Use fail to force output
    if (tables.length === 0) {
      fail('SCHEMA DEBUG: No tasks table found - schema not created');
    }

    if (tables.length > 0) {
      // Get schema for tasks table
      const schema = await dbConnection.query("PRAGMA table_info(tasks)");
      console.log('Tasks table schema:');
      schema.forEach((col: any) => {
        console.log(`  ${col.name}: ${col.type} (${col.notnull ? 'NOT NULL' : 'NULLABLE'})`);
      });

      // Check for status column specifically
      const statusColumn = schema.find((col: any) => col.name === 'status');
      if (!statusColumn) {
        const columnNames = schema.map((col: any) => col.name);
        throw new Error(`STATUS COLUMN MISSING! Available columns: ${columnNames.join(', ')}`);
      }
    } else {
      console.log('Tasks table does not exist - this is the problem!');
    }

    // Check schema manager
    const schemaManager = dbConnection.getSchemaManager();
    const schemaExists = await schemaManager.schemaExists();
    console.log('Schema exists:', schemaExists);

    if (!schemaExists) {
      console.log('Creating schema...');
      await schemaManager.createSchema();
      
      // Re-check tasks table
      const tablesAfter = await dbConnection.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'"
      );
      console.log('Tables after schema creation:', tablesAfter);
    }
    
    console.log('=== SCHEMA DEBUG END ===');
  });
});