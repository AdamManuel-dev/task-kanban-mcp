/**
 * @fileoverview Comprehensive CLI Commands E2E Tests
 * @lastmodified 2025-07-28T18:00:00Z
 *
 * Features: End-to-end testing of all CLI commands with real subprocess execution
 * Main APIs: Tests for CLI commands, error handling, output validation
 * Constraints: Requires built CLI binary, database setup, real command execution
 * Patterns: E2E testing, subprocess validation, output parsing, error recovery
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CLI Commands E2E Tests', () => {
  let testConfigDir: string;
  let testDbPath: string;
  let cliPath: string;

  beforeAll(async () => {
    // Setup test environment
    testConfigDir = join(tmpdir(), `kanban-cli-e2e-${Date.now()}`);
    testDbPath = join(testConfigDir, 'test.db');
    cliPath = join(process.cwd(), 'dist/cli/index.js');

    await fs.mkdir(testConfigDir, { recursive: true });

    // Set environment variables for isolated testing
    process.env.KANBAN_CONFIG_DIR = testConfigDir;
    process.env.KANBAN_DB_PATH = testDbPath;
    process.env.NODE_ENV = 'test';
  });

  afterAll(async () => {
    try {
      await fs.rmdir(testConfigDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic CLI Operations', () => {
    test('should display help information', () => {
      const result = execSync(`node ${cliPath} --help`, { encoding: 'utf8' });

      expect(result).toContain('MCP Kanban CLI');
      expect(result).toContain('Usage:');
      expect(result).toContain('Commands:');
      expect(result).toContain('Options:');
    });

    test('should display version information', () => {
      const result = execSync(`node ${cliPath} --version`, { encoding: 'utf8' });

      expect(result).toMatch(/\d+\.\d+\.\d+/);
    });

    test('should perform health check', async () => {
      const result = execSync(`node ${cliPath} health`, { encoding: 'utf8' });

      expect(result).toContain('Checking system health');
      expect(result).toContain('Database connection: OK');
      expect(result).toContain('Configuration: OK');
    }, 10000);
  });

  describe('Board Management Commands', () => {
    let boardId: string;

    test('should create a new board', () => {
      const result = execSync(
        `node ${cliPath} board create --name "E2E Test Board" --description "Test board for e2e testing"`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Board created successfully');
      expect(result).toContain('E2E Test Board');

      // Extract board ID for subsequent tests
      const boardMatch = result.match(/ID:\s*([a-zA-Z0-9-]+)/);
      if (boardMatch) {
        boardId = boardMatch[1];
      }
    });

    test('should list boards', () => {
      const result = execSync(`node ${cliPath} board list`, { encoding: 'utf8' });

      expect(result).toContain('E2E Test Board');
      expect(result).toContain('Boards:');
    });

    test('should view board details', () => {
      if (!boardId) {
        return; // Skip if board creation failed
      }

      const result = execSync(`node ${cliPath} board view ${boardId}`, { encoding: 'utf8' });

      expect(result).toContain('E2E Test Board');
      expect(result).toContain('Board Details');
    });

    test('should set default board', () => {
      if (!boardId) {
        return;
      }

      const result = execSync(`node ${cliPath} board use ${boardId}`, { encoding: 'utf8' });

      expect(result).toContain('Default board set');
      expect(result).toContain(boardId);
    });
  });

  describe('Task Management Commands', () => {
    let taskId: string;

    test('should create a new task', () => {
      const result = execSync(
        `node ${cliPath} task create --title "E2E Test Task" --description "Test task for e2e testing" --priority P1`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Task created successfully');
      expect(result).toContain('E2E Test Task');

      // Extract task ID
      const taskMatch = result.match(/ID:\s*([a-zA-Z0-9-]+)/);
      if (taskMatch) {
        taskId = taskMatch[1];
      }
    });

    test('should list tasks', () => {
      const result = execSync(`node ${cliPath} task list`, { encoding: 'utf8' });

      expect(result).toContain('E2E Test Task');
      expect(result).toContain('Tasks:');
    });

    test('should view task details', () => {
      if (!taskId) {
        return;
      }

      const result = execSync(`node ${cliPath} task show ${taskId}`, { encoding: 'utf8' });

      expect(result).toContain('E2E Test Task');
      expect(result).toContain('Task Details');
    });

    test('should update task', () => {
      if (!taskId) {
        return;
      }

      const result = execSync(
        `node ${cliPath} task update ${taskId} --title "Updated E2E Test Task"`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Task updated successfully');
      expect(result).toContain('Updated E2E Test Task');
    });

    test('should move task between columns', () => {
      if (!taskId) {
        return;
      }

      const result = execSync(`node ${cliPath} task move ${taskId} --status in_progress`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Task moved successfully');
      expect(result).toContain('in_progress');
    });
  });

  describe('Interactive CLI Commands', () => {
    test('should handle interactive task creation', async () => {
      const child = spawn('node', [cliPath, 'task', 'create', '--interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Simulate user input
      child.stdin.write('Interactive Test Task\n'); // Title
      child.stdin.write('Task created through interactive mode\n'); // Description
      child.stdin.write('P2\n'); // Priority
      child.stdin.write('testing,e2e\n'); // Tags
      child.stdin.write('\n'); // Skip due date
      child.stdin.end();

      let output = '';
      child.stdout.on('data', data => {
        output += data.toString();
      });

      await new Promise((resolve, reject) => {
        child.on('close', code => {
          if (code === 0) {
            resolve(output);
          } else {
            reject(new Error(`Interactive command failed with code ${code}`));
          }
        });
      });

      expect(output).toContain('Task created successfully');
      expect(output).toContain('Interactive Test Task');
    }, 15000);

    test('should handle interactive board creation', async () => {
      const child = spawn('node', [cliPath, 'board', 'create', '--interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      child.stdin.write('Interactive Test Board\n'); // Name
      child.stdin.write('Board created through interactive mode\n'); // Description
      child.stdin.write('kanban\n'); // Template
      child.stdin.end();

      let output = '';
      child.stdout.on('data', data => {
        output += data.toString();
      });

      await new Promise((resolve, reject) => {
        child.on('close', code => {
          if (code === 0) {
            resolve(output);
          } else {
            reject(new Error(`Interactive board creation failed with code ${code}`));
          }
        });
      });

      expect(output).toContain('Board created successfully');
      expect(output).toContain('Interactive Test Board');
    }, 15000);
  });

  describe('Configuration Management', () => {
    test('should set configuration values', () => {
      const result = execSync(`node ${cliPath} config set api-url http://localhost:3000`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Configuration updated');
      expect(result).toContain('api-url');
    });

    test('should get configuration values', () => {
      const result = execSync(`node ${cliPath} config get api-url`, { encoding: 'utf8' });

      expect(result).toContain('http://localhost:3000');
    });

    test('should list all configuration', () => {
      const result = execSync(`node ${cliPath} config list`, { encoding: 'utf8' });

      expect(result).toContain('Configuration:');
      expect(result).toContain('api-url');
    });

    test('should validate configuration', () => {
      const result = execSync(`node ${cliPath} config validate`, { encoding: 'utf8' });

      expect(result).toContain('Configuration validation');
    });
  });

  describe('Search and Filtering', () => {
    test('should search tasks by title', () => {
      const result = execSync(`node ${cliPath} task search --query "E2E"`, { encoding: 'utf8' });

      expect(result).toContain('Search Results');
      expect(result).toContain('E2E');
    });

    test('should filter tasks by priority', () => {
      const result = execSync(`node ${cliPath} task list --priority P1`, { encoding: 'utf8' });

      expect(result).toContain('P1');
    });

    test('should filter tasks by status', () => {
      const result = execSync(`node ${cliPath} task list --status todo`, { encoding: 'utf8' });

      expect(result).toContain('todo');
    });
  });

  describe('Export and Import Operations', () => {
    test('should export board data', () => {
      const exportPath = join(testConfigDir, 'test-export.json');
      const result = execSync(`node ${cliPath} export board --output ${exportPath}`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Export completed');
      expect(result).toContain(exportPath);
    });

    test('should export tasks to CSV', () => {
      const exportPath = join(testConfigDir, 'tasks-export.csv');
      const result = execSync(`node ${cliPath} export tasks --format csv --output ${exportPath}`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Export completed');
      expect(result).toContain('CSV');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid board ID gracefully', () => {
      expect(() => {
        execSync(`node ${cliPath} board view invalid-board-id`, { encoding: 'utf8' });
      }).toThrow();
    });

    test('should handle invalid task ID gracefully', () => {
      expect(() => {
        execSync(`node ${cliPath} task show invalid-task-id`, { encoding: 'utf8' });
      }).toThrow();
    });

    test('should handle missing required parameters', () => {
      expect(() => {
        execSync(`node ${cliPath} task create`, { encoding: 'utf8' });
      }).toThrow();
    });

    test('should handle invalid configuration values', () => {
      expect(() => {
        execSync(`node ${cliPath} config set invalid-key invalid-value`, { encoding: 'utf8' });
      }).toThrow();
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle rapid command execution', async () => {
      const startTime = Date.now();
      const commands = [];

      // Execute multiple commands rapidly
      for (let i = 0; i < 5; i++) {
        commands.push(
          execSync(`node ${cliPath} task create --title "Load Test Task ${i}" --priority P3`, {
            encoding: 'utf8',
          })
        );
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(15000);

      // All commands should succeed
      commands.forEach((result, index) => {
        expect(result).toContain('Task created successfully');
        expect(result).toContain(`Load Test Task ${index}`);
      });
    }, 20000);

    test('should handle large data sets efficiently', () => {
      const largeTitle = `Large Task Title ${'x'.repeat(500)}`;
      const largeDescription = `Large Description ${'y'.repeat(2000)}`;

      const startTime = Date.now();
      const result = execSync(
        `node ${cliPath} task create --title "${largeTitle}" --description "${largeDescription}"`,
        { encoding: 'utf8' }
      );
      const endTime = Date.now();

      // Should handle large input efficiently
      expect(endTime - startTime).toBeLessThan(5000);
      expect(result).toContain('Task created successfully');
    }, 10000);
  });

  describe('Output Formatting', () => {
    test('should support JSON output format', () => {
      const result = execSync(`node ${cliPath} task list --format json`, { encoding: 'utf8' });

      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed.tasks || parsed)).toBe(true);
    });

    test('should support table output format', () => {
      const result = execSync(`node ${cliPath} task list --format table`, { encoding: 'utf8' });

      expect(result).toContain('│'); // Table borders
      expect(result).toContain('Title');
      expect(result).toContain('Status');
    });

    test('should support CSV output format', () => {
      const result = execSync(`node ${cliPath} task list --format csv`, { encoding: 'utf8' });

      expect(result).toContain(','); // CSV separators
      expect(result.split('\n')[0]).toContain('title'); // Header row
    });
  });

  describe('CLI State Management', () => {
    test('should maintain session state across commands', () => {
      // Set a default board
      const setBoardResult = execSync(`node ${cliPath} board create --name "Session Board"`, {
        encoding: 'utf8',
      });

      const boardMatch = setBoardResult.match(/ID:\s*([a-zA-Z0-9-]+)/);
      if (boardMatch) {
        const sessionBoardId = boardMatch[1];

        execSync(`node ${cliPath} board use ${sessionBoardId}`, { encoding: 'utf8' });

        // Create task without specifying board (should use default)
        const taskResult = execSync(`node ${cliPath} task create --title "Session Test Task"`, {
          encoding: 'utf8',
        });

        expect(taskResult).toContain('Task created successfully');
        expect(taskResult).toContain('Session Test Task');
      }
    });

    test('should handle configuration persistence', () => {
      // Set configuration
      execSync(`node ${cliPath} config set test-key test-value`, { encoding: 'utf8' });

      // Verify it persists across CLI invocations
      const result = execSync(`node ${cliPath} config get test-key`, { encoding: 'utf8' });

      expect(result).toContain('test-value');
    });
  });
});
