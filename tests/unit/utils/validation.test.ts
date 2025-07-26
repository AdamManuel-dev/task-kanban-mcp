/**
 * Unit tests for Validation Utilities
 * 
 * @description Tests for Zod schemas, validation functions, business rules, and input validation
 */

import {
  BoardValidation,
  TaskValidation,
  NoteValidation,
  TagValidation,
  PaginationValidation,
  FilterValidation,
  ValidationError,
  validateInput,
  validateOptionalInput,
  BusinessRules,
  CommonValidations,
  createValidatedService
} from '@/utils/validation';

describe('Validation Utilities', () => {
  describe('BoardValidation', () => {
    describe('create schema', () => {
      it('should validate valid board creation data', () => {
        const validData = {
          name: 'Test Board',
          description: 'A test board',
          color: '#FF6B6B'
        };

        const result = BoardValidation.create.parse(validData);
        expect(result).toEqual(validData);
      });

      it('should require board name', () => {
        const invalidData = {
          description: 'A test board'
        };

        expect(() => BoardValidation.create.parse(invalidData)).toThrow();
      });

      it('should reject empty board name', () => {
        const invalidData = {
          name: '',
          description: 'A test board'
        };

        expect(() => BoardValidation.create.parse(invalidData)).toThrow('Board name is required');
      });

      it('should reject board name that is too long', () => {
        const invalidData = {
          name: 'a'.repeat(101),
          description: 'A test board'
        };

        expect(() => BoardValidation.create.parse(invalidData)).toThrow('Board name too long');
      });

      it('should reject description that is too long', () => {
        const invalidData = {
          name: 'Test Board',
          description: 'a'.repeat(501)
        };

        expect(() => BoardValidation.create.parse(invalidData)).toThrow('Description too long');
      });

      it('should reject invalid color format', () => {
        const invalidData = {
          name: 'Test Board',
          color: 'red'
        };

        expect(() => BoardValidation.create.parse(invalidData)).toThrow('Invalid color format');
      });

      it('should accept valid hex colors', () => {
        const validColors = ['#FF6B6B', '#ff6b6b', '#123ABC'];
        
        validColors.forEach(color => {
          const data = { name: 'Test Board', color };
          expect(() => BoardValidation.create.parse(data)).not.toThrow();
        });
      });

      it('should make description and color optional', () => {
        const minimalData = { name: 'Test Board' };
        
        const result = BoardValidation.create.parse(minimalData);
        expect(result.name).toBe('Test Board');
        expect(result.description).toBeUndefined();
        expect(result.color).toBeUndefined();
      });
    });

    describe('update schema', () => {
      it('should validate valid board update data', () => {
        const validData = {
          name: 'Updated Board',
          archived: true
        };

        const result = BoardValidation.update.parse(validData);
        expect(result).toEqual(validData);
      });

      it('should make all fields optional', () => {
        const emptyData = {};
        
        const result = BoardValidation.update.parse(emptyData);
        expect(result).toEqual({});
      });

      it('should validate archived boolean field', () => {
        const validData = { archived: false };
        const invalidData = { archived: 'yes' };

        expect(() => BoardValidation.update.parse(validData)).not.toThrow();
        expect(() => BoardValidation.update.parse(invalidData)).toThrow();
      });
    });
  });

  describe('TaskValidation', () => {
    const validTaskData = {
      title: 'Test Task',
      description: 'A test task',
      board_id: '123e4567-e89b-12d3-a456-426614174000',
      column_id: '123e4567-e89b-12d3-a456-426614174001',
      position: 1,
      priority: 5,
      status: 'todo' as const,
      assignee: 'John Doe',
      due_date: new Date('2024-12-31'),
      estimated_hours: 8,
      parent_task_id: '123e4567-e89b-12d3-a456-426614174002',
      metadata: '{"key": "value"}'
    };

    describe('create schema', () => {
      it('should validate valid task creation data', () => {
        const result = TaskValidation.create.parse(validTaskData);
        expect(result.title).toBe('Test Task');
        expect(result.board_id).toBe(validTaskData.board_id);
      });

      it('should require title, board_id, and column_id', () => {
        const missingTitle = { ...validTaskData };
        delete missingTitle.title;
        
        const missingBoardId = { ...validTaskData };
        delete missingBoardId.board_id;
        
        const missingColumnId = { ...validTaskData };
        delete missingColumnId.column_id;

        expect(() => TaskValidation.create.parse(missingTitle)).toThrow();
        expect(() => TaskValidation.create.parse(missingBoardId)).toThrow();
        expect(() => TaskValidation.create.parse(missingColumnId)).toThrow();
      });

      it('should validate UUID format for IDs', () => {
        const invalidBoardId = { ...validTaskData, board_id: 'not-a-uuid' };
        const invalidColumnId = { ...validTaskData, column_id: 'not-a-uuid' };
        const invalidParentId = { ...validTaskData, parent_task_id: 'not-a-uuid' };

        expect(() => TaskValidation.create.parse(invalidBoardId)).toThrow('Invalid board ID');
        expect(() => TaskValidation.create.parse(invalidColumnId)).toThrow('Invalid column ID');
        expect(() => TaskValidation.create.parse(invalidParentId)).toThrow('Invalid parent task ID');
      });

      it('should validate priority range', () => {
        const lowPriority = { ...validTaskData, priority: -1 };
        const highPriority = { ...validTaskData, priority: 11 };

        expect(() => TaskValidation.create.parse(lowPriority)).toThrow();
        expect(() => TaskValidation.create.parse(highPriority)).toThrow();
      });

      it('should validate status enum', () => {
        const validStatuses = ['todo', 'in_progress', 'done', 'blocked', 'archived'];
        const invalidStatus = { ...validTaskData, status: 'invalid' };

        validStatuses.forEach(status => {
          const data = { ...validTaskData, status };
          expect(() => TaskValidation.create.parse(data)).not.toThrow();
        });

        expect(() => TaskValidation.create.parse(invalidStatus)).toThrow();
      });

      it('should validate positive estimated hours', () => {
        const negativeHours = { ...validTaskData, estimated_hours: -1 };
        const zeroHours = { ...validTaskData, estimated_hours: 0 };

        expect(() => TaskValidation.create.parse(negativeHours)).toThrow();
        expect(() => TaskValidation.create.parse(zeroHours)).toThrow();
      });

      it('should validate title length', () => {
        const emptyTitle = { ...validTaskData, title: '' };
        const longTitle = { ...validTaskData, title: 'a'.repeat(201) };

        expect(() => TaskValidation.create.parse(emptyTitle)).toThrow('Task title is required');
        expect(() => TaskValidation.create.parse(longTitle)).toThrow('Title too long');
      });

      it('should validate description length', () => {
        const longDescription = { ...validTaskData, description: 'a'.repeat(2001) };

        expect(() => TaskValidation.create.parse(longDescription)).toThrow('Description too long');
      });
    });

    describe('update schema', () => {
      it('should make all fields optional except constraints', () => {
        const emptyUpdate = {};
        const result = TaskValidation.update.parse(emptyUpdate);
        expect(result).toEqual({});
      });

      it('should include actual_hours field for updates', () => {
        const updateData = { actual_hours: 10 };
        const result = TaskValidation.update.parse(updateData);
        expect(result.actual_hours).toBe(10);
      });

      it('should validate positive actual hours', () => {
        const negativeHours = { actual_hours: -1 };
        expect(() => TaskValidation.update.parse(negativeHours)).toThrow();
      });
    });

    describe('dependency schema', () => {
      it('should validate valid dependency data', () => {
        const dependencyData = {
          task_id: '123e4567-e89b-12d3-a456-426614174000',
          depends_on_task_id: '123e4567-e89b-12d3-a456-426614174001',
          dependency_type: 'blocks' as const
        };

        const result = TaskValidation.dependency.parse(dependencyData);
        expect(result).toEqual(dependencyData);
      });

      it('should require both task IDs', () => {
        const missingTaskId = {
          depends_on_task_id: '123e4567-e89b-12d3-a456-426614174001'
        };
        const missingDependencyId = {
          task_id: '123e4567-e89b-12d3-a456-426614174000'
        };

        expect(() => TaskValidation.dependency.parse(missingTaskId)).toThrow();
        expect(() => TaskValidation.dependency.parse(missingDependencyId)).toThrow();
      });

      it('should validate dependency types', () => {
        const validTypes = ['blocks', 'relates_to', 'duplicates'];
        const invalidType = {
          task_id: '123e4567-e89b-12d3-a456-426614174000',
          depends_on_task_id: '123e4567-e89b-12d3-a456-426614174001',
          dependency_type: 'invalid'
        };

        validTypes.forEach(type => {
          const data = {
            task_id: '123e4567-e89b-12d3-a456-426614174000',
            depends_on_task_id: '123e4567-e89b-12d3-a456-426614174001',
            dependency_type: type
          };
          expect(() => TaskValidation.dependency.parse(data)).not.toThrow();
        });

        expect(() => TaskValidation.dependency.parse(invalidType)).toThrow();
      });
    });
  });

  describe('NoteValidation', () => {
    const validNoteData = {
      task_id: '123e4567-e89b-12d3-a456-426614174000',
      content: 'This is a test note',
      category: 'general' as const,
      pinned: false
    };

    describe('create schema', () => {
      it('should validate valid note creation data', () => {
        const result = NoteValidation.create.parse(validNoteData);
        expect(result).toEqual(validNoteData);
      });

      it('should require task_id and content', () => {
        const missingTaskId = { ...validNoteData };
        delete missingTaskId.task_id;
        
        const missingContent = { ...validNoteData };
        delete missingContent.content;

        expect(() => NoteValidation.create.parse(missingTaskId)).toThrow();
        expect(() => NoteValidation.create.parse(missingContent)).toThrow();
      });

      it('should validate note categories', () => {
        const validCategories = ['general', 'progress', 'blocker', 'decision', 'question'];
        const invalidCategory = { ...validNoteData, category: 'invalid' };

        validCategories.forEach(category => {
          const data = { ...validNoteData, category };
          expect(() => NoteValidation.create.parse(data)).not.toThrow();
        });

        expect(() => NoteValidation.create.parse(invalidCategory)).toThrow();
      });

      it('should validate content length', () => {
        const emptyContent = { ...validNoteData, content: '' };
        const longContent = { ...validNoteData, content: 'a'.repeat(5001) };

        expect(() => NoteValidation.create.parse(emptyContent)).toThrow('Note content is required');
        expect(() => NoteValidation.create.parse(longContent)).toThrow('Content too long');
      });
    });

    describe('search schema', () => {
      it('should validate valid search parameters', () => {
        const searchData = {
          query: 'test search',
          task_id: '123e4567-e89b-12d3-a456-426614174000',
          category: 'progress' as const,
          pinned_only: true,
          highlight: true,
          limit: 10,
          offset: 0
        };

        const result = NoteValidation.search.parse(searchData);
        expect(result).toEqual(searchData);
      });

      it('should require search query', () => {
        const missingQuery = {
          task_id: '123e4567-e89b-12d3-a456-426614174000'
        };

        expect(() => NoteValidation.search.parse(missingQuery)).toThrow();
      });

      it('should validate limit and offset ranges', () => {
        const invalidLimit = { query: 'test', limit: 101 };
        const invalidOffset = { query: 'test', offset: -1 };

        expect(() => NoteValidation.search.parse(invalidLimit)).toThrow();
        expect(() => NoteValidation.search.parse(invalidOffset)).toThrow();
      });
    });
  });

  describe('TagValidation', () => {
    const validTagData = {
      name: 'test-tag',
      color: '#FF6B6B',
      description: 'A test tag',
      parent_tag_id: '123e4567-e89b-12d3-a456-426614174000'
    };

    describe('create schema', () => {
      it('should validate valid tag creation data', () => {
        const result = TagValidation.create.parse(validTagData);
        expect(result).toEqual(validTagData);
      });

      it('should require tag name', () => {
        const missingName = { ...validTagData };
        delete missingName.name;

        expect(() => TagValidation.create.parse(missingName)).toThrow();
      });

      it('should validate name length', () => {
        const emptyName = { ...validTagData, name: '' };
        const longName = { ...validTagData, name: 'a'.repeat(51) };

        expect(() => TagValidation.create.parse(emptyName)).toThrow('Tag name is required');
        expect(() => TagValidation.create.parse(longName)).toThrow('Tag name too long');
      });

      it('should validate color format', () => {
        const invalidColor = { ...validTagData, color: 'red' };
        expect(() => TagValidation.create.parse(invalidColor)).toThrow('Invalid color format');
      });
    });

    describe('assignment schema', () => {
      it('should validate tag assignment data', () => {
        const assignmentData = {
          task_id: '123e4567-e89b-12d3-a456-426614174000',
          tag_id: '123e4567-e89b-12d3-a456-426614174001'
        };

        const result = TagValidation.assignment.parse(assignmentData);
        expect(result).toEqual(assignmentData);
      });

      it('should require both task_id and tag_id', () => {
        const missingTaskId = {
          tag_id: '123e4567-e89b-12d3-a456-426614174001'
        };
        const missingTagId = {
          task_id: '123e4567-e89b-12d3-a456-426614174000'
        };

        expect(() => TagValidation.assignment.parse(missingTaskId)).toThrow();
        expect(() => TagValidation.assignment.parse(missingTagId)).toThrow();
      });
    });
  });

  describe('PaginationValidation', () => {
    it('should validate valid pagination parameters', () => {
      const paginationData = {
        limit: 25,
        offset: 50,
        sortBy: 'created_at',
        sortOrder: 'desc' as const
      };

      const result = PaginationValidation.parse(paginationData);
      expect(result).toEqual(paginationData);
    });

    it('should make all fields optional', () => {
      const emptyData = {};
      const result = PaginationValidation.parse(emptyData);
      expect(result).toEqual({});
    });

    it('should validate limit range', () => {
      const tooLowLimit = { limit: 0 };
      const tooHighLimit = { limit: 101 };

      expect(() => PaginationValidation.parse(tooLowLimit)).toThrow();
      expect(() => PaginationValidation.parse(tooHighLimit)).toThrow();
    });

    it('should validate sort order enum', () => {
      const validOrder = { sortOrder: 'asc' };
      const invalidOrder = { sortOrder: 'invalid' };

      expect(() => PaginationValidation.parse(validOrder)).not.toThrow();
      expect(() => PaginationValidation.parse(invalidOrder)).toThrow();
    });
  });

  describe('FilterValidation', () => {
    it('should validate filter parameters', () => {
      const filterData = {
        archived: true,
        search: 'test query'
      };

      const result = FilterValidation.parse(filterData);
      expect(result).toEqual(filterData);
    });

    it('should validate search length', () => {
      const longSearch = { search: 'a'.repeat(201) };
      expect(() => FilterValidation.parse(longSearch)).toThrow();
    });
  });

  describe('ValidationError', () => {
    it('should create error with correct properties', () => {
      const details = { field: 'test', value: 'invalid' };
      const error = new ValidationError('Test validation error', details);

      expect(error.message).toBe('Test validation error');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual(details);
      expect(error.name).toBe('ValidationError');
    });

    it('should work without details', () => {
      const error = new ValidationError('Simple error');

      expect(error.message).toBe('Simple error');
      expect(error.details).toBeUndefined();
    });
  });

  describe('validateInput', () => {
    const testSchema = BoardValidation.create;

    it('should return validated data for valid input', () => {
      const validData = { name: 'Test Board' };
      const result = validateInput(testSchema, validData);

      expect(result).toEqual(validData);
    });

    it('should throw ValidationError for invalid input', () => {
      const invalidData = { name: '' };

      expect(() => validateInput(testSchema, invalidData)).toThrow(ValidationError);
    });

    it('should format Zod errors properly', () => {
      const invalidData = { name: '', color: 'invalid' };

      try {
        validateInput(testSchema, invalidData);
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toContain('Validation failed:');
        expect(error.message).toContain('name:');
        expect(error.message).toContain('color:');
        expect(error.details).toBeDefined();
      }
    });

    it('should re-throw non-Zod errors', () => {
      const schema = {
        parse: () => {
          throw new Error('Custom error');
        }
      };

      expect(() => validateInput(schema as any, {})).toThrow('Custom error');
    });
  });

  describe('validateOptionalInput', () => {
    const testSchema = BoardValidation.update;

    it('should return undefined for null input', () => {
      const result = validateOptionalInput(testSchema, null);
      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      const result = validateOptionalInput(testSchema, undefined);
      expect(result).toBeUndefined();
    });

    it('should validate and return data for valid input', () => {
      const validData = { name: 'Updated Board' };
      const result = validateOptionalInput(testSchema, validData);

      expect(result).toEqual(validData);
    });

    it('should throw ValidationError for invalid input', () => {
      const invalidData = { name: '' };

      expect(() => validateOptionalInput(testSchema, invalidData)).toThrow(ValidationError);
    });
  });

  describe('BusinessRules', () => {
    describe('board rules', () => {
      describe('validateName', () => {
        it('should accept valid board names', () => {
          const validNames = ['Test Board', 'Project-1', 'My Board Name'];

          validNames.forEach(name => {
            expect(() => BusinessRules.board.validateName(name)).not.toThrow();
          });
        });

        it('should reject names with leading/trailing whitespace', () => {
          const invalidNames = [' Test Board', 'Test Board ', ' Test Board '];

          invalidNames.forEach(name => {
            expect(() => BusinessRules.board.validateName(name)).toThrow(
              'Board name cannot have leading or trailing whitespace'
            );
          });
        });

        it('should reject names with multiple consecutive spaces', () => {
          const invalidName = 'Test  Board';

          expect(() => BusinessRules.board.validateName(invalidName)).toThrow(
            'Board name cannot contain multiple consecutive spaces'
          );
        });
      });

      describe('validateColor', () => {
        it('should accept any valid hex color', () => {
          const validColors = ['#FF6B6B', '#123ABC', '#000000', '#FFFFFF'];

          validColors.forEach(color => {
            expect(() => BusinessRules.board.validateColor(color)).not.toThrow();
          });
        });
      });
    });

    describe('task rules', () => {
      describe('validateTitle', () => {
        it('should accept valid task titles', () => {
          const validTitles = ['Implement feature', 'Fix bug #123', 'Review code'];

          validTitles.forEach(title => {
            expect(() => BusinessRules.task.validateTitle(title)).not.toThrow();
          });
        });

        it('should reject titles with leading/trailing whitespace', () => {
          const invalidTitles = [' Task title', 'Task title ', ' Task title '];

          invalidTitles.forEach(title => {
            expect(() => BusinessRules.task.validateTitle(title)).toThrow(
              'Task title cannot have leading or trailing whitespace'
            );
          });
        });

        it('should reject titles shorter than 3 characters', () => {
          const shortTitle = 'Hi';

          expect(() => BusinessRules.task.validateTitle(shortTitle)).toThrow(
            'Task title must be at least 3 characters long'
          );
        });
      });

      describe('validatePriority', () => {
        it('should accept valid priorities', () => {
          const validPriorities = [0, 1, 5, 10];

          validPriorities.forEach(priority => {
            expect(() => BusinessRules.task.validatePriority(priority)).not.toThrow();
          });
        });

        it('should reject non-integer priorities', () => {
          const invalidPriorities = [1.5, 2.7, 3.14];

          invalidPriorities.forEach(priority => {
            expect(() => BusinessRules.task.validatePriority(priority)).toThrow(
              'Priority must be an integer'
            );
          });
        });

        it('should reject priorities outside range', () => {
          const invalidPriorities = [-1, 11, 100];

          invalidPriorities.forEach(priority => {
            expect(() => BusinessRules.task.validatePriority(priority)).toThrow(
              'Priority must be between 0 and 10'
            );
          });
        });
      });

      describe('validateEstimatedHours', () => {
        it('should accept valid hour estimates', () => {
          const validHours = [0.5, 1, 8, 40, 100];

          validHours.forEach(hours => {
            expect(() => BusinessRules.task.validateEstimatedHours(hours)).not.toThrow();
          });
        });

        it('should reject zero or negative hours', () => {
          const invalidHours = [0, -1, -5];

          invalidHours.forEach(hours => {
            expect(() => BusinessRules.task.validateEstimatedHours(hours)).toThrow(
              'Estimated hours must be positive'
            );
          });
        });

        it('should reject hours exceeding limit', () => {
          const tooManyHours = 1001;

          expect(() => BusinessRules.task.validateEstimatedHours(tooManyHours)).toThrow(
            'Estimated hours cannot exceed 1000'
          );
        });
      });

      describe('validateDueDate', () => {
        it('should accept valid due dates', () => {
          const now = new Date();
          const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
          const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

          expect(() => BusinessRules.task.validateDueDate(futureDate)).not.toThrow();
          expect(() => BusinessRules.task.validateDueDate(pastDate)).not.toThrow();
        });

        it('should reject dates more than one year in future', () => {
          const farFutureDate = new Date();
          farFutureDate.setFullYear(farFutureDate.getFullYear() + 2);

          expect(() => BusinessRules.task.validateDueDate(farFutureDate)).toThrow(
            'Due date cannot be more than one year in the future'
          );
        });
      });

      describe('validateStatusTransition', () => {
        it('should allow valid status transitions', () => {
          const validTransitions = [
            ['todo', 'in_progress'],
            ['in_progress', 'done'],
            ['done', 'todo'],
            ['blocked', 'in_progress'],
            ['archived', 'todo']
          ];

          validTransitions.forEach(([from, to]) => {
            expect(() => BusinessRules.task.validateStatusTransition(from, to)).not.toThrow();
          });
        });

        it('should reject invalid status transitions', () => {
          const invalidTransitions = [
            ['todo', 'done'], // Can't go directly from todo to done
            ['done', 'blocked'] // Can't go from done to blocked
          ];

          invalidTransitions.forEach(([from, to]) => {
            expect(() => BusinessRules.task.validateStatusTransition(from, to)).toThrow(
              `Invalid status transition from ${from} to ${to}`
            );
          });
        });
      });
    });

    describe('note rules', () => {
      describe('validateContent', () => {
        it('should accept valid note content', () => {
          const validContent = 'This is a valid note with proper content.';

          expect(() => BusinessRules.note.validateContent(validContent)).not.toThrow();
        });

        it('should reject content with leading/trailing whitespace', () => {
          const invalidContent = [' Note content', 'Note content ', ' Note content '];

          invalidContent.forEach(content => {
            expect(() => BusinessRules.note.validateContent(content)).toThrow(
              'Note content cannot have leading or trailing whitespace'
            );
          });
        });

        it('should reject empty content', () => {
          expect(() => BusinessRules.note.validateContent('')).toThrow(
            'Note content cannot be empty'
          );
        });
      });

      describe('validateCategory', () => {
        it('should accept valid categories', () => {
          const validCategories = ['general', 'progress', 'blocker', 'decision', 'question'];

          validCategories.forEach(category => {
            expect(() => BusinessRules.note.validateCategory(category)).not.toThrow();
          });
        });

        it('should reject invalid categories', () => {
          const invalidCategory = 'invalid';

          expect(() => BusinessRules.note.validateCategory(invalidCategory)).toThrow(
            `Invalid note category: ${invalidCategory}`
          );
        });
      });
    });

    describe('tag rules', () => {
      describe('validateName', () => {
        it('should accept valid tag names', () => {
          const validNames = ['bug', 'feature', 'high-priority', 'team_1'];

          validNames.forEach(name => {
            expect(() => BusinessRules.tag.validateName(name)).not.toThrow();
          });
        });

        it('should reject names with leading/trailing whitespace', () => {
          const invalidNames = [' tag', 'tag ', ' tag '];

          invalidNames.forEach(name => {
            expect(() => BusinessRules.tag.validateName(name)).toThrow(
              'Tag name cannot have leading or trailing whitespace'
            );
          });
        });

        it('should reject names with spaces', () => {
          const nameWithSpace = 'tag name';

          expect(() => BusinessRules.tag.validateName(nameWithSpace)).toThrow(
            'Tag name cannot contain spaces'
          );
        });

        it('should reject names with invalid characters', () => {
          const invalidNames = ['tag@name', 'tag#name', 'tag!name'];

          invalidNames.forEach(name => {
            expect(() => BusinessRules.tag.validateName(name)).toThrow(
              'Tag name can only contain letters, numbers, underscores, and hyphens'
            );
          });
        });
      });

      describe('validateHierarchyDepth', () => {
        it('should accept valid hierarchy depths', () => {
          const validDepths = [1, 2, 3, 4, 5];

          validDepths.forEach(depth => {
            expect(() => BusinessRules.tag.validateHierarchyDepth(depth)).not.toThrow();
          });
        });

        it('should reject depths exceeding limit', () => {
          const tooDeep = 6;

          expect(() => BusinessRules.tag.validateHierarchyDepth(tooDeep)).toThrow(
            'Tag hierarchy cannot exceed 5 levels deep'
          );
        });
      });
    });

    describe('context rules', () => {
      describe('validateLookbackDays', () => {
        it('should accept valid lookback days', () => {
          const validDays = [1, 7, 30, 90, 365];

          validDays.forEach(days => {
            expect(() => BusinessRules.context.validateLookbackDays(days)).not.toThrow();
          });
        });

        it('should reject zero or negative days', () => {
          const invalidDays = [0, -1, -7];

          invalidDays.forEach(days => {
            expect(() => BusinessRules.context.validateLookbackDays(days)).toThrow(
              'Lookback days must be at least 1'
            );
          });
        });

        it('should reject days exceeding limit', () => {
          const tooManyDays = 366;

          expect(() => BusinessRules.context.validateLookbackDays(tooManyDays)).toThrow(
            'Lookback days cannot exceed 365'
          );
        });
      });

      describe('validateMaxItems', () => {
        it('should accept valid max items', () => {
          const validCounts = [1, 10, 50, 100, 1000];

          validCounts.forEach(count => {
            expect(() => BusinessRules.context.validateMaxItems(count)).not.toThrow();
          });
        });

        it('should reject zero or negative counts', () => {
          const invalidCounts = [0, -1, -10];

          invalidCounts.forEach(count => {
            expect(() => BusinessRules.context.validateMaxItems(count)).toThrow(
              'Max items must be at least 1'
            );
          });
        });

        it('should reject counts exceeding limit', () => {
          const tooMany = 1001;

          expect(() => BusinessRules.context.validateMaxItems(tooMany)).toThrow(
            'Max items cannot exceed 1000'
          );
        });
      });
    });
  });

  describe('CommonValidations', () => {
    it('should validate UUIDs', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const invalidUuid = 'not-a-uuid';

      expect(() => CommonValidations.uuid.parse(validUuid)).not.toThrow();
      expect(() => CommonValidations.uuid.parse(invalidUuid)).toThrow();
    });

    it('should validate positive integers', () => {
      expect(() => CommonValidations.positiveInteger.parse(5)).not.toThrow();
      expect(() => CommonValidations.positiveInteger.parse(0)).toThrow();
      expect(() => CommonValidations.positiveInteger.parse(-1)).toThrow();
      expect(() => CommonValidations.positiveInteger.parse(1.5)).toThrow();
    });

    it('should validate non-negative integers', () => {
      expect(() => CommonValidations.nonNegativeInteger.parse(0)).not.toThrow();
      expect(() => CommonValidations.nonNegativeInteger.parse(5)).not.toThrow();
      expect(() => CommonValidations.nonNegativeInteger.parse(-1)).toThrow();
    });

    it('should validate date strings', () => {
      const validDates = ['2024-01-01', '2024-12-31T23:59:59Z'];
      const invalidDate = 'not-a-date';

      validDates.forEach(date => {
        expect(() => CommonValidations.dateString.parse(date)).not.toThrow();
      });
      
      expect(() => CommonValidations.dateString.parse(invalidDate)).toThrow();
    });

    it('should validate email addresses', () => {
      const validEmails = ['test@example.com', 'user.name+tag@domain.co.uk'];
      const invalidEmails = ['not-an-email', '@domain.com', 'user@'];

      validEmails.forEach(email => {
        expect(() => CommonValidations.email.parse(email)).not.toThrow();
      });

      invalidEmails.forEach(email => {
        expect(() => CommonValidations.email.parse(email)).toThrow();
      });
    });

    it('should validate URLs', () => {
      const validUrls = ['https://example.com', 'http://localhost:3000', 'ftp://files.example.com'];
      const invalidUrls = ['not-a-url', 'example.com', 'http://'];

      validUrls.forEach(url => {
        expect(() => CommonValidations.url.parse(url)).not.toThrow();
      });

      invalidUrls.forEach(url => {
        expect(() => CommonValidations.url.parse(url)).toThrow();
      });
    });

    it('should validate hex colors', () => {
      const validColors = ['#FF6B6B', '#123ABC', '#000000'];
      const invalidColors = ['red', '#FFF', '#GGGGGG', 'FF6B6B'];

      validColors.forEach(color => {
        expect(() => CommonValidations.color.parse(color)).not.toThrow();
      });

      invalidColors.forEach(color => {
        expect(() => CommonValidations.color.parse(color)).toThrow();
      });
    });

    it('should validate slugs', () => {
      const validSlugs = ['test-slug', 'my-board-name', 'project-123'];
      const invalidSlugs = ['Test Slug', 'test_slug', 'test--slug', '-test-slug'];

      validSlugs.forEach(slug => {
        expect(() => CommonValidations.slug.parse(slug)).not.toThrow();
      });

      invalidSlugs.forEach(slug => {
        expect(() => CommonValidations.slug.parse(slug)).toThrow();
      });
    });

    it('should validate sanitized strings', () => {
      const safeStrings = ['Hello world', 'Safe string with numbers 123'];
      const dangerousStrings = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<div onclick="alert()">test</div>'
      ];

      safeStrings.forEach(str => {
        expect(() => CommonValidations.sanitizedString.parse(str)).not.toThrow();
      });

      dangerousStrings.forEach(str => {
        expect(() => CommonValidations.sanitizedString.parse(str)).toThrow();
      });
    });
  });

  describe('createValidatedService', () => {
    const mockService = {
      createBoard: jest.fn().mockImplementation((data) => ({ id: 'board-1', ...data })),
      updateBoard: jest.fn().mockImplementation((data) => ({ id: 'board-1', ...data })),
      deleteBoard: jest.fn().mockImplementation(() => ({ success: true })),
      nonValidatedMethod: jest.fn().mockReturnValue('test')
    };

    const validationConfig = {
      createBoard: BoardValidation.create,
      updateBoard: BoardValidation.update
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should create a proxy that validates method inputs', () => {
      const validatedService = createValidatedService(mockService, validationConfig);

      const validData = { name: 'Test Board' };
      const result = validatedService.createBoard(validData);

      expect(mockService.createBoard).toHaveBeenCalledWith(validData);
      expect(result).toEqual({ id: 'board-1', ...validData });
    });

    it('should throw ValidationError for invalid inputs', () => {
      const validatedService = createValidatedService(mockService, validationConfig);

      const invalidData = { name: '' };

      expect(() => validatedService.createBoard(invalidData)).toThrow(ValidationError);
      expect(mockService.createBoard).not.toHaveBeenCalled();
    });

    it('should pass through methods without validation config', () => {
      const validatedService = createValidatedService(mockService, validationConfig);

      const result = validatedService.deleteBoard('board-1');

      expect(mockService.deleteBoard).toHaveBeenCalledWith('board-1');
      expect(result).toEqual({ success: true });
    });

    it('should return non-function properties as-is', () => {
      const serviceWithProps = {
        ...mockService,
        config: { timeout: 5000 }
      };

      const validatedService = createValidatedService(serviceWithProps, validationConfig);

      expect(validatedService.config).toEqual({ timeout: 5000 });
    });

    it('should handle methods with no arguments', () => {
      const validatedService = createValidatedService(mockService, validationConfig);

      const result = validatedService.nonValidatedMethod();

      expect(mockService.nonValidatedMethod).toHaveBeenCalledWith();
      expect(result).toBe('test');
    });

    it('should handle methods with undefined first argument', () => {
      const validatedService = createValidatedService(mockService, validationConfig);

      const result = validatedService.createBoard(undefined);

      expect(mockService.createBoard).toHaveBeenCalledWith(undefined);
    });

    it('should preserve method context', () => {
      const contextService = {
        name: 'TestService',
        getName: function() { return this.name; }
      };

      const validatedService = createValidatedService(contextService, {});
      const result = validatedService.getName();

      expect(result).toBe('TestService');
    });
  });
});