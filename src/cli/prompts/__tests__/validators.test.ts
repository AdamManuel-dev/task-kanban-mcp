/**
 * Unit tests for validator functions
 */

import {
  validateTaskTitle,
  validatePriority,
  validateTaskSize,
  validateEmail,
  validateURL,
  validateRequired,
  validateMinLength,
  validateMaxLength,
  validateNumeric,
  validateDate,
  TaskSchema,
  BoardSchema,
  UserSchema,
} from '../validators';

describe('Validator Functions', () => {
  describe('validateTaskTitle', () => {
    it('should accept valid task titles', () => {
      expect(validateTaskTitle('Fix login bug')).toBe(true);
      expect(validateTaskTitle('Implement user authentication')).toBe(true);
      expect(validateTaskTitle('A')).toBe(true); // Minimum length
      expect(validateTaskTitle('a'.repeat(200))).toBe(true); // Maximum length
    });

    it('should reject empty titles', () => {
      expect(validateTaskTitle('')).toBe('Task title is required');
      expect(validateTaskTitle('   ')).toBe('Task title is required');
    });

    it('should reject titles that are too long', () => {
      const longTitle = 'a'.repeat(201);
      expect(validateTaskTitle(longTitle)).toBe('Task title must be 200 characters or less');
    });

    it('should reject titles with only special characters', () => {
      expect(validateTaskTitle('!!!')).toBe('Task title must contain at least one letter or number');
      expect(validateTaskTitle('---')).toBe('Task title must contain at least one letter or number');
    });

    it('should reject titles with reserved keywords', () => {
      expect(validateTaskTitle('TODO')).toBe('Task title cannot be a reserved keyword');
      expect(validateTaskTitle('DONE')).toBe('Task title cannot be a reserved keyword');
      expect(validateTaskTitle('NULL')).toBe('Task title cannot be a reserved keyword');
    });

    it('should handle mixed case reserved keywords', () => {
      expect(validateTaskTitle('todo')).toBe('Task title cannot be a reserved keyword');
      expect(validateTaskTitle('Done')).toBe('Task title cannot be a reserved keyword');
    });
  });

  describe('validatePriority', () => {
    it('should accept valid priorities', () => {
      expect(validatePriority('P1')).toBe(true);
      expect(validatePriority('P2')).toBe(true);
      expect(validatePriority('P3')).toBe(true);
      expect(validatePriority('P4')).toBe(true);
    });

    it('should reject invalid priorities', () => {
      expect(validatePriority('P0')).toBe('Priority must be P1, P2, P3, or P4');
      expect(validatePriority('P5')).toBe('Priority must be P1, P2, P3, or P4');
      expect(validatePriority('HIGH')).toBe('Priority must be P1, P2, P3, or P4');
      expect(validatePriority('')).toBe('Priority must be P1, P2, P3, or P4');
    });

    it('should handle case sensitivity', () => {
      expect(validatePriority('p1')).toBe('Priority must be P1, P2, P3, or P4');
      expect(validatePriority('p2')).toBe('Priority must be P1, P2, P3, or P4');
    });
  });

  describe('validateTaskSize', () => {
    it('should accept valid task sizes', () => {
      expect(validateTaskSize('XS')).toBe(true);
      expect(validateTaskSize('S')).toBe(true);
      expect(validateTaskSize('M')).toBe(true);
      expect(validateTaskSize('L')).toBe(true);
      expect(validateTaskSize('XL')).toBe(true);
    });

    it('should reject invalid task sizes', () => {
      expect(validateTaskSize('XXL')).toBe('Task size must be XS, S, M, L, or XL');
      expect(validateTaskSize('SMALL')).toBe('Task size must be XS, S, M, L, or XL');
      expect(validateTaskSize('')).toBe('Task size must be XS, S, M, L, or XL');
    });

    it('should handle case sensitivity', () => {
      expect(validateTaskSize('xs')).toBe('Task size must be XS, S, M, L, or XL');
      expect(validateTaskSize('m')).toBe('Task size must be XS, S, M, L, or XL');
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.email+tag@domain.co.uk')).toBe(true);
      expect(validateEmail('user123@test-domain.org')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe('Please enter a valid email address');
      expect(validateEmail('user@')).toBe('Please enter a valid email address');
      expect(validateEmail('@domain.com')).toBe('Please enter a valid email address');
      expect(validateEmail('user..double@domain.com')).toBe('Please enter a valid email address');
    });

    it('should handle empty emails', () => {
      expect(validateEmail('')).toBe('Please enter a valid email address');
    });
  });

  describe('validateURL', () => {
    it('should accept valid URLs', () => {
      expect(validateURL('https://example.com')).toBe(true);
      expect(validateURL('http://test.org/path?query=value')).toBe(true);
      expect(validateURL('https://sub.domain.com:8080/path')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateURL('not-a-url')).toBe('Please enter a valid URL');
      expect(validateURL('ftp://invalid.com')).toBe('Please enter a valid URL');
      expect(validateURL('https://')).toBe('Please enter a valid URL');
    });

    it('should handle empty URLs', () => {
      expect(validateURL('')).toBe('Please enter a valid URL');
    });
  });

  describe('validateRequired', () => {
    it('should accept non-empty values', () => {
      expect(validateRequired('value')).toBe(true);
      expect(validateRequired('0')).toBe(true);
      expect(validateRequired('false')).toBe(true);
    });

    it('should reject empty values', () => {
      expect(validateRequired('')).toBe('This field is required');
      expect(validateRequired('   ')).toBe('This field is required');
    });

    it('should accept custom message', () => {
      expect(validateRequired('', 'Name is required')).toBe('Name is required');
    });
  });

  describe('validateMinLength', () => {
    it('should accept strings meeting minimum length', () => {
      expect(validateMinLength('hello', 3)).toBe(true);
      expect(validateMinLength('test', 4)).toBe(true);
      expect(validateMinLength('longer', 3)).toBe(true);
    });

    it('should reject strings below minimum length', () => {
      expect(validateMinLength('hi', 3)).toBe('Must be at least 3 characters long');
      expect(validateMinLength('a', 5)).toBe('Must be at least 5 characters long');
    });

    it('should handle empty strings', () => {
      expect(validateMinLength('', 1)).toBe('Must be at least 1 characters long');
    });
  });

  describe('validateMaxLength', () => {
    it('should accept strings within maximum length', () => {
      expect(validateMaxLength('hello', 10)).toBe(true);
      expect(validateMaxLength('test', 4)).toBe(true);
      expect(validateMaxLength('', 5)).toBe(true);
    });

    it('should reject strings exceeding maximum length', () => {
      expect(validateMaxLength('toolong', 5)).toBe('Must be no more than 5 characters long');
      expect(validateMaxLength('verylongstring', 10)).toBe('Must be no more than 10 characters long');
    });
  });

  describe('validateNumeric', () => {
    it('should accept valid numbers', () => {
      expect(validateNumeric('123')).toBe(true);
      expect(validateNumeric('0')).toBe(true);
      expect(validateNumeric('-45')).toBe(true);
      expect(validateNumeric('3.14')).toBe(true);
    });

    it('should reject non-numeric values', () => {
      expect(validateNumeric('abc')).toBe('Must be a valid number');
      expect(validateNumeric('12abc')).toBe('Must be a valid number');
      expect(validateNumeric('')).toBe('Must be a valid number');
    });
  });

  describe('validateDate', () => {
    it('should accept valid dates', () => {
      expect(validateDate('2024-01-15')).toBe(true);
      expect(validateDate('2024-12-31')).toBe(true);
      expect(validateDate('2023-02-28')).toBe(true);
    });

    it('should reject invalid dates', () => {
      expect(validateDate('invalid-date')).toBe('Must be a valid date (YYYY-MM-DD)');
      expect(validateDate('2024-13-01')).toBe('Must be a valid date (YYYY-MM-DD)');
      expect(validateDate('2024-02-30')).toBe('Must be a valid date (YYYY-MM-DD)');
      expect(validateDate('')).toBe('Must be a valid date (YYYY-MM-DD)');
    });

    it('should handle different date formats', () => {
      expect(validateDate('01/15/2024')).toBe('Must be a valid date (YYYY-MM-DD)');
      expect(validateDate('2024/01/15')).toBe('Must be a valid date (YYYY-MM-DD)');
    });
  });

  describe('Zod Schemas', () => {
    describe('TaskSchema', () => {
      it('should validate correct task objects', () => {
        const validTask = {
          title: 'Test Task',
          description: 'Test description',
          priority: 'P2',
          size: 'M',
          dueDate: '2024-12-31',
          tags: ['bug', 'frontend'],
        };

        const result = TaskSchema.safeParse(validTask);
        expect(result.success).toBe(true);
      });

      it('should reject invalid task objects', () => {
        const invalidTask = {
          title: '', // Invalid: empty
          priority: 'P5', // Invalid: not in enum
          size: 'XXL', // Invalid: not in enum
          dueDate: 'invalid-date', // Invalid: not a date
        };

        const result = TaskSchema.safeParse(invalidTask);
        expect(result.success).toBe(false);
      });

      it('should handle optional fields', () => {
        const minimalTask = {
          title: 'Minimal Task',
        };

        const result = TaskSchema.safeParse(minimalTask);
        expect(result.success).toBe(true);
      });
    });

    describe('BoardSchema', () => {
      it('should validate correct board objects', () => {
        const validBoard = {
          name: 'Test Board',
          description: 'Test board description',
          columns: ['Todo', 'In Progress', 'Done'],
          isPublic: false,
        };

        const result = BoardSchema.safeParse(validBoard);
        expect(result.success).toBe(true);
      });

      it('should reject invalid board objects', () => {
        const invalidBoard = {
          name: '', // Invalid: empty
          columns: [], // Invalid: must have at least one column
        };

        const result = BoardSchema.safeParse(invalidBoard);
        expect(result.success).toBe(false);
      });
    });

    describe('UserSchema', () => {
      it('should validate correct user objects', () => {
        const validUser = {
          name: 'John Doe',
          email: 'john@example.com',
          role: 'member',
        };

        const result = UserSchema.safeParse(validUser);
        expect(result.success).toBe(true);
      });

      it('should reject invalid user objects', () => {
        const invalidUser = {
          name: '', // Invalid: empty
          email: 'invalid-email', // Invalid: not an email
          role: 'invalid-role', // Invalid: not in enum
        };

        const result = UserSchema.safeParse(invalidUser);
        expect(result.success).toBe(false);
      });
    });
  });
});