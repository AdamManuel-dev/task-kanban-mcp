/**
 * @fileoverview Performance monitoring CLI commands
 * @lastmodified 2025-07-28T17:00:00Z
 *
 * Features: CLI interface for performance monitoring and metrics
 * Main APIs: registerPerformanceCommands() - performance command registration
 * Constraints: Requires performance monitoring utilities
 * Patterns: Metrics display, performance analysis, system monitoring
 */

import type { Command } from 'commander';
import type { CliComponents } from '../types';
import {
  formatPerformanceReport,
  getPerformanceSummary,
  resetPerformanceData,
} from '../utils/performance-helpers';
import { performanceMonitor, quickBenchmark } from '../../utils/performance';
import { withErrorHandling, formatOutput, confirmAction } from '../utils/command-helpers';

/**
 * Register performance monitoring commands
 */
export function registerPerformanceCommands(program: Command): void {
  const perfCmd = program
    .command('perf')
    .alias('performance')
    .description('Performance monitoring and analysis');

  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  // Show performance report
  perfCmd
    .command('report')
    .alias('status')
    .description('Show performance report')
    .option('--json', 'output as JSON')
    .option('--recent <count>', 'number of recent operations to show', '10')
    .action(
      withErrorHandling(
        'show performance report',
        async (
          options: {
            json?: boolean;
            recent?: string;
          } = {}
        ) => {
          const { formatter } = getComponents();

          if (options.json) {
            const summary = getPerformanceSummary();
            formatOutput(summary);
          } else {
            const report = formatPerformanceReport();
            formatter.info(report);
          }
        }
      )
    );

  // Show detailed statistics
  perfCmd
    .command('stats')
    .description('Show detailed performance statistics')
    .option('--operations', 'show operation breakdown')
    .option('--memory', 'include memory usage information')
    .action(
      withErrorHandling(
        'show performance stats',
        async (
          options: {
            operations?: boolean;
            memory?: boolean;
          } = {}
        ) => {
          const { formatter: _formatter } = getComponents();
          const summary = getPerformanceSummary();
          const { stats } = summary;

          // Basic statistics
          formatOutput(
            {
              totalOperations: stats.totalOperations,
              averageDuration: `${stats.averageDuration.toFixed(2)}ms`,
              slowestOperation: stats.slowestOperation
                ? {
                    name: stats.slowestOperation.operationName,
                    duration: `${stats.slowestOperation.duration.toFixed(2)}ms`,
                    timestamp: stats.slowestOperation.timestamp.toISOString(),
                  }
                : null,
              fastestOperation: stats.fastestOperation
                ? {
                    name: stats.fastestOperation.operationName,
                    duration: `${stats.fastestOperation.duration.toFixed(2)}ms`,
                    timestamp: stats.fastestOperation.timestamp.toISOString(),
                  }
                : null,
            },
            {
              title: '📊 Performance Statistics',
            }
          );

          // Operation breakdown
          if (options.operations) {
            formatOutput(
              Object.entries(stats.operationCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([operation, count]) => ({ operation, count })),
              {
                fields: ['operation', 'count'],
                headers: ['Operation', 'Count'],
                title: '🔧 Operation Breakdown',
              }
            );
          }

          // Memory information
          if (options.memory) {
            const memUsage = process.memoryUsage();
            formatOutput(
              {
                rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
                heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
                heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
                heapUtilization: `${((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)}%`,
              },
              {
                title: '💾 Current Memory Usage',
              }
            );
          }
        }
      )
    );

  // Clear performance data
  perfCmd
    .command('clear')
    .alias('reset')
    .description('Clear performance monitoring data')
    .option('-f, --force', 'skip confirmation')
    .action(
      withErrorHandling(
        'clear performance data',
        async (
          options: {
            force?: boolean;
          } = {}
        ) => {
          if (!options.force) {
            const shouldClear = await confirmAction(
              'Clear all performance monitoring data?',
              false
            );

            if (!shouldClear) {
              formatOutput('Clear cancelled');
              return;
            }
          }

          resetPerformanceData();
          formatOutput('✅ Performance data cleared');
        }
      )
    );

  // Run performance benchmark
  perfCmd
    .command('benchmark [operation]')
    .alias('bench')
    .description('Run performance benchmarks')
    .option('-i, --iterations <count>', 'number of iterations', '10')
    .option('--operation <name>', 'specific operation to benchmark')
    .action(
      withErrorHandling(
        'run performance benchmark',
        async (
          operation?: string,
          options: {
            iterations?: string;
            operation?: string;
          } = {}
        ) => {
          const { formatter, apiClient } = getComponents();
          const iterations = parseInt(options.iterations ?? '10', 10);

          formatter.info(`🏃 Running benchmark with ${iterations} iterations...`);

          // Benchmark different operations
          const benchmarks = [];

          // API call benchmark
          if (!operation || operation === 'api') {
            try {
              const apiResult = await quickBenchmark(
                'api-health-check',
                async () => apiClient.getHealth() || Promise.resolve({}),
                Math.min(iterations, 5) // Limit API calls
              );
              benchmarks.push(apiResult);
            } catch (error) {
              formatter.warn('API benchmark skipped (health check not available)');
            }
          }

          // Memory allocation benchmark
          if (!operation || operation === 'memory') {
            const memoryResult = await quickBenchmark(
              'memory-allocation',
              () => {
                const arr = new Array(10000).fill(0).map((_, i) => ({ id: i, data: 'test' }));
                return arr.length;
              },
              iterations
            );
            benchmarks.push(memoryResult);
          }

          // JSON parsing benchmark
          if (!operation || operation === 'json') {
            const testData = JSON.stringify({
              tasks: new Array(100).fill(0).map((_, i) => ({
                id: `task_${i}`,
                title: `Task ${i}`,
                status: 'todo',
                priority: Math.floor(Math.random() * 10) + 1,
              })),
            });

            const jsonResult = await quickBenchmark(
              'json-parse',
              () => JSON.parse(testData),
              iterations
            );
            benchmarks.push(jsonResult);
          }

          // Display results
          benchmarks.forEach(benchmark => {
            const { operationName, results } = benchmark;

            formatOutput(
              {
                operation: operationName,
                runs: results.runs,
                min: `${results.min.toFixed(2)}ms`,
                max: `${results.max.toFixed(2)}ms`,
                mean: `${results.mean.toFixed(2)}ms`,
                median: `${results.median.toFixed(2)}ms`,
                stdDev: `${results.stdDev.toFixed(2)}ms`,
              },
              {
                title: `🏁 Benchmark Results: ${operationName}`,
              }
            );
          });
        }
      )
    );

  // Monitor real-time performance
  perfCmd
    .command('monitor')
    .description('Monitor real-time performance (experimental)')
    .option('--interval <seconds>', 'monitoring interval', '5')
    .option('--duration <seconds>', 'monitoring duration', '30')
    .action(
      withErrorHandling(
        'monitor performance',
        async (
          options: {
            interval?: string;
            duration?: string;
          } = {}
        ) => {
          const { formatter } = getComponents();
          const interval = parseInt(options.interval ?? '5', 10) * 1000;
          const duration = parseInt(options.duration ?? '30', 10) * 1000;

          formatter.info(
            `🔍 Monitoring performance for ${duration / 1000}s (interval: ${interval / 1000}s)`
          );

          const startTime = Date.now();
          const monitoringData: Array<{
            timestamp: string;
            memory: NodeJS.MemoryUsage;
            operationCount: number;
          }> = [];

          const monitorInterval = setInterval(() => {
            const currentTime = Date.now();
            if (currentTime - startTime >= duration) {
              clearInterval(monitorInterval);

              // Display monitoring results
              formatOutput(
                monitoringData.map(data => ({
                  time: data.timestamp,
                  heapUsed: `${(data.memory.heapUsed / 1024 / 1024).toFixed(1)}MB`,
                  operations: data.operationCount,
                })),
                {
                  fields: ['time', 'heapUsed', 'operations'],
                  headers: ['Time', 'Heap Used', 'Operations'],
                  title: '📈 Performance Monitoring Results',
                }
              );

              formatter.info('✅ Monitoring completed');
              return;
            }

            const stats = performanceMonitor.getStats();
            monitoringData.push({
              timestamp: new Date().toISOString(),
              memory: process.memoryUsage(),
              operationCount: stats.totalOperations,
            });

            formatter.info(
              `📊 Operations: ${stats.totalOperations}, Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`
            );
          }, interval);
        }
      )
    );

  // Enable/disable performance monitoring
  perfCmd
    .command('toggle')
    .description('Enable or disable performance monitoring')
    .option('--enable', 'enable monitoring')
    .option('--disable', 'disable monitoring')
    .action(
      withErrorHandling(
        'toggle performance monitoring',
        async (
          options: {
            enable?: boolean;
            disable?: boolean;
          } = {}
        ) => {
          const { formatter: _formatter } = getComponents();

          if (options.enable) {
            performanceMonitor.setEnabled(true);
            formatOutput('✅ Performance monitoring enabled');
          } else if (options.disable) {
            performanceMonitor.setEnabled(false);
            formatOutput('❌ Performance monitoring disabled');
          } else {
            // Show current status
            const stats = performanceMonitor.getStats();
            formatOutput(
              {
                status: stats.totalOperations > 0 ? 'Enabled' : 'Disabled',
                metrics: stats.totalOperations,
              },
              {
                title: '⚙️ Performance Monitoring Status',
              }
            );
          }
        }
      )
    );
}
