/**
 * @fileoverview Type-safe SQL query templates and builder
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Type-safe query building, SQL template literals, parameter validation
 * Main APIs: TypeSafeQueryBuilder, query templates, parameter binding
 * Constraints: SQLite dialect, TypeScript compilation required
 * Patterns: Builder pattern, template literals, comprehensive type safety
 */

import type { Database } from 'sqlite3';
import { promisify } from 'util';
import { logger } from '../utils/logger';

/**
 * SQL parameter types
 */
export type SQLParameter = string | number | boolean | null | Date | Buffer;

/**
 * Query result row type
 */
export type QueryRow = Record<string, unknown>;

/**
 * Query execution result
 */
export interface QueryResult<T = QueryRow> {
  rows: T[];
  rowCount: number;
  executionTime: number;
}

/**
 * Table schema definition for type safety
 */
export type TableSchema = Record<
  string,
  Record<string, 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN' | 'DATETIME'>
>;

/**
 * Default schema for existing tables
 */
export const DefaultSchema: TableSchema = {
  tasks: {
    id: 'TEXT',
    board_id: 'TEXT',
    column_id: 'TEXT',
    title: 'TEXT',
    description: 'TEXT',
    status: 'TEXT',
    priority: 'INTEGER',
    assignee: 'TEXT',
    due_date: 'DATETIME',
    position: 'INTEGER',
    parent_task_id: 'TEXT',
    created_at: 'DATETIME',
    updated_at: 'DATETIME',
  },
  boards: {
    id: 'TEXT',
    name: 'TEXT',
    description: 'TEXT',
    created_at: 'DATETIME',
    updated_at: 'DATETIME',
  },
  notes: {
    id: 'TEXT',
    task_id: 'TEXT',
    board_id: 'TEXT',
    content: 'TEXT',
    category: 'TEXT',
    is_pinned: 'BOOLEAN',
    created_at: 'DATETIME',
    updated_at: 'DATETIME',
  },
  tags: {
    id: 'TEXT',
    name: 'TEXT',
    color: 'TEXT',
    parent_tag_id: 'TEXT',
    created_at: 'DATETIME',
    updated_at: 'DATETIME',
  },
};

/**
 * WHERE condition builder for type safety
 */
export class WhereBuilder<TSchema extends TableSchema, TTable extends keyof TSchema> {
  private readonly conditions: string[] = [];

  private readonly parameters: SQLParameter[] = [];

  constructor(
    private readonly tableName: TTable,
    private readonly schema: TSchema
  ) {}

  /**
   * Add equals condition
   */
  equals<TColumn extends keyof TSchema[TTable]>(column: TColumn, value: SQLParameter): this {
    this.validateColumn(column);
    this.conditions.push(`${String(column)} = ?`);
    this.parameters.push(value);
    return this;
  }

  /**
   * Add not equals condition
   */
  notEquals<TColumn extends keyof TSchema[TTable]>(column: TColumn, value: SQLParameter): this {
    this.validateColumn(column);
    this.conditions.push(`${String(column)} != ?`);
    this.parameters.push(value);
    return this;
  }

  /**
   * Add LIKE condition
   */
  like<TColumn extends keyof TSchema[TTable]>(column: TColumn, pattern: string): this {
    this.validateColumn(column);
    this.validateTextColumn(column);
    this.conditions.push(`${String(column)} LIKE ?`);
    this.parameters.push(pattern);
    return this;
  }

  /**
   * Add IN condition
   */
  in<TColumn extends keyof TSchema[TTable]>(column: TColumn, values: SQLParameter[]): this {
    this.validateColumn(column);
    if (values.length === 0) {
      throw new Error('IN condition requires at least one value');
    }

    const placeholders = values.map(() => '?').join(', ');
    this.conditions.push(`${String(column)} IN (${placeholders})`);
    this.parameters.push(...values);
    return this;
  }

  /**
   * Add range condition (BETWEEN)
   */
  between<TColumn extends keyof TSchema[TTable]>(
    column: TColumn,
    min: SQLParameter,
    max: SQLParameter
  ): this {
    this.validateColumn(column);
    this.conditions.push(`${String(column)} BETWEEN ? AND ?`);
    this.parameters.push(min, max);
    return this;
  }

  /**
   * Add IS NULL condition
   */
  isNull<TColumn extends keyof TSchema[TTable]>(column: TColumn): this {
    this.validateColumn(column);
    this.conditions.push(`${String(column)} IS NULL`);
    return this;
  }

  /**
   * Add IS NOT NULL condition
   */
  isNotNull<TColumn extends keyof TSchema[TTable]>(column: TColumn): this {
    this.validateColumn(column);
    this.conditions.push(`${String(column)} IS NOT NULL`);
    return this;
  }

  /**
   * Add custom raw condition
   */
  raw(condition: string, ...params: SQLParameter[]): this {
    this.conditions.push(condition);
    this.parameters.push(...params);
    return this;
  }

  /**
   * Combine with AND
   */
  and(): this {
    if (this.conditions.length > 0) {
      this.conditions.push('AND');
    }
    return this;
  }

  /**
   * Combine with OR
   */
  or(): this {
    if (this.conditions.length > 0) {
      this.conditions.push('OR');
    }
    return this;
  }

  /**
   * Build WHERE clause
   */
  build(): { sql: string; parameters: SQLParameter[] } {
    if (this.conditions.length === 0) {
      return { sql: '', parameters: [] };
    }

    const sql = `WHERE ${this.conditions.join(' ')}`;
    return { sql, parameters: this.parameters };
  }

  private validateColumn(column: keyof TSchema[TTable]): void {
    if (!(column in this.schema[this.tableName])) {
      throw new Error(
        `Column '${String(column)}' does not exist in table '${String(this.tableName)}'`
      );
    }
  }

  private validateTextColumn(column: keyof TSchema[TTable]): void {
    const columnType = this.schema[this.tableName][column];
    if (columnType !== 'TEXT') {
      throw new Error(
        `LIKE operation requires TEXT column, but '${String(column)}' is ${columnType}`
      );
    }
  }
}

/**
 * Type-safe query builder
 */
export class TypeSafeQueryBuilder<TSchema extends TableSchema = typeof DefaultSchema> {
  private readonly db: Database;

  private readonly schema: TSchema;

  constructor(db: Database, schema?: TSchema) {
    this.db = db;
    this.schema = (schema ?? DefaultSchema) as TSchema;
  }

  /**
   * Create SELECT query builder
   */
  select<TTable extends keyof TSchema>(
    tableName: TTable,
    columns: Array<keyof TSchema[TTable]> = []
  ) {
    // Validate table exists
    if (!(tableName in this.schema)) {
      throw new Error(`Table '${String(tableName)}' does not exist in schema`);
    }

    return new SelectQueryBuilder(this.db, this.schema, tableName, columns);
  }

  /**
   * Create INSERT query builder
   */
  insert<TTable extends keyof TSchema>(
    tableName: TTable,
    data: Partial<Record<keyof TSchema[TTable], SQLParameter>>
  ) {
    // Validate table exists
    if (!(tableName in this.schema)) {
      throw new Error(`Table '${String(tableName)}' does not exist in schema`);
    }

    return new InsertQueryBuilder(this.db, this.schema, tableName, data);
  }

  /**
   * Create UPDATE query builder
   */
  update<TTable extends keyof TSchema>(
    tableName: TTable,
    data: Partial<Record<keyof TSchema[TTable], SQLParameter>>
  ) {
    // Validate table exists
    if (!(tableName in this.schema)) {
      throw new Error(`Table '${String(tableName)}' does not exist in schema`);
    }

    return new UpdateQueryBuilder(this.db, this.schema, tableName, data);
  }

  /**
   * Create DELETE query builder
   */
  delete<TTable extends keyof TSchema>(tableName: TTable) {
    // Validate table exists
    if (!(tableName in this.schema)) {
      throw new Error(`Table '${String(tableName)}' does not exist in schema`);
    }

    return new DeleteQueryBuilder(this.db, this.schema, tableName);
  }

  /**
   * Execute raw SQL with parameter validation
   */
  async raw(sql: string, parameters: SQLParameter[] = []): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const all = promisify(this.db.all.bind(this.db));
      const rows = (await all(sql, parameters)) as QueryRow[];

      const executionTime = Date.now() - startTime;

      logger.debug('Executed raw SQL query', {
        sql: sql.substring(0, 100),
        paramCount: parameters.length,
        rowCount: rows.length,
        executionTime,
      });

      return {
        rows,
        rowCount: rows.length,
        executionTime,
      };
    } catch (error) {
      logger.error('Raw SQL query failed', { sql, parameters, error });
      throw error;
    }
  }
}

/**
 * SELECT query builder
 */
export class SelectQueryBuilder<TSchema extends TableSchema, TTable extends keyof TSchema> {
  private readonly tableName: TTable;

  private readonly columns: Array<keyof TSchema[TTable]>;

  private readonly whereBuilder: WhereBuilder<TSchema, TTable>;

  private orderByClause = '';

  private limitClause = '';

  private offsetClause = '';

  private readonly joinClauses: string[] = [];

  constructor(
    private readonly db: Database,
    private readonly schema: TSchema,
    tableName: TTable,
    columns: Array<keyof TSchema[TTable]>
  ) {
    this.tableName = tableName;

    // Validate table exists
    if (!(tableName in this.schema)) {
      throw new Error(`Table '${String(tableName)}' does not exist in schema`);
    }

    this.columns =
      columns.length > 0
        ? columns
        : (Object.keys(this.schema[tableName]) as Array<keyof TSchema[TTable]>);

    // Validate all columns exist
    for (const column of this.columns) {
      this.validateColumn(column);
    }

    this.whereBuilder = new WhereBuilder(tableName, schema);
  }

  /**
   * Add WHERE conditions
   */
  where(callback: (builder: WhereBuilder<TSchema, TTable>) => void): this {
    callback(this.whereBuilder);
    return this;
  }

  /**
   * Add ORDER BY clause
   */
  orderBy<TColumn extends keyof TSchema[TTable]>(
    column: TColumn,
    direction: 'ASC' | 'DESC' = 'ASC'
  ): this {
    this.validateColumn(column);
    this.orderByClause = `ORDER BY ${String(column)} ${direction}`;
    return this;
  }

  /**
   * Add LIMIT clause
   */
  limit(count: number): this {
    if (count <= 0) {
      throw new Error('LIMIT must be a positive number');
    }
    this.limitClause = `LIMIT ${count}`;
    return this;
  }

  /**
   * Add OFFSET clause
   */
  offset(count: number): this {
    if (count < 0) {
      throw new Error('OFFSET must be non-negative');
    }
    this.offsetClause = `OFFSET ${count}`;
    return this;
  }

  /**
   * Add JOIN clause
   */
  join<TJoinTable extends keyof TSchema>(joinTable: TJoinTable, onCondition: string): this {
    this.joinClauses.push(`JOIN ${String(joinTable)} ON ${onCondition}`);
    return this;
  }

  /**
   * Add LEFT JOIN clause
   */
  leftJoin<TJoinTable extends keyof TSchema>(joinTable: TJoinTable, onCondition: string): this {
    this.joinClauses.push(`LEFT JOIN ${String(joinTable)} ON ${onCondition}`);
    return this;
  }

  /**
   * Execute the query
   */
  async execute<TResult = QueryRow>(): Promise<QueryResult<TResult>> {
    const startTime = Date.now();

    try {
      const { sql, parameters } = this.build();
      const all = promisify(this.db.all.bind(this.db));
      const rows = (await all(sql, parameters)) as TResult[];

      const executionTime = Date.now() - startTime;

      logger.debug('Executed SELECT query', {
        table: String(this.tableName),
        columnCount: this.columns.length,
        paramCount: parameters.length,
        rowCount: rows.length,
        executionTime,
      });

      return {
        rows,
        rowCount: rows.length,
        executionTime,
      };
    } catch (error) {
      logger.error('SELECT query failed', {
        table: String(this.tableName),
        error,
      });
      throw error;
    }
  }

  /**
   * Execute and return first row
   */
  async first<TResult = QueryRow>(): Promise<TResult | null> {
    const result = await this.limit(1).execute<TResult>();
    return result.rows[0] ?? null;
  }

  /**
   * Build the SQL query
   */
  build(): { sql: string; parameters: SQLParameter[] } {
    const columnList = this.columns.map(col => String(col)).join(', ');
    let sql = `SELECT ${columnList} FROM ${String(this.tableName)}`;

    // Add JOINs
    if (this.joinClauses.length > 0) {
      sql += ` ${this.joinClauses.join(' ')}`;
    }

    // Add WHERE
    const { sql: whereSQL, parameters } = this.whereBuilder.build();
    if (whereSQL) {
      sql += ` ${whereSQL}`;
    }

    // Add ORDER BY
    if (this.orderByClause) {
      sql += ` ${this.orderByClause}`;
    }

    // Add LIMIT
    if (this.limitClause) {
      sql += ` ${this.limitClause}`;
    }

    // Add OFFSET
    if (this.offsetClause) {
      sql += ` ${this.offsetClause}`;
    }

    return { sql, parameters };
  }

  private validateColumn(column: keyof TSchema[TTable]): void {
    if (!(column in this.schema[this.tableName])) {
      throw new Error(
        `Column '${String(column)}' does not exist in table '${String(this.tableName)}'`
      );
    }
  }
}

/**
 * INSERT query builder
 */
export class InsertQueryBuilder<TSchema extends TableSchema, TTable extends keyof TSchema> {
  constructor(
    private readonly db: Database,
    private readonly schema: TSchema,
    private readonly tableName: TTable,
    private readonly data: Partial<Record<keyof TSchema[TTable], SQLParameter>>
  ) {}

  /**
   * Execute the INSERT query
   */
  async execute(): Promise<{ lastInsertId: number; changes: number }> {
    const startTime = Date.now();

    try {
      const { sql, parameters } = this.build();

      const result = await new Promise<{ lastID?: number; changes?: number }>((resolve, reject) => {
        this.db.run(sql, parameters, function (this: unknown, err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve({ lastID: this.lastID, changes: this.changes });
          }
        });
      });

      const executionTime = Date.now() - startTime;

      logger.debug('Executed INSERT query', {
        table: String(this.tableName),
        columnCount: Object.keys(this.data).length,
        executionTime,
      });

      return {
        lastInsertId: result.lastID ?? 0,
        changes: result.changes ?? 0,
      };
    } catch (error) {
      logger.error('INSERT query failed', {
        table: String(this.tableName),
        data: this.data,
        error,
      });
      throw error;
    }
  }

  /**
   * Build the SQL query
   */
  build(): { sql: string; parameters: SQLParameter[] } {
    const columns = Object.keys(this.data);
    const placeholders = columns.map(() => '?').join(', ');
    const parameters = Object.values(this.data);

    // Validate columns exist in schema
    for (const column of columns) {
      if (!(column in this.schema[this.tableName])) {
        throw new Error(`Column '${column}' does not exist in table '${String(this.tableName)}'`);
      }
    }

    const sql = `INSERT INTO ${String(this.tableName)} (${columns.join(', ')}) VALUES (${placeholders})`;

    return { sql, parameters };
  }
}

/**
 * UPDATE query builder
 */
export class UpdateQueryBuilder<TSchema extends TableSchema, TTable extends keyof TSchema> {
  private readonly whereBuilder: WhereBuilder<TSchema, TTable>;

  constructor(
    private readonly db: Database,
    private readonly schema: TSchema,
    private readonly tableName: TTable,
    private readonly data: Partial<Record<keyof TSchema[TTable], SQLParameter>>
  ) {
    this.whereBuilder = new WhereBuilder(tableName, schema);
  }

  /**
   * Add WHERE conditions
   */
  where(callback: (builder: WhereBuilder<TSchema, TTable>) => void): this {
    callback(this.whereBuilder);
    return this;
  }

  /**
   * Execute the UPDATE query
   */
  async execute(): Promise<{ changes: number }> {
    const startTime = Date.now();

    try {
      const { sql, parameters } = this.build();

      const result = await new Promise<{ changes?: number }>((resolve, reject) => {
        this.db.run(sql, parameters, function (this: unknown, err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve({ changes: this.changes });
          }
        });
      });

      const executionTime = Date.now() - startTime;

      logger.debug('Executed UPDATE query', {
        table: String(this.tableName),
        columnCount: Object.keys(this.data).length,
        changes: result.changes,
        executionTime,
      });

      return {
        changes: result.changes ?? 0,
      };
    } catch (error) {
      logger.error('UPDATE query failed', {
        table: String(this.tableName),
        data: this.data,
        error,
      });
      throw error;
    }
  }

  /**
   * Build the SQL query
   */
  build(): { sql: string; parameters: SQLParameter[] } {
    const columns = Object.keys(this.data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const setParameters = Object.values(this.data);

    // Validate columns exist in schema
    for (const column of columns) {
      if (!(column in this.schema[this.tableName])) {
        throw new Error(`Column '${column}' does not exist in table '${String(this.tableName)}'`);
      }
    }

    let sql = `UPDATE ${String(this.tableName)} SET ${setClause}`;
    const parameters = [...setParameters];

    // Add WHERE clause
    const { sql: whereSQL, parameters: whereParameters } = this.whereBuilder.build();
    if (whereSQL) {
      sql += ` ${whereSQL}`;
      parameters.push(...whereParameters);
    }

    return { sql, parameters };
  }
}

/**
 * DELETE query builder
 */
export class DeleteQueryBuilder<TSchema extends TableSchema, TTable extends keyof TSchema> {
  private readonly whereBuilder: WhereBuilder<TSchema, TTable>;

  constructor(
    private readonly db: Database,
    private readonly schema: TSchema,
    private readonly tableName: TTable
  ) {
    this.whereBuilder = new WhereBuilder(tableName, schema);
  }

  /**
   * Add WHERE conditions
   */
  where(callback: (builder: WhereBuilder<TSchema, TTable>) => void): this {
    callback(this.whereBuilder);
    return this;
  }

  /**
   * Execute the DELETE query
   */
  async execute(): Promise<{ changes: number }> {
    const startTime = Date.now();

    try {
      const { sql, parameters } = this.build();

      const result = await new Promise<{ changes?: number }>((resolve, reject) => {
        this.db.run(sql, parameters, function (this: unknown, err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve({ changes: this.changes });
          }
        });
      });

      const executionTime = Date.now() - startTime;

      logger.debug('Executed DELETE query', {
        table: String(this.tableName),
        changes: result.changes,
        executionTime,
      });

      return {
        changes: result.changes ?? 0,
      };
    } catch (error) {
      logger.error('DELETE query failed', {
        table: String(this.tableName),
        error,
      });
      throw error;
    }
  }

  /**
   * Build the SQL query
   */
  build(): { sql: string; parameters: SQLParameter[] } {
    let sql = `DELETE FROM ${String(this.tableName)}`;

    // Add WHERE clause
    const { sql: whereSQL, parameters } = this.whereBuilder.build();
    if (whereSQL) {
      sql += ` ${whereSQL}`;
    } else {
      throw new Error('DELETE queries must include a WHERE clause for safety');
    }

    return { sql, parameters };
  }
}

/**
 * SQL template literal function for type-safe raw queries
 */
export function sql<TResult = QueryRow>(
  strings: TemplateStringsArray,
  ...values: SQLParameter[]
): { query: string; parameters: SQLParameter[] } {
  let query = strings[0];
  const parameters: SQLParameter[] = [];

  for (let i = 0; i < values.length; i++) {
    query += `?${strings[i + 1]}`;
    parameters.push(values[i]);
  }

  return { query, parameters };
}

/**
 * Helper function to create type-safe query builder
 */
export function createQueryBuilder<TSchema extends TableSchema = typeof DefaultSchema>(
  db: Database,
  schema?: TSchema
): TypeSafeQueryBuilder<TSchema> {
  return new TypeSafeQueryBuilder(db, schema);
}
