import { z } from 'zod';
import {
  sanitizeTaskTitle,
  sanitizeDescription,
  sanitizeName,
  sanitizeTag,
  sanitizeEmail,
  sanitizeUrl,
  createSafePromptValidator,
  detectSuspicious,
} from '../utils/input-sanitizer';

/**
 * Input validation functions for CLI prompts with comprehensive sanitization
 * Enhanced for TASK-119: Input sanitization for all prompts
 */

// Task size options
export const TASK_SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;
export type TaskSize = (typeof TASK_SIZES)[number];

// Priority options
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;
export type Priority = (typeof PRIORITIES)[number];

// Status options
export const STATUSES = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

/**
 * Validate task title with comprehensive sanitization
 */
export const validateTaskTitle = createSafePromptValidator(
  sanitizeTaskTitle,
  (input: string): true | string => {
    const trimmed = input.trim();

    if (!trimmed) {
      return 'Task title cannot be empty';
    }

    if (trimmed.length < 3) {
      return 'Task title must be at least 3 characters long';
    }

    if (trimmed.length > 200) {
      return 'Task title must be less than 200 characters';
    }

    // Additional security checks
    const suspiciousCheck = detectSuspicious(input);
    if (suspiciousCheck.suspicious) {
      return `Security issue: ${suspiciousCheck.patterns.join(', ')} detected in title`;
    }

    return true;
  }
);

/**
 * Validate priority
 */
export function validatePriority(input: string): true | string {
  const upperInput = input.toUpperCase();

  if (!PRIORITIES.includes(upperInput as Priority)) {
    return `Priority must be one of: ${PRIORITIES.join(', ')}`;
  }

  return true;
}

/**
 * Validate task size
 */
export function validateTaskSize(input: string): true | string {
  const upperInput = input.toUpperCase();

  if (!TASK_SIZES.includes(upperInput as TaskSize)) {
    return `Task size must be one of: ${TASK_SIZES.join(', ')}`;
  }

  return true;
}

/**
 * Validate email address with sanitization
 */
export const validateEmail = createSafePromptValidator(
  sanitizeEmail,
  (input: string): true | string => {
    const trimmed = input.trim();

    if (!trimmed) {
      return 'Email address cannot be empty';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return 'Please enter a valid email address';
    }

    return true;
  }
);

/**
 * Validate URL with sanitization
 */
export const validateUrl = createSafePromptValidator(
  sanitizeUrl,
  (input: string): true | string => {
    const trimmed = input.trim();

    if (!trimmed) {
      return 'URL cannot be empty';
    }

    try {
      const url = new URL(trimmed);

      // Additional security checks for URLs - block dangerous protocols
      const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
      if (dangerousProtocols.includes(url.protocol)) {
        return 'Unsafe URL protocol detected';
      }

      return true;
    } catch {
      return 'Please enter a valid URL';
    }
  }
);

/**
 * Validate git repository URL
 */
export function validateGitRepoUrl(input: string): true | string {
  const urlValidation = validateUrl(input);
  if (urlValidation !== true) {
    return urlValidation;
  }

  const gitUrlRegex =
    /^(https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[\w-]+\/[\w-]+|git@(github\.com|gitlab\.com|bitbucket\.org):[\w-]+\/[\w-]+\.git)$/;

  if (!gitUrlRegex.test(input)) {
    return 'Please enter a valid Git repository URL (GitHub, GitLab, or Bitbucket)';
  }

  return true;
}

/**
 * Validate board name with sanitization
 */
export const validateBoardName = createSafePromptValidator(
  (input: string) => sanitizeName(input, 50),
  (input: string): true | string => {
    const trimmed = input.trim();

    if (!trimmed) {
      return 'Board name cannot be empty';
    }

    if (trimmed.length < 2) {
      return 'Board name must be at least 2 characters long';
    }

    if (trimmed.length > 50) {
      return 'Board name must be less than 50 characters';
    }

    return true;
  }
);

/**
 * Validate column name with sanitization
 */
export const validateColumnName = createSafePromptValidator(
  (input: string) => sanitizeName(input, 30),
  (input: string): true | string => {
    const trimmed = input.trim();

    if (!trimmed) {
      return 'Column name cannot be empty';
    }

    if (trimmed.length > 30) {
      return 'Column name must be less than 30 characters';
    }

    return true;
  }
);

/**
 * Validate tag name with sanitization
 */
export const validateTagName = createSafePromptValidator(
  sanitizeTag,
  (input: string): true | string => {
    const trimmed = input.trim();

    if (!trimmed) {
      return 'Tag name cannot be empty';
    }

    if (trimmed.length > 20) {
      return 'Tag name must be less than 20 characters';
    }

    return true;
  }
);

/**
 * Validate date input
 */
export function validateDate(input: string): true | string {
  const trimmed = input.trim();

  if (!trimmed) {
    return true; // Date is optional
  }

  // Accept various date formats
  const dateFormats = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
    /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
  ];

  const matchesFormat = dateFormats.some(format => format.test(trimmed));
  if (!matchesFormat) {
    return 'Please enter a date in format YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY';
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return 'Please enter a valid date';
  }

  return true;
}

/**
 * Validate time estimate (hours)
 */
export function validateTimeEstimate(input: string): true | string {
  const trimmed = input.trim();

  if (!trimmed) {
    return true; // Time estimate is optional
  }

  const num = parseFloat(trimmed);
  if (Number.isNaN(num)) {
    return 'Please enter a valid number';
  }

  if (num <= 0) {
    return 'Time estimate must be greater than 0';
  }

  if (num > 999) {
    return 'Time estimate seems too high. Please enter a value less than 1000 hours';
  }

  return true;
}

/**
 * Validate percentage
 */
export function validatePercentage(input: string): true | string {
  const trimmed = input.trim();

  if (!trimmed) {
    return 'Percentage cannot be empty';
  }

  const num = parseInt(trimmed, 10);
  if (Number.isNaN(num)) {
    return 'Please enter a valid number';
  }

  if (num < 0 || num > 100) {
    return 'Percentage must be between 0 and 100';
  }

  return true;
}

/**
 * Create a custom validator with min/max length
 */
export function createLengthValidator(
  fieldName: string,
  minLength: number,
  maxLength: number
): (input: string) => true | string {
  return (input: string) => {
    const trimmed = input.trim();

    if (!trimmed && minLength > 0) {
      return `${String(fieldName)} cannot be empty`;
    }

    if (trimmed.length < minLength) {
      return `${String(fieldName)} must be at least ${String(minLength)} characters long`;
    }

    if (trimmed.length > maxLength) {
      return `${String(fieldName)} must be less than ${String(maxLength)} characters`;
    }

    return true;
  };
}

/**
 * Create a custom enum validator
 */
export function createEnumValidator<T extends readonly string[]>(
  fieldName: string,
  validOptions: T
): (input: string) => true | string {
  return (input: string) => {
    if (!validOptions.includes(input)) {
      return `${fieldName} must be one of: ${validOptions.join(', ')}`;
    }
    return true;
  };
}

/**
 * Zod schemas for more complex validation
 */

export const TaskSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  size: z.enum(TASK_SIZES).optional(),
  assignee: z.string().optional(),
  due_date: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
});

export const BoardSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[\w\s-]+$/),
  description: z.string().optional(),
  columns: z.array(
    z.object({
      name: z.string().min(1).max(30),
      order: z.number().int().min(0),
    })
  ),
});

export type TaskInput = z.infer<typeof TaskSchema>;
export type BoardInput = z.infer<typeof BoardSchema>;

/**
 * Additional sanitized validators for descriptions and other text inputs
 */

/**
 * Validate task description with sanitization
 */
export const validateTaskDescription = createSafePromptValidator(
  sanitizeDescription,
  (input: string): true | string => {
    const trimmed = input.trim();

    if (trimmed.length > 2000) {
      return 'Description must be less than 2000 characters';
    }

    return true;
  }
);

/**
 * Validate board description with sanitization
 */
export const validateBoardDescription = createSafePromptValidator(
  sanitizeDescription,
  (input: string): true | string => {
    const trimmed = input.trim();

    if (trimmed.length > 500) {
      return 'Board description must be less than 500 characters';
    }

    return true;
  }
);

/**
 * Validate assignee name with sanitization
 */
export const validateAssignee = createSafePromptValidator(
  (input: string) => sanitizeName(input, 100),
  (input: string): true | string => {
    const trimmed = input.trim();

    if (trimmed.length > 100) {
      return 'Assignee name must be less than 100 characters';
    }

    return true;
  }
);

/**
 * Create safe versions of existing Zod schemas with sanitization
 */
export const SafeTaskSchema = z.object({
  title: z
    .string()
    .transform(val => sanitizeTaskTitle(val).sanitized)
    .pipe(z.string().min(3).max(200)),
  description: z
    .string()
    .optional()
    .transform(val => (val ? sanitizeDescription(val).sanitized : val)),
  priority: z.enum(PRIORITIES).optional(),
  size: z.enum(TASK_SIZES).optional(),
  assignee: z
    .string()
    .optional()
    .transform(val => (val ? sanitizeName(val, 100).sanitized : val)),
  due_date: z.string().optional(),
  tags: z.array(z.string().transform(val => sanitizeTag(val).sanitized)).optional(),
});

export const SafeBoardSchema = z.object({
  name: z
    .string()
    .transform(val => sanitizeName(val, 50).sanitized)
    .pipe(z.string().min(2).max(50)),
  description: z
    .string()
    .optional()
    .transform(val => (val ? sanitizeDescription(val).sanitized : val)),
  columns: z.array(
    z.object({
      name: z
        .string()
        .transform(val => sanitizeName(val, 30).sanitized)
        .pipe(z.string().min(1).max(30)),
      order: z.number().int().min(0),
    })
  ),
});

export type SafeTaskInput = z.infer<typeof SafeTaskSchema>;
export type SafeBoardInput = z.infer<typeof SafeBoardSchema>;

/**
 * Utility function to validate and sanitize any input
 */
export function validateAndSanitizeInput(
  input: string,
  type: 'title' | 'description' | 'name' | 'tag' | 'email' | 'url' | 'assignee'
): { valid: boolean; sanitized: string; error?: string; warnings?: string[] } {
  try {
    let validator: (input: string) => true | string;

    switch (type) {
      case 'title':
        validator = validateTaskTitle;
        break;
      case 'description':
        validator = validateTaskDescription;
        break;
      case 'name':
        validator = validateBoardName;
        break;
      case 'tag':
        validator = validateTagName;
        break;
      case 'email':
        validator = validateEmail;
        break;
      case 'url':
        validator = validateUrl;
        break;
      case 'assignee':
        validator = validateAssignee;
        break;
      default:
        return { valid: false, sanitized: input, error: 'Unknown validation type' };
    }

    const result = validator(input);
    if (result === true) {
      // Get the sanitized version
      let sanitized: string;
      switch (type) {
        case 'title':
          sanitized = sanitizeTaskTitle(input).sanitized;
          break;
        case 'description':
          sanitized = sanitizeDescription(input).sanitized;
          break;
        case 'name':
          sanitized = sanitizeName(input).sanitized;
          break;
        case 'tag':
          sanitized = sanitizeTag(input).sanitized;
          break;
        case 'email':
          sanitized = sanitizeEmail(input).sanitized;
          break;
        case 'url':
          sanitized = sanitizeUrl(input).sanitized;
          break;
        case 'assignee':
          sanitized = sanitizeName(input, 100).sanitized;
          break;
        default:
          sanitized = input;
      }

      const result: { valid: boolean; sanitized: string; warnings?: string[] } = {
        valid: true,
        sanitized,
      };

      if (sanitized !== input) {
        result.warnings = ['Input was sanitized'];
      }

      return result;
    }
    return { valid: false, sanitized: input, error: result };
  } catch (error) {
    return {
      valid: false,
      sanitized: input,
      error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
