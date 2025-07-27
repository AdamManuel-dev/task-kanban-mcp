/**
 * Type definitions for CLI API client
 */

import type { Task, Board, Note, Tag } from '../types';
import type { ConfigManager } from './config';
import type { ApiClient } from './client';
import type { OutputFormatter } from './formatter';

// Global CLI components interface
export interface CliComponents {
  config: ConfigManager;
  apiClient: ApiClient;
  formatter: OutputFormatter;
}

// Global type declaration to extend Node.js global
declare global {
  // eslint-disable-next-line no-var, vars-on-top
  var cliComponents: CliComponents;
}

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

// Extended health response for API consistency
export interface HealthApiResponse extends ApiResponse<HealthResponse> {
  data: HealthResponse;
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

// Backup-related types
export interface BackupInfo {
  id: string;
  name: string;
  size: number;
  compressed: boolean;
  verified: boolean;
  createdAt: string;
  description?: string;
  compress?: boolean; // For requests
  verify?: boolean; // For requests
}

export interface BackupResponse extends ApiResponse<BackupInfo> {
  data: BackupInfo;
}

export interface BackupsResponse extends ApiResponse<BackupInfo[]> {
  data: BackupInfo[];
  count?: number;
}

export interface RestoreResult {
  success: boolean;
  message?: string;
  backupsApplied?: number;
}

export interface VerificationResult {
  valid: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface BackupSchedule {
  id: string;
  name: string;
  cronExpression: string;
  backupType: 'full' | 'incremental';
  description?: string;
  retentionDays: number;
  compressionEnabled: boolean;
  verificationEnabled: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun?: string;
  nextRun?: string;
}

export interface ScheduleResponse extends ApiResponse<BackupSchedule> {
  data: BackupSchedule;
}

export interface SchedulesResponse extends ApiResponse<BackupSchedule[]> {
  data: BackupSchedule[];
  count?: number;
}

// Database-related types
export interface DatabaseOptimizationResult {
  operation: string;
  duration: string;
  before: string;
  after: string;
  improvement: string;
}

export interface DatabaseVacuumResult {
  sizeBefore: string;
  sizeAfter: string;
  spaceReclaimed: string;
  duration: string;
}

export interface DatabaseAnalysisResult {
  table: string;
  rowCount: number;
  indexCount: number;
  avgRowSize: string;
  totalSize: string;
}

export interface DatabaseStats {
  general?: Array<{
    metric: string;
    value: string;
  }>;
  tables?: Array<{
    name: string;
    rowCount: number;
    size: string;
    lastModified: string;
  }>;
  indexes?: Array<{
    name: string;
    table: string;
    size: string;
    usage: string;
  }>;
  performance?: Array<{
    metric: string;
    value: string;
    unit: string;
  }>;
}

export interface DatabaseIntegrityResult {
  healthy: boolean;
  check: string;
  status: string;
  details: string;
  issues?: Array<{
    type: string;
    severity: string;
    message: string;
    suggestion: string;
  }>;
}

export interface DatabaseRepairResult {
  operation: string;
  status: string;
  recordsFixed: number;
  backupCreated: boolean;
}

export interface Migration {
  name: string;
  version: string;
  status: 'pending' | 'applied' | 'failed';
  appliedAt?: string;
  filename?: string;
  createdAt?: string;
}

export interface MigrationResult {
  migration: string;
  status: string;
  duration: string;
}

// Export/Import-related types
export interface ExportParams {
  format: 'json' | 'csv';
  includeBoards: boolean;
  includeTasks: boolean;
  includeTags: boolean;
  includeNotes: boolean;
  boardIds?: string[];
  [key: string]: string | boolean | string[] | undefined;
}

export interface ExportResponse {
  data: unknown;
  filePath?: string;
  itemCount?: number;
}

export interface ImportValidationResponse {
  valid: boolean;
  wouldImport: number;
  wouldSkip: number;
  errors: string[];
}

export interface ImportResponse {
  imported: number;
  skipped: number;
  errors: string[];
}

// Context data structure
export interface ContextData {
  activeTasks?: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
  }>;
  blockedTasks?: Array<{
    id: string;
    title: string;
    blockedBy: string;
  }>;
  upcomingDeadlines?: Array<{
    id: string;
    title: string;
    dueDate: string;
    priority: string;
  }>;
  recentActivity?: Array<{
    id: string;
    action: string;
    timestamp: string;
    details: string;
  }>;
  recommendations?: string[];
  insights?: string[];
  summary?: string | Record<string, unknown>;
  statistics?: Record<string, unknown>;
  productivityInsights?: string[];
  bottlenecks?: Array<{ type: string; description: string; impact: string }>;
  actionableRecommendations?: string[];
  [key: string]: unknown; // Allow other dynamic properties
}

// Additional response types for missing operations
export interface ContextResponse extends ApiResponse<ContextData> {
  data: ContextData;
}

export interface DatabaseStatsResponse extends ApiResponse<DatabaseStats> {
  data: DatabaseStats;
}

export interface DatabaseHealthResponse
  extends ApiResponse<{ healthy: boolean; issues?: string[] }> {
  data: { healthy: boolean; issues?: string[] };
}

export interface MigrationResponse extends ApiResponse<Migration> {
  data: Migration;
}

export interface MigrationsResponse extends ApiResponse<Migration[]> {
  data: Migration[];
}

export interface RestoreResponse extends ApiResponse<RestoreResult> {
  data: RestoreResult;
}

export interface VerificationResponse extends ApiResponse<VerificationResult> {
  data: VerificationResult;
}

// Union type for all possible API responses
export type AnyApiResponse =
  | HealthApiResponse
  | TaskResponse
  | TasksResponse
  | BoardResponse
  | BoardsResponse
  | NoteResponse
  | NotesResponse
  | TagResponse
  | TagsResponse
  | BackupResponse
  | BackupsResponse
  | ScheduleResponse
  | SchedulesResponse
  | ContextResponse
  | DatabaseStatsResponse
  | DatabaseHealthResponse
  | MigrationResponse
  | MigrationsResponse
  | RestoreResponse
  | VerificationResponse
  | ExportResponse
  | ErrorResponse
  | ApiResponse;
