/**
 * @fileoverview SQL Security Utilities
 * @lastmodified 2025-07-28T12:00:00Z
 *
 * Features: SQL injection prevention, query parameter validation, allowlist validation
 * Main APIs: validateSortField(), validateSortOrder(), sanitizeIdentifier()
 * Constraints: SQLite dialect, strict validation rules
 * Patterns: Allowlist validation, input sanitization, security logging
 */

import { logger } from './logger';

/**
 * Valid sort fields for different entities
 */
export const VALID_SORT_FIELDS = {
  tasks: [
    'id',
    'title',
    'description',
    'status',
    'priority',
    'due_date',
    'created_at',
    'updated_at',
    'position',
    'board_id',
    'column_id',
  ],
  boards: ['id', 'name', 'description', 'created_at', 'updated_at', 'archived'],
  notes: ['id', 'content', 'category', 'created_at', 'updated_at', 'is_pinned', 'task_id'],
  tags: ['id', 'name', 'color', 'created_at', 'updated_at'],
  columns: ['id', 'name', 'position', 'created_at', 'board_id', 'wip_limit'],
} as const;

/**
 * Valid sort orders
 */
export const VALID_SORT_ORDERS = ['asc', 'desc'] as const;

/**
 * SQL Security Error class
 */
export class SQLSecurityError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: string
  ) {
    super(message);
    this.name = 'SQLSecurityError';
  }
}

/**
 * Validates a sort field against allowlist for specific entity type
 */
export function validateSortField(
  sortBy: string,
  entityType: keyof typeof VALID_SORT_FIELDS,
  tableName?: string
): string {
  if (!sortBy || typeof sortBy !== 'string') {
    throw new SQLSecurityError('Sort field must be a non-empty string', 'sortBy', sortBy);
  }

  // Remove potential table prefixes for validation
  const cleanField = sortBy.includes('.') ? sortBy.split('.').pop()! : sortBy;

  const allowedFields = VALID_SORT_FIELDS[entityType];
  if (!allowedFields.includes(cleanField as unknown)) {
    logger.warn('SQL injection attempt detected - invalid sort field', {
      entityType,
      attempted: sortBy,
      cleanField,
      allowed: allowedFields,
    });

    throw new SQLSecurityError(
      `Invalid sort field '${sortBy}' for ${entityType}. Allowed fields: ${allowedFields.join(', ')}`,
      'sortBy',
      sortBy
    );
  }

  // Return the clean field name, optionally with validated table prefix
  if (tableName && sortBy.includes('.')) {
    return `${tableName}.${cleanField}`;
  }

  return cleanField;
}

/**
 * Validates sort order against allowlist
 */
export function validateSortOrder(sortOrder: string): 'ASC' | 'DESC' {
  if (!sortOrder || typeof sortOrder !== 'string') {
    throw new SQLSecurityError('Sort order must be a non-empty string', 'sortOrder', sortOrder);
  }

  const normalizedOrder = sortOrder.toLowerCase();
  if (!VALID_SORT_ORDERS.includes(normalizedOrder as 'asc' | 'desc')) {
    logger.warn('SQL injection attempt detected - invalid sort order', {
      attempted: sortOrder,
      allowed: VALID_SORT_ORDERS,
    });

    throw new SQLSecurityError(
      `Invalid sort order '${sortOrder}'. Allowed values: ${VALID_SORT_ORDERS.join(', ')}`,
      'sortOrder',
      sortOrder
    );
  }

  return normalizedOrder.toUpperCase() as 'ASC' | 'DESC';
}

/**
 * Sanitizes SQL identifiers (table names, column names)
 * Only allows alphanumeric characters and underscores
 */
export function sanitizeIdentifier(identifier: string, maxLength = 64): string {
  if (!identifier || typeof identifier !== 'string') {
    throw new SQLSecurityError('Identifier must be a non-empty string', 'identifier', identifier);
  }

  if (identifier.length > maxLength) {
    throw new SQLSecurityError(
      `Identifier too long: ${identifier.length} characters (max: ${maxLength})`,
      'identifier',
      identifier
    );
  }

  // Only allow letters, numbers, and underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    logger.warn('SQL injection attempt detected - invalid identifier characters', {
      attempted: identifier,
    });

    throw new SQLSecurityError(
      `Invalid identifier '${identifier}'. Only letters, numbers, and underscores allowed.`,
      'identifier',
      identifier
    );
  }

  return identifier;
}

/**
 * Validates LIMIT clause parameters
 */
export function validateLimitOffset(
  limit?: number,
  offset?: number
): { limit: number; offset: number } {
  const validatedLimit = limit ?? 50;
  const validatedOffset = offset ?? 0;

  if (validatedLimit < 1 || validatedLimit > 1000) {
    throw new SQLSecurityError(
      `Invalid limit ${validatedLimit}. Must be between 1 and 1000.`,
      'limit',
      String(validatedLimit)
    );
  }

  if (validatedOffset < 0 || validatedOffset > 1000000) {
    throw new SQLSecurityError(
      `Invalid offset ${validatedOffset}. Must be between 0 and 1,000,000.`,
      'offset',
      String(validatedOffset)
    );
  }

  return { limit: validatedLimit, offset: validatedOffset };
}

/**
 * Builds a secure ORDER BY clause with validated parameters
 */
export function buildOrderByClause(
  sortBy: string | undefined,
  sortOrder: string | undefined,
  entityType: keyof typeof VALID_SORT_FIELDS,
  tableName?: string
): string {
  // Default values
  const defaultSortBy = VALID_SORT_FIELDS[entityType][0];
  const safeSortBy = sortBy ? validateSortField(sortBy, entityType, tableName) : defaultSortBy;
  const safeSortOrder = sortOrder ? validateSortOrder(sortOrder) : 'ASC';

  // Add table prefix if specified and not already present
  const finalSortBy =
    tableName && !safeSortBy.includes('.') ? `${tableName}.${safeSortBy}` : safeSortBy;

  return ` ORDER BY ${finalSortBy} ${safeSortOrder}`;
}

/**
 * Validates a complete pagination and sorting configuration
 */
export interface SecurePaginationOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: string;
}

export interface ValidatedPaginationResult {
  limit: number;
  offset: number;
  orderByClause: string;
}

export function validatePagination(
  options: SecurePaginationOptions,
  entityType: keyof typeof VALID_SORT_FIELDS,
  tableName?: string
): ValidatedPaginationResult {
  const { limit: validatedLimit, offset: validatedOffset } = validateLimitOffset(
    options.limit,
    options.offset
  );

  const orderByClause = buildOrderByClause(
    options.sortBy,
    options.sortOrder,
    entityType,
    tableName
  );

  return { limit: validatedLimit, offset: validatedOffset, orderByClause };
}

/**
 * Logs potential SQL injection attempts for monitoring
 */
export function logSecurityEvent(
  eventType: 'sql_injection_attempt' | 'invalid_parameter' | 'blocked_query',
  details: Record<string, unknown>
): void {
  logger.warn(`SQL Security Event: ${eventType}`, {
    timestamp: new Date().toISOString(),
    eventType,
    ...details,
  });
}

/**
 * SQL injection detection patterns for monitoring
 */
export const SQL_INJECTION_PATTERNS = [
  // Basic injection patterns
  /(['"])\s*(;|--|\||&)/i,
  /(union|select|insert|update|delete|drop|create|alter|exec|execute)/i,
  /(\bor\b|\band\b)\s+['"]?\w+['"]?\s*[=<>]/i,

  // Advanced patterns
  //* .**//i, // SQL comments
  /\bxp_\w+/i, // SQL Server extended procedures
  /\bsp_\w+/i, // SQL Server stored procedures
  /(\bchar|nchar|varchar|nvarchar)\s*\(/i, // String functions

  // SQLite specific
  /\bsqlite_master\b/i, // SQLite system table
  /\bpragma\b/i, // SQLite pragma statements
  /\battach\b.*\bdatabase\b/i, // SQLite attach
] as const;

/**
 * Scans input for potential SQL injection patterns
 */
export function detectSQLInjection(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Comprehensive input validation for SQL parameters
 */
export function validateSQLInput(
  input: unknown,
  paramName: string,
  options: {
    allowEmpty?: boolean;
    maxLength?: number;
    pattern?: RegExp;
  } = {}
): string {
  if (input === null || input === undefined) {
    if (!options.allowEmpty) {
      throw new SQLSecurityError(`Parameter '${paramName}' cannot be null or undefined`);
    }
    return '';
  }

  if (typeof input !== 'string') {
    throw new SQLSecurityError(`Parameter '${paramName}' must be a string, got ${typeof input}`);
  }

  if (!options.allowEmpty && input.length === 0) {
    throw new SQLSecurityError(`Parameter '${paramName}' cannot be empty`);
  }

  const maxLength = options.maxLength ?? 1000;
  if (input.length > maxLength) {
    throw new SQLSecurityError(
      `Parameter '${paramName}' too long: ${input.length} characters (max: ${maxLength})`
    );
  }

  if (options.pattern && !options.pattern.test(input)) {
    throw new SQLSecurityError(`Parameter '${paramName}' does not match required pattern`);
  }

  if (detectSQLInjection(input)) {
    logSecurityEvent('sql_injection_attempt', {
      parameter: paramName,
      value: input,
      patterns: SQL_INJECTION_PATTERNS.filter(p => p.test(input)).map(p => p.source),
    });

    throw new SQLSecurityError(
      `Parameter '${paramName}' contains potentially malicious SQL patterns`,
      paramName,
      input
    );
  }

  return input;
}
