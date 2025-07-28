import type { Request, Response, NextFunction } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
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

declare global {
  namespace Express {
    interface Response {
      apiSuccess<T>(data: T, meta?: Partial<ApiResponse['meta']>): void;
      apiError(code: string, message: string, statusCode?: number, details?: any): void;
      apiPagination<T>(
        data: T[],
        page: number,
        limit: number,
        total: number,
        meta?: Partial<ApiResponse['meta']>
      ): void;
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
  res.apiError = function sendApiError(
    code: string,
    message: string,
    statusCode = 500,
    details?: any
  ): void {
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
  res.apiPagination = function <T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
    meta?: Partial<ApiResponse['meta']>
  ): void {
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
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: '', // Will be set by middleware if available
      ...(message && { message }),
    },
  };
}

/**
 * Format error response
 */
export function formatErrorResponse(message: string, details?: any): ApiResponse {
  return {
    success: false,
    error: {
      code: 'ERROR',
      message,
      details,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: '', // Will be set by middleware if available
    },
  };
}
