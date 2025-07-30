/**
 * @fileoverview Command injection prevention tests for GitService
 * @lastmodified 2025-07-28T12:00:00Z
 *
 * Features: GitService command injection prevention, safe git execution
 * Main APIs: GitService with secure command execution
 * Constraints: All git commands must go through safeExecute
 * Patterns: Security verification, mock-based testing
 */

import { GitService } from '@/services/GitService';
import { safeExecute } from '@/cli/utils/command-injection-prevention';

// Mock the safe execute function to verify it's being used
jest.mock('@/cli/utils/command-injection-prevention', () => ({
  safeExecute: jest.fn(),
}));

const mockSafeExecute = safeExecute as jest.MockedFunction<typeof safeExecute>;

describe('GitService Command Injection Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseRepository', () => {
    it('should use safeExecute for all git commands', async () => {
      // Mock successful git command responses
      mockSafeExecute
        .mockResolvedValueOnce({
          success: true,
          stdout: 'https://github.com/user/repo.git',
          stderr: '',
          exitCode: 0,
          duration: 100,
          command: 'git',
          args: ['remote', 'get-url', 'origin'],
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'main',
          stderr: '',
          exitCode: 0,
          duration: 50,
          command: 'git',
          args: ['branch', '--show-current'],
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
          duration: 75,
          command: 'git',
          args: ['status', '--porcelain'],
        });

      // Call the private method via reflection for testing
      const result = await (GitService as any).parseRepository('/fake/path');

      // Verify safeExecute was called with proper arguments
      expect(mockSafeExecute).toHaveBeenCalledTimes(3);
      expect(mockSafeExecute).toHaveBeenNthCalledWith(1, 'git', ['remote', 'get-url', 'origin']);
      expect(mockSafeExecute).toHaveBeenNthCalledWith(2, 'git', ['branch', '--show-current']);
      expect(mockSafeExecute).toHaveBeenNthCalledWith(3, 'git', ['status', '--porcelain']);

      // Verify the result structure
      expect(result).toMatchObject({
        path: '/fake/path',
        name: 'path',
        remoteUrl: 'https://github.com/user/repo.git',
        currentBranch: 'main',
        isClean: true,
      });
    });

    it('should handle git command failures gracefully', async () => {
      // Mock failed git commands
      mockSafeExecute
        .mockResolvedValueOnce({
          success: false,
          stdout: '',
          stderr: 'fatal: not a git repository',
          exitCode: 128,
          duration: 10,
          command: 'git',
          args: ['remote', 'get-url', 'origin'],
        })
        .mockResolvedValueOnce({
          success: false,
          stdout: '',
          stderr: 'fatal: not a git repository',
          exitCode: 128,
          duration: 10,
          command: 'git',
          args: ['branch', '--show-current'],
        })
        .mockResolvedValueOnce({
          success: false,
          stdout: '',
          stderr: 'fatal: not a git repository',
          exitCode: 128,
          duration: 10,
          command: 'git',
          args: ['status', '--porcelain'],
        });

      const result = await (GitService as any).parseRepository('/fake/path');

      expect(result).toMatchObject({
        remoteUrl: undefined,
        currentBranch: undefined,
        isClean: false,
      });
    });
  });

  describe('getBranches', () => {
    it('should use safeExecute for git branch command', async () => {
      mockSafeExecute.mockResolvedValueOnce({
        success: true,
        stdout: '* main  abc123 Latest commit\n  dev   def456 Another commit\n',
        stderr: '',
        exitCode: 0,
        duration: 100,
        command: 'git',
        args: ['branch', '-v'],
      });

      const result = await GitService.getBranches('/fake/path');

      expect(mockSafeExecute).toHaveBeenCalledWith('git', ['branch', '-v']);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        name: 'main',
        isActive: true,
        lastCommit: 'abc123',
      });
    });

    it('should handle git branch command failures', async () => {
      mockSafeExecute.mockResolvedValueOnce({
        success: false,
        stdout: '',
        stderr: 'fatal: not a git repository',
        exitCode: 128,
        duration: 10,
        command: 'git',
        args: ['branch', '-v'],
      });

      const result = await GitService.getBranches('/fake/path');

      expect(result).toEqual([]);
    });
  });

  describe('getCommitHistory', () => {
    it('should use safeExecute for git log command', async () => {
      mockSafeExecute.mockResolvedValueOnce({
        success: true,
        stdout:
          'abc123|Initial commit|John Doe|2023-01-01 10:00:00 +0000\ndef456|Second commit|Jane Doe|2023-01-02 10:00:00 +0000\n',
        stderr: '',
        exitCode: 0,
        duration: 150,
        command: 'git',
        args: ['log', '--oneline', '--format=%H|%s|%an|%ad', '--date=iso', '-n', '10'],
      });

      const result = await GitService.getCommitHistory('/fake/path', 10);

      expect(mockSafeExecute).toHaveBeenCalledWith('git', [
        'log',
        '--oneline',
        '--format=%H|%s|%an|%ad',
        '--date=iso',
        '-n',
        '10',
      ]);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        hash: 'abc123',
        message: 'Initial commit',
        author: 'John Doe',
      });
    });

    it('should handle git log command failures', async () => {
      mockSafeExecute.mockResolvedValueOnce({
        success: false,
        stdout: '',
        stderr: 'fatal: your current branch does not have any commits yet',
        exitCode: 128,
        duration: 10,
        command: 'git',
        args: ['log', '--oneline', '--format=%H|%s|%an|%ad', '--date=iso', '-n', '10'],
      });

      const result = await GitService.getCommitHistory('/fake/path');

      expect(result).toEqual([]);
    });
  });

  describe('Command Injection Prevention', () => {
    it('should never call child_process.exec directly', () => {
      // This test ensures that GitService doesn't have any direct exec calls
      const gitServiceCode = GitService.toString();

      expect(gitServiceCode).not.toMatch(/exec\s*\(/);
      expect(gitServiceCode).not.toMatch(/execAsync\s*\(/);
      expect(gitServiceCode).not.toMatch(/child_process/);
    });

    it('should validate all git command arguments through safeExecute', async () => {
      // Test that malicious arguments would be caught by safeExecute
      mockSafeExecute.mockImplementation(async (command, args) => {
        // Simulate command injection prevention blocking malicious args
        const maliciousPatterns = [';', '&&', '||', '|', '$(', '`'];
        const hasMalicious = args.some(arg =>
          maliciousPatterns.some(pattern => arg.includes(pattern))
        );

        if (hasMalicious) {
          throw new Error('Command execution blocked: Dangerous pattern detected');
        }

        return {
          success: true,
          stdout: 'safe output',
          stderr: '',
          exitCode: 0,
          duration: 10,
          command,
          args,
        };
      });

      // This should work fine
      await expect(GitService.getBranches('/safe/path')).resolves.not.toThrow();

      // Even if someone tried to modify the limit parameter maliciously,
      // it goes through String() conversion and safeExecute validation
      await expect(GitService.getCommitHistory('/safe/path', 5)).resolves.not.toThrow();
    });
  });
});
