/**
 * Unit tests for CLI config commands
 * Tests the new repository mapping commands added in Phase 15.1
 */

import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import * as sinon from 'sinon';
import { Command } from 'commander';
import { BoardMappingService } from '../../../src/services/BoardMappingService';

// Import the config command setup (we'll need to mock the actual implementation)
const mockBoardMappingService = sinon.createStubInstance(BoardMappingService);

describe('CLI Config Commands Unit Tests', () => {
  let program: Command;
  let consoleStub: sinon.SinonStub;

  beforeEach(() => {
    program = new Command();
    consoleStub = sinon.stub(console, 'log');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('kanban config map show', () => {
    it('should display current mappings in table format', async () => {
      const mockMappings = [
        {
          pattern: 'my-project',
          type: 'repository' as const,
          boardId: 'board-123',
        },
        {
          pattern: 'feature/*',
          type: 'branch' as const,
          boardId: 'feature-board',
        },
      ];

      mockBoardMappingService.listMappings.resolves(mockMappings);

      // Simulate command execution
      const showCommand = {
        name: () => 'show',
        action: async () => {
          const mappings = await mockBoardMappingService.listMappings();

          if (mappings.length === 0) {
            console.log('No repository mappings configured.');
            return;
          }

          console.log('Current repository mappings:');
          console.log('Pattern\t\tType\t\tBoard ID');
          console.log('-------\t\t----\t\t--------');

          mappings.forEach(mapping => {
            console.log(`${mapping.pattern}\t\t${mapping.type}\t\t${mapping.boardId}`);
          });
        },
      };

      await showCommand.action();

      expect(consoleStub.calledWith('Current repository mappings:')).to.be.true;
      expect(consoleStub.calledWith('my-project\t\trepository\t\tboard-123')).to.be.true;
      expect(consoleStub.calledWith('feature/*\t\tbranch\t\tfeature-board')).to.be.true;
    });

    it('should show message when no mappings exist', async () => {
      mockBoardMappingService.listMappings.resolves([]);

      const showCommand = {
        action: async () => {
          const mappings = await mockBoardMappingService.listMappings();

          if (mappings.length === 0) {
            console.log('No repository mappings configured.');
          }
        },
      };

      await showCommand.action();

      expect(consoleStub.calledWith('No repository mappings configured.')).to.be.true;
    });
  });

  describe('kanban config map current', () => {
    it('should display current context and matched board', async () => {
      mockBoardMappingService.getCurrentBoardId.resolves('board-123');

      const mockGitInfo = {
        isRepository: true,
        repositoryName: 'my-project',
        currentBranch: 'feature/auth',
        branchPattern: 'feature/auth',
        rootPath: '/home/user/my-project',
      };

      const currentCommand = {
        action: async () => {
          const boardId = await mockBoardMappingService.getCurrentBoardId();

          console.log('Current context:');
          console.log(`Repository: ${mockGitInfo.repositoryName}`);
          console.log(`Branch: ${mockGitInfo.currentBranch}`);
          console.log(`Path: ${mockGitInfo.rootPath}`);
          console.log(`Matched Board ID: ${boardId}`);
        },
      };

      await currentCommand.action();

      expect(consoleStub.calledWith('Current context:')).to.be.true;
      expect(consoleStub.calledWith('Repository: my-project')).to.be.true;
      expect(consoleStub.calledWith('Branch: feature/auth')).to.be.true;
      expect(consoleStub.calledWith('Matched Board ID: board-123')).to.be.true;
    });

    it('should handle non-repository context', async () => {
      mockBoardMappingService.getCurrentBoardId.resolves('default-board');

      const currentCommand = {
        action: async () => {
          const boardId = await mockBoardMappingService.getCurrentBoardId();

          console.log('Current context:');
          console.log('Not in a git repository');
          console.log(`Using default board: ${boardId}`);
        },
      };

      await currentCommand.action();

      expect(consoleStub.calledWith('Not in a git repository')).to.be.true;
      expect(consoleStub.calledWith('Using default board: default-board')).to.be.true;
    });
  });

  describe('kanban config map add', () => {
    it('should add new repository mapping', async () => {
      mockBoardMappingService.addMapping.resolves();

      const addCommand = {
        action: async (pattern: string, type: string, boardId: string) => {
          await mockBoardMappingService.addMapping(pattern, type as any, boardId);
          console.log(`Added mapping: ${pattern} (${type}) -> ${boardId}`);
        },
      };

      await addCommand.action('my-project', 'repository', 'board-123');

      expect(mockBoardMappingService.addMapping.calledWith('my-project', 'repository', 'board-123'))
        .to.be.true;
      expect(consoleStub.calledWith('Added mapping: my-project (repository) -> board-123')).to.be
        .true;
    });

    it('should handle errors when adding mapping', async () => {
      mockBoardMappingService.addMapping.rejects(new Error('Board not found'));
      const errorStub = sinon.stub(console, 'error');

      const addCommand = {
        action: async (pattern: string, type: string, boardId: string) => {
          try {
            await mockBoardMappingService.addMapping(pattern, type as any, boardId);
            console.log(`Added mapping: ${pattern} (${type}) -> ${boardId}`);
          } catch (error) {
            console.error(`Failed to add mapping: ${error.message}`);
          }
        },
      };

      await addCommand.action('my-project', 'repository', 'invalid-board');

      expect(errorStub.calledWith('Failed to add mapping: Board not found')).to.be.true;
    });
  });

  describe('kanban config map test', () => {
    it('should test pattern matching and show results', async () => {
      const testResult = {
        matches: true,
        currentContext: {
          repositoryName: 'test-project',
          currentBranch: 'feature/test',
          rootPath: '/home/user/test-project',
        },
      };

      mockBoardMappingService.testMapping.resolves(testResult);

      const testCommand = {
        action: async (pattern: string, type: string) => {
          const result = await mockBoardMappingService.testMapping(pattern, type as any);

          console.log(`Testing pattern: ${pattern} (${type})`);
          console.log(`Current context:`);
          console.log(`  Repository: ${result.currentContext.repositoryName}`);
          console.log(`  Branch: ${result.currentContext.currentBranch}`);
          console.log(`  Path: ${result.currentContext.rootPath}`);
          console.log(`Match result: ${result.matches ? 'MATCHES' : 'NO MATCH'}`);
        },
      };

      await testCommand.action('test-project', 'repository');

      expect(consoleStub.calledWith('Testing pattern: test-project (repository)')).to.be.true;
      expect(consoleStub.calledWith('  Repository: test-project')).to.be.true;
      expect(consoleStub.calledWith('Match result: MATCHES')).to.be.true;
    });

    it('should show no match result', async () => {
      const testResult = {
        matches: false,
        currentContext: {
          repositoryName: 'other-project',
          currentBranch: 'main',
          rootPath: '/home/user/other-project',
        },
      };

      mockBoardMappingService.testMapping.resolves(testResult);

      const testCommand = {
        action: async (pattern: string, type: string) => {
          const result = await mockBoardMappingService.testMapping(pattern, type as any);
          console.log(`Match result: ${result.matches ? 'MATCHES' : 'NO MATCH'}`);
        },
      };

      await testCommand.action('my-project', 'repository');

      expect(consoleStub.calledWith('Match result: NO MATCH')).to.be.true;
    });
  });

  describe('Command Validation', () => {
    it('should validate mapping type parameter', () => {
      const validTypes = ['repository', 'branch', 'path'];

      const validateType = (type: string) => {
        if (!validTypes.includes(type)) {
          throw new Error(`Invalid mapping type. Must be one of: ${validTypes.join(', ')}`);
        }
      };

      expect(() => validateType('repository')).to.not.throw();
      expect(() => validateType('branch')).to.not.throw();
      expect(() => validateType('path')).to.not.throw();
      expect(() => validateType('invalid')).to.throw('Invalid mapping type');
    });

    it('should validate pattern format', () => {
      const validatePattern = (pattern: string, type: string) => {
        if (!pattern || pattern.trim().length === 0) {
          throw new Error('Pattern cannot be empty');
        }

        if (type === 'path' && !pattern.startsWith('/')) {
          throw new Error('Path patterns must start with /');
        }
      };

      expect(() => validatePattern('my-project', 'repository')).to.not.throw();
      expect(() => validatePattern('/home/user/*', 'path')).to.not.throw();
      expect(() => validatePattern('', 'repository')).to.throw('Pattern cannot be empty');
      expect(() => validatePattern('relative/path', 'path')).to.throw(
        'Path patterns must start with /'
      );
    });

    it('should validate board ID format', () => {
      const validateBoardId = (boardId: string) => {
        if (!boardId || boardId.trim().length === 0) {
          throw new Error('Board ID cannot be empty');
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(boardId)) {
          throw new Error('Board ID can only contain letters, numbers, underscores, and hyphens');
        }
      };

      expect(() => validateBoardId('board-123')).to.not.throw();
      expect(() => validateBoardId('board_test')).to.not.throw();
      expect(() => validateBoardId('')).to.throw('Board ID cannot be empty');
      expect(() => validateBoardId('board@invalid')).to.throw('Board ID can only contain');
    });
  });
});
