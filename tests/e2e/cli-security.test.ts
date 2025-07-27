/**
 * End-to-End Security Tests for Enhanced CLI
 * Tests simulate real user interactions to validate security features
 */

import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CLI Security E2E Tests', () => {
  let testConfigDir: string;
  let originalConfig: string | undefined;

  beforeAll(async () => {
    // Create temporary config directory
    testConfigDir = join(tmpdir(), `kanban-test-${Date.now()}`);
    await fs.mkdir(testConfigDir, { recursive: true });

    // Backup original config
    originalConfig = process.env.KANBAN_CONFIG_DIR;
    process.env.KANBAN_CONFIG_DIR = testConfigDir;
  });

  afterAll(async () => {
    // Restore original config
    if (originalConfig) {
      process.env.KANBAN_CONFIG_DIR = originalConfig;
    } else {
      delete process.env.KANBAN_CONFIG_DIR;
    }

    // Cleanup test directory
    try {
      await fs.rmdir(testConfigDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Input Sanitization', () => {
    it('should sanitize XSS attempts in task titles', () => {
      const maliciousInput = '<script>alert("xss")</script>My Task';

      const result = execSync(
        `node dist/cli/index.js task create --title "${maliciousInput}" --board-id test --column-id todo`,
        { encoding: 'utf8', cwd: process.cwd() }
      );

      // Should sanitize the input and show warning
      expect(result).toContain('Input sanitized');
      expect(result).not.toContain('<script>');
      expect(result).toContain('My Task');
    });

    it('should handle SQL injection attempts', () => {
      const sqlInjection = "'; DROP TABLE tasks; --";

      const result = execSync(
        `node dist/cli/index.js task create --title "${sqlInjection}" --board-id test --column-id todo`,
        { encoding: 'utf8', cwd: process.cwd() }
      );

      expect(result).toContain('Input sanitized');
      expect(result).not.toContain('DROP TABLE');
    });

    it('should sanitize command injection in descriptions', () => {
      const commandInjection = 'Task description $(rm -rf /)';

      const result = execSync(
        `node dist/cli/index.js task create --title "Test" --description "${commandInjection}" --board-id test --column-id todo`,
        { encoding: 'utf8', cwd: process.cwd() }
      );

      expect(result).toContain('Input sanitized');
      expect(result).not.toContain('$(rm -rf /)');
      expect(result).toContain('Task description');
    });

    it('should handle Unicode and special character attacks', () => {
      const unicodeAttack = '\\u003cscript\\u003ealert(1)\\u003c/script\\u003e';

      const result = execSync(
        `node dist/cli/index.js task create --title "${unicodeAttack}" --board-id test --column-id todo`,
        { encoding: 'utf8', cwd: process.cwd() }
      );

      expect(result).toContain('Input sanitized');
      expect(result).not.toContain('script');
    });
  });

  describe('Command Injection Prevention', () => {
    it('should prevent shell command injection through arguments', () => {
      const injectionAttempt = 'test; echo "INJECTED"; cat /etc/passwd';

      const result = execSync(
        `node dist/cli/index.js task create --title "${injectionAttempt}" --board-id test --column-id todo`,
        { encoding: 'utf8', cwd: process.cwd() }
      );

      expect(result).not.toContain('INJECTED');
      expect(result).not.toContain('root:');
      expect(result).toContain('Input sanitized');
    });

    it('should validate file path arguments', () => {
      const pathTraversal = '../../../etc/passwd';

      expect(() => {
        execSync(`node dist/cli/index.js config set config-file "${pathTraversal}"`, {
          encoding: 'utf8',
          cwd: process.cwd(),
        });
      }).toThrow();
    });

    it('should prevent environment variable injection', () => {
      const envInjection = 'test$(export MALICIOUS=1)';

      const result = execSync(
        `node dist/cli/index.js task create --title "${envInjection}" --board-id test --column-id todo`,
        { encoding: 'utf8', cwd: process.cwd() }
      );

      expect(result).toContain('Input sanitized');
      expect(process.env.MALICIOUS).toBeUndefined();
    });
  });

  describe('Error Handling Security', () => {
    it('should not leak sensitive information in error messages', () => {
      // Test with invalid API key
      process.env.KANBAN_API_KEY = 'invalid-key-with-secrets';

      try {
        const _result = execSync(`node dist/cli/index.js task list`, {
          encoding: 'utf8',
          cwd: process.cwd(),
        });
      } catch (error) {
        const errorOutput = error.toString();
        expect(errorOutput).not.toContain('invalid-key-with-secrets');
        expect(errorOutput).toContain('Authentication failed');
      }

      delete process.env.KANBAN_API_KEY;
    });

    it('should sanitize error messages from user input', () => {
      const maliciousTitle = '<script>console.log("XSS in error")</script>';

      try {
        const _result = execSync(`node dist/cli/index.js task create --title "${maliciousTitle}"`, {
          encoding: 'utf8',
          cwd: process.cwd(),
        });
      } catch (error) {
        const errorOutput = error.toString();
        expect(errorOutput).not.toContain('<script>');
        expect(errorOutput).not.toContain('console.log');
      }
    });
  });
});
