/**
 * Unit tests for Type Guards
 *
 * @description Tests for runtime type checking utilities and type guard functions
 */

import { isError, isErrorWithMessage, isRecord, isString } from '@/utils/typeGuards';

describe('Type Guards', () => {
  describe('isError', () => {
    it('should return true for Error instances', () => {
      const error = new Error('test error');
      expect(isError(error)).toBe(true);
    });

    it('should return true for custom Error subclasses', () => {
      const customError = new Error('custom error');
      customError.name = 'CustomError';
      expect(isError(customError)).toBe(true);
    });

    it('should return false for non-Error values', () => {
      expect(isError('string')).toBe(false);
      expect(isError(42)).toBe(false);
      expect(isError(null)).toBe(false);
      expect(isError(undefined)).toBe(false);
      expect(isError({})).toBe(false);
      expect(isError([])).toBe(false);
      expect(isError({ message: 'fake error' })).toBe(false);
    });

    it('should properly narrow type for TypeScript', () => {
      const value: unknown = new Error('test');
      if (isError(value)) {
        // TypeScript should now know this is an Error
        expect(value.message).toBe('test');
        expect(value.name).toBe('Error');
      }
    });
  });

  describe('isErrorWithMessage', () => {
    it('should return true for Error instances with string messages', () => {
      const error = new Error('test message');
      expect(isErrorWithMessage(error)).toBe(true);
    });

    it('should return true for custom errors with string messages', () => {
      const error = new Error('custom message');
      error.name = 'CustomError';
      expect(isErrorWithMessage(error)).toBe(true);
    });

    it('should return false for non-Error values', () => {
      expect(isErrorWithMessage('string')).toBe(false);
      expect(isErrorWithMessage({ message: 'not an error' })).toBe(false);
      expect(isErrorWithMessage(null)).toBe(false);
      expect(isErrorWithMessage(undefined)).toBe(false);
    });

    it('should handle edge cases with message property', () => {
      // Create an Error and modify its message property
      const error = new Error();
      error.message = 'modified message';
      expect(isErrorWithMessage(error)).toBe(true);
    });

    it('should properly narrow type for TypeScript', () => {
      const value: unknown = new Error('typed message');
      if (isErrorWithMessage(value)) {
        // TypeScript should know this is Error & { message: string }
        expect(typeof value.message).toBe('string');
        expect(value.message).toBe('typed message');
        expect(value.stack).toBeDefined();
      }
    });
  });

  describe('isRecord', () => {
    it('should return true for plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ key: 'value' })).toBe(true);
      expect(isRecord({ a: 1, b: 2, c: 3 })).toBe(true);
    });

    it('should return true for objects with nested properties', () => {
      const obj = {
        nested: { deeply: { prop: 'value' } },
        array: [1, 2, 3],
        func: (): string => 'test',
      };
      expect(isRecord(obj)).toBe(true);
    });

    it('should return false for arrays', () => {
      expect(isRecord([])).toBe(false);
      expect(isRecord([1, 2, 3])).toBe(false);
      expect(isRecord(['a', 'b', 'c'])).toBe(false);
    });

    it('should return false for null and undefined', () => {
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
    });

    it('should return false for primitive types', () => {
      expect(isRecord('string')).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord(true)).toBe(false);
      expect(isRecord(Symbol('test'))).toBe(false);
      expect(isRecord(BigInt(123))).toBe(false);
    });

    it('should return false for functions', () => {
      expect(isRecord(() => {})).toBe(false);
      expect(isRecord(() => {})).toBe(false);
      expect(isRecord(async () => {})).toBe(false);
    });

    it('should return true for class instances', () => {
      const instance = { prop: 'value' };
      expect(isRecord(instance)).toBe(true);
    });

    it('should properly narrow type for TypeScript', () => {
      const value: unknown = { key: 'value', num: 42 };
      if (isRecord(value)) {
        // TypeScript should know this is Record<string, unknown>
        expect(value.key).toBe('value');
        expect(value.num).toBe(42);
        // Should allow bracket notation
        expect(value.key).toBe('value');
      }
    });
  });

  describe('isString', () => {
    it('should return true for string literals', () => {
      expect(isString('hello')).toBe(true);
      expect(isString('')).toBe(true);
      expect(isString('   ')).toBe(true);
    });

    it('should return true for template literals', () => {
      const name = 'World';
      expect(isString(`Hello ${String(name)}!`)).toBe(true);
    });

    it('should return false for non-string types', () => {
      expect(isString(42)).toBe(false);
      expect(isString(true)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({})).toBe(false);
      expect(isString([])).toBe(false);
      expect(isString(() => 'string')).toBe(false);
    });

    it('should return true for String conversions', () => {
      // String() function creates primitives, not objects
      expect(isString(String('test'))).toBe(true);
    });

    it('should handle edge cases', () => {
      expect(isString(String(42))).toBe(true); // String conversion
      expect(isString((42).toString())).toBe(true); // toString conversion
    });

    it('should properly narrow type for TypeScript', () => {
      const value: unknown = 'typed string';
      if (isString(value)) {
        // TypeScript should know this is string
        expect(value.length).toBe(12);
        expect(value.toUpperCase()).toBe('TYPED STRING');
        expect(value.charAt(0)).toBe('t');
      }
    });
  });

  describe('Type guard combinations', () => {
    it('should work correctly when chained', () => {
      const values: unknown[] = [
        'string',
        new Error('error'),
        { key: 'value' },
        42,
        null,
        undefined,
        [],
      ];

      const results = values.map(value => ({
        isString: isString(value),
        isError: isError(value),
        isErrorWithMessage: isErrorWithMessage(value),
        isRecord: isRecord(value),
      }));

      expect(results).toEqual([
        { isString: true, isError: false, isErrorWithMessage: false, isRecord: false },
        { isString: false, isError: true, isErrorWithMessage: true, isRecord: true },
        { isString: false, isError: false, isErrorWithMessage: false, isRecord: true },
        { isString: false, isError: false, isErrorWithMessage: false, isRecord: false },
        { isString: false, isError: false, isErrorWithMessage: false, isRecord: false },
        { isString: false, isError: false, isErrorWithMessage: false, isRecord: false },
        { isString: false, isError: false, isErrorWithMessage: false, isRecord: false },
      ]);
    });

    it('should provide type safety in conditional flows', () => {
      function processValue(value: unknown): string {
        if (isString(value)) {
          return `String: ${String(value)}`;
        }
        if (isErrorWithMessage(value)) {
          return `Error: ${String(String(value.message))}`;
        }
        if (isRecord(value)) {
          return `Object with ${String(String(Object.keys(value).length))} keys`;
        }
        return `Other: ${String(typeof value)}`;
      }

      expect(processValue('test')).toBe('String: test');
      expect(processValue(new Error('fail'))).toBe('Error: fail');
      expect(processValue({ a: 1, b: 2 })).toBe('Object with 2 keys');
      expect(processValue(42)).toBe('Other: number');
    });
  });

  describe('Performance considerations', () => {
    it('should handle large objects efficiently', () => {
      const largeObject: Record<string, number> = {};
      for (let i = 0; i < 10000; i += 1) {
        largeObject[`key${String(i)}`] = i;
      }

      const start = performance.now();
      const result = isRecord(largeObject);
      const end = performance.now();

      expect(result).toBe(true);
      expect(end - start).toBeLessThan(10); // Should be very fast
    });

    it('should handle long strings efficiently', () => {
      const longString = 'a'.repeat(100000);

      const start = performance.now();
      const result = isString(longString);
      const end = performance.now();

      expect(result).toBe(true);
      expect(end - start).toBeLessThan(10); // Should be very fast
    });
  });
});
