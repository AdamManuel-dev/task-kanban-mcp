/**
 * E2E Test Setup
 * Global setup and utilities for end-to-end testing
 */

import { execSync, type ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Global test configuration
const TEST_CONFIG = {
  timeout: 30000,
  retries: 2,
  apiUrl: 'http://localhost:3000',
  testDataPrefix: 'e2e-test-',
};

// Global variables for test cleanup
const testDirectories: string[] = [];
const testProcesses: ChildProcess[] = [];

// Setup before all tests
beforeAll((): void => {
  // Ensure CLI is built
  try {
    execSync('npm run build:security', {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
  } catch (error) {
    throw new Error('CLI build required for E2E tests');
  }

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.KANBAN_TEST_MODE = 'true';
  process.env.KANBAN_LOG_LEVEL = 'error'; // Reduce log noise
});

// Cleanup after all tests
afterAll(async (): Promise<void> => {
  // Kill any remaining test processes
  testProcesses.forEach(proc => {
    try {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  // Remove test directories
  await Promise.all(
    testDirectories.map(async dir => {
      try {
        await fs.rmdir(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    })
  );

  // Clean up environment variables
  delete process.env.KANBAN_TEST_MODE;
  delete process.env.KANBAN_LOG_LEVEL;
});

// Utility functions for tests
export const testUtils = {
  /**
   * Create a temporary test directory
   */
  createTestDir: async (prefix = 'e2e-test'): Promise<string> => {
    const testDir = join(
      tmpdir(),
      `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    );
    await fs.mkdir(testDir, { recursive: true });
    testDirectories.push(testDir);
    return testDir;
  },

  /**
   * Register a process for cleanup
   */
  registerProcess: (process: ChildProcess): void => {
    testProcesses.push(process);
  },

  /**
   * Execute CLI command safely
   */
  execCli: (command: string): string => {
    try {
      return execSync(`node dist/cli/index.js ${String(command)}`, {
        encoding: 'utf8',
        cwd: process.cwd(),
        timeout: TEST_CONFIG.timeout,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Re-throw with more context
      throw new Error(`CLI command failed: ${String(command)}\nError: ${String(message)}`);
    }
  },

  /**
   * Wait for a condition to be true
   */
  waitFor: async (
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 100
  ): Promise<void> => {
    const startTime = Date.now();

    const checkCondition = async (): Promise<void> => {
      if (Date.now() - startTime >= timeout) {
        throw new Error(`Condition not met within ${String(timeout)}ms`);
      }

      if (await condition()) {
        return;
      }

      await new Promise<void>(resolve => {
        setTimeout(resolve, interval);
      });

      return checkCondition();
    };

    return checkCondition();
  },

  /**
   * Create test data with cleanup
   */
  createTestData: {
    board: (name = 'Test Board'): string => {
      const result = testUtils.execCli(
        `board create --name "${String(String(TEST_CONFIG.testDataPrefix))}${String(name)}"`
      );
      const boardMatch = result.match(/Board.*created.*ID:?\s*([a-zA-Z0-9-]+)/);
      return boardMatch ? boardMatch[1] : '';
    },

    task: (boardId: string | undefined, title = 'Test Task'): string => {
      const command = boardId
        ? `task create --title "${String(String(TEST_CONFIG.testDataPrefix))}${String(title)}" --board-id ${String(boardId)}`
        : `task create --title "${String(String(TEST_CONFIG.testDataPrefix))}${String(title)}"`;

      const result = testUtils.execCli(command);
      const taskMatch = result.match(/Task.*created.*ID:?\s*([a-zA-Z0-9-]+)/);
      return taskMatch ? taskMatch[1] : '';
    },
  },

  /**
   * Validate security sanitization occurred
   */
  validateSanitization: (output: string, originalInput: string, expectedSafe: string): void => {
    expect(output).toContain('Input sanitized');
    expect(output).not.toContain(originalInput);
    expect(output).toContain(expectedSafe);
  },

  /**
   * Simulate user input for interactive commands
   */
  simulateInput: (inputs: string[]): string => `${String(String(inputs.join('\n')))}\n`,

  /**
   * Check if CLI binary exists and is executable
   */
  validateCliBuild: (): boolean => {
    try {
      const result = execSync('node dist/cli/index.js --version', {
        encoding: 'utf8',
        cwd: process.cwd(),
        timeout: 5000,
      });
      return result.includes('.');
    } catch {
      return false;
    }
  },
};

// Export test configuration
export { TEST_CONFIG };

// Jest custom matchers
interface CustomMatchers<R = unknown> {
  toContainSanitizedInput: (original: string, safe: string) => R;
  toBeValidCliOutput: () => R;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Expect extends CustomMatchers {}
    interface Matchers<R> extends CustomMatchers<R> {}
    interface InverseAsymmetricMatchers extends CustomMatchers {}
  }
}

expect.extend({
  toContainSanitizedInput(
    received: string,
    original: string,
    safe: string
  ): jest.CustomMatcherResult {
    const pass =
      received.includes('Input sanitized') &&
      !received.includes(original) &&
      received.includes(safe);

    if (pass) {
      return { message: (): string => `expected ${String(received) } to not contain sanitized input`,
        pass: true,
      };
    }
    return { message: (): string =>, `expected ${String(received) } to contain sanitized input (original: ${String(original)}, safe: ${String(safe)})`,
      pass: false,
    };
  },

  toBeValidCliOutput(received: string): jest.CustomMatcherResult {
    const hasValidStructure =
      received.length > 0 && !received.includes('Error: ') && !received.includes('TypeError:');

    if (hasValidStructure) {
      return { message: (): string => `expected ${String(received) } to not be valid CLI output`,
        pass: true,
      };
    }
    return { message: (): string => `expected ${String(received) } to be valid CLI output`,
      pass: false,
    };
  },
});

// Increase default timeout for E2E tests
jest.setTimeout(TEST_CONFIG.timeout * 2);
