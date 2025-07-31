/**
 * @fileoverview Centralized type guards for runtime type checking
 * @lastmodified 2025-07-31T02:30:00Z
 * 
 * Features: Type narrowing, runtime validation, null safety
 * Main APIs: isTask(), isBoard(), isNote(), isTag(), hasId()
 * Constraints: Must match type definitions, used across codebase
 * Patterns: User-defined type guards, type predicates
 */

import type { Task, Board, Note, Tag } from '@/types';

/**
 * Check if a value has an id property
 */
export function hasId(value: unknown): value is { id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as any).id === 'string'
  );
}

/**
 * Type guard for Task objects
 */
export function isTask(value: unknown): value is Task {
  if (!hasId(value)) return false;
  
  const obj = value as any;
  return (
    typeof obj.title === 'string' &&
    typeof obj.board_id === 'string' &&
    typeof obj.column_id === 'string' &&
    typeof obj.position === 'number' &&
    typeof obj.priority === 'number' &&
    typeof obj.status === 'string' &&
    ['todo', 'in_progress', 'done', 'blocked', 'archived'].includes(obj.status) &&
    typeof obj.archived === 'boolean' &&
    obj.created_at instanceof Date &&
    obj.updated_at instanceof Date
  );
}

/**
 * Type guard for Board objects
 */
export function isBoard(value: unknown): value is Board {
  if (!hasId(value)) return false;
  
  const obj = value as any;
  return (
    typeof obj.name === 'string' &&
    typeof obj.created_at === 'object' &&
    typeof obj.updated_at === 'object' &&
    (obj.description === undefined || typeof obj.description === 'string') &&
    (obj.metadata === undefined || typeof obj.metadata === 'string')
  );
}

/**
 * Type guard for Note objects
 */
export function isNote(value: unknown): value is Note {
  if (!hasId(value)) return false;
  
  const obj = value as any;
  return (
    typeof obj.content === 'string' &&
    typeof obj.category === 'string' &&
    ['general', 'idea', 'blocker', 'implementation', 'research'].includes(obj.category) &&
    typeof obj.created_at === 'object' &&
    typeof obj.updated_at === 'object' &&
    (obj.task_id === undefined || typeof obj.task_id === 'string') &&
    (obj.board_id === undefined || typeof obj.board_id === 'string')
  );
}

/**
 * Type guard for Tag objects
 */
export function isTag(value: unknown): value is Tag {
  if (!hasId(value)) return false;
  
  const obj = value as any;
  return (
    typeof obj.name === 'string' &&
    typeof obj.color === 'string' &&
    /^#[0-9A-F]{6}$/i.test(obj.color) &&
    typeof obj.created_at === 'object' &&
    typeof obj.updated_at === 'object' &&
    (obj.description === undefined || typeof obj.description === 'string')
  );
}

/**
 * Type guard for arrays of specific types
 */
export function isTaskArray(value: unknown): value is Task[] {
  return Array.isArray(value) && value.every(isTask);
}

export function isBoardArray(value: unknown): value is Board[] {
  return Array.isArray(value) && value.every(isBoard);
}

export function isNoteArray(value: unknown): value is Note[] {
  return Array.isArray(value) && value.every(isNote);
}

export function isTagArray(value: unknown): value is Tag[] {
  return Array.isArray(value) && value.every(isTag);
}

/**
 * Check if a value is a valid ID string
 */
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if a value is a valid date string
 */
export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Type guard for objects with timestamps
 */
export function hasTimestamps(
  value: unknown
): value is { created_at: Date; updated_at: Date } {
  if (typeof value !== 'object' || value === null) return false;
  
  const obj = value as any;
  return (
    obj.created_at instanceof Date &&
    obj.updated_at instanceof Date
  );
}

/**
 * Type guard for optional fields
 */
export function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

export function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === 'number';
}

export function isOptionalDate(value: unknown): value is Date | undefined {
  return value === undefined || value instanceof Date;
}