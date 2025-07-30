/**
 * @fileoverview Database schema types for Kysely type-safe query builder
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Type-safe database schema definitions, table interfaces, column types
 * Main APIs: Database interface, table type definitions, generated columns
 * Constraints: Must match actual database schema, supports SQLite types
 * Patterns: Generated columns for auto-increment, strict type definitions
 */

import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Main database interface defining all tables
 */
export interface Database {
  boards: BoardTable;
  tasks: TaskTable;
  task_dependencies: TaskDependencyTable;
  notes: NoteTable;
  tags: TagTable;
  task_tags: TaskTagTable;
}

/**
 * Board table schema
 */
export interface BoardTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * Task table schema
 */
export interface TaskTable {
  id: Generated<string>;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived';
  priority: number | null;
  assignee: string | null;
  due_date: string | null;
  position: number;
  parent_task_id: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * Task dependencies table schema
 */
export interface TaskDependencyTable {
  id: Generated<string>;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: 'blocks' | 'required-by' | 'related-to';
  created_at: Generated<string>;
}

/**
 * Notes table schema
 */
export interface NoteTable {
  id: Generated<string>;
  task_id: string | null;
  board_id: string | null;
  content: string;
  category: 'general' | 'meeting' | 'idea' | 'todo' | 'reminder';
  is_pinned: Generated<boolean>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * Tags table schema
 */
export interface TagTable {
  id: Generated<string>;
  name: string;
  color: string | null;
  parent_tag_id: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/**
 * Task-Tags junction table schema
 */
export interface TaskTagTable {
  task_id: string;
  tag_id: string;
  created_at: Generated<string>;
}

// Helper types for common operations
export type Board = Selectable<BoardTable>;
export type NewBoard = Insertable<BoardTable>;
export type BoardUpdate = Updateable<BoardTable>;

export type Task = Selectable<TaskTable>;
export type NewTask = Insertable<TaskTable>;
export type TaskUpdate = Updateable<TaskTable>;

export type TaskDependency = Selectable<TaskDependencyTable>;
export type NewTaskDependency = Insertable<TaskDependencyTable>;

export type Note = Selectable<NoteTable>;
export type NewNote = Insertable<NoteTable>;
export type NoteUpdate = Updateable<NoteTable>;

export type Tag = Selectable<TagTable>;
export type NewTag = Insertable<TagTable>;
export type TagUpdate = Updateable<TagTable>;

export type TaskTag = Selectable<TaskTagTable>;
export type NewTaskTag = Insertable<TaskTagTable>;
