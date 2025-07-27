/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/require-await, no-plusplus */
/**
 * Database query result validation schemas
 *
 * Provides runtime validation for database query results to ensure type safety
 * and catch schema mismatches early.
 */

import { z } from 'zod';
import type {
  Board,
  Column,
  Task,
  TaskDependency,
  Note,
  Tag,
  TaskTag,
  BoardWithStats,
  TagWithStats,
} from '@/types';

/**
 * SQLite returns 0/1 for booleans, this transformer handles the conversion
 */
const sqliteBoolean = z.union([z.number(), z.boolean()]).transform(val => {
  if (typeof val === 'boolean') return val;
  return val === 1;
});

/**
 * SQLite date handling - can be string or Date
 */
const sqliteDate = z.union([z.string(), z.date()]).transform(val => {
  if (val instanceof Date) return val;
  return new Date(val);
});

/**
 * Optional SQLite date
 */
const sqliteDateOptional = z.union([z.string(), z.date(), z.null()]).transform(val => {
  if (val === null) return undefined;
  if (val instanceof Date) return val;
  return new Date(val);
});

/**
 * Board schema for database results
 */
export const BoardSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  description: z
    .string()
    .nullable()
    .transform(val => val ?? undefined),
  color: z.string(),
  created_at: sqliteDate,
  updated_at: sqliteDate,
  archived: sqliteBoolean,
});

/**
 * Column schema for database results
 */
export const ColumnSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  board_id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  position: z.number(),
  wip_limit: z
    .number()
    .nullable()
    .transform(val => val ?? undefined),
  created_at: sqliteDate,
  updated_at: sqliteDate,
});

/**
 * Task status enum
 */
const TaskStatusSchema = z.enum(['todo', 'in_progress', 'done', 'blocked', 'archived']);

/**
 * Task schema for database results
 */
export const TaskSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  description: z
    .string()
    .nullable()
    .transform(val => val ?? undefined),
  board_id: z.union([z.string(), z.number()]).transform(String),
  column_id: z.union([z.string(), z.number()]).transform(String),
  position: z.number(),
  priority: z.number(),
  status: TaskStatusSchema,
  assignee: z
    .string()
    .nullable()
    .transform(val => val ?? undefined),
  due_date: sqliteDateOptional,
  estimated_hours: z
    .number()
    .nullable()
    .transform(val => val ?? undefined),
  actual_hours: z
    .number()
    .nullable()
    .transform(val => val ?? undefined),
  parent_task_id: z
    .union([z.string(), z.number()])
    .nullable()
    .transform(val => (val ? String(val) : undefined)),
  created_at: sqliteDate,
  updated_at: sqliteDate,
  completed_at: sqliteDateOptional,
  archived: sqliteBoolean,
  metadata: z
    .string()
    .nullable()
    .transform(val => val ?? undefined),
});

/**
 * Task dependency type enum
 */
const DependencyTypeSchema = z.enum(['blocks', 'relates_to', 'duplicates']);

/**
 * Task dependency schema
 */
export const TaskDependencySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  task_id: z.union([z.string(), z.number()]).transform(String),
  depends_on_task_id: z.union([z.string(), z.number()]).transform(String),
  dependency_type: DependencyTypeSchema,
  created_at: sqliteDate,
});

/**
 * Note category enum
 */
const NoteCategorySchema = z.enum(['general', 'progress', 'blocker', 'decision', 'question']);

/**
 * Note schema
 */
export const NoteSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  task_id: z.union([z.string(), z.number()]).transform(String),
  content: z.string(),
  category: NoteCategorySchema,
  pinned: sqliteBoolean,
  created_at: sqliteDate,
  updated_at: sqliteDate,
});

/**
 * Tag schema
 */
export const TagSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  color: z.string(),
  description: z
    .string()
    .nullable()
    .transform(val => val ?? undefined),
  parent_tag_id: z
    .union([z.string(), z.number()])
    .nullable()
    .transform(val => (val ? String(val) : undefined)),
  created_at: sqliteDate,
});

/**
 * Task-Tag relationship schema
 */
export const TaskTagSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  task_id: z.union([z.string(), z.number()]).transform(String),
  tag_id: z.union([z.string(), z.number()]).transform(String),
  created_at: sqliteDate,
});

/**
 * Board with stats schema
 */
export const BoardWithStatsSchema = BoardSchema.extend({
  taskCount: z.number(),
  completedTasks: z.number(),
  inProgressTasks: z.number(),
  todoTasks: z.number(),
  columnCount: z.number(),
});

/**
 * Tag with stats schema
 */
export const TagWithStatsSchema = TagSchema.extend({
  task_count: z.number(),
  usage_count: z.number(),
  last_used: sqliteDateOptional,
  child_count: z.number(),
});

/**
 * Validate a single database row
 */
export function validateRow<TOutput, TInput = TOutput>(row: unknown, schema: z.ZodType<TOutput, z.ZodTypeDef, TInput>, context?: string): TOutput {
  try {
    return schema.parse(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Database validation error${context ? ` in ${context}` : ''}: ${details}`);
    }
    throw error;
  }
}

/**
 * Validate an array of database rows
 */
export function validateRows<TOutput, TInput = TOutput>(rows: unknown[], schema: z.ZodType<TOutput, z.ZodTypeDef, TInput>, context?: string): TOutput[] {
  return rows.map((row, index) =>
    validateRow(row, schema, `${context || 'row'} at index ${index}`)
  );
}

/**
 * Create a validated database query function
 */
export function createValidatedQuery<TOutput, TInput = TOutput>(schema: z.ZodType<TOutput, z.ZodTypeDef, TInput>, queryName: string) {
  return {
    /**
     * Validate a single row result
     */
    validateOne: (result: unknown): TOutput => validateRow(result, schema, queryName),

    /**
     * Validate multiple row results
     */
    validateMany: (results: unknown[]): TOutput[] => validateRows(results, schema, queryName),

    /**
     * Validate an optional single row result
     */
    validateOptional: (result: unknown): TOutput | null => {
      if (result === null || result === undefined) {
        return null;
      }
      return validateRow(result, schema, queryName);
    },
  };
}

/**
 * Pre-configured validators for common entities
 */
export const validators = {
  board: createValidatedQuery(BoardSchema, 'board'),
  column: createValidatedQuery(ColumnSchema, 'column'),
  task: createValidatedQuery(TaskSchema, 'task'),
  taskDependency: createValidatedQuery(TaskDependencySchema, 'task_dependency'),
  note: createValidatedQuery(NoteSchema, 'note'),
  tag: createValidatedQuery(TagSchema, 'tag'),
  taskTag: createValidatedQuery(TaskTagSchema, 'task_tag'),
  boardWithStats: createValidatedQuery(BoardWithStatsSchema, 'board_with_stats'),
  tagWithStats: createValidatedQuery(TagWithStatsSchema, 'tag_with_stats'),
};

/**
 * Type guard for checking if a value is a valid database ID
 */
export function isValidDatabaseId(value: unknown): value is string | number {
  return (
    (typeof value === 'string' && value.length > 0) ||
    (typeof value === 'number' && Number.isInteger(value) && value > 0)
  );
}

/**
 * Normalize database ID to string
 */
export function normalizeDatabaseId(id: string | number): string {
  return String(id);
}

/**
 * Batch validation helper
 */
export async function validateBatch<T>(
  items: unknown[],
  schema: z.ZodType<T>,
  options: {
    maxBatchSize?: number;
    onError?: (error: Error, index: number) => void;
    stopOnError?: boolean;
  } = {}
): Promise<{ valid: T[]; errors: Array<{ index: number; error: Error }> }> {
  const { maxBatchSize = 100, onError, stopOnError = false } = options;
  const valid: T[] = [];
  const errors: Array<{ index: number; error: Error }> = [];

  for (let i = 0; i < items.length; i += maxBatchSize) {
    const batch = items.slice(i, i + maxBatchSize);

    for (let j = 0; j < batch.length; j++) {
      const index = i + j;
      try {
        const validated = schema.parse(batch[j]);
        valid.push(validated);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ index, error: err });

        if (onError) {
          onError(err, index);
        }

        if (stopOnError) {
          return { valid, errors };
        }
      }
    }
  }

  return { valid, errors };
}
