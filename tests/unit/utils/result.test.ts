/**
 * @fileoverview Tests for Result type pattern implementation
 * @lastmodified 2025-07-28T17:45:00Z
 *
 * Features: Comprehensive testing of Result pattern with edge cases
 * Main APIs: Tests for Ok(), Err(), match(), fromPromise(), andThen()
 * Constraints: Type safety validation, error handling verification
 * Patterns: Unit testing, type checking, functional programming validation
 */

import {
  Result,
  Ok,
  Err,
  isOk,
  isErr,
  match,
  fromPromise,
  andThen,
  mapResult,
  unwrap,
  unwrapOr,
  type ServiceResult,
  wrapServiceOperation,
} from '../../../src/utils/result';

describe('Result Pattern Implementation', () => {
  describe('Basic Result Creation', () => {
    test('Ok() creates successful result', () => {
      const result = Ok('success');

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.error).toBeUndefined();
    });

    test('Err() creates error result', () => {
      const error = new Error('test error');
      const result = Err(error);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.data).toBeUndefined();
    });

    test('Ok() with complex data types', () => {
      const complexData = {
        id: 1,
        name: 'test',
        nested: { value: 42 },
      };
      const result = Ok(complexData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(complexData);
      expect(result.data.nested.value).toBe(42);
    });

    test('Err() with custom error types', () => {
      class CustomError extends Error {
        constructor(
          message: string,
          public code: number
        ) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const customError = new CustomError('custom error', 500);
      const result = Err(customError);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(CustomError);
      expect(result.error.code).toBe(500);
    });
  });

  describe('Type Guards', () => {
    test('isOk() correctly identifies successful results', () => {
      const successResult = Ok('success');
      const errorResult = Err(new Error('error'));

      expect(isOk(successResult)).toBe(true);
      expect(isOk(errorResult)).toBe(false);

      // Type narrowing test
      if (isOk(successResult)) {
        expect(successResult.data).toBe('success');
        // @ts-expect-error - error should not be accessible on Ok result
        expect(successResult.error).toBeUndefined();
      }
    });

    test('isErr() correctly identifies error results', () => {
      const successResult = Ok('success');
      const errorResult = Err(new Error('error'));

      expect(isErr(successResult)).toBe(false);
      expect(isErr(errorResult)).toBe(true);

      // Type narrowing test
      if (isErr(errorResult)) {
        expect(errorResult.error.message).toBe('error');
        // @ts-expect-error - data should not be accessible on Err result
        expect(errorResult.data).toBeUndefined();
      }
    });
  });

  describe('Pattern Matching', () => {
    test('match() handles success case', () => {
      const result = Ok(42);

      const output = match(result, {
        ok: data => `Success: ${data}`,
        err: error => `Error: ${error.message}`,
      });

      expect(output).toBe('Success: 42');
    });

    test('match() handles error case', () => {
      const result = Err(new Error('test error'));

      const output = match(result, {
        ok: data => `Success: ${data}`,
        err: error => `Error: ${error.message}`,
      });

      expect(output).toBe('Error: test error');
    });

    test('match() with different return types', () => {
      const successResult = Ok('data');
      const errorResult = Err(new Error('error'));

      const processSuccess = match(successResult, {
        ok: data => ({ processed: data, status: 'ok' }),
        err: error => ({ message: error.message, status: 'error' }),
      });

      const processError = match(errorResult, {
        ok: data => ({ processed: data, status: 'ok' }),
        err: error => ({ message: error.message, status: 'error' }),
      });

      expect(processSuccess).toEqual({ processed: 'data', status: 'ok' });
      expect(processError).toEqual({ message: 'error', status: 'error' });
    });
  });

  describe('Promise Integration', () => {
    test('fromPromise() handles successful promise', async () => {
      const successPromise = Promise.resolve('success');

      const result = await fromPromise(successPromise);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe('success');
      }
    });

    test('fromPromise() handles rejected promise', async () => {
      const errorPromise = Promise.reject(new Error('async error'));

      const result = await fromPromise(errorPromise);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toBe('async error');
      }
    });

    test('fromPromise() with custom error mapper', async () => {
      const errorPromise = Promise.reject('string error');

      const result = await fromPromise(errorPromise, error => new Error(`Mapped: ${error}`));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toBe('Mapped: string error');
      }
    });

    test('fromPromise() handles async operation', async () => {
      const asyncOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async result';
      };

      const result = await fromPromise(asyncOperation());

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe('async result');
      }
    });
  });

  describe('Functional Composition', () => {
    test('andThen() chains successful operations', () => {
      const result = Ok(5);

      const chained = andThen(result, data => Ok(data * 2));

      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.data).toBe(10);
      }
    });

    test('andThen() stops at first error', () => {
      const result = Err(new Error('initial error'));

      const chained = andThen(result, data => Ok(data * 2));

      expect(isErr(chained)).toBe(true);
      if (isErr(chained)) {
        expect(chained.error.message).toBe('initial error');
      }
    });

    test('andThen() propagates errors in chain', () => {
      const result = Ok(5);

      const chained = andThen(result, data => {
        if (data > 3) {
          return Err(new Error('too large'));
        }
        return Ok(data * 2);
      });

      expect(isErr(chained)).toBe(true);
      if (isErr(chained)) {
        expect(chained.error.message).toBe('too large');
      }
    });

    test('mapResult() transforms successful data', () => {
      const result = Ok(10);

      const mapped = mapResult(result, data => data.toString());

      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.data).toBe('10');
        expect(typeof mapped.data).toBe('string');
      }
    });

    test('mapResult() preserves errors', () => {
      const result = Err(new Error('error'));

      const mapped = mapResult(result, data => data.toString());

      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error.message).toBe('error');
      }
    });
  });

  describe('Unwrapping Utilities', () => {
    test('unwrap() returns data from successful result', () => {
      const result = Ok('success');

      expect(unwrap(result)).toBe('success');
    });

    test('unwrap() throws error from failed result', () => {
      const result = Err(new Error('test error'));

      expect(() => unwrap(result)).toThrow('test error');
    });

    test('unwrapOr() returns data from successful result', () => {
      const result = Ok('success');

      expect(unwrapOr(result, 'default')).toBe('success');
    });

    test('unwrapOr() returns default from failed result', () => {
      const result = Err(new Error('error'));

      expect(unwrapOr(result, 'default')).toBe('default');
    });

    test('unwrapOr() with function default', () => {
      const result = Err(new Error('error'));

      const defaultValue = unwrapOr(result, () => 'computed default');

      expect(defaultValue).toBe('computed default');
    });
  });

  describe('Service Operation Wrapper', () => {
    test('wrapServiceOperation() handles successful operation', async () => {
      const operation = async () => 'service result';

      const result = await wrapServiceOperation(operation, 'SERVICE_ERROR', 'Operation failed');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe('service result');
      }
    });

    test('wrapServiceOperation() handles operation errors', async () => {
      const operation = async () => {
        throw new Error('service error');
      };

      const result = await wrapServiceOperation(operation, 'SERVICE_ERROR', 'Operation failed');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SERVICE_ERROR');
        expect(result.error.message).toBe('Operation failed');
        expect(result.error.originalError?.message).toBe('service error');
      }
    });

    test('wrapServiceOperation() with metadata', async () => {
      const operation = async () => {
        throw new Error('service error');
      };

      const result = await wrapServiceOperation(operation, 'SERVICE_ERROR', 'Operation failed', {
        userId: '123',
        operation: 'test',
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.metadata).toEqual({
          userId: '123',
          operation: 'test',
        });
      }
    });
  });

  describe('Real-world Integration Examples', () => {
    // Mock database operation
    const mockDbOperation = async (shouldFail: boolean): Promise<{ id: number; name: string }> => {
      if (shouldFail) {
        throw new Error('Database connection failed');
      }
      return { id: 1, name: 'test user' };
    };

    test('Database operation with Result pattern', async () => {
      const getUserSafe = async (
        id: string
      ): Promise<ServiceResult<{ id: number; name: string }>> =>
        wrapServiceOperation(
          () => mockDbOperation(false),
          'USER_FETCH_FAILED',
          `Failed to fetch user ${id}`
        );

      const result = await getUserSafe('123');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.id).toBe(1);
        expect(result.data.name).toBe('test user');
      }
    });

    test('Error handling in database operation', async () => {
      const getUserSafe = async (
        id: string
      ): Promise<ServiceResult<{ id: number; name: string }>> =>
        wrapServiceOperation(
          () => mockDbOperation(true),
          'USER_FETCH_FAILED',
          `Failed to fetch user ${id}`
        );

      const result = await getUserSafe('123');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('USER_FETCH_FAILED');
        expect(result.error.message).toBe('Failed to fetch user 123');
        expect(result.error.originalError?.message).toBe('Database connection failed');
      }
    });

    test('Chaining operations with Result pattern', async () => {
      interface User {
        id: number;
        name: string;
      }
      interface UserProfile {
        user: User;
        preferences: object;
      }

      const getUser = (): Result<User, Error> => Ok({ id: 1, name: 'test' });
      const getPreferences = (user: User): Result<object, Error> =>
        Ok({ theme: 'dark', lang: 'en' });

      const buildProfile =
        (user: User) =>
        (prefs: object): UserProfile => ({
          user,
          preferences: prefs,
        });

      const result = andThen(getUser(), user =>
        mapResult(getPreferences(user), buildProfile(user))
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.user.name).toBe('test');
        expect(result.data.preferences).toEqual({ theme: 'dark', lang: 'en' });
      }
    });
  });

  describe('Type Safety and Edge Cases', () => {
    test('Result with null data', () => {
      const result = Ok(null);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    test('Result with undefined data', () => {
      const result = Ok(undefined);

      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    test('Result with complex nested types', () => {
      interface NestedData {
        level1: {
          level2: {
            value: string;
            array: number[];
          };
        };
      }

      const complexData: NestedData = {
        level1: {
          level2: {
            value: 'nested',
            array: [1, 2, 3],
          },
        },
      };

      const result = Ok(complexData);

      expect(result.success).toBe(true);
      expect(result.data.level1.level2.value).toBe('nested');
      expect(result.data.level1.level2.array).toEqual([1, 2, 3]);
    });

    test('Error with custom properties', () => {
      interface CustomError extends Error {
        code: string;
        statusCode: number;
        details?: object;
      }

      const createCustomError = (
        message: string,
        code: string,
        statusCode: number
      ): CustomError => {
        const error = new Error(message) as CustomError;
        error.code = code;
        error.statusCode = statusCode;
        error.details = { timestamp: Date.now() };
        return error;
      };

      const customError = createCustomError('Custom error', 'CUSTOM_ERROR', 400);
      const result = Err(customError);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('CUSTOM_ERROR');
        expect(result.error.statusCode).toBe(400);
        expect(result.error.details).toBeDefined();
      }
    });
  });
});
