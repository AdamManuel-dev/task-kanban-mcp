/**
 * Performance Regression Detection Suite
 *
 * Establishes performance baselines and detects regressions in key operations.
 * This test suite maintains historical performance data and alerts when
 * performance degrades beyond acceptable thresholds.
 */

import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '@/server';
import { dbConnection } from '@/database/connection';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

interface PerformanceBaseline {
  operation: string;
  avgTime: number;
  maxTime: number;
  samples: number;
  timestamp: string;
  version: string;
}

interface PerformanceReport {
  baselines: PerformanceBaseline[];
  lastUpdated: string;
}

describe('Performance Regression Detection', () => {
  let app: Express;
  let apiKey: string;
  let testBoard: any;
  let testColumnId: string;

  const PERFORMANCE_DATA_FILE = path.join(__dirname, '../../performance-baselines.json');
  const REGRESSION_THRESHOLD = 1.5; // 50% performance degradation threshold
  const WARNING_THRESHOLD = 1.2; // 20% performance degradation warning

  beforeAll(async () => {
    // Initialize database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Create Express app
    app = await createServer();
    apiKey = 'dev-key-1';

    // Create test board
    const boardId = uuidv4();
    await dbConnection.execute(
      'INSERT INTO boards (id, name, description, created_at) VALUES (?, ?, ?, ?)',
      [boardId, 'Regression Test Board', 'Board for regression testing', new Date().toISOString()]
    );

    testBoard = {
      id: boardId,
      name: 'Regression Test Board',
      description: 'Board for regression testing',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Create test column
    testColumnId = uuidv4();
    await dbConnection.execute(
      'INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
      [testColumnId, boardId, 'To Do', 0, new Date().toISOString()]
    );

    // Seed test data
    await seedTestData(100);
  }, 30000);

  afterAll(async () => {
    await dbConnection.close();
  });

  async function seedTestData(count: number): Promise<void> {
    await dbConnection.transaction(async () => {
      for (let i = 0; i < count; i++) {
        await dbConnection.execute(
          `INSERT INTO tasks (id, title, description, board_id, column_id, status, priority, position, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            `Regression Test Task ${i + 1}`,
            `Description for regression test task ${i + 1}`,
            testBoard.id,
            testColumnId,
            ['todo', 'in_progress', 'done'][Math.floor(Math.random() * 3)],
            Math.floor(Math.random() * 10),
            i,
            new Date().toISOString(),
          ]
        );
      }
    });
  }

  function loadPerformanceBaselines(): PerformanceReport {
    try {
      if (fs.existsSync(PERFORMANCE_DATA_FILE)) {
        const data = fs.readFileSync(PERFORMANCE_DATA_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('Could not load performance baselines:', error);
    }

    return {
      baselines: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  function savePerformanceBaselines(report: PerformanceReport): void {
    try {
      const dir = path.dirname(PERFORMANCE_DATA_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(PERFORMANCE_DATA_FILE, JSON.stringify(report, null, 2));
    } catch (error) {
      console.warn('Could not save performance baselines:', error);
    }
  }

  function findBaseline(
    operation: string,
    baselines: PerformanceBaseline[]
  ): PerformanceBaseline | undefined {
    return baselines.find(b => b.operation === operation);
  }

  async function measureOperation(
    operation: string,
    testFunction: () => Promise<void>,
    samples: number = 10
  ): Promise<{ avgTime: number; maxTime: number; minTime: number; samples: number }> {
    const times: number[] = [];

    for (let i = 0; i < samples; i++) {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      times.push(duration);
    }

    return {
      avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      maxTime: Math.max(...times),
      minTime: Math.min(...times),
      samples,
    };
  }

  function checkRegression(
    operation: string,
    currentMetrics: { avgTime: number; maxTime: number },
    baseline: PerformanceBaseline
  ): { isRegression: boolean; isWarning: boolean; factor: number } {
    const avgFactor = currentMetrics.avgTime / baseline.avgTime;
    const maxFactor = currentMetrics.maxTime / baseline.maxTime;
    const worstFactor = Math.max(avgFactor, maxFactor);

    return {
      isRegression: worstFactor > REGRESSION_THRESHOLD,
      isWarning: worstFactor > WARNING_THRESHOLD,
      factor: worstFactor,
    };
  }

  const performanceTests = [
    {
      name: 'api_task_list_10',
      description: 'GET /api/v1/tasks with limit 10',
      test: async () => {
        await request(app)
          .get('/api/v1/tasks')
          .set('X-API-Key', apiKey)
          .query({ limit: 10 })
          .expect(200);
      },
    },
    {
      name: 'api_task_create',
      description: 'POST /api/v1/tasks',
      test: async () => {
        await request(app)
          .post('/api/v1/tasks')
          .set('X-API-Key', apiKey)
          .send({
            title: `Regression Test Task ${Date.now()}`,
            description: 'Created for regression testing',
            board_id: testBoard.id,
            column_id: testColumnId,
            status: 'todo',
            priority: 5,
          })
          .expect(201);
      },
    },
    {
      name: 'api_task_search',
      description: 'GET /api/v1/tasks with search query',
      test: async () => {
        await request(app)
          .get('/api/v1/tasks')
          .set('X-API-Key', apiKey)
          .query({ search: 'test', limit: 20 })
          .expect(200);
      },
    },
    {
      name: 'database_bulk_query',
      description: 'Database bulk select query',
      test: async () => {
        await dbConnection.query(
          'SELECT id, title, status, priority FROM tasks WHERE board_id = ? LIMIT 50',
          [testBoard.id]
        );
      },
    },
    {
      name: 'database_join_query',
      description: 'Database JOIN query with aggregation',
      test: async () => {
        await dbConnection.query(
          `
          SELECT t.id, t.title, t.status, t.priority, 
                 b.name as board_name, 
                 c.name as column_name
          FROM tasks t
          LEFT JOIN boards b ON t.board_id = b.id
          LEFT JOIN columns c ON t.column_id = c.id
          WHERE t.board_id = ?
          ORDER BY t.priority DESC, t.created_at DESC
          LIMIT 30
        `,
          [testBoard.id]
        );
      },
    },
  ];

  describe('Baseline Performance Tests', () => {
    performanceTests.forEach(({ name, description, test }) => {
      it(`should maintain performance baseline for ${description}`, async () => {
        const report = loadPerformanceBaselines();
        const baseline = findBaseline(name, report.baselines);

        console.log(`\n📊 Testing: ${description}`);

        // Measure current performance
        const metrics = await measureOperation(name, test, 10);

        console.log(
          `Current: avg ${Math.round(metrics.avgTime)}ms, max ${metrics.maxTime}ms, min ${metrics.minTime}ms`
        );

        if (baseline) {
          console.log(`Baseline: avg ${Math.round(baseline.avgTime)}ms, max ${baseline.maxTime}ms`);

          const regression = checkRegression(name, metrics, baseline);

          if (regression.isRegression) {
            console.error(`🚨 PERFORMANCE REGRESSION DETECTED!`);
            console.error(`Operation: ${description}`);
            console.error(`Performance degraded by ${Math.round((regression.factor - 1) * 100)}%`);
            console.error(
              `Current avg: ${Math.round(metrics.avgTime)}ms vs Baseline avg: ${Math.round(baseline.avgTime)}ms`
            );

            // This should fail the test to alert developers
            expect(regression.factor).toBeLessThanOrEqual(REGRESSION_THRESHOLD);
          } else if (regression.isWarning) {
            console.warn(`⚠️  Performance warning for ${description}`);
            console.warn(`Performance degraded by ${Math.round((regression.factor - 1) * 100)}%`);
            console.warn(
              `Current avg: ${Math.round(metrics.avgTime)}ms vs Baseline avg: ${Math.round(baseline.avgTime)}ms`
            );
          } else {
            console.log(
              `✅ Performance within acceptable range (${Math.round((regression.factor - 1) * 100)}% change)`
            );
          }
        } else {
          console.log(`📝 No baseline found, establishing new baseline for ${description}`);
        }

        // Update baseline (only if performance improved or if no baseline exists)
        if (!baseline || metrics.avgTime < baseline.avgTime) {
          const newBaseline: PerformanceBaseline = {
            operation: name,
            avgTime: metrics.avgTime,
            maxTime: metrics.maxTime,
            samples: metrics.samples,
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '0.1.0',
          };

          // Update or add baseline
          const existingIndex = report.baselines.findIndex(b => b.operation === name);
          if (existingIndex >= 0) {
            report.baselines[existingIndex] = newBaseline;
            console.log(`📈 Updated baseline (performance improved)`);
          } else {
            report.baselines.push(newBaseline);
            console.log(`📝 Created new baseline`);
          }

          report.lastUpdated = new Date().toISOString();
          savePerformanceBaselines(report);
        }

        // Basic performance assertions (regardless of baseline)
        expect(metrics.avgTime).toBeLessThan(2000); // No operation should take longer than 2 seconds on average
        expect(metrics.maxTime).toBeLessThan(5000); // No single operation should take longer than 5 seconds
      });
    });
  });

  describe('Performance Monitoring', () => {
    it('should generate performance report', async () => {
      const report = loadPerformanceBaselines();

      console.log('\n📈 Performance Baseline Report');
      console.log('================================');

      if (report.baselines.length === 0) {
        console.log('No baselines established yet');
        return;
      }

      console.log(`Last updated: ${new Date(report.lastUpdated).toLocaleString()}`);
      console.log(`Total operations tracked: ${report.baselines.length}`);
      console.log('');

      const sortedBaselines = report.baselines.sort((a, b) => a.avgTime - b.avgTime);

      console.log('Operation Performance Summary:');
      console.log('-'.repeat(80));
      console.log(
        `${
          'Operation'.padEnd(30) +
          'Avg Time'.padEnd(12) +
          'Max Time'.padEnd(12) +
          'Samples'.padEnd(10)
        }Last Updated`
      );
      console.log('-'.repeat(80));

      sortedBaselines.forEach(baseline => {
        const operation = baseline.operation.padEnd(30);
        const avgTime = `${Math.round(baseline.avgTime)}ms`.padEnd(12);
        const maxTime = `${baseline.maxTime}ms`.padEnd(12);
        const samples = `${baseline.samples}`.padEnd(10);
        const lastUpdated = new Date(baseline.timestamp).toLocaleDateString();

        console.log(`${operation}${avgTime}${maxTime}${samples}${lastUpdated}`);
      });

      // Performance health check
      const slowOperations = sortedBaselines.filter(b => b.avgTime > 1000);
      const verySlowOperations = sortedBaselines.filter(b => b.avgTime > 2000);

      console.log('\nPerformance Health Summary:');
      console.log(`✅ Fast operations (< 1s): ${sortedBaselines.length - slowOperations.length}`);
      console.log(
        `⚠️  Slow operations (1-2s): ${slowOperations.length - verySlowOperations.length}`
      );
      console.log(`🚨 Very slow operations (> 2s): ${verySlowOperations.length}`);

      if (verySlowOperations.length > 0) {
        console.log('\nOperations needing optimization:');
        verySlowOperations.forEach(op => {
          console.log(`  - ${op.operation}: ${Math.round(op.avgTime)}ms average`);
        });
      }

      expect(verySlowOperations.length).toBe(0); // No operations should be very slow
    });

    it('should detect memory leaks in baseline operations', async () => {
      const initialMemory = process.memoryUsage();

      // Run each baseline operation multiple times
      for (const { name, test } of performanceTests) {
        for (let i = 0; i < 20; i++) {
          await test();
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory usage after baseline operations:`);
      console.log(`  Initial: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);
      console.log(`  Final: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
      console.log(`  Increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);

      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    }, 30000);
  });

  describe('Stress Test Thresholds', () => {
    it('should handle sustained load without degradation', async () => {
      const sustainedOperations = 50;
      const operationTimes: number[] = [];

      console.log(`\n🏋️  Running sustained load test (${sustainedOperations} operations)`);

      for (let i = 0; i < sustainedOperations; i++) {
        const startTime = Date.now();

        await request(app)
          .get('/api/v1/tasks')
          .set('X-API-Key', apiKey)
          .query({ limit: 10 })
          .expect(200);

        const duration = Date.now() - startTime;
        operationTimes.push(duration);

        // Brief pause to simulate realistic usage
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Analyze performance over time
      const firstHalf = operationTimes.slice(0, Math.floor(sustainedOperations / 2));
      const secondHalf = operationTimes.slice(Math.floor(sustainedOperations / 2));

      const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      const performanceDegradation = secondHalfAvg / firstHalfAvg;

      console.log(`First half average: ${Math.round(firstHalfAvg)}ms`);
      console.log(`Second half average: ${Math.round(secondHalfAvg)}ms`);
      console.log(`Performance change: ${Math.round((performanceDegradation - 1) * 100)}%`);

      // Performance should not degrade significantly under sustained load
      expect(performanceDegradation).toBeLessThan(1.3); // Less than 30% degradation
    }, 20000);
  });
});
