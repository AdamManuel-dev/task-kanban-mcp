/**
 * @fileoverview Tests for command injection prevention system
 * @lastmodified 2025-07-27T23:45:19Z
 *
 * Features: Comprehensive security testing for CLI command execution
 * Main APIs: CommandInjectionPrevention validation and execution
 * Constraints: Mock child_process to avoid actual command execution
 * Patterns: Security-focused testing with attack scenarios
 */

import {
  CommandInjectionPrevention,
  commandInjectionPrevention,
  safeExecute,
  validateCommand,
  createSafeCommand,
  validateFilePath,
  SafeCliOperations,
} from '@/cli/utils/command-injection-prevention';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process spawn
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock input sanitizer
jest.mock('@/cli/utils/input-sanitizer', () => ({
  inputSanitizer: {
    sanitizeText: jest.fn((text: string, _options: any) => ({
      sanitized: text.replace(/[^a-zA-Z0-9\-_.]/g, ''),
      modified: text !== text.replace(/[^a-zA-Z0-9\-_.]/g, ''),
      warnings: [],
    })),
    sanitizeFilePath: jest.fn((path: string) => ({
      sanitized: path,
      modified: false,
    })),
    detectSuspiciousPatterns: jest.fn(() => ({
      suspicious: false,
      patterns: [],
    })),
  },
}));

describe('CommandInjectionPrevention', () => {
  let mockChildProcess: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock child process
    mockChildProcess = new EventEmitter();
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.pid = 12345;

    mockSpawn.mockReturnValue(mockChildProcess);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = CommandInjectionPrevention.getInstance();
      const instance2 = CommandInjectionPrevention.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should provide exported singleton instance', () => {
      const instance = CommandInjectionPrevention.getInstance();
      expect(commandInjectionPrevention).toBe(instance);
    });
  });

  describe('Command Validation', () => {
    describe('Safe Commands', () => {
      it('should allow safe commands', () => {
        const result = commandInjectionPrevention.validateCommand('git', ['status']);

        expect(result.safe).toBe(true);
        expect(result.sanitizedCommand).toBe('git');
        expect(result.sanitizedArgs).toEqual(['status']);
        expect(result.blockedPatterns).toHaveLength(0);
      });

      it('should allow commands in allowlist', () => {
        const result = commandInjectionPrevention.validateCommand('ls', ['-la'], {
          allowedCommands: ['ls', 'pwd'],
        });

        expect(result.safe).toBe(true);
        expect(result.sanitizedCommand).toBe('ls');
      });

      it('should warn about commands not in default safe list', () => {
        const result = commandInjectionPrevention.validateCommand('unknown-cmd', []);

        expect(result.warnings).toContain('Command not in default safe list: unknown-cmd');
      });
    });

    describe('Dangerous Commands', () => {
      it('should block dangerous commands', () => {
        const dangerousCommands = ['rm', 'sudo', 'wget', 'curl', 'python', 'bash'];

        dangerousCommands.forEach(cmd => {
          const result = commandInjectionPrevention.validateCommand(cmd, []);
          expect(result.safe).toBe(false);
          expect(result.blockedPatterns).toContain(`Dangerous command: ${cmd}`);
        });
      });

      it('should block commands not in allowlist when specified', () => {
        const result = commandInjectionPrevention.validateCommand('git', ['status'], {
          allowedCommands: ['ls', 'pwd'], // git not included
        });

        expect(result.safe).toBe(false);
        expect(result.blockedPatterns).toContain('Command not in allowlist: git');
      });
    });

    describe('Argument Validation', () => {
      it('should sanitize command arguments', () => {
        const result = commandInjectionPrevention.validateCommand('git', ['status', '--oneline']);

        expect(result.safe).toBe(true);
        expect(result.sanitizedArgs).toEqual(['status', '--oneline']);
      });

      it('should block oversized arguments', () => {
        const longArg = 'a'.repeat(1001); // Exceeds maxArgLength of 1000
        const result = commandInjectionPrevention.validateCommand('git', [longArg]);

        expect(result.safe).toBe(false);
        expect(result.blockedPatterns).toContain('Argument 0 exceeds maximum length (1000)');
      });

      it('should block when total arguments exceed limit', () => {
        const args = Array(100).fill('a'.repeat(101)); // Total > 10000
        const result = commandInjectionPrevention.validateCommand('git', args);

        expect(result.safe).toBe(false);
        expect(result.blockedPatterns).toContain('Total arguments length exceeds maximum (10000)');
      });

      it('should validate allowed flags', () => {
        const result = commandInjectionPrevention.validateCommand('git', ['--dangerous-flag'], {
          allowedFlags: ['status', 'log'],
        });

        expect(result.safe).toBe(false);
        expect(result.blockedPatterns).toContain('Flag not allowed: --dangerous-flag');
      });
    });

    describe('Injection Pattern Detection', () => {
      it('should detect command chaining attempts', () => {
        const injectionPatterns = [
          ['git', ['status; rm -rf /']],
          ['ls', ['| cat /etc/passwd']],
          ['echo', ['test && sudo rm -rf /']],
          ['cat', ['file.txt || malicious-command']],
        ];

        injectionPatterns.forEach(([cmd, args]) => {
          const result = commandInjectionPrevention.validateCommand(
            cmd as string,
            args as string[]
          );
          expect(result.safe).toBe(false);
          expect(result.blockedPatterns.length).toBeGreaterThan(0);
        });
      });

      it('should detect command substitution attempts', () => {
        const substitutionPatterns = [
          '$(malicious-command)',
          '`malicious-command`',
          '<(malicious-command)',
          '>(malicious-command)',
        ];

        substitutionPatterns.forEach(pattern => {
          const result = commandInjectionPrevention.validateCommand('echo', [pattern]);
          expect(result.safe).toBe(false);
        });
      });

      it('should detect path traversal attempts', () => {
        const traversalPaths = [
          '../../../etc/passwd',
          '..\\..\\windows\\system32',
          '/etc/../../../root/.ssh/id_rsa',
        ];

        traversalPaths.forEach(path => {
          const result = commandInjectionPrevention.validateCommand('cat', [path]);
          expect(result.safe).toBe(false);
          expect(result.blockedPatterns.some(p => p.includes('Path traversal'))).toBe(true);
        });
      });

      it('should detect redirection attempts', () => {
        const redirectionArgs = [
          'file > /etc/passwd',
          'data >> /etc/hosts',
          '< /etc/shadow',
          '2>&1',
        ];

        redirectionArgs.forEach(arg => {
          const result = commandInjectionPrevention.validateCommand('echo', [arg]);
          expect(result.safe).toBe(false);
        });
      });
    });

    describe('Working Directory Restriction', () => {
      it('should allow relative paths when restrictToWorkingDir is true', () => {
        const result = commandInjectionPrevention.validateCommand('cat', ['./file.txt'], {
          restrictToWorkingDir: true,
        });

        expect(result.safe).toBe(true);
      });

      it('should block absolute paths outside working directory', () => {
        const result = commandInjectionPrevention.validateCommand('cat', ['/etc/passwd'], {
          restrictToWorkingDir: true,
        });

        expect(result.safe).toBe(false);
        expect(result.blockedPatterns).toContain('Argument 0 points outside working directory');
      });
    });
  });

  describe('Safe Command Execution', () => {
    it('should execute safe commands successfully', async () => {
      const expectedOutput = 'Command executed successfully';

      // Setup mock to simulate successful execution
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', expectedOutput);
        mockChildProcess.emit('close', 0);
      }, 10);

      const result = await commandInjectionPrevention.safeExecute('git', ['status']);

      expect(result.success).toBe(true);
      expect(result.stdout).toBe(expectedOutput);
      expect(result.exitCode).toBe(0);
      expect(result.command).toBe('git');
      expect(result.args).toEqual(['status']);
    });

    it('should handle command execution errors', async () => {
      const errorMessage = 'Command failed';

      setTimeout(() => {
        mockChildProcess.emit('error', new Error(errorMessage));
      }, 10);

      const result = await commandInjectionPrevention.safeExecute('git', ['status']);

      expect(result.success).toBe(false);
      expect(result.stderr).toBe(errorMessage);
      expect(result.exitCode).toBe(-1);
    });

    it('should handle non-zero exit codes', async () => {
      const errorOutput = 'Command failed with error';

      setTimeout(() => {
        mockChildProcess.stderr.emit('data', errorOutput);
        mockChildProcess.emit('close', 1);
      }, 10);

      const result = await commandInjectionPrevention.safeExecute('git', ['status']);

      expect(result.success).toBe(false);
      expect(result.stderr).toBe(errorOutput);
      expect(result.exitCode).toBe(1);
    });

    it('should throw error for unsafe commands', async () => {
      await expect(commandInjectionPrevention.safeExecute('rm', ['-rf', '/'])).rejects.toThrow(
        'Command execution blocked'
      );
    });

    it('should respect timeout option', async () => {
      setTimeout(() => {
        mockChildProcess.emit('close', 0);
      }, 10);

      await commandInjectionPrevention.safeExecute('git', ['status'], {
        timeout: 5000,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['status'],
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('should pass environment variables', async () => {
      const customEnv = { NODE_ENV: 'test' };

      setTimeout(() => {
        mockChildProcess.emit('close', 0);
      }, 10);

      await commandInjectionPrevention.safeExecute('git', ['status'], {
        env: customEnv,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['status'],
        expect.objectContaining({
          env: expect.objectContaining(customEnv),
        })
      );
    });
  });

  describe('Safe Command Wrapper', () => {
    it('should create command wrapper with validation', () => {
      const gitCommand = commandInjectionPrevention.createSafeCommand('git', ['status', 'log']);

      expect(gitCommand).toHaveProperty('validate');
      expect(gitCommand).toHaveProperty('execute');
      expect(typeof gitCommand.validate).toBe('function');
      expect(typeof gitCommand.execute).toBe('function');
    });

    it('should validate arguments in wrapper', () => {
      const gitCommand = commandInjectionPrevention.createSafeCommand('git', ['status', 'log']);

      expect(() => {
        gitCommand.validate(['status']);
      }).not.toThrow();

      expect(() => {
        gitCommand.validate(['rm', '-rf']);
      }).toThrow('Invalid argument');
    });

    it('should execute commands through wrapper', async () => {
      const gitCommand = commandInjectionPrevention.createSafeCommand('git', ['status']);

      setTimeout(() => {
        mockChildProcess.stdout.emit('data', 'git output');
        mockChildProcess.emit('close', 0);
      }, 10);

      const result = await gitCommand.execute(['status']);

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('git output');
    });
  });

  describe('Command List Management', () => {
    it('should add commands to allowed list', () => {
      const initialCount = commandInjectionPrevention.getAllowedCommands().length;

      commandInjectionPrevention.addAllowedCommand('docker');

      const newCount = commandInjectionPrevention.getAllowedCommands().length;
      expect(newCount).toBe(initialCount + 1);
      expect(commandInjectionPrevention.getAllowedCommands()).toContain('docker');
    });

    it('should remove commands from allowed list', () => {
      commandInjectionPrevention.addAllowedCommand('docker');
      commandInjectionPrevention.removeAllowedCommand('docker');

      expect(commandInjectionPrevention.getAllowedCommands()).not.toContain('docker');
    });

    it('should check if command is dangerous', () => {
      expect(commandInjectionPrevention.isDangerousCommand('rm')).toBe(true);
      expect(commandInjectionPrevention.isDangerousCommand('git')).toBe(false);
    });

    it('should return dangerous commands list', () => {
      const dangerous = commandInjectionPrevention.getDangerousCommands();

      expect(dangerous).toContain('rm');
      expect(dangerous).toContain('sudo');
      expect(dangerous).toContain('wget');
      expect(dangerous).not.toContain('git');
    });
  });

  describe('File Path Validation', () => {
    it('should validate safe file paths', () => {
      const result = CommandInjectionPrevention.validateFilePath('./config.json');

      expect(result.safe).toBe(true);
      expect(result.normalizedPath).toBe('config.json');
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect path traversal in file paths', () => {
      const result = CommandInjectionPrevention.validateFilePath('../../../etc/passwd');

      expect(result.safe).toBe(false);
      expect(result.warnings).toContain('Path traversal detected');
    });

    it('should enforce allowed directories', () => {
      const result = CommandInjectionPrevention.validateFilePath('/etc/passwd', ['/home/user']);

      expect(result.safe).toBe(false);
      expect(result.warnings).toContain('Path outside allowed directories');
    });

    it('should warn about dangerous file extensions', () => {
      const dangerousFiles = ['script.sh', 'malware.bat', 'exploit.py'];

      dangerousFiles.forEach(file => {
        const result = CommandInjectionPrevention.validateFilePath(file);
        expect(result.warnings.some(w => w.includes('dangerous file extension'))).toBe(true);
      });
    });
  });

  describe('Convenience Functions', () => {
    it('should provide safeExecute convenience function', async () => {
      setTimeout(() => {
        mockChildProcess.emit('close', 0);
      }, 10);

      const result = await safeExecute('git', ['status']);
      expect(result).toBeDefined();
    });

    it('should provide validateCommand convenience function', () => {
      const result = validateCommand('git', ['status']);
      expect(result).toBeDefined();
      expect(result.safe).toBe(true);
    });

    it('should provide createSafeCommand convenience function', () => {
      const gitCommand = createSafeCommand('git', ['status']);
      expect(gitCommand).toBeDefined();
      expect(gitCommand).toHaveProperty('validate');
      expect(gitCommand).toHaveProperty('execute');
    });

    it('should provide validateFilePath convenience function', () => {
      const result = validateFilePath('./test.txt');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('normalizedPath');
    });
  });

  describe('SafeCliOperations', () => {
    describe('safeFileRead', () => {
      it('should read files safely', async () => {
        const fileContent = 'file content';

        setTimeout(() => {
          mockChildProcess.stdout.emit('data', fileContent);
          mockChildProcess.emit('close', 0);
        }, 10);

        const content = await SafeCliOperations.safeFileRead('./test.txt');
        expect(content).toBe(fileContent);
      });

      it('should reject unsafe file paths', async () => {
        await expect(SafeCliOperations.safeFileRead('../../../etc/passwd')).rejects.toThrow(
          'Unsafe file path'
        );
      });

      it('should handle read errors', async () => {
        setTimeout(() => {
          mockChildProcess.stderr.emit('data', 'File not found');
          mockChildProcess.emit('close', 1);
        }, 10);

        await expect(SafeCliOperations.safeFileRead('./nonexistent.txt')).rejects.toThrow(
          'Failed to read file'
        );
      });
    });

    describe('safeDirectoryList', () => {
      it('should list directory contents safely', async () => {
        const dirListing = 'file1.txt\nfile2.txt\nsubdir/';

        setTimeout(() => {
          mockChildProcess.stdout.emit('data', dirListing);
          mockChildProcess.emit('close', 0);
        }, 10);

        const files = await SafeCliOperations.safeDirectoryList('./src');
        expect(files).toEqual(['file1.txt', 'file2.txt', 'subdir/']);
      });

      it('should reject unsafe directory paths', async () => {
        await expect(SafeCliOperations.safeDirectoryList('../../../etc')).rejects.toThrow(
          'Unsafe directory path'
        );
      });
    });

    describe('safeGitCommand', () => {
      it('should execute safe git commands', async () => {
        const gitOutput = 'On branch main\nnothing to commit';

        // Reset mock for this test
        mockChildProcess = new EventEmitter();
        mockChildProcess.stdout = new EventEmitter();
        mockChildProcess.stderr = new EventEmitter();
        mockChildProcess.pid = 12345;
        mockSpawn.mockReturnValue(mockChildProcess);

        setTimeout(() => {
          mockChildProcess.stdout.emit('data', gitOutput);
          mockChildProcess.emit('close', 0);
        }, 10);

        const result = await SafeCliOperations.safeGitCommand(['status']);
        expect(result.success).toBe(true);
        expect(result.stdout).toBe(gitOutput);
      });

      it('should execute git with allowed flags', async () => {
        // Reset mock for this test
        mockChildProcess = new EventEmitter();
        mockChildProcess.stdout = new EventEmitter();
        mockChildProcess.stderr = new EventEmitter();
        mockChildProcess.pid = 12345;
        mockSpawn.mockReturnValue(mockChildProcess);

        setTimeout(() => {
          mockChildProcess.emit('close', 0);
        }, 10);

        await SafeCliOperations.safeGitCommand(['status']);

        expect(mockSpawn).toHaveBeenCalledWith(
          'git',
          ['status'],
          expect.objectContaining({
            timeout: 30000,
          })
        );
      });
    });

    describe('safeNpmCommand', () => {
      it('should execute safe npm commands', async () => {
        const npmOutput = 'npm dependencies installed';

        // Reset mock for this test
        mockChildProcess = new EventEmitter();
        mockChildProcess.stdout = new EventEmitter();
        mockChildProcess.stderr = new EventEmitter();
        mockChildProcess.pid = 12345;
        mockSpawn.mockReturnValue(mockChildProcess);

        setTimeout(() => {
          mockChildProcess.stdout.emit('data', npmOutput);
          mockChildProcess.emit('close', 0);
        }, 10);

        const result = await SafeCliOperations.safeNpmCommand(['install']);
        expect(result.success).toBe(true);
        expect(result.stdout).toBe(npmOutput);
      });

      it('should use longer timeout for npm operations', async () => {
        setTimeout(() => {
          mockChildProcess.emit('close', 0);
        }, 10);

        await SafeCliOperations.safeNpmCommand(['install']);

        expect(mockSpawn).toHaveBeenCalledWith(
          'npm',
          ['install'],
          expect.objectContaining({
            timeout: 120000,
          })
        );
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty commands', () => {
      const result = commandInjectionPrevention.validateCommand('');
      expect(result.safe).toBe(true); // Empty command sanitizes to empty string, which is allowed
    });

    it('should handle null/undefined arguments gracefully', () => {
      const result = commandInjectionPrevention.validateCommand('git', undefined as any);
      expect(result.sanitizedArgs).toEqual([]);
    });

    it('should handle special characters in command names', () => {
      const result = commandInjectionPrevention.validateCommand('git-lfs');
      expect(result.sanitizedCommand).toBe('git-lfs');
    });

    it('should handle unicode and special characters in arguments', () => {
      const result = commandInjectionPrevention.validateCommand('echo', ['Hello 世界 🌍']);
      // Should be sanitized to only safe characters
      expect(result.sanitizedArgs[0]).toBe('Hello');
    });

    it('should handle very long command execution', async () => {
      // Reset mock for this test
      mockChildProcess = new EventEmitter();
      mockChildProcess.stdout = new EventEmitter();
      mockChildProcess.stderr = new EventEmitter();
      mockChildProcess.pid = 12345;
      mockSpawn.mockReturnValue(mockChildProcess);

      setTimeout(() => {
        // Simulate long-running command
        mockChildProcess.stdout.emit('data', 'processing...\n');
        setTimeout(() => {
          mockChildProcess.stdout.emit('data', 'done');
          mockChildProcess.emit('close', 0);
        }, 100);
      }, 10);

      const result = await commandInjectionPrevention.safeExecute('git', ['status']);
      expect(result.stdout).toBe('processing...\ndone');
    });
  });
});
