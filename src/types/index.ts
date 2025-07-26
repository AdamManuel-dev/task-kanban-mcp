/**
 * TypeScript type definitions for the MCP Kanban system
 */

export interface Board {
  id: string;
  name: string;
  description?: string | undefined;
  color: string;
  created_at: Date;
  updated_at: Date;
  archived: boolean;
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  wip_limit?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Task {
  id: string;
  title: string;
  description?: string | undefined;
  board_id: string;
  column_id: string;
  position: number;
  priority: number;
  status: 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived';
  assignee?: string | undefined;
  due_date?: Date | undefined;
  estimated_hours?: number | undefined;
  actual_hours?: number | undefined;
  parent_task_id?: string | undefined;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date | undefined;
  archived: boolean;
  metadata?: string | undefined;
}

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: 'blocks' | 'relates_to' | 'duplicates';
  created_at: Date;
}

export interface Note {
  id: string;
  task_id: string;
  content: string;
  category: 'general' | 'progress' | 'blocker' | 'decision' | 'question';
  pinned: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string | undefined;
  parent_tag_id?: string | undefined;
  created_at: Date;
}

export interface TaskTag {
  id: string;
  task_id: string;
  tag_id: string;
  created_at: Date;
}

export interface CreateBoardRequest {
  name: string;
  description?: string | undefined;
  color?: string | undefined;
}

export interface UpdateBoardRequest {
  name?: string;
  description?: string;
  color?: string;
  archived?: boolean;
}

export interface BoardWithColumns extends Board {
  columns: Column[];
}

export interface BoardWithStats extends Board {
  taskCount: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  columnCount: number;
}

export interface ServiceError extends Error {
  code: string;
  statusCode: number;
  details?: any;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterOptions {
  archived?: boolean;
  search?: string;
}

export interface TagWithStats extends Tag {
  task_count: number;
  usage_count: number;
  last_used?: Date | undefined;
  child_count: number;
}