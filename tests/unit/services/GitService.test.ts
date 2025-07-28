/**
 * Unit tests for GitService
 * Tests git integration features added in Phase 15.2
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GitService } from '../../../src/services/GitService';

describe('GitService Unit Tests', () => {
  let gitService: GitService;
  let fsStub: sinon.SinonStub;
  let processStub: sinon.SinonStub;

  beforeEach(() => {
    gitService = new GitService();
    fsStub = sinon.stub(fs, 'access');
    processStub = sinon.stub(process, 'cwd');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('detectRepository', () => {
    it('should detect git repository in current directory', async () => {
      processStub.returns('/test/project');
      fsStub.resolves(); // .git directory exists

      const result = await gitService.detectRepository();

      expect(result).to.deep.equal({
        isRepository: true,
        rootPath: '/test/project',
        gitPath: '/test/project/.git',
      });
    });

    it('should detect git repository in parent directory', async () => {
      processStub.returns('/test/project/subdirectory');

      // First call (subdirectory/.git) fails, second call (project/.git) succeeds
      fsStub.onFirstCall().rejects(new Error('ENOENT'));
      fsStub.onSecondCall().resolves();

      const result = await gitService.detectRepository();

      expect(result).to.deep.equal({
        isRepository: true,
        rootPath: '/test/project',
        gitPath: '/test/project/.git',
      });
    });

    it('should return false when no git repository found', async () => {
      processStub.returns('/test');
      fsStub.rejects(new Error('ENOENT')); // No .git directory found anywhere

      const result = await gitService.detectRepository();

      expect(result).to.deep.equal({
        isRepository: false,
        rootPath: null,
        gitPath: null,
      });
    });

    it('should handle permission errors gracefully', async () => {
      processStub.returns('/test/project');
      fsStub.rejects(new Error('EACCES')); // Permission denied

      const result = await gitService.detectRepository();

      expect(result.isRepository).to.be.false;
    });
  });

  describe('getCurrentBranch', () => {
    let readFileStub: sinon.SinonStub;

    beforeEach(() => {
      readFileStub = sinon.stub(fs, 'readFile');
    });

    it('should read current branch from HEAD file', async () => {
      processStub.returns('/test/project');
      fsStub.resolves(); // .git exists
      readFileStub.resolves('ref: refs/heads/feature-branch\n');

      const result = await gitService.getCurrentBranch();

      expect(result).to.equal('feature-branch');
    });

    it('should handle detached HEAD state', async () => {
      processStub.returns('/test/project');
      fsStub.resolves();
      readFileStub.resolves('a1b2c3d4e5f6...'); // Direct commit hash

      const result = await gitService.getCurrentBranch();

      expect(result).to.equal('HEAD');
    });

    it('should return null when not in git repository', async () => {
      processStub.returns('/test/project');
      fsStub.rejects(new Error('ENOENT'));

      const result = await gitService.getCurrentBranch();

      expect(result).to.be.null;
    });

    it('should handle missing HEAD file', async () => {
      processStub.returns('/test/project');
      fsStub.resolves();
      readFileStub.rejects(new Error('ENOENT'));

      const result = await gitService.getCurrentBranch();

      expect(result).to.be.null;
    });
  });

  describe('getRepositoryName', () => {
    it('should extract repository name from path', async () => {
      processStub.returns('/home/user/projects/my-awesome-project');
      fsStub.resolves();

      const result = await gitService.getRepositoryName();

      expect(result).to.equal('my-awesome-project');
    });

    it('should handle nested repository detection', async () => {
      processStub.returns('/home/user/projects/my-project/subdirectory');

      // .git found in parent directory
      fsStub.onFirstCall().rejects(new Error('ENOENT'));
      fsStub.onSecondCall().resolves();

      const result = await gitService.getRepositoryName();

      expect(result).to.equal('my-project');
    });

    it('should return null when not in repository', async () => {
      processStub.returns('/home/user');
      fsStub.rejects(new Error('ENOENT'));

      const result = await gitService.getRepositoryName();

      expect(result).to.be.null;
    });
  });

  describe('getBranchPattern', () => {
    let readFileStub: sinon.SinonStub;

    beforeEach(() => {
      readFileStub = sinon.stub(fs, 'readFile');
    });

    it('should return branch-based pattern for feature branch', async () => {
      processStub.returns('/test/project');
      fsStub.resolves();
      readFileStub.resolves('ref: refs/heads/feature/user-auth\n');

      const result = await gitService.getBranchPattern();

      expect(result).to.equal('feature/user-auth');
    });

    it('should return main branch pattern', async () => {
      processStub.returns('/test/project');
      fsStub.resolves();
      readFileStub.resolves('ref: refs/heads/main\n');

      const result = await gitService.getBranchPattern();

      expect(result).to.equal('main');
    });

    it('should handle repository without branch info', async () => {
      processStub.returns('/test/project');
      fsStub.rejects(new Error('ENOENT'));

      const result = await gitService.getBranchPattern();

      expect(result).to.be.null;
    });
  });

  describe('getRepositoryInfo', () => {
    let readFileStub: sinon.SinonStub;

    beforeEach(() => {
      readFileStub = sinon.stub(fs, 'readFile');
    });

    it('should return complete repository information', async () => {
      processStub.returns('/home/user/my-project');
      fsStub.resolves();
      readFileStub.resolves('ref: refs/heads/develop\n');

      const result = await gitService.getRepositoryInfo();

      expect(result).to.deep.equal({
        isRepository: true,
        repositoryName: 'my-project',
        currentBranch: 'develop',
        branchPattern: 'develop',
        rootPath: '/home/user/my-project',
      });
    });

    it('should return null values when not in repository', async () => {
      processStub.returns('/home/user');
      fsStub.rejects(new Error('ENOENT'));

      const result = await gitService.getRepositoryInfo();

      expect(result).to.deep.equal({
        isRepository: false,
        repositoryName: null,
        currentBranch: null,
        branchPattern: null,
        rootPath: null,
      });
    });

    it('should handle partial repository information', async () => {
      processStub.returns('/home/user/project');
      fsStub.resolves();
      readFileStub.rejects(new Error('ENOENT')); // No HEAD file

      const result = await gitService.getRepositoryInfo();

      expect(result.isRepository).to.be.true;
      expect(result.repositoryName).to.equal('project');
      expect(result.currentBranch).to.be.null;
      expect(result.branchPattern).to.be.null;
    });
  });

  describe('Edge Cases', () => {
    it('should handle very deep directory nesting', async () => {
      const deepPath = '/a/b/c/d/e/f/g/h/i/j';
      processStub.returns(deepPath);

      // All calls fail (no .git found)
      fsStub.rejects(new Error('ENOENT'));

      const result = await gitService.detectRepository();

      expect(result.isRepository).to.be.false;
      expect(fsStub.callCount).to.be.greaterThan(1);
    });

    it('should handle root directory edge case', async () => {
      processStub.returns('/');
      fsStub.rejects(new Error('ENOENT'));

      const result = await gitService.detectRepository();

      expect(result.isRepository).to.be.false;
    });

    it('should handle malformed HEAD file', async () => {
      const readFileStub = sinon.stub(fs, 'readFile');

      processStub.returns('/test/project');
      fsStub.resolves();
      readFileStub.resolves('malformed content without ref');

      const result = await gitService.getCurrentBranch();

      expect(result).to.be.null;
    });
  });
});
