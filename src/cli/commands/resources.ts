/**
 * @fileoverview Resource monitoring CLI commands
 * @lastmodified 2025-07-28T17:45:00Z
 *
 * Features: Memory monitoring, resource alerts, usage statistics
 * Main APIs: registerResourceCommands() - registers resource monitoring CLI
 * Constraints: Requires resource monitor, handles real-time monitoring
 * Patterns: Real-time monitoring, threshold alerts, formatted output
 */

import type { Command } from 'commander';
import type { CliComponents } from '../types';
import { withErrorHandling, formatOutput } from '../utils/command-helpers';
import {
  resourceMonitor,
  getMemoryUsage,
  initializeResourceMonitoring,
  type ResourceMonitorConfig,
} from '../../utils/resource-monitor';
import { logger } from '../../utils/logger';

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format duration in milliseconds to human readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Register resource monitoring commands
 */
export function registerResourceCommands(program: Command): void {
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  const resourceCmd = program
    .command('resources')
    .alias('res')
    .description('Monitor system resources and memory usage');

  // Show current resource usage
  resourceCmd
    .command('status')
    .alias('st')
    .description('Show current resource usage')
    .option('--detailed', 'show detailed resource information')
    .action(
      withErrorHandling('show resource status', async (options: { detailed?: boolean } = {}) => {
        const { formatter } = getComponents();

        const stats = resourceMonitor.getCurrentStats();
        const summary = resourceMonitor.getSummary();

        if (options.detailed) {
          formatOutput(
            {
              memory: {
                rss: formatBytes(stats.memory.rss),
                heap: `${formatBytes(stats.memory.heapUsed)} / ${formatBytes(stats.memory.heapTotal)} (${stats.memory.heapUtilization.toFixed(1)}%)`,
                external: formatBytes(stats.memory.external),
                arrayBuffers: formatBytes(stats.memory.arrayBuffers),
              },
              cpu: {
                utilization: `${stats.cpu.utilization.toFixed(2)}%`,
                user: formatDuration(stats.cpu.user / 1000),
                system: formatDuration(stats.cpu.system / 1000),
              },
              system: {
                uptime: formatDuration(stats.uptime * 1000),
                eventLoopDelay: `${stats.eventLoopDelay.toFixed(2)}ms`,
                activeHandles: stats.activeHandles,
                activeRequests: stats.activeRequests,
              },
              trend: {
                memory: summary.memoryTrend,
                historySize: summary.current ? resourceMonitor.getHistory().length : 0,
              },
            },
            {
              title: '🖥️  System Resources (Detailed)',
            }
          );
        } else {
          const memUsage = getMemoryUsage();
          formatOutput(
            [
              {
                metric: 'Memory (RSS)',
                value: memUsage.rss,
                status: stats.memory.rss > 512 * 1024 * 1024 ? '⚠️' : '✅',
              },
              {
                metric: 'Heap Usage',
                value: memUsage.heap,
                status: stats.memory.heapUtilization > 90 ? '⚠️' : '✅',
              },
              {
                metric: 'CPU Usage',
                value: `${stats.cpu.utilization.toFixed(1)}%`,
                status: stats.cpu.utilization > 80 ? '⚠️' : '✅',
              },
              { metric: 'Uptime', value: formatDuration(stats.uptime * 1000), status: '📊' },
              {
                metric: 'Event Loop Delay',
                value: `${stats.eventLoopDelay.toFixed(1)}ms`,
                status: stats.eventLoopDelay > 100 ? '⚠️' : '✅',
              },
            ],
            {
              fields: ['status', 'metric', 'value'],
              headers: ['', 'Metric', 'Value'],
              title: '🖥️  Resource Usage Summary',
            }
          );
        }
      })
    );

  // Show resource usage history and trends
  resourceCmd
    .command('history')
    .alias('hist')
    .description('Show resource usage history and trends')
    .option('-l, --limit <number>', 'limit number of history entries', '20')
    .action(
      withErrorHandling('show resource history', async (options: { limit?: string } = {}) => {
        const limit = Math.min(parseInt(options.limit ?? '20', 10), 100);
        const history = resourceMonitor.getHistory().slice(-limit);
        const summary = resourceMonitor.getSummary();

        if (history.length === 0) {
          formatOutput(
            'No resource history available. Start monitoring first with: resources monitor'
          );
          return;
        }

        // Show trend summary
        formatOutput(
          {
            summary: {
              memoryTrend: summary.memoryTrend,
              averageMemory: formatBytes(summary.average.memory?.heapUsed ?? 0),
              peakMemory: formatBytes(summary.peak.memory?.heapUsed ?? 0),
              averageCpu: `${(summary.average.cpu?.utilization ?? 0).toFixed(1)}%`,
              peakCpu: `${(summary.peak.cpu?.utilization ?? 0).toFixed(1)}%`,
              historyEntries: history.length,
            },
          },
          {
            title: '📈 Resource Usage Trends',
          }
        );

        // Show recent history
        const historyData = history.map((stat, index) => ({
          time: stat.memory.timestamp.toLocaleTimeString(),
          memory: formatBytes(stat.memory.heapUsed),
          heap: `${stat.memory.heapUtilization.toFixed(1)}%`,
          cpu: `${stat.cpu.utilization.toFixed(1)}%`,
          eventLoop: `${stat.eventLoopDelay.toFixed(1)}ms`,
        }));

        formatOutput(historyData, {
          fields: ['time', 'memory', 'heap', 'cpu', 'eventLoop'],
          headers: ['Time', 'Memory', 'Heap %', 'CPU %', 'Event Loop'],
          title: `📊 Recent History (last ${history.length} entries)`,
        });
      })
    );

  // Start resource monitoring
  resourceCmd
    .command('monitor')
    .alias('mon')
    .description('Start resource monitoring with alerts')
    .option('--memory-threshold <mb>', 'memory threshold in MB', '512')
    .option('--cpu-threshold <percent>', 'CPU threshold percentage', '80')
    .option('--heap-threshold <percent>', 'heap threshold percentage', '90')
    .option('--interval <ms>', 'monitoring interval in milliseconds', '5000')
    .option('--enable-logging', 'enable periodic logging')
    .option('--no-alerts', 'disable threshold alerts')
    .action(
      withErrorHandling(
        'start resource monitoring',
        async (
          options: {
            memoryThreshold?: string;
            cpuThreshold?: string;
            heapThreshold?: string;
            interval?: string;
            enableLogging?: boolean;
            alerts?: boolean;
          } = {}
        ) => {
          const { formatter } = getComponents();

          const config: ResourceMonitorConfig = {
            memoryThreshold: parseInt(options.memoryThreshold ?? '512', 10),
            cpuThreshold: parseInt(options.cpuThreshold ?? '80', 10),
            heapThreshold: parseInt(options.heapThreshold ?? '90', 10),
            monitoringInterval: parseInt(options.interval ?? '5000', 10),
            enableLogging: options.enableLogging ?? false,
            enableAlerts: options.alerts !== false,
          };

          // Set up alert handlers
          resourceMonitor.removeAllListeners();

          if (config.enableAlerts) {
            resourceMonitor.on('memory-threshold', stats => {
              formatter.warn(`🚨 Memory threshold exceeded: ${formatBytes(Number(stats.rss))}`);
            });

            resourceMonitor.on('cpu-threshold', stats => {
              formatter.warn(`🚨 CPU threshold exceeded: ${stats.utilization.toFixed(2)}%`);
            });

            resourceMonitor.on('heap-threshold', stats => {
              formatter.warn(`🚨 Heap threshold exceeded: ${stats.heapUtilization.toFixed(1)}%`);
            });

            resourceMonitor.on('memory-leak-detected', () => {
              formatter.error(
                '🚨 Potential memory leak detected! Check application for memory leaks.'
              );
            });
          }

          initializeResourceMonitoring(config);

          formatter.success('✅ Resource monitoring started');
          formatOutput(
            {
              configuration: {
                memoryThreshold: `${config.memoryThreshold}MB`,
                cpuThreshold: `${config.cpuThreshold}%`,
                heapThreshold: `${config.heapThreshold}%`,
                interval: `${config.monitoringInterval}ms`,
                alerts: config.enableAlerts ? 'Enabled' : 'Disabled',
                logging: config.enableLogging ? 'Enabled' : 'Disabled',
              },
            },
            {
              title: '⚙️  Monitoring Configuration',
            }
          );

          formatter.info('Use "resources status" to check current usage');
          formatter.info('Use "resources stop" to stop monitoring');
        }
      )
    );

  // Stop resource monitoring
  resourceCmd
    .command('stop')
    .description('Stop resource monitoring')
    .action(
      withErrorHandling('stop resource monitoring', async () => {
        const { formatter } = getComponents();

        resourceMonitor.stop();
        formatter.success('✅ Resource monitoring stopped');
      })
    );

  // Force garbage collection
  resourceCmd
    .command('gc')
    .description('Force garbage collection (requires --expose-gc)')
    .action(
      withErrorHandling('force garbage collection', async () => {
        const { formatter } = getComponents();

        const beforeStats = resourceMonitor.getMemoryStats();
        const afterStats = resourceMonitor.forceGarbageCollection();

        if (!afterStats) {
          formatter.error('Garbage collection not available. Run Node.js with --expose-gc flag.');
          return;
        }

        const freed = beforeStats.heapUsed - afterStats.heapUsed;
        const freedMB = freed / 1024 / 1024;

        formatOutput(
          {
            garbageCollection: {
              beforeHeap: formatBytes(beforeStats.heapUsed),
              afterHeap: formatBytes(afterStats.heapUsed),
              freedMemory: formatBytes(freed),
              reduction: `${((freed / beforeStats.heapUsed) * 100).toFixed(2)}%`,
              newUtilization: `${afterStats.heapUtilization.toFixed(1)}%`,
            },
          },
          {
            title: `🗑️  Garbage Collection Results${freedMB > 0 ? ` (${freedMB.toFixed(2)}MB freed)` : ''}`,
          }
        );
      })
    );

  // Show resource configuration
  resourceCmd
    .command('config')
    .description('Show current monitoring configuration')
    .action(
      withErrorHandling('show resource config', async () => {
        const { config } = resourceMonitor;

        formatOutput(
          {
            monitoring: {
              status: resourceMonitor.isMonitoring() ? 'Running' : 'Stopped',
              interval: `${config.monitoringInterval}ms`,
              historySize: config.historySize,
            },
            thresholds: {
              memory: `${config.memoryThreshold}MB`,
              cpu: `${config.cpuThreshold}%`,
              heap: `${config.heapThreshold}%`,
            },
            features: {
              alerts: config.enableAlerts ? 'Enabled' : 'Disabled',
              logging: config.enableLogging ? 'Enabled' : 'Disabled',
            },
          },
          {
            title: '⚙️  Resource Monitor Configuration',
          }
        );
      })
    );

  // Resource alerts dashboard (real-time)
  resourceCmd
    .command('dashboard')
    .alias('dash')
    .description('Show real-time resource dashboard')
    .option('--refresh <seconds>', 'refresh interval in seconds', '2')
    .action(
      withErrorHandling('show resource dashboard', async (options: { refresh?: string } = {}) => {
        const { formatter } = getComponents();
        const refreshInterval = Math.max(1, parseInt(options.refresh ?? '2', 10)) * 1000;

        formatter.info('📊 Resource Dashboard (Press Ctrl+C to exit)');
        formatter.info(`Refresh interval: ${refreshInterval / 1000}s`);

        let isRunning = true;

        const updateDashboard = () => {
          if (!isRunning) return;

          // Clear screen (basic implementation)
          process.stdout.write('\x1Bc');

          const stats = resourceMonitor.getCurrentStats();
          const summary = resourceMonitor.getSummary();
          const memUsage = getMemoryUsage();

          process.stdout.write('📊 Real-time Resource Dashboard\n');
          process.stdout.write(`${'='.repeat(50)}\n`);
          process.stdout.write(`Last updated: ${new Date().toLocaleTimeString()}\n`);
          process.stdout.write('\n');

          // Current usage
          process.stdout.write('🖥️  Current Usage:\n');
          process.stdout.write(`  Memory (RSS): ${memUsage.rss}\n`);
          process.stdout.write(
            `  Heap Usage:   ${memUsage.heap} (${stats.memory.heapUtilization.toFixed(1)}%)\n`
          );
          process.stdout.write(`  CPU Usage:    ${stats.cpu.utilization.toFixed(2)}%\n`);
          process.stdout.write(`  Event Loop:   ${stats.eventLoopDelay.toFixed(1)}ms\n`);
          process.stdout.write(`  Uptime:       ${formatDuration(stats.uptime * 1000)}\n`);
          process.stdout.write('\n');

          // Trends
          process.stdout.write('📈 Trends:\n');
          process.stdout.write(`  Memory Trend: ${summary.memoryTrend}\n`);
          process.stdout.write(`  History Size: ${resourceMonitor.getHistory().length} entries\n`);
          process.stdout.write('\n');

          // Status indicators
          const memoryStatus = stats.memory.rss > 512 * 1024 * 1024 ? '🔴' : '🟢';
          const cpuStatus = stats.cpu.utilization > 80 ? '🔴' : '🟢';
          const heapStatus = stats.memory.heapUtilization > 90 ? '🔴' : '🟢';

          process.stdout.write('🚦 Status:\n');
          process.stdout.write(`  ${memoryStatus} Memory  ${cpuStatus} CPU  ${heapStatus} Heap\n`);
          process.stdout.write('\n');
          process.stdout.write('Press Ctrl+C to exit dashboard\n');
        };

        updateDashboard();
        const dashboardTimer = setInterval(updateDashboard, refreshInterval);

        // Handle exit
        process.on('SIGINT', () => {
          isRunning = false;
          clearInterval(dashboardTimer);
          formatter.info('\n\n📊 Dashboard stopped');
          process.exit(0);
        });
      })
    );
}
