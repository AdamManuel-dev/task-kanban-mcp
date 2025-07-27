/**
 * Database schema management module
 * Handles schema creation, validation, and maintenance
 *
 * @module database/schema
 * @description This module manages the SQLite database schema lifecycle including
 * creation, validation, migrations, and maintenance operations. It ensures the database
 * structure matches the application requirements and handles schema versioning.
 *
 * @example
 * ```typescript
 * import { dbConnection } from '@/database/connection';
 *
 * const schemaManager = dbConnection.getSchemaManager();
 *
 * // Create schema
 * await schemaManager.createSchema();
 *
 * // Validate schema
 * const validation = await schemaManager.validateSchema();
 * if (!validation.isValid) {
 *   logger.error('Schema issues:', validation.errors);
 * }
 * ```
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from './connection';

/**
 * Information about the current database schema
 *
 * @interface SchemaInfo
 * @property {string} version - Current schema version
 * @property {string[]} tables - List of table names
 * @property {string[]} indexes - List of index names
 * @property {string[]} views - List of view names
 * @property {string[]} triggers - List of trigger names
 */
export interface SchemaInfo {
  version: string;
  tables: string[];
  indexes: string[];
  views: string[];
  triggers: string[];
}

/**
 * Result of schema validation check
 *
 * @interface SchemaValidationResult
 * @property {boolean} isValid - Whether schema is valid
 * @property {string[]} missingTables - Tables that should exist but don't
 * @property {string[]} missingIndexes - Indexes that should exist but don't
 * @property {string[]} missingViews - Views that should exist but don't
 * @property {string[]} errors - Validation error messages
 */
export interface SchemaValidationResult {
  isValid: boolean;
  missingTables: string[];
  missingIndexes: string[];
  missingViews: string[];
  errors: string[];
}

/**
 * Manages database schema operations
 *
 * @class SchemaManager
 * @description Handles schema creation from SQL files, validation of existing schema,
 * version tracking, and schema maintenance operations like dropping and recreation.
 *
 * @example
 * ```typescript
 * const manager = new SchemaManager(dbConnection);
 *
 * // Check if schema exists
 * if (!await manager.schemaExists()) {
 *   await manager.createSchema();
 * }
 *
 * // Get schema information
 * const info = await manager.getSchemaInfo();
 * logger.log('Tables:', info.tables.join(', '));
 * ```
 */
export class SchemaManager {
  private static readonly SCHEMA_VERSION = '1.0.0';

  private static readonly SCHEMA_FILE = join(__dirname, 'schema.sql');

  private readonly db: DatabaseConnection;

  constructor(dbConnection: DatabaseConnection) {
    this.db = dbConnection;
  }

  /**
   * Create the complete database schema from SQL file
   *
   * @returns {Promise<void>}
   * @throws {Error} If schema creation fails
   *
   * @example
   * ```typescript
   * await schemaManager.createSchema();
   * logger.log('Schema created successfully');
   * ```
   */
  async createSchema(): Promise<void> {
    logger.info('Creating database schema...');

    try {
      const schemaSQL = SchemaManager.readSchemaFile();

      await this.db.transaction(async database => {
        // Execute the entire schema file at once
        await database.exec(schemaSQL);

        // Create schema info record
        await this.createSchemaInfoTable();
        await this.recordSchemaVersion();
      });

      logger.info('Database schema created successfully');
    } catch (error) {
      logger.error('Failed to create database schema:', error);
      throw new Error(
        `Schema creation failed: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
      );
    }
  }

  /**
   * Validate the current database schema against expected structure
   *
   * @returns {Promise<SchemaValidationResult>} Validation result with details
   *
   * @example
   * ```typescript
   * const result = await schemaManager.validateSchema();
   * if (!result.isValid) {
   *   logger.error('Missing tables:', result.missingTables);
   *   logger.error('Missing indexes:', result.missingIndexes);
   * }
   * ```
   */
  async validateSchema(): Promise<SchemaValidationResult> {
    logger.info('Validating database schema...');

    try {
      const expectedSchema = await this.getExpectedSchema();
      const currentSchema = await this.getCurrentSchema();

      const result: SchemaValidationResult = {
        isValid: true,
        missingTables: [],
        missingIndexes: [],
        missingViews: [],
        errors: [],
      };

      // Check tables
      for (const table of expectedSchema.tables) {
        if (!currentSchema.tables.includes(table)) {
          result.missingTables.push(table);
          result.isValid = false;
        }
      }

      // Check indexes
      for (const index of expectedSchema.indexes) {
        if (!currentSchema.indexes.includes(index)) {
          result.missingIndexes.push(index);
          result.isValid = false;
        }
      }

      // Check views
      for (const view of expectedSchema.views) {
        if (!currentSchema.views.includes(view)) {
          result.missingViews.push(view);
          result.isValid = false;
        }
      }

      // Check schema version
      const currentVersion = await this.getCurrentSchemaVersion();
      if (currentVersion !== SchemaManager.SCHEMA_VERSION) {
        result.errors.push(
          `Schema version mismatch: expected ${String(String(SchemaManager.SCHEMA_VERSION))}, got ${String(currentVersion)}`
        );
        result.isValid = false;
      }

      logger.info(`Schema validation completed. Valid: ${String(String(result.isValid))}`);
      return result;
    } catch (error) {
      logger.error('Schema validation failed:', error);
      return {
        isValid: false,
        missingTables: [],
        missingIndexes: [],
        missingViews: [],
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
      };
    }
  }

  /**
   * Get schema information from the database
   */
  async getSchemaInfo(): Promise<SchemaInfo> {
    const currentSchema = await this.getCurrentSchema();
    const version = await this.getCurrentSchemaVersion();

    return {
      version,
      tables: currentSchema.tables,
      indexes: currentSchema.indexes,
      views: currentSchema.views,
      triggers: currentSchema.triggers,
    };
  }

  /**
   * Check if schema exists
   */
  async schemaExists(): Promise<boolean> {
    try {
      // Check for multiple core tables to ensure schema really exists
      const tables = await this.db.query(`
        SELECT COUNT(*) as count FROM sqlite_master 
        WHERE type='table' 
        AND name IN ('boards', 'tasks', 'columns', 'notes', 'tags')
        AND name NOT LIKE 'sqlite_%'
      `);
      // Consider schema exists if we have at least 3 of the core tables
      return tables[0]?.count >= 3;
    } catch (error) {
      logger.error('Error checking schema existence:', error);
      return false;
    }
  }

  /**
   * Drop all schema objects (for testing/reset)
   */
  async dropSchema(): Promise<void> {
    logger.warn('Dropping database schema...');

    try {
      // First check if any schema exists
      const tables = await this.db.query(`
        SELECT COUNT(*) as count FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `);

      if (!tables || tables[0]?.count === 0) {
        logger.info('No schema to drop');
        return;
      }

      await this.db.transaction(async database => {
        // First, disable foreign key constraints to allow dropping in any order
        await database.run('PRAGMA foreign_keys = OFF');

        // Drop all triggers first
        const triggers = await database.all(`
          SELECT name FROM sqlite_master WHERE type='trigger'
        `);
        await Promise.all(
          triggers.map(async trigger => {
            await database.run(`DROP TRIGGER IF EXISTS "${String(String(trigger.name))}"`);
          })
        );

        // Drop all indexes
        const indexes = await database.all(`
          SELECT name FROM sqlite_master 
          WHERE type='index' AND name NOT LIKE 'sqlite_%'
        `);
        await Promise.all(
          indexes.map(async index => {
            await database.run(`DROP INDEX IF EXISTS "${String(String(index.name))}"`);
          })
        );

        // Drop all views
        const views = await database.all(`
          SELECT name FROM sqlite_master WHERE type='view'
        `);
        await Promise.all(
          views.map(async view => {
            await database.run(`DROP VIEW IF EXISTS "${String(String(view.name))}"`);
          })
        );

        // Drop FTS virtual tables first
        const ftsTables = await database.all(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name LIKE '%_fts' AND name NOT LIKE '%_fts_%'
        `);
        await Promise.all(
          ftsTables.map(async ftsTable => {
            await database.run(`DROP TABLE IF EXISTS "${String(String(ftsTable.name))}"`);
          })
        );

        // Get tables in dependency order (reverse of creation order)
        const tableOrder = [
          'backup_metadata',
          'context_analytics',
          'repository_mappings',
          'task_tags',
          'tags',
          'notes',
          'task_dependencies',
          'task_progress',
          'tasks',
          'columns',
          'boards',
          'schema_info',
        ];

        // Drop tables in specific order
        try {
          await Promise.all(
            tableOrder.map(async tableName => {
              await database.run(`DROP TABLE IF EXISTS "${String(tableName)}"`);
            })
          );
        } catch (e) {
          logger.debug('Failed to drop tables:', e);
        }

        // Drop any remaining tables
        const remainingTables = await database.all(`
          SELECT name FROM sqlite_master 
          WHERE type='table' 
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '%_fts%'
        `);

        try {
          await Promise.all(
            remainingTables.map(async table => {
              await database.run(`DROP TABLE IF EXISTS "${String(String(table.name))}"`);
            })
          );
        } catch (e) {
          logger.debug('Failed to drop remaining tables:', e);
        }

        // Re-enable foreign key constraints
        await database.run('PRAGMA foreign_keys = ON');
      });

      logger.info('Database schema dropped successfully');
    } catch (error) {
      logger.error('Failed to drop database schema:', error);
      throw new Error(
        `Schema drop failed: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
      );
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<Record<string, any>> {
    try {
      const stats = await this.db.getStats();

      // Get table row counts
      const tables = await this.db.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const tableCounts: Record<string, number> = {};
      await Promise.all(
        tables.map(async table => {
          await this.db.queryOne(`SELECT COUNT(*) as count FROM ${String(String(table.name))}`);
        })
      );

      return {
        ...stats,
        tableCounts,
        totalRecords: Object.values(tableCounts).reduce((sum, count) => sum + count, 0),
      };
    } catch (error) {
      logger.error('Error getting database statistics:', error);
      throw error;
    }
  }

  // Private helper methods

  private static readSchemaFile(): string {
    try {
      return readFileSync(SchemaManager.SCHEMA_FILE, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to read schema file: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
      );
    }
  }

  private static parseSchemaStatements(schemaSQL: string): string[] {
    // Remove comments but preserve line structure for better debugging
    const cleanSQL = schemaSQL
      .replace(/--.*$/gm, '') // Remove line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove block comments

    // Split statements more intelligently
    const statements = [];
    let currentStatement = '';
    let inQuotes = false;
    let quoteChar = '';

    const lines = cleanSQL.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) continue;

      // Check for quote boundaries
      for (let i = 0; i < trimmedLine.length; i++) {
        const char = trimmedLine[i];

        if (!inQuotes && (char === "'" || char === '"')) {
          inQuotes = true;
          quoteChar = char;
        } else if (inQuotes && char === quoteChar) {
          inQuotes = false;
          quoteChar = '';
        }
      }

      currentStatement += `${line}\n`;

      // If we're not in quotes and the line ends with semicolon, it's a complete statement
      if (!inQuotes && trimmedLine.endsWith(';')) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }

    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    return statements;
  }

  private async createSchemaInfoTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS schema_info (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private async recordSchemaVersion(): Promise<void> {
    await this.db.execute(
      `
      INSERT OR REPLACE INTO schema_info (key, value, updated_at)
      VALUES ('version', ?, CURRENT_TIMESTAMP)
    `,
      [SchemaManager.SCHEMA_VERSION]
    );
  }

  private async getCurrentSchemaVersion(): Promise<string> {
    try {
      const result = await this.db.queryOne(`
        SELECT value FROM schema_info WHERE key = 'version'
      `);
      return result?.value ?? 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  private getExpectedSchema(): SchemaInfo {
    // Parse the schema file to extract expected objects
    const schemaSQL = SchemaManager.readSchemaFile();

    const tables = SchemaManager.extractObjectNames(schemaSQL, 'CREATE TABLE');
    const indexes = SchemaManager.extractObjectNames(schemaSQL, 'CREATE INDEX');
    const views = SchemaManager.extractObjectNames(schemaSQL, 'CREATE VIEW');
    const triggers = SchemaManager.extractObjectNames(schemaSQL, 'CREATE TRIGGER');

    return {
      version: SchemaManager.SCHEMA_VERSION,
      tables,
      indexes,
      views,
      triggers,
    };
  }

  private async getCurrentSchema(): Promise<SchemaInfo> {
    const objects = await this.db.query(`
      SELECT name, type FROM sqlite_master 
      WHERE type IN ('table', 'index', 'view', 'trigger')
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);

    const schema: SchemaInfo = {
      version: await this.getCurrentSchemaVersion(),
      tables: [],
      indexes: [],
      views: [],
      triggers: [],
    };

    for (const obj of objects) {
      switch (obj.type) {
        case 'table':
          schema.tables.push(obj.name);
          break;
        case 'index':
          schema.indexes.push(obj.name);
          break;
        case 'view':
          schema.views.push(obj.name);
          break;
        case 'trigger':
          schema.triggers.push(obj.name);
          break;
      }
    }

    return schema;
  }

  private static extractObjectNames(sql: string, createStatement: string): string[] {
    const regex = new RegExp(
      `${String(createStatement)}\\s+(?:IF NOT EXISTS\\s+)?(?:\\w+\\.)?([\\w_]+)`,
      'gi'
    );
    const matches: string[] = [];
    let match;

    while ((match = regex.exec(sql)) !== null) {
      if (match[1]) {
        matches.push(match[1]);
      }
    }

    return matches;
  }
}
