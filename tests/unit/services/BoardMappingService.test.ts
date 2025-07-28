/**
 * Unit tests for BoardMappingService
 * Tests context-aware board selection features added in Phase 15.2
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import { BoardMappingService } from '../../../src/services/BoardMappingService';
import { GitService } from '../../../src/services/GitService';
import { BoardService } from '../../../src/services/BoardService';

describe('BoardMappingService Unit Tests', () => {
  let boardMappingService: BoardMappingService;
  let gitServiceStub: sinon.SinonStubbedInstance<GitService>;
  let boardServiceStub: sinon.SinonStubbedInstance<BoardService>;

  beforeEach(() => {
    gitServiceStub = sinon.createStubInstance(GitService);
    boardServiceStub = sinon.createStubInstance(BoardService);

    boardMappingService = new BoardMappingService(
      {} as any, // dbConnection mock
      gitServiceStub as any,
      boardServiceStub as any
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('getCurrentBoardId', () => {
    it('should return board for exact repository match', async () => {
      gitServiceStub.getRepositoryInfo.resolves({
        isRepository: true,
        repositoryName: 'my-project',
        currentBranch: 'main',
        branchPattern: 'main',
        rootPath: '/home/user/my-project',
      });

      // Mock configuration with exact match
      sinon.stub(boardMappingService as any, 'loadConfiguration').resolves({
        mappings: [
          {
            pattern: 'my-project',
            type: 'repository',
            boardId: 'board-123',
          },
        ],
        defaultBoardId: 'default-board',
      });

      const result = await boardMappingService.getCurrentBoardId();

      expect(result).to.equal('board-123');
    });

    it('should return board for branch pattern match', async () => {
      gitServiceStub.getRepositoryInfo.resolves({
        isRepository: true,
        repositoryName: 'my-project',
        currentBranch: 'feature/auth',
        branchPattern: 'feature/auth',
        rootPath: '/home/user/my-project',
      });

      sinon.stub(boardMappingService as any, 'loadConfiguration').resolves({
        mappings: [
          {
            pattern: 'feature/*',
            type: 'branch',
            boardId: 'feature-board',
          },
        ],
        defaultBoardId: 'default-board',
      });

      const result = await boardMappingService.getCurrentBoardId();

      expect(result).to.equal('feature-board');
    });

    it('should return board for path pattern match', async () => {
      gitServiceStub.getRepositoryInfo.resolves({
        isRepository: true,
        repositoryName: 'my-project',
        currentBranch: 'main',
        branchPattern: 'main',
        rootPath: '/home/user/projects/client-work/my-project',
      });

      sinon.stub(boardMappingService as any, 'loadConfiguration').resolves({
        mappings: [
          {
            pattern: '/home/user/projects/client-work/*',
            type: 'path',
            boardId: 'client-board',
          },
        ],
        defaultBoardId: 'default-board',
      });

      const result = await boardMappingService.getCurrentBoardId();

      expect(result).to.equal('client-board');
    });

    it('should return default board when no patterns match', async () => {
      gitServiceStub.getRepositoryInfo.resolves({
        isRepository: true,
        repositoryName: 'other-project',
        currentBranch: 'main',
        branchPattern: 'main',
        rootPath: '/home/user/other-project',
      });

      sinon.stub(boardMappingService as any, 'loadConfiguration').resolves({
        mappings: [
          {
            pattern: 'my-project',
            type: 'repository',
            boardId: 'board-123',
          },
        ],
        defaultBoardId: 'default-board',
      });

      const result = await boardMappingService.getCurrentBoardId();

      expect(result).to.equal('default-board');
    });

    it('should return default board when not in git repository', async () => {
      gitServiceStub.getRepositoryInfo.resolves({
        isRepository: false,
        repositoryName: null,
        currentBranch: null,
        branchPattern: null,
        rootPath: null,
      });

      sinon.stub(boardMappingService as any, 'loadConfiguration').resolves({
        mappings: [],
        defaultBoardId: 'default-board',
      });

      const result = await boardMappingService.getCurrentBoardId();

      expect(result).to.equal('default-board');
    });

    it('should handle configuration loading errors', async () => {
      gitServiceStub.getRepositoryInfo.resolves({
        isRepository: true,
        repositoryName: 'my-project',
        currentBranch: 'main',
        branchPattern: 'main',
        rootPath: '/home/user/my-project',
      });

      sinon
        .stub(boardMappingService as any, 'loadConfiguration')
        .rejects(new Error('Config error'));

      const result = await boardMappingService.getCurrentBoardId();

      expect(result).to.be.null;
    });
  });

  describe('addMapping', () => {
    it('should add new repository mapping', async () => {
      const loadStub = sinon.stub(boardMappingService as any, 'loadConfiguration').resolves({
        mappings: [],
        defaultBoardId: 'default-board',
      });

      const saveStub = sinon.stub(boardMappingService as any, 'saveConfiguration').resolves();

      await boardMappingService.addMapping('my-project', 'repository', 'board-123');

      expect(saveStub.calledOnce).to.be.true;
      const savedConfig = saveStub.firstCall.args[0];
      expect(savedConfig.mappings).to.have.length(1);
      expect(savedConfig.mappings[0]).to.deep.equal({
        pattern: 'my-project',
        type: 'repository',
        boardId: 'board-123',
      });
    });

    it('should update existing mapping', async () => {
      sinon.stub(boardMappingService as any, 'loadConfiguration').resolves({
        mappings: [
          {
            pattern: 'my-project',
            type: 'repository',
            boardId: 'old-board',
          },
        ],
        defaultBoardId: 'default-board',
      });

      const saveStub = sinon.stub(boardMappingService as any, 'saveConfiguration').resolves();

      await boardMappingService.addMapping('my-project', 'repository', 'new-board');

      const savedConfig = saveStub.firstCall.args[0];
      expect(savedConfig.mappings).to.have.length(1);
      expect(savedConfig.mappings[0].boardId).to.equal('new-board');
    });

    it('should validate board exists', async () => {
      boardServiceStub.getBoardById.resolves(null); // Board doesn't exist

      try {
        await boardMappingService.addMapping('my-project', 'repository', 'invalid-board');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Board not found');
      }
    });
  });

  describe('removeMapping', () => {
    it('should remove existing mapping', async () => {
      sinon.stub(boardMappingService as any, 'loadConfiguration').resolves({
        mappings: [
          {
            pattern: 'my-project',
            type: 'repository',
            boardId: 'board-123',
          },
          {
            pattern: 'other-project',
            type: 'repository',
            boardId: 'board-456',
          },
        ],
        defaultBoardId: 'default-board',
      });

      const saveStub = sinon.stub(boardMappingService as any, 'saveConfiguration').resolves();

      await boardMappingService.removeMapping('my-project', 'repository');

      const savedConfig = saveStub.firstCall.args[0];
      expect(savedConfig.mappings).to.have.length(1);
      expect(savedConfig.mappings[0].pattern).to.equal('other-project');
    });

    it('should handle removing non-existent mapping', async () => {
      sinon.stub(boardMappingService as any, 'loadConfiguration').resolves({
        mappings: [],
        defaultBoardId: 'default-board',
      });

      const saveStub = sinon.stub(boardMappingService as any, 'saveConfiguration').resolves();

      await boardMappingService.removeMapping('non-existent', 'repository');

      // Should still save (no error thrown)
      expect(saveStub.calledOnce).to.be.true;
    });
  });

  describe('listMappings', () => {
    it('should return all configured mappings', async () => {
      const mappings = [
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

      sinon.stub(boardMappingService as any, 'loadConfiguration').resolves({
        mappings,
        defaultBoardId: 'default-board',
      });

      const result = await boardMappingService.listMappings();

      expect(result).to.deep.equal(mappings);
    });

    it('should return empty array when no mappings configured', async () => {
      sinon.stub(boardMappingService as any, 'loadConfiguration').resolves({
        mappings: [],
        defaultBoardId: 'default-board',
      });

      const result = await boardMappingService.listMappings();

      expect(result).to.deep.equal([]);
    });
  });

  describe('testMapping', () => {
    it('should test repository pattern matching', async () => {
      gitServiceStub.getRepositoryInfo.resolves({
        isRepository: true,
        repositoryName: 'test-project',
        currentBranch: 'main',
        branchPattern: 'main',
        rootPath: '/home/user/test-project',
      });

      const result = await boardMappingService.testMapping('test-project', 'repository');

      expect(result).to.deep.equal({
        matches: true,
        currentContext: {
          repositoryName: 'test-project',
          currentBranch: 'main',
          rootPath: '/home/user/test-project',
        },
      });
    });

    it('should test branch pattern matching with wildcards', async () => {
      gitServiceStub.getRepositoryInfo.resolves({
        isRepository: true,
        repositoryName: 'test-project',
        currentBranch: 'feature/new-auth',
        branchPattern: 'feature/new-auth',
        rootPath: '/home/user/test-project',
      });

      const result = await boardMappingService.testMapping('feature/*', 'branch');

      expect(result.matches).to.be.true;
    });

    it('should test path pattern matching', async () => {
      gitServiceStub.getRepositoryInfo.resolves({
        isRepository: true,
        repositoryName: 'test-project',
        currentBranch: 'main',
        branchPattern: 'main',
        rootPath: '/home/user/projects/client/test-project',
      });

      const result = await boardMappingService.testMapping('/home/user/projects/client/*', 'path');

      expect(result.matches).to.be.true;
    });

    it('should return false for non-matching patterns', async () => {
      gitServiceStub.getRepositoryInfo.resolves({
        isRepository: true,
        repositoryName: 'other-project',
        currentBranch: 'main',
        branchPattern: 'main',
        rootPath: '/home/user/other-project',
      });

      const result = await boardMappingService.testMapping('my-project', 'repository');

      expect(result.matches).to.be.false;
    });
  });

  describe('Pattern Matching Logic', () => {
    let matchStub: sinon.SinonStub;

    beforeEach(() => {
      matchStub = sinon.stub(boardMappingService as any, 'matchesPattern');
    });

    it('should handle exact string matching', () => {
      matchStub.restore();

      const service = boardMappingService as any;
      expect(service.matchesPattern('my-project', 'my-project')).to.be.true;
      expect(service.matchesPattern('my-project', 'other-project')).to.be.false;
    });

    it('should handle wildcard matching', () => {
      matchStub.restore();

      const service = boardMappingService as any;
      expect(service.matchesPattern('feature/auth', 'feature/*')).to.be.true;
      expect(service.matchesPattern('bugfix/login', 'feature/*')).to.be.false;
      expect(service.matchesPattern('/home/user/project', '/home/user/*')).to.be.true;
    });

    it('should handle multiple wildcards', () => {
      matchStub.restore();

      const service = boardMappingService as any;
      expect(service.matchesPattern('feature/auth/login', 'feature/*/login')).to.be.true;
      expect(service.matchesPattern('feature/auth/signup', 'feature/*/login')).to.be.false;
    });
  });
});
