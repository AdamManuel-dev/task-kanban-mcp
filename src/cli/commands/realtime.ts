import type { Command } from 'commander';
import * as WebSocket from 'ws';
import type { ConfigManager } from '../config';
import type { ApiClient } from '../client';
import type { OutputFormatter } from '../formatter';

export function registerRealtimeCommands(program: Command): void {
  // Get global components
  const getComponents = () =>
    (global as any).cliComponents as {
      config: ConfigManager;
      apiClient: ApiClient;
      formatter: OutputFormatter;
    };

  program
    .command('watch')
    .alias('w')
    .description('Watch for real-time updates')
    .option('-b, --board <id>', 'watch specific board')
    .option('-t, --task <id>', 'watch specific task')
    .option('--events <types>', 'event types to watch (comma-separated)')
    .option('--format <format>', 'output format (json|table|compact)', 'compact')
    .action(async options => {
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
        const wsEndpoint = `${wsUrl}/ws?apiKey=${apiKey}`;

        formatter.info('Connecting to real-time updates...');

        const ws = new (WebSocket as any)(wsEndpoint);

        ws.on('open', () => {
          formatter.success('Connected to real-time updates');

          // Subscribe to events based on options
          const subscriptions: any = {};

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
            const message = JSON.parse(data.toString());

            if (message.type === 'event') {
              const event = message.data;
              const timestamp = new Date().toLocaleTimeString();

              if (options.format === 'json') {
                console.log(JSON.stringify({ timestamp, ...event }, null, 2));
              } else if (options.format === 'table') {
                formatter.output([{ timestamp, ...event }]);
              } else {
                // Compact format
                const icon = getEventIcon(event.type);
                const color = getEventColor(event.type);
                console.log(
                  `${timestamp} ${icon} ${color(event.type)}: ${event.message || formatEventMessage(event)}`
                );
              }
            } else if (message.type === 'error') {
              formatter.error(`WebSocket error: ${message.data.message}`);
            }
          } catch (error) {
            formatter.warn(`Failed to parse message: ${data}`);
          }
        });

        ws.on('error', (error: any) => {
          formatter.error(`WebSocket error: ${error.message}`);
          process.exit(1);
        });

        ws.on('close', (code: any, reason: any) => {
          if (code === 1000) {
            formatter.info('Connection closed normally');
          } else {
            formatter.error(`Connection closed: ${code} ${reason}`);
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
          `Failed to start watching: ${error instanceof Error ? error.message : 'Unknown error'}`
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
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        const params: Record<string, string> = {
          lines: options.lines,
          level: options.level,
        };

        if (options.component) params['component'] = options.component;
        if (options.since) params['since'] = options.since;

        if (options.follow) {
          // Stream logs in real-time
          formatter.info('Following logs... (Press Ctrl+C to stop)');

          const streamLogs = async () => {
            try {
              const logs = await apiClient.request('/api/logs/stream', { params }) as any;

              if (logs && logs.length > 0) {
                logs.forEach((log: any) => {
                  const timestamp = new Date(log.timestamp).toLocaleTimeString();
                  const level = log.level.toUpperCase().padEnd(5);
                  const component = log.component ? `[${log.component}]` : '';
                  console.log(`${timestamp} ${level} ${component} ${log.message}`);
                });
              }
            } catch (error) {
              // Ignore errors in streaming mode, will retry
            }
          };

          // Poll for new logs every second
          const interval = setInterval(streamLogs, 1000);

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
          const logs = await apiClient.request('/api/logs', { params }) as any;

          if (!logs || logs.length === 0) {
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
          `Failed to get logs: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  // Utility functions for event formatting
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
    return icons[eventType] || icons['default'] || '📋';
  }

  function getEventColor(_eventType: string): (text: string) => string {
    // This would typically use chalk, but keeping it simple for now
    return (text: string) => text; // In real implementation, apply colors based on event type
  }

  function formatEventMessage(event: any): string {
    switch (event.type) {
      case 'task:created':
        return `Task "${event.data.title}" created`;
      case 'task:updated':
        return `Task "${event.data.title}" updated`;
      case 'task:moved':
        return `Task "${event.data.title}" moved to ${event.data.columnName}`;
      case 'task:deleted':
        return `Task "${event.data.title}" deleted`;
      case 'task:completed':
        return `Task "${event.data.title}" completed`;
      case 'note:added':
        return `Note "${event.data.title}" added to task ${event.data.taskId}`;
      case 'note:updated':
        return `Note "${event.data.title}" updated`;
      case 'priority:changed':
        return `Task "${event.data.title}" priority changed to ${event.data.newPriority}`;
      case 'dependency:blocked':
        return `Task "${event.data.title}" blocked by dependency`;
      case 'subtask:completed':
        return `Subtask "${event.data.title}" completed`;
      default:
        return event.data ? JSON.stringify(event.data) : 'Unknown event';
    }
  }
}
