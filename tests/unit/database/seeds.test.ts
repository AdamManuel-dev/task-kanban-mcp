import type { Database } from 'sqlite';
import type { Database as SQLiteDB } from 'sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SeedRunner } from '../../../src/database/seeds/SeedRunner';

describe('SeedRunner', () => {
  let db: Database<SQLiteDB>;
  let seedRunner: SeedRunner;
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for test seeds
    tempDir = path.join(__dirname, '..', '..', '..', 'temp-seeds-test');
    await fs.mkdir(tempDir, { recursive: true });
  });

  beforeEach(async () => {
    // Create in-memory database for each test
    const sqlite3 = await import('sqlite3');
    const sqlite = await import('sqlite');

    db = await sqlite.open({
      filename: ':memory:',
      driver: sqlite3.Database,
    });

    seedRunner = new SeedRunner(db, {
      seedsPath: tempDir,
      seedsTable: 'seed_status_test',
    });

    // Clean up temp directory
    const files = await fs.readdir(tempDir);
    await Promise.all(
      files.map(async file => {
        await fs.unlink(path.join(tempDir, file));
      })
    );
  });

  afterEach(async () => {
    await db.close();
  });

  afterAll(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true });
  });

  describe('initialization', () => {
    it('should initialize seed tracking table', async () => {
      await seedRunner.initialize();

      // Check if seed tracking table exists
      const tables = await db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='seed_status_test'"
      );

      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('seed_status_test');
    });
  });

  describe('seed file management', () => {
    it('should return empty array when no seeds exist', async () => {
      const files = await seedRunner.getSeedFiles();
      expect(files).toEqual([]);
    });

    it('should find seed files correctly', async () => {
      // Create test seed files
      await fs.writeFile(
        path.join(tempDir, '001_test_seed.ts'),
        `
export const name = 'Test Seed';
export const description = 'A test seed';

export async function run(): Promise<void>(db) {
  // Test seed logic
}
        `
      );

      await fs.writeFile(
        path.join(tempDir, '002_another_seed.ts'),
        `
export const name = 'Another Seed';
export const description = 'Another test seed';

export async function run(): Promise<void>(db) {
  // Another seed logic
}
        `
      );

      const files = await seedRunner.getSeedFiles();

      expect(files).toHaveLength(2);
      expect(files[0]).toBe('001_test_seed.ts');
      expect(files[1]).toBe('002_another_seed.ts');
    });

    it('should ignore non-seed files', async () => {
      // Create invalid seed files
      await fs.writeFile(path.join(tempDir, 'types.ts'), 'content');
      await fs.writeFile(path.join(tempDir, 'SeedRunner.ts'), 'content');
      await fs.writeFile(path.join(tempDir, 'index.ts'), 'content');
      await fs.writeFile(path.join(tempDir, 'other.js'), 'content');

      const files = await seedRunner.getSeedFiles();
      expect(files).toHaveLength(0);
    });
  });

  describe('seed execution', () => {
    it('should run seeds successfully', async () => {
      // Create a simple test table first
      await db.run('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');

      // Create a seed that inserts data
      await fs.writeFile(
        path.join(tempDir, '001_test_data.ts'),
        `
export const name = 'Test Data';
export const description = 'Insert test data';

export async function run(): Promise<void>(db) {
  await db.run('INSERT INTO test_table (name) VALUES (?)', ['test-record']);
}
        `
      );

      await seedRunner.initialize();
      const count = await seedRunner.run();

      expect(count).toBe(1);

      // Check if data was inserted
      const records = await db.all('SELECT * FROM test_table');
      expect(records).toHaveLength(1);
      expect(records[0].name).toBe('test-record');

      // Check if seed was recorded
      const applied = await seedRunner.getAppliedSeeds();
      expect(applied).toHaveLength(1);
      expect(applied[0].name).toBe('Test Data');
    });

    it('should skip already applied seeds', async () => {
      // Create test table
      await db.run('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');

      // Create seed
      await fs.writeFile(
        path.join(tempDir, '001_test_data.ts'),
        `
export const name = 'Test Data';
export const description = 'Insert test data';

export async function run(): Promise<void>(db) {
  await db.run('INSERT INTO test_table (name) VALUES (?)', ['test-record']);
}
        `
      );

      await seedRunner.initialize();

      // Run seed twice
      const count1 = await seedRunner.run();
      const count2 = await seedRunner.run();

      expect(count1).toBe(1);
      expect(count2).toBe(0); // Should be 0 because seed already applied

      // Should still have only one record in test table
      const records = await db.all('SELECT * FROM test_table');
      expect(records).toHaveLength(1);

      // Should have only one applied seed record
      const applied = await seedRunner.getAppliedSeeds();
      expect(applied).toHaveLength(1);
    });

    it('should force re-run seeds when force option is used', async () => {
      // Create test table
      await db.run('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');

      // Create seed
      await fs.writeFile(
        path.join(tempDir, '001_test_data.ts'),
        `
export const name = 'Test Data';
export const description = 'Insert test data';

export async function run(): Promise<void>(db) {
  await db.run('INSERT INTO test_table (name) VALUES (?)', ['test-record']);
}
        `
      );

      await seedRunner.initialize();

      // Run seed normally, then force re-run
      await seedRunner.run();
      const count = await seedRunner.run({ force: true });

      expect(count).toBe(1); // Should re-run the seed

      // Should have two records now
      const records = await db.all('SELECT * FROM test_table');
      expect(records).toHaveLength(2);
    });

    it('should handle seed errors gracefully', async () => {
      // Create a seed that will fail
      await fs.writeFile(
        path.join(tempDir, '001_failing_seed.ts'),
        `
export const name = 'Failing Seed';
export const description = 'A seed that fails';

export async function run(): Promise<void>(db) {
  // This will fail - table doesn't exist
  await db.run('INSERT INTO nonexistent_table (name) VALUES (?)', ['test']);
}
        `
      );

      await seedRunner.initialize();

      await expect(seedRunner.run()).rejects.toThrow();

      // Check that no seed was recorded as applied
      const applied = await seedRunner.getAppliedSeeds();
      expect(applied).toHaveLength(0);
    });
  });

  describe('seed status', () => {
    it('should return correct status', async () => {
      // Create test table
      await db.run('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');

      // Create seeds
      await fs.writeFile(
        path.join(tempDir, '001_first_seed.ts'),
        `
export const name = 'First Seed';
export async function run(): Promise<void>(db) {
  await db.run('INSERT INTO test_table (name) VALUES (?)', ['first']);
}
        `
      );

      await fs.writeFile(
        path.join(tempDir, '002_second_seed.ts'),
        `
export const name = 'Second Seed';
export async function run(): Promise<void>(db) {
  await db.run('INSERT INTO test_table (name) VALUES (?)', ['second']);
}
        `
      );

      await seedRunner.initialize();

      // Get initial status
      let status = await seedRunner.status();
      expect(status.total).toBe(2);
      expect(status.applied).toHaveLength(0);
      expect(status.pending).toHaveLength(2);

      // Apply one seed by running with specific file simulation
      await seedRunner.run();

      // Get status after applying seeds
      status = await seedRunner.status();
      expect(status.total).toBe(2);
      expect(status.applied).toHaveLength(2); // Both seeds should be applied
      expect(status.pending).toHaveLength(0);
    });
  });

  describe('seed reset', () => {
    it('should reset all seed records', async () => {
      // Create test table and seed
      await db.run('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');

      await fs.writeFile(
        path.join(tempDir, '001_test_seed.ts'),
        `
export const name = 'Test Seed';
export async function run(): Promise<void>(db) {
  await db.run('INSERT INTO test_table (name) VALUES (?)', ['test']);
}
        `
      );

      await seedRunner.initialize();
      await seedRunner.run();

      // Verify seed was applied
      let applied = await seedRunner.getAppliedSeeds();
      expect(applied).toHaveLength(1);

      // Reset seeds
      await seedRunner.reset();

      // Verify no applied seeds
      applied = await seedRunner.getAppliedSeeds();
      expect(applied).toHaveLength(0);

      // But data should still exist in table
      const records = await db.all('SELECT * FROM test_table');
      expect(records).toHaveLength(1);
    });
  });

  describe('static methods', () => {
    it('should create seed file with correct template', async () => {
      const filename = await SeedRunner.createSeed('test seed', 'Test description', tempDir);

      expect(filename).toBe('test_seed.ts');

      const filePath = path.join(tempDir, filename);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain("export const name = 'test seed'");
      expect(content).toContain("export const description = 'Test description'");
      expect(content).toContain(
        'export async function run(): Promise<void>(db: Database<SQLiteDB>)'
      );
      expect(content).toContain("import { Database } from 'sqlite'");
    });
  });
});
