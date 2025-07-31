import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { CommonValidations } from '@/utils/validation';
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

// Constants for validation limits
const VALIDATION_LIMITS = {
  MAX_REQUEST_SIZE_MB: 10,
  MAX_REQUEST_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_QUERY_LIMIT: 1000,
  MIN_QUERY_LIMIT: 1,
  MIN_QUERY_OFFSET: 0,
} as const;

/**
 * Middleware for basic request validation
 *
 * Validates request size, content type, UUID parameters, and query parameters.
 * Ensures requests meet basic security and format requirements before processing.
 *
 * @param req - Express request object
 * @param _res - Express response object (unused)
 * @param next - Express next function for middleware chain
 * @throws ValidationError when validation fails
 */
export function requestValidationMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // Validate request size
  const contentLength = parseInt(req.get('Content-Length') ?? '0', 10);
  const maxSize = VALIDATION_LIMITS.MAX_REQUEST_SIZE_BYTES;

  if (contentLength > maxSize) {
    return next(new ValidationError('Request too large'));
  }

  // Validate content type for POST/PUT/PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      return next(new ValidationError('Content-Type must be application/json'));
    }
  }

  // Validate UUIDs in path parameters
  const uuidParams = extractUuidParams(req.path);
  for (const param of uuidParams) {
    const value = req.params[param];
    if (value && !CommonValidations.uuid.safeParse(value).success) {
      return next(new ValidationError(`Invalid UUID format for parameter: ${param}`));
    }
  }

  // Validate query parameters
  if (req.query.limit) {
    const limit = parseInt(req.query.limit as string, 10);
    if (
      Number.isNaN(limit) ||
      limit < VALIDATION_LIMITS.MIN_QUERY_LIMIT ||
      limit > VALIDATION_LIMITS.MAX_QUERY_LIMIT
    ) {
      return next(
        new ValidationError(
          `Invalid limit parameter. Must be between ${VALIDATION_LIMITS.MIN_QUERY_LIMIT} and ${VALIDATION_LIMITS.MAX_QUERY_LIMIT}`
        )
      );
    }
  }

  if (req.query.offset) {
    const offset = parseInt(req.query.offset as string, 10);
    if (Number.isNaN(offset) || offset < VALIDATION_LIMITS.MIN_QUERY_OFFSET) {
      return next(new ValidationError('Invalid offset parameter. Must be 0 or greater'));
    }
  }

  if (req.query.sortOrder && !['asc', 'desc'].includes(req.query.sortOrder as string)) {
    return next(new ValidationError('Sort order must be "asc" or "desc"'));
  }

  next();
}

/**
 * Extracts UUID parameter names from an Express route path
 *
 * Identifies route parameters that likely contain UUIDs based on naming conventions
 * (parameters ending with 'Id' or named 'id').
 *
 * @param path - Express route path (e.g., '/api/boards/:boardId/tasks/:taskId')
 * @returns Array of parameter names that should be validated as UUIDs
 */
function extractUuidParams(path: string): string[] {
  const uuidPattern = /:([^/]+)/g;
  const params: string[] = [];
  let match: RegExpExecArray | null;

  // Extract parameter names that likely contain UUIDs
  while ((match = uuidPattern.exec(path)) !== null) {
    const paramName = match[1];
    if (paramName && (paramName.endsWith('Id') || paramName === 'id')) {
      params.push(paramName);
    }
  }

  return params;
}

/**
 * Create a validation middleware for request body/query/params
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = {
        ...req.body,
        ...req.query,
        ...req.params,
      };

      const result = schema.safeParse(data);

      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        return next(new ValidationError('Validation failed', { errors }));
      }

      // Merge validated data back
      req.body = result.data as unknown;
      next();
    } catch (error) {
      // Log the original error for debugging
      logger.error('Validation middleware error:', { error, path: req.path, method: req.method });

      // Provide meaningful error message based on error type
      const errorMessage =
        error instanceof Error ? `Invalid request data: ${error.message}` : 'Invalid request data';

      next(new ValidationError(errorMessage));
    }
  };
}
