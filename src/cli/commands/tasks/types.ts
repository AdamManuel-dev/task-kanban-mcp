/**
 * @fileoverview Task command type definitions
 * @lastmodified 2025-07-28T10:30:00Z
 * 
 * Features: Shared interfaces for task CLI commands
 * Main APIs: Command option interfaces, response types
 * Constraints: Must align with API schema types
 * Patterns: Consistent naming with optional fields
 */

export interface ShowTaskOptions {
  context?: boolean;
}

export interface CreateTaskOptions {
  interactive?: boolean;
  title?: string;
  description?: string;
  due?: string;
  priority?: string;
  assignee?: string;
  tags?: string;
  template?: string;
  board?: string;
  column?: string;
  position?: string;
  interactive?: boolean;
}

export interface UpdateTaskOptions {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  due?: string;
  tags?: string;
  board?: string;
  column?: string;
  position?: string;
  interactive?: boolean;
}

export interface DeleteTaskOptions {
  force?: boolean;
}

export interface MoveTaskOptions {
  position?: string;
  interactive?: boolean;
}

export interface SelectTaskOptions {
  board?: string;
  status?: string;
  tags?: string;
  limit?: string;
  sort?: string;
  order?: string;
}

export interface TaskListItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string | number;
  assignee?: string;
  tags?: string[];
  due_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TaskListResponse {
  data: TaskListItem[];
  total: number;
}

export interface UpdateTaskPromptResult {
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  assignee?: string;
  due_date?: string;
  tags?: string;
}

export interface ConfirmPromptResult {
  confirmed: boolean;
}

export interface ActionPromptResult {
  action: string;
}

export interface ColumnPromptResult {
  columnId: string;
}

export interface StatusPromptResult {
  newStatus: string;
}

export interface QueryPromptResult {
  query: string;
}