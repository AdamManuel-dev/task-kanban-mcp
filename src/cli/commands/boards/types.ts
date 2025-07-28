/**
 * @fileoverview Types for board CLI commands
 * @lastmodified 2025-07-28T04:00:00Z
 *
 * Features: Shared interfaces for board command options and data structures
 * Main APIs: Board command option interfaces, data types
 * Constraints: Maintains compatibility with existing board operations
 * Patterns: Option interfaces, data transfer objects
 */

import type { Task, Column } from '../../../types';

export interface ListBoardOptions {
  active?: boolean;
  archived?: boolean;
}

export interface ShowBoardOptions {
  tasks?: boolean;
  stats?: boolean;
}

export interface CreateBoardOptions {
  name?: string;
  description?: string;
  template?: string;
  interactive?: boolean;
  clone?: string;
}

export interface UpdateBoardOptions {
  name?: string;
  description?: string;
  interactive?: boolean;
}

export interface ViewBoardOptions {
  refresh?: string;
  autoRefresh?: boolean;
  fullscreen?: boolean;
}

export interface BoardData {
  id: string;
  name: string;
  description?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  columns: Column[];
  tasks: Task[];
}

export interface QuickSetupOptions {
  template?: string;
  name?: string;
  description?: string;
  withSampleTasks?: boolean;
}
