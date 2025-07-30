/**
 * Kysely database connection and query builder setup
 *
 * This provides a type-safe query builder alternative to raw SQL queries.
 * Can be used alongside the existing connection for incremental migration.
 */

import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import type { Database as DatabaseSchema } from './kyselySchema';

export class KyselyConnection {
  private static instance: KyselyConnection | null = null;

  private _db: Kysely<DatabaseSchema> | null = null;

  private _sqliteDb: Database.Database | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Initialize the Kysely database connection
   */
  public static initialize(): KyselyConnection {
    if (this.instance) {
      logger.warn('Kysely connection already initialized');
      return this.instance;
    }

    this.instance = new KyselyConnection();

    try {
      // Create SQLite database instance
      this.instance._sqliteDb = new Database(config.database.path, {
        verbose: config.database.verbose ? logger.debug.bind(logger) : undefined,
      });

      // Configure SQLite pragmas for optimal performance
      this.instance._sqliteDb.pragma('journal_mode = WAL');
      this.instance._sqliteDb.pragma('synchronous = NORMAL');
      this.instance._sqliteDb.pragma('cache_size = 1000');
      this.instance._sqliteDb.pragma('foreign_keys = ON');
      this.instance._sqliteDb.pragma('temp_store = MEMORY');

      // Create Kysely instance with SQLite dialect
      this.instance._db = new Kysely<DatabaseSchema>({
        dialect: new SqliteDialect({
          database: this.instance._sqliteDb,
        }),
      });

      logger.info('Kysely database connection initialized', {
        path: config.database.path,
        walMode: true,
      });

      return this.instance;
    } catch (error) {
      logger.error('Failed to initialize Kysely connection', { error });
      throw error;
    }
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): KyselyConnection {
    if (!this.instance) {
      throw new Error('Kysely connection not initialized. Call initialize() first.');
    }
    return this.instance;
  }

  /**
   * Get the Kysely database instance
   */
  public get db(): Kysely<DatabaseSchema> {
    if (!this._db) {
      throw new Error('Kysely database not initialized. Call initialize() first.');
    }
    return this._db;
  }

  /**
   * Get the underlying SQLite database instance
   */
  public get sqlite(): Database.Database {
    if (!this._sqliteDb) {
      throw new Error('SQLite database not initialized. Call initialize() first.');
    }
    return this._sqliteDb;
  }

  /**
   * Close the database connection
   */
  public async close(): Promise<void> {
    try {
      if (this._db) {
        await this._db.destroy();
        this._db = null;
      }

      if (this._sqliteDb) {
        this._sqliteDb.close();
        this._sqliteDb = null;
      }

      logger.info('Kysely database connection closed');
    } catch (error) {
      logger.error('Error closing Kysely database connection', { error });
      throw error;
    }
  }

  /**
   * Execute a transaction
   */
  public async transaction<T>(callback: (trx: Kysely<DatabaseSchema>) => Promise<T>): Promise<T> {
    if (!this._db) {
      throw new Error('Database not initialized');
    }
    return this._db.transaction().execute(callback);
  }

  /**
   * Health check for the database connection
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      tablesExist: boolean;
      canQuery: boolean;
      errorMessage?: string;
    };
  }> {
    if (!this._db) {
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          tablesExist: false,
          canQuery: false,
          errorMessage: 'Database not initialized',
        },
      };
    }

    try {
      // Test basic query
      await this._db.selectFrom('boards').select(['id']).limit(1).execute();

      return {
        status: 'healthy',
        details: {
          connected: true,
          tablesExist: true,
          canQuery: true,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          connected: this._db !== null,
          tablesExist: false,
          canQuery: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Get database statistics
   */
  public async getStats(): Promise<{
    tableStats: Array<{
      name: string;
      rowCount: number;
      diskSize: number;
    }>;
    totalSize: number;
    walSize: number;
  }> {
    if (!this._db || !this._sqliteDb) {
      throw new Error('Database not initialized');
    }

    try {
      // Get table statistics
      const tables = ['boards', 'tasks', 'notes', 'tags', 'task_tags', 'task_dependencies'];

      const tableStats = await Promise.all(
        tables.map(async table => {
          const countResult = await this._db!.selectFrom(table as unknown)
            .select([this._db!.fn.count<number>('id').as('count')])
            .executeTakeFirst();

          const sizeResult = this._sqliteDb!.prepare<unknown[], { size: number }>(
            `SELECT SUM(pgsize) as size FROM dbstat WHERE name = ?`
          ).get(table);

          return {
            name: table,
            rowCount: countResult?.count ?? 0,
            diskSize: sizeResult?.size ?? 0,
          };
        })
      );

      // Get total database size
      const totalSizeResult = this._sqliteDb
        .prepare<
          unknown[],
          { size: number }
        >(`SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`)
        .get();

      // Get WAL file size
      const walSizeResult = this._sqliteDb
        .prepare<
          unknown[],
          { size: number }
        >(`SELECT SUM(pgsize) as size FROM dbstat WHERE name LIKE '%-wal'`)
        .get();

      return {
        tableStats,
        totalSize: totalSizeResult?.size ?? 0,
        walSize: walSizeResult?.size ?? 0,
      };
    } catch (error) {
      logger.error('Failed to get Kysely database stats', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const kyselyDb = KyselyConnection.getInstance();
