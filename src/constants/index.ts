/**
 * @fileoverview Centralized constants for the MCP Kanban application
 * @lastmodified 2025-07-28T03:00:00Z
 *
 * Features: Application-wide constants for maintainability and consistency
 * Main APIs: Priority mapping, timing values, limits, defaults
 * Constraints: All values should be documented with reasoning
 * Patterns: Organized by category, exported as const assertions for type safety
 */

// ============================================================================
// PRIORITY SYSTEM
// ============================================================================

/**
 * Priority labels used throughout the application
 * P1 = Highest priority, P5 = Lowest priority
 */
export const PRIORITY_LABELS = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;

/**
 * Priority value mapping for sorting and scoring
 * Higher numeric values indicate higher priority
 */
export const PRIORITY_MAPPING = {
  P1: 10, // Critical/Urgent
  P2: 8, // High priority
  P3: 5, // Medium priority
  P4: 3, // Low priority
  P5: 1, // Minimal priority
} as const;

/**
 * Priority order for sorting (ascending order)
 * Used for display ordering in lists
 */
export const PRIORITY_ORDER = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  P5: 5,
} as const;

/**
 * Priority scoring thresholds for task classification
 */
export const PRIORITY_THRESHOLDS = {
  CRITICAL: 8, // Tasks with priority >= 8 are critical
  HIGH: 6, // Tasks with priority >= 6 are high priority
  MEDIUM: 4, // Tasks with priority >= 4 are medium priority
  LOW: 1, // Tasks with priority >= 1 are low priority
} as const;

/**
 * Priority scoring bonuses for various conditions
 */
export const PRIORITY_SCORING = {
  BASE_MULTIPLIER: 10, // Base priority * 10 for initial score
  OVERDUE_BONUS: 50, // Bonus for overdue tasks
  DUE_SOON_BONUS: 30, // Bonus for tasks due within 24 hours
  DUE_THIS_WEEK_BONUS: 15, // Bonus for tasks due within 7 days
  IN_PROGRESS_BONUS: 20, // Bonus for tasks already in progress
  SKILL_MATCH_BONUS: 10, // Bonus for skill context matches
  AGE_MULTIPLIER: 0.5, // Task age multiplier for older tasks
  MAX_AGE_BONUS: 10, // Maximum bonus for task age
} as const;

/**
 * Time thresholds for priority calculations
 */
export const TIME_THRESHOLDS = {
  OVERDUE_DAYS: 0, // Tasks overdue (negative due date)
  DUE_SOON_DAYS: 1, // Due within 24 hours
  DUE_THIS_WEEK_DAYS: 7, // Due within a week
  OLD_TASK_DAYS: 7, // Tasks older than 7 days get age bonus
  STALE_TASK_DAYS: 14, // Tasks older than 14 days get priority boost
} as const;

/**
 * Milliseconds per day for date calculations
 */
export const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

/**
 * Default intervals and timeouts
 */
export const TIMING = {
  /** Default auto-refresh interval for dashboard (30 seconds) */
  DEFAULT_REFRESH_INTERVAL: 30 * 1000,

  /** WebSocket ping interval (15 seconds) */
  WEBSOCKET_PING_INTERVAL: 15 * 1000,

  /** WebSocket connection timeout (30 seconds) */
  WEBSOCKET_TIMEOUT: 30 * 1000,

  /** Rate limiting cleanup interval (5 minutes) */
  RATE_LIMIT_CLEANUP_INTERVAL: 5 * 60 * 1000,

  /** Statistics collection interval (5 minutes) */
  STATS_COLLECTION_INTERVAL: 5 * 60 * 1000,

  /** Default request timeout (30 seconds) */
  DEFAULT_REQUEST_TIMEOUT: 30 * 1000,

  /** Database query timeout (10 seconds) */
  DATABASE_QUERY_TIMEOUT: 10 * 1000,

  /** Backup retention period (30 days) */
  BACKUP_RETENTION_DAYS: 30,
} as const;

// ============================================================================
// SIZE AND LIMIT CONSTANTS
// ============================================================================

/**
 * Application limits and constraints
 */
export const LIMITS = {
  /** Maximum file size for uploads (1MB) */
  MAX_FILE_SIZE: 1024 * 1024,

  /** Maximum task title length */
  MAX_TITLE_LENGTH: 255,

  /** Maximum task description length */
  MAX_DESCRIPTION_LENGTH: 2000,

  /** Maximum number of tasks per board */
  MAX_TASKS_PER_BOARD: 1000,

  /** Maximum number of columns per board */
  MAX_COLUMNS_PER_BOARD: 20,

  /** Maximum number of subtasks per task */
  MAX_SUBTASKS_PER_TASK: 50,

  /** Default page size for pagination */
  DEFAULT_PAGE_SIZE: 25,

  /** Maximum page size for pagination */
  MAX_PAGE_SIZE: 100,

  /** Maximum retry attempts for operations */
  MAX_RETRY_ATTEMPTS: 3,

  /** Maximum function length (lines) for code quality */
  MAX_FUNCTION_LENGTH: 50,

  /** Maximum cyclomatic complexity */
  MAX_COMPLEXITY: 10,
} as const;

// ============================================================================
// NETWORK DEFAULTS
// ============================================================================

/**
 * Default network configuration
 */
export const NETWORK_DEFAULTS = {
  /** Default HTTP port */
  DEFAULT_PORT: 3000,

  /** Default host */
  DEFAULT_HOST: 'localhost',

  /** Default WebSocket port offset */
  WEBSOCKET_PORT_OFFSET: 1,

  /** Default base URL for local development */
  DEFAULT_BASE_URL: 'http://localhost:3000',
} as const;

// ============================================================================
// PLATFORM-SPECIFIC DEFAULTS
// ============================================================================

/**
 * Cloud platform specific configurations
 */
export const PLATFORM_DEFAULTS = {
  replit: {
    port: 3000,
    host: '0.0.0.0',
  },
  codespaces: {
    port: 3000,
    host: '0.0.0.0',
  },
  gitpod: {
    port: 3000,
    host: '0.0.0.0',
  },
  local: {
    port: 3000,
    host: 'localhost',
  },
} as const;

// ============================================================================
// HTTP METHOD CONSTANTS
// ============================================================================

/**
 * HTTP methods for API requests
 */
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',  
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
} as const;

/**
 * Common HTTP headers
 */
export const HTTP_HEADERS = {
  CONTENT_TYPE: 'Content-Type',
  AUTHORIZATION: 'Authorization',
  USER_AGENT: 'User-Agent',
  X_API_KEY: 'X-API-Key',
  ACCEPT: 'Accept',
  CACHE_CONTROL: 'Cache-Control',
} as const;

/**
 * Content-Type values
 */
export const CONTENT_TYPES = {
  JSON: 'application/json',
  FORM_DATA: 'multipart/form-data',
  URL_ENCODED: 'application/x-www-form-urlencoded',
  TEXT_PLAIN: 'text/plain',
} as const;

// ============================================================================
// STATUS CONSTANTS
// ============================================================================

/**
 * Task status values
 */
export const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled',
} as const;

/**
 * Board status values
 */
export const BOARD_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  TEMPLATE: 'template',
} as const;

// ============================================================================
// UI CONSTANTS
// ============================================================================

/**
 * User interface defaults
 */
export const UI_DEFAULTS = {
  /** Default dashboard theme */
  DEFAULT_THEME: 'dark',

  /** Default dashboard layout */
  DEFAULT_LAYOUT: 'overview',

  /** Available dashboard layouts */
  LAYOUTS: ['overview', 'velocity', 'personal'] as const,

  /** Progress bar width for CLI */
  PROGRESS_BAR_WIDTH: 40,

  /** Spinner animation speed (ms) */
  SPINNER_SPEED: 100,
} as const;

// ============================================================================
// ERROR CONSTANTS
// ============================================================================

/**
 * Exit codes for CLI commands
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_USAGE: 2,
  PERMISSION_DENIED: 3,
  NOT_FOUND: 4,
  NETWORK_ERROR: 5,
  DATABASE_ERROR: 6,
} as const;

/**
 * Error message prefixes for consistency
 */
export const ERROR_PREFIXES = {
  VALIDATION: 'Validation Error',
  DATABASE: 'Database Error',
  NETWORK: 'Network Error',
  PERMISSION: 'Permission Error',
  NOT_FOUND: 'Not Found',
  GENERAL: 'Error',
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Type definitions derived from constants
 */
export type PriorityLabel = (typeof PRIORITY_LABELS)[number];
export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];
export type BoardStatus = (typeof BOARD_STATUS)[keyof typeof BOARD_STATUS];
export type DashboardLayout = (typeof UI_DEFAULTS.LAYOUTS)[number];
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Helper functions for working with constants
 */
export const VALIDATORS = {
  isPriorityLabel: (value: string): value is PriorityLabel =>
    PRIORITY_LABELS.includes(value as PriorityLabel),

  isTaskStatus: (value: string): value is TaskStatus =>
    Object.values(TASK_STATUS).includes(value as TaskStatus),

  isBoardStatus: (value: string): value is BoardStatus =>
    Object.values(BOARD_STATUS).includes(value as BoardStatus),

  isDashboardLayout: (value: string): value is DashboardLayout =>
    UI_DEFAULTS.LAYOUTS.includes(value as DashboardLayout),
} as const;
