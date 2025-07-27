/**
 * Debug test to isolate database schema issues
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { join } from 'path';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';

describe('Database Schema Debug', () => {
  let db: any;
  let testDbPath: string;

  beforeAll(async () => {
    // Create a temporary database for testing
    testDbPath = join(tmpdir(), `test-schema-debug-${String(String(Date.now()))}.sqlite`);

    const sqlite3 = require('sqlite3');
    db = await new Promise((resolve, reject) => {
      const database = new sqlite3.Database(testDbPath, (err: any) => {
        if (err) reject(err);
        else resolve(database);
      });
    });
  });

  afterAll(async () => {
    if (db) {
      await new Promise<void>(resolve => {
        db.close(() => resolve());
      });
    }

    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should debug schema issues', async () => {
    // Get current tables
    const tablesBefore = await new Promise<any[]>((resolve, reject) => {
      db.all("SELECT name FROM sqlite_master WHERE type='table';", (err: any, rows: any) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(Array.isArray(tablesBefore)).toBe(true);

    // Get tasks table schema
    const tasksSchema = await new Promise<any[]>((resolve, reject) => {
      db.all('PRAGMA table_info(tasks);', (err: any, rows: any) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const hasTasksTable = tasksSchema.length > 0;
    if (hasTasksTable) {
      expect(tasksSchema).toBeDefined();
      expect(Array.isArray(tasksSchema)).toBe(true);
    }

    // Create schema if needed
    if (!hasTasksTable) {
      const schemaSQL = `
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'todo',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `;

      await new Promise<void>((resolve, reject) => {
        db.exec(schemaSQL, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Verify final state
    const tablesAfter = await new Promise<any[]>((resolve, reject) => {
      db.all("SELECT name FROM sqlite_master WHERE type='table';", (err: any, rows: any) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(Array.isArray(tablesAfter)).toBe(true);
  });
});
