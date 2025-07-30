/**
 * @fileoverview Kysely database connection for type-safe queries
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Type-safe query builder, SQLite integration, transaction support
 * Main APIs: getKyselyDb(), transaction support, query builder interface
 * Constraints: Requires existing DatabaseConnection, works with SQLite
 * Patterns: Singleton pattern, lazy initialization, error handling
 */

import { Kysely, SqliteDialect, FileMigrationProvider, Migrator } from 'kysely';
import * as path from 'path';
import * as fs from 'fs';
import type { Database } from './schema-types';
import { DatabaseConnection } from './connection';

/**
 * Kysely database instance (singleton)
 */
let kyselyDb: Kysely<Database> | null = null;

/**
 * Get the Kysely database instance
 * Uses the existing DatabaseConnection's SQLite database
 */
export function getKyselyDb(): Kysely<Database> {
  if (!kyselyDb) {
    const dbConnection = DatabaseConnection.getInstance();
    const sqlite = dbConnection.getDatabase();

    if (!sqlite) {
      throw new Error('Database not initialized. Call dbConnection.initialize() first.');
    }

    kyselyDb = new Kysely<Database>({
      dialect: new SqliteDialect({
        database: sqlite,
      }),
    });
  }

  return kyselyDb;
}

/**
 * Reset Kysely instance (for testing)
 */
export function resetKyselyDb(): void {
  if (kyselyDb) {
    kyselyDb.destroy();
    kyselyDb = null;
  }
}

/**
 * Execute a transaction with Kysely
 */
export async function kyselyTransaction<T>(
  callback: (trx: Kysely<Database>) => Promise<T>
): Promise<T> {
  const db = getKyselyDb();
  return await db.transaction().execute(callback);
}
