/**
 * Type definitions for CLI API client
 */

import type { Task, Board, Note, Tag } from '../types';

// Health check response
export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  database: {
    status: 'connected' | 'disconnected';
    size?: number;
  };
  memory?: {
    used: number;
    total: number;
  };
}

// Task operations
export interface CreateTaskRequest {
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

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  priority?: number;
  status?: 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived';
  assignee?: string;
  due_date?: string;
  progress?: number;
}

// Board operations
export interface CreateBoardRequest {
  name: string;
  description?: string;
  columns?: Array<{
    name: string;
    position: number;
  }>;
}

export interface UpdateBoardRequest {
  name?: string;
  description?: string;
  archived?: boolean;
}

// Note operations
export interface CreateNoteRequest {
  content: string;
  category?: 'general' | 'meeting' | 'idea' | 'todo' | 'reminder';
  task_id?: string;
  board_id?: string;
  pinned?: boolean;
}

export interface UpdateNoteRequest {
  content?: string;
  category?: 'general' | 'meeting' | 'idea' | 'todo' | 'reminder';
  pinned?: boolean;
}

// Tag operations
export interface CreateTagRequest {
  name: string;
  color?: string;
  description?: string;
  parent_id?: string;
}

export interface UpdateTagRequest {
  name?: string;
  color?: string;
  description?: string;
  parent_id?: string;
}

// API response wrappers
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp?: string;
  status?: string;
}

export interface TaskResponse extends ApiResponse<Task> {
  data: Task;
}

export interface TasksResponse extends ApiResponse<Task[]> {
  data: Task[];
  count?: number;
}

export interface BoardResponse extends ApiResponse<Board> {
  data: Board;
}

export interface BoardsResponse extends ApiResponse<Board[]> {
  data: Board[];
  count?: number;
}

export interface NoteResponse extends ApiResponse<Note> {
  data: Note;
}

export interface NotesResponse extends ApiResponse<Note[]> {
  data: Note[];
  count?: number;
}

export interface TagResponse extends ApiResponse<Tag> {
  data: Tag;
}

export interface TagsResponse extends ApiResponse<Tag[]> {
  data: Tag[];
  count?: number;
}

// Error response type
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp?: string;
    requestId?: string;
  };
}

// Union type for all possible API responses
export type AnyApiResponse = 
  | HealthResponse
  | TaskResponse
  | TasksResponse
  | BoardResponse
  | BoardsResponse
  | NoteResponse
  | NotesResponse
  | TagResponse
  | TagsResponse
  | ErrorResponse
  | ApiResponse;