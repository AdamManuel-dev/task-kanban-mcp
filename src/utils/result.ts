/**
 * @fileoverview Result type pattern for better error handling
 * @lastmodified 2025-07-28T16:00:00Z
 *
 * Features: Type-safe error handling, Result<T, E> pattern implementation
 * Main APIs: Result type, Ok(), Err(), isOk(), isErr(), match()
 * Constraints: Functional programming approach, immutable results
 * Patterns: Railway-oriented programming, explicit error handling
 */

/**
 * Result type for representing operations that can succeed or fail
 * Inspired by Rust's Result<T, E> and functional programming patterns
 */
export type Result<T, E = Error> =
  | { success: true; data: T; error?: never }
  | { success: false; error: E; data?: never };

/**
 * Create a successful result
 */
export function Ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create a failed result
 */
export function Err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Type guard to check if result is successful
 */
export function isOk<T, E>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success;
}

/**
 * Type guard to check if result is an error
 */
export function isErr<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return !result.success;
}

/**
 * Match pattern for handling both success and error cases
 */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (data: T) => U;
    err: (error: E) => U;
  }
): U {
  if (isOk(result)) {
    return handlers.ok(result.data);
  }
  return handlers.err(result.error);
}

/**
 * Map over the success value of a Result
 */
export function map<T, E, U>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
  if (isOk(result)) {
    return Ok(fn(result.data));
  }
  return result;
}

/**
 * Map over the error value of a Result
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (isErr(result)) {
    return Err(fn(result.error));
  }
  return result;
}

/**
 * Chain Result operations (flatMap/bind)
 */
export function andThen<T, E, U>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.data);
  }
  return result;
}

/**
 * Get the value or throw the error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.data;
  }
  throw result.error;
}

/**
 * Get the value or return a default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Get the value or compute a default from the error
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  if (isOk(result)) {
    return result.data;
  }
  return fn(result.error);
}

/**
 * Convert a Promise to a Result, catching any errors
 */
export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  try {
    const data = await promise;
    return Ok(data);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Combine multiple Results into a single Result
 * If all are successful, returns array of values
 * If any fail, returns the first error
 */
export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];

  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.data);
  }

  return Ok(values);
}

/**
 * Utility types for common Result patterns
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

export type ServiceResult<T> = Result<T, ServiceError>;

export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
  cause?: Error;
}

/**
 * Create a ServiceError
 */
export function createServiceError(
  code: string,
  message: string,
  details?: unknown,
  cause?: Error
): ServiceError {
  return { code, message, details, cause };
}

/**
 * Helper for wrapping service operations
 */
export async function wrapServiceOperation<T>(
  operation: () => Promise<T>,
  errorCode: string,
  errorMessage?: string
): Promise<ServiceResult<T>> {
  try {
    const result = await operation();
    return Ok(result);
  } catch (error) {
    const serviceError = createServiceError(
      errorCode,
      errorMessage ?? `Operation failed: ${errorCode}`,
      undefined,
      error instanceof Error ? error : new Error(String(error))
    );
    return Err(serviceError);
  }
}

/**
 * Helper for validation operations
 */
export function validateWith<T>(
  value: T,
  validator: (value: T) => boolean,
  errorMessage: string
): Result<T, string> {
  if (validator(value)) {
    return Ok(value);
  }
  return Err(errorMessage);
}

/**
 * Chain multiple validation operations
 */
export function validateAll<T>(
  value: T,
  validations: Array<(value: T) => Result<T, string>>
): Result<T, string[]> {
  const errors: string[] = [];

  for (const validation of validations) {
    const result = validation(value);
    if (isErr(result)) {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return Err(errors);
  }

  return Ok(value);
}
