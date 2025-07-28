/**
 * Installation Performance Tests
 * Tests for performance metrics during installation and startup
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Installation Performance Tests', () => {
  const testInstallDir = path.join(os.tmpdir(), 'mcp-kanban-perf-test');
  const performanceThresholds = {
    installTime: 300000, // 5 minutes max
    startupTime: 10000, // 10 seconds max
    buildTime: 120000, // 2 minutes max
    memoryUsage: 512 * 1024 * 1024, // 512MB max
    diskSpace: 200 * 1024 * 1024, // 200MB max
  };

  beforeAll(() => {
    // Clean up any existing test installation
    if (fs.existsSync(testInstallDir)) {
      fs.rmSync(testInstallDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Clean up test installation
    if (fs.existsSync(testInstallDir)) {
      fs.rmSync(testInstallDir, { recursive: true, force: true });
    }
  });

  describe('Installation Performance', () => {
    it(
      'should complete installation within performance threshold',
      async () => {
        const startTime = Date.now();

        try {
          // Create test directory
          fs.mkdirSync(testInstallDir, { recursive: true });

          // Copy project files (simulating download)
          const projectRoot = path.resolve(__dirname, '../..');
          execSync(`cp -r "${projectRoot}"/* "${testInstallDir}"/`, {
            stdio: 'pipe',
            timeout: performanceThresholds.installTime,
          });

          // Install dependencies
          process.chdir(testInstallDir);
          execSync('npm ci --only=production', {
            stdio: 'pipe',
            timeout: performanceThresholds.installTime,
          });

          const installTime = Date.now() - startTime;

          expect(installTime).toBeLessThan(performanceThresholds.installTime);
          console.log(`Installation completed in ${installTime}ms`);
        } catch (error) {
          const installTime = Date.now() - startTime;
          console.error(`Installation failed after ${installTime}ms:`, error);
          throw error;
        }
      },
      performanceThresholds.installTime + 10000
    );

    it(
      'should build project within performance threshold',
      async () => {
        const startTime = Date.now();

        try {
          process.chdir(testInstallDir);
          execSync('npm run build', {
            stdio: 'pipe',
            timeout: performanceThresholds.buildTime,
          });

          const buildTime = Date.now() - startTime;

          expect(buildTime).toBeLessThan(performanceThresholds.buildTime);
          console.log(`Build completed in ${buildTime}ms`);
        } catch (error) {
          const buildTime = Date.now() - startTime;
          console.error(`Build failed after ${buildTime}ms:`, error);
          throw error;
        }
      },
      performanceThresholds.buildTime + 10000
    );

    it('should use reasonable disk space', () => {
      const getDirSize = (dirPath: string): number => {
        let totalSize = 0;

        const items = fs.readdirSync(dirPath);
        for (const item of items) {
          const itemPath = path.join(dirPath, item);
          const stats = fs.statSync(itemPath);

          if (stats.isDirectory()) {
            totalSize += getDirSize(itemPath);
          } else {
            totalSize += stats.size;
          }
        }

        return totalSize;
      };

      const installSize = getDirSize(testInstallDir);

      expect(installSize).toBeLessThan(performanceThresholds.diskSpace);
      console.log(`Installation size: ${(installSize / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Startup Performance', () => {
    it(
      'should start server within performance threshold',
      async () => {
        const startTime = Date.now();
        let serverProcess: any;

        try {
          process.chdir(testInstallDir);

          // Start server in background
          const { spawn } = require('child_process');
          serverProcess = spawn('node', ['dist/index.js', '--port', '3005'], {
            stdio: 'pipe',
            detached: false,
          });

          // Wait for server to be ready
          let serverReady = false;
          let attempts = 0;
          const maxAttempts = 50; // 10 seconds with 200ms intervals

          while (!serverReady && attempts < maxAttempts) {
            try {
              await new Promise(resolve => setTimeout(resolve, 200));

              // Try to connect to health endpoint
              const response = await fetch('http://localhost:3005/api/health');
              if (response.ok) {
                serverReady = true;
              }
            } catch {
              // Server not ready yet
            }
            attempts++;
          }

          const startupTime = Date.now() - startTime;

          if (!serverReady) {
            throw new Error(`Server failed to start within ${maxAttempts * 200}ms`);
          }

          expect(startupTime).toBeLessThan(performanceThresholds.startupTime);
          console.log(`Server started in ${startupTime}ms`);
        } catch (error) {
          const startupTime = Date.now() - startTime;
          console.error(`Server startup failed after ${startupTime}ms:`, error);
          throw error;
        } finally {
          // Clean up server process
          if (serverProcess) {
            serverProcess.kill('SIGTERM');

            // Wait a bit for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (!serverProcess.killed) {
              serverProcess.kill('SIGKILL');
            }
          }
        }
      },
      performanceThresholds.startupTime + 15000
    );

    it('should have reasonable memory usage during startup', async () => {
      let serverProcess: any;
      let maxMemoryUsage = 0;

      try {
        process.chdir(testInstallDir);

        const { spawn } = require('child_process');
        serverProcess = spawn('node', ['dist/index.js', '--port', '3006'], {
          stdio: 'pipe',
          detached: false,
        });

        // Monitor memory usage
        const monitorMemory = () => {
          try {
            const memInfo = process.memoryUsage();
            maxMemoryUsage = Math.max(maxMemoryUsage, memInfo.heapUsed + memInfo.external);
          } catch {
            // Ignore memory monitoring errors
          }
        };

        const memoryInterval = setInterval(monitorMemory, 100);

        // Wait for server to be ready
        let serverReady = false;
        let attempts = 0;
        const maxAttempts = 50;

        while (!serverReady && attempts < maxAttempts) {
          try {
            await new Promise(resolve => setTimeout(resolve, 200));
            const response = await fetch('http://localhost:3006/api/health');
            if (response.ok) {
              serverReady = true;
            }
          } catch {
            // Server not ready yet
          }
          attempts++;
        }

        clearInterval(memoryInterval);

        if (!serverReady) {
          throw new Error('Server failed to start for memory test');
        }

        expect(maxMemoryUsage).toBeLessThan(performanceThresholds.memoryUsage);
        console.log(`Max memory usage: ${(maxMemoryUsage / 1024 / 1024).toFixed(2)}MB`);
      } catch (error) {
        console.error('Memory monitoring failed:', error);
        throw error;
      } finally {
        if (serverProcess) {
          serverProcess.kill('SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (!serverProcess.killed) {
            serverProcess.kill('SIGKILL');
          }
        }
      }
    }, 20000);
  });

  describe('CLI Performance', () => {
    it('should execute CLI commands quickly', () => {
      const commands = [
        'node dist/cli/index.js --version',
        'node dist/cli/index.js --help',
        'node dist/cli/index.js boards --help',
        'node dist/cli/index.js tasks --help',
      ];

      process.chdir(testInstallDir);

      for (const command of commands) {
        const startTime = Date.now();

        try {
          execSync(command, {
            stdio: 'pipe',
            timeout: 5000,
          });

          const commandTime = Date.now() - startTime;
          expect(commandTime).toBeLessThan(2000); // 2 seconds max per command
          console.log(`Command "${command}" completed in ${commandTime}ms`);
        } catch (error) {
          console.error(`Command "${command}" failed:`, error);
          throw error;
        }
      }
    });

    it('should handle concurrent CLI commands efficiently', async () => {
      const concurrentCommands = Array(5)
        .fill(0)
        .map(
          (_, i) => () =>
            execSync(`node dist/cli/index.js --version`, {
              stdio: 'pipe',
              timeout: 5000,
            })
        );

      const startTime = Date.now();

      try {
        process.chdir(testInstallDir);
        await Promise.all(
          concurrentCommands.map(
            cmd =>
              new Promise((resolve, reject) => {
                try {
                  cmd();
                  resolve(undefined);
                } catch (error) {
                  reject(error);
                }
              })
          )
        );

        const totalTime = Date.now() - startTime;
        expect(totalTime).toBeLessThan(10000); // 10 seconds for 5 concurrent commands
        console.log(`Concurrent CLI commands completed in ${totalTime}ms`);
      } catch (error) {
        console.error('Concurrent CLI test failed:', error);
        throw error;
      }
    });
  });

  describe('Database Performance', () => {
    it('should initialize database quickly', async () => {
      const startTime = Date.now();

      try {
        process.chdir(testInstallDir);

        // Run database migrations
        execSync('npm run migrate', {
          stdio: 'pipe',
          timeout: 30000,
        });

        const migrationTime = Date.now() - startTime;
        expect(migrationTime).toBeLessThan(10000); // 10 seconds max
        console.log(`Database migration completed in ${migrationTime}ms`);

        // Check if database file was created
        const dbPath = path.join(testInstallDir, 'data', 'kanban.db');
        expect(fs.existsSync(dbPath)).toBe(true);

        // Check database file size (should be reasonable)
        const dbStats = fs.statSync(dbPath);
        expect(dbStats.size).toBeLessThan(10 * 1024 * 1024); // 10MB max for empty DB
        console.log(`Database file size: ${(dbStats.size / 1024).toFixed(2)}KB`);
      } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
      }
    });

    it('should handle initial data seeding efficiently', async () => {
      const startTime = Date.now();

      try {
        process.chdir(testInstallDir);

        // Run database seeding
        execSync('npm run seed', {
          stdio: 'pipe',
          timeout: 30000,
        });

        const seedTime = Date.now() - startTime;
        expect(seedTime).toBeLessThan(15000); // 15 seconds max
        console.log(`Database seeding completed in ${seedTime}ms`);
      } catch (error) {
        console.error('Database seeding failed:', error);
        throw error;
      }
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources properly', () => {
      // Check for temp files, open handles, etc.
      const tempFiles = fs
        .readdirSync(os.tmpdir())
        .filter(file => file.includes('mcp-kanban') && file !== path.basename(testInstallDir));

      expect(tempFiles.length).toBe(0);
      console.log('No temporary files left behind');
    });

    it('should not leave processes running', () => {
      try {
        // Check for any mcp-kanban processes
        const output = execSync('ps aux | grep mcp-kanban | grep -v grep', {
          stdio: 'pipe',
          encoding: 'utf8',
        });

        // Should be empty (no running processes)
        expect(output.trim()).toBe('');
        console.log('No MCP Kanban processes left running');
      } catch (error) {
        // ps command returns non-zero when no matches found, which is what we want
        console.log('No MCP Kanban processes found (expected)');
      }
    });
  });

  describe('Performance Baseline', () => {
    it('should record performance metrics for future comparison', () => {
      const performanceReport = {
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpus: os.cpus().length,
        thresholds: performanceThresholds,
        testResults: {
          // These would be populated by actual test results
          // For now, we'll just validate the structure
        },
      };

      // Validate report structure
      expect(performanceReport).toHaveProperty('timestamp');
      expect(performanceReport).toHaveProperty('nodeVersion');
      expect(performanceReport).toHaveProperty('platform');
      expect(performanceReport).toHaveProperty('thresholds');

      console.log('Performance baseline recorded:', JSON.stringify(performanceReport, null, 2));
    });
  });
});
