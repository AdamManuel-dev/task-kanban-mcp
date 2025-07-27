import { z } from 'zod';

/**
 * Input validation functions for CLI prompts
 */

// Task size options
export const TASK_SIZES = ['S', 'M', 'L', 'XL'] as const;
export type TaskSize = (typeof TASK_SIZES)[number];

// Priority options
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;
export type Priority = (typeof PRIORITIES)[number];

// Status options
export const STATUSES = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

/**
 * Validate task title
 */
export function validateTaskTitle(input: string): true | string {
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

  // Check for invalid characters
  const invalidChars = /[<>:"\\|?*]/;
  if (invalidChars.test(trimmed)) {
    return 'Task title contains invalid characters: < > : " \\ | ? *';
  }

  return true;
}

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
 * Validate email address
 */
export function validateEmail(input: string): true | string {
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

/**
 * Validate URL
 */
export function validateUrl(input: string): true | string {
  const trimmed = input.trim();

  if (!trimmed) {
    return 'URL cannot be empty';
  }

  try {
    new URL(trimmed);
    return true;
  } catch {
    return 'Please enter a valid URL';
  }
}

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
 * Validate board name
 */
export function validateBoardName(input: string): true | string {
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

  // Allow alphanumeric, spaces, hyphens, and underscores
  const validNameRegex = /^[\w\s-]+$/;
  if (!validNameRegex.test(trimmed)) {
    return 'Board name can only contain letters, numbers, spaces, hyphens, and underscores';
  }

  return true;
}

/**
 * Validate column name
 */
export function validateColumnName(input: string): true | string {
  const trimmed = input.trim();

  if (!trimmed) {
    return 'Column name cannot be empty';
  }

  if (trimmed.length > 30) {
    return 'Column name must be less than 30 characters';
  }

  return true;
}

/**
 * Validate tag name
 */
export function validateTagName(input: string): true | string {
  const trimmed = input.trim();

  if (!trimmed) {
    return 'Tag name cannot be empty';
  }

  if (trimmed.length > 20) {
    return 'Tag name must be less than 20 characters';
  }

  // No spaces or special characters in tags
  const validTagRegex = /^[\w-]+$/;
  if (!validTagRegex.test(trimmed)) {
    return 'Tag name can only contain letters, numbers, hyphens, and underscores';
  }

  return true;
}

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
  if (isNaN(date.getTime())) {
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
  if (isNaN(num)) {
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
  if (isNaN(num)) {
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
      return `${fieldName} cannot be empty`;
    }

    if (trimmed.length < minLength) {
      return `${fieldName} must be at least ${minLength} characters long`;
    }

    if (trimmed.length > maxLength) {
      return `${fieldName} must be less than ${maxLength} characters`;
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
