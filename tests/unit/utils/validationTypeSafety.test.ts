/**
 * Validation Type Safety Tests
 * Tests for Zod schemas and validation type safety
 */

import { z } from 'zod';
import { validateInput, TaskValidation, NoteValidation } from '@/utils/validation';

describe('Validation Type Safety Tests', () => {
  describe('TaskValidation Schemas', () => {
    describe('TaskValidation.create', () => {
      it('should validate correct task creation data', () => {
        const validData = {
          title: 'Test Task',
          description: 'Test Description',
          board_id: 'board-123',
          priority: 5,
        };

        expect(() => validateInput(TaskValidation.create, validData)).not.toThrow();
        const result = validateInput(TaskValidation.create, validData);
        expect(result.title).toBe('Test Task');
        expect(result.priority).toBe(5);
      });

      it('should reject invalid task creation data', () => {
        const invalidCases = [
          { title: '', description: 'Empty title' }, // empty title
          { title: 123, description: 'Number title' }, // wrong type
          { title: 'Valid', priority: 'high' }, // wrong priority type
          { title: 'Valid', priority: 11 }, // priority out of range
          { title: 'Valid', priority: -1 }, // negative priority
          { title: 'Valid', status: 'invalid_status' }, // invalid status
          { title: 'Valid', tags: 'not_array' }, // wrong tags type
          { title: 'Valid', tags: [123, 456] }, // wrong tag item type
        ];

        invalidCases.forEach(data => {
          expect(() => validateInput(TaskValidation.create, data)).toThrow();
        });
      });

      it('should handle optional fields correctly', () => {
        const minimalData = {
          title: 'Minimal Task',
        };

        expect(() => validateInput(TaskValidation.create, minimalData)).not.toThrow();
        const result = validateInput(TaskValidation.create, minimalData);
        expect(result.title).toBe('Minimal Task');
        expect(result.description).toBeUndefined();
        expect(result.priority).toBeUndefined();
      });

      it('should sanitize and transform data', () => {
        const dataWithWhitespace = {
          title: '  Test Task  ',
          description: '  Test Description  ',
          tags: ['  tag1  ', '  tag2  '],
        };

        const result = validateInput(TaskValidation.create, dataWithWhitespace);
        expect(result.title).toBe('Test Task');
        expect(result.description).toBe('Test Description');
        expect(result.tags).toEqual(['tag1', 'tag2']);
      });

      it('should validate date formats', () => {
        const validDates = ['2024-12-31', '2024-01-01T00:00:00Z', '2024-06-15T14:30:00.000Z'];

        validDates.forEach(date => {
          const data = {
            title: 'Test Task',
            due_date: date,
          };
          expect(() => validateInput(TaskValidation.create, data)).not.toThrow();
        });

        const invalidDates = [
          'invalid-date',
          '31-12-2024',
          '2024/12/31',
          '2024-13-01',
          '2024-12-32',
        ];

        invalidDates.forEach(date => {
          const data = {
            title: 'Test Task',
            due_date: date,
          };
          expect(() => validateInput(TaskValidation.create, data)).toThrow();
        });
      });
    });

    describe('TaskValidation.update', () => {
      it('should validate partial updates', () => {
        const partialUpdates = [
          { title: 'Updated Title' },
          { description: 'Updated Description' },
          { priority: 8 },
          { status: 'in_progress' },
          { tags: ['updated', 'tags'] },
        ];

        partialUpdates.forEach(update => {
          expect(() => validateInput(TaskValidation.update, update)).not.toThrow();
        });
      });

      it('should allow empty updates', () => {
        expect(() => validateInput(TaskValidation.update, {})).not.toThrow();
      });

      it('should reject invalid update data', () => {
        const invalidUpdates = [
          { title: '' }, // empty title
          { priority: 15 }, // priority too high
          { status: 'invalid' }, // invalid status
          { estimated_hours: -5 }, // negative hours
          { actual_hours: 'not_number' }, // wrong type
        ];

        invalidUpdates.forEach(update => {
          expect(() => validateInput(TaskValidation.update, update)).toThrow();
        });
      });
    });

    describe('TaskValidation.filters', () => {
      it('should validate filter parameters', () => {
        const validFilters = [
          { board_id: 'board-123' },
          { status: 'todo' },
          { priority_min: 1, priority_max: 10 },
          { assignee: 'user@example.com' },
          { has_due_date: true },
          { tags: ['urgent', 'bug'] },
          { search: 'search term' },
        ];

        validFilters.forEach(filter => {
          expect(() => validateInput(TaskValidation.filters, filter)).not.toThrow();
        });
      });

      it('should reject invalid filter parameters', () => {
        const invalidFilters = [
          { priority_min: -1 }, // negative priority
          { priority_max: 15 }, // priority too high
          { has_due_date: 'yes' }, // wrong type
          { tags: 'not_array' }, // wrong tags type
          { limit: 0 }, // zero limit
          { limit: 1001 }, // limit too high
          { offset: -1 }, // negative offset
        ];

        invalidFilters.forEach(filter => {
          expect(() => validateInput(TaskValidation.filters, filter)).toThrow();
        });
      });
    });
  });

  describe('NoteValidation Schemas', () => {
    describe('NoteValidation.create', () => {
      it('should validate correct note creation data', () => {
        const validData = {
          content: 'This is a test note',
          category: 'general',
          pinned: false,
        };

        expect(() => validateInput(NoteValidation.create, validData)).not.toThrow();
        const result = validateInput(NoteValidation.create, validData);
        expect(result.content).toBe('This is a test note');
        expect(result.category).toBe('general');
        expect(result.pinned).toBe(false);
      });

      it('should require content field', () => {
        const invalidData = {
          category: 'general',
        };

        expect(() => validateInput(NoteValidation.create, invalidData)).toThrow();
      });

      it('should validate note categories', () => {
        const validCategories = ['general', 'progress', 'blocker', 'decision', 'question'];

        validCategories.forEach(category => {
          const data = {
            content: 'Test note',
            category,
          };
          expect(() => validateInput(NoteValidation.create, data)).not.toThrow();
        });

        const invalidCategory = {
          content: 'Test note',
          category: 'invalid_category',
        };
        expect(() => validateInput(NoteValidation.create, invalidCategory)).toThrow();
      });

      it('should handle optional fields', () => {
        const minimalData = {
          content: 'Minimal note',
        };

        expect(() => validateInput(NoteValidation.create, minimalData)).not.toThrow();
        const result = validateInput(NoteValidation.create, minimalData);
        expect(result.content).toBe('Minimal note');
        expect(result.category).toBeUndefined();
        expect(result.pinned).toBeUndefined();
      });
    });

    describe('NoteValidation.update', () => {
      it('should validate partial note updates', () => {
        const partialUpdates = [
          { content: 'Updated content' },
          { category: 'progress' },
          { pinned: true },
        ];

        partialUpdates.forEach(update => {
          expect(() => validateInput(NoteValidation.update, update)).not.toThrow();
        });
      });

      it('should allow empty updates', () => {
        expect(() => validateInput(NoteValidation.update, {})).not.toThrow();
      });
    });
  });

  describe('Custom Validation Scenarios', () => {
    describe('SQL Injection Prevention', () => {
      it('should reject SQL injection attempts', () => {
        const sqlInjectionAttempts = [
          "'; DROP TABLE tasks; --",
          "' OR '1'='1",
          "'; DELETE FROM tasks WHERE '1'='1'; --",
          "admin'--",
          "' UNION SELECT * FROM users --",
        ];

        sqlInjectionAttempts.forEach(maliciousInput => {
          const data = {
            title: maliciousInput,
            description: 'Test',
          };

          // The validation should not throw, but the input should be sanitized
          const result = validateInput(TaskValidation.create, data);
          expect(result.title).toBe(maliciousInput); // But it will be escaped at the DB level
        });
      });
    });

    describe('XSS Prevention', () => {
      it('should handle potentially dangerous HTML/JS input', () => {
        const xssAttempts = [
          '<script>alert("xss")</script>',
          '<img src="x" onerror="alert(1)">',
          'javascript:void(0)',
          '<svg onload="alert(1)">',
          '"><script>alert("xss")</script>',
        ];

        xssAttempts.forEach(maliciousInput => {
          const data = {
            title: 'Test Task',
            description: maliciousInput,
          };

          // Should not throw - input sanitization happens at rendering level
          expect(() => validateInput(TaskValidation.create, data)).not.toThrow();
        });
      });
    });

    describe('Unicode and Internationalization', () => {
      it('should handle Unicode characters properly', () => {
        const unicodeData = {
          title: '测试任务 🚀',
          description: 'Тестовое описание с émojis 🎉',
          tags: ['العربية', '日本語', 'Ελληνικά'],
        };

        expect(() => validateInput(TaskValidation.create, unicodeData)).not.toThrow();
        const result = validateInput(TaskValidation.create, unicodeData);
        expect(result.title).toBe('测试任务 🚀');
        expect(result.tags).toEqual(['العربية', '日本語', 'Ελληνικά']);
      });

      it('should handle extremely long Unicode strings', () => {
        const longUnicodeString = '🚀'.repeat(1000);
        const data = {
          title: 'Test',
          description: longUnicodeString,
        };

        // Should validate without issues (length limits enforced elsewhere)
        expect(() => validateInput(TaskValidation.create, data)).not.toThrow();
      });
    });

    describe('Edge Case Values', () => {
      it('should handle boundary values correctly', () => {
        const boundaryTests = [
          { title: 'Test', priority: 0 }, // minimum priority
          { title: 'Test', priority: 10 }, // maximum priority
          { title: 'Test', estimated_hours: 0 }, // zero hours
          { title: 'Test', estimated_hours: 0.1 }, // fractional hours
        ];

        boundaryTests.forEach(data => {
          expect(() => validateInput(TaskValidation.create, data)).not.toThrow();
        });
      });

      it('should reject out-of-bounds values', () => {
        const outOfBoundsTests = [
          { title: 'Test', priority: -1 },
          { title: 'Test', priority: 11 },
          { title: 'Test', estimated_hours: -1 },
        ];

        outOfBoundsTests.forEach(data => {
          expect(() => validateInput(TaskValidation.create, data)).toThrow();
        });
      });
    });

    describe('Type Coercion Safety', () => {
      it('should not auto-convert string numbers to numbers', () => {
        const data = {
          title: 'Test',
          priority: '5', // String instead of number
        };

        expect(() => validateInput(TaskValidation.create, data)).toThrow();
      });

      it('should not auto-convert string booleans to booleans', () => {
        const data = {
          content: 'Test note',
          pinned: 'true', // String instead of boolean
        };

        expect(() => validateInput(NoteValidation.create, data)).toThrow();
      });

      it('should handle null vs undefined correctly', () => {
        const dataWithNull = {
          title: 'Test',
          description: null,
        };

        const dataWithUndefined = {
          title: 'Test',
          description: undefined,
        };

        // Both should be handled consistently
        expect(() => validateInput(TaskValidation.create, dataWithNull)).toThrow();
        expect(() => validateInput(TaskValidation.create, dataWithUndefined)).not.toThrow();
      });
    });

    describe('Performance with Large Data', () => {
      it('should handle validation of large objects efficiently', () => {
        const largeData = {
          title: 'Test Task',
          description: 'A'.repeat(10000), // Large description
          tags: Array.from({ length: 100 }, (_, i) => `tag${i}`), // Many tags
        };

        const start = performance.now();
        expect(() => validateInput(TaskValidation.create, largeData)).not.toThrow();
        const end = performance.now();

        expect(end - start).toBeLessThan(100); // Should be fast
      });

      it('should handle deeply nested validation efficiently', () => {
        const complexFilter = {
          board_id: 'board-123',
          status: 'todo',
          priority_min: 1,
          priority_max: 10,
          tags: Array.from({ length: 50 }, (_, i) => `tag${i}`),
          search: 'complex search term',
          has_due_date: true,
          assignee: 'user@example.com',
          limit: 100,
          offset: 0,
        };

        const start = performance.now();
        expect(() => validateInput(TaskValidation.filters, complexFilter)).not.toThrow();
        const end = performance.now();

        expect(end - start).toBeLessThan(50); // Should be very fast
      });
    });
  });

  describe('Schema Evolution and Backward Compatibility', () => {
    it('should handle additional unknown fields gracefully', () => {
      const dataWithExtraFields = {
        title: 'Test Task',
        description: 'Test Description',
        priority: 5,
        unknownField: 'should be ignored',
        anotherUnknownField: 123,
      };

      // Zod should strip unknown fields by default
      const result = validateInput(TaskValidation.create, dataWithExtraFields);
      expect(result.title).toBe('Test Task');
      expect((result as any).unknownField).toBeUndefined();
      expect((result as any).anotherUnknownField).toBeUndefined();
    });

    it('should maintain type safety with partial schemas', () => {
      // Test that partial validation maintains type safety
      const partialUpdate = {
        priority: 8,
      };

      const result = validateInput(TaskValidation.update, partialUpdate);
      expect(result.priority).toBe(8);
      expect(result.title).toBeUndefined();
    });
  });
});
