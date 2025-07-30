import { logger } from '@/utils/logger';
import type { Command } from 'commander';
import * as WebSocket from 'ws';
import type { CliComponents } from '../types';

// Utility functions for event formatting (declared first to avoid hoisting issues)
function getEventIcon(eventType: string): string {
  const icons: Record<string, string> = {
    'task:created': '✨',
    'task:updated': '📝',
    'task:moved': '🔄',
    'task:deleted': '🗑️',
    'task:completed': '✅',
    'note:added': '📄',
    'note:updated': '📝',
    'priority:changed': '⚡',
    'dependency:blocked': '🚫',
    'subtask:completed': '✓',
    default: '📋',
  };
  return icons[eventType] ?? icons.default;
}

function getEventColor(_eventType: string): (text: string) => string {
  // This would typically use chalk, but keeping it simple for now
  return (text: string) => text; // In real implementation, apply colors based on event type
}

function formatEventMessage(event: {
  type: string;
  data?: unknown;
  timestamp?: string;
  [key: string]: unknown;
}): string {
  const eventData = event.data as Record<string, unknown> | undefined;

  const getDataProperty = (key: string): string => {
    if (eventData && typeof eventData === 'object' && key in eventData) {
      return String(eventData[key] || 'Unknown');
    }
    return 'Unknown';
  };

  switch (event.type) {
    case 'task:created':
      return `Task "${getDataProperty('title')}" created`;
    case 'task:updated':
      return `Task "${getDataProperty('title')}" updated`;
    case 'task:moved':
      return `Task "${getDataProperty('title')}" moved to ${getDataProperty('columnName')}`;
    case 'task:deleted':
      return `Task "${getDataProperty('title')}" deleted`;
    case 'task:completed':
      return `Task "${getDataProperty('title')}" completed`;
    case 'note:added':
      return `Note "${getDataProperty('title')}" added to task ${getDataProperty('taskId')}`;
    case 'note:updated':
      return `Note "${getDataProperty('title')}" updated`;
    case 'priority:changed':
      return `Task "${getDataProperty('title')}" priority changed to ${getDataProperty('newPriority')}`;
    case 'dependency:blocked':
      return `Task "${getDataProperty('title')}" blocked by dependency`;
    case 'subtask:completed':
      return `Subtask "${getDataProperty('title')}" completed`;
    default:
      return eventData ? JSON.stringify(eventData) : 'Unknown event';
  }
}

export function registerRealtimeCommands(program: Command): void {
  // Get global components with proper typing
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  program
    .command('watch')
    .alias('w')
    .description('Watch for real-time updates')
    .option('-b, --board <id>', 'watch specific board')
    .option('-t, --task <id>', 'watch specific task')
    .option('--events <types>', 'event types to watch (comma-separated)')
    .option('--format <format>', 'output format (json|table|compact)', 'compact')
    .action((options: { board?: string; task?: string; events?: string; format?: string }) => {
      const { config, formatter } = getComponents();

      try {
        const serverUrl = config.getServerUrl();
        const apiKey = config.getApiKey();

        if (!apiKey) {
          formatter.error('API key required. Run "kanban config set api.key <key>"');
          process.exit(1);
        }

        // Convert HTTP URL to WebSocket URL
        const wsUrl = serverUrl.replace(/^https?:\/\//, 'ws://').replace(/^ws:\/\//, 'wss://');
        const wsEndpoint = `${String(wsUrl)}/ws?apiKey=${String(apiKey)}`;

        formatter.info('Connecting to real-time updates...');

        const ws = new WebSocket.WebSocket(wsEndpoint);

        ws.on('open', () => {
          formatter.success('Connected to real-time updates');

          // Subscribe to events based on options
          const subscriptions: Record<string, unknown> = {};

          if (options.board) {
            subscriptions.board = options.board;
          }

          if (options.task) {
            subscriptions.task = options.task;
          }

          if (options.events) {
            subscriptions.events = options.events.split(',').map((e: string) => e.trim());
          }

          // Send subscription message
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              data: subscriptions,
            })
          );

          formatter.info('Watching for updates... (Press Ctrl+C to stop)');
        });

        ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(String(data));

            if (message.type === 'event') {
              const event = message.data;
              const timestamp = new Date().toLocaleTimeString();

              if (options.format === 'json') {
                logger.info(JSON.stringify({ timestamp, ...event }, null, 2));
              } else if (options.format === 'table') {
                formatter.output([{ timestamp, ...event }]);
              } else {
                // Compact format
                const icon = getEventIcon(String(event?.type || 'unknown'));
                const color = getEventColor(String(event?.type || 'unknown'));
                const eventMessage =
                  event?.message ||
                  formatEventMessage({
                    type: String(event?.type || 'unknown'),
                    data: event,
                    timestamp,
                  });
                logger.info(
                  `${timestamp} ${icon} ${color(String(event?.type || 'unknown'))}: ${String(eventMessage)}`
                );
              }
            } else if (message.type === 'error') {
              const errorData = message.data;
              formatter.error(`WebSocket error: ${String(errorData?.message || 'Unknown error')}`);
            }
          } catch (error) {
            formatter.warn(`Failed to parse message: ${String(data)}`);
          }
        });

        ws.on('error', (error: Error) => {
          formatter.error(`WebSocket error: ${String(error.message)}`);
          process.exit(1);
        });

        ws.on('close', (code: number, reason: Buffer) => {
          if (code === 1000) {
            formatter.info('Connection closed normally');
          } else {
            formatter.error(`Connection closed: ${String(code)} ${String(reason)}`);
            process.exit(1);
          }
        });

        // Handle graceful shutdown
        process.on('SIGINT', () => {
          formatter.info('\nClosing connection...');
          ws.close();
          process.exit(0);
        });
      } catch (error) {
        formatter.error(
          `Failed to start watching: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });

  program
    .command('logs')
    .description('View system logs')
    .option('-f, --follow', 'follow log output')
    .option('-n, --lines <number>', 'number of lines to show', '50')
    .option('--level <level>', 'minimum log level (debug|info|warn|error)', 'info')
    .option('--component <name>', 'filter by component')
    .option('--since <time>', 'show logs since time (e.g., "1h", "30m", "2024-01-01")')
    .action(async (options: Record<string, unknown>) => {
      const { apiClient, formatter } = getComponents();

      try {
        const params: Record<string, string> = {
          lines: String(options.lines || '50'),
          level: String(options.level || 'info'),
        };

        if (options.component) params.component = String(options.component);
        if (options.since) params.since = String(options.since);

        if (options.follow) {
          // Stream logs in real-time
          formatter.info('Following logs... (Press Ctrl+C to stop)');

          const streamLogs = async (): Promise<void> => {
            try {
              const logs = await apiClient.request('GET', '/api/logs/stream', undefined, params);

              if (Array.isArray(logs) && logs.length > 0) {
                logs.forEach(
                  (log: {
                    timestamp: string;
                    level: string;
                    message: string;
                    [key: string]: unknown;
                  }) => {
                    const timestamp = new Date(log.timestamp).toLocaleTimeString();
                    const level = log.level.toUpperCase().padEnd(5);
                    const component = log.component ? `[${String(log.component)}]` : '';
                    logger.info(
                      `${String(timestamp)} ${String(level)} ${String(component)} ${String(log.message)}`
                    );
                  }
                );
              }
            } catch (error) {
              // Ignore errors in streaming mode, will retry
            }
          };

          // Poll for new logs every second
          const interval = setInterval(() => {
            streamLogs().catch(error => logger.error('Failed to stream logs:', error));
          }, 1000);

          // Handle graceful shutdown
          process.on('SIGINT', () => {
            clearInterval(interval);
            formatter.info('\nStopped following logs');
            process.exit(0);
          });

          // Initial load
          await streamLogs();
        } else {
          // One-time log fetch
          const logs = await apiClient.request('GET', '/api/logs', undefined, params);

          if (!Array.isArray(logs) || logs.length === 0) {
            formatter.info('No logs found');
            return;
          }

          formatter.output(logs, {
            fields: ['timestamp', 'level', 'component', 'message'],
            headers: ['Timestamp', 'Level', 'Component', 'Message'],
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get logs: ${String(error instanceof Error ? error.message : 'Unknown error')}`
        );
        process.exit(1);
      }
    });
}
