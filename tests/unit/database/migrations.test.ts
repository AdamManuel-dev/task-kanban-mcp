import { Database } from 'sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MigrationRunner } from '../../../src/database/migrations/MigrationRunner';

describe('MigrationRunner', () => {
  let db: Database;
  let migrationRunner: MigrationRunner;
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for test migrations
    tempDir = path.join(__dirname, '..', '..', '..', 'temp-migrations-test');
    await fs.mkdir(tempDir, { recursive: true });
  });

  beforeEach(async () => {
    // Create in-memory database for each test
    db = new Database(':memory:');
    migrationRunner = new MigrationRunner(db, {
      migrationsPath: tempDir,
      tableName: 'schema_migrations_test',
      validateChecksums: true,
    });

    // Clean up temp directory
    const files = await fs.readdir(tempDir);
    await Promise.all(
      files.map(async file => {
        await fs.unlink(path.join(tempDir, file));
      })
    );
  });

  afterEach(done => {
    db.close(done);
  });

  afterAll(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true });
  });

  describe('initialization', () => {
    it('should initialize migration table', async () => {
      await migrationRunner.initialize();

      // Check if migration table exists
      const tables = await new Promise<any[]>((resolve, reject) => {
        db.all(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations_test'",
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('schema_migrations_test');
    });
  });

  describe('migration file management', () => {
    it('should return empty array when no migrations exist', async () => {
      const files = await migrationRunner.getMigrationFiles();
      expect(files).toEqual([]);
    });

    it('should parse migration files correctly', async () => {
      // Create test migration files
      await fs.writeFile(
        path.join(tempDir, '001_create_users.ts'),
        `
export async function up(): Promise<void>(db) {
  // Create users table
}

export async function down(): Promise<void>(db) {
  // Drop users table
}
        `
      );

      await fs.writeFile(
        path.join(tempDir, '002_add_indexes.ts'),
        `
export async function up(): Promise<void>(db) {
  // Add indexes
}

export async function down(): Promise<void>(db) {
  // Remove indexes
}
        `
      );

      const files = await migrationRunner.getMigrationFiles();

      expect(files).toHaveLength(2);
      expect(files[0].id).toBe('001_create_users');
      expect(files[0].description).toBe('create users');
      expect(files[0].timestamp).toBe(1);
      expect(files[1].id).toBe('002_add_indexes');
      expect(files[1].description).toBe('add indexes');
      expect(files[1].timestamp).toBe(2);
    });

    it('should ignore invalid migration filenames', async () => {
      // Create invalid migration files
      await fs.writeFile(path.join(tempDir, 'invalid.ts'), 'content');
      await fs.writeFile(path.join(tempDir, 'types.ts'), 'content');
      await fs.writeFile(path.join(tempDir, 'MigrationRunner.ts'), 'content');

      const files = await migrationRunner.getMigrationFiles();
      expect(files).toHaveLength(0);
    });
  });

  describe('migration execution', () => {
    it('should run migrations successfully', async () => {
      // Create a simple migration
      await fs.writeFile(
        path.join(tempDir, '001_create_test_table.ts'),
        `
import { promisify } from 'util';

export async function up(): Promise<void>(db) {
  const run = promisify(db.run.bind(db));
  await run('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');
}

export async function down(): Promise<void>(db) {
  const run = promisify(db.run.bind(db));
  await run('DROP TABLE IF EXISTS test_table');
}
        `
      );

      await migrationRunner.initialize();
      const count = await migrationRunner.up();

      expect(count).toBe(1);

      // Check if table was created
      const tables = await new Promise<any[]>((resolve, reject) => {
        db.all(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'",
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      expect(tables).toHaveLength(1);

      // Check if migration was recorded
      const applied = await migrationRunner.getAppliedMigrations();
      expect(applied).toHaveLength(1);
      expect(applied[0].id).toBe('001_create_test_table');
    });

    it('should rollback migrations successfully', async () => {
      // Create and run a migration first
      await fs.writeFile(
        path.join(tempDir, '001_create_test_table.ts'),
        `
import { promisify } from 'util';

export async function up(): Promise<void>(db) {
  const run = promisify(db.run.bind(db));
  await run('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');
}

export async function down(): Promise<void>(db) {
  const run = promisify(db.run.bind(db));
  await run('DROP TABLE IF EXISTS test_table');
}
        `
      );

      await migrationRunner.initialize();
      await migrationRunner.up();

      // Now rollback
      const count = await migrationRunner.down();
      expect(count).toBe(1);

      // Check if table was dropped
      const tables = await new Promise<any[]>((resolve, reject) => {
        db.all(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'",
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      expect(tables).toHaveLength(0);

      // Check if migration record was removed
      const applied = await migrationRunner.getAppliedMigrations();
      expect(applied).toHaveLength(0);
    });

    it('should skip already applied migrations', async () => {
      // Create migration
      await fs.writeFile(
        path.join(tempDir, '001_create_test_table.ts'),
        `
import { promisify } from 'util';

export async function up(): Promise<void>(db) {
  const run = promisify(db.run.bind(db));
  await run('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');
}

export async function down(): Promise<void>(db) {
  const run = promisify(db.run.bind(db));
  await run('DROP TABLE IF EXISTS test_table');
}
        `
      );

      await migrationRunner.initialize();

      // Run migration twice
      const count1 = await migrationRunner.up();
      const count2 = await migrationRunner.up();

      expect(count1).toBe(1);
      expect(count2).toBe(0); // Should be 0 because migration already applied

      // Should still have only one applied migration
      const applied = await migrationRunner.getAppliedMigrations();
      expect(applied).toHaveLength(1);
    });

    it('should handle migration target parameter', async () => {
      // Create multiple migrations
      await fs.writeFile(
        path.join(tempDir, '001_create_users.ts'),
        `
import { promisify } from 'util';

export async function up(): Promise<void>(db) {
  const run = promisify(db.run.bind(db));
  await run('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
}

export async function down(): Promise<void>(db) {
  const run = promisify(db.run.bind(db));
  await run('DROP TABLE IF EXISTS users');
}
        `
      );

      await fs.writeFile(
        path.join(tempDir, '002_create_posts.ts'),
        `
import { promisify } from 'util';

export async function up(): Promise<void>(db) {
  const run = promisify(db.run.bind(db));
  await run('CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)');
}

export async function down(): Promise<void>(db) {
  const run = promisify(db.run.bind(db));
  await run('DROP TABLE IF EXISTS posts');
}
        `
      );

      await migrationRunner.initialize();

      // Run only up to first migration
      const count = await migrationRunner.up('001_create_users');
      expect(count).toBe(1);

      const applied = await migrationRunner.getAppliedMigrations();
      expect(applied).toHaveLength(1);
      expect(applied[0].id).toBe('001_create_users');
    });
  });

  describe('migration status', () => {
    it('should return correct status', async () => {
      // Create migrations
      await fs.writeFile(
        path.join(tempDir, '001_create_users.ts'),
        `
export async function up(): Promise<void>(db) {}
export async function down(): Promise<void>(db) {}
        `
      );

      await fs.writeFile(
        path.join(tempDir, '002_create_posts.ts'),
        `
export async function up(): Promise<void>(db) {}
export async function down(): Promise<void>(db) {}
        `
      );

      await migrationRunner.initialize();

      // Get initial status
      let status = await migrationRunner.status();
      expect(status.total).toBe(2);
      expect(status.applied).toHaveLength(0);
      expect(status.pending).toHaveLength(2);

      // Apply one migration
      await migrationRunner.up('001_create_users');

      // Get status after applying one
      status = await migrationRunner.status();
      expect(status.total).toBe(2);
      expect(status.applied).toHaveLength(1);
      expect(status.pending).toHaveLength(1);
      expect(status.applied[0]).toBe('001_create_users');
      expect(status.pending[0]).toBe('002_create_posts');
    });
  });

  describe('error handling', () => {
    it('should rollback transaction on migration failure', async () => {
      // Create a migration that will fail
      await fs.writeFile(
        path.join(tempDir, '001_failing_migration.ts'),
        `
export async function up(): Promise<void>(db) {
  const run = require('util').promisify(db.run.bind(db));
  await run('CREATE TABLE test (id INTEGER)');
  // This will fail - duplicate table name
  await run('CREATE TABLE test (id INTEGER)');
}

export async function down(): Promise<void>(db) {
  const run = require('util').promisify(db.run.bind(db));
  await run('DROP TABLE IF EXISTS test');
}
        `
      );

      await migrationRunner.initialize();

      await expect(migrationRunner.up()).rejects.toThrow();

      // Check that no migration was recorded
      const applied = await migrationRunner.getAppliedMigrations();
      expect(applied).toHaveLength(0);

      // Check that no table was created
      const tables = await new Promise<any[]>((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='test'", (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      expect(tables).toHaveLength(0);
    });
  });

  describe('static methods', () => {
    it('should create migration file with correct template', async () => {
      const filename = await MigrationRunner.createMigration('test_migration', tempDir);

      expect(filename).toMatch(/^\d{3}_test_migration\.ts$/);

      const filePath = path.join(tempDir, filename);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('export async function up(): Promise<void>(db: Database)');
      expect(content).toContain('export async function down(): Promise<void>(db: Database)');
      expect(content).toContain("import { Database } from 'sqlite3'");
    });
  });
});
