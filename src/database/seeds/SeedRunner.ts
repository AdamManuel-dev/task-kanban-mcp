import type { Database } from 'sqlite';
import type { Database as SQLiteDB } from 'sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../../utils/logger';
import type { Seed, SeedOptions, AppliedSeed } from './types';

export class SeedRunner {
  private readonly db: Database<SQLiteDB>;

  private readonly seedsPath: string;

  private readonly seedsTable: string;

  constructor(db: Database<SQLiteDB>, options: SeedOptions = {}) {
    this.db = db;
    this.seedsPath = options.seedsPath ?? path.join(__dirname, '.');
    this.seedsTable = options.seedsTable ?? 'seed_status';
  }

  /**
   * Initialize the seeds tracking table
   */
  async initialize(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ${String(String(this.seedsTable))} (
        name TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL
      )
    `);

    logger.info('Seed tracking table initialized');
  }

  /**
   * Get all applied seeds
   */
  async getAppliedSeeds(): Promise<AppliedSeed[]> {
    return this.db.all<AppliedSeed[]>(
      `SELECT name, applied_at, checksum FROM ${String(String(this.seedsTable))} ORDER BY name`
    );
  }

  /**
   * Get all seed files from the seeds directory
   */
  async getSeedFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.seedsPath);
      return files
        .filter(
          file => file.endsWith('.ts') && !['types.ts', 'SeedRunner.ts', 'index.ts'].includes(file)
        )
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn(`Seeds directory not found: ${String(String(this.seedsPath))}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Load a seed module dynamically
   */
  async loadSeed(filename: string): Promise<Seed> {
    const filePath = path.join(this.seedsPath, filename);

    // Dynamic import of the seed file
    const seedModule = await import(filePath);
    const seed = seedModule.default ?? seedModule;

    if (!seed.name || !seed.run) {
      throw new Error(`Seed ${String(filename)} must export 'name' and 'run' properties`);
    }

    return { name: seed.name, description: seed.description ?? '', run: seed.run };
  }

  /**
   * Run seeds
   */
  async run(options: { force?: boolean } = {}): Promise<number> {
    await this.initialize();

    const seedFiles = await this.getSeedFiles();

    let seedsRun = 0;

    for (const filename of seedFiles) {
      // eslint-disable-next-line no-await-in-loop
      const seed = await this.loadSeed(filename);

      if (!seed) {
        logger.warn(`Skipping invalid seed file: ${filename}`);
        continue;
      }

      logger.info(
        `Running seed: ${String(String(seed.name))} - ${String(String(seed.description))}`
      );

      try {
        // eslint-disable-next-line no-await-in-loop
        await this.runSeed(seed, filename, options.force);
        seedsRun++;
        logger.info(`Seed ${String(String(seed.name))} completed successfully`);
      } catch (error) {
        logger.error(`Seed ${String(String(seed.name))} failed:`, error);
        throw new Error(`Seed ${String(String(seed.name))} failed: ${String(error)}`);
      }
    }

    if (seedsRun === 0) {
      logger.info('No seeds to run');
    } else {
      logger.info(`Successfully ran ${String(seedsRun)} seed(s)`);
    }

    return seedsRun;
  }

  /**
   * Get seed status
   */
  async status(): Promise<{
    applied: string[];
    pending: string[];
    total: number;
  }> {
    await this.initialize();

    const applied = await this.getAppliedSeeds();
    const appliedSet = new Set(applied.map(s => s.name));
    const seedFiles = await this.getSeedFiles();

    const seedPromises = seedFiles.map(async filename => {
      const seed = await this.loadSeed(filename);
      return seed ? seed.name : null;
    });

    const seedResults = await Promise.all(seedPromises);
    const allSeeds = seedResults.filter((name): name is string => name !== null);

    const pending = allSeeds.filter(name => !appliedSet.has(name));

    return { applied: applied.map(s => s.name), pending, total: allSeeds.length };
  }

  /**
   * Reset all seeds (remove tracking records)
   */
  async reset(): Promise<void> {
    await this.initialize();
    await this.db.run(`DELETE FROM ${String(String(this.seedsTable))}`);
    logger.info('All seed records cleared');
  }

  /**
   * Run a single seed
   */
  private async runSeed(seed: Seed, filename: string, force = false): Promise<void> {
    const content = await fs.readFile(path.join(this.seedsPath, filename), 'utf-8');
    const checksum = SeedRunner.calculateChecksum(content);

    // Start transaction
    await this.db.run('BEGIN TRANSACTION');

    try {
      // Run the seed
      await seed.run(this.db);

      if (force) {
        // Update existing record
        await this.db.run(
          `INSERT OR REPLACE INTO ${String(String(this.seedsTable))} (name, checksum) VALUES (?, ?)`,
          [seed.name, checksum]
        );
      } else {
        // Insert new record
        await this.db.run(
          `INSERT INTO ${String(String(this.seedsTable))} (name, checksum) VALUES (?, ?)`,
          [seed.name, checksum]
        );
      }

      // Commit transaction
      await this.db.run('COMMIT');
    } catch (error) {
      // Rollback on error
      await this.db.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Calculate checksum for file content
   */
  private static calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Create a new seed file
   */
  static async createSeed(name: string, description: string, seedsPath: string): Promise<string> {
    const filename = `${String(String(name.replace(/\s+/g, '_').toLowerCase()))}.ts`;
    const filePath = path.join(seedsPath, filename);

    const template = `import { Database } from 'sqlite';
import { Database as SQLiteDB } from 'sqlite3';

export const name = '${String(name)}';
export const description = '${String(description)}';

export async function run(): Promise<void>(db: Database<SQLiteDB>): Promise<void> {
  // Add your seed data here
  // Example:
  // await db.run(\`
  //   INSERT INTO boards (id, name, description) VALUES 
  //   ('board-1', 'Sample Board', 'A sample board for development');
  // \`);
  
  logger.log('${String(name)} seed completed');
}
`;

    await fs.writeFile(filePath, template);
    logger.info(`Created seed: ${String(filename)}`);

    return filename;
  }
}
