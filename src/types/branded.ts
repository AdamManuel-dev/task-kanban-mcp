/**
 * Branded types for type-safe ID handling
 *
 * This module implements nominal typing for IDs to prevent mixing different ID types
 * at compile time, improving type safety throughout the application.
 */

/**
 * Brand type helper
 */
type Brand<K, T> = K & { __brand: T };

/**
 * Task ID type
 */
export type TaskId = Brand<number, 'TaskId'>;

/**
 * Board ID type
 */
export type BoardId = Brand<number, 'BoardId'>;

/**
 * Column ID type
 */
export type ColumnId = Brand<number, 'ColumnId'>;

/**
 * Note ID type
 */
export type NoteId = Brand<number, 'NoteId'>;

/**
 * Tag ID type
 */
export type TagId = Brand<number, 'TagId'>;

/**
 * User ID type (for future use)
 */
export type UserId = Brand<number, 'UserId'>;

/**
 * Repository mapping ID type
 */
export type RepositoryMappingId = Brand<number, 'RepositoryMappingId'>;

/**
 * Type guards for branded types
 */
export function isTaskId(value: unknown): value is TaskId {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isBoardId(value: unknown): value is BoardId {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isColumnId(value: unknown): value is ColumnId {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isNoteId(value: unknown): value is NoteId {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isTagId(value: unknown): value is TagId {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isUserId(value: unknown): value is UserId {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isRepositoryMappingId(value: unknown): value is RepositoryMappingId {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Constructors for branded types with validation
 */
export function createTaskId(value: number): TaskId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid TaskId: ${value}`);
  }
  return value as TaskId;
}

export function createBoardId(value: number): BoardId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid BoardId: ${value}`);
  }
  return value as BoardId;
}

export function createColumnId(value: number): ColumnId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ColumnId: ${value}`);
  }
  return value as ColumnId;
}

export function createNoteId(value: number): NoteId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid NoteId: ${value}`);
  }
  return value as NoteId;
}

export function createTagId(value: number): TagId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid TagId: ${value}`);
  }
  return value as TagId;
}

export function createUserId(value: number): UserId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid UserId: ${value}`);
  }
  return value as UserId;
}

export function createRepositoryMappingId(value: number): RepositoryMappingId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid RepositoryMappingId: ${value}`);
  }
  return value as RepositoryMappingId;
}

/**
 * Safe constructors that return null instead of throwing
 */
export function tryCreateTaskId(value: unknown): TaskId | null {
  try {
    if (typeof value !== 'number') return null;
    return createTaskId(value);
  } catch {
    return null;
  }
}

export function tryCreateBoardId(value: unknown): BoardId | null {
  try {
    if (typeof value !== 'number') return null;
    return createBoardId(value);
  } catch {
    return null;
  }
}

export function tryCreateColumnId(value: unknown): ColumnId | null {
  try {
    if (typeof value !== 'number') return null;
    return createColumnId(value);
  } catch {
    return null;
  }
}

export function tryCreateNoteId(value: unknown): NoteId | null {
  try {
    if (typeof value !== 'number') return null;
    return createNoteId(value);
  } catch {
    return null;
  }
}

export function tryCreateTagId(value: unknown): TagId | null {
  try {
    if (typeof value !== 'number') return null;
    return createTagId(value);
  } catch {
    return null;
  }
}

export function tryCreateUserId(value: unknown): UserId | null {
  try {
    if (typeof value !== 'number') return null;
    return createUserId(value);
  } catch {
    return null;
  }
}

export function tryCreateRepositoryMappingId(value: unknown): RepositoryMappingId | null {
  try {
    if (typeof value !== 'number') return null;
    return createRepositoryMappingId(value);
  } catch {
    return null;
  }
}

/**
 * Utility type to extract the raw value from a branded type
 */
export type UnwrapBrand<T> = T extends Brand<infer U, unknown> ? U : T;

/**
 * Helper to get raw value from branded type
 */
export function unwrapId<T extends Brand<number, unknown>>(id: T): number {
  return id as unknown as number;
}
