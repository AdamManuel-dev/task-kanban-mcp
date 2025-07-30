import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@/utils/errors';
import { CommonValidations } from '@/utils/validation';
import type { z } from 'zod';

export function requestValidationMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // Validate request size
  const contentLength = parseInt(req.get('Content-Length') ?? '0', 10);
  const maxSize = 10 * 1024 * 1024; // 10MB

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
      return next(new ValidationError(`Invalid UUID format for parameter: ${String(param)}`));
    }
  }

  // Validate query parameters
  if (req.query.limit) {
    const limit = parseInt(req.query.limit as string, 10);
    if (isNaN(limit) || limit <= 0 || limit > 1000) {
      return next(new ValidationError('Invalid limit parameter'));
    }
  }

  if (req.query.offset) {
    const offset = parseInt(req.query.offset as string, 10);
    if (isNaN(offset) || offset < 0) {
      return next(new ValidationError('Invalid offset parameter'));
    }
  }

  if (req.query.sortOrder && !['asc', 'desc'].includes(req.query.sortOrder as string)) {
    return next(new ValidationError('Sort order must be "asc" or "desc"'));
  }

  next();
}

function extractUuidParams(path: string): string[] {
  const uuidPattern = /\/:([^\/]+)/g;
  const params: string[] = [];
  let match;

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
      next(new ValidationError('Invalid request data'));
    }
  };
}
