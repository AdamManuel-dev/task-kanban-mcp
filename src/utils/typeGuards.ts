/**
 * Type guard utilities for runtime type checking and validation
 */

/**
 * Checks if a value is an Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Checks if a value is an Error with a message property
 */
export function isErrorWithMessage(value: unknown): value is Error & { message: string } {
  return isError(value) && typeof value.message === 'string';
}

/**
 * Checks if a value is a record (object) type
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks if a value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Checks if a value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Checks if a value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Checks if a value is null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Checks if a value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Checks if a value is an array
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Checks if a value is an array of strings
 */
export function isStringArray(value: unknown): value is string[] {
  return isArray(value) && value.every(isString);
}

/**
 * Checks if a value is an array of numbers
 */
export function isNumberArray(value: unknown): value is number[] {
  return isArray(value) && value.every(isNumber);
}

/**
 * Type guard for checking if an object has a specific property
 */
export function hasProperty<K extends PropertyKey>(
  obj: unknown,
  prop: K
): obj is Record<K, unknown> {
  return isRecord(obj) && prop in obj;
}

/**
 * Type guard for checking multiple properties exist
 */
export function hasProperties<K extends PropertyKey>(
  obj: unknown,
  ...props: K[]
): obj is Record<K, unknown> {
  return isRecord(obj) && props.every(prop => prop in obj);
}

/**
 * Safe JSON parse with type guard
 */
export function safeJsonParse<T>(
  json: string,
  validator: (value: unknown) => value is T
): T | null {
  try {
    const parsed = JSON.parse(json);
    return validator(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Type guard for API response validation
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export function isApiResponse<T>(
  value: unknown,
  dataValidator?: (data: unknown) => data is T
): value is ApiResponse<T> {
  if (!isRecord(value)) return false;
  if (!isBoolean(value['success'])) return false;

  if (hasProperty(value, 'data') && dataValidator && !dataValidator(value['data'])) {
    return false;
  }

  if (hasProperty(value, 'error') && !isString(value['error'])) {
    return false;
  }

  return true;
}

/**
 * Type guard for pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export function isPaginationParams(value: unknown): value is PaginationParams {
  if (!isRecord(value)) return false;

  if (hasProperty(value, 'page') && !isNumber(value['page'])) return false;
  if (hasProperty(value, 'limit') && !isNumber(value['limit'])) return false;
  if (hasProperty(value, 'sort') && !isString(value['sort'])) return false;
  if (hasProperty(value, 'order') && value['order'] !== 'asc' && value['order'] !== 'desc') {
    return false;
  }

  return true;
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }

  if (isString(error)) {
    return error;
  }

  if (isRecord(error) && isString(error['message'])) {
    return error['message'];
  }

  return 'An unknown error occurred';
}

/**
 * Type guard for WebSocket message validation
 */
export interface WebSocketMessage<T = unknown> {
  type: string;
  payload?: T;
  id?: string;
}

export function isWebSocketMessage<T>(
  value: unknown,
  payloadValidator?: (payload: unknown) => payload is T
): value is WebSocketMessage<T> {
  if (!isRecord(value)) return false;
  if (!isString(value['type'])) return false;

  if (hasProperty(value, 'payload') && payloadValidator && !payloadValidator(value['payload'])) {
    return false;
  }

  if (hasProperty(value, 'id') && !isString(value['id'])) {
    return false;
  }

  return true;
}

/**
 * Assert that a value matches a type guard, throwing if not
 */
export function assertType<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  errorMessage = 'Type assertion failed'
): asserts value is T {
  if (!guard(value)) {
    throw new TypeError(errorMessage);
  }
}

/**
 * Create a type guard for a literal union type
 */
export function isLiteralUnion<T extends string | number>(
  validValues: readonly T[]
): (value: unknown) => value is T {
  const valueSet = new Set(validValues);
  return (value: unknown): value is T =>
    (isString(value) || isNumber(value)) && valueSet.has(value as T);
}
