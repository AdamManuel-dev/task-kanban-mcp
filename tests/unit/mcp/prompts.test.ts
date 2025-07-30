/**
 * @fileoverview Tests for MCP prompt management system
 * @lastmodified 2025-07-28T11:30:00Z
 * 
 * Features: Prompt registry, task planning, breakdown, prioritization, review
 * Test Coverage: CRUD operations, validation, error handling, integration
 * Test Tools: Jest, mock services, test fixtures
 * Patterns: Unit tests, integration tests, mocking, assertions
 */

import { MCPPromptRegistry, type PromptContent } from '../../../src/mcp/prompts';
import type { MCPServices } from '../../../src/mcp/tools';
import type { Prompt, PromptArgument } from '@modelcontextprotocol/sdk/types.js';

// Mock the logger to avoid console output during tests
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock MCPServices
const mockMCPServices: MCPServices = {
  boardService: {
    getBoard: jest.fn(),
    getBoards: jest.fn(),
    createBoard: jest.fn(),
    updateBoard: jest.fn(),
    deleteBoard: jest.fn(),
  },
  taskService: {
    getTask: jest.fn(),
    getTasks: jest.fn(),
    createTask: jest.fn(),
    updateTask: jest.fn(),
    deleteTask: jest.fn(),
    moveTask: jest.fn(),
    assignTask: jest.fn(),
  },
  noteService: {
    getNote: jest.fn(),
    getNotes: jest.fn(),
    createNote: jest.fn(),
    updateNote: jest.fn(),
    deleteNote: jest.fn(),
  },
  tagService: {
    getTag: jest.fn(),
    getTags: jest.fn(),
    createTag: jest.fn(),
    updateTag: jest.fn(),
    deleteTag: jest.fn(),
    assignTag: jest.fn(),
    unassignTag: jest.fn(),
  },
  contextService: {
    getContextData: jest.fn(),
    setContextData: jest.fn(),
    clearContext: jest.fn(),
  },
  searchService: {
    searchTasks: jest.fn(),
    searchNotes: jest.fn(),
    searchBoards: jest.fn(),
  },
  backupService: {
    createBackup: jest.fn(),
    restoreBackup: jest.fn(),
    listBackups: jest.fn(),
    deleteBackup: jest.fn(),
  },
} as any;

describe('MCPPromptRegistry', () => {
  let promptRegistry: MCPPromptRegistry;

  beforeEach(() => {
    promptRegistry = new MCPPromptRegistry(mockMCPServices);
    jest.clearAllMocks();
  });

  describe('Prompt List Operations', () => {
    it('should list all available prompts', async () => {
      const prompts = await promptRegistry.listPrompts();

      expect(prompts).toBeInstanceOf(Array);
      expect(prompts.length).toBeGreaterThan(0);

      // Check that all prompts have required properties
      prompts.forEach((prompt: Prompt) => {
        expect(prompt).toHaveProperty('name');
        expect(prompt).toHaveProperty('description');
        expect(prompt.name).toBeTruthy();
        expect(prompt.description).toBeTruthy();
        
        if (prompt.arguments) {
          expect(prompt.arguments).toBeInstanceOf(Array);
          prompt.arguments.forEach((arg: PromptArgument) => {
            expect(arg).toHaveProperty('name');
            expect(arg).toHaveProperty('description');
            expect(arg).toHaveProperty('required');
          });
        }
      });
    });

    it('should include task_planning prompt', async () => {
      const prompts = await promptRegistry.listPrompts();
      const taskPlanningPrompt = prompts.find(p => p.name === 'task_planning');

      expect(taskPlanningPrompt).toBeDefined();
      expect(taskPlanningPrompt?.description).toContain('plan and organize tasks');
      expect(taskPlanningPrompt?.arguments).toBeDefined();
      
      const boardIdArg = taskPlanningPrompt?.arguments?.find(arg => arg.name === 'board_id');
      expect(boardIdArg).toBeDefined();
      expect(boardIdArg?.required).toBe(true);
    });

    it('should include task_breakdown prompt', async () => {
      const prompts = await promptRegistry.listPrompts();
      const taskBreakdownPrompt = prompts.find(p => p.name === 'task_breakdown');

      expect(taskBreakdownPrompt).toBeDefined();
      expect(taskBreakdownPrompt?.description).toContain('Break down complex tasks');
      expect(taskBreakdownPrompt?.arguments).toBeDefined();
      
      const taskDescArg = taskBreakdownPrompt?.arguments?.find(arg => arg.name === 'task_description');
      expect(taskDescArg).toBeDefined();
      expect(taskDescArg?.required).toBe(true);
    });

    it('should include task_prioritization prompt', async () => {
      const prompts = await promptRegistry.listPrompts();
      const prioritizationPrompt = prompts.find(p => p.name === 'task_prioritization');

      expect(prioritizationPrompt).toBeDefined();
      expect(prioritizationPrompt?.description).toContain('prioritize tasks');
    });

    it('should include workflow_optimization prompt', async () => {
      const prompts = await promptRegistry.listPrompts();
      const workflowPrompt = prompts.find(p => p.name === 'workflow_optimization');

      expect(workflowPrompt).toBeDefined();
      expect(workflowPrompt?.description).toContain('workflow optimization');
    });
  });

  describe('Task Planning Prompt', () => {
    it('should generate task planning content with valid board_id', async () => {
      const mockBoard = {
        id: 'board-123',
        name: 'Test Board',
        description: 'Test board for planning',
        columns: [
          { id: 'col-1', name: 'To Do', position: 0 },
          { id: 'col-2', name: 'In Progress', position: 1 },
          { id: 'col-3', name: 'Done', position: 2 },
        ],
      };

      const mockTasks = [
        {
          id: 'task-1',
          title: 'Implement feature A',
          description: 'Add new functionality',
          priority: 'high',
          board_id: 'board-123',
          column_id: 'col-1',
        },
        {
          id: 'task-2',
          title: 'Fix bug B',
          description: 'Resolve critical issue',
          priority: 'critical',
          board_id: 'board-123',
          column_id: 'col-2',
        },
      ];

      mockMCPServices.boardService.getBoard.mockResolvedValue(mockBoard);
      mockMCPServices.taskService.getTasks.mockResolvedValue(mockTasks);

      const content = await promptRegistry.getPrompt('task_planning', {
        board_id: 'board-123',
        planning_horizon: 'week',
        focus_area: 'development',
      });

      expect(content).toHaveProperty('description');
      expect(content).toHaveProperty('messages');
      expect(content.messages).toBeInstanceOf(Array);
      expect(content.messages.length).toBeGreaterThan(0);

      // Verify service calls
      expect(mockMCPServices.boardService.getBoard).toHaveBeenCalledWith('board-123');
      expect(mockMCPServices.taskService.getTasks).toHaveBeenCalledWith({ board_id: 'board-123' });

      // Check that content includes board and task information
      const messageContent = JSON.stringify(content.messages);
      expect(messageContent).toContain('Test Board');
      expect(messageContent).toContain('Implement feature A');
      expect(messageContent).toContain('Fix bug B');
    });

    it('should handle missing board gracefully', async () => {
      mockMCPServices.boardService.getBoard.mockResolvedValue(null);

      await expect(
        promptRegistry.getPrompt('task_planning', { board_id: 'nonexistent-board' })
      ).rejects.toThrow('Board not found');
    });

    it('should handle service errors gracefully', async () => {
      mockMCPServices.boardService.getBoard.mockRejectedValue(new Error('Database error'));

      await expect(
        promptRegistry.getPrompt('task_planning', { board_id: 'board-123' })
      ).rejects.toThrow('Database error');
    });
  });

  describe('Task Breakdown Prompt', () => {
    it('should generate task breakdown content', async () => {
      const content = await promptRegistry.getPrompt('task_breakdown', {
        task_description: 'Build a user authentication system',
        board_id: 'board-123',
        complexity_level: 'medium',
      });

      expect(content).toHaveProperty('description');
      expect(content).toHaveProperty('messages');
      expect(content.messages).toBeInstanceOf(Array);

      // Check that content includes the task description
      const messageContent = JSON.stringify(content.messages);
      expect(messageContent).toContain('user authentication system');
      expect(messageContent).toContain('subtasks');
    });

    it('should handle different complexity levels', async () => {
      const complexContent = await promptRegistry.getPrompt('task_breakdown', {
        task_description: 'Implement complex distributed system',
        complexity_level: 'high',
      });

      const simpleContent = await promptRegistry.getPrompt('task_breakdown', {
        task_description: 'Update button color',
        complexity_level: 'low',
      });

      expect(complexContent.messages.length).toBeGreaterThanOrEqual(simpleContent.messages.length);
    });

    it('should require task_description parameter', async () => {
      await expect(
        promptRegistry.getPrompt('task_breakdown', {})
      ).rejects.toThrow('task_description is required');
    });
  });

  describe('Task Prioritization Prompt', () => {
    it('should generate prioritization content with board context', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Critical bug fix',
          priority: 'critical',
          created_at: '2025-07-20T10:00:00Z',
        },
        {
          id: 'task-2',
          title: 'Feature enhancement',
          priority: 'medium',
          created_at: '2025-07-25T10:00:00Z',
        },
        {
          id: 'task-3',
          title: 'Documentation update',
          priority: 'low',
          created_at: '2025-07-27T10:00:00Z',
        },
      ];

      mockMCPServices.taskService.getTasks.mockResolvedValue(mockTasks);

      const content = await promptRegistry.getPrompt('task_prioritization', {
        board_id: 'board-123',
        criteria: 'business_impact',
      });

      expect(content).toHaveProperty('description');
      expect(content).toHaveProperty('messages');

      // Verify service calls
      expect(mockMCPServices.taskService.getTasks).toHaveBeenCalledWith({ board_id: 'board-123' });

      // Check that content includes task information and prioritization criteria
      const messageContent = JSON.stringify(content.messages);
      expect(messageContent).toContain('Critical bug fix');
      expect(messageContent).toContain('business_impact');
      expect(messageContent).toContain('prioritization');
    });

    it('should handle empty task list', async () => {
      mockMCPServices.taskService.getTasks.mockResolvedValue([]);

      const content = await promptRegistry.getPrompt('task_prioritization', {
        board_id: 'empty-board',
      });

      expect(content.messages).toBeInstanceOf(Array);
      const messageContent = JSON.stringify(content.messages);
      expect(messageContent).toContain('no tasks');
    });
  });

  describe('Code Review Prompt', () => {
    it('should generate code review content', async () => {
      const content = await promptRegistry.getPrompt('code_review', {
        task_id: 'task-123',
        review_focus: 'security',
      });

      expect(content).toHaveProperty('description');
      expect(content).toHaveProperty('messages');

      const messageContent = JSON.stringify(content.messages);
      expect(messageContent).toContain('code review');
      expect(messageContent).toContain('security');
    });

    it('should handle different review focus areas', async () => {
      const securityReview = await promptRegistry.getPrompt('code_review', {
        task_id: 'task-123',
        review_focus: 'security',
      });

      const performanceReview = await promptRegistry.getPrompt('code_review', {
        task_id: 'task-123',
        review_focus: 'performance',
      });

      const securityContent = JSON.stringify(securityReview.messages);
      const performanceContent = JSON.stringify(performanceReview.messages);

      expect(securityContent).toContain('security');
      expect(performanceContent).toContain('performance');
    });
  });

  describe('Workflow Optimization Prompt', () => {
    it('should generate workflow optimization content', async () => {
      const mockBoard = {
        id: 'board-123',
        name: 'Development Board',
        columns: [
          { id: 'col-1', name: 'Backlog', position: 0 },
          { id: 'col-2', name: 'In Progress', position: 1 },
          { id: 'col-3', name: 'Review', position: 2 },
          { id: 'col-4', name: 'Done', position: 3 },
        ],
      };

      mockMCPServices.boardService.getBoard.mockResolvedValue(mockBoard);

      const content = await promptRegistry.getPrompt('workflow_optimization', {
        board_id: 'board-123',
        optimization_goal: 'reduce_cycle_time',
      });

      expect(content).toHaveProperty('description');
      expect(content).toHaveProperty('messages');

      const messageContent = JSON.stringify(content.messages);
      expect(messageContent).toContain('workflow');
      expect(messageContent).toContain('optimization');
      expect(messageContent).toContain('cycle_time');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown prompt', async () => {
      await expect(
        promptRegistry.getPrompt('unknown_prompt', {})
      ).rejects.toThrow('Unknown prompt: unknown_prompt');
    });

    it('should validate required parameters', async () => {
      await expect(
        promptRegistry.getPrompt('task_planning', {})
      ).rejects.toThrow('board_id is required');
    });

    it('should handle service unavailability', async () => {
      mockMCPServices.boardService.getBoard.mockRejectedValue(
        new Error('Service temporarily unavailable')
      );

      await expect(
        promptRegistry.getPrompt('task_planning', { board_id: 'board-123' })
      ).rejects.toThrow('Service temporarily unavailable');
    });
  });

  describe('Integration Tests', () => {
    it('should work with real-like data flow', async () => {
      // Setup realistic mock data
      const mockBoard = {
        id: 'board-123',
        name: 'Sprint Board',
        description: 'Current sprint work',
        columns: [
          { id: 'col-1', name: 'To Do', position: 0 },
          { id: 'col-2', name: 'In Progress', position: 1 },
          { id: 'col-3', name: 'Done', position: 2 },
        ],
      };

      const mockTasks = [
        {
          id: 'task-1',
          title: 'Implement user authentication',
          description: 'Add login and registration functionality',
          priority: 'high',
          status: 'todo',
          board_id: 'board-123',
          column_id: 'col-1',
          created_at: '2025-07-26T10:00:00Z',
        },
        {
          id: 'task-2',
          title: 'Setup CI/CD pipeline',
          description: 'Configure automated deployment',
          priority: 'medium',
          status: 'in_progress',
          board_id: 'board-123',
          column_id: 'col-2',
          created_at: '2025-07-25T10:00:00Z',
        },
      ];

      mockMCPServices.boardService.getBoard.mockResolvedValue(mockBoard);
      mockMCPServices.taskService.getTasks.mockResolvedValue(mockTasks);

      // Test task planning
      const planningContent = await promptRegistry.getPrompt('task_planning', {
        board_id: 'board-123',
        planning_horizon: 'sprint',
      });

      expect(planningContent.messages).toBeInstanceOf(Array);
      expect(planningContent.messages.length).toBeGreaterThan(0);

      // Test task breakdown
      const breakdownContent = await promptRegistry.getPrompt('task_breakdown', {
        task_description: 'Implement user authentication',
        board_id: 'board-123',
      });

      expect(breakdownContent.messages).toBeInstanceOf(Array);

      // Test prioritization
      const prioritizationContent = await promptRegistry.getPrompt('task_prioritization', {
        board_id: 'board-123',
      });

      expect(prioritizationContent.messages).toBeInstanceOf(Array);

      // Verify all service calls were made correctly
      expect(mockMCPServices.boardService.getBoard).toHaveBeenCalledWith('board-123');
      expect(mockMCPServices.taskService.getTasks).toHaveBeenCalledWith({ board_id: 'board-123' });
    });
  });

  describe('Performance Tests', () => {
    it('should handle large number of tasks efficiently', async () => {
      // Generate large dataset
      const largeMockTasks = Array.from({ length: 1000 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        description: `Description for task ${i}`,
        priority: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
        board_id: 'board-123',
      }));

      mockMCPServices.taskService.getTasks.mockResolvedValue(largeMockTasks);

      const startTime = Date.now();
      
      const content = await promptRegistry.getPrompt('task_prioritization', {
        board_id: 'board-123',
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(content).toHaveProperty('messages');
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should timeout gracefully for slow services', async () => {
      // Mock a slow service call
      mockMCPServices.boardService.getBoard.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(null), 10000))
      );

      // This should timeout or handle gracefully
      await expect(
        promptRegistry.getPrompt('task_planning', { board_id: 'board-123' })
      ).resolves.toBeDefined();
    }, 15000);
  });
});

describe('PromptContent Interface', () => {
  it('should have proper TypeScript types', () => {
    const content: PromptContent = {
      description: 'Test prompt',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Test message',
          },
        },
      ],
    };

    expect(content.description).toBe('Test prompt');
    expect(content.messages).toBeInstanceOf(Array);
    expect(content.messages[0].role).toBe('user');
  });
});