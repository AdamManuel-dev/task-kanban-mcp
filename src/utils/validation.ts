/**
 * Validation utilities and schemas for MCP Kanban
 *
 * @module utils/validation
 * @description Provides comprehensive input validation using Zod schemas and business rules.
 * Includes validation schemas for all entity types, common validation patterns, business rule
 * enforcement, and error handling utilities. Ensures data integrity and provides clear
 * validation error messages for API consumers.
 *
 * @example
 * ```typescript
 * import { BoardValidation, validateInput, BusinessRules } from '@/utils/validation';
 *
 * // Validate board creation data
 * const boardData = validateInput(BoardValidation.create, {
 *   name: 'Project Board',
 *   description: 'Main project tracking',
 *   color: '#2196F3'
 * });
 *
 * // Apply business rules
 * BusinessRules.board.validateName(boardData.name);
 * BusinessRules.board.validateColor(boardData.color);
 *
 * // Validate task data
 * const taskData = validateInput(TaskValidation.create, {
 *   title: 'Implement feature',
 *   board_id: 'uuid-here',
 *   column_id: 'uuid-here'
 * });
 * ```
 */

import { z } from 'zod';
import type { ServiceError } from '@/types';
import { optionalWithUndefined } from './zod-helpers';

/**
 * Board validation schemas
 *
 * @constant {Object} BoardValidation
 * @description Zod validation schemas for board operations including creation and updates
 */
export const BoardValidation = {
  create: z.object({
    name: z.string().min(1, 'Board name is required').max(100, 'Board name too long'),
    description: optionalWithUndefined(z.string().max(500, 'Description too long')),
    color: optionalWithUndefined(z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format')),
  }),

  update: z.object({
    name: optionalWithUndefined(
      z.string().min(1, 'Board name is required').max(100, 'Board name too long')
    ),
    description: optionalWithUndefined(z.string().max(500, 'Description too long')),
    color: optionalWithUndefined(z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format')),
    archived: optionalWithUndefined(z.boolean()),
  }),

  column: {
    create: z.object({
      board_id: z.string().uuid('Invalid board ID'),
      name: z.string().min(1, 'Column name is required').max(50, 'Column name too long'),
      position: z.number().int().min(0, 'Position must be non-negative'),
      wip_limit: optionalWithUndefined(z.number().int().min(1, 'WIP limit must be positive')),
    }),

    update: z.object({
      name: optionalWithUndefined(
        z.string().min(1, 'Column name is required').max(50, 'Column name too long')
      ),
      position: optionalWithUndefined(z.number().int().min(0, 'Position must be non-negative')),
      wip_limit: optionalWithUndefined(z.number().int().min(1, 'WIP limit must be positive')),
    }),
  },
};

/**
 * Task validation schemas
 *
 * @constant {Object} TaskValidation
 * @description Zod validation schemas for task operations including creation, updates, and dependencies
 */
export const TaskValidation = {
  create: z.object({
    title: z.string().min(1, 'Task title is required').max(200, 'Title too long'),
    description: optionalWithUndefined(z.string().max(2000, 'Description too long')),
    board_id: z.string().uuid('Invalid board ID'),
    column_id: z.string().uuid('Invalid column ID'),
    position: optionalWithUndefined(z.number().int().min(0)),
    priority: optionalWithUndefined(z.number().int().min(0).max(10)),
    status: optionalWithUndefined(z.enum(['todo', 'in_progress', 'done', 'blocked', 'archived'])),
    assignee: optionalWithUndefined(z.string().max(100, 'Assignee name too long')),
    due_date: optionalWithUndefined(z.date()),
    estimated_hours: optionalWithUndefined(z.number().positive()),
    parent_task_id: optionalWithUndefined(z.string().uuid('Invalid parent task ID')),
    metadata: optionalWithUndefined(z.string().max(5000, 'Metadata too long')),
  }),

  update: z.object({
    title: optionalWithUndefined(
      z.string().min(1, 'Task title is required').max(200, 'Title too long')
    ),
    description: optionalWithUndefined(z.string().max(2000, 'Description too long')),
    column_id: optionalWithUndefined(z.string().uuid('Invalid column ID')),
    position: optionalWithUndefined(z.number().int().min(0)),
    priority: optionalWithUndefined(z.number().int().min(0).max(10)),
    status: optionalWithUndefined(z.enum(['todo', 'in_progress', 'done', 'blocked', 'archived'])),
    assignee: optionalWithUndefined(z.string().max(100, 'Assignee name too long')),
    due_date: optionalWithUndefined(z.date()),
    estimated_hours: optionalWithUndefined(z.number().positive()),
    actual_hours: optionalWithUndefined(z.number().positive()),
    parent_task_id: optionalWithUndefined(z.string().uuid('Invalid parent task ID')),
    metadata: optionalWithUndefined(z.string().max(5000, 'Metadata too long')),
  }),

  dependency: z.object({
    task_id: z.string().uuid('Invalid task ID'),
    depends_on_task_id: z.string().uuid('Invalid dependency task ID'),
    dependency_type: z.enum(['blocks', 'relates_to', 'duplicates']).optional(),
  }),
};

/**
 * Note validation schemas
 *
 * @constant {Object} NoteValidation
 * @description Zod validation schemas for note operations including creation, updates, and search
 */
export const NoteValidation = {
  create: z.object({
    task_id: z.string().uuid('Invalid task ID'),
    content: z.string().min(1, 'Note content is required').max(5000, 'Content too long'),
    category: optionalWithUndefined(
      z.enum(['general', 'implementation', 'research', 'blocker', 'idea'])
    ),
    pinned: optionalWithUndefined(z.boolean()),
  }),

  update: z.object({
    content: optionalWithUndefined(
      z.string().min(1, 'Note content is required').max(5000, 'Content too long')
    ),
    category: optionalWithUndefined(
      z.enum(['general', 'implementation', 'research', 'blocker', 'idea'])
    ),
    pinned: optionalWithUndefined(z.boolean()),
  }),

  search: z.object({
    query: z.string().min(1, 'Search query is required').max(200, 'Query too long'),
    task_id: z.string().uuid('Invalid task ID').optional(),
    board_id: z.string().uuid('Invalid board ID').optional(),
    category: z.enum(['general', 'implementation', 'research', 'blocker', 'idea']).optional(),
    pinned_only: z.boolean().optional(),
    highlight: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  }),
};

/**
 * Tag validation schemas
 *
 * @constant {Object} TagValidation
 * @description Zod validation schemas for tag operations including creation, updates, and assignments
 */
export const TagValidation = {
  create: z.object({
    name: z.string().min(1, 'Tag name is required').max(50, 'Tag name too long'),
    color: optionalWithUndefined(z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format')),
    description: optionalWithUndefined(z.string().max(200, 'Description too long')),
    parent_tag_id: optionalWithUndefined(z.string().uuid('Invalid parent tag ID')),
  }),

  update: z.object({
    name: optionalWithUndefined(
      z.string().min(1, 'Tag name is required').max(50, 'Tag name too long')
    ),
    color: optionalWithUndefined(z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format')),
    description: optionalWithUndefined(z.string().max(200, 'Description too long')),
    parent_tag_id: optionalWithUndefined(z.string().uuid('Invalid parent tag ID')),
  }),

  assignment: z.object({
    task_id: z.string().uuid('Invalid task ID'),
    tag_id: z.string().uuid('Invalid tag ID'),
  }),
};

/**
 * Pagination validation schema
 *
 * @constant {z.ZodSchema} PaginationValidation
 * @description Validates pagination parameters for list operations
 */
export const PaginationValidation = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * Filter validation schema
 *
 * @constant {z.ZodSchema} FilterValidation
 * @description Validates filtering parameters for search and list operations
 */
export const FilterValidation = z.object({
  archived: z.boolean().optional(),
  search: z.string().max(200).optional(),
});

/**
 * Custom validation error class
 *
 * @class ValidationError
 * @extends Error
 * @implements ServiceError
 * @description Standardized error class for validation failures with structured details
 */
export class ValidationError extends Error implements ServiceError {
  public readonly code = 'VALIDATION_ERROR';

  public readonly statusCode = 400;

  public readonly details: unknown;

  /**
   * Create a validation error
   *
   * @param {string} message - Error message
   * @param {any} [details] - Additional error details (e.g., Zod error array)
   */
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Validate input data against a Zod schema
 *
 * @template T - Expected return type after validation
 * @param {z.ZodSchema<T>} schema - Zod schema to validate against
 * @param {unknown} data - Input data to validate
 * @returns {T} Validated and typed data
 * @throws {ValidationError} If validation fails with detailed error information
 *
 * @example
 * ```typescript
 * const boardData = validateInput(BoardValidation.create, {
 *   name: 'My Board',
 *   description: 'Project board'
 * });
 * // boardData is now typed and validated
 * ```
 */
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(
        err => `${String(String(err.path.join('.')))}: ${String(String(err.message))}`
      );
      throw new ValidationError(
        `Validation failed: ${String(String(messages.join(', ')))}`,
        error.errors
      );
    }
    throw error;
  }
}

/**
 * Validate optional input data against a Zod schema
 *
 * @template T - Expected return type after validation
 * @param {z.ZodSchema<T>} schema - Zod schema to validate against
 * @param {unknown} data - Input data to validate (may be null/undefined)
 * @returns {T | undefined} Validated data or undefined if input was null/undefined
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * const updateData = validateOptionalInput(BoardValidation.update, requestBody);
 * if (updateData) {
 *   // updateData is validated and can be used safely
 * }
 * ```
 */
export function validateOptionalInput<T>(schema: z.ZodSchema<T>, data: unknown): T | undefined {
  if (data === undefined || data === null) {
    return undefined;
  }
  return validateInput(schema, data);
}

/**
 * Business rules and domain-specific validation functions
 *
 * @constant {Object} BusinessRules
 * @description Collection of business rule validators organized by entity type.
 * These enforce domain-specific constraints beyond basic schema validation.
 */
export const BusinessRules = {
  /**
   * Board-specific business rules
   */
  board: {
    /**
     * Validate board name format and content
     *
     * @param {string} name - Board name to validate
     * @throws {ValidationError} If name format is invalid
     */
    validateName: (name: string): void => {
      if (name.trim() !== name) {
        throw new ValidationError('Board name cannot have leading or trailing whitespace');
      }
      if (name.includes('  ')) {
        throw new ValidationError('Board name cannot contain multiple consecutive spaces');
      }
    },

    /**
     * Validate board color against recommended palette
     *
     * @param {string} color - Hex color code to validate
     */
    validateColor: (color: string): void => {
      const validColors = [
        '#FF6B6B',
        '#4ECDC4',
        '#45B7D1',
        '#96CEB4',
        '#FFEAA7',
        '#DDA0DD',
        '#98D8C8',
        '#F7DC6F',
        '#BB8FCE',
        '#85C1E9',
      ];
      if (!validColors.includes(color.toUpperCase())) {
        // Allow any valid hex color, but warn about recommended colors
      }
    },
  },

  /**
   * Task-specific business rules
   */
  task: {
    /**
     * Validate task title format and length
     *
     * @param {string} title - Task title to validate
     * @throws {ValidationError} If title format is invalid
     */
    validateTitle: (title: string): void => {
      if (title.trim() !== title) {
        throw new ValidationError('Task title cannot have leading or trailing whitespace');
      }
      if (title.length < 3) {
        throw new ValidationError('Task title must be at least 3 characters long');
      }
    },

    /**
     * Validate task priority value
     *
     * @param {number} priority - Priority value to validate (0-10)
     * @throws {ValidationError} If priority is invalid
     */
    validatePriority: (priority: number): void => {
      if (!Number.isInteger(priority)) {
        throw new ValidationError('Priority must be an integer');
      }
      if (priority < 0 || priority > 10) {
        throw new ValidationError('Priority must be between 0 and 10');
      }
    },

    /**
     * Validate estimated hours value
     *
     * @param {number} hours - Estimated hours to validate
     * @throws {ValidationError} If hours value is invalid
     */
    validateEstimatedHours: (hours: number): void => {
      if (hours <= 0) {
        throw new ValidationError('Estimated hours must be positive');
      }
      if (hours > 1000) {
        throw new ValidationError('Estimated hours cannot exceed 1000');
      }
    },

    /**
     * Validate due date constraints
     *
     * @param {Date} dueDate - Due date to validate
     * @throws {ValidationError} If due date is invalid
     */
    validateDueDate: (dueDate: Date): void => {
      const now = new Date();
      const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

      if (dueDate < now) {
        // Allow past due dates for historical tasks
      }
      if (dueDate > oneYearFromNow) {
        throw new ValidationError('Due date cannot be more than one year in the future');
      }
    },

    /**
     * Validate task status transitions
     *
     * @param {string} currentStatus - Current task status
     * @param {string} newStatus - Target status
     * @throws {ValidationError} If transition is invalid
     */
    validateStatusTransition: (currentStatus: string, newStatus: string): void => {
      const validTransitions: Record<string, string[]> = {
        todo: ['in_progress', 'blocked', 'archived'],
        in_progress: ['done', 'todo', 'blocked', 'archived'],
        done: ['todo', 'in_progress', 'archived'],
        blocked: ['todo', 'in_progress', 'archived'],
        archived: ['todo', 'in_progress', 'done', 'blocked'],
      };

      if (!validTransitions[currentStatus].includes(newStatus)) {
        throw new ValidationError(
          `Invalid status transition from ${String(currentStatus)} to ${String(newStatus)}`
        );
      }
    },
  },

  /**
   * Note-specific business rules
   */
  note: {
    /**
     * Validate note content format
     *
     * @param {string} content - Note content to validate
     * @throws {ValidationError} If content format is invalid
     */
    validateContent: (content: string): void => {
      if (content.trim() !== content) {
        throw new ValidationError('Note content cannot have leading or trailing whitespace');
      }
      if (content.length < 1) {
        throw new ValidationError('Note content cannot be empty');
      }
    },

    /**
     * Validate note category
     *
     * @param {string} category - Note category to validate
     * @throws {ValidationError} If category is invalid
     */
    validateCategory: (category: string): void => {
      const validCategories = ['general', 'implementation', 'research', 'blocker', 'idea'];
      if (!validCategories.includes(category)) {
        throw new ValidationError(`Invalid note category: ${String(category)}`);
      }
    },
  },

  /**
   * Tag-specific business rules
   */
  tag: {
    /**
     * Validate tag name format and characters
     *
     * @param {string} name - Tag name to validate
     * @throws {ValidationError} If name format is invalid
     */
    validateName: (name: string): void => {
      if (name.trim() !== name) {
        throw new ValidationError('Tag name cannot have leading or trailing whitespace');
      }
      if (name.includes(' ')) {
        throw new ValidationError('Tag name cannot contain spaces');
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new ValidationError(
          'Tag name can only contain letters, numbers, underscores, and hyphens'
        );
      }
    },

    /**
     * Validate tag hierarchy depth
     *
     * @param {number} depth - Hierarchy depth to validate
     * @throws {ValidationError} If depth exceeds limit
     */
    validateHierarchyDepth: (depth: number): void => {
      if (depth > 5) {
        throw new ValidationError('Tag hierarchy cannot exceed 5 levels deep');
      }
    },
  },

  /**
   * Context service-specific business rules
   */
  context: {
    /**
     * Validate lookback days parameter
     *
     * @param {number} days - Number of days to validate
     * @throws {ValidationError} If days value is invalid
     */
    validateLookbackDays: (days: number): void => {
      if (days < 1) {
        throw new ValidationError('Lookback days must be at least 1');
      }
      if (days > 365) {
        throw new ValidationError('Lookback days cannot exceed 365');
      }
    },

    /**
     * Validate maximum items parameter
     *
     * @param {number} maxItems - Maximum items count to validate
     * @throws {ValidationError} If maxItems value is invalid
     */
    validateMaxItems: (maxItems: number): void => {
      if (maxItems < 1) {
        throw new ValidationError('Max items must be at least 1');
      }
      if (maxItems > 1000) {
        throw new ValidationError('Max items cannot exceed 1000');
      }
    },
  },
};

/**
 * Common validation patterns and reusable schemas
 *
 * @constant {Object} CommonValidations
 * @description Collection of commonly used validation patterns for consistent validation across the application
 */
export const CommonValidations = {
  /** UUID validation schema */
  uuid: z.string().uuid('Invalid UUID format'),

  /** Positive integer validation schema */
  positiveInteger: z.number().int().positive('Must be a positive integer'),

  /** Non-negative integer validation schema */
  nonNegativeInteger: z.number().int().min(0, 'Must be non-negative'),

  /** Date string validation schema */
  dateString: z.string().refine(date => !Number.isNaN(Date.parse(date)), 'Invalid date format'),

  /** Email validation schema */
  email: z.string().email('Invalid email format'),

  /** URL validation schema */
  url: z.string().url('Invalid URL format'),

  /** Hex color validation schema */
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color format'),

  /** URL slug validation schema */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format'),

  /** Sanitized string validation schema (prevents XSS) */
  sanitizedString: z.string().refine(str => {
    // Check for potential XSS/injection patterns
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
    ];
    return !dangerousPatterns.some(pattern => pattern.test(str));
  }, 'String contains potentially dangerous content'),
};

/**
 * Create a validated service proxy that automatically validates method inputs
 *
 * @template T - Service type
 * @param {T} service - Service instance to wrap with validation
 * @param {Record<string, z.ZodSchema>} validationConfig - Mapping of method names to validation schemas
 * @returns {T} Proxied service with automatic validation
 *
 * @example
 * ```typescript
 * const validatedBoardService = createValidatedService(boardService, {
 *   createBoard: BoardValidation.create,
 *   updateBoard: BoardValidation.update
 * });
 *
 * // Calls will be automatically validated
 * const board = await validatedBoardService.createBoard({
 *   name: 'Test Board'
 * }); // Validates input before calling original method
 * ```
 */
export function createValidatedService<T extends object>(
  service: T,
  validationConfig: Record<string, z.ZodSchema>
): T {
  return new Proxy(service, {
    get(target, propKey) {
      const originalMethod = (target as any)[propKey];

      if (typeof originalMethod !== 'function') {
        return originalMethod;
      }

      const validationSchema = validationConfig[propKey as string];
      if (!validationSchema) {
        return originalMethod;
      }

      return function validatedMethod(this: unknown, ...args: unknown[]) {
        // Validate the first argument (usually the data)
        if (args.length > 0 && args[0] !== undefined) {
          validateInput(validationSchema, args[0]);
        }

        return originalMethod.apply(this, args);
      };
    },
  });
}
