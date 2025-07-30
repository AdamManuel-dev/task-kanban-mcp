/**
 * @fileoverview Type-safe database migration system
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Type-safe migrations, schema versioning, rollback support, validation
 * Main APIs: TypeSafeMigrationRunner, migration execution, schema validation
 * Constraints: Requires TypeScript, SQLite database, migration files structure
 * Patterns: Type safety, fluent API, comprehensive error handling, logging
 */

import type { Database } from 'sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { logger } from '../../utils/logger';
import type { Migration, MigrationFile, AppliedMigration, MigrationOptions } from './types';

/**
 * Type-safe schema definition for migrations
 */
export interface SchemaVersion {
  version: number;
  description: string;
  tables: Record<string, TableDefinition>;
  indexes: IndexDefinition[];
  constraints: ConstraintDefinition[];
}

/**
 * Table definition with typed columns
 */
export interface TableDefinition {
  name: string;
  columns: Record<string, ColumnDefinition>;
  primaryKey?: string | string[];
  foreignKeys?: ForeignKeyDefinition[];
}

/**
 * Column definition with type safety
 */
export interface ColumnDefinition {
  type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN' | 'DATETIME';
  nullable?: boolean;
  defaultValue?: string | number | boolean | null;
  unique?: boolean;
  autoIncrement?: boolean;
}

/**
 * Index definition
 */
export interface IndexDefinition {
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
}

/**
 * Constraint definition
 */
export interface ConstraintDefinition {
  name: string;
  table: string;
  type: 'CHECK' | 'UNIQUE' | 'FOREIGN_KEY';
  definition: string;
}

/**
 * Foreign key definition
 */
export interface ForeignKeyDefinition {
  column: string;
  referencesTable: string;
  referencesColumn: string;
  onDelete?: 'CASCADE' | 'RESTRICT' | 'SET_NULL' | 'SET_DEFAULT';
  onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET_NULL' | 'SET_DEFAULT';
}

/**
 * Type-safe migration interface
 */
export interface TypeSafeMigration {
  id: string;
  version: number;
  description: string;
  schema: SchemaVersion;
  up: (db: Database, schema: SchemaVersion) => Promise<void>;
  down: (db: Database, previousSchema?: SchemaVersion) => Promise<void>;
  validate?: (db: Database) => Promise<boolean>;
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  success: boolean;
  migrationId: string;
  executionTime: number;
  error?: Error;
  schemaValidation?: boolean;
}

/**
 * Type-safe migration runner with schema validation and rollback support
 */
export class TypeSafeMigrationRunner {
  private readonly db: Database;

  private readonly migrationsPath: string;

  private readonly tableName: string;

  private readonly validateChecksums: boolean;

  private readonly schemaTableName: string;

  constructor(db: Database, options: MigrationOptions & { schemaTableName?: string } = {}) {
    this.db = db;
    this.migrationsPath = options.migrationsPath ?? path.join(__dirname, '.');

    // Validate table names to prevent SQL injection
    const tableName = options.tableName ?? 'schema_migrations';
    const schemaTableName = options.schemaTableName ?? 'schema_versions';

    TypeSafeMigrationRunner.validateMigrationTableName(tableName);
    this.validateMigrationTableName(schemaTableName);

    this.tableName = tableName;
    this.schemaTableName = schemaTableName;
    this.validateChecksums = options.validateChecksums !== false;
  }

  /**
   * Validates migration table names to prevent SQL injection
   */
  private static validateMigrationTableName(tableName: string): void {
    // Allow only valid migration table names
    const validMigrationTables = ['schema_migrations', 'schema_versions', 'migration_history'];
    if (!validMigrationTables.includes(tableName)) {
      throw new Error(
        `Invalid migration table name. Must be one of: ${validMigrationTables.join(', ')}`
      );
    }

    // Additional validation: alphanumeric and underscores only
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error(
        `Invalid table name format: ${tableName}. Must contain only letters, numbers, and underscores.`
      );
    }
  }

  /**
   * Initialize migration and schema tables
   */
  async initialize(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));

    // Create migrations table
    await run(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL,
        execution_time INTEGER NOT NULL DEFAULT 0,
        schema_version INTEGER
      )
    `);

    // Create schema versions table
    await run(`
      CREATE TABLE IF NOT EXISTS ${this.schemaTableName} (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        schema_definition TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_current BOOLEAN DEFAULT FALSE
      )
    `);

    logger.info('Type-safe migration tables initialized');
  }

  /**
   * Get current schema version
   */
  async getCurrentSchemaVersion(): Promise<number> {
    const get = promisify(this.db.get.bind(this.db));

    const result = (await get(`
      SELECT version 
      FROM ${this.schemaTableName} 
      WHERE is_current = TRUE
    `)) as { version: number } | undefined;

    return result?.version ?? 0;
  }

  /**
   * Save schema version
   */
  async saveSchemaVersion(schema: SchemaVersion): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));

    // Mark current version as not current
    await run(`UPDATE ${this.schemaTableName} SET is_current = FALSE`);

    // Insert new schema version
    await run(
      `
      INSERT INTO ${this.schemaTableName} (version, description, schema_definition, is_current)
      VALUES (?, ?, ?, TRUE)
    `,
      [schema.version, schema.description, JSON.stringify(schema, null, 2)]
    );

    logger.info('Schema version saved', { version: schema.version });
  }

  /**
   * Load type-safe migration files
   */
  async loadTypeSafeMigrations(): Promise<TypeSafeMigration[]> {
    try {
      const files = await fs.readdir(this.migrationsPath);

      const migrationPromises = files
        .filter(file => file.endsWith('.ts') && file.startsWith('ts_'))
        .map(async file => {
          const filePath = path.join(this.migrationsPath, file);

          try {
            // Dynamic import of TypeScript migration
            const migrationModule = await import(filePath);
            const migration: TypeSafeMigration = migrationModule.default || migrationModule;

            if (!TypeSafeMigrationRunner.validateMigrationStructure(migration)) {
              logger.warn(`Invalid migration structure in ${file}`);
              return null;
            }

            return migration;
          } catch (error) {
            logger.error(`Failed to load migration ${file}:`, error);
            return null;
          }
        });

      const results = await Promise.all(migrationPromises);
      const migrations = results.filter((m): m is TypeSafeMigration => m !== null);

      // Sort by version
      migrations.sort((a, b) => a.version - b.version);

      logger.info(`Loaded ${migrations.length} type-safe migrations`);
      return migrations;
    } catch (error) {
      logger.error('Failed to load type-safe migrations:', error);
      throw error;
    }
  }

  /**
   * Validate migration structure
   */
  private static validateMigrationStructure(migration: unknown): migration is TypeSafeMigration {
    return (
      typeof migration.id === 'string' &&
      typeof migration.version === 'number' &&
      typeof migration.description === 'string' &&
      typeof migration.schema === 'object' &&
      typeof migration.up === 'function' &&
      typeof migration.down === 'function'
    );
  }

  /**
   * Execute pending migrations
   */
  async runPendingMigrations(): Promise<MigrationResult[]> {
    const migrations = await this.loadTypeSafeMigrations();
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));

    const pendingMigrations = migrations.filter(m => !appliedIds.has(m.id));

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations');
      return [];
    }

    logger.info(`Running ${pendingMigrations.length} pending migrations`);

    const results: MigrationResult[] = [];

    for (const migration of pendingMigrations) {
      const result = await this.executeMigration(migration);
      results.push(result);

      if (!result.success) {
        logger.error(`Migration ${migration.id} failed, stopping execution`);
        break;
      }
    }

    return results;
  }

  /**
   * Execute a single migration
   */
  async executeMigration(migration: TypeSafeMigration): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      logger.info(`Executing migration: ${migration.id}`);

      // Begin transaction
      const run = promisify(this.db.run.bind(this.db));
      await run('BEGIN TRANSACTION');

      try {
        // Execute migration
        await migration.up(this.db, migration.schema);

        // Validate schema if validation function provided
        let schemaValidation = true;
        if (migration.validate) {
          schemaValidation = await migration.validate(this.db);
          if (!schemaValidation) {
            throw new Error('Schema validation failed after migration');
          }
        }

        // Save schema version
        await this.saveSchemaVersion(migration.schema);

        // Record migration
        const executionTime = Date.now() - startTime;
        await run(
          `
          INSERT INTO ${this.tableName} (id, checksum, execution_time, schema_version)
          VALUES (?, ?, ?, ?)
        `,
          [
            migration.id,
            TypeSafeMigrationRunner.calculateMigrationChecksum(migration),
            executionTime,
            migration.version,
          ]
        );

        // Commit transaction
        await run('COMMIT');

        logger.info(`Migration ${migration.id} completed successfully`, {
          executionTime,
          schemaVersion: migration.version,
        });

        return {
          success: true,
          migrationId: migration.id,
          executionTime,
          schemaValidation,
        };
      } catch (error) {
        // Rollback transaction
        await run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error(`Migration ${migration.id} failed:`, error);

      return {
        success: false,
        migrationId: migration.id,
        executionTime,
        error: error as Error,
      };
    }
  }

  /**
   * Rollback to a specific schema version
   */
  async rollbackToVersion(targetVersion: number): Promise<MigrationResult[]> {
    const migrations = await this.loadTypeSafeMigrations();
    const currentVersion = await this.getCurrentSchemaVersion();

    if (targetVersion >= currentVersion) {
      throw new Error(
        `Target version ${targetVersion} is not less than current version ${currentVersion}`
      );
    }

    // Find migrations to rollback (in reverse order)
    const migrationsToRollback = migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version);

    if (migrationsToRollback.length === 0) {
      logger.info('No migrations to rollback');
      return [];
    }

    logger.info(
      `Rolling back ${migrationsToRollback.length} migrations to version ${targetVersion}`
    );

    const results: MigrationResult[] = [];

    for (const migration of migrationsToRollback) {
      const result = await this.rollbackMigration(migration, targetVersion);
      results.push(result);

      if (!result.success) {
        logger.error(`Rollback of ${migration.id} failed, stopping rollback`);
        break;
      }
    }

    return results;
  }

  /**
   * Rollback a single migration
   */
  async rollbackMigration(
    migration: TypeSafeMigration,
    targetVersion: number
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      logger.info(`Rolling back migration: ${migration.id}`);

      const run = promisify(this.db.run.bind(this.db));
      await run('BEGIN TRANSACTION');

      try {
        // Execute rollback
        await migration.down(this.db);

        // Remove migration record
        await run(`DELETE FROM ${this.tableName} WHERE id = ?`, [migration.id]);

        // Update schema version
        if (targetVersion > 0) {
          await run(`UPDATE ${this.schemaTableName} SET is_current = TRUE WHERE version = ?`, [
            targetVersion,
          ]);
        }

        await run('COMMIT');

        const executionTime = Date.now() - startTime;

        logger.info(`Migration ${migration.id} rolled back successfully`, {
          executionTime,
        });

        return {
          success: true,
          migrationId: migration.id,
          executionTime,
        };
      } catch (error) {
        await run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error(`Rollback of ${migration.id} failed:`, error);

      return {
        success: false,
        migrationId: migration.id,
        executionTime,
        error: error as Error,
      };
    }
  }

  /**
   * Generate SQL from table definition
   */
  static generateCreateTableSQL(table: TableDefinition): string {
    const columns = Object.entries(table.columns).map(([name, def]) => {
      let sql = `${name} ${def.type}`;

      if (def.autoIncrement) sql += ' AUTOINCREMENT';
      if (!def.nullable) sql += ' NOT NULL';
      if (def.unique) sql += ' UNIQUE';
      if (def.defaultValue !== undefined) {
        sql += ` DEFAULT ${typeof def.defaultValue === 'string' ? `'${def.defaultValue}'` : def.defaultValue}`;
      }

      return sql;
    });

    if (table.primaryKey) {
      const pk = Array.isArray(table.primaryKey) ? table.primaryKey.join(', ') : table.primaryKey;
      columns.push(`PRIMARY KEY (${pk})`);
    }

    if (table.foreignKeys) {
      table.foreignKeys.forEach(fk => {
        let fkSql = `FOREIGN KEY (${fk.column}) REFERENCES ${fk.referencesTable}(${fk.referencesColumn})`;
        if (fk.onDelete) fkSql += ` ON DELETE ${fk.onDelete}`;
        if (fk.onUpdate) fkSql += ` ON UPDATE ${fk.onUpdate}`;
        columns.push(fkSql);
      });
    }

    return `CREATE TABLE ${table.name} (\n  ${columns.join(',\n  ')}\n)`;
  }

  /**
   * Calculate migration checksum
   */
  private static calculateMigrationChecksum(migration: TypeSafeMigration): string {
    const content = JSON.stringify({
      id: migration.id,
      version: migration.version,
      description: migration.description,
      schema: migration.schema,
    });

    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get applied migrations (reuse from base class)
   */
  async getAppliedMigrations(): Promise<AppliedMigration[]> {
    const all = promisify(this.db.all.bind(this.db));

    const result = (await all(
      `SELECT id, applied_at, checksum FROM ${this.tableName} ORDER BY id`
    )) as AppliedMigration[];

    return result ?? [];
  }

  /**
   * Validate current database schema against expected schema
   */
  async validateCurrentSchema(): Promise<{ valid: boolean; errors: string[] }> {
    const currentVersion = await this.getCurrentSchemaVersion();
    const migrations = await this.loadTypeSafeMigrations();
    const currentMigration = migrations.find(m => m.version === currentVersion);

    if (!currentMigration) {
      return {
        valid: false,
        errors: [`No migration found for current schema version ${currentVersion}`],
      };
    }

    const errors: string[] = [];

    try {
      if (currentMigration.validate) {
        const isValid = await currentMigration.validate(this.db);
        if (!isValid) {
          errors.push('Custom schema validation failed');
        }
      }

      // Additional schema validation could be added here
      // e.g., checking table existence, column types, etc.
    } catch (error) {
      errors.push(`Schema validation error: ${error}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
