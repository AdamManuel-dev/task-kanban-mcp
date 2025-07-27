/**
 * Migration: Add reason field to task_history table
 * Adds ability to track reasons for task changes
 */

import type { Database } from 'sqlite3';
import { promisify } from 'util';

export async function up(db: Database): Promise<void> {
  const run = promisify(db.run.bind(db));
  try {
    // Add reason column to task_history table
    await run(`
      ALTER TABLE task_history 
      ADD COLUMN reason TEXT
    `);
  } catch (error) {
    throw error;
  }
}

export async function down(db: Database): Promise<void> {
  const run = promisify(db.run.bind(db));
  try {
    // SQLite doesn't support DROP COLUMN, so we need to recreate the table
    await run(`
      CREATE TABLE task_history_backup AS 
      SELECT id, task_id, field_name, old_value, new_value, changed_by, changed_at
      FROM task_history
    `);

    await run('DROP TABLE task_history');

    await run(`
      CREATE TABLE task_history (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by TEXT,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    await run(`
      INSERT INTO task_history (id, task_id, field_name, old_value, new_value, changed_by, changed_at)
      SELECT id, task_id, field_name, old_value, new_value, changed_by, changed_at
      FROM task_history_backup
    `);

    await run('DROP TABLE task_history_backup');
  } catch (error) {
    throw error;
  }
}
