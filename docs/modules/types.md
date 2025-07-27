# Types Module

## Overview

The types module provides comprehensive TypeScript type definitions, interfaces, and type utilities for the MCP Kanban application. It ensures type safety across the entire codebase through branded types, strict interfaces, and advanced TypeScript patterns.

This module serves as the foundation for all type safety in the application, providing:

- **Domain Entity Types**: Core business objects like Task, Board, User with strict typing
- **API Contract Types**: Request/response interfaces for all API endpoints
- **Database Schema Types**: Types matching the database structure with proper mapping
- **Branded Types**: Type-safe identifiers that prevent mixing different ID types
- **Utility Types**: Advanced TypeScript patterns for common operations
- **Type Guards**: Runtime validation functions for type safety
- **Advanced Patterns**: Discriminated unions, conditional types, and template literals

The module follows TypeScript best practices including:
- Strict type checking with no implicit any
- Branded types for type-safe identifiers
- Comprehensive type guards for runtime validation
- Utility types for common transformations
- Proper separation of concerns across files

## Table of Contents

- [Architecture](#architecture)
- [Core Type Categories](#core-type-categories)
  - [Entity Types](#entity-types)
  - [API Types](#api-types)
  - [Database Types](#database-types)
  - [Branded Types](#branded-types)
  - [Utility Types](#utility-types)
- [Type Organization](#type-organization)
- [Advanced Patterns](#advanced-patterns)
- [Type Guards](#type-guards)
- [Best Practices](#best-practices)
- [Related Modules](#related-modules)

## Architecture

The types module is organized into focused files that each handle specific concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                       Types Module                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  /src/types/                                                │
│  ├── index.ts          - Main type exports & re-exports    │
│  ├── entities.ts       - Domain entity types & enums       │
│  ├── api.ts           - API request/response types         │
│  ├── database.ts      - Database schema types & mappers    │
│  ├── branded.ts       - Branded/opaque types & constructors│
│  ├── guards.ts        - Type guard functions & validators  │
│  ├── utilities.ts     - Utility type helpers & transforms  │
│  └── ambient.d.ts     - Ambient type declarations          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Module Dependencies

```typescript
// Dependency flow
entities.ts     ← No dependencies
branded.ts      ← No dependencies  
utilities.ts    ← No dependencies
guards.ts       ← entities.ts, branded.ts
database.ts     ← entities.ts, branded.ts
api.ts          ← entities.ts, branded.ts, utilities.ts
index.ts        ← All other files
```

### Type Safety Layers

1. **Compile-time Safety**: TypeScript compiler catches type errors
2. **Runtime Validation**: Type guards ensure data integrity
3. **Branded Types**: Prevents mixing different ID types
4. **Strict Interfaces**: Enforces required properties and types
5. **Utility Types**: Provides type transformations and constraints

## Core Type Categories

### Entity Types

Domain entities representing core business objects with comprehensive type definitions:

```typescript
// Task entity - Core work item
export interface Task {
  id: TaskId;                    // Branded type for type safety
  title: string;                 // Required task title
  description?: string;          // Optional detailed description
  board_id: BoardId;             // Board this task belongs to
  column_id: ColumnId;           // Column within the board
  status: TaskStatus;            // Current workflow status
  priority: Priority;            // 1-5 priority level
  assignee?: UserId;             // Who is assigned (optional)
  reporter: UserId;              // Who created/reported the task
  due_date?: Date;               // Optional deadline
  created_at: Date;              // Creation timestamp
  updated_at: Date;              // Last modification timestamp
  position: number;              // Order within column
  progress: number;              // 0-100 completion percentage
  estimated_hours?: number;      // Time estimation
  actual_hours?: number;         // Actual time spent
  archived: boolean;             // Soft delete flag
  parent_id?: TaskId;            // For subtask relationships
  metadata?: TaskMetadata;       // Extended properties
}

// Task metadata - Extensible properties
export interface TaskMetadata {
  color?: string;                // UI color preference
  icon?: string;                 // Custom icon identifier
  custom_fields?: Record<string, unknown>;  // Flexible custom data
  integrations?: {
    github?: { 
      issue_number: number; 
      repo: string; 
      branch?: string;
    };
    jira?: { 
      issue_key: string; 
      project?: string;
    };
    slack?: { 
      thread_ts: string; 
      channel: string;
    };
    trello?: {
      card_id: string;
      list_id: string;
    };
  };
  tags?: string[];               // Associated tags
  attachments?: string[];        // File attachment URLs
  comments_count?: number;       // Cached comment count
  watchers?: UserId[];           // Users watching this task
}

// Board entity - Container for tasks
export interface Board {
  id: BoardId;                   // Unique board identifier
  name: string;                  // Board display name
  description?: string;          // Optional board description
  owner_id: UserId;              // Board owner/creator
  created_at: Date;              // Creation timestamp
  updated_at: Date;              // Last modification timestamp
  settings: BoardSettings;       // Board configuration
  visibility: BoardVisibility;   // Access control
  archived: boolean;             // Soft delete flag
  metadata?: BoardMetadata;      // Extended properties
}

// Board settings - Configuration options
export interface BoardSettings {
  columns: ColumnConfig[];       // Column definitions
  workflow: WorkflowConfig;      // Status transitions
  permissions: PermissionConfig; // Access rules
  notifications: NotificationConfig; // Alert settings
  theme?: BoardTheme;            // Visual customization
}

// Column configuration
export interface ColumnConfig {
  id: ColumnId;
  name: string;
  color?: string;
  wip_limit?: number;            // Work-in-progress limit
  auto_archive?: boolean;        // Auto-archive completed tasks
  position: number;
}

// Workflow configuration
export interface WorkflowConfig {
  transitions: StatusTransition[];
  auto_assign?: boolean;         // Auto-assign based on rules
  required_fields?: string[];    // Required fields per status
}

// Status transition rules
export interface StatusTransition {
  from: TaskStatus;
  to: TaskStatus[];
  conditions?: TransitionCondition[];
}

// Transition conditions
export interface TransitionCondition {
  field: keyof Task;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: unknown;
}

// Board visibility options
export type BoardVisibility = 'private' | 'team' | 'public' | 'organization';

// Board metadata
export interface BoardMetadata {
  template?: string;             // Board template used
  category?: string;             // Board category
  tags?: string[];               // Associated tags
  integrations?: {
    slack_channel?: string;
    github_repo?: string;
    jira_project?: string;
  };
}

// User entity - System users
export interface User {
  id: UserId;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  role: UserRole;
  permissions: Permission[];
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
  preferences: UserPreferences;
  metadata?: UserMetadata;
}

// User roles
export type UserRole = 'admin' | 'manager' | 'member' | 'viewer' | 'guest';

// User permissions
export type Permission = 
  | 'create_board'
  | 'edit_board'
  | 'delete_board'
  | 'create_task'
  | 'edit_task'
  | 'delete_task'
  | 'assign_task'
  | 'view_analytics'
  | 'manage_users';

// User preferences
export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  notifications: NotificationPreferences;
  dashboard_layout?: DashboardLayout;
}

// Notification preferences
export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  slack: boolean;
  task_assignments: boolean;
  due_date_reminders: boolean;
  board_updates: boolean;
}

// Tag entity - Task categorization
export interface Tag {
  id: TagId;
  name: string;
  color: string;
  description?: string;
  board_id?: BoardId;            // Board-specific tag
  created_by: UserId;
  created_at: Date;
  usage_count: number;           // How many tasks use this tag
}

// Comment entity - Task discussions
export interface Comment {
  id: CommentId;
  task_id: TaskId;
  author_id: UserId;
  content: string;
  created_at: Date;
  updated_at: Date;
  parent_id?: CommentId;         // For threaded comments
  mentions: UserId[];            // Mentioned users
  attachments?: string[];        // File attachments
}

// Status enums with comprehensive options
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  TESTING = 'testing',
  DONE = 'done',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived'
}

// Priority levels with semantic meaning
export type Priority = 1 | 2 | 3 | 4 | 5;

// Priority constants for better readability
export const PRIORITY = {
  LOWEST: 1,
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  HIGHEST: 5
} as const;

// Priority labels
export const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'Lowest',
  2: 'Low', 
  3: 'Medium',
  4: 'High',
  5: 'Highest'
};
```

### API Types

Request and response types for API endpoints with comprehensive validation and error handling:

```typescript
// Generic API response wrapper
export interface ApiResponse<T> {
  success: boolean;              // Operation success indicator
  data?: T;                      // Response data (if successful)
  error?: ApiError;              // Error details (if failed)
  meta?: ResponseMeta;           // Response metadata
  warnings?: ApiWarning[];       // Non-fatal warnings
}

// API error with detailed information
export interface ApiError {
  code: string;                  // Machine-readable error code
  message: string;               // Human-readable error message
  details?: unknown;             // Additional error context
  field?: string;                // Field-specific error location
  timestamp: string;             // ISO timestamp
  request_id: string;            // Request correlation ID
  stack?: string;                // Stack trace (development only)
  suggestions?: string[];        // Suggested fixes
  retry_after?: number;          // Retry delay in seconds
}

// API warning for non-fatal issues
export interface ApiWarning {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
}

// Response metadata for pagination and context
export interface ResponseMeta {
  total?: number;                // Total records available
  page?: number;                 // Current page number
  limit?: number;                // Records per page
  hasMore?: boolean;             // More pages available
  timestamp: string;             // Response timestamp
  request_id: string;            // Request correlation ID
  version?: string;              // API version
  cache?: CacheInfo;             // Caching information
  rate_limit?: RateLimitInfo;    // Rate limiting info
  [key: string]: unknown;        // Additional metadata
}

// Cache information
export interface CacheInfo {
  cached: boolean;
  cache_key?: string;
  expires_at?: string;
  etag?: string;
}

// Rate limiting information
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset_at: string;
  retry_after?: number;
}

// Pagination request parameters
export interface PaginationRequest {
  limit?: number;                // Records per page (1-100)
  offset?: number;               // Records to skip
  page?: number;                 // Page number (alternative to offset)
  sort?: string;                 // Sort field
  order?: 'asc' | 'desc';        // Sort direction
  cursor?: string;               // Cursor-based pagination
}

// Task creation request with validation
export interface CreateTaskRequest {
  title: string;                 // Required task title
  description?: string;          // Optional description
  board_id: string;              // Target board ID
  column_id?: string;            // Target column ID
  priority?: Priority;           // Priority level
  assignee?: string;             // User ID to assign
  due_date?: string;             // ISO date string
  tags?: string[];               // Tag names or IDs
  parent_id?: string;            // Parent task ID
  metadata?: Partial<TaskMetadata>; // Extended properties
  position?: number;             // Position in column
  estimated_hours?: number;      // Time estimation
}

// Task update request (partial)
export type UpdateTaskRequest = Partial<Omit<CreateTaskRequest, 'board_id'>> & {
  id: string;                    // Task ID to update
};

// Task bulk operations
export interface BulkTaskRequest {
  task_ids: string[];            // Tasks to operate on
  operation: 'update' | 'delete' | 'archive' | 'move' | 'assign';
  data?: Partial<Task>;          // Update data
  target_column_id?: string;     // For move operations
  assignee_id?: string;          // For assign operations
}

// Task filters for search and filtering
export interface TaskFilters extends PaginationRequest {
  board_id?: string;             // Filter by board
  column_id?: string;            // Filter by column
  status?: TaskStatus | TaskStatus[]; // Filter by status
  priority?: Priority | Priority[];   // Filter by priority
  assignee?: string | string[];  // Filter by assignee
  reporter?: string | string[];  // Filter by reporter
  search?: string;               // Full-text search
  tags?: string[];               // Filter by tags
  due_before?: Date;             // Due date range
  due_after?: Date;              // Due date range
  created_before?: Date;         // Creation date range
  created_after?: Date;          // Creation date range
  parent_id?: string;            // Filter by parent task
  archived?: boolean;            // Include archived tasks
  has_attachments?: boolean;     // Tasks with attachments
  has_comments?: boolean;        // Tasks with comments
  progress_min?: number;         // Progress range
  progress_max?: number;         // Progress range
  estimated_hours_min?: number;  // Time estimation range
  estimated_hours_max?: number;  // Time estimation range
}

// Board creation request
export interface CreateBoardRequest {
  name: string;                  // Board name
  description?: string;          // Board description
  visibility: BoardVisibility;   // Access level
  settings?: Partial<BoardSettings>; // Board configuration
  template?: string;             // Template to use
  members?: string[];            // Initial member IDs
}

// Board update request
export interface UpdateBoardRequest {
  id: string;                    // Board ID
  name?: string;
  description?: string;
  visibility?: BoardVisibility;
  settings?: Partial<BoardSettings>;
  archived?: boolean;
}

// User creation request
export interface CreateUserRequest {
  username: string;              // Unique username
  email: string;                 // Email address
  display_name?: string;         // Display name
  role?: UserRole;               // User role
  permissions?: Permission[];    // Specific permissions
  preferences?: Partial<UserPreferences>; // User preferences
}

// Authentication request
export interface LoginRequest {
  username: string;              // Username or email
  password: string;              // Password
  remember_me?: boolean;         // Remember login
  mfa_token?: string;            // Multi-factor auth
}

// Authentication response
export interface LoginResponse {
  user: User;                    // User information
  token: string;                 // JWT token
  refresh_token?: string;        // Refresh token
  expires_at: string;            // Token expiration
  permissions: Permission[];     // User permissions
}

// WebSocket message types
export interface WebSocketMessage<T = unknown> {
  type: string;                  // Message type
  data: T;                       // Message payload
  timestamp: string;             // Message timestamp
  user_id?: string;              // Sender user ID
  request_id?: string;           // Request correlation
}

// Real-time event types
export type WebSocketEvent = 
  | { type: 'task.created'; task: Task }
  | { type: 'task.updated'; task: Task; changes: Partial<Task> }
  | { type: 'task.deleted'; task_id: string }
  | { type: 'task.moved'; task_id: string; from: string; to: string }
  | { type: 'board.updated'; board: Board }
  | { type: 'user.joined'; user: User }
  | { type: 'user.left'; user_id: string };

// Export request for data export
export interface ExportRequest {
  format: 'json' | 'csv' | 'xlsx' | 'pdf';
  filters?: TaskFilters;         // Data filters
  fields?: string[];             // Fields to include
  include_attachments?: boolean; // Include file attachments
  include_comments?: boolean;    // Include comments
  date_range?: {
    start: string;
    end: string;
  };
}

// Import request for data import
export interface ImportRequest {
  format: 'json' | 'csv' | 'xlsx';
  data: string | Buffer;         // File content
  options?: {
    create_missing_users?: boolean;
    create_missing_boards?: boolean;
    update_existing?: boolean;
    skip_duplicates?: boolean;
  };
}

// Search request for advanced search
export interface SearchRequest {
  query: string;                 // Search query
  filters?: TaskFilters;         // Additional filters
  highlight?: boolean;           // Include highlights
  facets?: string[];             // Faceted search
  suggest?: boolean;             // Include suggestions
}

// Search response with results and facets
export interface SearchResponse {
  results: Task[];
  total: number;
  facets?: Record<string, FacetValue[]>;
  suggestions?: string[];
  highlights?: Record<string, string[]>;
}

// Facet value for search results
export interface FacetValue {
  value: string;
  count: number;
  selected?: boolean;
}
```

### Database Types

Types matching database schema with comprehensive mapping and validation:

```typescript
// Database row types - Raw database structure
export interface TaskRow {
  id: string;                    // UUID primary key
  title: string;                 // Task title
  description: string | null;    // Optional description
  board_id: string;              // Foreign key to boards
  column_id: string;             // Foreign key to columns
  status: string;                // Status enum as string
  priority: number;              // Priority 1-5
  assignee: string | null;       // Foreign key to users
  reporter: string;              // Foreign key to users
  due_date: string | null;       // ISO date string
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
  position: number;              // Order within column
  progress: number;              // 0-100 percentage
  estimated_hours: number | null; // Time estimation
  actual_hours: number | null;   // Actual time spent
  archived: 0 | 1;               // Boolean as integer
  parent_id: string | null;      // Self-referencing foreign key
  metadata: string | null;       // JSON string for extended data
}

// Board row type
export interface BoardRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  settings: string;              // JSON string
  visibility: string;            // Enum as string
  archived: 0 | 1;
  metadata: string | null;       // JSON string
}

// User row type
export interface UserRow {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;                  // Enum as string
  permissions: string;           // JSON array string
  created_at: string;
  updated_at: string;
  last_login: string | null;
  preferences: string;           // JSON string
  metadata: string | null;       // JSON string
}

// Tag row type
export interface TagRow {
  id: string;
  name: string;
  color: string;
  description: string | null;
  board_id: string | null;
  created_by: string;
  created_at: string;
  usage_count: number;
}

// Comment row type
export interface CommentRow {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  parent_id: string | null;
  mentions: string;              // JSON array string
  attachments: string | null;    // JSON array string
}

// Database query result types
export interface TaskWithRelations {
  task: TaskRow;
  board?: BoardRow;
  assignee?: UserRow;
  reporter?: UserRow;
  parent?: TaskRow;
  tags?: TagRow[];
  comments?: CommentRow[];
  subtasks?: TaskRow[];
}

// Database transaction types
export interface DatabaseTransaction {
  id: string;
  status: 'pending' | 'committed' | 'rolled_back';
  created_at: string;
  updated_at: string;
  operations: DatabaseOperation[];
}

// Database operation types
export interface DatabaseOperation {
  id: string;
  transaction_id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: string;
}

// Type mappers - Convert database rows to domain entities
export function mapTaskRowToTask(row: TaskRow): Task {
  return {
    id: row.id as TaskId,
    title: row.title,
    description: row.description ?? undefined,
    board_id: row.board_id as BoardId,
    column_id: row.column_id as ColumnId,
    status: row.status as TaskStatus,
    priority: row.priority as Priority,
    assignee: row.assignee ? (row.assignee as UserId) : undefined,
    reporter: row.reporter as UserId,
    due_date: row.due_date ? new Date(row.due_date) : undefined,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    position: row.position,
    progress: row.progress,
    estimated_hours: row.estimated_hours ?? undefined,
    actual_hours: row.actual_hours ?? undefined,
    archived: Boolean(row.archived),
    parent_id: row.parent_id ? (row.parent_id as TaskId) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined
  };
}

export function mapBoardRowToBoard(row: BoardRow): Board {
  return {
    id: row.id as BoardId,
    name: row.name,
    description: row.description ?? undefined,
    owner_id: row.owner_id as UserId,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    settings: JSON.parse(row.settings),
    visibility: row.visibility as BoardVisibility,
    archived: Boolean(row.archived),
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined
  };
}

export function mapUserRowToUser(row: UserRow): User {
  return {
    id: row.id as UserId,
    username: row.username,
    email: row.email,
    display_name: row.display_name ?? undefined,
    avatar_url: row.avatar_url ?? undefined,
    role: row.role as UserRole,
    permissions: JSON.parse(row.permissions),
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    last_login: row.last_login ? new Date(row.last_login) : undefined,
    preferences: JSON.parse(row.preferences),
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined
  };
}

// Reverse mappers - Convert domain entities to database rows
export function mapTaskToTaskRow(task: Task): TaskRow {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    board_id: task.board_id,
    column_id: task.column_id,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee ?? null,
    reporter: task.reporter,
    due_date: task.due_date?.toISOString() ?? null,
    created_at: task.created_at.toISOString(),
    updated_at: task.updated_at.toISOString(),
    position: task.position,
    progress: task.progress,
    estimated_hours: task.estimated_hours ?? null,
    actual_hours: task.actual_hours ?? null,
    archived: task.archived ? 1 : 0,
    parent_id: task.parent_id ?? null,
    metadata: task.metadata ? JSON.stringify(task.metadata) : null
  };
}

// Database query parameter types
export interface TaskQueryParams {
  board_id?: string;
  column_id?: string;
  status?: string | string[];
  priority?: number | number[];
  assignee?: string | string[];
  search?: string;
  tags?: string[];
  due_before?: string;
  due_after?: string;
  archived?: boolean;
  limit?: number;
  offset?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// Database result types
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Database migration types
export interface Migration {
  id: number;
  name: string;
  up: string;                    // SQL for migration
  down: string;                  // SQL for rollback
  created_at: string;
  executed_at?: string;
}

// Database seed types
export interface Seed {
  id: number;
  name: string;
  data: Record<string, unknown>;
  created_at: string;
  executed_at?: string;
}

// Database connection types
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  connectionLimit?: number;
  acquireTimeout?: number;
  timeout?: number;
}

// Database pool types
export interface ConnectionPool {
  acquire(): Promise<DatabaseConnection>;
  release(connection: DatabaseConnection): void;
  end(): Promise<void>;
  getConnection(): Promise<DatabaseConnection>;
}

// Database connection types
export interface DatabaseConnection {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

// Database error types
export interface DatabaseError {
  code: string;
  errno: number;
  sqlMessage: string;
  sqlState: string;
  index: number;
  sql: string;
}

// Database constraint types
export interface DatabaseConstraint {
  name: string;
  type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK' | 'INDEX';
  table: string;
  columns: string[];
  referencedTable?: string;
  referencedColumns?: string[];
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
}
```

### Branded Types

Type-safe identifiers using branding to prevent mixing different ID types:

```typescript
// Brand type utility - Creates unique type brands
declare const brand: unique symbol;
export type Brand<T, TBrand> = T & { [brand]: TBrand };

// Branded ID types for all entities
export type TaskId = Brand<string, 'TaskId'>;
export type BoardId = Brand<string, 'BoardId'>;
export type ColumnId = Brand<string, 'ColumnId'>;
export type UserId = Brand<string, 'UserId'>;
export type TagId = Brand<string, 'TagId'>;
export type NoteId = Brand<string, 'NoteId'>;
export type CommentId = Brand<string, 'CommentId'>;
export type AttachmentId = Brand<string, 'AttachmentId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type NotificationId = Brand<string, 'NotificationId'>;
export type AuditLogId = Brand<string, 'AuditLogId'>;

// Constructor functions - Safe type conversion
export const TaskId = (id: string): TaskId => {
  if (!isValidTaskId(id)) {
    throw new Error(`Invalid TaskId format: ${id}`);
  }
  return id as TaskId;
};

export const BoardId = (id: string): BoardId => {
  if (!isValidBoardId(id)) {
    throw new Error(`Invalid BoardId format: ${id}`);
  }
  return id as BoardId;
};

export const ColumnId = (id: string): ColumnId => {
  if (!isValidColumnId(id)) {
    throw new Error(`Invalid ColumnId format: ${id}`);
  }
  return id as ColumnId;
};

export const UserId = (id: string): UserId => {
  if (!isValidUserId(id)) {
    throw new Error(`Invalid UserId format: ${id}`);
  }
  return id as UserId;
};

// Validation functions with comprehensive checks
export function isValidTaskId(id: unknown): id is TaskId {
  return typeof id === 'string' && 
         /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function isValidBoardId(id: unknown): id is BoardId {
  return typeof id === 'string' && 
         /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function isValidColumnId(id: unknown): id is ColumnId {
  return typeof id === 'string' && 
         /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function isValidUserId(id: unknown): id is UserId {
  return typeof id === 'string' && 
         /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// Generic ID validation for any branded type
export function isValidId<T extends Brand<string, any>>(
  id: unknown, 
  pattern: RegExp
): id is T {
  return typeof id === 'string' && pattern.test(id);
}

// Branded type utilities
export type BrandedString<TBrand> = Brand<string, TBrand>;

// Extract the base type from a branded type
export type Unbrand<T> = T extends Brand<infer U, any> ? U : T;

// Create a branded type from a base type
export type ToBrand<T, TBrand> = Brand<T, TBrand>;

// Branded type guards
export function isBrandedId<T extends Brand<string, any>>(
  value: unknown,
  validator: (id: unknown) => id is T
): value is T {
  return validator(value);
}

// Branded type collections
export type AllIds = TaskId | BoardId | ColumnId | UserId | TagId | NoteId | CommentId | AttachmentId;

// Branded type maps for type-safe lookups
export interface IdMap<T> {
  [TaskId]: T;
  [BoardId]: T;
  [ColumnId]: T;
  [UserId]: T;
  [TagId]: T;
  [NoteId]: T;
  [CommentId]: T;
  [AttachmentId]: T;
}

// Usage examples
function getTask(id: TaskId): Promise<Task> {
  // Type-safe: only accepts TaskId, not any string
  return taskRepository.findById(id);
}

function assignTask(taskId: TaskId, userId: UserId): Promise<void> {
  // Prevents mixing different ID types
  return taskService.assign(taskId, userId);
}

// Must explicitly convert with validation
const taskId = TaskId('550e8400-e29b-41d4-a716-446655440000');
const userId = UserId('123e4567-e89b-12d3-a456-426614174000');
const task = await getTask(taskId);
await assignTask(taskId, userId);

// These would cause TypeScript errors:
// const task = await getTask('string'); // Error!
// await assignTask(userId, taskId); // Error! Wrong parameter order

// Branded type factories for testing
export const createTestTaskId = (): TaskId => 
  TaskId('550e8400-e29b-41d4-a716-446655440000');

export const createTestBoardId = (): BoardId => 
  BoardId('123e4567-e89b-12d3-a456-426614174000');

export const createTestUserId = (): UserId => 
  UserId('987fcdeb-51a2-43d1-9f12-345678901234');

// Branded type serialization
export function serializeId<T extends Brand<string, any>>(id: T): string {
  return id as string;
}

export function deserializeId<T extends Brand<string, any>>(
  id: string, 
  validator: (id: unknown) => id is T
): T {
  if (!validator(id)) {
    throw new Error(`Invalid ID format: ${id}`);
  }
  return id as T;
}

// Branded type collections
export interface IdCollection {
  taskIds: TaskId[];
  boardIds: BoardId[];
  userIds: UserId[];
  columnIds: ColumnId[];
}

// Branded type relationships
export interface TaskRelations {
  id: TaskId;
  boardId: BoardId;
  columnId: ColumnId;
  assigneeId?: UserId;
  reporterId: UserId;
  parentId?: TaskId;
  tagIds: TagId[];
  commentIds: CommentId[];
}

// Branded type constraints
export type TaskAssignee = UserId;
export type TaskReporter = UserId;
export type BoardOwner = UserId;
export type CommentAuthor = UserId;

// Branded type validation with custom error messages
export class InvalidIdError extends Error {
  constructor(
    public readonly idType: string,
    public readonly value: unknown
  ) {
    super(`Invalid ${idType}: ${value}`);
    this.name = 'InvalidIdError';
  }
}

export function validateTaskId(id: unknown): TaskId {
  if (!isValidTaskId(id)) {
    throw new InvalidIdError('TaskId', id);
  }
  return id;
}

// Branded type utilities for collections
export function filterValidTaskIds(ids: unknown[]): TaskId[] {
  return ids.filter(isValidTaskId);
}

export function mapToTaskIds(ids: string[]): TaskId[] {
  return ids.map(TaskId);
}

// Branded type comparison utilities
export function areIdsEqual<T extends Brand<string, any>>(a: T, b: T): boolean {
  return a === b;
}

export function sortIds<T extends Brand<string, any>>(ids: T[]): T[] {
  return [...ids].sort();
}
```

### Utility Types

Advanced TypeScript utility types for common operations and transformations:

```typescript
// Deep partial type - Makes all nested properties optional
export type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;

// Deep readonly type - Makes all nested properties readonly
export type DeepReadonly<T> = T extends object ? {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
} : T;

// Nullable and Optional types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type NonNullable<T> = T extends null | undefined ? never : T;

// Extract keys of specific type
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

// Extract keys that are not of specific type
export type KeysNotOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? never : K;
}[keyof T];

// Omit functions from type
export type OmitFunctions<T> = Pick<T, KeysNotOfType<T, Function>>;

// Keep only function properties
export type OnlyFunctions<T> = Pick<T, KeysOfType<T, Function>>;

// Required keys - Keys that are not optional
export type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

// Optional keys - Keys that are optional
export type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

// Mutable type - Removes readonly modifiers
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

// Immutable type - Adds readonly modifiers
export type Immutable<T> = {
  readonly [P in keyof T]: T[P];
};

// Union to intersection
export type UnionToIntersection<U> = 
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

// Function types for async operations
export type AsyncFunction<T = void> = () => Promise<T>;
export type AsyncFunctionWithArgs<TArgs, TReturn = void> = (args: TArgs) => Promise<TReturn>;
export type SyncFunction<TArgs = void, TReturn = void> = (args: TArgs) => TReturn;

// Result type for error handling
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Maybe type for nullable values
export type Maybe<T> = T | null | undefined;

// Non-null assertion utility
export type NonNull<T> = T extends null | undefined ? never : T;

// Array utilities
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;
export type NonEmptyArray<T> = [T, ...T[]];
export type ArrayOfLength<T, L extends number> = T[] & { length: L };

// Object utilities
export type ValueOf<T> = T[keyof T];
export type KeyOf<T> = keyof T;
export type Values<T> = T[keyof T];

// Conditional types
export type If<C extends boolean, T, F> = C extends true ? T : F;
export type IsNever<T> = [T] extends [never] ? true : false;
export type IsAny<T> = 0 extends (1 & T) ? true : false;
export type IsUnknown<T> = IsNever<T> extends false ? T extends unknown ? unknown extends T ? true : false : false : false;

// String utilities
export type StringLiteral<T> = T extends string ? string extends T ? never : T : never;
export type Trim<S extends string> = S extends `${' ' | '\n' | '\t'}${infer T}` | `${infer T}${' ' | '\n' | '\t'}` ? Trim<T> : S;
export type Capitalize<S extends string> = S extends `${infer F}${infer R}` ? `${Uppercase<F>}${R}` : S;
export type Uncapitalize<S extends string> = S extends `${infer F}${infer R}` ? `${Lowercase<F>}${R}` : S;

// Number utilities
export type NumberRange<Start extends number, End extends number> = number extends Start | End 
  ? number 
  : Start extends End 
    ? Start 
    : Start extends 0 
      ? End extends 1 
        ? 0 | 1 
        : End extends 2 
          ? 0 | 1 | 2 
          : number 
      : number;

// Tuple utilities
export type Tuple<T, N extends number> = N extends N ? number extends N ? T[] : _TupleOf<T, N, []> : never;
type _TupleOf<T, N extends number, R extends unknown[]> = R['length'] extends N ? R : _TupleOf<T, N, [...R, T]>;

// Promise utilities
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
export type UnwrapPromiseArray<T> = T extends Promise<infer U>[] ? U[] : T;

// Event utilities
export type EventHandler<T = Event> = (event: T) => void | Promise<void>;
export type EventMap = Record<string, Event>;

// Validation utilities
export type Validator<T> = (value: unknown) => value is T;
export type ValidatorWithError<T, E = string> = (value: unknown) => { valid: true; value: T } | { valid: false; error: E };

// State utilities
export type LoadingState<T> = 
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

// Form utilities
export type FormField<T> = {
  value: T;
  error?: string;
  touched: boolean;
  valid: boolean;
};

export type FormState<T> = {
  [K in keyof T]: FormField<T[K]>;
} & {
  isValid: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
};

// API utilities
export type ApiState<T> = LoadingState<T> & {
  lastUpdated?: Date;
  cacheKey?: string;
};

// Cache utilities
export type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
};

export type Cache<T> = {
  get(key: string): T | null;
  set(key: string, value: T, ttl?: number): void;
  delete(key: string): void;
  clear(): void;
  has(key: string): boolean;
};

// Router utilities
export type RouteParams<T extends string> = T extends `${string}:${infer Param}/${infer Rest}` 
  ? { [K in Param]: string } & RouteParams<Rest>
  : T extends `${string}:${infer Param}` 
    ? { [K in Param]: string }
    : {};

// Database utilities
export type WhereClause<T> = {
  [K in keyof T]?: T[K] | { $eq?: T[K]; $ne?: T[K]; $gt?: T[K]; $lt?: T[K]; $in?: T[K][]; $nin?: T[K][]; $like?: string };
} & {
  $and?: WhereClause<T>[];
  $or?: WhereClause<T>[];
  $not?: WhereClause<T>;
};

// Sort utilities
export type SortOrder = 'asc' | 'desc';
export type SortClause<T> = {
  [K in keyof T]?: SortOrder;
};

// Pagination utilities
export type PaginationOptions = {
  page?: number;
  limit?: number;
  offset?: number;
  cursor?: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
    nextCursor?: string;
  };
};

// Time utilities
export type TimeUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
export type Duration = `${number} ${TimeUnit}`;

// Color utilities
export type HexColor = `#${string}`;
export type RGBColor = `rgb(${number}, ${number}, ${number})`;
export type RGBAColor = `rgba(${number}, ${number}, ${number}, ${number})`;
export type HSLColor = `hsl(${number}, ${number}%, ${number}%)`;
export type HSLAColor = `hsla(${number}, ${number}%, ${number}%, ${number})`;
export type Color = HexColor | RGBColor | RGBAColor | HSLColor | HSLAColor | string;

// CSS utilities
export type CSSValue = string | number;
export type CSSProperty = string;
export type CSSObject = Record<CSSProperty, CSSValue>;

// React utilities
export type ReactComponent<P = {}> = React.ComponentType<P>;
export type ReactElement = React.ReactElement;
export type ReactNode = React.ReactNode;
export type ReactRef<T> = React.RefObject<T> | React.MutableRefObject<T>;

// Event utilities
export type EventTarget<T = Event> = {
  addEventListener(type: string, listener: EventHandler<T>): void;
  removeEventListener(type: string, listener: EventHandler<T>): void;
};

// Async utilities
export type AsyncIterator<T> = AsyncIterableIterator<T>;
export type AsyncGenerator<T, TReturn = void, TNext = unknown> = AsyncGenerator<T, TReturn, TNext>;

// Error utilities
export type ErrorWithCode = Error & { code: string };
export type ErrorWithDetails = Error & { details: unknown };
export type AppError = ErrorWithCode & ErrorWithDetails;

// Logger utilities
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogContext = Record<string, unknown>;
export type Logger = {
  [K in LogLevel]: (message: string, context?: LogContext) => void;
};

// Configuration utilities
export type ConfigValue = string | number | boolean | null | undefined;
export type Config = Record<string, ConfigValue>;
export type ConfigSchema<T> = {
  [K in keyof T]: {
    type: 'string' | 'number' | 'boolean';
    required?: boolean;
    default?: T[K];
    validator?: (value: unknown) => value is T[K];
  };
};
```

## Type Organization

### File Structure

The types module is organized into focused files that each handle specific concerns:

```typescript
// index.ts - Main exports and re-exports
export * from './entities';
export * from './api';
export * from './database';
export * from './branded';
export * from './guards';
export * from './utilities';

// Re-export commonly used types for convenience
export type { Task, Board, User, Tag, Comment } from './entities';
export type { TaskId, BoardId, UserId, ColumnId } from './branded';
export type { ApiResponse, ApiError, PaginationRequest } from './api';
export type { Result, Maybe, DeepPartial } from './utilities';

// entities.ts - Domain entities and business logic types
export interface Task { /* ... */ }
export interface Board { /* ... */ }
export interface User { /* ... */ }
export interface Tag { /* ... */ }
export interface Comment { /* ... */ }
export enum TaskStatus { /* ... */ }
export type Priority = /* ... */;

// api.ts - API contract types and request/response interfaces
export interface ApiRequest { /* ... */ }
export interface ApiResponse<T> { /* ... */ }
export interface CreateTaskRequest { /* ... */ }
export interface UpdateTaskRequest { /* ... */ }
export interface TaskFilters { /* ... */ }

// database.ts - Database schema types and mapping functions
export interface TaskRow { /* ... */ }
export interface BoardRow { /* ... */ }
export interface UserRow { /* ... */ }
export function mapTaskRowToTask(row: TaskRow): Task { /* ... */ }
export function mapTaskToTaskRow(task: Task): TaskRow { /* ... */ }

// branded.ts - Branded types and validation functions
export type TaskId = Brand<string, 'TaskId'>;
export type BoardId = Brand<string, 'BoardId'>;
export const TaskId = (id: string): TaskId => /* ... */;
export function isValidTaskId(id: unknown): id is TaskId { /* ... */ }

// guards.ts - Type guard functions and runtime validation
export function isTask(value: unknown): value is Task { /* ... */ }
export function isBoard(value: unknown): value is Board { /* ... */ }
export function isTaskArray(value: unknown): value is Task[] { /* ... */ }

// utilities.ts - Utility types and type transformations
export type DeepPartial<T> = /* ... */;
export type Result<T, E> = /* ... */;
export type Maybe<T> = /* ... */;
```

### Import Organization

Follow these patterns for clean and efficient imports:

```typescript
// Good: Separate type and value imports
import type { Task, Board, User } from '@/types';
import { isTask, TaskId, isValidTaskId } from '@/types';

// Good: Type-only imports for external libraries
import type { Request, Response, NextFunction } from 'express';
import type { ComponentProps } from 'react';

// Good: Grouped imports by source
import type { 
  Task, 
  Board, 
  User, 
  TaskStatus, 
  Priority 
} from '@/types';

import { 
  TaskId, 
  BoardId, 
  UserId, 
  isTask, 
  isValidTaskId 
} from '@/types';

// Good: Aliased imports for clarity
import type { Task as TaskEntity } from '@/types';
import { TaskId as TaskIdentifier } from '@/types';

// Bad: Mixed type and value imports
import { Task, isTask } from '@/types'; // Avoid mixing types and values

// Bad: Importing everything
import * as Types from '@/types'; // Avoid namespace imports

// Good: Specific imports for better tree-shaking
import type { Task } from '@/types/entities';
import { TaskId } from '@/types/branded';
import { isTask } from '@/types/guards';
```

### Module Dependencies

```typescript
// Dependency hierarchy (bottom-up)
// Level 1: No dependencies
entities.ts     ← Pure domain types
branded.ts      ← Pure branded types
utilities.ts    ← Pure utility types

// Level 2: Depend on Level 1
guards.ts       ← entities.ts, branded.ts
database.ts     ← entities.ts, branded.ts

// Level 3: Depend on Level 1 & 2
api.ts          ← entities.ts, branded.ts, utilities.ts

// Level 4: Depends on everything
index.ts        ← All other files
```

### Type Export Patterns

```typescript
// index.ts - Main entry point
// Re-export everything for convenience
export * from './entities';
export * from './api';
export * from './database';
export * from './branded';
export * from './guards';
export * from './utilities';

// Also provide specific exports for better tree-shaking
export type { Task, Board, User } from './entities';
export type { TaskId, BoardId, UserId } from './branded';
export { isTask, isBoard } from './guards';

// entities.ts - Domain types
// Export interfaces and types
export interface Task { /* ... */ }
export interface Board { /* ... */ }
export interface User { /* ... */ }

// Export enums and constants
export enum TaskStatus { /* ... */ }
export const PRIORITY = { /* ... */ } as const;

// Export type aliases
export type Priority = 1 | 2 | 3 | 4 | 5;
export type BoardVisibility = 'private' | 'team' | 'public';

// branded.ts - Branded types
// Export branded type definitions
export type TaskId = Brand<string, 'TaskId'>;
export type BoardId = Brand<string, 'BoardId'>;

// Export constructor functions
export const TaskId = (id: string): TaskId => /* ... */;
export const BoardId = (id: string): BoardId => /* ... */;

// Export validation functions
export function isValidTaskId(id: unknown): id is TaskId { /* ... */ }
export function isValidBoardId(id: unknown): id is BoardId { /* ... */ }

// guards.ts - Type guards
// Export type guard functions
export function isTask(value: unknown): value is Task { /* ... */ }
export function isBoard(value: unknown): value is Board { /* ... */ }
export function isTaskArray(value: unknown): value is Task[] { /* ... */ }

// Export validation utilities
export function validateTask(task: unknown): Task { /* ... */ }
export function validateTaskArray(tasks: unknown[]): Task[] { /* ... */ }
```

### Type Naming Conventions

```typescript
// Interfaces: PascalCase, descriptive names
export interface Task { /* ... */ }
export interface BoardSettings { /* ... */ }
export interface UserPreferences { /* ... */ }

// Types: PascalCase, descriptive names
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type Priority = 1 | 2 | 3 | 4 | 5;
export type BoardVisibility = 'private' | 'team' | 'public';

// Branded types: PascalCase with "Id" suffix
export type TaskId = Brand<string, 'TaskId'>;
export type BoardId = Brand<string, 'BoardId'>;
export type UserId = Brand<string, 'UserId'>;

// Enums: PascalCase, descriptive names
export enum TaskStatus { /* ... */ }
export enum UserRole { /* ... */ }

// Constants: UPPER_SNAKE_CASE for global constants
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_TASK_TITLE_LENGTH = 255;

// Functions: camelCase, descriptive names
export function isValidTaskId(id: unknown): id is TaskId { /* ... */ }
export function mapTaskRowToTask(row: TaskRow): Task { /* ... */ }

// Constructor functions: PascalCase (same as type)
export const TaskId = (id: string): TaskId => /* ... */;
export const BoardId = (id: string): BoardId => /* ... */;
```

### Type Documentation

```typescript
/**
 * Represents a task in the kanban system
 * @template TStatus - Specific status type for narrowing
 */
export interface Task<TStatus extends TaskStatus = TaskStatus> {
  /** Unique identifier for the task */
  id: TaskId;
  
  /** Human-readable task title */
  title: string;
  
  /** Optional detailed description */
  description?: string;
  
  /** Board this task belongs to */
  board_id: BoardId;
  
  /** Column within the board */
  column_id: ColumnId;
  
  /** Current workflow status */
  status: TStatus;
  
  /** Priority level (1-5, where 5 is highest) */
  priority: Priority;
  
  /** User assigned to this task (optional) */
  assignee?: UserId;
  
  /** User who created/reported the task */
  reporter: UserId;
  
  /** Optional deadline */
  due_date?: Date;
  
  /** Creation timestamp */
  created_at: Date;
  
  /** Last modification timestamp */
  updated_at: Date;
  
  /** Order within column */
  position: number;
  
  /** Completion percentage (0-100) */
  progress: number;
  
  /** Estimated time in hours */
  estimated_hours?: number;
  
  /** Actual time spent in hours */
  actual_hours?: number;
  
  /** Soft delete flag */
  archived: boolean;
  
  /** Parent task for subtasks */
  parent_id?: TaskId;
  
  /** Extended properties and metadata */
  metadata?: TaskMetadata;
}

/**
 * Type guard for Task objects
 * @param value - Value to check
 * @returns True if value is a valid Task
 */
export function isTask(value: unknown): value is Task {
  return (
    isObject(value) &&
    isValidTaskId(value.id) &&
    typeof value.title === 'string' &&
    isValidBoardId(value.board_id) &&
    isTaskStatus(value.status) &&
    isPriority(value.priority)
  );
}
```

## Advanced Patterns

### Discriminated Unions

Discriminated unions provide type-safe event handling and state management:

```typescript
// Event types with discriminated unions
export type TaskEvent = 
  | { type: 'task.created'; task: Task; user_id: UserId; timestamp: Date }
  | { type: 'task.updated'; task: Task; changes: Partial<Task>; user_id: UserId; timestamp: Date }
  | { type: 'task.deleted'; task_id: TaskId; user_id: UserId; timestamp: Date }
  | { type: 'task.moved'; task_id: TaskId; from: ColumnId; to: ColumnId; user_id: UserId; timestamp: Date }
  | { type: 'task.assigned'; task_id: TaskId; assignee: UserId; user_id: UserId; timestamp: Date }
  | { type: 'task.completed'; task_id: TaskId; user_id: UserId; timestamp: Date }
  | { type: 'task.archived'; task_id: TaskId; user_id: UserId; timestamp: Date };

// Type-safe event handler with exhaustive checking
function handleTaskEvent(event: TaskEvent) {
  switch (event.type) {
    case 'task.created':
      console.log(`Task created: ${event.task.title} by user ${event.user_id}`);
      notifyWatchers(event.task, 'Task created');
      break;
    case 'task.updated':
      console.log(`Task updated with changes:`, event.changes);
      updateTaskCache(event.task);
      break;
    case 'task.deleted':
      console.log(`Task deleted: ${event.task_id}`);
      removeFromCache(event.task_id);
      break;
    case 'task.moved':
      console.log(`Task moved from ${event.from} to ${event.to}`);
      updateBoardView(event.task_id, event.from, event.to);
      break;
    case 'task.assigned':
      console.log(`Task assigned to ${event.assignee}`);
      notifyAssignee(event.assignee, event.task_id);
      break;
    case 'task.completed':
      console.log(`Task completed: ${event.task_id}`);
      triggerWorkflow(event.task_id, 'completed');
      break;
    case 'task.archived':
      console.log(`Task archived: ${event.task_id}`);
      updateArchiveCount(event.task_id);
      break;
    default:
      // TypeScript ensures all cases are handled
      const _exhaustiveCheck: never = event;
      throw new Error(`Unhandled event type: ${(_exhaustiveCheck as any).type}`);
  }
}

// State management with discriminated unions
export type TaskState = 
  | { status: 'idle' }
  | { status: 'loading'; taskId: TaskId }
  | { status: 'success'; task: Task }
  | { status: 'error'; error: Error; taskId?: TaskId };

// Type-safe state transitions
function taskReducer(state: TaskState, action: TaskEvent): TaskState {
  switch (action.type) {
    case 'task.created':
      return { status: 'success', task: action.task };
    case 'task.updated':
      return { status: 'success', task: action.task };
    case 'task.deleted':
      return { status: 'idle' };
    default:
      return state;
  }
}

// API response discriminated unions
export type ApiResult<T> = 
  | { success: true; data: T; meta?: ResponseMeta }
  | { success: false; error: ApiError; meta?: ResponseMeta };

// Type-safe API handling
async function handleApiResult<T>(result: ApiResult<T>): Promise<T> {
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error.message);
  }
}
```

### Template Literal Types

Template literal types provide compile-time string validation:

```typescript
// Route paths as types
type ApiVersion = 'v1' | 'v2' | 'v3';
type Resource = 'tasks' | 'boards' | 'users' | 'tags' | 'comments';
type Action = 'create' | 'read' | 'update' | 'delete' | 'list';
type ApiPath = `/api/${ApiVersion}/${Resource}` | `/api/${ApiVersion}/${Resource}/${Action}`;

// HTTP methods with specific constraints
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Route definition with method-path mapping
type RouteDefinition = `${HttpMethod} ${ApiPath}`;

// Specific route types
type GetRoute = `GET ${ApiPath}`;
type PostRoute = `POST ${ApiPath}`;
type PutRoute = `PUT ${ApiPath}`;
type DeleteRoute = `DELETE ${ApiPath}`;

// Usage with compile-time validation
const routes: RouteDefinition[] = [
  'GET /api/v1/tasks',
  'POST /api/v1/tasks',
  'PUT /api/v1/tasks/update',
  'DELETE /api/v1/tasks/delete',
  'GET /api/v2/boards',
  // 'GET /api/v3/tasks' // Error: v3 not allowed
  // 'POST /api/v1/invalid' // Error: invalid resource
];

// Database column types
type TableName = 'tasks' | 'boards' | 'users' | 'tags';
type ColumnName<T extends TableName> = 
  T extends 'tasks' ? 'id' | 'title' | 'description' | 'board_id' | 'status' :
  T extends 'boards' ? 'id' | 'name' | 'description' | 'owner_id' :
  T extends 'users' ? 'id' | 'username' | 'email' | 'role' :
  T extends 'tags' ? 'id' | 'name' | 'color' | 'board_id' :
  never;

// Type-safe SQL queries
type SelectQuery<T extends TableName> = `SELECT ${ColumnName<T>} FROM ${T}`;
type WhereClause<T extends TableName> = `WHERE ${ColumnName<T>} = ?`;

// Usage
const taskQuery: SelectQuery<'tasks'> = 'SELECT id, title, status FROM tasks';
const userQuery: SelectQuery<'users'> = 'SELECT id, username, email FROM users';

// CSS class names
type ComponentName = 'Button' | 'Card' | 'Modal' | 'Input';
type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning';
type Size = 'sm' | 'md' | 'lg' | 'xl';
type CSSClass = `${ComponentName}--${Variant}--${Size}`;

// Usage
const buttonClass: CSSClass = 'Button--primary--md';
const cardClass: CSSClass = 'Card--success--lg';
```

### Conditional Types

Conditional types enable dynamic type transformations:

```typescript
// Extract promise type
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

// Extract array element type
type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

// Function return type
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

// Function parameter types
type Parameters<T> = T extends (...args: infer P) => any ? P : never;

// Conditional required fields
type ConditionalRequired<T, K extends keyof T> = 
  T & Required<Pick<T, K>>;

// Conditional optional fields
type ConditionalOptional<T, K extends keyof T> = 
  Omit<T, K> & Partial<Pick<T, K>>;

// Extract property type
type PropertyType<T, K extends keyof T> = T[K];

// Deep conditional types
type DeepConditional<T, U, V> = T extends U ? V : T extends object ? {
  [K in keyof T]: DeepConditional<T[K], U, V>;
} : T;

// Usage examples
type TaskWithRequiredDueDate = ConditionalRequired<Task, 'due_date'>;
type TaskWithOptionalAssignee = ConditionalOptional<Task, 'assignee'>;
type TaskTitle = PropertyType<Task, 'title'>; // string
type TaskStatusType = PropertyType<Task, 'status'>; // TaskStatus

// Service method types
type ServiceMethod<T> = T extends (...args: infer A) => Promise<infer R>
  ? (...args: A) => Promise<R>
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : never;

// Async service type
type AsyncService<T> = {
  [K in keyof T]: ServiceMethod<T[K]>;
};

// Database query result types
type QueryResult<T> = T extends Promise<infer U> ? U : T;
type QueryResults<T> = T extends Promise<infer U>[] ? U[] : T;

// Validation result types
type ValidationResult<T> = T extends Validator<infer U> ? U : never;
type ValidationResults<T> = T extends Validator<infer U>[] ? U[] : never;

// Event handler types
type EventHandler<T> = T extends { type: infer U } ? (event: T) => void : never;
type EventHandlers<T> = {
  [K in keyof T]: EventHandler<T[K]>;
};
```

### Mapped Types

Mapped types transform existing types into new types:

```typescript
// Async versions of service methods
type AsyncService<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : T[K];
};

// Getter type - creates getter methods
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

// Setter type - creates setter methods
type Setters<T> = {
  [K in keyof T as `set${Capitalize<string & K>}`]: (value: T[K]) => void;
};

// Combined accessors
type Accessors<T> = Getters<T> & Setters<T>;

// Readonly version of type
type Readonly<T> = {
  readonly [K in keyof T]: T[K];
};

// Partial version of type
type Partial<T> = {
  [K in keyof T]?: T[K];
};

// Pick specific properties
type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// Omit specific properties
type Omit<T, K extends keyof T> = {
  [P in keyof T as P extends K ? never : P]: T[P];
};

// Record type for key-value mappings
type Record<K extends keyof any, T> = {
  [P in K]: T;
};

// Usage examples
interface TaskService {
  findById(id: TaskId): Task;
  create(task: CreateTaskRequest): Task;
  update(id: TaskId, updates: Partial<Task>): Task;
  delete(id: TaskId): void;
}

// Async service
type AsyncTaskService = AsyncService<TaskService>;
// Result:
// {
//   findById: (id: TaskId) => Promise<Task>;
//   create: (task: CreateTaskRequest) => Promise<Task>;
//   update: (id: TaskId, updates: Partial<Task>) => Promise<Task>;
//   delete: (id: TaskId) => Promise<void>;
// }

// Accessors for Task
type TaskAccessors = Accessors<Task>;
// Result:
// {
//   getId: () => TaskId;
//   getTitle: () => string;
//   getDescription: () => string | undefined;
//   // ... other getters
//   setId: (value: TaskId) => void;
//   setTitle: (value: string) => void;
//   setDescription: (value: string | undefined) => void;
//   // ... other setters
// }

// Form field types
type FormFields<T> = {
  [K in keyof T]: FormField<T[K]>;
};

// API response types
type ApiResponses<T> = {
  [K in keyof T]: ApiResponse<T[K]>;
};

// Validation schema types
type ValidationSchema<T> = {
  [K in keyof T]: Validator<T[K]>;
};

// Event emitter types
type EventEmitter<T> = {
  [K in keyof T as `on${Capitalize<string & K>}`]: (handler: (event: T[K]) => void) => void;
} & {
  [K in keyof T as `emit${Capitalize<string & K>}`]: (event: T[K]) => void;
};

// Database model types
type DatabaseModel<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K];
};

// Serialized types
type Serialized<T> = {
  [K in keyof T]: T[K] extends Date ? string :
                  T[K] extends object ? Serialized<T[K]> :
                  T[K];
};

// Deserialized types
type Deserialized<T> = {
  [K in keyof T]: T[K] extends string ? 
    (K extends `${string}_at` ? Date : T[K]) :
    T[K] extends object ? Deserialized<T[K]> :
    T[K];
};
```

### Advanced Type Manipulation

```typescript
// Union to intersection
type UnionToIntersection<U> = 
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

// Tuple to union
type TupleToUnion<T> = T extends readonly (infer U)[] ? U : never;

// Union to tuple
type UnionToTuple<T> = 
  (T extends any ? (t: T) => T : never) extends 
  (t: infer U) => infer U ? [U] : never;

// Extract function overloads
type FunctionOverloads<T> = T extends {
  (...args: infer A1): infer R1;
  (...args: infer A2): infer R2;
  (...args: infer A3): infer R3;
  (...args: infer A4): infer R4;
  (...args: infer A5): infer R5;
} ? [
  (...args: A1) => R1,
  (...args: A2) => R2,
  (...args: A3) => R3,
  (...args: A4) => R4,
  (...args: A5) => R5
] : never;

// Deep merge types
type DeepMerge<T, U> = {
  [K in keyof T | keyof U]: K extends keyof U
    ? K extends keyof T
      ? T[K] extends object
        ? U[K] extends object
          ? DeepMerge<T[K], U[K]>
          : U[K]
        : U[K]
      : U[K]
    : K extends keyof T
      ? T[K]
      : never;
};

// Path types for nested property access
type Paths<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}.${Paths<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

// Get nested property type
type Get<T, P extends string> = P extends keyof T
  ? T[P]
  : P extends `${infer K}.${infer R}`
    ? K extends keyof T
      ? Get<T[K], R>
      : never
    : never;
```

## Type Guards

Type guards provide runtime validation and type narrowing for enhanced type safety.

### Basic Type Guards

```typescript
// Entity type guards with comprehensive validation
export function isTask(value: unknown): value is Task {
  return (
    isObject(value) &&
    isValidTaskId(value.id) &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    value.title.length <= 255 &&
    (value.description === undefined || typeof value.description === 'string') &&
    isValidBoardId(value.board_id) &&
    isValidColumnId(value.column_id) &&
    isTaskStatus(value.status) &&
    isPriority(value.priority) &&
    (value.assignee === undefined || isValidUserId(value.assignee)) &&
    isValidUserId(value.reporter) &&
    (value.due_date === undefined || value.due_date instanceof Date) &&
    value.created_at instanceof Date &&
    value.updated_at instanceof Date &&
    typeof value.position === 'number' &&
    value.position >= 0 &&
    typeof value.progress === 'number' &&
    value.progress >= 0 &&
    value.progress <= 100 &&
    (value.estimated_hours === undefined || 
     (typeof value.estimated_hours === 'number' && value.estimated_hours >= 0)) &&
    (value.actual_hours === undefined || 
     (typeof value.actual_hours === 'number' && value.actual_hours >= 0)) &&
    typeof value.archived === 'boolean' &&
    (value.parent_id === undefined || isValidTaskId(value.parent_id)) &&
    (value.metadata === undefined || isTaskMetadata(value.metadata))
  );
}

export function isBoard(value: unknown): value is Board {
  return (
    isObject(value) &&
    isValidBoardId(value.id) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= 100 &&
    (value.description === undefined || typeof value.description === 'string') &&
    isValidUserId(value.owner_id) &&
    value.created_at instanceof Date &&
    value.updated_at instanceof Date &&
    isBoardSettings(value.settings) &&
    isBoardVisibility(value.visibility) &&
    typeof value.archived === 'boolean' &&
    (value.metadata === undefined || isBoardMetadata(value.metadata))
  );
}

export function isUser(value: unknown): value is User {
  return (
    isObject(value) &&
    isValidUserId(value.id) &&
    typeof value.username === 'string' &&
    value.username.length >= 3 &&
    value.username.length <= 50 &&
    /^[a-zA-Z0-9_-]+$/.test(value.username) &&
    typeof value.email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) &&
    (value.display_name === undefined || typeof value.display_name === 'string') &&
    (value.avatar_url === undefined || typeof value.avatar_url === 'string') &&
    isUserRole(value.role) &&
    Array.isArray(value.permissions) &&
    value.permissions.every(isPermission) &&
    value.created_at instanceof Date &&
    value.updated_at instanceof Date &&
    (value.last_login === undefined || value.last_login instanceof Date) &&
    isUserPreferences(value.preferences) &&
    (value.metadata === undefined || isUserMetadata(value.metadata))
  );
}

// Enum and primitive type guards
export function isTaskStatus(value: unknown): value is TaskStatus {
  return Object.values(TaskStatus).includes(value as TaskStatus);
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'number' && 
         Number.isInteger(value) && 
         value >= 1 && 
         value <= 5;
}

export function isUserRole(value: unknown): value is UserRole {
  return ['admin', 'manager', 'member', 'viewer', 'guest'].includes(value as UserRole);
}

export function isBoardVisibility(value: unknown): value is BoardVisibility {
  return ['private', 'team', 'public', 'organization'].includes(value as BoardVisibility);
}

export function isPermission(value: unknown): value is Permission {
  const validPermissions = [
    'create_board', 'edit_board', 'delete_board',
    'create_task', 'edit_task', 'delete_task',
    'assign_task', 'view_analytics', 'manage_users'
  ];
  return validPermissions.includes(value as Permission);
}

// Array type guards
export function isTaskArray(value: unknown): value is Task[] {
  return Array.isArray(value) && value.every(isTask);
}

export function isBoardArray(value: unknown): value is Board[] {
  return Array.isArray(value) && value.every(isBoard);
}

export function isUserArray(value: unknown): value is User[] {
  return Array.isArray(value) && value.every(isUser);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(item => typeof item === 'number');
}

// Metadata type guards
export function isTaskMetadata(value: unknown): value is TaskMetadata {
  return (
    isObject(value) &&
    (value.color === undefined || typeof value.color === 'string') &&
    (value.icon === undefined || typeof value.icon === 'string') &&
    (value.custom_fields === undefined || isObject(value.custom_fields)) &&
    (value.integrations === undefined || isTaskIntegrations(value.integrations)) &&
    (value.tags === undefined || isStringArray(value.tags)) &&
    (value.attachments === undefined || isStringArray(value.attachments)) &&
    (value.comments_count === undefined || 
     (typeof value.comments_count === 'number' && value.comments_count >= 0)) &&
    (value.watchers === undefined || 
     (Array.isArray(value.watchers) && value.watchers.every(isValidUserId)))
  );
}

export function isTaskIntegrations(value: unknown): value is TaskMetadata['integrations'] {
  return (
    isObject(value) &&
    (value.github === undefined || isGithubIntegration(value.github)) &&
    (value.jira === undefined || isJiraIntegration(value.jira)) &&
    (value.slack === undefined || isSlackIntegration(value.slack)) &&
    (value.trello === undefined || isTrelloIntegration(value.trello))
  );
}

export function isGithubIntegration(value: unknown): value is { issue_number: number; repo: string; branch?: string } {
  return (
    isObject(value) &&
    typeof value.issue_number === 'number' &&
    value.issue_number > 0 &&
    typeof value.repo === 'string' &&
    (value.branch === undefined || typeof value.branch === 'string')
  );
}

export function isJiraIntegration(value: unknown): value is { issue_key: string; project?: string } {
  return (
    isObject(value) &&
    typeof value.issue_key === 'string' &&
    (value.project === undefined || typeof value.project === 'string')
  );
}

export function isSlackIntegration(value: unknown): value is { thread_ts: string; channel: string } {
  return (
    isObject(value) &&
    typeof value.thread_ts === 'string' &&
    typeof value.channel === 'string'
  );
}

export function isTrelloIntegration(value: unknown): value is { card_id: string; list_id: string } {
  return (
    isObject(value) &&
    typeof value.card_id === 'string' &&
    typeof value.list_id === 'string'
  );
}
```

### Advanced Type Guards

```typescript
// Narrowing with type guards
export function hasUserId<T>(obj: T): obj is T & { user_id: UserId } {
  return 'user_id' in obj && isValidUserId((obj as any).user_id);
}

export function hasTaskId<T>(obj: T): obj is T & { task_id: TaskId } {
  return 'task_id' in obj && isValidTaskId((obj as any).task_id);
}

export function hasBoardId<T>(obj: T): obj is T & { board_id: BoardId } {
  return 'board_id' in obj && isValidBoardId((obj as any).board_id);
}

// Result type guards
export function isSuccess<T>(result: Result<T>): result is { success: true; data: T } {
  return result.success === true;
}

export function isError<E>(result: Result<unknown, E>): result is { success: false; error: E } {
  return result.success === false;
}

// API response type guards
export function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  return (
    isObject(value) &&
    typeof value.success === 'boolean' &&
    (value.data === undefined || true) && // Data type depends on T
    (value.error === undefined || isApiError(value.error)) &&
    (value.meta === undefined || isResponseMeta(value.meta)) &&
    (value.warnings === undefined || 
     (Array.isArray(value.warnings) && value.warnings.every(isApiWarning)))
  );
}

export function isApiError(value: unknown): value is ApiError {
  return (
    isObject(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.timestamp === 'string' &&
    typeof value.request_id === 'string' &&
    (value.details === undefined || true) &&
    (value.field === undefined || typeof value.field === 'string') &&
    (value.stack === undefined || typeof value.stack === 'string') &&
    (value.suggestions === undefined || 
     (Array.isArray(value.suggestions) && value.suggestions.every(s => typeof s === 'string'))) &&
    (value.retry_after === undefined || 
     (typeof value.retry_after === 'number' && value.retry_after >= 0))
  );
}

export function isResponseMeta(value: unknown): value is ResponseMeta {
  return (
    isObject(value) &&
    typeof value.timestamp === 'string' &&
    typeof value.request_id === 'string' &&
    (value.total === undefined || 
     (typeof value.total === 'number' && value.total >= 0)) &&
    (value.page === undefined || 
     (typeof value.page === 'number' && value.page >= 1)) &&
    (value.limit === undefined || 
     (typeof value.limit === 'number' && value.limit >= 1)) &&
    (value.hasMore === undefined || typeof value.hasMore === 'boolean') &&
    (value.version === undefined || typeof value.version === 'string') &&
    (value.cache === undefined || isCacheInfo(value.cache)) &&
    (value.rate_limit === undefined || isRateLimitInfo(value.rate_limit))
  );
}

export function isApiWarning(value: unknown): value is ApiWarning {
  return (
    isObject(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    (value.field === undefined || typeof value.field === 'string') &&
    (value.suggestion === undefined || typeof value.suggestion === 'string')
  );
}

// Database row type guards
export function isTaskRow(value: unknown): value is TaskRow {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (value.description === null || typeof value.description === 'string') &&
    typeof value.board_id === 'string' &&
    typeof value.column_id === 'string' &&
    typeof value.status === 'string' &&
    typeof value.priority === 'number' &&
    (value.assignee === null || typeof value.assignee === 'string') &&
    typeof value.reporter === 'string' &&
    (value.due_date === null || typeof value.due_date === 'string') &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    typeof value.position === 'number' &&
    typeof value.progress === 'number' &&
    (value.estimated_hours === null || typeof value.estimated_hours === 'number') &&
    (value.actual_hours === null || typeof value.actual_hours === 'number') &&
    (value.archived === 0 || value.archived === 1) &&
    (value.parent_id === null || typeof value.parent_id === 'string') &&
    (value.metadata === null || typeof value.metadata === 'string')
  );
}

// Form validation type guards
export function isFormField<T>(value: unknown): value is FormField<T> {
  return (
    isObject(value) &&
    'value' in value &&
    typeof value.touched === 'boolean' &&
    typeof value.valid === 'boolean' &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

export function isFormState<T>(value: unknown): value is FormState<T> {
  return (
    isObject(value) &&
    typeof value.isValid === 'boolean' &&
    typeof value.isDirty === 'boolean' &&
    typeof value.isSubmitting === 'boolean' &&
    Object.values(value).every(val => 
      val === value.isValid || 
      val === value.isDirty || 
      val === value.isSubmitting || 
      isFormField(val)
    )
  );
}

// Loading state type guards
export function isLoadingState<T>(value: unknown): value is LoadingState<T> {
  if (!isObject(value) || !('status' in value)) {
    return false;
  }
  
  switch (value.status) {
    case 'idle':
      return true;
    case 'loading':
      return 'taskId' in value && isValidTaskId(value.taskId);
    case 'success':
      return 'task' in value && isTask(value.task);
    case 'error':
      return 'error' in value && value.error instanceof Error;
    default:
      return false;
  }
}

// Utility type guards
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isNull(value: unknown): value is null {
  return value === null;
}

export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

// Usage examples
const result = await someOperation();
if (isSuccess(result)) {
  console.log(result.data); // TypeScript knows data exists
} else {
  console.error(result.error); // TypeScript knows error exists
}

const unknownValue: unknown = getDataFromExternalSource();
if (isTask(unknownValue)) {
  // TypeScript now knows unknownValue is a Task
  console.log(unknownValue.title);
  console.log(unknownValue.status);
}

const formData = getFormData();
if (isFormState<Task>(formData)) {
  // TypeScript knows this is a valid form state
  if (formData.isValid) {
    submitForm(formData);
  }
}

// Validation with error handling
export function validateTask(task: unknown): Task {
  if (isTask(task)) {
    return task;
  }
  throw new Error('Invalid task data');
}

export function validateTaskArray(tasks: unknown[]): Task[] {
  const validTasks: Task[] = [];
  const errors: string[] = [];
  
  tasks.forEach((task, index) => {
    if (isTask(task)) {
      validTasks.push(task);
    } else {
      errors.push(`Invalid task at index ${index}`);
    }
  });
  
  if (errors.length > 0) {
    throw new Error(`Validation errors: ${errors.join(', ')}`);
  }
  
  return validTasks;
}
```

## Best Practices

### 1. Prefer Type Imports

```typescript
// Good: Use type imports for types
import type { Task, Board, User } from '@/types';
import type { Request, Response, NextFunction } from 'express';
import type { ComponentProps } from 'react';

// This ensures types are erased at runtime and improves tree-shaking
```

### 2. Use Branded Types for IDs

```typescript
// Good: Branded types prevent mixing IDs
function assignTask(taskId: TaskId, userId: UserId): Promise<void> {
  return taskService.assign(taskId, userId);
}

// Good: Type-safe ID validation
function getTask(id: unknown): Promise<Task> {
  if (!isValidTaskId(id)) {
    throw new Error('Invalid task ID');
  }
  return taskRepository.findById(id);
}

// Bad: String IDs can be mixed up
function assignTask(taskId: string, userId: string) { /* ... */ }
```

### 3. Avoid Type Assertions

```typescript
// Bad: Type assertion without validation
const task = JSON.parse(data) as Task;

// Bad: Unsafe type assertion
const user = response.data as User;

// Good: Validate and type guard
const parsed = JSON.parse(data);
if (isTask(parsed)) {
  const task: Task = parsed;
  // TypeScript knows task is valid
} else {
  throw new Error('Invalid task data');
}

// Good: Safe type assertion with validation
function safeAssert<T>(value: unknown, guard: (val: unknown) => val is T): T {
  if (guard(value)) {
    return value;
  }
  throw new Error('Type assertion failed');
}

const task = safeAssert(parsed, isTask);
```

### 4. Use Const Assertions

```typescript
// Good: Const assertion for literal types
const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked'] as const;
type TaskStatus = typeof TASK_STATUSES[number]; // 'todo' | 'in_progress' | 'done' | 'blocked'

const PRIORITIES = [1, 2, 3, 4, 5] as const;
type Priority = typeof PRIORITIES[number]; // 1 | 2 | 3 | 4 | 5

// Good: Const assertion for objects
const API_ENDPOINTS = {
  TASKS: '/api/v1/tasks',
  BOARDS: '/api/v1/boards',
  USERS: '/api/v1/users'
} as const;

// Bad: Mutable arrays/objects
const statuses = ['todo', 'in_progress', 'done'];
type Status = typeof statuses[number]; // string
```

### 5. Document Complex Types

```typescript
/**
 * Represents a task in various states of completion
 * @template TStatus - Specific status type for narrowing
 */
export interface Task<TStatus extends TaskStatus = TaskStatus> {
  /** Unique identifier for the task */
  id: TaskId;
  
  /** Current workflow status */
  status: TStatus;
  
  /** Human-readable task title */
  title: string;
  
  /** Optional detailed description */
  description?: string;
  
  /** Board this task belongs to */
  board_id: BoardId;
  
  /** Column within the board */
  column_id: ColumnId;
  
  /** Priority level (1-5, where 5 is highest) */
  priority: Priority;
  
  /** User assigned to this task (optional) */
  assignee?: UserId;
  
  /** User who created/reported the task */
  reporter: UserId;
  
  /** Optional deadline */
  due_date?: Date;
  
  /** Creation timestamp */
  created_at: Date;
  
  /** Last modification timestamp */
  updated_at: Date;
  
  /** Order within column */
  position: number;
  
  /** Completion percentage (0-100) */
  progress: number;
  
  /** Estimated time in hours */
  estimated_hours?: number;
  
  /** Actual time spent in hours */
  actual_hours?: number;
  
  /** Soft delete flag */
  archived: boolean;
  
  /** Parent task for subtasks */
  parent_id?: TaskId;
  
  /** Extended properties and metadata */
  metadata?: TaskMetadata;
}

/**
 * Type guard for completed tasks
 * @param task - Task to check
 * @returns True if task is completed
 */
export function isCompletedTask(task: Task): task is Task<TaskStatus.DONE> {
  return task.status === TaskStatus.DONE;
}

/**
 * Type guard for tasks in progress
 * @param task - Task to check
 * @returns True if task is in progress
 */
export function isInProgressTask(task: Task): task is Task<TaskStatus.IN_PROGRESS> {
  return task.status === TaskStatus.IN_PROGRESS;
}
```

### 6. Use Discriminated Unions for State Management

```typescript
// Good: Discriminated union for loading states
export type LoadingState<T> = 
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

// Good: Type-safe state handling
function handleLoadingState<T>(state: LoadingState<T>) {
  switch (state.status) {
    case 'idle':
      return 'Ready to load';
    case 'loading':
      return 'Loading...';
    case 'success':
      return `Loaded: ${state.data}`;
    case 'error':
      return `Error: ${state.error.message}`;
  }
}
```

### 7. Leverage Utility Types

```typescript
// Good: Use utility types for transformations
type CreateTaskRequest = Pick<Task, 'title' | 'description' | 'board_id' | 'priority'>;
type UpdateTaskRequest = Partial<Omit<Task, 'id' | 'created_at' | 'updated_at'>>;
type TaskSummary = Pick<Task, 'id' | 'title' | 'status' | 'priority' | 'assignee'>;

// Good: Conditional types for API responses
type ApiResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

// Good: Mapped types for form fields
type TaskFormFields = {
  [K in keyof CreateTaskRequest]: FormField<CreateTaskRequest[K]>;
};
```

### 8. Implement Comprehensive Type Guards

```typescript
// Good: Comprehensive validation
export function isTask(value: unknown): value is Task {
  return (
    isObject(value) &&
    isValidTaskId(value.id) &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    value.title.length <= 255 &&
    // ... comprehensive validation
  );
}

// Good: Validation with error details
export function validateTask(task: unknown): { valid: true; task: Task } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  
  if (!isObject(task)) {
    errors.push('Task must be an object');
    return { valid: false, errors };
  }
  
  if (!isValidTaskId(task.id)) {
    errors.push('Invalid task ID');
  }
  
  if (typeof task.title !== 'string' || task.title.length === 0) {
    errors.push('Title is required and must be a string');
  }
  
  // ... more validation
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  return { valid: true, task: task as Task };
}
```

### 9. Use Generic Constraints

```typescript
// Good: Generic constraints for type safety
export function findById<T extends { id: string }>(
  items: T[],
  id: string
): T | undefined {
  return items.find(item => item.id === id);
}

// Good: Constrained utility types
export type WithId<T> = T & { id: string };
export type WithoutId<T> = Omit<T, 'id'>;

// Good: Conditional utility types
export type ApiRequest<T> = T extends { id: string } 
  ? Omit<T, 'id' | 'created_at' | 'updated_at'>
  : T;
```

### 10. Organize Types by Domain

```typescript
// Good: Domain-specific type organization
// entities.ts - Core business entities
export interface Task { /* ... */ }
export interface Board { /* ... */ }
export interface User { /* ... */ }

// api.ts - API contract types
export interface ApiResponse<T> { /* ... */ }
export interface CreateTaskRequest { /* ... */ }

// database.ts - Database types
export interface TaskRow { /* ... */ }
export function mapTaskRowToTask(row: TaskRow): Task { /* ... */ }

// branded.ts - Branded types
export type TaskId = Brand<string, 'TaskId'>;
export const TaskId = (id: string): TaskId => /* ... */;
```

## Related Modules

- [Database Module](./database.md) - Database schema and types
- [API Module](./api.md) - API request/response types
- [Services Module](./services.md) - Service layer types
- [Utils Module](./utils.md) - Type guard implementations
- [Middleware Module](./middleware.md) - Request/response types
- [WebSocket Module](./websocket.md) - Real-time communication types

## Testing Types

### Type Testing with tsd

```typescript
// Type testing with expect-type
import { expectType, expectError } from 'tsd';

// Test branded types
expectType<TaskId>(TaskId('550e8400-e29b-41d4-a716-446655440000'));
expectType<string>(TaskId('550e8400-e29b-41d4-a716-446655440000')); // Should pass - TaskId extends string

// Test type guards
const unknown: unknown = { id: '123', title: 'Test' };
if (isTask(unknown)) {
  expectType<Task>(unknown);
}

// Test utility types
type TestPartial = DeepPartial<Task>;
expectType<string | undefined>(({} as TestPartial).title);
expectType<TaskStatus | undefined>(({} as TestPartial).status);

// Test conditional types
type TestRequired = ConditionalRequired<Task, 'due_date'>;
expectType<Date>(({} as TestRequired).due_date);

// Test mapped types
type TestGetters = Getters<Task>;
expectType<() => TaskId>(({} as TestGetters).getId);
expectType<() => string>(({} as TestGetters).getTitle);

// Test error cases
expectError(TaskId('invalid-uuid')); // Should error for invalid UUID
expectError(assignTask('string', 'string')); // Should error for string instead of branded types
```

### Runtime Type Testing

```typescript
// Test type guards with Jest
describe('Type Guards', () => {
  describe('isTask', () => {
    it('should return true for valid task', () => {
      const validTask: Task = {
        id: TaskId('550e8400-e29b-41d4-a716-446655440000'),
        title: 'Test Task',
        board_id: BoardId('123e4567-e89b-12d3-a456-426614174000'),
        column_id: ColumnId('987fcdeb-51a2-43d1-9f12-345678901234'),
        status: TaskStatus.TODO,
        priority: 3,
        reporter: UserId('11111111-1111-1111-1111-111111111111'),
        created_at: new Date(),
        updated_at: new Date(),
        position: 0,
        progress: 0,
        archived: false
      };
      
      expect(isTask(validTask)).toBe(true);
    });

    it('should return false for invalid task', () => {
      const invalidTask = {
        id: 'invalid-id',
        title: '',
        status: 'invalid-status'
      };
      
      expect(isTask(invalidTask)).toBe(false);
    });
  });

  describe('isTaskArray', () => {
    it('should return true for array of valid tasks', () => {
      const tasks: Task[] = [/* valid tasks */];
      expect(isTaskArray(tasks)).toBe(true);
    });

    it('should return false for array with invalid tasks', () => {
      const tasks = [/* some valid, some invalid */];
      expect(isTaskArray(tasks)).toBe(false);
    });
  });
});
```

### Integration Testing

```typescript
// Test type integration
describe('Type Integration', () => {
  it('should map database row to domain entity', () => {
    const taskRow: TaskRow = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Test Task',
      description: 'Test Description',
      board_id: '123e4567-e89b-12d3-a456-426614174000',
      column_id: '987fcdeb-51a2-43d1-9f12-345678901234',
      status: 'todo',
      priority: 3,
      assignee: null,
      reporter: '11111111-1111-1111-1111-111111111111',
      due_date: null,
      created_at: '2023-01-01T00:00:00.000Z',
      updated_at: '2023-01-01T00:00:00.000Z',
      position: 0,
      progress: 0,
      estimated_hours: null,
      actual_hours: null,
      archived: 0,
      parent_id: null,
      metadata: null
    };

    const task = mapTaskRowToTask(taskRow);
    
    expect(isTask(task)).toBe(true);
    expect(task.id).toBe(TaskId('550e8400-e29b-41d4-a716-446655440000'));
    expect(task.title).toBe('Test Task');
    expect(task.status).toBe(TaskStatus.TODO);
  });

  it('should handle API responses correctly', () => {
    const apiResponse: ApiResponse<Task> = {
      success: true,
      data: /* valid task */,
      meta: {
        timestamp: new Date().toISOString(),
        request_id: 'test-request-id'
      }
    };

    expect(isApiResponse(apiResponse)).toBe(true);
    
    if (isSuccess(apiResponse)) {
      expect(isTask(apiResponse.data)).toBe(true);
    }
  });
});
```

### Performance Testing

```typescript
// Test type guard performance
describe('Type Guard Performance', () => {
  it('should validate large arrays efficiently', () => {
    const largeArray = Array.from({ length: 10000 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i}`,
      // ... other required fields
    }));

    const start = performance.now();
    const isValid = isTaskArray(largeArray);
    const end = performance.now();

    expect(end - start).toBeLessThan(100); // Should complete within 100ms
    expect(isValid).toBe(false); // Should be false for invalid data
  });
});
```