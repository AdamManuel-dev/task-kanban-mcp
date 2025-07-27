/**
 * TypeScript type definitions for the MCP Kanban system
 *
 * @module types
 * @description Core type definitions for all entities in the MCP Kanban system.
 * These types are used throughout the application for type safety and consistency.
 */

/**
 * Represents a Kanban board
 *
 * @interface Board
 * @description A board is the top-level container for organizing tasks into columns.
 * Each board can have multiple columns and tasks.
 *
 * @example
 * ```typescript
 * const board: Board = {
 *   id: '123e4567-e89b-12d3-a456-426614174000',
 *   name: 'Development Sprint',
 *   description: 'Q1 2024 sprint board',
 *   color: '#2196F3',
 *   created_at: new Date('2024-01-01'),
 *   updated_at: new Date('2024-01-15'),
 *   archived: false
 * };
 * ```
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

/**
 * Represents a column within a Kanban board
 *
 * @interface Column
 * @description Columns organize tasks into different stages of work (e.g., To Do, In Progress, Done).
 * Each column belongs to a specific board and has a position for ordering.
 *
 * @property {number} [wip_limit] - Optional Work In Progress limit to prevent overloading
 */
export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  wip_limit?: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Represents a task within the Kanban system
 *
 * @interface Task
 * @description A task is the fundamental unit of work in the system. Tasks belong to a board
 * and column, and can have various properties like priority, status, and dependencies.
 *
 * @property {string} status - Current status of the task
 * @property {number} priority - Priority level from 0 (lowest) to 10 (highest)
 * @property {string} [metadata] - JSON string for storing custom task data
 */
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
  progress?: number | undefined;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date | undefined;
  archived: boolean;
  metadata?: string | undefined;
}

/**
 * Represents a dependency relationship between tasks
 *
 * @interface TaskDependency
 * @description Defines how tasks relate to each other. A task can block another task,
 * relate to it, or be a duplicate of it.
 *
 * @property {'blocks' | 'relates_to' | 'duplicates'} dependency_type - The type of relationship
 */
export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: 'blocks' | 'relates_to' | 'duplicates';
  created_at: Date;
}

/**
 * Represents a note attached to a task
 *
 * @interface Note
 * @description Notes provide additional context, updates, or information about a task.
 * They can be categorized and pinned for importance.
 *
 * @property {boolean} pinned - Whether the note is pinned to the top
 */
export interface Note {
  id: string;
  task_id: string;
  content: string;
  category: 'general' | 'progress' | 'blocker' | 'decision' | 'question';
  pinned: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Represents a tag for categorizing tasks
 *
 * @interface Tag
 * @description Tags help organize and filter tasks. They support hierarchical structure
 * through parent-child relationships.
 *
 * @property {string} color - Hex color code for visual identification
 * @property {string} [parent_tag_id] - ID of parent tag for hierarchical organization
 */
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

/**
 * Board with aggregated statistics
 *
 * @interface BoardWithStats
 * @extends {Board}
 * @description Extends the base Board interface with computed statistics about
 * tasks and columns within the board.
 */
export interface BoardWithStats extends Board {
  taskCount: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  columnCount: number;
}

/**
 * Standard error interface for service layer errors
 *
 * @interface ServiceError
 * @extends {Error}
 * @description Provides a consistent error structure across the application with
 * HTTP status codes and additional details for debugging.
 *
 * @example
 * ```typescript
 * class NotFoundError extends Error implements ServiceError {
 *   code = 'NOT_FOUND';
 *   statusCode = 404;
 *   constructor(resource: string, id: string) {
 *     super(`${String(resource)} with ID ${String(id)} not found`);
 *   }
 * }
 * ```
 */
export interface ServiceError extends Error {
  code: string;
  statusCode: number;
  details?: string | number | boolean | null | undefined | { [key: string]: unknown } | unknown[];
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

/**
 * Tag with usage statistics
 *
 * @interface TagWithStats
 * @extends {Tag}
 * @description Extends the base Tag interface with usage statistics and metrics
 * for understanding tag popularity and relationships.
 *
 * @property {number} task_count - Number of tasks using this tag
 * @property {number} usage_count - Total number of times tag has been applied
 * @property {Date} [last_used] - When the tag was last applied to a task
 * @property {number} child_count - Number of child tags in hierarchy
 */
export interface TagWithStats extends Tag {
  task_count: number;
  usage_count: number;
  last_used?: Date | undefined;
  child_count: number;
}

/**
 * Critical path analysis result
 *
 * @interface CriticalPathResult
 * @description Results from critical path analysis showing the longest chain
 * of dependent tasks that determines the minimum project completion time.
 */
export interface CriticalPathResult {
  critical_path: Task[];
  total_duration: number;
  starting_tasks: Task[];
  ending_tasks: Task[];
  bottlenecks: Task[];
  dependency_count: number;
}

/**
 * Task impact analysis result
 *
 * @interface TaskImpactAnalysis
 * @description Analysis of how changes to a task would impact other tasks
 * in the project, including direct and indirect dependencies.
 */
export interface TaskImpactAnalysis {
  task: Task;
  directly_impacted: Task[];
  indirectly_impacted: Task[];
  total_impacted_count: number;
  upstream_dependencies: Task[];
  impact_score: number;
  risk_level: 'low' | 'medium' | 'high';
}

/**
 * Subtask weight configuration for weighted progress calculation
 *
 * @interface SubtaskWeight
 * @description Defines how much weight a specific subtask contributes to parent task progress.
 * Allows for different weighting strategies based on effort, priority, or custom values.
 */
export interface SubtaskWeight {
  subtask_id: string;
  weight_factor: number;
  weight_type: 'hours' | 'priority' | 'custom' | 'equal';
  custom_weight?: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Completion rule configuration for parent tasks
 *
 * @interface CompletionRule
 * @description Defines how parent task completion is determined based on subtask completion.
 * Supports different strategies like requiring all subtasks, percentage thresholds, or critical subtasks only.
 */
export interface CompletionRule {
  id: string;
  parent_task_id: string;
  rule_type: 'all_complete' | 'percentage_threshold' | 'critical_only' | 'weighted_threshold';
  threshold?: number;
  critical_subtasks?: string[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Enhanced progress calculation result
 *
 * @interface ProgressCalculationResult
 * @description Detailed result of parent task progress calculation including breakdown
 * by subtask and weighting factors applied.
 */
export interface ProgressCalculationResult {
  parent_task_id: string;
  calculated_progress: number;
  subtask_breakdown: Array<{
    subtask_id: string;
    title: string;
    status: Task['status'];
    individual_progress: number;
    weight_factor: number;
    weighted_contribution: number;
  }>;
  total_weight: number;
  completion_rule?: CompletionRule;
  auto_complete_eligible: boolean;
}

/**
 * Subtask hierarchy information
 *
 * @interface SubtaskHierarchy
 * @description Represents the hierarchical structure of subtasks with depth and parent relationships.
 */
export interface SubtaskHierarchy {
  task_id: string;
  parent_task_id?: string;
  depth: number;
  path: string[];
  children: SubtaskHierarchy[];
  total_descendants: number;
}
