/**
 * @fileoverview Example type-safe migration - Enhanced task table
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Type-safe schema definition, validation, rollback support
 * Main APIs: Migration definition with schema types
 * Constraints: Follows TypeSafeMigration interface
 * Patterns: Comprehensive type safety, error handling, validation
 */

import type { Database } from 'sqlite3';
import { promisify } from 'util';
import type { TypeSafeMigration, SchemaVersion } from './TypeSafeMigrationRunner';
import { logger } from '../../utils/logger';

/**
 * Schema version for enhanced task management
 */
const schemaV1: SchemaVersion = {
  version: 1,
  description: 'Enhanced task management with type safety',
  tables: {
    tasks_v2: {
      name: 'tasks_v2',
      columns: {
        id: {
          type: 'TEXT',
          nullable: false,
        },
        board_id: {
          type: 'TEXT',
          nullable: false,
        },
        column_id: {
          type: 'TEXT',
          nullable: false,
        },
        title: {
          type: 'TEXT',
          nullable: false,
        },
        description: {
          type: 'TEXT',
          nullable: true,
        },
        status: {
          type: 'TEXT',
          nullable: false,
          defaultValue: 'todo',
        },
        priority: {
          type: 'INTEGER',
          nullable: true,
          defaultValue: 5,
        },
        assignee: {
          type: 'TEXT',
          nullable: true,
        },
        due_date: {
          type: 'DATETIME',
          nullable: true,
        },
        position: {
          type: 'INTEGER',
          nullable: false,
          defaultValue: 0,
        },
        parent_task_id: {
          type: 'TEXT',
          nullable: true,
        },
        estimated_hours: {
          type: 'REAL',
          nullable: true,
        },
        actual_hours: {
          type: 'REAL',
          nullable: true,
        },
        completed_at: {
          type: 'DATETIME',
          nullable: true,
        },
        created_at: {
          type: 'DATETIME',
          nullable: false,
          defaultValue: 'CURRENT_TIMESTAMP',
        },
        updated_at: {
          type: 'DATETIME',
          nullable: false,
          defaultValue: 'CURRENT_TIMESTAMP',
        },
      },
      primaryKey: 'id',
      foreignKeys: [
        {
          column: 'board_id',
          referencesTable: 'boards',
          referencesColumn: 'id',
          onDelete: 'CASCADE',
        },
        {
          column: 'parent_task_id',
          referencesTable: 'tasks_v2',
          referencesColumn: 'id',
          onDelete: 'CASCADE',
        },
      ],
    },
  },
  indexes: [
    {
      name: 'idx_tasks_v2_board_id',
      table: 'tasks_v2',
      columns: ['board_id'],
    },
    {
      name: 'idx_tasks_v2_status',
      table: 'tasks_v2',
      columns: ['status'],
    },
    {
      name: 'idx_tasks_v2_priority',
      table: 'tasks_v2',
      columns: ['priority'],
    },
    {
      name: 'idx_tasks_v2_due_date',
      table: 'tasks_v2',
      columns: ['due_date'],
    },
    {
      name: 'idx_tasks_v2_parent_task',
      table: 'tasks_v2',
      columns: ['parent_task_id'],
    },
  ],
  constraints: [
    {
      name: 'chk_tasks_v2_status',
      table: 'tasks_v2',
      type: 'CHECK',
      definition: "status IN ('todo', 'in_progress', 'done', 'blocked', 'archived')",
    },
    {
      name: 'chk_tasks_v2_priority',
      table: 'tasks_v2',
      type: 'CHECK',
      definition: 'priority >= 1 AND priority <= 10',
    },
    {
      name: 'chk_tasks_v2_hours',
      table: 'tasks_v2',
      type: 'CHECK',
      definition: 'estimated_hours >= 0 AND actual_hours >= 0',
    },
  ],
};

/**
 * Type-safe migration for enhanced task management
 */
const migration: TypeSafeMigration = {
  id: 'ts_001_enhanced_task_management',
  version: 1,
  description: 'Add enhanced task management features with type safety',
  schema: schemaV1,

  /**
   * Apply migration
   */
  async up(db: Database, schema: SchemaVersion): Promise<void> {
    const run = promisify(db.run.bind(db));

    // Create enhanced tasks table
    const createTableSQL = `
      CREATE TABLE tasks_v2 (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL,
        column_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        priority INTEGER DEFAULT 5,
        assignee TEXT,
        due_date DATETIME,
        position INTEGER NOT NULL DEFAULT 0,
        parent_task_id TEXT,
        estimated_hours REAL,
        actual_hours REAL,
        completed_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_task_id) REFERENCES tasks_v2(id) ON DELETE CASCADE,
        
        CHECK (status IN ('todo', 'in_progress', 'done', 'blocked', 'archived')),
        CHECK (priority >= 1 AND priority <= 10),
        CHECK (estimated_hours >= 0 AND actual_hours >= 0)
      )
    `;

    await run(createTableSQL);

    // Create indexes
    for (const index of schema.indexes) {
      const uniqueClause = index.unique ? 'UNIQUE' : '';
      const indexSQL = `CREATE ${uniqueClause} INDEX ${index.name} ON ${index.table} (${index.columns.join(', ')})`;
      await run(indexSQL);
    }

    // Migrate existing data if tasks table exists
    const tableExists = await new Promise<boolean>(resolve => {
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'", (err, row) => {
        resolve(!err && !!row);
      });
    });

    if (tableExists) {
      // Copy data from old tasks table
      await run(`
        INSERT INTO tasks_v2 (
          id, board_id, column_id, title, description, status, 
          priority, assignee, due_date, position, parent_task_id, 
          created_at, updated_at
        )
        SELECT 
          id, board_id, column_id, title, description, status,
          priority, assignee, due_date, position, parent_task_id,
          created_at, updated_at
        FROM tasks
      `);

      // Create backup of old table
      await run('ALTER TABLE tasks RENAME TO tasks_backup_v1');
    }

    // Create trigger to update updated_at timestamp
    await run(`
      CREATE TRIGGER update_tasks_v2_timestamp 
      AFTER UPDATE ON tasks_v2
      BEGIN
        UPDATE tasks_v2 SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
  },

  /**
   * Rollback migration
   */
  async down(db: Database, _previousSchema?: SchemaVersion): Promise<void> {
    const run = promisify(db.run.bind(db));

    // Drop trigger
    await run('DROP TRIGGER IF EXISTS update_tasks_v2_timestamp');

    // Drop indexes
    for (const index of schemaV1.indexes) {
      await run(`DROP INDEX IF EXISTS ${index.name}`);
    }

    // Restore original table if backup exists
    const backupExists = await new Promise<boolean>(resolve => {
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks_backup_v1'",
        (err, row) => {
          resolve(!err && !!row);
        }
      );
    });

    if (backupExists) {
      await run('DROP TABLE IF EXISTS tasks_v2');
      await run('ALTER TABLE tasks_backup_v1 RENAME TO tasks');
    } else {
      // If no backup, just drop the new table
      await run('DROP TABLE IF EXISTS tasks_v2');
    }
  },

  /**
   * Validate schema after migration
   */
  async validate(db: Database): Promise<boolean> {
    const get = promisify(db.get.bind(db)) as (sql: string, params?: unknown) => Promise<unknown>;
    const run = promisify(db.run.bind(db)) as (sql: string, params?: unknown) => Promise<unknown>;

    try {
      // Check if table exists
      const tableExists = await get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks_v2'"
      );

      if (!tableExists) {
        return false;
      }

      // Check if all expected columns exist
      const tableInfo = await new Promise<unknown[]>((resolve, reject) => {
        db.all('PRAGMA table_info(tasks_v2)', (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      const expectedColumns = Object.keys(schemaV1.tables.tasks_v2.columns);
      const actualColumns = tableInfo.map(col => (col as { name: string }).name);

      const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));
      if (missingColumns.length > 0) {
        logger.error('Missing columns:', missingColumns);
        return false;
      }

      // Check if indexes exist
      for (const index of schemaV1.indexes) {
        const indexExists = await get(
          "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
          index.name
        );

        if (!indexExists) {
          logger.error('Missing index:', index.name);
          return false;
        }
      }

      // Test basic operations
      await run('INSERT INTO tasks_v2 (id, board_id, column_id, title) VALUES (?, ?, ?, ?)', [
        'test-validation-id',
        'test-board',
        'todo',
        'Test Task',
      ]);

      await run('DELETE FROM tasks_v2 WHERE id = ?', ['test-validation-id']);

      return true;
    } catch (error) {
      logger.error('Validation failed:', error);
      return false;
    }
  },
};

export default migration;
