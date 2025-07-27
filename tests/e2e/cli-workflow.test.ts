/**
 * End-to-End Workflow Tests
 * Tests complete user workflows from board creation to task management
 */

import { execSync, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CLI Complete Workflow E2E Tests', () => {
  let testConfigDir: string;
  let boardId: string;

  beforeAll(async () => {
    testConfigDir = join(tmpdir(), `kanban-workflow-test-${Date.now()}`);
    await fs.mkdir(testConfigDir, { recursive: true });
    process.env.KANBAN_CONFIG_DIR = testConfigDir;
  });

  afterAll(async () => {
    try {
      await fs.rmdir(testConfigDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Complete Project Setup Workflow', () => {
    it('should complete a full project setup workflow', async () => {
      // Step 1: Configure CLI
      const configResult = execSync(
        'node dist/cli/index.js config set api-url http://localhost:3000',
        { encoding: 'utf8', cwd: process.cwd() }
      );
      expect(configResult).toContain('Configuration updated');

      // Step 2: Create board with template
      const boardResult = execSync(
        'node dist/cli/index.js board create --name "E2E Test Board" --template scrum',
        { encoding: 'utf8', cwd: process.cwd() }
      );
      expect(boardResult).toContain('Board created successfully');

      // Extract board ID from output
      const boardMatch = boardResult.match(/Board.*created.*ID:?\s*([a-zA-Z0-9-]+)/);
      if (boardMatch) {
        boardId = boardMatch[1];
      }

      // Step 3: Set as default board
      if (boardId) {
        const defaultResult = execSync(`node dist/cli/index.js board use ${boardId}`, {
          encoding: 'utf8',
          cwd: process.cwd(),
        });
        expect(defaultResult).toContain('Default board set');
      }

      // Step 4: Create tasks with different priorities
      const taskResults = [];
      const tasks = [
        { title: 'High priority bug fix', priority: 'P1', status: 'todo' },
        { title: 'Feature implementation', priority: 'P2', status: 'todo' },
        { title: 'Documentation update', priority: 'P3', status: 'in_progress' },
        { title: 'Code review', priority: 'P2', status: 'todo' },
      ];

      for (const task of tasks) {
        const result = execSync(
          `node dist/cli/index.js task create --title "${task.title}" --priority ${task.priority} --status ${task.status}`,
          { encoding: 'utf8', cwd: process.cwd() }
        );
        taskResults.push(result);
        expect(result).toContain('Task created');
      }

      // Step 5: List tasks to verify creation
      const listResult = execSync('node dist/cli/index.js task list --format table', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });
      expect(listResult).toContain('High priority bug fix');
      expect(listResult).toContain('Feature implementation');
      expect(listResult).toContain('Documentation update');
      expect(listResult).toContain('Code review');

      // Step 6: Update task status
      const updateResult = execSync(
        'node dist/cli/index.js task update --title "High priority bug fix" --status in_progress',
        { encoding: 'utf8', cwd: process.cwd() }
      );
      expect(updateResult).toContain('Task updated');

      // Step 7: Search tasks
      const searchResult = execSync('node dist/cli/index.js task search "bug"', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });
      expect(searchResult).toContain('High priority bug fix');

      // Step 8: View board status
      if (boardId) {
        const boardViewResult = execSync(`node dist/cli/index.js board view ${boardId}`, {
          encoding: 'utf8',
          cwd: process.cwd(),
        });
        expect(boardViewResult).toContain('E2E Test Board');
      }
    }, 30000);
  });

  describe('Security-Aware Workflow', () => {
    it('should handle malicious input throughout the workflow', async () => {
      const maliciousBoardName = '<script>alert("board-xss")</script>Secure Board';
      const maliciousTaskTitle = '$(rm -rf /) Secure Task';
      const maliciousDescription = 'Description with \\u003cscript\\u003e injection';

      // Create board with malicious name
      const boardResult = execSync(
        `node dist/cli/index.js board create --name "${maliciousBoardName}"`,
        { encoding: 'utf8', cwd: process.cwd() }
      );
      expect(boardResult).toContain('Input sanitized');
      expect(boardResult).not.toContain('<script>');
      expect(boardResult).toContain('Secure Board');

      // Create task with malicious content
      const taskResult = execSync(
        `node dist/cli/index.js task create --title "${maliciousTaskTitle}" --description "${maliciousDescription}"`,
        { encoding: 'utf8', cwd: process.cwd() }
      );
      expect(taskResult).toContain('Input sanitized');
      expect(taskResult).not.toContain('$(rm -rf /)');
      expect(taskResult).not.toContain('\\u003cscript\\u003e');
      expect(taskResult).toContain('Secure Task');

      // Search with malicious query
      const searchResult = execSync('node dist/cli/index.js task search "; cat /etc/passwd #"', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });
      expect(searchResult).toContain('Input sanitized');
      expect(searchResult).not.toContain('cat /etc/passwd');

      // Update with malicious data
      const updateResult = execSync(
        'node dist/cli/index.js task update --title "Secure Task" --description "Updated: <img src=x onerror=alert(1)>"',
        { encoding: 'utf8', cwd: process.cwd() }
      );
      expect(updateResult).toContain('Input sanitized');
      expect(updateResult).not.toContain('onerror=alert');
    }, 20000);
  });

  describe('Interactive Workflow Simulation', () => {
    it('should complete an interactive project setup', async () => {
      const child = spawn('node', ['dist/cli/index.js', 'board', 'quick-setup'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      // Simulate complete interactive board setup
      child.stdin.write('Interactive Test Project\\n'); // Board name
      child.stdin.write('A project created through interactive E2E testing\\n'); // Description
      child.stdin.write('scrum\\n'); // Template
      child.stdin.write('n\\n'); // Not public
      child.stdin.write('y\\n'); // Confirm creation
      child.stdin.write('y\\n'); // Set as default
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
            reject(new Error(`Interactive setup failed with code ${code}`));
          }
        });
      });

      expect(output).toContain('Board created successfully');
      expect(output).toContain('Interactive Test Project');
      expect(output).toContain('Set as default board');

      // Follow up with interactive task creation
      const taskChild = spawn('node', ['dist/cli/index.js', 'task', 'create', '--interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      taskChild.stdin.write('First Interactive Task\\n'); // Title
      taskChild.stdin.write('This task was created interactively in E2E test\\n'); // Description
      taskChild.stdin.write('P1\\n'); // Priority
      taskChild.stdin.write('frontend,testing\\n'); // Tags
      taskChild.stdin.write('\\n'); // Skip due date
      taskChild.stdin.end();

      let taskOutput = '';
      taskChild.stdout.on('data', data => {
        taskOutput += data.toString();
      });

      await new Promise((resolve, reject) => {
        taskChild.on('close', code => {
          if (code === 0) {
            resolve(taskOutput);
          } else {
            reject(new Error(`Interactive task creation failed with code ${code}`));
          }
        });
      });

      expect(taskOutput).toContain('Task created successfully');
      expect(taskOutput).toContain('First Interactive Task');
    }, 25000);
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple rapid operations', async () => {
      const startTime = Date.now();
      const operations = [];

      // Create multiple tasks rapidly
      for (let i = 0; i < 10; i++) {
        const operation = execSync(
          `node dist/cli/index.js task create --title "Rapid Task ${i}" --priority P3`,
          { encoding: 'utf8', cwd: process.cwd() }
        );
        operations.push(operation);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete within reasonable time (30 seconds for 10 operations)
      expect(totalTime).toBeLessThan(30000);

      // All operations should succeed
      operations.forEach((result, index) => {
        expect(result).toContain('Task created');
        expect(result).toContain(`Rapid Task ${index}`);
      });

      // Verify all tasks were created
      const listResult = execSync('node dist/cli/index.js task list --format json', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });

      for (let i = 0; i < 10; i++) {
        expect(listResult).toContain(`Rapid Task ${i}`);
      }
    }, 45000);

    it('should handle large input values efficiently', async () => {
      const largeTitle = `Large Task Title: ${'x'.repeat(1000)}`;
      const largeDescription = `Large Description: ${'y'.repeat(5000)}`;

      const startTime = Date.now();
      const result = execSync(
        `node dist/cli/index.js task create --title "${largeTitle}" --description "${largeDescription}"`,
        { encoding: 'utf8', cwd: process.cwd() }
      );
      const endTime = Date.now();

      // Should handle large input within reasonable time
      expect(endTime - startTime).toBeLessThan(5000);

      // Should sanitize and truncate appropriately
      expect(result).toContain('Input sanitized');
      expect(result).toContain('Large Task Title');
    }, 10000);
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from temporary service interruptions', async () => {
      // Simulate service interruption by using invalid URL temporarily
      const originalUrl = process.env.KANBAN_API_URL;
      process.env.KANBAN_API_URL = 'http://localhost:9999';

      // First operation should fail
      try {
        execSync('node dist/cli/index.js task create --title "Offline Task"', {
          encoding: 'utf8',
          cwd: process.cwd(),
        });
      } catch (error) {
        expect(error.toString()).toContain('Connection failed');
      }

      // Restore service
      if (originalUrl) {
        process.env.KANBAN_API_URL = originalUrl;
      } else {
        delete process.env.KANBAN_API_URL;
      }

      // Subsequent operation should succeed
      const result = execSync('node dist/cli/index.js task create --title "Online Task"', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });
      expect(result).toContain('Task created');
      expect(result).toContain('Online Task');
    }, 15000);

    it('should handle corrupted configuration gracefully', async () => {
      // Create corrupted config file
      const configPath = join(testConfigDir, 'config.json');
      await fs.writeFile(configPath, '{ invalid json syntax');

      // CLI should detect and handle corrupted config
      const result = execSync('node dist/cli/index.js config validate', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });

      expect(result).toContain('Configuration error');
      expect(result).toContain('Reset configuration');

      // Should be able to reset configuration
      const resetResult = execSync('node dist/cli/index.js config reset', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });
      expect(resetResult).toContain('Configuration reset');
    }, 10000);
  });
});
