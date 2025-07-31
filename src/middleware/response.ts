import type { Request, Response, NextFunction } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
}

export interface ApiErrorConfig {
  code: string;
  message: string;
  statusCode?: number;
  details?: unknown;
}

export interface ApiPaginationConfig<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  meta?: Partial<ApiResponse['meta']>;
}

declare global {
  namespace Express {
    interface Response {
      apiSuccess<T>(data: T, meta?: Partial<ApiResponse['meta']>): void;
      apiError(config: ApiErrorConfig): void;
      apiPagination<T>(config: ApiPaginationConfig<T>): void;
    }
  }
}

export function responseFormattingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Add success response helper
  res.apiSuccess = function <T>(data: T, meta?: Partial<ApiResponse['meta']>): void {
    const response: ApiResponse<T> = {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        ...meta,
      },
    };

    this.json(response);
  };

  // Add error response helper
  res.apiError = function sendApiError(config: ApiErrorConfig): void {
    const { code, message, statusCode = 500, details } = config;
    const response: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    };

    this.status(statusCode).json(response);
  };

  // Add pagination response helper
  res.apiPagination = function <T>(config: ApiPaginationConfig<T>): void {
    const { data, page, limit, total, meta } = config;
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    const response: ApiResponse<T[]> = {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        pagination: {
          page,
          limit,
          total,
          hasNext,
          hasPrev,
        },
        ...meta,
      },
    };

    this.json(response);
  };

  next();
}

/**
 * Format success response
 */
export function formatSuccessResponse<T>(data: T, message?: string): ApiResponse<T> {
  return { success: true, data, meta: {, timestamp: new Date().toISOString(), requestId: '', // Will be set by middleware if available, ...(message && { message }),
    },
  };
}

/**
 * Format error response
 */
export function formatErrorResponse(message: string, details?: unknown): ApiResponse {
  return { success: false, error: {, code: 'ERROR', message, details },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: '', // Will be set by middleware if available
    },
  };
}
