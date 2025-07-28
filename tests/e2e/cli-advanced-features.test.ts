/**
 * @fileoverview Advanced CLI Features E2E Tests
 * @lastmodified 2025-07-28T18:00:00Z
 *
 * Features: Advanced CLI functionality testing including templates, dependencies, analytics
 * Main APIs: Advanced command patterns, complex workflows, data analysis features
 * Constraints: Requires full CLI build, database with sample data, extended timeouts
 * Patterns: Complex workflow testing, data validation, performance monitoring
 */

import { execSync, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CLI Advanced Features E2E Tests', () => {
  let testConfigDir: string;
  let testDbPath: string;
  let cliPath: string;
  let boardId: string;

  beforeAll(async () => {
    testConfigDir = join(tmpdir(), `kanban-cli-advanced-${Date.now()}`);
    testDbPath = join(testConfigDir, 'advanced-test.db');
    cliPath = join(process.cwd(), 'dist/cli/index.js');

    await fs.mkdir(testConfigDir, { recursive: true });

    process.env.KANBAN_CONFIG_DIR = testConfigDir;
    process.env.KANBAN_DB_PATH = testDbPath;
    process.env.NODE_ENV = 'test';

    // Setup test board for advanced features
    const boardResult = execSync(
      `node ${cliPath} board create --name "Advanced Features Board" --template scrum`,
      { encoding: 'utf8' }
    );
    const boardMatch = boardResult.match(/ID:\s*([a-zA-Z0-9-]+)/);
    if (boardMatch) {
      boardId = boardMatch[1];
      execSync(`node ${cliPath} board use ${boardId}`, { encoding: 'utf8' });
    }
  }, 15000);

  afterAll(async () => {
    try {
      await fs.rmdir(testConfigDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Template Management', () => {
    test('should create board from template', () => {
      const result = execSync(
        `node ${cliPath} board create --name "Scrum Board" --template scrum`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Board created successfully');
      expect(result).toContain('Scrum Board');
      expect(result).toContain('template: scrum');
    });

    test('should list available templates', () => {
      const result = execSync(`node ${cliPath} template list`, { encoding: 'utf8' });

      expect(result).toContain('Available Templates');
      expect(result).toContain('scrum');
      expect(result).toContain('kanban');
    });

    test('should create custom template', () => {
      const result = execSync(
        `node ${cliPath} template create --name "custom-template" --columns "Backlog,In Progress,Review,Done"`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Template created successfully');
      expect(result).toContain('custom-template');
    });

    test('should apply template to existing board', () => {
      if (!boardId) return;

      const result = execSync(`node ${cliPath} board template ${boardId} --template kanban`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Template applied successfully');
      expect(result).toContain('kanban');
    });
  });

  describe('Task Dependencies', () => {
    let parentTaskId: string;
    let childTaskId: string;

    test('should create task with dependencies', () => {
      // Create parent task
      const parentResult = execSync(
        `node ${cliPath} task create --title "Parent Task" --description "This is the parent task"`,
        { encoding: 'utf8' }
      );

      const parentMatch = parentResult.match(/ID:\s*([a-zA-Z0-9-]+)/);
      if (parentMatch) {
        parentTaskId = parentMatch[1];
      }

      expect(parentResult).toContain('Task created successfully');

      // Create child task with dependency
      const childResult = execSync(
        `node ${cliPath} task create --title "Child Task" --depends-on ${parentTaskId}`,
        { encoding: 'utf8' }
      );

      const childMatch = childResult.match(/ID:\s*([a-zA-Z0-9-]+)/);
      if (childMatch) {
        childTaskId = childMatch[1];
      }

      expect(childResult).toContain('Task created successfully');
      expect(childResult).toContain('dependency');
    });

    test('should visualize dependency graph', () => {
      if (!parentTaskId || !childTaskId) return;

      const result = execSync(`node ${cliPath} dependencies graph --format ascii`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Dependency Graph');
      expect(result).toContain('Parent Task');
      expect(result).toContain('Child Task');
      expect(result).toContain('→'); // Dependency arrow
    });

    test('should detect circular dependencies', () => {
      if (!parentTaskId || !childTaskId) return;

      // Try to create circular dependency
      expect(() => {
        execSync(`node ${cliPath} task update ${parentTaskId} --depends-on ${childTaskId}`, {
          encoding: 'utf8',
        });
      }).toThrow(); // Should fail due to circular dependency
    });

    test('should show task dependency chain', () => {
      if (!childTaskId) return;

      const result = execSync(`node ${cliPath} task dependencies ${childTaskId}`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Dependencies for');
      expect(result).toContain('Parent Task');
      expect(result).toContain('Blocking tasks');
    });
  });

  describe('Advanced Search and Filtering', () => {
    beforeAll(() => {
      // Create diverse test data
      const testTasks = [
        { title: 'Frontend Bug Fix', tags: 'frontend,bug,critical', priority: 'P1' },
        { title: 'Backend API Enhancement', tags: 'backend,api,enhancement', priority: 'P2' },
        { title: 'Database Migration', tags: 'database,migration,maintenance', priority: 'P3' },
        { title: 'UI/UX Improvements', tags: 'frontend,ui,ux,enhancement', priority: 'P2' },
      ];

      testTasks.forEach(task => {
        execSync(
          `node ${cliPath} task create --title "${task.title}" --tags "${task.tags}" --priority ${task.priority}`,
          { encoding: 'utf8' }
        );
      });
    }, 10000);

    test('should perform complex search queries', () => {
      const result = execSync(
        `node ${cliPath} search --query "frontend AND (bug OR enhancement)" --format json`,
        { encoding: 'utf8' }
      );

      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.results.length).toBeGreaterThan(0);
    });

    test('should filter by multiple criteria', () => {
      const result = execSync(
        `node ${cliPath} task list --tags frontend --priority P1,P2 --format json`,
        { encoding: 'utf8' }
      );

      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.tasks || parsed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: expect.stringContaining('Frontend'),
          }),
        ])
      );
    });

    test('should search with date ranges', () => {
      const today = new Date().toISOString().split('T')[0];
      const result = execSync(`node ${cliPath} task list --created-after ${today} --format json`, {
        encoding: 'utf8',
      });

      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('Analytics and Reporting', () => {
    test('should generate board analytics', () => {
      const result = execSync(`node ${cliPath} analytics board --board ${boardId || 'default'}`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Board Analytics');
      expect(result).toContain('Total Tasks');
      expect(result).toContain('Task Distribution');
      expect(result).toContain('Completion Rate');
    });

    test('should generate velocity report', () => {
      const result = execSync(`node ${cliPath} analytics velocity --period 30`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Velocity Report');
      expect(result).toContain('Tasks Completed');
      expect(result).toContain('Average Completion Time');
    });

    test('should show task priority distribution', () => {
      const result = execSync(`node ${cliPath} analytics priorities --format chart`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Priority Distribution');
      expect(result).toContain('P1');
      expect(result).toContain('P2');
      expect(result).toContain('P3');
    });

    test('should export analytics data', () => {
      const exportPath = join(testConfigDir, 'analytics-export.json');
      const result = execSync(
        `node ${cliPath} analytics export --output ${exportPath} --format json`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Analytics exported');
      expect(result).toContain(exportPath);
    });
  });

  describe('Backup and Restore Operations', () => {
    let backupPath: string;

    test('should create full backup', () => {
      backupPath = join(testConfigDir, 'full-backup.json');
      const result = execSync(
        `node ${cliPath} backup create --output ${backupPath} --include-attachments`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Backup created successfully');
      expect(result).toContain(backupPath);
    });

    test('should validate backup integrity', async () => {
      if (!backupPath) return;

      const result = execSync(`node ${cliPath} backup validate --file ${backupPath}`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Backup validation');
      expect(result).toContain('✓'); // Success indicators
    });

    test('should list available backups', () => {
      const result = execSync(`node ${cliPath} backup list`, { encoding: 'utf8' });

      expect(result).toContain('Available Backups');
      expect(result).toContain('full-backup.json');
    });

    test('should schedule automatic backups', () => {
      const result = execSync(
        `node ${cliPath} backup schedule --frequency daily --time "02:00" --retention 7`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Backup scheduled');
      expect(result).toContain('daily');
      expect(result).toContain('02:00');
    });
  });

  describe('Real-time and WebSocket Features', () => {
    test('should enable real-time mode', () => {
      const result = execSync(`node ${cliPath} realtime connect --server ws://localhost:3001`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Real-time connection');
      expect(result).toContain('WebSocket');
    });

    test('should subscribe to board updates', () => {
      if (!boardId) return;

      const result = execSync(
        `node ${cliPath} realtime subscribe --board ${boardId} --events task_created,task_updated`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Subscribed to board updates');
      expect(result).toContain(boardId);
    });
  });

  describe('Performance Monitoring', () => {
    test('should show CLI performance metrics', () => {
      const result = execSync(`node ${cliPath} performance stats`, { encoding: 'utf8' });

      expect(result).toContain('Performance Statistics');
      expect(result).toContain('Command Execution Time');
      expect(result).toContain('Memory Usage');
    });

    test('should benchmark common operations', () => {
      const result = execSync(
        `node ${cliPath} performance benchmark --operations task_create,task_list,board_view`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Benchmark Results');
      expect(result).toContain('task_create');
      expect(result).toContain('Average Time');
    }, 15000);

    test('should monitor resource usage', () => {
      const result = execSync(`node ${cliPath} performance monitor --duration 5`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Resource Monitoring');
      expect(result).toContain('CPU Usage');
      expect(result).toContain('Memory Usage');
    }, 10000);
  });

  describe('Plugin and Extension System', () => {
    test('should list available plugins', () => {
      const result = execSync(`node ${cliPath} plugin list`, { encoding: 'utf8' });

      expect(result).toContain('Available Plugins');
    });

    test('should install plugin', () => {
      const result = execSync(`node ${cliPath} plugin install --name test-plugin --source local`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Plugin installation');
    });

    test('should show plugin configuration', () => {
      const result = execSync(`node ${cliPath} plugin config test-plugin`, { encoding: 'utf8' });

      expect(result).toContain('Plugin Configuration');
      expect(result).toContain('test-plugin');
    });
  });

  describe('Integration with External Tools', () => {
    test('should integrate with Git', () => {
      const result = execSync(`node ${cliPath} git sync --auto-create-branches`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Git integration');
      expect(result).toContain('branch');
    });

    test('should export to external formats', () => {
      const exportPath = join(testConfigDir, 'export.xlsx');
      const result = execSync(
        `node ${cliPath} export excel --output ${exportPath} --include-charts`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Excel export');
      expect(result).toContain(exportPath);
    });

    test('should webhook integration', () => {
      const result = execSync(
        `node ${cliPath} webhook create --url https://api.example.com/webhook --events task_completed`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Webhook created');
      expect(result).toContain('task_completed');
    });
  });

  describe('Advanced Configuration', () => {
    test('should manage multiple profiles', () => {
      const result = execSync(
        `node ${cliPath} profile create --name test-profile --config '{"api-url": "http://test.localhost"}'`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Profile created');
      expect(result).toContain('test-profile');
    });

    test('should switch between profiles', () => {
      const result = execSync(`node ${cliPath} profile use test-profile`, { encoding: 'utf8' });

      expect(result).toContain('Profile switched');
      expect(result).toContain('test-profile');
    });

    test('should validate configuration schema', () => {
      const result = execSync(`node ${cliPath} config validate --strict`, { encoding: 'utf8' });

      expect(result).toContain('Configuration validation');
      expect(result).toContain('Schema');
    });
  });

  describe('Bulk Operations', () => {
    test('should perform bulk task updates', () => {
      const result = execSync(
        `node ${cliPath} task bulk-update --query "tags:frontend" --set priority=P1`,
        { encoding: 'utf8' }
      );

      expect(result).toContain('Bulk update completed');
      expect(result).toContain('tasks updated');
    });

    test('should bulk import from CSV', () => {
      const csvPath = join(testConfigDir, 'bulk-import.csv');
      const csvContent = `title,description,priority,tags
Bulk Task 1,First bulk task,P1,bulk;import
Bulk Task 2,Second bulk task,P2,bulk;import`;

      await fs.writeFile(csvPath, csvContent);

      const result = execSync(`node ${cliPath} task import --file ${csvPath} --format csv`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Import completed');
      expect(result).toContain('2 tasks imported');
    });

    test('should bulk delete with confirmation', () => {
      const result = execSync(`node ${cliPath} task bulk-delete --query "tags:bulk" --confirm`, {
        encoding: 'utf8',
      });

      expect(result).toContain('Bulk delete completed');
      expect(result).toContain('tasks deleted');
    });
  });
});
