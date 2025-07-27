/**
 * Unit tests for TaskSizeEstimator
 */

import { TaskSizeEstimator } from '../task-size-estimator';

describe('TaskSizeEstimator', () => {
  let estimator: TaskSizeEstimator;

  beforeEach(() => {
    estimator = new TaskSizeEstimator();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(estimator).toBeInstanceOf(TaskSizeEstimator);
    });

    it('should accept custom historical data', () => {
      const historicalData = [
        { title: 'Fix bug', size: 'S', actualHours: 2 },
        { title: 'Add feature', size: 'M', actualHours: 8 },
      ];
      
      const customEstimator = new TaskSizeEstimator(historicalData);
      expect(customEstimator).toBeInstanceOf(TaskSizeEstimator);
    });
  });

  describe('estimateTime', () => {
    it('should estimate time for simple tasks', () => {
      const task = {
        title: 'Fix typo in readme',
        description: 'Simple text change',
      };

      const estimate = estimator.estimateTime(task);
      
      expect(estimate).toHaveProperty('suggestedSize');
      expect(estimate).toHaveProperty('estimatedHours');
      expect(estimate).toHaveProperty('confidence');
      expect(estimate).toHaveProperty('reasoning');
      expect(estimate.confidence).toBeGreaterThan(0);
      expect(estimate.confidence).toBeLessThanOrEqual(1);
    });

    it('should suggest XS for very simple tasks', () => {
      const task = {
        title: 'Fix typo',
        description: 'Change one word',
      };

      const estimate = estimator.estimateTime(task);
      expect(estimate.suggestedSize).toBe('XS');
      expect(estimate.estimatedHours).toBeLessThanOrEqual(1);
    });

    it('should suggest larger sizes for complex tasks', () => {
      const task = {
        title: 'Implement user authentication system',
        description: 'Build complete auth with JWT, OAuth, password reset, email verification, rate limiting, and security audit',
      };

      const estimate = estimator.estimateTime(task);
      expect(['L', 'XL']).toContain(estimate.suggestedSize);
      expect(estimate.estimatedHours).toBeGreaterThan(8);
    });

    it('should handle tasks with no description', () => {
      const task = {
        title: 'Update user profile',
      };

      const estimate = estimator.estimateTime(task);
      expect(estimate).toHaveProperty('suggestedSize');
      expect(estimate.confidence).toBeGreaterThan(0);
    });

    it('should provide reasoning for estimates', () => {
      const task = {
        title: 'Add new API endpoint',
        description: 'Create REST endpoint for user management',
      };

      const estimate = estimator.estimateTime(task);
      expect(estimate.reasoning).toContain('API');
      expect(estimate.reasoning.length).toBeGreaterThan(0);
    });

    it('should handle complex technical tasks', () => {
      const task = {
        title: 'Optimize database performance',
        description: 'Add indexes, optimize queries, implement caching, database migrations',
      };

      const estimate = estimator.estimateTime(task);
      expect(['M', 'L', 'XL']).toContain(estimate.suggestedSize);
      expect(estimate.confidence).toBeGreaterThan(0.3);
    });
  });

  describe('groupTasksBySize', () => {
    it('should group tasks by estimated size', () => {
      const tasks = [
        { title: 'Fix typo', description: 'Simple change' },
        { title: 'Add feature', description: 'Complex new functionality with API integration' },
        { title: 'Update readme', description: 'Documentation update' },
        { title: 'Refactor module', description: 'Major code restructuring' },
      ];

      const grouped = estimator.groupTasksBySize(tasks);
      
      expect(grouped).toHaveProperty('XS');
      expect(grouped).toHaveProperty('S');
      expect(grouped).toHaveProperty('M');
      expect(grouped).toHaveProperty('L');
      expect(grouped).toHaveProperty('XL');
      
      // Check that each group is an array
      Object.values(grouped).forEach(group => {
        expect(Array.isArray(group)).toBe(true);
      });
    });

    it('should handle empty task array', () => {
      const grouped = estimator.groupTasksBySize([]);
      
      Object.values(grouped).forEach(group => {
        expect(group).toHaveLength(0);
      });
    });

    it('should include task details in grouped results', () => {
      const tasks = [
        { title: 'Simple task', description: 'Easy fix' },
      ];

      const grouped = estimator.groupTasksBySize(tasks);
      const allTasks = Object.values(grouped).flat();
      
      expect(allTasks.length).toBe(1);
      expect(allTasks[0]).toHaveProperty('task');
      expect(allTasks[0]).toHaveProperty('estimate');
      expect(allTasks[0].task.title).toBe('Simple task');
    });
  });

  describe('displayEstimates', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should display estimates for task groups', () => {
      const taskGroups = {
        XS: [
          {
            task: { title: 'Fix typo', description: 'Simple change' },
            estimate: { suggestedSize: 'XS', estimatedHours: 0.5, confidence: 0.9, reasoning: 'Simple text change' },
          },
        ],
        S: [],
        M: [
          {
            task: { title: 'Add feature', description: 'New functionality' },
            estimate: { suggestedSize: 'M', estimatedHours: 4, confidence: 0.7, reasoning: 'Moderate complexity' },
          },
        ],
        L: [],
        XL: [],
      };

      estimator.displayEstimates(taskGroups);
      
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('XS');
      expect(output).toContain('Fix typo');
      expect(output).toContain('M');
      expect(output).toContain('Add feature');
    });

    it('should handle empty task groups', () => {
      const emptyGroups = {
        XS: [],
        S: [],
        M: [],
        L: [],
        XL: [],
      };

      expect(() => estimator.displayEstimates(emptyGroups)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should show summary statistics', () => {
      const taskGroups = {
        XS: [{ task: { title: 'Task 1' }, estimate: { estimatedHours: 1 } }],
        S: [{ task: { title: 'Task 2' }, estimate: { estimatedHours: 2 } }],
        M: [],
        L: [],
        XL: [],
      };

      estimator.displayEstimates(taskGroups);
      
      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Total');
      expect(output).toContain('2'); // Total tasks
    });
  });

  describe('suggestTaskSize', () => {
    it('should return valid size suggestions', () => {
      const validSizes = ['XS', 'S', 'M', 'L', 'XL'];
      
      const suggestions = [
        estimator.suggestTaskSize('Fix typo'),
        estimator.suggestTaskSize('Add new feature with database changes'),
        estimator.suggestTaskSize('Refactor entire authentication system'),
      ];

      suggestions.forEach(suggestion => {
        expect(validSizes).toContain(suggestion);
      });
    });

    it('should handle empty titles', () => {
      const suggestion = estimator.suggestTaskSize('');
      expect(['XS', 'S', 'M', 'L', 'XL']).toContain(suggestion);
    });

    it('should be consistent for similar inputs', () => {
      const title1 = 'Fix login bug';
      const title2 = 'Fix login bug';
      
      const suggestion1 = estimator.suggestTaskSize(title1);
      const suggestion2 = estimator.suggestTaskSize(title2);
      
      expect(suggestion1).toBe(suggestion2);
    });

    it('should recognize common patterns', () => {
      const fixSuggestion = estimator.suggestTaskSize('Fix small CSS issue');
      const implementSuggestion = estimator.suggestTaskSize('Implement complete user management system');
      
      expect(['XS', 'S']).toContain(fixSuggestion);
      expect(['L', 'XL']).toContain(implementSuggestion);
    });
  });

  describe('complexity factors', () => {
    it('should identify API-related complexity', () => {
      const task = {
        title: 'Create REST API',
        description: 'Build endpoints with authentication',
      };

      const estimate = estimator.estimateTime(task);
      expect(estimate.estimatedHours).toBeGreaterThan(2);
    });

    it('should identify database-related complexity', () => {
      const task = {
        title: 'Database migration',
        description: 'Create new tables and relationships',
      };

      const estimate = estimator.estimateTime(task);
      expect(estimate.estimatedHours).toBeGreaterThan(1);
    });

    it('should identify UI complexity', () => {
      const task = {
        title: 'Build responsive dashboard',
        description: 'Create interactive charts and forms',
      };

      const estimate = estimator.estimateTime(task);
      expect(estimate.estimatedHours).toBeGreaterThan(2);
    });

    it('should identify testing complexity', () => {
      const task = {
        title: 'Add comprehensive tests',
        description: 'Unit tests, integration tests, e2e tests',
      };

      const estimate = estimator.estimateTime(task);
      expect(estimate.estimatedHours).toBeGreaterThan(3);
    });
  });

  describe('confidence scoring', () => {
    it('should have high confidence for simple tasks', () => {
      const task = {
        title: 'Fix typo',
        description: 'Change one word',
      };

      const estimate = estimator.estimateTime(task);
      expect(estimate.confidence).toBeGreaterThan(0.8);
    });

    it('should have lower confidence for vague tasks', () => {
      const task = {
        title: 'Improve performance',
        description: '',
      };

      const estimate = estimator.estimateTime(task);
      expect(estimate.confidence).toBeLessThan(0.7);
    });

    it('should have moderate confidence for well-defined tasks', () => {
      const task = {
        title: 'Add user registration form',
        description: 'Create form with validation and email confirmation',
      };

      const estimate = estimator.estimateTime(task);
      expect(estimate.confidence).toBeGreaterThan(0.5);
      expect(estimate.confidence).toBeLessThan(0.9);
    });
  });
});