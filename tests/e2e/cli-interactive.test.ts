/**
 * End-to-End Interactive Features Tests
 * Tests simulate user interactions with enhanced CLI features
 */

import { spawn, execSync } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CLI Interactive Features E2E Tests', () => {
  let testConfigDir: string;

  beforeAll(async () => {
    testConfigDir = join(tmpdir(), `kanban-interactive-test-${Date.now()}`);
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

  describe('Interactive Task Creation', () => {
    it('should handle interactive task creation with simulated user input', async () => {
      const child = spawn('node', ['dist/cli/index.js', 'task', 'create', '--interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      // Simulate user input
      child.stdin.write('Test Task Title\\n'); // Task title
      child.stdin.write('This is a test task description\\n'); // Description
      child.stdin.write('P1\\n'); // Priority
      child.stdin.write('\\n'); // Skip tags (empty)
      child.stdin.write('\\n'); // Skip due date (empty)
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
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });

      expect(output).toContain('Task created successfully');
      expect(output).toContain('Test Task Title');
    }, 10000);

    it('should validate user input during interactive creation', async () => {
      const child = spawn('node', ['dist/cli/index.js', 'task', 'create', '--interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      // Simulate invalid then valid input
      child.stdin.write('\\n'); // Empty title (should be rejected)
      child.stdin.write('Valid Task Title\\n'); // Valid title
      child.stdin.write('Valid description\\n'); // Description
      child.stdin.write('P2\\n'); // Priority
      child.stdin.write('\\n'); // Skip tags
      child.stdin.write('\\n'); // Skip due date
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
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });

      expect(output).toContain('Title is required');
      expect(output).toContain('Valid Task Title');
    }, 10000);

    it('should sanitize input during interactive mode', async () => {
      const child = spawn('node', ['dist/cli/index.js', 'task', 'create', '--interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      // Simulate malicious input
      child.stdin.write('<script>alert("xss")</script>Safe Title\\n'); // Malicious title
      child.stdin.write('Safe description\\n'); // Description
      child.stdin.write('P3\\n'); // Priority
      child.stdin.write('\\n'); // Skip tags
      child.stdin.write('\\n'); // Skip due date
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
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });

      expect(output).toContain('Input sanitized');
      expect(output).not.toContain('<script>');
      expect(output).toContain('Safe Title');
    }, 10000);
  });

  describe('Board Quick Setup', () => {
    it('should handle board quick setup with template selection', async () => {
      const child = spawn('node', ['dist/cli/index.js', 'board', 'quick-setup'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      // Simulate user input for board setup
      child.stdin.write('Test Board\\n'); // Board name
      child.stdin.write('A test board for E2E testing\\n'); // Description
      child.stdin.write('scrum\\n'); // Template selection
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
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });

      expect(output).toContain('Board created successfully');
      expect(output).toContain('Test Board');
      expect(output).toContain('scrum');
    }, 15000);

    it('should validate template selection', async () => {
      const child = spawn('node', ['dist/cli/index.js', 'board', 'quick-setup'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      child.stdin.write('Template Test Board\\n'); // Board name
      child.stdin.write('Testing template validation\\n'); // Description
      child.stdin.write('invalid-template\\n'); // Invalid template
      child.stdin.write('basic\\n'); // Valid template
      child.stdin.write('n\\n'); // Not public
      child.stdin.write('y\\n'); // Confirm creation
      child.stdin.write('n\\n'); // Don't set as default
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
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });

      expect(output).toContain('Invalid template');
      expect(output).toContain('basic');
    }, 15000);
  });

  describe('Configuration Setup', () => {
    it('should handle interactive configuration setup', async () => {
      const child = spawn('node', ['dist/cli/index.js', 'config', 'setup', '--interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      // Simulate configuration input
      child.stdin.write('http://localhost:3000\\n'); // API URL
      child.stdin.write('test-api-key\\n'); // API key
      child.stdin.write('json\\n'); // Default format
      child.stdin.write('y\\n'); // Enable colors
      child.stdin.write('n\\n'); // Don't enable verbose
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
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });

      expect(output).toContain('Configuration saved');
      expect(output).toContain('localhost:3000');
    }, 10000);

    it('should validate configuration values', async () => {
      const child = spawn('node', ['dist/cli/index.js', 'config', 'setup', '--interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      // Test invalid URL then valid URL
      child.stdin.write('not-a-url\\n'); // Invalid URL
      child.stdin.write('http://valid.example.com\\n'); // Valid URL
      child.stdin.write('valid-key\\n'); // API key
      child.stdin.write('table\\n'); // Default format
      child.stdin.write('y\\n'); // Enable colors
      child.stdin.write('n\\n'); // Don't enable verbose
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
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });

      expect(output).toContain('Invalid URL');
      expect(output).toContain('valid.example.com');
    }, 10000);
  });

  describe('Keyboard Navigation Simulation', () => {
    it('should handle keyboard shortcuts in interactive task list', async () => {
      // First create some test data
      try {
        execSync(
          'node dist/cli/index.js task create --title "Test Task 1" --board-id test --column-id todo',
          {
            cwd: process.cwd(),
            stdio: 'ignore',
          }
        );
        execSync(
          'node dist/cli/index.js task create --title "Test Task 2" --board-id test --column-id todo',
          {
            cwd: process.cwd(),
            stdio: 'ignore',
          }
        );
      } catch (error) {
        // Ignore errors if tasks already exist
      }

      const child = spawn('node', ['dist/cli/index.js', 'task', 'list', '--interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      // Simulate keyboard navigation
      child.stdin.write('j\\n'); // Move down
      child.stdin.write('k\\n'); // Move up
      child.stdin.write('?\\n'); // Show help
      child.stdin.write('q\\n'); // Quit
      child.stdin.end();

      let output = '';
      child.stdout.on('data', data => {
        output += data.toString();
      });

      await new Promise((resolve, _reject) => {
        child.on('close', _code => {
          resolve(output);
        });
      });

      expect(output).toContain('Navigation:');
      expect(output).toContain('Actions:');
    }, 10000);
  });

  describe('Error Recovery in Interactive Mode', () => {
    it('should recover gracefully from network errors', async () => {
      // Set invalid API URL to simulate network error
      process.env.KANBAN_API_URL = 'http://invalid-host:9999';

      const child = spawn('node', ['dist/cli/index.js', 'task', 'create', '--interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      child.stdin.write('Network Test Task\\n'); // Task title
      child.stdin.write('Testing network error handling\\n'); // Description
      child.stdin.write('P1\\n'); // Priority
      child.stdin.write('\\n'); // Skip tags
      child.stdin.write('\\n'); // Skip due date
      child.stdin.end();

      let output = '';
      child.stderr.on('data', data => {
        output += data.toString();
      });

      await new Promise(resolve => {
        child.on('close', () => {
          resolve(output);
        });
      });

      expect(output).toContain('Connection failed');
      expect(output).not.toContain('invalid-host:9999'); // Should not leak sensitive URL

      delete process.env.KANBAN_API_URL;
    }, 10000);

    it('should handle Ctrl+C gracefully', async () => {
      const child = spawn('node', ['dist/cli/index.js', 'task', 'create', '--interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      // Start input then send SIGINT
      child.stdin.write('Interrupted Task\\n');
      setTimeout(() => {
        child.kill('SIGINT');
      }, 1000);

      let output = '';
      child.stdout.on('data', data => {
        output += data.toString();
      });

      await new Promise(resolve => {
        child.on('close', () => {
          resolve(output);
        });
      });

      expect(output).toContain('Operation cancelled');
    }, 5000);
  });
});
