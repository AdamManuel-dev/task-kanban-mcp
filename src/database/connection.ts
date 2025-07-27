/**
 * SQLite database connection module
 * Handles database initialization, connection management, and configuration
 *
 * @module database/connection
 * @description This module provides a singleton database connection manager for SQLite.
 * It handles connection lifecycle, query execution, transactions, and health monitoring.
 * The connection is configured with optimal settings for performance and reliability.
 *
 * @example
 * ```typescript
 * import { dbConnection } from '@/database/connection';
 *
 * // Initialize connection
 * await dbConnection.initialize();
 *
 * // Execute queries
 * const users = await dbConnection.query('SELECT * FROM users WHERE active = ?', [true]);
 *
 * // Use transactions
 * await dbConnection.transaction(async (db) => {
 *   await db.run('INSERT INTO tasks (title) VALUES (?)', ['New Task']);
 *   await db.run('UPDATE boards SET updated_at = ?', [new Date()]);
 * });
 * ```
 */

import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import { SchemaManager } from './schema';
import { MigrationRunner } from './migrations';
import { SeedRunner } from './seeds';

/**
 * Configuration options for database connection
 *
 * @interface DatabaseConfig
 * @property {string} path - Path to the SQLite database file
 * @property {boolean} walMode - Enable Write-Ahead Logging for better concurrency
 * @property {number} memoryLimit - Memory-mapped I/O size limit in bytes
 * @property {number} timeout - Busy timeout in milliseconds
 * @property {boolean} verbose - Enable verbose SQLite logging
 */
export interface DatabaseConfig {
  path: string;
  walMode: boolean;
  memoryLimit: number;
  timeout: number;
  verbose: boolean;
}

/**
 * Singleton database connection manager for SQLite
 *
 * @class DatabaseConnection
 * @description Manages a single SQLite database connection with optimal settings,
 * transaction support, and health monitoring. Uses the singleton pattern to ensure
 * only one connection exists throughout the application lifecycle.
 *
 * @example
 * ```typescript
 * const db = DatabaseConnection.getInstance();
 * await db.initialize();
 *
 * // Check health
 * const health = await db.healthCheck();
 * console.log('Database healthy:', health.responsive);
 * ```
 */
export class DatabaseConnection {
  private static instance: DatabaseConnection;

  private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

  private readonly config: DatabaseConfig;

  private schemaManager: SchemaManager | null = null;

  private migrationRunner: MigrationRunner | null = null;

  private seedRunner: SeedRunner | null = null;

  private constructor() {
    this.config = {
      path: config.database.path,
      walMode: config.database.walMode,
      memoryLimit: config.database.memoryLimit,
      timeout: config.database.timeout,
      verbose: config.database.verbose,
    };
  }

  /**
   * Gets the singleton instance of DatabaseConnection
   *
   * @returns {DatabaseConnection} The singleton database connection instance
   *
   * @example
   * ```typescript
   * const db = DatabaseConnection.getInstance();
   * ```
   */
  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  /**
   * Initialize database connection and configure SQLite
   *
   * @param {Object} options - Initialization options
   * @param {boolean} [options.skipSchema=false] - Skip automatic schema creation/validation
   * @returns {Promise<void>}
   * @throws {Error} If database initialization fails
   *
   * @example
   * ```typescript
   * // Normal initialization with schema
   * await db.initialize();
   *
   * // Skip schema for testing
   * await db.initialize({ skipSchema: true });
   * ```
   */
  public async initialize(options: { skipSchema?: boolean } = {}): Promise<void> {
    try {
      logger.info('Initializing database connection', {
        path: this.config.path,
        walMode: this.config.walMode,
      });

      // Ensure database directory exists
      await this.ensureDirectoryExists();

      // Open database connection
      this.db = await open({
        filename: this.config.path,
        driver: this.config.verbose ? sqlite3.verbose().Database : sqlite3.Database,
      });

      // Configure SQLite pragmas
      await this.configurePragmas();

      // Initialize schema manager
      this.schemaManager = new SchemaManager(this);

      // Initialize migration runner
      if (this.db) {
        this.migrationRunner = new MigrationRunner(this.db.getDatabaseInstance(), {
          migrationsPath: path.join(__dirname, 'migrations'),
          validateChecksums: true,
        });

        // Initialize seed runner
        this.seedRunner = new SeedRunner(this.db, {
          seedsPath: path.join(__dirname, 'seeds'),
        });
      }

      // Ensure schema exists (unless skipped for testing)
      if (!options.skipSchema) {
        await this.ensureSchemaExists();
      }

      // Test connection
      await this.testConnection();

      logger.info('Database connection initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database connection', { error });
      throw new Error(`Database initialization failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get the underlying SQLite database instance
   *
   * @returns {Database} The SQLite database instance
   * @throws {Error} If database is not initialized
   *
   * @example
   * ```typescript
   * const database = db.getDatabase();
   * await database.exec('PRAGMA optimize');
   * ```
   */
  public getDatabase(): Database<sqlite3.Database, sqlite3.Statement> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Get the schema manager instance
   *
   * @returns {SchemaManager} The schema manager for database operations
   * @throws {Error} If schema manager is not initialized
   *
   * @example
   * ```typescript
   * const schema = db.getSchemaManager();
   * const info = await schema.getSchemaInfo();
   * ```
   */
  public getSchemaManager(): SchemaManager {
    if (!this.schemaManager) {
      throw new Error('Schema manager not initialized. Call initialize() first.');
    }
    return this.schemaManager;
  }

  /**
   * Check if database connection is active
   *
   * @returns {boolean} True if connected, false otherwise
   *
   * @example
   * ```typescript
   * if (db.isConnected()) {
   *   await db.query('SELECT 1');
   * }
   * ```
   */
  public isConnected(): boolean {
    return this.db !== null;
  }

  /**
   * Close the database connection
   *
   * @returns {Promise<void>}
   *
   * @example
   * ```typescript
   * // Graceful shutdown
   * process.on('SIGTERM', async () => {
   *   await db.close();
   *   process.exit(0);
   * });
   * ```
   */
  public async close(): Promise<void> {
    if (this.db) {
      logger.info('Closing database connection');
      await this.db.close();
      this.db = null;
      logger.info('Database connection closed');
    }
  }

  /**
   * Execute a query and return all results
   *
   * @template T - The expected result type
   * @param {string} sql - SQL query to execute
   * @param {any[]} [params=[]] - Query parameters for prepared statement
   * @returns {Promise<T[]>} Array of results
   * @throws {Error} If query execution fails
   *
   * @example
   * ```typescript
   * // Simple query
   * const boards = await db.query<{id: string, name: string}>('SELECT * FROM boards');
   *
   * // Parameterized query
   * const tasks = await db.query<Task>(
   *   'SELECT * FROM tasks WHERE board_id = ? AND archived = ?',
   *   ['board-123', false]
   * );
   *
   * // With type inference
   * interface User {
   *   id: string;
   *   name: string;
   *   email: string;
   * }
   * const users = await db.query<User>('SELECT * FROM users WHERE active = ?', [true]);
   * ```
   */
  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const db = this.getDatabase();
    try {
      logger.debug('Executing query', { sql, params });
      const result = await db.all<T[]>(sql, params);
      logger.debug('Query executed successfully', { rowCount: result.length });
      return result;
    } catch (error) {
      logger.error('Query execution failed', { sql, params, error });
      throw error;
    }
  }

  /**
   * Execute a query and return the first result
   *
   * @template T - The expected result type
   * @param {string} sql - SQL query to execute
   * @param {any[]} [params=[]] - Query parameters for prepared statement
   * @returns {Promise<T | undefined>} First result or undefined if no results
   * @throws {Error} If query execution fails
   *
   * @example
   * ```typescript
   * // Get single result
   * const board = await db.queryOne<Board>('SELECT * FROM boards WHERE id = ?', ['board-123']);
   *
   * // Check existence
   * const exists = await db.queryOne<{count: number}>('SELECT COUNT(*) as count FROM tasks WHERE title = ?', ['My Task']);
   * if (exists?.count > 0) {
   *   console.log('Task already exists');
   * }
   * ```
   */
  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const db = this.getDatabase();
    try {
      logger.debug('Executing query (single result)', { sql, params });
      const result = await db.get<T>(sql, params);
      logger.debug('Query executed successfully', { hasResult: !!result });
      return result;
    } catch (error) {
      logger.error('Query execution failed', { sql, params, error });
      throw error;
    }
  }

  /**
   * Execute a data modification statement (INSERT, UPDATE, DELETE)
   *
   * @param {string} sql - SQL statement to execute
   * @param {any[]} [params=[]] - Statement parameters for prepared statement
   * @returns {Promise<sqlite3.RunResult>} Result containing lastID and changes
   * @throws {Error} If statement execution fails
   *
   * @example
   * ```typescript
   * // Insert with auto-generated ID
   * const result = await db.execute(
   *   'INSERT INTO tasks (title, description) VALUES (?, ?)',
   *   ['New Task', 'Task description']
   * );
   * console.log('New task ID:', result.lastID);
   *
   * // Update with affected rows
   * const updateResult = await db.execute(
   *   'UPDATE tasks SET archived = ? WHERE created_at < ?',
   *   [true, new Date('2024-01-01')]
   * );
   * console.log('Archived tasks:', updateResult.changes);
   *
   * // Delete
   * const deleteResult = await db.execute('DELETE FROM tasks WHERE id = ?', ['task-123']);
   * if (deleteResult.changes === 0) {
   *   console.log('Task not found');
   * }
   * ```
   */
  public async execute(
    sql: string,
    params: any[] = []
  ): Promise<{ lastID?: number | undefined; changes: number }> {
    const db = this.getDatabase();
    try {
      logger.debug('Executing statement', { sql, params });
      const result = await db.run(sql, params);
      logger.debug('Statement executed successfully', {
        lastID: result.lastID,
        changes: result.changes,
      });
      return {
        lastID: result.lastID,
        changes: result.changes || 0,
      };
    } catch (error) {
      logger.error('Statement execution failed', { sql, params, error });
      throw error;
    }
  }

  /**
   * Execute multiple statements in a transaction with automatic rollback on error
   *
   * @template T - The return type of the transaction callback
   * @param {Function} callback - Async function that performs database operations
   * @returns {Promise<T>} The result returned by the callback
   * @throws {Error} If any operation in the transaction fails
   *
   * @example
   * ```typescript
   * // Simple transaction
   * await db.transaction(async (database) => {
   *   await database.run('INSERT INTO boards (id, name) VALUES (?, ?)', ['b1', 'My Board']);
   *   await database.run('INSERT INTO columns (id, board_id, name) VALUES (?, ?, ?)', ['c1', 'b1', 'Todo']);
   * });
   *
   * // Transaction with return value
   * const taskId = await db.transaction(async (database) => {
   *   const result = await database.run('INSERT INTO tasks (title) VALUES (?)', ['New Task']);
   *   await database.run('INSERT INTO task_history (task_id, action) VALUES (?, ?)', [result.lastID, 'created']);
   *   return result.lastID;
   * });
   *
   * // Transaction with error handling (automatic rollback)
   * try {
   *   await db.transaction(async (database) => {
   *     await database.run('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 'acc1']);
   *     await database.run('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 'acc2']);
   *
   *     // This will cause rollback if balance goes negative
   *     const account = await database.get('SELECT balance FROM accounts WHERE id = ?', ['acc1']);
   *     if (account.balance < 0) {
   *       throw new Error('Insufficient funds');
   *     }
   *   });
   * } catch (error) {
   *   console.error('Transaction rolled back:', error);
   * }
   * ```
   */
  public async transaction<T>(
    callback: (db: Database<sqlite3.Database, sqlite3.Statement>) => Promise<T>
  ): Promise<T> {
    const db = this.getDatabase();
    try {
      logger.debug('Starting transaction');
      await db.exec('BEGIN TRANSACTION');

      const result = await callback(db);

      await db.exec('COMMIT');
      logger.debug('Transaction committed successfully');
      return result;
    } catch (error) {
      logger.error('Transaction failed, rolling back', { error });
      await db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get comprehensive database statistics
   *
   * @returns {Promise<Object>} Database statistics
   * @returns {number} returns.size - Database file size in bytes
   * @returns {number} returns.pageCount - Number of database pages
   * @returns {number} returns.pageSize - Size of each page in bytes
   * @returns {boolean} returns.walMode - Whether WAL mode is enabled
   * @returns {number} returns.tables - Number of user tables
   *
   * @example
   * ```typescript
   * const stats = await db.getStats();
   * console.log(`Database size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
   * console.log(`Tables: ${stats.tables}`);
   * console.log(`WAL mode: ${stats.walMode ? 'enabled' : 'disabled'}`);
   * ```
   */
  public async getStats(): Promise<{
    size: number;
    pageCount: number;
    pageSize: number;
    walMode: boolean;
    tables: number;
  }> {
    const db = this.getDatabase();

    const [_pragmaInfo, tableCount] = await Promise.all([
      db.all('PRAGMA database_list'),
      db.get<{ count: number }>("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"),
    ]);

    const stats = await db.get(`
      SELECT 
        page_count * page_size as size,
        page_count,
        page_size
      FROM pragma_page_count(), pragma_page_size()
    `);

    const walMode = await db.get<{ journal_mode: string }>('PRAGMA journal_mode');

    return {
      size: stats?.size || 0,
      pageCount: stats?.page_count || 0,
      pageSize: stats?.page_size || 0,
      walMode: walMode?.journal_mode === 'wal',
      tables: tableCount?.count || 0,
    };
  }

  /**
   * Perform a comprehensive health check on the database connection
   *
   * @returns {Promise<Object>} Health check results
   * @returns {boolean} returns.connected - Whether database is connected
   * @returns {boolean} returns.responsive - Whether database responds within timeout
   * @returns {Object|null} returns.stats - Database statistics if healthy
   * @returns {string} [returns.error] - Error message if unhealthy
   *
   * @example
   * ```typescript
   * const health = await db.healthCheck();
   *
   * if (!health.connected) {
   *   console.error('Database disconnected:', health.error);
   * } else if (!health.responsive) {
   *   console.warn('Database slow to respond');
   * } else {
   *   console.log('Database healthy, response time:', health.stats.responseTime, 'ms');
   * }
   * ```
   */
  public async healthCheck(): Promise<{
    connected: boolean;
    responsive: boolean;
    stats: any;
    error?: string;
  }> {
    try {
      const connected = this.isConnected();
      if (!connected) {
        return { connected: false, responsive: false, stats: null };
      }

      // Test responsiveness with a simple query
      const start = Date.now();
      await this.queryOne('SELECT 1 as test');
      const responseTime = Date.now() - start;

      const stats = await this.getStats();

      return {
        connected: true,
        responsive: responseTime < 1000, // Consider responsive if < 1s
        stats: {
          ...stats,
          responseTime,
        },
      };
    } catch (error) {
      return {
        connected: false,
        responsive: false,
        stats: null,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Ensure database directory exists
   */
  private async ensureDirectoryExists(): Promise<void> {
    const dbPath = this.config.path;
    if (dbPath === ':memory:') return;

    const directory = path.dirname(dbPath);
    try {
      await fs.access(directory);
    } catch {
      logger.info('Creating database directory', { directory });
      await fs.mkdir(directory, { recursive: true });
    }
  }

  /**
   * Configure SQLite pragmas for optimal performance
   */
  private async configurePragmas(): Promise<void> {
    if (!this.db) return;

    const pragmas = [
      // Enable foreign key constraints
      'PRAGMA foreign_keys = ON',

      // Set journal mode (WAL for better concurrency)
      `PRAGMA journal_mode = ${this.config.walMode ? 'WAL' : 'DELETE'}`,

      // Set synchronous mode for performance vs durability balance
      'PRAGMA synchronous = NORMAL',

      // Set memory-mapped I/O size
      `PRAGMA mmap_size = ${this.config.memoryLimit}`,

      // Set temp store to memory for better performance
      'PRAGMA temp_store = MEMORY',

      // Set busy timeout
      `PRAGMA busy_timeout = ${this.config.timeout}`,

      // Optimize for read-heavy workload
      'PRAGMA cache_size = -64000', // 64MB cache

      // Enable auto-vacuum for automatic cleanup
      'PRAGMA auto_vacuum = INCREMENTAL',
    ];

    for (const pragma of pragmas) {
      try {
        await this.db.exec(pragma);
        logger.debug('Applied pragma', { pragma });
      } catch (error) {
        logger.warn('Failed to apply pragma', { pragma, error });
      }
    }
  }

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    if (!this.db) return;

    const result = await this.db.get('SELECT sqlite_version() as version');
    logger.info('Database connection test successful', {
      sqliteVersion: result?.version,
    });
  }

  /**
   * Ensure database schema exists and is valid
   */
  private async ensureSchemaExists(): Promise<void> {
    if (!this.schemaManager) return;

    try {
      const schemaExists = await this.schemaManager.schemaExists();

      if (!schemaExists) {
        logger.info('Database schema not found, creating...');
        await this.schemaManager.createSchema();
        logger.info('Database schema created successfully');
      } else {
        logger.debug('Database schema exists, validating...');
        const validation = await this.schemaManager.validateSchema();

        if (!validation.isValid) {
          logger.warn('Database schema validation failed', {
            missingTables: validation.missingTables,
            missingIndexes: validation.missingIndexes,
            missingViews: validation.missingViews,
            errors: validation.errors,
          });

          // For now, just log the issues. In production, you might want to
          // run migrations or recreate the schema
          logger.info('Schema validation issues detected but continuing...');
        } else {
          logger.debug('Database schema validation passed');
        }
      }
    } catch (error) {
      logger.error('Failed to ensure schema exists', { error });
      throw new Error(`Schema initialization failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get the migration runner instance
   *
   * @returns {MigrationRunner} The migration runner instance
   * @throws {Error} If migration runner is not initialized
   */
  public getMigrationRunner(): MigrationRunner {
    if (!this.migrationRunner) {
      throw new Error('Migration runner not initialized. Call initialize() first.');
    }
    return this.migrationRunner;
  }

  /**
   * Run pending migrations
   *
   * @param {string} [target] - Optional target migration ID to migrate up to
   * @returns {Promise<number>} Number of migrations run
   *
   * @example
   * ```typescript
   * // Run all pending migrations
   * const count = await db.runMigrations();
   * console.log(`Ran ${count} migrations`);
   *
   * // Run migrations up to specific target
   * await db.runMigrations('002_add_user_preferences');
   * ```
   */
  public async runMigrations(target?: string): Promise<number> {
    const runner = this.getMigrationRunner();
    return await runner.up(target);
  }

  /**
   * Rollback migrations
   *
   * @param {string} [target] - Optional target migration ID to rollback to
   * @returns {Promise<number>} Number of migrations rolled back
   *
   * @example
   * ```typescript
   * // Rollback last migration
   * await db.rollbackMigrations();
   *
   * // Rollback to specific migration
   * await db.rollbackMigrations('001_initial_schema');
   * ```
   */
  public async rollbackMigrations(target?: string): Promise<number> {
    const runner = this.getMigrationRunner();
    return await runner.down(target);
  }

  /**
   * Get migration status
   *
   * @returns {Promise<{applied: string[], pending: string[], total: number}>} Migration status
   *
   * @example
   * ```typescript
   * const status = await db.getMigrationStatus();
   * console.log(`Applied: ${status.applied.length}, Pending: ${status.pending.length}`);
   * ```
   */
  public async getMigrationStatus(): Promise<{
    applied: string[];
    pending: string[];
    total: number;
  }> {
    const runner = this.getMigrationRunner();
    return await runner.status();
  }

  /**
   * Get the seed runner instance
   *
   * @returns {SeedRunner} The seed runner instance
   * @throws {Error} If seed runner is not initialized
   */
  public getSeedRunner(): SeedRunner {
    if (!this.seedRunner) {
      throw new Error('Seed runner not initialized. Call initialize() first.');
    }
    return this.seedRunner;
  }

  /**
   * Run database seeds
   *
   * @param {Object} options - Seed options
   * @param {boolean} [options.force] - Force re-run seeds that have already been applied
   * @returns {Promise<number>} Number of seeds run
   *
   * @example
   * ```typescript
   * // Run all pending seeds
   * const count = await db.runSeeds();
   * console.log(`Ran ${count} seeds`);
   *
   * // Force re-run all seeds
   * await db.runSeeds({ force: true });
   * ```
   */
  public async runSeeds(options: { force?: boolean } = {}): Promise<number> {
    const runner = this.getSeedRunner();
    return await runner.run(options);
  }

  /**
   * Get seed status
   *
   * @returns {Promise<{applied: string[], pending: string[], total: number}>} Seed status
   *
   * @example
   * ```typescript
   * const status = await db.getSeedStatus();
   * console.log(`Applied: ${status.applied.length}, Pending: ${status.pending.length}`);
   * ```
   */
  public async getSeedStatus(): Promise<{
    applied: string[];
    pending: string[];
    total: number;
  }> {
    const runner = this.getSeedRunner();
    return await runner.status();
  }

  /**
   * Reset all seed records
   *
   * @returns {Promise<void>}
   *
   * @example
   * ```typescript
   * // Clear all seed tracking records (seeds can be re-run)
   * await db.resetSeeds();
   * ```
   */
  public async resetSeeds(): Promise<void> {
    const runner = this.getSeedRunner();
    return await runner.reset();
  }
}

/**
 * Pre-configured singleton database connection instance
 *
 * @constant {DatabaseConnection} dbConnection
 * @description This is the primary way to interact with the database throughout the application.
 * The connection is lazily initialized on first use.
 *
 * @example
 * ```typescript
 * import { dbConnection } from '@/database/connection';
 *
 * // Initialize at app startup
 * await dbConnection.initialize();
 *
 * // Use throughout the app
 * const tasks = await dbConnection.query('SELECT * FROM tasks');
 * ```
 */
export const dbConnection = DatabaseConnection.getInstance();
