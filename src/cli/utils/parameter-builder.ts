/**
 * Type-safe parameter building utilities
 * Eliminates the need for Record<string, any> and bracket notation
 */

import type {
  SearchTasksParams,
  SearchNotesParams,
  BackupParams,
  RealtimeSubscriptionParams,
  DatabaseStatsParams,
  ExportQueryParams,
  AdvancedSearchParams,
} from '../types';

/**
 * Build search tasks parameters safely
 */
export function buildSearchTasksParams(options: {
  board?: string;
  status?: string;
  tags?: string;
  assignee?: string;
  priority?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  order?: string;
}): SearchTasksParams {
  const params: SearchTasksParams = {};

  // Use object spread with conditional properties - much cleaner!
  return {
    ...params,
    ...(options.board && { board: options.board }),
    ...(options.status && { status: options.status }),
    ...(options.tags && { tags: options.tags }),
    ...(options.assignee && { assignee: options.assignee }),
    ...(options.priority && { priority: options.priority }),
    ...(options.search && { search: options.search }),
    ...(options.limit && { limit: String(options.limit) }),
    ...(options.offset && { offset: String(options.offset) }),
    ...(options.sort && { sort: options.sort }),
    ...(options.order && { order: options.order }),
  };
}

/**
 * Build search notes parameters safely
 */
export function buildSearchNotesParams(options: {
  category?: string;
  limit?: number;
  search?: string;
}): SearchNotesParams {
  return {
    ...(options.category && { category: options.category }),
    ...(options.limit && { limit: String(options.limit) }),
    ...(options.search && { search: options.search }),
  };
}

/**
 * Build backup parameters safely
 */
export function buildBackupParams(options: {
  compress?: boolean;
  encrypt?: boolean;
  destination?: string;
}): BackupParams {
  return {
    ...(options.compress && { compress: 'true' }),
    ...(options.encrypt && { encrypt: 'true' }),
    ...(options.destination && { destination: options.destination }),
  };
}

/**
 * Build realtime subscription parameters safely
 */
export function buildRealtimeParams(options: {
  board?: string;
  task?: string;
  events?: string[];
}): RealtimeSubscriptionParams {
  return {
    ...(options.board && { board: options.board }),
    ...(options.task && { task: options.task }),
    ...(options.events && { events: options.events }),
  };
}

/**
 * Build database stats parameters safely
 */
export function buildDatabaseStatsParams(options: {
  tables?: boolean;
  indexes?: boolean;
  performance?: boolean;
}): DatabaseStatsParams {
  return {
    ...(options.tables && { tables: 'true' }),
    ...(options.indexes && { indexes: 'true' }),
    ...(options.performance && { performance: 'true' }),
  };
}

/**
 * Build export parameters safely
 */
export function buildExportParams(options: {
  anonymize?: boolean;
  anonymizationOptions?: object;
}): ExportQueryParams {
  return {
    ...(options.anonymize && { anonymize: 'true' }),
    ...(options.anonymizationOptions && {
      anonymizationOptions: JSON.stringify(options.anonymizationOptions),
    }),
  };
}

/**
 * Build advanced search parameters safely
 */
export function buildAdvancedSearchParams(options: {
  title?: string;
  description?: string;
  tags?: string;
  status?: string;
  priorityMin?: number;
  priorityMax?: number;
  createdAfter?: string;
  createdBefore?: string;
  dueAfter?: string;
  dueBefore?: string;
}): AdvancedSearchParams {
  return {
    ...(options.title && { title: options.title }),
    ...(options.description && { description: options.description }),
    ...(options.tags && { tags: options.tags }),
    ...(options.status && { status: options.status }),
    ...(options.priorityMin && { priorityMin: String(options.priorityMin) }),
    ...(options.priorityMax && { priorityMax: String(options.priorityMax) }),
    ...(options.createdAfter && { createdAfter: options.createdAfter }),
    ...(options.createdBefore && { createdBefore: options.createdBefore }),
    ...(options.dueAfter && { dueAfter: options.dueAfter }),
    ...(options.dueBefore && { dueBefore: options.dueBefore }),
  };
}

/**
 * Generic parameter builder for any type
 */
export function buildParams<T extends Record<string, any>>(
  options: Partial<T>,
  transforms?: Partial<Record<keyof T, (value: any) => string>>
): Record<string, string> {
  const params: Record<string, string> = {};

  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      const transform = transforms?.[key as keyof T];
      params[key] = transform ? transform(value) : String(value);
    }
  });

  return params;
}
