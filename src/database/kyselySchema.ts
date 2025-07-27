/**
 * Kysely type-safe database schema definition
 * 
 * This file defines the TypeScript types for our database tables
 * to enable compile-time type safety with Kysely query builder.
 */

import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

// Base table interfaces
export interface BoardTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  archived: Generated<number>; // SQLite boolean (0/1)
  created_at: Generated<string>; // ISO string in SQLite
  updated_at: Generated<string>;
}

export interface ColumnTable {
  id: Generated<string>;
  board_id: string;
  name: string;
  position: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface TaskTable {
  id: Generated<string>;
  title: string;
  description: string | null;
  board_id: string;
  column_id: string | null;
  parent_id: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived';
  priority: number;
  assignee: string | null;
  due_date: string | null; // ISO string
  progress: Generated<number>;
  position: Generated<number>;
  archived: Generated<number>; // SQLite boolean (0/1)
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface NoteTable {
  id: Generated<string>;
  task_id: string;
  content: string;
  category: 'general' | 'meeting' | 'idea' | 'todo' | 'reminder';
  pinned: Generated<number>; // SQLite boolean (0/1)
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface TagTable {
  id: Generated<string>;
  name: string;
  color: string | null;
  description: string | null;
  parent_id: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface TaskTagTable {
  task_id: string;
  tag_id: string;
  created_at: Generated<string>;
}

export interface TaskDependencyTable {
  id: Generated<string>;
  task_id: string;
  depends_on_id: string;
  created_at: Generated<string>;
}

export interface ApiKeyTable {
  id: Generated<string>;
  key_hash: string;
  name: string;
  created_at: Generated<string>;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface BackupTable {
  id: Generated<string>;
  filename: string;
  type: 'full' | 'incremental';
  size: number;
  compressed: Generated<number>; // SQLite boolean (0/1)
  encrypted: Generated<number>; // SQLite boolean (0/1)
  checksum: string | null;
  created_at: Generated<string>;
}

export interface ScheduleTable {
  id: Generated<string>;
  name: string;
  type: string;
  cron_expression: string;
  enabled: Generated<number>; // SQLite boolean (0/1)
  last_run: string | null;
  next_run: string | null;
  config: string | null; // JSON string
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// Database interface combining all tables
export interface Database {
  boards: BoardTable;
  columns: ColumnTable;
  tasks: TaskTable;
  notes: NoteTable;
  tags: TagTable;
  task_tags: TaskTagTable;
  task_dependencies: TaskDependencyTable;
  api_keys: ApiKeyTable;
  backups: BackupTable;
  schedules: ScheduleTable;
}

// Helper types for operations
export type Board = Selectable<BoardTable>;
export type NewBoard = Insertable<BoardTable>;
export type BoardUpdate = Updateable<BoardTable>;

export type Column = Selectable<ColumnTable>;
export type NewColumn = Insertable<ColumnTable>;
export type ColumnUpdate = Updateable<ColumnTable>;

export type Task = Selectable<TaskTable>;
export type NewTask = Insertable<TaskTable>;
export type TaskUpdate = Updateable<TaskTable>;

export type Note = Selectable<NoteTable>;
export type NewNote = Insertable<NoteTable>;
export type NoteUpdate = Updateable<NoteTable>;

export type Tag = Selectable<TagTable>;
export type NewTag = Insertable<TagTable>;
export type TagUpdate = Updateable<TagTable>;

export type TaskTag = Selectable<TaskTagTable>;
export type NewTaskTag = Insertable<TaskTagTable>;

export type TaskDependency = Selectable<TaskDependencyTable>;
export type NewTaskDependency = Insertable<TaskDependencyTable>;

export type ApiKey = Selectable<ApiKeyTable>;
export type NewApiKey = Insertable<ApiKeyTable>;

export type Backup = Selectable<BackupTable>;
export type NewBackup = Insertable<BackupTable>;

export type Schedule = Selectable<ScheduleTable>;
export type NewSchedule = Insertable<ScheduleTable>;
export type ScheduleUpdate = Updateable<ScheduleTable>;

// Complex query result types
export interface TaskWithBoard extends Task {
  board_name: string;
  board_description: string | null;
}

export interface TaskWithSubtasks extends Task {
  subtask_count: number;
  completed_subtasks: number;
}

export interface TaskWithDependencies extends Task {
  blocking_tasks: TaskDependency[];
  blocked_by_tasks: TaskDependency[];
}

export interface BoardWithStats extends Board {
  task_count: number;
  completed_tasks: number;
  in_progress_tasks: number;
  todo_tasks: number;
}

export interface TagWithUsage extends Tag {
  usage_count: number;
  recent_usage: string | null;
}

// Search and filtering result types
export interface TaskSearchResult extends Task {
  rank: number;
  match_type: 'title' | 'description' | 'content';
  match_snippet: string;
}

export interface NoteSearchResult extends Note {
  rank: number;
  match_snippet: string;
  task_title: string | null;
}

// Analytics and reporting types
export interface TaskPriorityMetrics {
  task_id: string;
  current_priority: number;
  calculated_priority: number;
  age_factor: number;
  dependency_factor: number;
  deadline_factor: number;
}

export interface BoardPerformanceMetrics {
  board_id: string;
  board_name: string;
  avg_completion_time: number;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  blocked_tasks: number;
}

// View types (for database views)
export interface ActiveTasksView {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  board_name: string;
  column_name: string | null;
  tag_names: string | null; // Comma-separated
  due_date: string | null;
  days_until_due: number | null;
  is_overdue: number; // SQLite boolean
  subtask_count: number;
  completed_subtasks: number;
  progress_percentage: number;
  created_at: string;
  updated_at: string;
}

export interface TaskDependencyGraphView {
  task_id: string;
  task_title: string;
  depends_on_id: string | null;
  depends_on_title: string | null;
  dependency_status: string | null;
  is_blocked: number; // SQLite boolean
  can_start: number; // SQLite boolean
}

// Type guards for SQLite boolean conversion
export const sqliteBoolean = {
  toNumber: (value: boolean): number => value ? 1 : 0,
  toBoolean: (value: number): boolean => value === 1,
};

// Date conversion helpers for SQLite
export const sqliteDate = {
  toISOString: (date: Date): string => date.toISOString(),
  fromISOString: (dateString: string): Date => new Date(dateString),
};