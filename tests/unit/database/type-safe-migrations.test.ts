/**
 * @fileoverview Type-safe migration system tests
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Migration system testing, schema validation, rollback testing
 * Main APIs: TypeSafeMigrationRunner test suite
 * Constraints: Integration tests, requires database setup
 * Patterns: Test isolation, comprehensive validation, error handling
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs/promises';
import { DatabaseConnection } from '../../../src/database/connection';
import { TypeSafeMigrationRunner } from '../../../src/database/migrations/TypeSafeMigrationRunner';

describe('TypeSafeMigrationRunner', () => {
  let db: sqlite3.Database;
  let migrationRunner: TypeSafeMigrationRunner;
  let tempDbPath: string;

  beforeAll(async () => {
    // Create temporary database for testing
    tempDbPath = path.join(__dirname, 'test-migrations.db');

    // Remove existing test database
    try {
      await fs.unlink(tempDbPath);
    } catch {
      // File doesn't exist, ignore
    }

    db = new sqlite3.Database(tempDbPath);

    // Initialize migration runner
    migrationRunner = new TypeSafeMigrationRunner(db, {
      migrationsPath: path.join(__dirname, '../../../src/database/migrations'),
      tableName: 'test_schema_migrations',
      schemaTableName: 'test_schema_versions',
    });

    await migrationRunner.initialize();
  });

  afterAll(async () => {
    // Close database and clean up
    await new Promise<void>(resolve => {
      db.close(() => resolve());
    });

    try {
      await fs.unlink(tempDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clean up tables before each test
    const run = async (sql: string, params?: any[]) =>
      new Promise<void>((resolve, reject) => {
        db.run(sql, params, err => {
          if (err) reject(err);
          else resolve();
        });
      });

    await run('DELETE FROM test_schema_migrations');
    await run('DELETE FROM test_schema_versions');
    await run('DROP TABLE IF EXISTS tasks_v2');
    await run('DROP TABLE IF EXISTS tasks_backup_v1');
    await run('DROP TRIGGER IF EXISTS update_tasks_v2_timestamp');
  });

  describe('Initialization', () => {
    test('should create migration tables', async () => {
      const get = async (sql: string) =>
        new Promise<any>((resolve, reject) => {
          db.get(sql, (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

      // Check migrations table
      const migrationsTable = await get(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='test_schema_migrations'
      `);
      expect(migrationsTable).toBeDefined();

      // Check schema versions table
      const schemaTable = await get(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='test_schema_versions'
      `);
      expect(schemaTable).toBeDefined();
    });

    test('should get initial schema version as 0', async () => {
      const version = await migrationRunner.getCurrentSchemaVersion();
      expect(version).toBe(0);
    });
  });

  describe('Migration Loading', () => {
    test('should load type-safe migrations', async () => {
      const migrations = await migrationRunner.loadTypeSafeMigrations();

      expect(Array.isArray(migrations)).toBe(true);

      // Should find our example migration
      const exampleMigration = migrations.find(m => m.id === 'ts_001_enhanced_task_management');
      expect(exampleMigration).toBeDefined();

      if (exampleMigration) {
        expect(exampleMigration.version).toBe(1);
        expect(exampleMigration.description).toBe(
          'Add enhanced task management features with type safety'
        );
        expect(typeof exampleMigration.up).toBe('function');
        expect(typeof exampleMigration.down).toBe('function');
        expect(exampleMigration.schema).toBeDefined();
      }
    });

    test('should validate migration structure', async () => {
      const migrations = await migrationRunner.loadTypeSafeMigrations();

      migrations.forEach(migration => {
        expect(typeof migration.id).toBe('string');
        expect(typeof migration.version).toBe('number');
        expect(typeof migration.description).toBe('string');
        expect(typeof migration.up).toBe('function');
        expect(typeof migration.down).toBe('function');
        expect(migration.schema).toBeDefined();
        expect(migration.schema.version).toBe(migration.version);
      });
    });
  });

  describe('Migration Execution', () => {
    test('should execute pending migrations', async () => {
      const results = await migrationRunner.runPendingMigrations();

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      // All migrations should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.executionTime).toBeGreaterThan(0);
        expect(result.schemaValidation).toBe(true);
      });
    });

    test('should update schema version after migration', async () => {
      await migrationRunner.runPendingMigrations();

      const version = await migrationRunner.getCurrentSchemaVersion();
      expect(version).toBeGreaterThan(0);
    });

    test('should not run already applied migrations', async () => {
      // Run migrations first time
      const firstRun = await migrationRunner.runPendingMigrations();
      expect(firstRun.length).toBeGreaterThan(0);

      // Run again - should have no pending migrations
      const secondRun = await migrationRunner.runPendingMigrations();
      expect(secondRun.length).toBe(0);
    });
  });

  describe('Schema Validation', () => {
    test('should validate schema after migration', async () => {
      await migrationRunner.runPendingMigrations();

      const validation = await migrationRunner.validateCurrentSchema();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should create table with correct structure', async () => {
      await migrationRunner.runPendingMigrations();

      const tableInfo = await new Promise<any[]>((resolve, reject) => {
        db.all('PRAGMA table_info(tasks_v2)', (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      expect(tableInfo.length).toBeGreaterThan(0);

      // Check for expected columns
      const columnNames = tableInfo.map(col => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('title');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('estimated_hours');
      expect(columnNames).toContain('actual_hours');
    });

    test('should create indexes', async () => {
      await migrationRunner.runPendingMigrations();

      const indexes = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `
          SELECT name FROM sqlite_master 
          WHERE type='index' AND tbl_name='tasks_v2' AND name LIKE 'idx_%'
        `,
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      expect(indexes.length).toBeGreaterThan(0);

      const indexNames = indexes.map(idx => idx.name);
      expect(indexNames).toContain('idx_tasks_v2_board_id');
      expect(indexNames).toContain('idx_tasks_v2_status');
      expect(indexNames).toContain('idx_tasks_v2_priority');
    });
  });

  describe('SQL Generation', () => {
    test('should generate correct CREATE TABLE SQL', async () => {
      const tableDefinition = {
        name: 'test_table',
        columns: {
          id: { type: 'TEXT' as const, nullable: false },
          name: { type: 'TEXT' as const, nullable: false },
          count: { type: 'INTEGER' as const, nullable: true, defaultValue: 0 },
        },
        primaryKey: 'id',
      };

      const sql = migrationRunner.generateCreateTableSQL(tableDefinition);

      expect(sql).toContain('CREATE TABLE test_table');
      expect(sql).toContain('id TEXT NOT NULL');
      expect(sql).toContain('name TEXT NOT NULL');
      expect(sql).toContain('count INTEGER DEFAULT 0');
      expect(sql).toContain('PRIMARY KEY (id)');
    });

    test('should handle foreign keys in SQL generation', async () => {
      const tableDefinition = {
        name: 'child_table',
        columns: {
          id: { type: 'TEXT' as const, nullable: false },
          parent_id: { type: 'TEXT' as const, nullable: false },
        },
        primaryKey: 'id',
        foreignKeys: [
          {
            column: 'parent_id',
            referencesTable: 'parent_table',
            referencesColumn: 'id',
            onDelete: 'CASCADE' as const,
          },
        ],
      };

      const sql = migrationRunner.generateCreateTableSQL(tableDefinition);

      expect(sql).toContain(
        'FOREIGN KEY (parent_id) REFERENCES parent_table(id) ON DELETE CASCADE'
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle migration execution errors gracefully', async () => {
      // Create a migration that will fail
      const failingMigration = {
        id: 'failing_migration',
        version: 999,
        description: 'This migration will fail',
        schema: {
          version: 999,
          description: 'Failing schema',
          tables: {},
          indexes: [],
          constraints: [],
        },
        up: async () => {
          throw new Error('Intentional migration failure');
        },
        down: async () => {
          // No-op
        },
      };

      const result = await migrationRunner.executeMigration(failingMigration);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Intentional migration failure');
    });

    test('should validate invalid schema correctly', async () => {
      // Force an invalid state by manually modifying schema version
      const run = async (sql: string, params?: any[]) =>
        new Promise<void>((resolve, reject) => {
          db.run(sql, params, err => {
            if (err) reject(err);
            else resolve();
          });
        });

      await run(`
        INSERT INTO test_schema_versions (version, description, schema_definition, is_current)
        VALUES (999, 'Invalid schema', '{}', TRUE)
      `);

      const validation = await migrationRunner.validateCurrentSchema();
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});
