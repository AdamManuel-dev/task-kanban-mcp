/**
 * @fileoverview Test for sample boards seed migration
 * @lastmodified 2025-07-28T04:30:00Z
 * 
 * Features: Board and column creation validation
 * Main APIs: Sample boards seed testing
 * Constraints: Database integration test
 * Patterns: Migration testing, data validation
 */

import { Database } from 'sqlite3';
import { promisify } from 'util';
import { run, name, description } from '../../../../src/database/seeds/001_sample_boards';
import path from 'path';
import fs from 'fs/promises';

// Mock database interface to match the sqlite wrapper
interface MockDatabase {
  run(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
  get(sql: string, params?: any[]): Promise<any>;
}

interface Board {
  id: string;
  name: string;
  description: string;
  color: string;
}

interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  wip_limit: number | null;
}

describe('001_sample_boards seed', () => {
  let db: Database;
  let mockDb: MockDatabase;
  let tempDbPath: string;

  beforeEach(async () => {
    // Create temporary database for testing
    tempDbPath = path.join(__dirname, 'test-sample-boards.db');
    
    // Remove existing test database
    try {
      await fs.unlink(tempDbPath);
    } catch {
      // File doesn't exist, ignore
    }

    db = new Database(tempDbPath);

    // Create mock database interface that matches the sqlite wrapper
    const run = promisify(db.run.bind(db));
    const all = promisify(db.all.bind(db));
    const get = promisify(db.get.bind(db));

    mockDb = {
      run: async (sql: string, params?: any[]) => {
        return await run(sql, params || []);
      },
      all: async (sql: string, params?: any[]) => {
        return await all(sql, params || []);
      },
      get: async (sql: string, params?: any[]) => {
        return await get(sql, params || []);
      }
    };

    // Create required tables
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE boards (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE columns (
            id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL,
            name TEXT NOT NULL,
            position INTEGER NOT NULL,
            wip_limit INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  });

  afterEach(async () => {
    // Close database and clean up
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });

    try {
      await fs.unlink(tempDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should have correct metadata', () => {
    expect(name).toBe('Sample Boards');
    expect(description).toBe('Create sample boards with columns for development');
  });

  test('should create sample boards', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify boards were created
    const boards = await mockDb.all('SELECT * FROM boards ORDER BY id') as Board[];
    
    expect(boards).toHaveLength(3);
    
    // Check Development Board
    expect(boards[0]).toMatchObject({
      id: 'board-1',
      name: 'Development Board',
      description: 'Main development board for tracking features and bugs',
      color: '#2196F3'
    });

    // Check Personal Tasks
    expect(boards[1]).toMatchObject({
      id: 'board-2',
      name: 'Personal Tasks',
      description: 'Personal task management board',
      color: '#4CAF50'
    });

    // Check Project Planning
    expect(boards[2]).toMatchObject({
      id: 'board-3',
      name: 'Project Planning',
      description: 'Long-term project planning and roadmap',
      color: '#FF9800'
    });
  });

  test('should create columns for Development Board', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify Development Board columns
    const devColumns = await mockDb.all(
      'SELECT * FROM columns WHERE board_id = ? ORDER BY position',
      ['board-1']
    ) as Column[];

    expect(devColumns).toHaveLength(6);

    const expectedColumns = [
      { id: 'col-1', name: 'Backlog', position: 1, wip_limit: null },
      { id: 'col-2', name: 'To Do', position: 2, wip_limit: 5 },
      { id: 'col-3', name: 'In Progress', position: 3, wip_limit: 3 },
      { id: 'col-4', name: 'Code Review', position: 4, wip_limit: 2 },
      { id: 'col-5', name: 'Testing', position: 5, wip_limit: 3 },
      { id: 'col-6', name: 'Done', position: 6, wip_limit: null }
    ];

    expectedColumns.forEach((expected, index) => {
      expect(devColumns[index]).toMatchObject({
        ...expected,
        board_id: 'board-1'
      });
    });
  });

  test('should create columns for Personal Tasks', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify Personal Tasks columns
    const personalColumns = await mockDb.all(
      'SELECT * FROM columns WHERE board_id = ? ORDER BY position',
      ['board-2']
    ) as Column[];

    expect(personalColumns).toHaveLength(3);

    const expectedColumns = [
      { id: 'col-7', name: 'To Do', position: 1, wip_limit: null },
      { id: 'col-8', name: 'Doing', position: 2, wip_limit: 3 },
      { id: 'col-9', name: 'Done', position: 3, wip_limit: null }
    ];

    expectedColumns.forEach((expected, index) => {
      expect(personalColumns[index]).toMatchObject({
        ...expected,
        board_id: 'board-2'
      });
    });
  });

  test('should create columns for Project Planning', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify Project Planning columns
    const planningColumns = await mockDb.all(
      'SELECT * FROM columns WHERE board_id = ? ORDER BY position',
      ['board-3']
    ) as Column[];

    expect(planningColumns).toHaveLength(4);

    const expectedColumns = [
      { id: 'col-10', name: 'Ideas', position: 1, wip_limit: null },
      { id: 'col-11', name: 'Planned', position: 2, wip_limit: null },
      { id: 'col-12', name: 'In Progress', position: 3, wip_limit: 2 },
      { id: 'col-13', name: 'Completed', position: 4, wip_limit: null }
    ];

    expectedColumns.forEach((expected, index) => {
      expect(planningColumns[index]).toMatchObject({
        ...expected,
        board_id: 'board-3'
      });
    });
  });

  test('should handle duplicate execution gracefully', async () => {
    // Run the seed twice
    await run(mockDb as any);
    
    // This should fail due to primary key constraints
    await expect(run(mockDb as any)).rejects.toThrow();

    // Verify data integrity - still only 3 boards
    const boards = await mockDb.all('SELECT * FROM boards') as Board[];
    expect(boards).toHaveLength(3);
  });

  test('should create all expected columns total', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify total column count
    const allColumns = await mockDb.all('SELECT * FROM columns') as Column[];
    expect(allColumns).toHaveLength(13); // 6 + 3 + 4 = 13 columns total

    // Verify all columns have valid board references
    const boardIds = ['board-1', 'board-2', 'board-3'];
    allColumns.forEach(column => {
      expect(boardIds).toContain(column.board_id);
    });
  });

  test('should create columns with proper positions', async () => {
    // Run the seed
    await run(mockDb as any);

    // Check that positions start from 1 and are sequential for each board
    for (const boardId of ['board-1', 'board-2', 'board-3']) {
      const columns = await mockDb.all(
        'SELECT position FROM columns WHERE board_id = ? ORDER BY position',
        [boardId]
      ) as { position: number }[];

      columns.forEach((column, index) => {
        expect(column.position).toBe(index + 1);
      });
    }
  });
});