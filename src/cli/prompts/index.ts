/**
 * @fileoverview Barrel export for CLI prompts module
 * @lastmodified 2025-07-28T10:30:00Z
 * 
 * Features: Clean imports for all prompt functionality
 * Main APIs: Re-exports from board, task, validation modules
 * Constraints: None
 * Patterns: Barrel export pattern for module organization
 */

// Board prompt functions
export {
  quickBoardSetup,
  confirmAction,
  selectFromList,
  addColumnPrompt,
  boardSettingsPrompt,
  confirmDelete
} from './board-prompts';

// Task prompt functions
export {
  createTaskPrompt,
  moveTaskPrompt,
  bulkTaskActionPrompt,
  taskFilterPrompt
} from './task-prompts';

// Validation functions
export {
  validateTaskTitle,
  validatePriority,
  validateTaskSize,
  validateEmail,
  validateUrl,
  validateGitRepoUrl,
  validateBoardName,
  validateColumnName,
  validateTagName,
  validateDate,
  validateTimeEstimate,
  validatePercentage,
  createLengthValidator,
  createEnumValidator,
  validateTaskDescription,
  validateBoardDescription,
  validateAssignee,
  validateAndSanitizeInput,
  TaskSchema,
  BoardSchema,
  SafeTaskSchema,
  SafeBoardSchema,
  TASK_SIZES,
  PRIORITIES,
  STATUSES
} from './validators';

// Types and interfaces
export type {
  PromptConfig,
  TaskEstimation,
  FormatterInterface,
  TaskInput,
  MoveTaskInput,
  BulkActionInput
} from './types';

export {
  PromptCancelledError
} from './types';

// Utility functions
export {
  safePrompt,
  createFormatter,
  handlePromptError,
  isPromptCancelled
} from './utils';

// Re-export types from validators
export type {
  Priority,
  TaskSize,
  Status,
  TaskInput as ValidatorTaskInput,
  BoardInput,
  SafeTaskInput,
  SafeBoardInput
} from './validators';