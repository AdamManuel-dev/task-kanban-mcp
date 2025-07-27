import type { Database } from 'sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { logger } from '../../utils/logger';
import type { Migration, MigrationFile, AppliedMigration, MigrationOptions } from './types';

export class MigrationRunner {
  private readonly db: Database;

  private readonly migrationsPath: string;

  private readonly tableName: string;

  private readonly validateChecksums: boolean;

  constructor(db: Database, options: MigrationOptions = {}) {
    this.db = db;
    this.migrationsPath = options.migrationsPath ?? path.join(__dirname, '.');
    this.tableName = options.tableName ?? 'schema_migrations';
    this.validateChecksums = options.validateChecksums !== false;
  }

  /**
   * Initialize the migrations table
   */
  async initialize(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));

    await run(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL
      )
    `);

    logger.info('Migration table initialized');
  }

  /**
   * Get all applied migrations
   */
  async getAppliedMigrations(): Promise<AppliedMigration[]> {
    const all = promisify(this.db.all.bind(this.db));

    const result = (await all(
      `SELECT id, applied_at, checksum FROM ${this.tableName} ORDER BY id`
    )) as AppliedMigration[];

    return result ?? [];
  }

  /**
   * Get all migration files from the migrations directory
   */
  async getMigrationFiles(): Promise<MigrationFile[]> {
    try {
      const files = await fs.readdir(this.migrationsPath);

      const migrationFilePromises = files
        .filter(
          file => file.endsWith('.ts') && file !== 'types.ts' && file !== 'MigrationRunner.ts'
        )
        .map(async file => {
          const filePath = path.join(this.migrationsPath, file);
          const content = await fs.readFile(filePath, 'utf-8');

          // Extract migration info from filename (e.g., 001_create_initial_schema.ts)
          const match = file.match(/^(\d{3})_(.+)\.ts$/);
          if (!match) {
            logger.warn(`Skipping invalid migration filename: ${file}`);
            return null;
          }

          const [, number, description] = match;
          if (!number ?? !description) {
            logger.warn(`Invalid migration filename format: ${file}`);
            return null;
          }

          const id = `${number}_${description}`;
          const checksum = this.calculateChecksum(content);

          return {
            id,
            timestamp: parseInt(number, 10),
            description: description.replace(/_/g, ' '),
            checksum,
            up: '', // Will be loaded dynamically
            down: '', // Will be loaded dynamically
          };
        });

      const migrationResults = await Promise.all(migrationFilePromises);
      const migrationFiles = migrationResults.filter(
        (file): file is MigrationFile => file !== null
      );

      return migrationFiles.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn(`Migrations directory not found: ${this.migrationsPath}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Load a migration module dynamically
   */
  async loadMigration(file: MigrationFile): Promise<Migration> {
    const filename = `${file.id}.ts`;
    const filePath = path.join(this.migrationsPath, filename);

    // Dynamic import of the migration file
    const migrationModule = await import(filePath);
    const migration = migrationModule.default ?? migrationModule;

    if (!migration.up ?? !migration.down) {
      throw new Error(`Migration ${file.id} must export 'up' and 'down' functions`);
    }

    return {
      id: file.id,
      timestamp: file.timestamp,
      description: file.description,
      up: migration.up,
      down: migration.down,
    };
  }

  /**
   * Run pending migrations
   */
  async up(target?: string): Promise<number> {
    await this.initialize();

    const applied = await this.getAppliedMigrations();
    const appliedIds = new Set(applied.map(m => m.id));
    const files = await this.getMigrationFiles();

    let migrationsRun = 0;

    for (const file of files) {
      if (appliedIds.has(file.id)) {
        // Validate checksum if enabled
        if (this.validateChecksums) {
          const appliedMigration = applied.find(m => m.id === file.id);
          if (appliedMigration && appliedMigration.checksum !== file.checksum) {
            throw new Error(
              `Migration ${file.id} has been modified after being applied. ` +
                `Expected checksum: ${appliedMigration.checksum}, ` +
                `Current checksum: ${file.checksum}`
            );
          }
        }
        continue;
      }

      if (target && file.id > target) {
        break;
      }

      logger.info(`Running migration: ${file.id} - ${file.description}`);

      // eslint-disable-next-line no-await-in-loop
      const migration = await this.loadMigration(file);

      try {
        // eslint-disable-next-line no-await-in-loop
        await this.runMigration(migration, file.checksum, 'up');
        migrationsRun++;
        logger.info(`Migration ${file.id} completed successfully`);
      } catch (error) {
        logger.error(`Migration ${file.id} failed:`, error);
        throw new Error(`Migration ${file.id} failed: ${error}`);
      }
    }

    if (migrationsRun === 0) {
      logger.info('No pending migrations');
    } else {
      logger.info(`Successfully ran ${migrationsRun} migration(s)`);
    }

    return migrationsRun;
  }

  /**
   * Rollback migrations
   */
  async down(target?: string): Promise<number> {
    await this.initialize();

    const applied = await this.getAppliedMigrations();
    const files = await this.getMigrationFiles();
    const fileMap = new Map(files.map(f => [f.id, f]));

    let migrationsRolledBack = 0;

    // Process in reverse order
    for (let i = applied.length - 1; i >= 0; i--) {
      const appliedMigration = applied[i];
      if (!appliedMigration) {
        continue;
      }

      if (target && appliedMigration.id <= target) {
        break;
      }

      const file = fileMap.get(appliedMigration.id);
      if (!file) {
        throw new Error(
          `Cannot rollback migration ${appliedMigration.id}: migration file not found`
        );
      }

      logger.info(`Rolling back migration: ${file.id} - ${file.description}`);

      // eslint-disable-next-line no-await-in-loop
      const migration = await this.loadMigration(file);

      try {
        // eslint-disable-next-line no-await-in-loop
        await this.rollbackMigration(migration);
        migrationsRolledBack++;
        logger.info(`Migration ${file.id} rolled back successfully`);
      } catch (error) {
        logger.error(`Rollback of migration ${file.id} failed:`, error);
        throw new Error(`Rollback of migration ${file.id} failed: ${error}`);
      }
    }

    if (migrationsRolledBack === 0) {
      logger.info('No migrations to rollback');
    } else {
      logger.info(`Successfully rolled back ${migrationsRolledBack} migration(s)`);
    }

    return migrationsRolledBack;
  }

  /**
   * Get migration status
   */
  async status(): Promise<{
    applied: string[];
    pending: string[];
    total: number;
  }> {
    await this.initialize();

    const applied = await this.getAppliedMigrations();
    const appliedIds = new Set(applied.map(m => m.id));
    const files = await this.getMigrationFiles();

    const pending = files.filter(f => !appliedIds.has(f.id)).map(f => f.id);

    return {
      applied: applied.map(m => m.id),
      pending,
      total: files.length,
    };
  }

  /**
   * Run a single migration
   */
  private async runMigration(
    migration: Migration,
    checksum: string,
    direction: 'up' | 'down'
  ): Promise<void> {
    const run = promisify(this.db.run.bind(this.db)) as (
      sql: string,
      ...params: any[]
    ) => Promise<any>;

    // Start transaction
    await run('BEGIN TRANSACTION');

    try {
      // Run the migration
      await migration[direction](this.db);

      if (direction === 'up') {
        // Record the migration
        await run(
          `INSERT INTO ${this.tableName} (id, checksum) VALUES (?, ?)`,
          migration.id,
          checksum
        );
      } else {
        // Remove the migration record
        await run(`DELETE FROM ${this.tableName} WHERE id = ?`, migration.id);
      }

      // Commit transaction
      await run('COMMIT');
    } catch (error) {
      // Rollback on error
      await run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Rollback a single migration
   */
  private async rollbackMigration(migration: Migration): Promise<void> {
    await this.runMigration(migration, '', 'down');
  }

  /**
   * Calculate checksum for a file content
   */
  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Create a new migration file
   */
  static async createMigration(name: string, migrationsPath: string): Promise<string> {
    const timestamp = Date.now();
    const number = String(Math.floor(timestamp / 1000))
      .slice(-3)
      .padStart(3, '0');
    const filename = `${number}_${name.replace(/\s+/g, '_').toLowerCase()}.ts`;
    const filePath = path.join(migrationsPath, filename);

    const template = `import { Database } from 'sqlite3';
import { promisify } from 'util';

export async function up(db: Database): Promise<void> {
  const run = promisify(db.run.bind(db));
  
  // Add your migration logic here
  // Example:
  // await run(\`
  //   CREATE TABLE example (
  //     id INTEGER PRIMARY KEY AUTOINCREMENT,
  //     name TEXT NOT NULL
  //   )
  // \`);
}

export async function down(db: Database): Promise<void> {
  const run = promisify(db.run.bind(db));
  
  // Add your rollback logic here
  // Example:
  // await run('DROP TABLE IF EXISTS example');
}
`;

    await fs.writeFile(filePath, template);
    logger.info(`Created migration: ${filename}`);

    return filename;
  }
}
