/**
 * Type definitions for MCP Tool arguments and responses
 */

import type { Task, Board, Note, Tag } from '../types';

// Base response type
export interface MCPResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

// Task-related types
export interface CreateTaskArgs {
  title: string;
  description?: string;
  board_id: string;
  column_id?: string;
  priority?: number;
  status?: 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived';
  assignee?: string;
  due_date?: string;
  tags?: string[];
}

export interface UpdateTaskArgs {
  task_id: string;
  title?: string;
  description?: string;
  priority?: number;
  status?: 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived';
  assignee?: string;
  due_date?: string;
  progress?: number;
}

export interface GetTaskArgs {
  task_id: string;
  include_subtasks?: boolean;
  include_dependencies?: boolean;
  include_notes?: boolean;
  include_tags?: boolean;
}

export interface ListTasksArgs {
  board_id?: string;
  status?: string;
  assignee?: string;
  priority?: number;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface DeleteTaskArgs {
  task_id: string;
}

// Board-related types
export interface CreateBoardArgs {
  name: string;
  description?: string;
  columns?: Array<{
    name: string;
    position: number;
  }>;
}

export interface GetBoardArgs {
  board_id: string;
  include_columns?: boolean;
  include_tasks?: boolean;
}

export interface ListBoardsArgs {
  archived?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

// Note-related types
export interface AddNoteArgs {
  content: string;
  category?: 'general' | 'meeting' | 'idea' | 'todo' | 'reminder';
  task_id?: string;
  board_id?: string;
  pinned?: boolean;
}

export interface SearchNotesArgs {
  query?: string;
  category?: string;
  task_id?: string;
  board_id?: string;
  pinned?: boolean;
  limit?: number;
  offset?: number;
}

// Tag-related types
export interface CreateTagArgs {
  name: string;
  color?: string;
  description?: string;
  parent_id?: string;
}

export interface AssignTagArgs {
  task_id: string;
  tag_ids: string[];
}

// Context-related types
export interface GetProjectContextArgs {
  focus_area?: string;
  include_metrics?: boolean;
  include_recommendations?: boolean;
}

export interface GetTaskContextArgs {
  task_id: string;
  include_history?: boolean;
  include_related?: boolean;
  include_blockers?: boolean;
}

export interface AnalyzeBoardArgs {
  board_id: string;
  metrics?: string[];
  time_range?: string;
}

export interface GetBlockedTasksArgs {
  board_id?: string;
  include_reasons?: boolean;
}

export interface GetOverdueTasksArgs {
  board_id?: string;
  days_overdue?: number;
}

// Response types
export interface TaskResponse extends MCPResponse<Task> {
  task: Task;
}

export interface TasksResponse extends MCPResponse<Task[]> {
  tasks: Task[];
  count: number;
}

export interface BoardResponse extends MCPResponse<Board> {
  board: Board;
  tasks?: Task[];
}

export interface BoardsResponse extends MCPResponse<Board[]> {
  boards: Board[];
  count: number;
}

export interface NoteResponse extends MCPResponse<Note> {
  note: Note;
}

export interface NotesResponse extends MCPResponse<Note[]> {
  notes: Note[];
  count: number;
}

export interface TagResponse extends MCPResponse<Tag> {
  tag: Tag;
}

export interface TagsResponse extends MCPResponse<Tag[]> {
  tags: Tag[];
}

export interface GetTaskDetailedResponse extends TaskResponse {
  notes?: Note[];
  tags?: Tag[];
}

export interface ProjectContextResponse extends MCPResponse {
  context: {
    summary: string;
    active_tasks: Task[];
    recent_activity: unknown[];
    priorities: Task[];
    bottlenecks: unknown[];
    metrics?: Record<string, unknown>;
    recommendations?: string[];
  };
}

export interface TaskContextResponse extends MCPResponse {
  context: {
    task: Task;
    dependencies: Task[];
    subtasks: Task[];
    notes: Note[];
    tags: Tag[];
    history?: unknown[];
    related?: Task[];
    blockers?: unknown[];
  };
}

export interface BoardAnalysisResponse extends MCPResponse {
  analysis: {
    board: Board;
    metrics: Record<string, unknown>;
    insights: string[];
    recommendations: string[];
  };
}

export interface BlockedTasksResponse extends MCPResponse {
  blocked_tasks: Array<{
    task: Task;
    blocking_reasons?: string[];
  }>;
}

export interface OverdueTasksResponse extends MCPResponse {
  overdue_tasks: Array<{
    task: Task;
    days_overdue: number;
  }>;
}

// Tool argument union type for type-safe tool calling
export type ToolArgs =
  | CreateTaskArgs
  | UpdateTaskArgs
  | GetTaskArgs
  | ListTasksArgs
  | DeleteTaskArgs
  | CreateBoardArgs
  | GetBoardArgs
  | ListBoardsArgs
  | AddNoteArgs
  | SearchNotesArgs
  | CreateTagArgs
  | AssignTagArgs
  | GetProjectContextArgs
  | GetTaskContextArgs
  | AnalyzeBoardArgs
  | GetBlockedTasksArgs
  | GetOverdueTasksArgs;

// Tool response union type
export type ToolResponse =
  | TaskResponse
  | TasksResponse
  | BoardResponse
  | BoardsResponse
  | NoteResponse
  | NotesResponse
  | TagResponse
  | TagsResponse
  | GetTaskDetailedResponse
  | ProjectContextResponse
  | TaskContextResponse
  | BoardAnalysisResponse
  | BlockedTasksResponse
  | OverdueTasksResponse
  | MCPResponse;