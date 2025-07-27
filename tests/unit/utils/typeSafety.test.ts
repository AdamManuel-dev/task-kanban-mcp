/**
 * Type Safety Tests
 * Comprehensive tests for type guards, validation, and type safety features
 */

import {
  isError,
  isErrorWithMessage,
  isRecord,
  isString,
  isNumber,
  isBoolean,
  isNullish,
  isDefined,
  isArray,
  isStringArray,
  isNumberArray,
  hasProperty,
  hasProperties,
  safeJsonParse,
  isApiResponse,
  isPaginationParams,
  getErrorMessage,
  isWebSocketMessage,
  assertType,
  isLiteralUnion,
  type ApiResponse,
  type PaginationParams,
  type WebSocketMessage
} from '@/utils/typeGuards';

describe('Type Safety Tests', () => {
  describe('Basic Type Guards', () => {
    describe('isError', () => {
      it('should identify Error instances', () => {
        expect(isError(new Error('test'))).toBe(true);
        expect(isError(new TypeError('test'))).toBe(true);
        expect(isError(new ReferenceError('test'))).toBe(true);
      });

      it('should reject non-Error values', () => {
        expect(isError('error')).toBe(false);
        expect(isError({ message: 'error' })).toBe(false);
        expect(isError(null)).toBe(false);
        expect(isError(undefined)).toBe(false);
        expect(isError(123)).toBe(false);
        expect(isError([])).toBe(false);
      });
    });

    describe('isErrorWithMessage', () => {
      it('should identify Errors with string messages', () => {
        expect(isErrorWithMessage(new Error('test message'))).toBe(true);
        expect(isErrorWithMessage(new TypeError('type error'))).toBe(true);
      });

      it('should reject Errors without proper messages', () => {
        const errorWithoutMessage = new Error();
        (errorWithoutMessage as any).message = undefined;
        expect(isErrorWithMessage(errorWithoutMessage)).toBe(false);
        
        const errorWithNumberMessage = new Error();
        (errorWithNumberMessage as any).message = 123;
        expect(isErrorWithMessage(errorWithNumberMessage)).toBe(false);
      });

      it('should reject non-Error values', () => {
        expect(isErrorWithMessage({ message: 'test' })).toBe(false);
        expect(isErrorWithMessage('error')).toBe(false);
      });
    });

    describe('isRecord', () => {
      it('should identify plain objects', () => {
        expect(isRecord({})).toBe(true);
        expect(isRecord({ key: 'value' })).toBe(true);
        expect(isRecord(Object.create(null))).toBe(true);
      });

      it('should reject non-objects', () => {
        expect(isRecord(null)).toBe(false);
        expect(isRecord(undefined)).toBe(false);
        expect(isRecord('string')).toBe(false);
        expect(isRecord(123)).toBe(false);
        expect(isRecord([])).toBe(false);
        expect(isRecord(new Date())).toBe(true); // Dates are objects
        expect(isRecord(new Error())).toBe(true); // Errors are objects
      });
    });

    describe('isString', () => {
      it('should identify strings', () => {
        expect(isString('')).toBe(true);
        expect(isString('hello')).toBe(true);
        expect(isString('123')).toBe(true);
      });

      it('should reject non-strings', () => {
        expect(isString(123)).toBe(false);
        expect(isString(null)).toBe(false);
        expect(isString(undefined)).toBe(false);
        expect(isString({})).toBe(false);
        expect(isString([])).toBe(false);
        expect(isString(true)).toBe(false);
      });
    });

    describe('isNumber', () => {
      it('should identify valid numbers', () => {
        expect(isNumber(0)).toBe(true);
        expect(isNumber(-1)).toBe(true);
        expect(isNumber(1.5)).toBe(true);
        expect(isNumber(Infinity)).toBe(true);
        expect(isNumber(-Infinity)).toBe(true);
      });

      it('should reject invalid numbers and non-numbers', () => {
        expect(isNumber(NaN)).toBe(false);
        expect(isNumber('123')).toBe(false);
        expect(isNumber(null)).toBe(false);
        expect(isNumber(undefined)).toBe(false);
        expect(isNumber({})).toBe(false);
        expect(isNumber([])).toBe(false);
      });
    });

    describe('isBoolean', () => {
      it('should identify booleans', () => {
        expect(isBoolean(true)).toBe(true);
        expect(isBoolean(false)).toBe(true);
      });

      it('should reject non-booleans', () => {
        expect(isBoolean(1)).toBe(false);
        expect(isBoolean(0)).toBe(false);
        expect(isBoolean('true')).toBe(false);
        expect(isBoolean(null)).toBe(false);
        expect(isBoolean(undefined)).toBe(false);
        expect(isBoolean({})).toBe(false);
      });
    });

    describe('isNullish', () => {
      it('should identify null and undefined', () => {
        expect(isNullish(null)).toBe(true);
        expect(isNullish(undefined)).toBe(true);
      });

      it('should reject non-nullish values', () => {
        expect(isNullish(0)).toBe(false);
        expect(isNullish('')).toBe(false);
        expect(isNullish(false)).toBe(false);
        expect(isNullish({})).toBe(false);
        expect(isNullish([])).toBe(false);
      });
    });

    describe('isDefined', () => {
      it('should identify defined values', () => {
        expect(isDefined(0)).toBe(true);
        expect(isDefined('')).toBe(true);
        expect(isDefined(false)).toBe(true);
        expect(isDefined({})).toBe(true);
        expect(isDefined([])).toBe(true);
      });

      it('should reject null and undefined', () => {
        expect(isDefined(null)).toBe(false);
        expect(isDefined(undefined)).toBe(false);
      });
    });
  });

  describe('Array Type Guards', () => {
    describe('isArray', () => {
      it('should identify arrays', () => {
        expect(isArray([])).toBe(true);
        expect(isArray([1, 2, 3])).toBe(true);
        expect(isArray(['a', 'b'])).toBe(true);
        expect(isArray(new Array(5))).toBe(true);
      });

      it('should reject non-arrays', () => {
        expect(isArray({})).toBe(false);
        expect(isArray('string')).toBe(false);
        expect(isArray(null)).toBe(false);
        expect(isArray(undefined)).toBe(false);
        expect(isArray(123)).toBe(false);
      });
    });

    describe('isStringArray', () => {
      it('should identify string arrays', () => {
        expect(isStringArray([])).toBe(true);
        expect(isStringArray(['hello'])).toBe(true);
        expect(isStringArray(['a', 'b', 'c'])).toBe(true);
      });

      it('should reject mixed or non-string arrays', () => {
        expect(isStringArray([1, 2, 3])).toBe(false);
        expect(isStringArray(['a', 1, 'b'])).toBe(false);
        expect(isStringArray([null])).toBe(false);
        expect(isStringArray([undefined])).toBe(false);
        expect(isStringArray('not array')).toBe(false);
      });
    });

    describe('isNumberArray', () => {
      it('should identify number arrays', () => {
        expect(isNumberArray([])).toBe(true);
        expect(isNumberArray([1])).toBe(true);
        expect(isNumberArray([1, 2, 3])).toBe(true);
        expect(isNumberArray([0, -1, 1.5])).toBe(true);
      });

      it('should reject mixed or non-number arrays', () => {
        expect(isNumberArray(['a', 'b'])).toBe(false);
        expect(isNumberArray([1, 'a', 2])).toBe(false);
        expect(isNumberArray([NaN])).toBe(false);
        expect(isNumberArray([null])).toBe(false);
        expect(isNumberArray('not array')).toBe(false);
      });
    });
  });

  describe('Property Type Guards', () => {
    describe('hasProperty', () => {
      it('should identify objects with specific properties', () => {
        expect(hasProperty({ name: 'test' }, 'name')).toBe(true);
        expect(hasProperty({ a: 1, b: 2 }, 'a')).toBe(true);
        expect(hasProperty({ a: 1, b: 2 }, 'b')).toBe(true);
      });

      it('should reject objects without the property', () => {
        expect(hasProperty({}, 'name')).toBe(false);
        expect(hasProperty({ a: 1 }, 'b')).toBe(false);
        expect(hasProperty(null, 'name')).toBe(false);
        expect(hasProperty('string', 'length')).toBe(false); // strings aren't records
      });
    });

    describe('hasProperties', () => {
      it('should identify objects with all specified properties', () => {
        expect(hasProperties({ a: 1, b: 2, c: 3 }, 'a', 'b')).toBe(true);
        expect(hasProperties({ name: 'test', id: 1 }, 'name', 'id')).toBe(true);
      });

      it('should reject objects missing any property', () => {
        expect(hasProperties({ a: 1 }, 'a', 'b')).toBe(false);
        expect(hasProperties({}, 'a')).toBe(false);
        expect(hasProperties(null, 'a')).toBe(false);
      });
    });
  });

  describe('Complex Type Guards', () => {
    describe('safeJsonParse', () => {
      const isStringValidator = (value: unknown): value is string => typeof value === 'string';

      it('should parse valid JSON with correct type', () => {
        expect(safeJsonParse('"hello"', isStringValidator)).toBe('hello');
        expect(safeJsonParse('123', isNumber)).toBe(123);
        expect(safeJsonParse('true', isBoolean)).toBe(true);
      });

      it('should return null for invalid JSON', () => {
        expect(safeJsonParse('invalid json', isStringValidator)).toBe(null);
        expect(safeJsonParse('{unclosed', isRecord)).toBe(null);
      });

      it('should return null for wrong type', () => {
        expect(safeJsonParse('123', isStringValidator)).toBe(null);
        expect(safeJsonParse('"hello"', isNumber)).toBe(null);
      });
    });

    describe('isApiResponse', () => {
      it('should identify valid API responses', () => {
        expect(isApiResponse({ success: true })).toBe(true);
        expect(isApiResponse({ success: false, error: 'test' })).toBe(true);
        expect(isApiResponse({ success: true, data: 'test' })).toBe(true);
      });

      it('should validate data with custom validator', () => {
        const response = { success: true, data: 'test' };
        expect(isApiResponse(response, isString)).toBe(true);
        expect(isApiResponse(response, isNumber)).toBe(false);
      });

      it('should reject invalid API responses', () => {
        expect(isApiResponse({})).toBe(false); // missing success
        expect(isApiResponse({ success: 'true' })).toBe(false); // wrong success type
        expect(isApiResponse({ success: true, error: 123 })).toBe(false); // wrong error type
        expect(isApiResponse(null)).toBe(false);
        expect(isApiResponse('string')).toBe(false);
      });
    });

    describe('isPaginationParams', () => {
      it('should identify valid pagination parameters', () => {
        expect(isPaginationParams({})).toBe(true);
        expect(isPaginationParams({ page: 1 })).toBe(true);
        expect(isPaginationParams({ limit: 10 })).toBe(true);
        expect(isPaginationParams({ sort: 'name' })).toBe(true);
        expect(isPaginationParams({ order: 'asc' })).toBe(true);
        expect(isPaginationParams({ order: 'desc' })).toBe(true);
        expect(isPaginationParams({ page: 1, limit: 10, sort: 'name', order: 'asc' })).toBe(true);
      });

      it('should reject invalid pagination parameters', () => {
        expect(isPaginationParams({ page: 'invalid' })).toBe(false);
        expect(isPaginationParams({ limit: '10' })).toBe(false);
        expect(isPaginationParams({ sort: 123 })).toBe(false);
        expect(isPaginationParams({ order: 'invalid' })).toBe(false);
        expect(isPaginationParams(null)).toBe(false);
        expect(isPaginationParams('string')).toBe(false);
      });
    });

    describe('isWebSocketMessage', () => {
      it('should identify valid WebSocket messages', () => {
        expect(isWebSocketMessage({ type: 'test' })).toBe(true);
        expect(isWebSocketMessage({ type: 'test', payload: 'data' })).toBe(true);
        expect(isWebSocketMessage({ type: 'test', id: '123' })).toBe(true);
        expect(isWebSocketMessage({ type: 'test', payload: 'data', id: '123' })).toBe(true);
      });

      it('should validate payload with custom validator', () => {
        const message = { type: 'test', payload: 'data' };
        expect(isWebSocketMessage(message, isString)).toBe(true);
        expect(isWebSocketMessage(message, isNumber)).toBe(false);
      });

      it('should reject invalid WebSocket messages', () => {
        expect(isWebSocketMessage({})).toBe(false); // missing type
        expect(isWebSocketMessage({ type: 123 })).toBe(false); // wrong type type
        expect(isWebSocketMessage({ type: 'test', id: 123 })).toBe(false); // wrong id type
        expect(isWebSocketMessage(null)).toBe(false);
        expect(isWebSocketMessage('string')).toBe(false);
      });
    });
  });

  describe('Utility Functions', () => {
    describe('getErrorMessage', () => {
      it('should extract message from Error objects', () => {
        expect(getErrorMessage(new Error('test message'))).toBe('test message');
        expect(getErrorMessage(new TypeError('type error'))).toBe('type error');
      });

      it('should return string errors directly', () => {
        expect(getErrorMessage('string error')).toBe('string error');
      });

      it('should extract message from error-like objects', () => {
        expect(getErrorMessage({ message: 'object error' })).toBe('object error');
      });

      it('should return default message for unknown errors', () => {
        expect(getErrorMessage(null)).toBe('An unknown error occurred');
        expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
        expect(getErrorMessage(123)).toBe('An unknown error occurred');
        expect(getErrorMessage({})).toBe('An unknown error occurred');
        expect(getErrorMessage({ message: 123 })).toBe('An unknown error occurred');
      });
    });

    describe('assertType', () => {
      it('should pass for valid types', () => {
        expect(() => assertType('test', isString)).not.toThrow();
        expect(() => assertType(123, isNumber)).not.toThrow();
        expect(() => assertType(true, isBoolean)).not.toThrow();
      });

      it('should throw for invalid types', () => {
        expect(() => assertType(123, isString)).toThrow(TypeError);
        expect(() => assertType('test', isNumber)).toThrow(TypeError);
        expect(() => assertType(123, isBoolean)).toThrow(TypeError);
      });

      it('should use custom error messages', () => {
        expect(() => assertType(123, isString, 'Custom error message')).toThrow('Custom error message');
      });
    });

    describe('isLiteralUnion', () => {
      it('should create validators for string unions', () => {
        const isStatus = isLiteralUnion(['active', 'inactive', 'pending'] as const);
        
        expect(isStatus('active')).toBe(true);
        expect(isStatus('inactive')).toBe(true);
        expect(isStatus('pending')).toBe(true);
        expect(isStatus('invalid')).toBe(false);
        expect(isStatus(123)).toBe(false);
        expect(isStatus(null)).toBe(false);
      });

      it('should create validators for number unions', () => {
        const isPriority = isLiteralUnion([1, 2, 3, 4, 5] as const);
        
        expect(isPriority(1)).toBe(true);
        expect(isPriority(3)).toBe(true);
        expect(isPriority(5)).toBe(true);
        expect(isPriority(6)).toBe(false);
        expect(isPriority('1')).toBe(false);
        expect(isPriority(null)).toBe(false);
      });

      it('should handle mixed string/number unions', () => {
        const isMixed = isLiteralUnion(['zero', 1, 'two', 3] as const);
        
        expect(isMixed('zero')).toBe(true);
        expect(isMixed(1)).toBe(true);
        expect(isMixed('two')).toBe(true);
        expect(isMixed(3)).toBe(true);
        expect(isMixed('one')).toBe(false);
        expect(isMixed(2)).toBe(false);
      });
    });
  });

  describe('Edge Cases and Security', () => {
    describe('Prototype pollution protection', () => {
      it('should not be fooled by prototype pollution', () => {
        const maliciousObj = JSON.parse('{"__proto__": {"isAdmin": true}}');
        expect(hasProperty(maliciousObj, 'isAdmin')).toBe(false);
        expect(isRecord(maliciousObj)).toBe(true);
      });
    });

    describe('Type narrowing correctness', () => {
      it('should correctly narrow types in conditionals', () => {
        const unknownValue: unknown = 'test';
        
        if (isString(unknownValue)) {
          // TypeScript should know this is a string
          expect(unknownValue.length).toBe(4);
          expect(unknownValue.toUpperCase()).toBe('TEST');
        }
      });

      it('should handle union type narrowing', () => {
        const value: string | number | null = 'test';
        
        if (isDefined(value)) {
          // TypeScript should know this is string | number
          if (isString(value)) {
            expect(value.length).toBe(4);
          }
        }
      });
    });

    describe('Performance with large objects', () => {
      it('should handle large objects efficiently', () => {
        const largeObject: Record<string, number> = {};
        for (let i = 0; i < 10000; i++) {
          largeObject[`key${i}`] = i;
        }

        const start = performance.now();
        const result = isRecord(largeObject);
        const end = performance.now();

        expect(result).toBe(true);
        expect(end - start).toBeLessThan(10); // Should be very fast
      });

      it('should handle deep nested objects', () => {
        let nested: any = {};
        let current = nested;
        
        // Create a deeply nested object
        for (let i = 0; i < 100; i++) {
          current.child = {};
          current = current.child;
        }

        expect(isRecord(nested)).toBe(true);
        expect(isRecord(nested.child)).toBe(true);
      });
    });
  });

  describe('Real-world Usage Scenarios', () => {
    describe('API response validation', () => {
      it('should validate task API responses', () => {
        const taskResponse = {
          success: true,
          data: {
            id: 'task-1',
            title: 'Test Task',
            description: 'Test Description',
            status: 'todo',
            priority: 5
          }
        };

        expect(isApiResponse(taskResponse)).toBe(true);
        
        const isTaskData = (data: unknown): data is any => {
          return isRecord(data) &&
                 isString(data.id) &&
                 isString(data.title) &&
                 (data.description === undefined || isString(data.description));
        };

        expect(isApiResponse(taskResponse, isTaskData)).toBe(true);
      });

      it('should handle malformed API responses', () => {
        const responses = [
          { success: 'true' }, // wrong type
          { data: 'test' }, // missing success
          { success: true, error: 123 }, // wrong error type
          null,
          undefined,
          'not an object'
        ];

        responses.forEach(response => {
          expect(isApiResponse(response)).toBe(false);
        });
      });
    });

    describe('User input validation', () => {
      it('should validate form data safely', () => {
        const formData = {
          title: 'Task Title',
          description: 'Task Description',
          priority: 5,
          tags: ['urgent', 'bug'],
          dueDate: '2024-12-31'
        };

        expect(isRecord(formData)).toBe(true);
        expect(hasProperties(formData, 'title', 'priority')).toBe(true);
        expect(isString(formData.title)).toBe(true);
        expect(isNumber(formData.priority)).toBe(true);
        expect(isStringArray(formData.tags)).toBe(true);
      });

      it('should reject malicious input', () => {
        const maliciousInputs = [
          '{"__proto__": {"isAdmin": true}}',
          '{"constructor": {"prototype": {"isAdmin": true}}}',
          'null',
          'undefined',
          '[]',
          'function(){}'
        ];

        maliciousInputs.forEach(input => {
          const parsed = safeJsonParse(input, isRecord);
          if (parsed) {
            expect(hasProperty(parsed, 'isAdmin')).toBe(false);
          }
        });
      });
    });

    describe('WebSocket message handling', () => {
      it('should validate WebSocket messages with typed payloads', () => {
        const taskUpdateMessage = {
          type: 'task:updated',
          payload: {
            taskId: 'task-1',
            changes: { status: 'completed' }
          },
          id: 'msg-123'
        };

        const isTaskUpdatePayload = (payload: unknown): payload is any => {
          return isRecord(payload) &&
                 isString(payload.taskId) &&
                 isRecord(payload.changes);
        };

        expect(isWebSocketMessage(taskUpdateMessage, isTaskUpdatePayload)).toBe(true);
      });
    });
  });
});