/**
 * @fileoverview Shared types and interfaces for CLI prompt system
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Prompt configuration interfaces, input/output types, error classes
 * Main APIs: PromptConfig, TaskInput, BulkActionInput, PromptCancelledError
 * Constraints: Compatible with enquirer and prompts libraries
 * Patterns: Type-safe prompt definitions, structured error handling
 */

import type { Priority, TaskSize } from './validators';

/**
 * Configuration interface for enquirer prompts
 */
export interface PromptConfig {
  type: string;
  name: string;
  message: string;
  initial?: unknown;
  validate?: (value: unknown) => string | boolean;
  choices?: Array<{ name: string; value: unknown; hint?: string }>;
  hint?: string;
  multiline?: boolean;
  separator?: string;
  min?: number;
  max?: number;
  float?: boolean;
}

/**
 * Task estimation result from AI
 */
export interface TaskEstimation {
  size: TaskSize;
  avgHours: number;
  confidence: number; // Changed from string to number to match TaskSizeEstimator
  reasoning: string[];
}

/**
 * Formatter interface for consistent CLI output
 */
export interface FormatterInterface {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Task input structure for creation prompts
 */
export interface TaskInput {
  title: string;
  description?: string;
  priority?: Priority;
  size?: TaskSize;
  assignee?: string;
  dueDate?: string;
  estimatedHours?: number;
  tags?: string[];
}

/**
 * Task move input structure
 */
export interface MoveTaskInput {
  taskId: string;
  targetColumn: string;
  position?: number;
}

/**
 * Bulk action input structure
 */
export interface BulkActionInput {
  taskIds: string[];
  action: 'move' | 'delete' | 'archive' | 'assign' | 'tag';
  params?: Record<string, unknown>;
}

/**
 * Error thrown when a prompt is cancelled
 */
export class PromptCancelledError extends Error {
  constructor(message = 'Prompt was cancelled by user') {
    super(message);
    this.name = 'PromptCancelledError';
  }
}
